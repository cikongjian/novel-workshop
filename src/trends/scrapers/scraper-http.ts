import { createLogger } from '../../utils/logger.js';
import {
  SCRAPER_USER_AGENTS,
  SCRAPER_MAX_RETRIES,
  SEARCH_REQUEST_TIMEOUT_MS,
} from '../trends-constants.js';

const log = createLogger('scraper-http');

/** 从 UA 池中随机选取 */
export function randomUserAgent(): string {
  return SCRAPER_USER_AGENTS[Math.floor(Math.random() * SCRAPER_USER_AGENTS.length)];
}

/** 在基础延迟上 ±30% 随机抖动 */
export function jitteredDelay(baseMs: number): number {
  const jitter = baseMs * 0.3 * (Math.random() * 2 - 1);
  return Math.max(500, Math.round(baseMs + jitter));
}

/**
 * 带重试的 fetch — 遇到 429/403 时指数退避重试并换 UA
 * 其他错误直接抛出不重试
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  retries = SCRAPER_MAX_RETRIES,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const headers = new Headers(init.headers);
    // 每次尝试都随机 UA
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', randomUserAgent());
    } else if (attempt > 0) {
      headers.set('User-Agent', randomUserAgent());
    }

    const res = await fetch(url, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(SEARCH_REQUEST_TIMEOUT_MS),
    });

    if (res.status === 429 || res.status === 403) {
      if (attempt < retries) {
        const waitMs = jitteredDelay(2_000 * Math.pow(2, attempt));
        log.warn(`${url} 返回 ${res.status}，${waitMs}ms 后重试 (${attempt + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
    }

    return res;
  }

  // 理论上不会到这里，但 TS 需要
  throw new Error(`fetchWithRetry: 超出最大重试次数 ${url}`);
}
