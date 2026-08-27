import { createLogger } from '../../utils/logger.js';
import type { HotListScraper, ScrapeResult, ScrapedItem } from './scraper-types.js';
import { fetchWithRetry, randomUserAgent } from './scraper-http.js';

const log = createLogger('scraper:weibo');

const ENDPOINT = 'https://weibo.com/ajax/side/hotSearch';

type WeiboItem = {
  word: string;
  label_name?: string;
  note?: string;
  num?: number;
  mid?: string;
};

export class WeiboScraper implements HotListScraper {
  readonly platform = 'weibo';
  readonly platformLabel = '微博热搜';

  async scrape(maxResults: number): Promise<ScrapeResult> {
    const res = await fetchWithRetry(ENDPOINT, {
      headers: {
        'User-Agent': randomUserAgent(),
        'Referer': 'https://weibo.com/',
        'Accept': 'application/json, text/plain, */*',
      },
    });
    if (!res.ok) throw new Error(`Weibo HTTP ${res.status}`);

    const json = (await res.json()) as { data?: { realtime?: WeiboItem[] } };
    const list = json.data?.realtime ?? [];

    const items: ScrapedItem[] = list.slice(0, maxResults).map((item, i) => ({
      title: item.word,
      snippet: item.note ?? (item.label_name ? `[${item.label_name}]` : ''),
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word)}`,
      rank: i + 1,
      hotScore: item.num,
    }));

    log.info(`抓取完成: ${items.length} 条`);
    return { platform: this.platform, platformLabel: this.platformLabel, items, scrapedAt: new Date().toISOString() };
  }
}
