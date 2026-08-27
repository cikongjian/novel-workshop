/**
 * 百度搜索引擎主动推送服务
 *
 * 通过百度普通收录 API 主动推送 URL，加速收录。
 * 支持手动全量推送和书籍审核通过时自动增量推送。
 *
 * API 文档：https://ziyuan.baidu.com/linksubmit/index
 */
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import { createLogger } from '../../utils/logger.js';
import { appendSeoPushLog, type SeoPushTrigger } from './seo-push-log.js';

const log = createLogger('seo-push');

/** 百度推送每次最多 2000 条 URL */
const BAIDU_PUSH_BATCH_SIZE = 2000;
/** 百度推送 API 地址（可通过 BAIDU_PUSH_API 环境变量覆盖，默认百度普通收录接口） */
const BAIDU_PUSH_API = process.env.BAIDU_PUSH_API ?? 'http://data.zz.baidu.com/urls';

export type SeoPushDeps = {
  bookStoreManager?: BookStoreManager;
  platformUrl?: string;
  baiduToken?: string;
};

// ==================== URL 收集 ====================

/**
 * 收集所有需要推送的公开 URL（复用 sitemap 的逻辑）。
 */
export async function collectPublicUrls(
  bookStoreManager: BookStoreManager | undefined,
  platformUrl: string,
): Promise<string[]> {
  const site = platformUrl.replace(/\/$/, '');
  const urls: string[] = [];

  // 静态页面
  urls.push(
    `${site}/`,
    `${site}/bookstore`,
    `${site}/download`,
  );

  // 书城动态内容
  if (!bookStoreManager) return urls;

  try {
    const books = await bookStoreManager.listBooks({ page: 1, pageSize: 1000 });
    for (const book of books.items) {
      if (book.publishStatus !== 'approved') continue;

      urls.push(`${site}/bookstore/${book.id}`);

      const publishedChapters = (book.publishedChapters ?? [])
        .filter((ch) => ch.status === 'published');
      for (const ch of publishedChapters) {
        urls.push(`${site}/bookstore/${book.id}/read/${ch.chapterNumber}`);
      }
    }
  } catch (err) {
    log.warn('收集推送 URL 失败', { error: err instanceof Error ? err.message : String(err) });
  }

  return urls;
}

/**
 * 构造单本书的推送 URL 列表（增量推送用）。
 */
export function collectBookUrls(
  bookId: string,
  publishedChapters: ReadonlyArray<{ chapterNumber: number; status: string }>,
  platformUrl: string,
): string[] {
  const site = platformUrl.replace(/\/$/, '');
  const urls = [`${site}/bookstore/${bookId}`];

  for (const ch of publishedChapters) {
    if (ch.status === 'published') {
      urls.push(`${site}/bookstore/${bookId}/read/${ch.chapterNumber}`);
    }
  }

  return urls;
}

// ==================== 百度推送 ====================

export type PushResult = {
  success: number;
  remain: number;
  urls: string[];
  notValid?: number[];
  error?: string;
};

/**
 * 推送 URL 列表到百度普通收录 API。
 */
export async function pushToBaidu(
  urls: string[],
  site: string,
  token: string,
): Promise<PushResult> {
  if (urls.length === 0) {
    return { success: 0, remain: 0, urls: [] };
  }

  // 分批推送（百度限制每次最多 2000 条）
  let totalSuccess = 0;
  let lastRemain = 0;

  for (let i = 0; i < urls.length; i += BAIDU_PUSH_BATCH_SIZE) {
    const batch = urls.slice(i, i + BAIDU_PUSH_BATCH_SIZE);
    const body = batch.join('\n');

    const apiUrl = `${BAIDU_PUSH_API}?site=${site}&token=${encodeURIComponent(token)}`;
    log.info(`推送第 ${i / BAIDU_PUSH_BATCH_SIZE + 1} 批，${batch.length} 条 URL`, { apiUrl });

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body,
        signal: AbortSignal.timeout(30_000),
      });

      const result = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        const baiduMsg = typeof result.message === 'string' ? result.message : '';
        const baiduCode = result.error ?? `HTTP ${response.status}`;
        const errorMsg = baiduMsg ? `${baiduCode}: ${baiduMsg}` : String(baiduCode);
        log.warn('百度推送失败', { batch: i / BAIDU_PUSH_BATCH_SIZE + 1, error: errorMsg });
        return { success: totalSuccess, remain: lastRemain, urls, error: errorMsg };
      }

      totalSuccess += (result.success as number) ?? 0;
      lastRemain = (result.remain as number) ?? 0;

      const notValid = result.not_valid as number[] | undefined;
      if (notValid && notValid.length > 0) {
        log.warn('部分 URL 无效', { notValid });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.warn('百度推送请求失败', { batch: i / BAIDU_PUSH_BATCH_SIZE + 1, error: errorMsg });
      return { success: totalSuccess, remain: lastRemain, urls, error: errorMsg };
    }
  }

  log.info('百度推送完成', { total: urls.length, success: totalSuccess, remain: lastRemain });
  return { success: totalSuccess, remain: lastRemain, urls };
}

// ==================== 便捷方法 ====================

/**
 * 全量推送：收集所有公开 URL 并推送到百度。
 */
export async function pushAllToBaidu(deps: SeoPushDeps): Promise<PushResult> {
  const { bookStoreManager, platformUrl, baiduToken } = deps;

  if (!platformUrl) {
    return { success: 0, remain: 0, urls: [], error: 'PLATFORM_URL 未配置' };
  }
  if (!baiduToken) {
    return { success: 0, remain: 0, urls: [], error: '百度推送 Token 未配置' };
  }

  const urls = await collectPublicUrls(bookStoreManager, platformUrl);
  log.info(`准备推送 ${urls.length} 条 URL 到百度`);

  return pushToBaidu(urls, platformUrl, baiduToken);
}

/**
 * 增量推送：推送单本书的 URL 到百度。
 */
export async function pushBookToBaidu(
  bookId: string,
  publishedChapters: ReadonlyArray<{ chapterNumber: number; status: string }>,
  deps: SeoPushDeps,
): Promise<PushResult> {
  const { platformUrl, baiduToken } = deps;

  if (!platformUrl || !baiduToken) return { success: 0, remain: 0, urls: [] };

  const urls = collectBookUrls(bookId, publishedChapters, platformUrl);
  return pushToBaidu(urls, platformUrl, baiduToken);
}
