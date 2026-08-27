import { createLogger } from '../../utils/logger.js';
import type { HotListScraper, ScrapeResult, ScrapedItem } from './scraper-types.js';
import { fetchWithRetry, randomUserAgent } from './scraper-http.js';

const log = createLogger('scraper:baidu');

/** 百度热搜小说榜 — 使用 tab=novel 获取小说相关热搜 */
const ENDPOINT = 'https://top.baidu.com/board?tab=novel';

const SDATA_REGEX = /<!--s-data:(.*?)-->/s;

type BaiduContentItem = {
  word: string;
  desc?: string;
  hotScore?: number;
  img?: string;
  url?: string;
};

export class BaiduScraper implements HotListScraper {
  readonly platform = 'baidu';
  readonly platformLabel = '百度小说榜';

  async scrape(maxResults: number): Promise<ScrapeResult> {
    const res = await fetchWithRetry(ENDPOINT, {
      headers: {
        'User-Agent': randomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`Baidu HTTP ${res.status}`);

    const html = await res.text();
    const match = html.match(SDATA_REGEX);
    if (!match) throw new Error('Baidu: 未找到 s-data 嵌入数据');

    const data = JSON.parse(match[1]) as {
      data?: { cards?: Array<{ content?: BaiduContentItem[] }> };
    };
    const list = data.data?.cards?.[0]?.content ?? [];

    const items: ScrapedItem[] = list.slice(0, maxResults).map((item, i) => ({
      title: item.word,
      snippet: item.desc ?? '',
      url: item.url ?? `https://top.baidu.com/board?tab=novel`,
      rank: i + 1,
      hotScore: item.hotScore,
    }));

    log.info(`抓取完成: ${items.length} 条`);
    return { platform: this.platform, platformLabel: this.platformLabel, items, scrapedAt: new Date().toISOString() };
  }
}
