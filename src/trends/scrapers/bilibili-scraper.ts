import { createLogger } from '../../utils/logger.js';
import type { HotListScraper, ScrapeResult, ScrapedItem } from './scraper-types.js';
import { fetchWithRetry, randomUserAgent } from './scraper-http.js';

const log = createLogger('scraper:bilibili');

const ENDPOINT = 'https://api.bilibili.com/x/web-interface/search/square?limit=50';

type BilibiliTrendingItem = {
  keyword: string;
  show_name?: string;
  icon?: string;
  uri?: string;
  goto?: string;
};

export class BilibiliScraper implements HotListScraper {
  readonly platform = 'bilibili';
  readonly platformLabel = 'B站热搜';

  async scrape(maxResults: number): Promise<ScrapeResult> {
    const res = await fetchWithRetry(ENDPOINT, {
      headers: {
        'User-Agent': randomUserAgent(),
        'Referer': 'https://www.bilibili.com',
        'Accept': 'application/json, text/plain, */*',
      },
    });
    if (!res.ok) throw new Error(`Bilibili HTTP ${res.status}`);

    const json = (await res.json()) as {
      data?: { trending?: { list?: BilibiliTrendingItem[] } };
    };
    const list = json.data?.trending?.list ?? [];

    const items: ScrapedItem[] = list.slice(0, maxResults).map((item, i) => ({
      title: item.show_name ?? item.keyword,
      snippet: '',
      url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.keyword)}`,
      rank: i + 1,
    }));

    log.info(`抓取完成: ${items.length} 条`);
    return { platform: this.platform, platformLabel: this.platformLabel, items, scrapedAt: new Date().toISOString() };
  }
}
