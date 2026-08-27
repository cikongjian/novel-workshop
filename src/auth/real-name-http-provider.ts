import { getConfig } from '../config/index.js';
import type {
  RealNameHttpProviderConfig,
  RealNameProviderPayload,
  RealNameProviderResult,
} from './real-name-provider-types.js';

function parseHeaders(raw: string): Record<string, string> {
  if (!raw.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('HTTP 实名 provider 的额外请求头必须是 JSON 对象');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('HTTP 实名 provider 的额外请求头必须是 JSON 对象');
  }

  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')]),
  );
}

function readDetail(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const candidate = payload as Record<string, unknown>;
  return typeof candidate.detail === 'string'
    ? candidate.detail
    : typeof candidate.message === 'string'
      ? candidate.message
      : typeof candidate.reason === 'string'
        ? candidate.reason
        : fallback;
}

export async function verifyRealNameWithHttpProvider(
  payload: RealNameProviderPayload,
  override?: Partial<RealNameHttpProviderConfig>,
): Promise<RealNameProviderResult> {
  const current = getConfig().realNameVerification;
  const cfg: RealNameHttpProviderConfig = {
    httpUrl: override?.httpUrl ?? current.httpUrl,
    httpToken: override?.httpToken ?? current.httpToken,
    httpTimeoutMs: override?.httpTimeoutMs ?? current.httpTimeoutMs,
    httpHeaders: override?.httpHeaders ?? current.httpHeaders,
  };
  const targetUrl = cfg.httpUrl.trim();
  if (!targetUrl) {
    throw new Error('HTTP 实名 provider 未配置请求地址');
  }

  const timeoutMs = Math.max(1000, cfg.httpTimeoutMs || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(cfg.httpToken.trim() ? { authorization: `Bearer ${cfg.httpToken.trim()}` } : {}),
        ...parseHeaders(cfg.httpHeaders),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new Error(readDetail(body, `HTTP 实名 provider 请求失败，状态码 ${response.status}`));
    }

    const passedValue = typeof body === 'object' && body
      ? (body as Record<string, unknown>).passed
        ?? (body as Record<string, unknown>).success
        ?? (body as Record<string, unknown>).verified
      : null;

    if (typeof passedValue !== 'boolean') {
      throw new Error('HTTP 实名 provider 响应格式无效，需要返回 passed、success 或 verified 布尔值');
    }

    return {
      provider: 'http_bridge',
      passed: passedValue,
      detail: readDetail(body, passedValue ? '外部实名核验通过' : '外部实名核验未通过'),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`HTTP 实名 provider 请求超时（${timeoutMs}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
