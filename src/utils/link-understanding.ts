/**
 * 链接理解模块
 *
 * 自动检测用户创作指令中的 URL，抓取内容并提取摘要，
 * 作为参考素材注入 Agent 上下文。
 */

import { createLogger } from './logger.js';
import { assertSafeUrl } from './url-safety.js';

const log = createLogger('utils:link-understanding');

/** 最大处理链接数 */
const MAX_LINKS = 3;
/** 单链接抓取超时（毫秒） */
const FETCH_TIMEOUT_MS = 10_000;
/** 单链接摘要最大字符数 */
const MAX_CONTENT_CHARS = 2000;
/** 内网/本地地址模式（首轮快筛，权威校验见 assertSafeUrl） */
const PRIVATE_HOST_PATTERNS = [
  /^localhost/i,
  /^127\./,
  /^192\.168\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0/,
  /^\[::1\]/,
];

export type LinkContent = {
  url: string;
  title: string;
  text: string;
  fetchedAt: string;
};

export type LinkProcessResult = {
  /** 原文中 URL 替换为 [参考: title] 后的文本 */
  cleanDirection: string;
  /** 格式化的链接摘要上下文列表 */
  linkContexts: string[];
};

/**
 * 从文本中提取 http/https URL，去重并过滤内网地址。
 */
function extractLinksFromText(text: string, maxLinks: number = MAX_LINKS): string[] {
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  const matches = text.match(urlRegex);
  if (!matches) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of matches) {
    // 去除末尾的标点（中英文句号、逗号等）
    const url = raw.replace(/[.,;:!?。，；：！？]+$/, '');
    if (seen.has(url)) continue;
    seen.add(url);

    // 过滤内网地址
    try {
      const hostname = new URL(url).hostname;
      if (PRIVATE_HOST_PATTERNS.some(p => p.test(hostname))) continue;
    } catch {
      continue;
    }

    result.push(url);
    if (result.length >= maxLinks) break;
  }

  return result;
}

/**
 * 从 HTML 中提取纯文本（简单实现，不引入重依赖）。
 */
function extractTextFromHtml(html: string): { title: string; text: string } {
  // 提取 <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]*>/g, '').trim()
    : '';

  // 移除 script/style/nav/header/footer
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '');

  // 优先提取 <article> 或 <main> 内容
  const articleMatch = cleaned.match(/<(?:article|main)[\s\S]*?>([\s\S]*?)<\/(?:article|main)>/i);
  if (articleMatch) {
    cleaned = articleMatch[1];
  }

  // 去除所有 HTML 标签，压缩空白
  const text = cleaned
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return { title, text };
}

/**
 * 抓取 URL 内容并提取为可用文本。
 * 超时或异常时返回 null（静默降级）。
 */
async function fetchAndSummarize(
  url: string,
  options?: { timeoutMs?: number; maxChars?: number },
): Promise<LinkContent | null> {
  const timeoutMs = options?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxChars = options?.maxChars ?? MAX_CONTENT_CHARS;

  try {
    // SSRF 权威校验：拦截私有 IP / 云元数据 / 非标准 IP 格式（覆盖 extractLinks 首轮正则未拦截的十进制 IP 等）
    assertSafeUrl(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NovelWorkshop/1.0)',
        'Accept': 'text/html,text/plain,application/json',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!response.ok) {
      log.warn(`链接抓取失败: ${url} → HTTP ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    const rawBody = await response.text();

    let title = '';
    let text = '';

    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      const extracted = extractTextFromHtml(rawBody);
      title = extracted.title;
      text = extracted.text;
    } else if (contentType.includes('application/json')) {
      title = '(JSON)';
      text = rawBody;
    } else {
      // 纯文本或其它
      title = '';
      text = rawBody;
    }

    // 截断
    if (text.length > maxChars) {
      text = text.slice(0, maxChars) + '…（已截断）';
    }

    if (!text.trim()) {
      return null;
    }

    return {
      url,
      title: title || url,
      text,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.warn(`链接抓取异常: ${url} → ${reason}`);
    return null;
  }
}

/**
 * 批处理创作指令中的链接：检测 → 并行抓取 → 替换原文 → 返回上下文。
 *
 * @returns cleanDirection 中 URL 被替换为 `[参考: title]`，linkContexts 包含格式化的摘要
 */
export async function processLinksInDirection(direction: string): Promise<LinkProcessResult> {
  const links = extractLinksFromText(direction);

  if (links.length === 0) {
    return { cleanDirection: direction, linkContexts: [] };
  }

  // 并行抓取所有链接
  const results = await Promise.all(
    links.map(url => fetchAndSummarize(url)),
  );

  let cleanDirection = direction;
  const linkContexts: string[] = [];

  for (const result of results) {
    if (!result) continue;

    // 替换原文中的 URL
    cleanDirection = cleanDirection.replace(
      result.url,
      `[参考: ${result.title}]`,
    );

    // 格式化为上下文块
    linkContexts.push(
      [
        `【参考链接】${result.title}`,
        `来源：${result.url}`,
        result.text,
      ].join('\n'),
    );
  }

  return { cleanDirection, linkContexts };
}

/**
 * 将链接上下文格式化为可注入 Agent 的参考素材文本。
 */
export function formatLinkContexts(linkContexts: string[]): string {
  if (linkContexts.length === 0) return '';
  return [
    '## 用户参考素材（来自创作指令中的链接）',
    '',
    ...linkContexts,
  ].join('\n\n');
}
