import * as OpenAIModule from 'openai';
import { recordAiUsage } from '../ai/usage-recorder.js';
import { buildProviderChatCompletionRequestExtras } from './provider-request-options.js';
import type {
  ChatMessage,
  ModelCallOptions,
  ModelClient,
  ModelProvider,
  ModelResponse,
  StreamCallback,
} from './types.js';

const CHUNK_TIMEOUT = 60_000;

/**
 * AI API 限速错误。包含建议的重试等待时间，供上层重试逻辑使用。
 */
export class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * 检测 OpenAI SDK 抛出的错误是否为限速类错误（429 / rate_limit_exceeded）。
 * 返回 retryAfterMs（毫秒），非限速错误返回 null。
 */
function parseRateLimitFromError(err: unknown): number | null {
  // OpenAI SDK v4+ 的 APIError 有 status 字段
  const apiErr = err as { status?: number; headers?: Record<string, string>; code?: string } | undefined;
  if (!apiErr) return null;

  // HTTP 429 或错误码 rate_limit_exceeded
  if (apiErr.status === 429 || apiErr.code === 'rate_limit_exceeded' || apiErr.code === 'insufficient_quota') {
    // 优先取 Retry-After 头
    const retryAfterHeader = apiErr.headers?.['retry-after'] ?? apiErr.headers?.['Retry-After'];
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }
    // 默认 10 秒
    return 10_000;
  }

  // 检查错误消息中是否包含限速关键词（兜底检测）
  const msg = (err as { message?: string })?.message ?? '';
  if (/rate.?limit|too many requests|请求过于频繁|限速|quota exceeded/i.test(msg)) {
    // 尝试从消息中提取等待秒数
    const match = msg.match(/(\d+)\s*(秒|s|second)/i);
    if (match) {
      const seconds = parseInt(match[1], 10);
      if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
    }
    return 10_000;
  }

  return null;
}

type OpenAIConstructor = typeof import('openai').default;
type OpenAIClientInstance = InstanceType<OpenAIConstructor>;

type OpenAIStreamChunk = {
  choices: Array<{
    delta?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  };
};

type AbortableAsyncIterable<T> = AsyncIterable<T> & {
  controller?: AbortController;
};

const OpenAIClientCtor: OpenAIConstructor =
  (OpenAIModule as unknown as { default: OpenAIConstructor }).default;

function getPromptChars(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

export class OpenAICompatibleClient implements ModelClient {
  readonly provider: ModelProvider;
  readonly model: string;
  private readonly client: OpenAIClientInstance;
  private readonly defaultModel: string;

  constructor(provider: ModelProvider, apiKey: string, model: string, baseURL?: string) {
    this.provider = provider;
    this.model = model;
    this.client = new OpenAIClientCtor({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      timeout: 5 * 60_000,
    });
    this.defaultModel = model;
  }

  async chat(messages: ChatMessage[], options?: ModelCallOptions): Promise<ModelResponse> {
    const model = options?.model ?? this.defaultModel;
    const requestOptions = options?.signal ? { signal: options.signal } : undefined;
    const promptChars = getPromptChars(messages);
    const providerRequestExtras = buildProviderChatCompletionRequestExtras(this.provider, model);

    let response;
    try {
      response = await this.client.chat.completions.create(
        {
          model,
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.7,
          messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          ...providerRequestExtras,
        },
        requestOptions,
      );
    } catch (err) {
      const retryAfterMs = parseRateLimitFromError(err);
      if (retryAfterMs !== null) {
        throw new RateLimitError(
          `AI API 限速 (${this.provider}/${model})：${err instanceof Error ? err.message : String(err)}`,
          retryAfterMs,
        );
      }
      throw err;
    }

    const choice = response.choices[0];
    const content = choice?.message?.content ?? '';
    await recordAiUsage({
      usageKind: 'chat',
      provider: this.provider,
      model: response.model,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      requestCount: 1,
      promptChars,
      outputChars: content.length,
    });

    return {
      content,
      model: response.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async chatStream(
    messages: ChatMessage[],
    options?: ModelCallOptions,
    onChunk?: StreamCallback,
  ): Promise<ModelResponse> {
    const model = options?.model ?? this.defaultModel;
    const requestOptions = options?.signal ? { signal: options.signal } : undefined;
    const promptChars = getPromptChars(messages);
    const providerRequestExtras = buildProviderChatCompletionRequestExtras(this.provider, model);

    const supportsStreamOptions = ['openai', 'custom-openai', 'deepseek', 'siliconflow'].includes(this.provider);

    let stream;
    try {
      stream = await this.client.chat.completions.create(
        {
          model,
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.7,
          stream: true,
          ...(supportsStreamOptions ? { stream_options: { include_usage: true } } : {}),
          messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          ...providerRequestExtras,
        },
        requestOptions,
      );
    } catch (err) {
      const retryAfterMs = parseRateLimitFromError(err);
      if (retryAfterMs !== null) {
        throw new RateLimitError(
          `AI API 限速 (${this.provider}/${model})：${err instanceof Error ? err.message : String(err)}`,
          retryAfterMs,
        );
      }
      throw err;
    }

    let fullText = '';
    let usage = { inputTokens: 0, outputTokens: 0 };
    let chunkCount = 0;

    try {
    for await (const chunk of withChunkTimeout<OpenAIStreamChunk>(
      stream as AbortableAsyncIterable<OpenAIStreamChunk>,
      CHUNK_TIMEOUT,
    )) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        chunkCount += 1;
        onChunk?.(delta);
      }

      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }

    } catch (err) {
      const retryAfterMs = parseRateLimitFromError(err);
      if (retryAfterMs !== null) {
        throw new RateLimitError(
          `AI API 限速 (${this.provider}/${model})：${err instanceof Error ? err.message : String(err)}`,
          retryAfterMs,
        );
      }
      throw err;
    }

    await recordAiUsage({
      usageKind: 'chat-stream',
      provider: this.provider,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      requestCount: 1,
      promptChars,
      outputChars: fullText.length,
      metadata: {
        chunkCount,
      },
    });

    return { content: fullText, model, usage };
  }
}

async function* withChunkTimeout<T>(
  iterable: AbortableAsyncIterable<T>,
  timeoutMs: number,
): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]();
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          iterator.next(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              iterable.controller?.abort();
              reject(new Error(`Stream timed out after ${timeoutMs}ms without a new chunk`));
            }, timeoutMs);
          }),
        ]);

        if (result.done) break;
        yield result.value;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }
  } finally {
    if (typeof iterator.return === 'function') {
      try {
        await iterator.return();
      } catch {
        // Ignore cleanup failures.
      }
    }
  }
}
