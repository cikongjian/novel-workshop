import type { AppConfig } from '../config/index.js';
import type { ModelClient, EmbeddingClient, ModelProvider, ImageGenerationClient, ChatMessage, ModelCallOptions, ModelResponse, StreamCallback } from './types.js';
import { getProviderPreset } from './types.js';
import { AnthropicClient } from './anthropic.js';
import { OpenAICompatibleClient } from './openai.js';
import { OpenAICompatibleEmbeddingClient } from './embedding.js';
import { OpenAICompatibleImageClient } from './image-client.js';
import { executeWithKeyRotation } from './api-key-rotation.js';
import { normalizeProviderBaseUrl } from './provider-url.js';

function isLocalOllamaBaseUrl(baseUrl?: string): boolean {
  if (!baseUrl) return false;
  const normalized = baseUrl.trim().toLowerCase();
  return normalized.includes('127.0.0.1:11434') || normalized.includes('localhost:11434');
}

function resolveCompatibleApiKey(params: {
  apiKey: string;
  provider?: string;
  baseUrl?: string;
}): string {
  if (params.apiKey?.trim()) return params.apiKey.trim();
  if (params.provider === 'ollama' || isLocalOllamaBaseUrl(params.baseUrl)) {
    return 'ollama';
  }
  return '';
}

export function createModelClient(config: AppConfig): ModelClient {
  const { provider, apiKey, apiKeys, model, baseUrl } = config.model;

  // 多 Key 轮换：apiKeys 数量 > 1 时启用
  const effectiveKeys = apiKeys.length > 1
    ? apiKeys
    : [resolveCompatibleApiKey({ apiKey, provider, baseUrl })].filter(Boolean);

  if (effectiveKeys.length === 0) {
    throw new Error(`${provider} 的 API Key 未配置`);
  }

  // 单 Key 走直连，多 Key 走轮换包装
  if (effectiveKeys.length === 1) {
    return createSingleKeyModelClient(provider, effectiveKeys[0], model, baseUrl);
  }

  return new KeyRotatingModelClient(provider, effectiveKeys, model, baseUrl);
}

function createSingleKeyModelClient(
  provider: ModelProvider,
  apiKey: string,
  model: string,
  baseUrl: string,
): ModelClient {
  if (provider === 'anthropic') {
    return new AnthropicClient(apiKey, model);
  }
  const preset = getProviderPreset(provider);
  const resolvedBaseUrl = normalizeProviderBaseUrl(provider, baseUrl || preset?.baseUrl);
  return new OpenAICompatibleClient(provider, apiKey, model, resolvedBaseUrl);
}

export function createEmbeddingClient(config: AppConfig): EmbeddingClient {
  const { apiKey, apiKeys, provider, model, baseUrl } = config.embedding;
  const normalizedBaseUrl = normalizeProviderBaseUrl(provider || 'openai', baseUrl);

  const effectiveKeys = apiKeys.length > 1
    ? apiKeys
    : [resolveCompatibleApiKey({ apiKey, provider, baseUrl: normalizedBaseUrl })].filter(Boolean);

  if (effectiveKeys.length === 0) {
    throw new Error('Embedding API Key 未配置');
  }

  const providerHint = provider || (normalizedBaseUrl ? 'custom' : 'openai');
  if (effectiveKeys.length === 1) {
    return new OpenAICompatibleEmbeddingClient(effectiveKeys[0], model, normalizedBaseUrl || undefined, providerHint);
  }

  return new KeyRotatingEmbeddingClient(effectiveKeys, model, normalizedBaseUrl || undefined, providerHint);
}

/** 小说级模型配置 */
export type NovelModelConfig = {
  provider: ModelProvider;
  apiKey?: string;
  apiKeys?: string[];
  model: string;
  baseUrl: string;
};

/**
 * 从小说级 modelConfig 创建独立的模型客户端。
 * 若配置不完整（缺少 apiKey 或 model），返回 null，调用方应回退到全局 modelClient。
 */
export function createNovelModelClient(cfg: NovelModelConfig): ModelClient | null {
  if (!cfg.model) return null;

  const resolvedApiKeys = Array.isArray(cfg.apiKeys)
    ? cfg.apiKeys.map((item) => item.trim()).filter(Boolean)
    : [];
  const fallbackApiKey = resolveCompatibleApiKey({
    apiKey: cfg.apiKey ?? '',
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
  });
  const effectiveKeys = resolvedApiKeys.length > 0
    ? resolvedApiKeys
    : [fallbackApiKey].filter(Boolean);
  if (effectiveKeys.length === 0) return null;

  if (effectiveKeys.length > 1) {
    return new KeyRotatingModelClient(cfg.provider, effectiveKeys, cfg.model, cfg.baseUrl);
  }

  if (cfg.provider === 'anthropic') {
    return new AnthropicClient(effectiveKeys[0], cfg.model);
  }

  const preset = getProviderPreset(cfg.provider);
  const resolvedBaseUrl = normalizeProviderBaseUrl(cfg.provider, cfg.baseUrl || preset?.baseUrl);
  return new OpenAICompatibleClient(cfg.provider, effectiveKeys[0], cfg.model, resolvedBaseUrl);
}

