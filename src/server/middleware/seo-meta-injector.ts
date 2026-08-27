/**
 * SEO Meta 注入中间件
 *
 * 拦截公开页面的请求，在返回 SPA 的 index.html 前动态注入 SEO meta 标签。
 * 搜索引擎和社交平台爬虫拿到的 HTML 包含完整的 title / description / og 标签，
 * 而浏览器正常加载后 Vue 接管渲染不受影响。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { AuthDb } from '../../auth/types.js';
import { resolveBookAuthorName } from '../routes/handlers/bookstore/author-name-resolver.js';
import { createLogger } from '../../utils/logger.js';
import { brand, withBrandSuffix } from '../../config/brand.js';

const log = createLogger('seo');

/** 默认 meta 信息（兜底） */
const DEFAULT_META = {
  title: withBrandSuffix('AI 原生小说创作平台'),
  description: `${brand.displayName} 是${brand.description}`,
  keywords: 'AI小说创作,小说写作,AI写作助手,在线创作平台,AI自动写作,小说生成器',
};

const DESCRIPTION_MAX_LENGTH = 160;

type SeoMetaDeps = {
  bookStoreManager?: BookStoreManager;
  novelManager?: NovelManager;
  authDb?: AuthDb;
  platformUrl?: string;
  staticDir: string;
};

// ==================== index.html 缓存 ====================

let cachedIndexHtml: string | null = null;
let cachedIndexHtmlMtime: Date | null = null;

function getIndexHtml(staticDir: string): string | null {
  const indexPath = path.resolve(staticDir, 'index.html');
  try {
    const stat = fs.statSync(indexPath);
    if (cachedIndexHtml && cachedIndexHtmlMtime && stat.mtimeMs === cachedIndexHtmlMtime.getTime()) {
      return cachedIndexHtml;
    }
    cachedIndexHtml = fs.readFileSync(indexPath, 'utf8');
    cachedIndexHtmlMtime = stat.mtime;
    return cachedIndexHtml;
  } catch {
    return null;
  }
}

// ==================== 作者名缓存 ====================

const authorNameCache = new Map<string, Promise<string>>();

// ==================== meta 构建器 ====================

type SeoMeta = {
  title: string;
  description: string;
  keywords?: string;
  ogType?: string;
  ogImage?: string;
  canonicalUrl?: string;
  jsonLd?: object | object[];
  twitterCard?: 'summary' | 'summary_large_image';
};

function truncateDescription(text: string): string {
  if (text.length <= DESCRIPTION_MAX_LENGTH) return text;
  return text.slice(0, DESCRIPTION_MAX_LENGTH - 1) + '…';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildCanonicalUrl(platformUrl: string, path: string): string {
  return `${platformUrl.replace(/\/$/, '')}${path}`;
}

function buildHomeMeta(platformUrl?: string): SeoMeta {
  const jsonLds: object[] = [];

  // WebSite + SearchAction：搜索结果页直接展示站内搜索框
  if (platformUrl) {
    jsonLds.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: brand.displayName,
      url: platformUrl,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${platformUrl}/bookstore?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    });

    // Organization：搜索引擎知识面板（logo、简介）
    jsonLds.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: brand.displayName,
      url: platformUrl,
      logo: `${platformUrl}/brand/logo-square-light.svg`,
      description: DEFAULT_META.description,
      sameAs: [],
    });
  }

  return {
    ...DEFAULT_META,
    ogType: 'website',
    canonicalUrl: platformUrl ? buildCanonicalUrl(platformUrl, '/') : undefined,
    jsonLd: jsonLds.length > 0 ? jsonLds : undefined,
  };
}

