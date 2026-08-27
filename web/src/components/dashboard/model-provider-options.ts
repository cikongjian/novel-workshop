/** 模型供应商及其预设模型列表 */
export const MODEL_PROVIDER_OPTIONS = [
  { value: 'deepseek', label: 'DeepSeek', models: [
    { value: 'deepseek-v4-pro', label: 'DeepSeek-V4-Pro（最新旗舰）' },
    { value: 'deepseek-v4-flash', label: 'DeepSeek-V4-Flash（快速）' },
    { value: 'deepseek-chat', label: 'DeepSeek-V3.2 / V4-Flash（兼容）' },
    { value: 'deepseek-reasoner', label: 'DeepSeek-R1 推理（兼容）' },
  ]},
  { value: 'qwen', label: '通义千问', models: [
    { value: 'qwen-max', label: 'Qwen-Max' },
    { value: 'qwen-plus', label: 'Qwen-Plus' },
    { value: 'qwen-turbo', label: 'Qwen-Turbo' },
    { value: 'qwen-long', label: 'Qwen-Long（长文本）' },
  ]},
  { value: 'zhipu', label: '智谱 GLM', models: [
    { value: 'glm-5-turbo', label: 'GLM-5-Turbo' },
    { value: 'glm-4.7-flash', label: 'GLM-4.7-Flash（最新免费）' },
    { value: 'glm-4-plus', label: 'GLM-4-Plus' },
    { value: 'glm-4', label: 'GLM-4' },
    { value: 'glm-4-long', label: 'GLM-4-Long（长文本）' },
    { value: 'glm-4-flash', label: 'GLM-4-Flash（快速）' },
  ]},
  { value: 'moonshot', label: 'Moonshot', models: [
    { value: 'moonshot-v1-128k', label: 'Moonshot-v1-128K' },
    { value: 'moonshot-v1-32k', label: 'Moonshot-v1-32K' },
    { value: 'moonshot-v1-8k', label: 'Moonshot-v1-8K' },
  ]},
  { value: 'doubao', label: '豆包（火山引擎）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: [
    { value: 'Doubao-Seed-1.6-lite', label: 'Doubao-Seed-1.6-lite' },
    { value: 'doubao-1.5-pro-32k', label: '豆包 1.5 Pro 32K' },
    { value: 'doubao-1.5-pro-256k', label: '豆包 1.5 Pro 256K' },
    { value: 'doubao-1.5-lite-32k', label: '豆包 1.5 Lite 32K' },
  ]},
  { value: 'baichuan', label: '百川', models: [
    { value: 'Baichuan4', label: 'Baichuan4' },
    { value: 'Baichuan3-Turbo', label: 'Baichuan3-Turbo' },
    { value: 'Baichuan3-Turbo-128k', label: 'Baichuan3-Turbo-128K' },
  ]},
  { value: 'stepfun', label: '阶跃星辰', models: [
    { value: 'step-2-16k', label: 'Step-2-16K' },
    { value: 'step-1-128k', label: 'Step-1-128K' },
    { value: 'step-1-256k', label: 'Step-1-256K' },
  ]},
  { value: 'minimax', label: 'MiniMax', models: [
    { value: 'MiniMax-M2.5', label: 'MiniMax-M2.5（最新）' },
    { value: 'MiniMax-M2.5-Preview', label: 'MiniMax-M2.5-Preview' },
    { value: 'MiniMax-M2', label: 'MiniMax-M2' },
    { value: 'MiniMax-M2-Pro', label: 'MiniMax-M2-Pro' },
    { value: 'MiniMax-Text-01', label: 'MiniMax-Text-01' },
  ]},
  { value: 'siliconflow', label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', models: [
    { value: 'Qwen/Qwen3-8B', label: 'Qwen3-8B（免费，小说优先）' },
    { value: 'THUDM/glm-4-9b-chat', label: 'GLM-4-9B-Chat（免费）' },
    { value: 'THUDM/GLM-4-9B-0414', label: 'GLM-4-9B-0414（免费）' },
    { value: 'internlm/internlm2_5-7b-chat', label: 'InternLM2.5-7B-Chat（免费）' },
    { value: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B-Instruct（免费）' },
    { value: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B', label: 'DeepSeek-R1-0528-Qwen3-8B（免费）' },
  ]},
  { value: 'custom-openai', label: '自定义 OpenAI', baseUrl: '', models: [
    { value: 'gpt-4o', label: 'gpt-4o（示例，请填写实际模型名）' },
  ]},
  { value: 'openai', label: 'OpenAI', models: [
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
  ]},
  { value: 'anthropic', label: 'Anthropic', models: [
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ]},
  { value: 'ollama', label: 'Ollama (本地)', models: [
    { value: 'qwen2.5:7b', label: 'qwen2.5:7b' },
    { value: 'llama3.1:8b', label: 'llama3.1:8b' },
    { value: 'deepseek-r1:7b', label: 'deepseek-r1:7b' },
  ]},
] as const;

/** 向量模型（Embedding）供应商及其预设模型列表 */
export const EMBEDDING_PROVIDER_OPTIONS = [
  { value: 'siliconflow', label: '硅基流动（推荐，有免费模型）', baseUrl: 'https://api.siliconflow.cn/v1', models: [
    { value: 'BAAI/bge-m3', label: 'BGE-M3（免费，1024维）' },
    { value: 'BAAI/bge-large-zh-v1.5', label: 'BGE-Large-ZH（免费，1024维）' },
  ]},
  { value: 'openai', label: 'OpenAI', baseUrl: '', models: [
    { value: 'text-embedding-3-small', label: 'text-embedding-3-small（1536维）' },
    { value: 'text-embedding-3-large', label: 'text-embedding-3-large（3072维）' },
  ]},
  { value: 'qwen', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: [
    { value: 'text-embedding-v3', label: 'text-embedding-v3' },
    { value: 'text-embedding-v2', label: 'text-embedding-v2' },
  ]},
  { value: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: [
    { value: 'embedding-3', label: 'Embedding-3' },
    { value: 'embedding-2', label: 'Embedding-2' },
  ]},
  { value: 'ollama', label: 'Ollama (本地)', baseUrl: 'http://127.0.0.1:11434/v1', models: [
    { value: 'nomic-embed-text', label: 'nomic-embed-text（768维）' },
    { value: 'bge-m3', label: 'bge-m3（1024维）' },
  ]},
] as const;
