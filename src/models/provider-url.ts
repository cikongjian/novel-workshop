import type { ModelProvider } from './types.js';
import { stripTrailingSlashes } from '../utils/text.js';

const ZHIPU_GENERAL_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const ZHIPU_CODING_BASE_URL_PATTERN = /^https:\/\/open\.bigmodel\.cn\/api\/coding\/paas\/v4\/?$/i;

/**
 * 规整供应商 base URL：去除尾部斜杠，并为 custom-openai 供应商补全缺失的 /v1 版本段。
 *
 * custom-openai 用户填写的地址形式不一（纯域名、带子路径、token 路径等），而 OpenAI 兼容
 * 协议要求 baseURL 以 /v1 结尾——SDK 会在此基础上拼接 /chat/completions。仅当 URL 不以
 * /v1 结尾时补全，使测试连接（chat）与拉取模型（models）命中同一个 /v1 前缀，避免
 * 「能拉到模型但测试连接报错」的路径分歧。
 */
export function normalizeProviderBaseUrl(provider: string | ModelProvider, baseUrl?: string): string {
  const trimmed = baseUrl?.trim() ?? '';
  if (!trimmed) return '';

  if (provider === 'zhipu' && ZHIPU_CODING_BASE_URL_PATTERN.test(trimmed)) {
    // Novel Workshop uses the general OpenAI-compatible endpoint. The coding-only
    // entrypoint is documented by Zhipu for coding scenarios and breaks generic prose flows.
    return ZHIPU_GENERAL_BASE_URL;
  }

  const cleaned = stripTrailingSlashes(trimmed);

  // custom-openai：确保路径以 /v1 结尾。纯域名、带子路径或 token 路径均补全。
  if (provider === 'custom-openai' && !cleaned.endsWith('/v1')) {
    return `${cleaned}/v1`;
  }

  return cleaned;
}