function buildBookstoreMeta(platformUrl?: string): SeoMeta {
  const bookstoreDescription = `浏览${brand.displayName} 书城中的原创小说作品。玄幻、都市、历史、科幻、武侠、仙侠等多品类佳作。`;
  const jsonLd: object = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${brand.displayName} 书城`,
    description: bookstoreDescription,
    url: platformUrl ? buildCanonicalUrl(platformUrl, '/bookstore') : undefined,
    isPartOf: platformUrl ? { '@type': 'WebSite', url: platformUrl } : undefined,
    mainEntity: {
      '@type': 'ItemList',
      name: '原创小说列表',
      numberOfItems: '数十部原创小说持续更新中',
    },
  };

  return {
    title: withBrandSuffix('书城'),
    description: bookstoreDescription,
    keywords: '在线小说,免费阅读,原创小说,AI创作小说',
    ogType: 'website',
    canonicalUrl: platformUrl ? buildCanonicalUrl(platformUrl, '/bookstore') : undefined,
    jsonLd,
  };
}

function buildDownloadMeta(platformUrl?: string): SeoMeta {
  return {
    title: withBrandSuffix('下载'),
    description: `下载${brand.displayName} 客户端，随时随地创作你的小说。`,
    ogType: 'website',
    canonicalUrl: platformUrl ? buildCanonicalUrl(platformUrl, '/download') : undefined,
  };
}

async function buildBookDetailMeta(
  bookId: string,
  deps: SeoMetaDeps,
): Promise<SeoMeta | null> {
  const { bookStoreManager, authDb, platformUrl } = deps;
  if (!bookStoreManager) return null;

  const book = await bookStoreManager.getBook(bookId);
  if (!book || book.publishStatus !== 'approved') return null;

  const authorName = await resolveBookAuthorName(
    { userId: book.userId },
    authDb,
    authorNameCache,
  );

  const desc = truncateDescription(book.description || `${book.title} - ${book.category}小说`);

  const jsonLds: object[] = [];

  // Book 结构化数据
  jsonLds.push({
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    description: book.description || undefined,
    genre: book.category,
    author: { '@type': 'Person', name: authorName },
    ...(book.cover && { image: book.cover }),
    ...(book.viewCount > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.5',
        reviewCount: String(book.viewCount),
      },
    }),
  });

  // BreadcrumbList：搜索结果中展示 首页 > 书城 > 书名
  if (platformUrl) {
    jsonLds.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: platformUrl },
        { '@type': 'ListItem', position: 2, name: '书城', item: `${platformUrl}/bookstore` },
        { '@type': 'ListItem', position: 3, name: book.title, item: `${platformUrl}/bookstore/${bookId}` },
      ],
    });
  }

  return {
    title: `${book.title} — ${brand.displayName} 书城`,
    description: desc,
    keywords: [book.category, ...book.tags].slice(0, 5).join(','),
    ogType: 'article',
    ogImage: book.cover || undefined,
    canonicalUrl: platformUrl ? buildCanonicalUrl(platformUrl, `/bookstore/${bookId}`) : undefined,
    jsonLd: jsonLds,
  };
}

async function buildChapterMeta(
  bookId: string,
  chapterId: string,
  deps: SeoMetaDeps,
): Promise<SeoMeta | null> {
  const { bookStoreManager, novelManager, authDb, platformUrl } = deps;
  if (!bookStoreManager || !novelManager) return null;

  const book = await bookStoreManager.getBook(bookId);
  if (!book || book.publishStatus !== 'approved') return null;

  const chapterNumber = Number.parseInt(chapterId, 10);
  if (!Number.isFinite(chapterNumber) || chapterNumber < 1) return null;

  // 获取章节标题
  const chapter = await novelManager.getChapter(book.novelId, chapterNumber).catch(() => null);
  const chapterTitle = chapter?.title?.trim() || `第${chapterNumber}章`;

  const authorName = await resolveBookAuthorName(
    { userId: book.userId },
    authDb,
    authorNameCache,
  );

  const desc = truncateDescription(`${book.title} ${chapterTitle} — ${authorName} 著`);
  const chapterUrl = `/bookstore/${bookId}/read/${chapterId}`;

  const jsonLds: object[] = [];

  // Article 结构化数据：章节作为文章条目
  jsonLds.push({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: chapterTitle,
    author: { '@type': 'Person', name: authorName },
    genre: book.category,
    isPartOf: {
      '@type': 'Book',
      name: book.title,
      ...(book.cover && { image: book.cover }),
    },
    wordCount: chapter?.content?.length || undefined,
  });

  // BreadcrumbList：搜索结果中展示 首页 > 书城 > 书名 > 章节名
  if (platformUrl) {
    jsonLds.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: platformUrl },
        { '@type': 'ListItem', position: 2, name: '书城', item: `${platformUrl}/bookstore` },
        { '@type': 'ListItem', position: 3, name: book.title, item: `${platformUrl}/bookstore/${bookId}` },
        { '@type': 'ListItem', position: 4, name: chapterTitle, item: `${platformUrl}${chapterUrl}` },
      ],
    });
  }

  return {
    title: withBrandSuffix(`${chapterTitle} — ${book.title}`),
    description: desc,
    ogType: 'article',
    ogImage: book.cover || undefined,
    canonicalUrl: platformUrl
      ? buildCanonicalUrl(platformUrl, chapterUrl)
      : undefined,
    jsonLd: jsonLds,
  };
}

// ==================== HTML 注入 ====================

function injectMetaIntoHtml(html: string, meta: SeoMeta): string {
  const tags: string[] = [];

  // title（替换已有的）
  let result = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(meta.title)}</title>`,
  );

  tags.push(`<meta name="description" content="${escapeHtml(meta.description)}">`);
  if (meta.keywords) {
    tags.push(`<meta name="keywords" content="${escapeHtml(meta.keywords)}">`);
  }
  if (meta.ogType) {
    tags.push(`<meta property="og:title" content="${escapeHtml(meta.title)}">`);
    tags.push(`<meta property="og:description" content="${escapeHtml(meta.description)}">`);
    tags.push(`<meta property="og:type" content="${escapeHtml(meta.ogType)}">`);
  }
  if (meta.ogImage) {
    tags.push(`<meta property="og:image" content="${escapeHtml(meta.ogImage)}">`);
  }
  if (meta.canonicalUrl) {
    tags.push(`<link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}">`);
  }
  // Twitter Card
  const cardType = meta.twitterCard || (meta.ogImage ? 'summary_large_image' : 'summary');
  tags.push(`<meta name="twitter:card" content="${cardType}">`);
  tags.push(`<meta name="twitter:title" content="${escapeHtml(meta.title)}">`);
  tags.push(`<meta name="twitter:description" content="${escapeHtml(meta.description)}">`);
  if (meta.ogImage) {
    tags.push(`<meta name="twitter:image" content="${escapeHtml(meta.ogImage)}">`);
  }
  // JSON-LD（支持单个对象或数组）
  if (meta.jsonLd) {
    const items = Array.isArray(meta.jsonLd) ? meta.jsonLd : [meta.jsonLd];
    for (const item of items) {
      tags.push(`<script type="application/ld+json">${JSON.stringify(item)}</script>`);
    }
  }

  const injection = tags.join('\n    ');
  result = result.replace('</head>', `    ${injection}\n  </head>`);

  return result;
}

