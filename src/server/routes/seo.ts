/**
 * SEO 内容生成器 — robots.txt / sitemap.xml / RSS feed
 *
 * 不使用 Express Router，直接导出处理函数，
 * 由 SPA fallback handler 统一调用，彻底避免 Express 5 路由优先级问题。
 */
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import { createLogger } from '../../utils/logger.js';
import { brand } from '../../config/brand.js';

const log = createLogger('seo');

export type SeoRouteDeps = {
  bookStoreManager?: BookStoreManager;
  platformUrl?: string;
};

// ==================== 缓存 ====================

const SITEMAP_CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时
let sitemapCache: { xml: string; timestamp: number } | null = null;

const FEED_CACHE_TTL_MS = 30 * 60 * 1000; // 30 分钟
let feedCache: { xml: string; timestamp: number } | null = null;

// ==================== robots.txt ====================

function generateRobotsTxt(platformUrl: string): string {
  const site = platformUrl.replace(/\/$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Allow: /bookstore',
    'Allow: /download',
    'Allow: /privacy',
    'Allow: /terms',
    'Disallow: /api/',
    'Disallow: /novel/',
    'Disallow: /app/',
    'Disallow: /admin/',
    'Disallow: /settings',
    'Disallow: /workspace',
    'Disallow: /short-story',
    'Disallow: /billing',
    'Disallow: /my-',
    '',
    `Sitemap: ${site}/sitemap.xml`,
    '',
  ].join('\n');
}

// ==================== sitemap.xml ====================

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

async function buildSitemapEntries(
  bookStoreManager: BookStoreManager | undefined,
  platformUrl: string,
): Promise<SitemapEntry[]> {
  const site = platformUrl.replace(/\/$/, '');
  const entries: SitemapEntry[] = [];

  // 静态页面
  entries.push(
    { loc: `${site}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${site}/bookstore`, changefreq: 'daily', priority: '0.9' },
    { loc: `${site}/download`, changefreq: 'monthly', priority: '0.5' },
    { loc: `${site}/privacy`, changefreq: 'yearly', priority: '0.2' },
    { loc: `${site}/terms`, changefreq: 'yearly', priority: '0.2' },
  );

  // 书城动态内容
  if (!bookStoreManager) return entries;

  try {
    const books = await bookStoreManager.listBooks({ page: 1, pageSize: 1000 });
    for (const book of books.items) {
      if (book.publishStatus !== 'approved') continue;

      const lastmod = book.updateTime?.toISOString().split('T')[0];
      entries.push({
        loc: `${site}/bookstore/${book.id}`,
        lastmod,
        changefreq: 'weekly',
        priority: '0.8',
      });

      // 每本书的已发布章节
      const publishedChapters = (book.publishedChapters ?? [])
        .filter((ch) => ch.status === 'published');
      for (const ch of publishedChapters) {
        const chLastmod = ch.publishedAt?.toISOString().split('T')[0];
        entries.push({
          loc: `${site}/bookstore/${book.id}/read/${ch.chapterNumber}`,
          lastmod: chLastmod || lastmod,
          changefreq: 'monthly',
          priority: '0.7',
        });
      }
    }
  } catch (err) {
    log.warn('sitemap 书城数据加载失败', { error: err instanceof Error ? err.message : String(err) });
  }

  return entries;
}

function entriesToSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    let xml = '  <url>\n';
    xml += `    <loc>${escapeXml(entry.loc)}</loc>\n`;
    if (entry.lastmod) xml += `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n`;
    if (entry.changefreq) xml += `    <changefreq>${entry.changefreq}</changefreq>\n`;
    if (entry.priority) xml += `    <priority>${entry.priority}</priority>\n`;
    xml += '  </url>';
    return xml;
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}

// ==================== RSS feed ====================

