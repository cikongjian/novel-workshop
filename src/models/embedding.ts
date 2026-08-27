import * as OpenAIModule from 'openai';
import type { EmbeddingClient } from './types.js';
import { recordAiUsage } from '../ai/usage-recorder.js';

type OpenAIConstructor = typeof import('openai').default;
type OpenAIClientInstance = InstanceType<OpenAIConstructor>;

const OpenAIClientCtor: OpenAIConstructor =
  (OpenAIModule as unknown as { default: OpenAIConstructor }).default;

const EMBEDDING_TIMEOUT_MS = 2 * 60_000;
const SINGLE_CALL_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Embedding call timed out after ${timeoutMs}ms (${label})`)),
      timeoutMs,
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export class OpenAICompatibleEmbeddingClient implements EmbeddingClient {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  private client: OpenAIClientInstance;

  constructor(apiKey: string, model: string = 'text-embedding-3-small', baseURL?: string, providerHint?: string) {
    this.client = new OpenAIClientCtor({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      timeout: EMBEDDING_TIMEOUT_MS,
    });
    this.model = model;
    this.provider = providerHint?.trim() || (baseURL ? 'custom' : 'openai');
    const modelName = model.toLowerCase();

    if (modelName === 'text-embedding-3-large') {
      this.dimensions = 3072;
    } else if (modelName.includes('nomic-embed-text')) {
      // Ollama 常用本地向量模型，维度固定为 768
      this.dimensions = 768;
    } else if (modelName.includes('bge-large') || modelName.includes('bge-m3')) {
      this.dimensions = 1024;
    } else if (modelName.includes('embedding-3') && !modelName.includes('text-embedding-3')) {
      this.dimensions = 2048;
    } else if (modelName.includes('text-embedding-v')) {
      this.dimensions = 1536;
    } else {
      this.dimensions = 1536;
    }
  }

  async embedQuery(text: string): Promise<number[]> {
    const response = await withTimeout(
      this.client.embeddings.create({ model: this.model, input: text }),
      SINGLE_CALL_TIMEOUT_MS,
      'embedQuery',
    );
    await recordAiUsage({
      usageKind: 'embedding-query',
      provider: this.provider,
      model: this.model,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: 0,
      requestCount: 1,
      promptChars: text.length,
      outputChars: 0,
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const batchSize = 512;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await withTimeout(
        this.client.embeddings.create({ model: this.model, input: batch }),
        SINGLE_CALL_TIMEOUT_MS,
        `embedBatch[${i}..${i + batch.length}]`,
      );
      await recordAiUsage({
        usageKind: 'embedding-batch',
        provider: this.provider,
        model: this.model,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: 0,
        requestCount: batch.length,
        promptChars: batch.reduce((sum, item) => sum + item.length, 0),
        outputChars: 0,
        metadata: {
          batchSize: batch.length,
        },
      });
      for (const item of response.data) {
        results.push(item.embedding);
      }
    }

    return results;
  }
}