/** 小说级 Embedding 配置 */
export type NovelEmbeddingConfig = {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
};

/**
 * 从小说级 embeddingConfig 创建独立的 Embedding 客户端。
 * 若配置不完整（缺少 model），返回 null，调用方应回退到全局 embeddingClient。
 */
export function createNovelEmbeddingClient(cfg: NovelEmbeddingConfig): EmbeddingClient | null {
  if (!cfg.model) return null;

  const resolvedApiKey = resolveCompatibleApiKey({
    apiKey: cfg.apiKey,
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
  });
  if (!resolvedApiKey) return null;

  const preset = getProviderPreset(cfg.provider as ModelProvider);
  const resolvedBaseUrl = normalizeProviderBaseUrl(
    cfg.provider,
    cfg.baseUrl || preset?.embeddingBaseUrl || preset?.baseUrl,
  );
  return new OpenAICompatibleEmbeddingClient(resolvedApiKey, cfg.model, resolvedBaseUrl || undefined, cfg.provider);
}

/**
 * 多 Key 轮换模型客户端包装器。
 * 预建所有 Key 的客户端实例，避免每次调用都重新初始化 SDK。
 */
class KeyRotatingModelClient implements ModelClient {
  readonly provider: ModelProvider;
  readonly model: string;
  private readonly apiKeys: string[];
  private readonly clientPool: Map<string, ModelClient>;

  constructor(provider: ModelProvider, apiKeys: string[], model: string, baseUrl: string) {
    this.provider = provider;
    this.model = model;
    this.apiKeys = apiKeys;
    this.clientPool = new Map();
    for (const key of apiKeys) {
      this.clientPool.set(key, createSingleKeyModelClient(provider, key, model, baseUrl));
    }
  }

  async chat(messages: ChatMessage[], options?: ModelCallOptions): Promise<ModelResponse> {
    return executeWithKeyRotation({
      provider: this.provider,
      apiKeys: this.apiKeys,
      execute: (key) => this.clientPool.get(key)!.chat(messages, options),
    });
  }

  async chatStream(
    messages: ChatMessage[],
    options?: ModelCallOptions,
    onChunk?: StreamCallback,
  ): Promise<ModelResponse> {
    return executeWithKeyRotation({
      provider: this.provider,
      apiKeys: this.apiKeys,
      execute: (key) => this.clientPool.get(key)!.chatStream(messages, options, onChunk),
    });
  }
}

/**
 * 多 Key 轮换 Embedding 客户端包装器。
 * 预建所有 Key 的客户端实例，避免重复初始化。
 */
class KeyRotatingEmbeddingClient implements EmbeddingClient {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKeys: string[];
  private readonly clientPool: Map<string, OpenAICompatibleEmbeddingClient>;

  constructor(apiKeys: string[], model: string, baseUrl?: string, providerHint?: string) {
    this.apiKeys = apiKeys;
    this.model = model;
    this.clientPool = new Map();
    for (const key of apiKeys) {
      this.clientPool.set(key, new OpenAICompatibleEmbeddingClient(key, model, baseUrl, providerHint));
    }
    const first = this.clientPool.get(apiKeys[0])!;
    this.provider = first.provider;
    this.dimensions = first.dimensions;
  }

  async embedQuery(text: string): Promise<number[]> {
    return executeWithKeyRotation({
      provider: `embedding:${this.provider}`,
      apiKeys: this.apiKeys,
      execute: (key) => this.clientPool.get(key)!.embedQuery(text),
    });
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return executeWithKeyRotation({
      provider: `embedding:${this.provider}`,
      apiKeys: this.apiKeys,
      execute: (key) => this.clientPool.get(key)!.embedBatch(texts),
    });
  }
}

export function createImageClient(config: AppConfig): ImageGenerationClient {
  const { apiKey, model, baseUrl } = config.image;
  const resolvedModel = model.trim() || 'gpt-image-2';
  const resolvedBaseUrl = baseUrl.trim();

  const resolvedApiKey = resolveCompatibleApiKey({ apiKey, baseUrl: resolvedBaseUrl });
  if (!resolvedApiKey) {
    throw new Error('图像生成 API Key 未配置');
  }

  return new OpenAICompatibleImageClient(resolvedApiKey, resolvedModel, resolvedBaseUrl || undefined);
}
