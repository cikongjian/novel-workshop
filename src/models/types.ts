/** 所有支持的模型供应商 */
export type ModelProvider =
  | 'anthropic'
  | 'openai'
  | 'custom-openai'
  | 'ollama'
  | 'deepseek'
  | 'qwen'
  | 'zhipu'
  | 'moonshot'
  | 'doubao'
  | 'baichuan'
  | 'stepfun'
  | 'minimax'
  | 'siliconflow';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ModelCallOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  signal?: AbortSignal;
  /** 强制模型输出合法 JSON（OpenAI 兼容 API 的 response_format） */
  jsonMode?: boolean;
};

export type StreamCallback = (chunk: string) => void;

export type ModelResponse = {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
};

export interface ModelClient {
  readonly provider: ModelProvider;
  readonly model: string;
  chat(messages: ChatMessage[], options?: ModelCallOptions): Promise<ModelResponse>;
  chatStream(messages: ChatMessage[], options?: ModelCallOptions, onChunk?: StreamCallback): Promise<ModelResponse>;
}

export interface EmbeddingClient {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  embedQuery(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export type { ImageGenerationClient } from './image-client.js';

/** 供应商预设信息 */
export type ProviderPreset = {
  id: ModelProvider;
  name: string;
  description: string;
  baseUrl: string;
  defaultModel: string;
  models: { value: string; label: string }[];
  embeddingBaseUrl?: string;
  embeddingModels?: { value: string; label: string }[];
};

/** 所有供应商预设 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude 系列，擅长中文创作和长文生成',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
      { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT 系列，全能型 AI 助手',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: [
      { value: 'gpt-5.3-codex', label: 'GPT-5.3-Codex（最新）' },
      { value: 'gpt-5.2', label: 'GPT-5.2' },
      { value: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
      { value: 'gpt-5.2-codex', label: 'GPT-5.2-Codex' },
      { value: 'gpt-5.2-chat-latest', label: 'GPT-5.2 Chat Latest' },
      { value: 'gpt-5.1', label: 'GPT-5.1' },
      { value: 'gpt-5.1-codex', label: 'GPT-5.1-Codex' },
      { value: 'gpt-5.1-codex-max', label: 'GPT-5.1-Codex-Max' },
      { value: 'gpt-5.1-codex-mini', label: 'GPT-5.1-Codex-Mini' },
      { value: 'gpt-5.1-chat-latest', label: 'GPT-5.1 Chat Latest' },
      { value: 'gpt-5', label: 'GPT-5' },
      { value: 'gpt-5-pro', label: 'GPT-5 Pro' },
      { value: 'gpt-5-codex', label: 'GPT-5-Codex' },
      { value: 'gpt-5-chat-latest', label: 'GPT-5 Chat Latest' },
      { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
      { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
      { value: 'gpt-4.1', label: 'GPT-4.1' },
      { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4.5-preview', label: 'GPT-4.5 Preview' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-4', label: 'GPT-4' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    ],
    embeddingModels: [
      { value: 'text-embedding-3-small', label: 'text-embedding-3-small' },
      { value: 'text-embedding-3-large', label: 'text-embedding-3-large' },
    ],
  },
  {
    id: 'custom-openai',
    name: '自定义 OpenAI',
    description: '兼容 OpenAI 接口格式的第三方平台，需填写自定义 API 地址',
    baseUrl: '',
    defaultModel: 'gpt-4o',
    models: [
      { value: 'gpt-4o', label: 'gpt-4o（示例，请填写实际模型名）' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    description: 'Run local models on your machine through Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:7b',
    models: [
      { value: 'qwen2.5:7b', label: 'qwen2.5:7b' },
      { value: 'llama3.1:8b', label: 'llama3.1:8b' },
      { value: 'deepseek-r1:7b', label: 'deepseek-r1:7b' },
    ],
    embeddingBaseUrl: 'http://127.0.0.1:11434/v1',
    embeddingModels: [
      { value: 'nomic-embed-text', label: 'nomic-embed-text (768)' },
      { value: 'bge-m3', label: 'bge-m3 (1024)' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: '深度求索，高性价比推理和创作模型',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek-V3' },
      { value: 'deepseek-reasoner', label: 'DeepSeek-R1（推理）' },
    ],
  },
  {
    id: 'qwen',
    name: '通义千问',
    description: '阿里云，中文理解能力出色',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: [
      { value: 'qwen-max', label: 'Qwen-Max' },
      { value: 'qwen-plus', label: 'Qwen-Plus' },
      { value: 'qwen-turbo', label: 'Qwen-Turbo' },
      { value: 'qwen-long', label: 'Qwen-Long（长文本）' },
    ],
    embeddingBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    embeddingModels: [
      { value: 'text-embedding-v3', label: 'text-embedding-v3' },
      { value: 'text-embedding-v2', label: 'text-embedding-v2' },
    ],
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    description: '清华系，GLM 系列中文大模型',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5-turbo',
    models: [
      { value: 'glm-5-turbo', label: 'GLM-5-Turbo' },
      { value: 'glm-4.7-flash', label: 'GLM-4.7-Flash（最新免费）' },
      { value: 'glm-4-plus', label: 'GLM-4-Plus' },
      { value: 'glm-4', label: 'GLM-4' },
      { value: 'glm-4-long', label: 'GLM-4-Long（长文本）' },
      { value: 'glm-4-flash', label: 'GLM-4-Flash（快速）' },
    ],
    embeddingBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    embeddingModels: [
      { value: 'embedding-3', label: 'Embedding-3' },
      { value: 'embedding-2', label: 'Embedding-2' },
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot / Kimi',
    description: '月之暗面，超长上下文窗口',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: [
      { value: 'moonshot-v1-128k', label: 'Moonshot-v1-128K' },
      { value: 'moonshot-v1-32k', label: 'Moonshot-v1-32K' },
      { value: 'moonshot-v1-8k', label: 'Moonshot-v1-8K' },
    ],
  },
  {
    id: 'doubao',
    name: '豆包',
    description: '字节跳动，多模态能力强',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-1.5-pro-32k',
    models: [
      { value: 'doubao-1.5-pro-32k', label: '豆包 1.5 Pro 32K' },
      { value: 'doubao-1.5-pro-256k', label: '豆包 1.5 Pro 256K' },
      { value: 'doubao-1.5-lite-32k', label: '豆包 1.5 Lite 32K' },
    ],
  },
  {
    id: 'baichuan',
    name: '百川智能',
    description: '中文内容创作能力突出',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    defaultModel: 'Baichuan4',
    models: [
      { value: 'Baichuan4', label: 'Baichuan4' },
      { value: 'Baichuan3-Turbo', label: 'Baichuan3-Turbo' },
      { value: 'Baichuan3-Turbo-128k', label: 'Baichuan3-Turbo-128K' },
    ],
  },
  {
    id: 'stepfun',
    name: '阶跃星辰',
    description: '长文本处理能力领先',
    baseUrl: 'https://api.stepfun.com/v1',
    defaultModel: 'step-2-16k',
    models: [
      { value: 'step-2-16k', label: 'Step-2-16K' },
      { value: 'step-1-128k', label: 'Step-1-128K' },
      { value: 'step-1-256k', label: 'Step-1-256K' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    description: '语音和文本双模态，创作自然流畅',
    baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'MiniMax-M2.5',
    models: [
      { value: 'MiniMax-M2.5', label: 'MiniMax-M2.5（最新）' },
      { value: 'MiniMax-M2.5-Preview', label: 'MiniMax-M2.5-Preview' },
      { value: 'MiniMax-M2', label: 'MiniMax-M2' },
      { value: 'MiniMax-M2-Pro', label: 'MiniMax-M2-Pro' },
      { value: 'MiniMax-Text-01', label: 'MiniMax-Text-01' },
    ],
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    description: '模型聚合平台，一个 Key 调用多种模型',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen3-8B',
    models: [
      { value: 'Qwen/Qwen3-8B', label: 'Qwen3-8B（免费，小说优先）' },
      { value: 'THUDM/glm-4-9b-chat', label: 'GLM-4-9B-Chat（免费）' },
      { value: 'THUDM/GLM-4-9B-0414', label: 'GLM-4-9B-0414（免费）' },
      { value: 'internlm/internlm2_5-7b-chat', label: 'InternLM2.5-7B-Chat（免费）' },
      { value: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B-Instruct（免费）' },
      { value: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B', label: 'DeepSeek-R1-0528-Qwen3-8B（免费）' },
    ],
    embeddingBaseUrl: 'https://api.siliconflow.cn/v1',
    embeddingModels: [
      { value: 'BAAI/bge-large-zh-v1.5', label: 'BGE-Large-ZH' },
      { value: 'BAAI/bge-m3', label: 'BGE-M3' },
    ],
  },
];

/** 根据 ID 查找预设 */
export function getProviderPreset(id: ModelProvider): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(p => p.id === id);
}