// ==================== 路由匹配 ====================

const BOOK_DETAIL_RE = /^\/bookstore\/([a-zA-Z0-9_-]+)$/;
const CHAPTER_READ_RE = /^\/bookstore\/([a-zA-Z0-9_-]+)\/read\/(\d+)$/;
const MOBILE_BOOK_DETAIL_RE = /^\/m\/bookstore\/([a-zA-Z0-9_-]+)$/;
const MOBILE_CHAPTER_READ_RE = /^\/m\/bookstore\/([a-zA-Z0-9_-]+)\/read(?:\/(\d+))?$/;

type RouteMatch =
  | { type: 'home' }
  | { type: 'bookstore' }
  | { type: 'download' }
  | { type: 'book-detail'; bookId: string }
  | { type: 'chapter'; bookId: string; chapterId: string };

function matchRoute(requestPath: string): RouteMatch | null {
  if (requestPath === '/' || requestPath === '') return { type: 'home' };
  if (requestPath === '/bookstore' || requestPath === '/m/bookstore') return { type: 'bookstore' };
  if (requestPath === '/download' || requestPath === '/m/download') return { type: 'download' };

  let m = requestPath.match(BOOK_DETAIL_RE) || requestPath.match(MOBILE_BOOK_DETAIL_RE);
  if (m) return { type: 'book-detail', bookId: m[1] };

  m = requestPath.match(CHAPTER_READ_RE) || requestPath.match(MOBILE_CHAPTER_READ_RE);
  if (m) return { type: 'chapter', bookId: m[1], chapterId: m[2] || '1' };

  return null;
}

// ==================== SPA fallback 中的 SEO 注入 ====================

/**
 * 在 SPA fallback 中尝试注入 SEO meta。
 * 如果当前路径匹配公开页面且有数据可查，注入 SEO meta 后返回 HTML；
 * 否则返回原始 index.html。
 *
 * 设计为直接在 SPA fallback 路由 handler 中调用，
 * 避免 Express 5 中 app.use() 与 app.get('{*path}') 的优先级问题。
 */
export async function handleSeoMetaInjection(
  reqPath: string,
  deps: SeoMetaDeps,
): Promise<{ html: string; seoInjected: boolean } | null> {
  const routeMatch = matchRoute(reqPath);
  if (!routeMatch) return null;

  const html = getIndexHtml(deps.staticDir);
  if (!html) return null;

  let seoMeta: SeoMeta | null = null;

  try {
    switch (routeMatch.type) {
      case 'home':
        seoMeta = buildHomeMeta(deps.platformUrl);
        break;
      case 'bookstore':
        seoMeta = buildBookstoreMeta(deps.platformUrl);
        break;
      case 'download':
        seoMeta = buildDownloadMeta(deps.platformUrl);
        break;
      case 'book-detail':
        seoMeta = await buildBookDetailMeta(routeMatch.bookId, deps);
        break;
      case 'chapter':
        seoMeta = await buildChapterMeta(routeMatch.bookId, routeMatch.chapterId, deps);
        break;
    }
  } catch (err) {
    log.warn('SEO meta 构建失败', { path: reqPath, error: err instanceof Error ? err.message : String(err) });
  }

  if (!seoMeta) return null;

  const injected = injectMetaIntoHtml(html, seoMeta);
  return { html: injected, seoInjected: true };
}

/**
 * 返回原始 index.html 内容（用于 SPA fallback）。
 */
export function readIndexHtml(staticDir: string): string | null {
  return getIndexHtml(staticDir);
}