async function buildFeedEntries(
  bookStoreManager: BookStoreManager | undefined,
  platformUrl: string,
): Promise<string> {
  const site = platformUrl.replace(/\/$/, '');
  if (!bookStoreManager) return buildEmptyFeed(site);

  try {
    const books = await bookStoreManager.listBooks({ page: 1, pageSize: 50 });
    const items = books.items
      .filter((book) => book.publishStatus === 'approved')
      .slice(0, 50)
      .map((book) => {
        const pubDate = book.publishTime?.toUTCString() || new Date().toUTCString();
        const desc = (book.description || book.title).slice(0, 300);
        return [
          '    <item>',
          `      <title>${escapeXml(book.title)}</title>`,
          `      <link>${escapeXml(`${site}/bookstore/${book.id}`)}</link>`,
          `      <description>${escapeXml(desc)}</description>`,
          `      <category>${escapeXml(book.category)}</category>`,
          `      <pubDate>${pubDate}</pubDate>`,
          `      <guid isPermaLink="true">${escapeXml(`${site}/bookstore/${book.id}`)}</guid>`,
          ...(book.cover ? [`      <enclosure url="${escapeXml(book.cover)}" type="image/jpeg"/>`] : []),
          '    </item>',
        ].join('\n');
      }).join('\n');

    return buildFeedWrapper(site, items);
  } catch (err) {
    log.warn('RSS feed 书城数据加载失败', { error: err instanceof Error ? err.message : String(err) });
    return buildEmptyFeed(site);
  }
}

function buildFeedWrapper(site: string, items: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${brand.displayName} 书城 — 最新作品</title>`,
    `    <link>${escapeXml(site)}/bookstore</link>`,
    `    <description>${brand.displayName} 书城最新上架的原创小说</description>`,
    `    <language>zh-CN</language>`,
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(site)}/feed.xml" rel="self" type="application/rss+xml"/>`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

function buildEmptyFeed(site: string): string {
  return buildFeedWrapper(site, '');
}

// ==================== 导出处理函数（供 SPA fallback 调用） ====================

const SEO_FILE_ROUTES = new Set(['/robots.txt', '/sitemap.xml', '/feed.xml']);

/**
 * 判断路径是否为 SEO 文件路由。
 */
export function isSeoFileRoute(requestPath: string): boolean {
  return SEO_FILE_ROUTES.has(requestPath);
}

/**
 * 处理 SEO 文件路由，返回 true 表示已处理并已发送响应。
 */
export async function handleSeoFileRoute(
  reqPath: string,
  deps: SeoRouteDeps,
  res: import('express').Response,
): Promise<boolean> {
  const platformUrl = deps.platformUrl;

  if (reqPath === '/robots.txt') {
    if (!platformUrl) {
      res.type('text/plain').status(404).send('# PLATFORM_URL not configured');
      return true;
    }
    res.type('text/plain').send(generateRobotsTxt(platformUrl));
    return true;
  }

  if (reqPath === '/sitemap.xml') {
    if (!platformUrl) {
      res.type('application/xml').status(404).send('<?xml version="1.0"?><error>PLATFORM_URL not configured</error>');
      return true;
    }
    const now = Date.now();
    if (sitemapCache && now - sitemapCache.timestamp < SITEMAP_CACHE_TTL_MS) {
      res.type('application/xml').send(sitemapCache.xml);
      return true;
    }
    const entries = await buildSitemapEntries(deps.bookStoreManager, platformUrl);
    const xml = entriesToSitemapXml(entries);
    sitemapCache = { xml, timestamp: now };
    res.type('application/xml').send(xml);
    return true;
  }

  if (reqPath === '/feed.xml') {
    if (!platformUrl) {
      res.type('application/xml').status(404).send('<?xml version="1.0"?><error>PLATFORM_URL not configured</error>');
      return true;
    }
    const now = Date.now();
    if (feedCache && now - feedCache.timestamp < FEED_CACHE_TTL_MS) {
      res.type('application/xml').send(feedCache.xml);
      return true;
    }
    const xml = await buildFeedEntries(deps.bookStoreManager, platformUrl);
    feedCache = { xml, timestamp: now };
    res.type('application/xml').send(xml);
    return true;
  }

  return false;
}
