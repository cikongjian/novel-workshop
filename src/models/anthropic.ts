import * as AnthropicModule from '@anthropic-ai/sdk';
import { recordAiUsage } from '../ai/usage-recorder.js';
import type {
  ChatMessage,
  ModelCallOptions,
  ModelClient,
  ModelResponse,
  StreamCallback,
} from './types.js';

const CHUNK_TIMEOUT = 60_000;

type AnthropicConstructor = typeof import('@anthropic-ai/sdk').default;
type AnthropicClientInstance = InstanceType<AnthropicConstructor>;

const AnthropicCtor: AnthropicConstructor =
  (AnthropicModule as unknown as { default: AnthropicConstructor }).default;

function getPromptChars(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

export class AnthropicClient implements ModelClient {
  readonly provider = 'anthropic' as const;
  readonly model: string;
  private readonly client: AnthropicClientInstance;
  private readonly defaultModel: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.model = model;
    this.client = new AnthropicCtor({
      apiKey,
      timeout: 5 * 60_000,
    });
    this.defaultModel = model;
  }

  async chat(messages: ChatMessage[], options?: ModelCallOptions): Promise<ModelResponse> {
    const { systemPrompt, userMessages } = this.splitMessages(messages);
    const model = options?.model ?? this.defaultModel;
    const requestOptions = options?.signal ? { signal: options.signal } : undefined;
    const promptChars = getPromptChars(messages);

    const response = await this.client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: userMessages.map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
    }, requestOptions);

    const textBlock = response.content.find((block) => block.type === 'text');
    const content = textBlock && 'text' in textBlock ? textBlock.text : '';
    await recordAiUsage({
      usageKind: 'chat',
      provider: this.provider,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      requestCount: 1,
      promptChars,
      outputChars: content.length,
    });

    return {
      content,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async chatStream(
    messages: ChatMessage[],
    options?: ModelCallOptions,
    onChunk?: StreamCallback,
  ): Promise<ModelResponse> {
    const { systemPrompt, userMessages } = this.splitMessages(messages);
    const model = options?.model ?? this.defaultModel;
    const promptChars = getPromptChars(messages);

    const stream = this.client.messages.stream({
      model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: userMessages.map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      })),
    });

    const abortSignal = options?.signal;
    if (abortSignal) {
      const onAbort = () => stream.abort();
      if (abortSignal.aborted) {
        stream.abort();
      } else {
        abortSignal.addEventListener('abort', onAbort, { once: true });
        stream.on('end', () => abortSignal.removeEventListener('abort', onAbort));
      }
    }

    let fullText = '';
    let chunkCount = 0;
    let chunkTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const resetChunkTimeout = () => {
      if (chunkTimeoutId) clearTimeout(chunkTimeoutId);
      chunkTimeoutId = setTimeout(() => {
        stream.abort();
      }, CHUNK_TIMEOUT);
    };

    resetChunkTimeout();
    stream.on('text', (text: string) => {
      resetChunkTimeout();
      fullText += text;
      chunkCount += 1;
      onChunk?.(text);
    });

    try {
      const finalMessage = await stream.finalMessage();
      if (chunkTimeoutId) clearTimeout(chunkTimeoutId);

      await recordAiUsage({
        usageKind: 'chat-stream',
        provider: this.provider,
        model: finalMessage.model,
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
        requestCount: 1,
        promptChars,
        outputChars: fullText.length,
        metadata: {
          chunkCount,
        },
      });

      return {
        content: fullText,
        model: finalMessage.model,
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        },
      };
    } catch (error) {
      if (chunkTimeoutId) clearTimeout(chunkTimeoutId);
      throw error;
    }
  }

  private splitMessages(messages: ChatMessage[]): {
    systemPrompt: string | undefined;
    userMessages: ChatMessage[];
  } {
    const systemMessages = messages.filter((message) => message.role === 'system');
    const userMessages = messages.filter((message) => message.role !== 'system');
    const systemPrompt = systemMessages.length > 0
      ? systemMessages.map((message) => message.content).join('\n\n')
      : undefined;
    return { systemPrompt, userMessages };
  }
}
