import { createLogger } from '../../utils/logger.js';
import type { HotListScraper, ScrapeResult, ScrapedItem } from './scraper-types.js';
import { fetchWithRetry, randomUserAgent } from './scraper-http.js';

const log = createLogger('scraper:toutiao');

const ENDPOINT = 'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc';

type ToutiaoHotItem = {
  Title: string;
  HotValue: number;
  ClusterIdStr?: string;
  Image?: { url?: string };
};

export class ToutiaoScraper implements HotListScraper {
  readonly platform = 'toutiao';
  readonly platformLabel = '头条热榜';

  async scrape(maxResults: number): Promise<ScrapeResult> {
    const res = await fetchWithRetry(ENDPOINT, {
      headers: {
        'User-Agent': randomUserAgent(),
        'Accept': 'application/json, text/plain, */*',
      },
    });
    if (!res.ok) throw new Error(`Toutiao HTTP ${res.status}`);

    const json = (await res.json()) as { data?: ToutiaoHotItem[] };
    const list = json.data ?? [];

    const items: ScrapedItem[] = list.slice(0, maxResults).map((item, i) => ({
      title: item.Title,
      snippet: '',
      url: item.ClusterIdStr
        ? `https://www.toutiao.com/trending/${item.ClusterIdStr}/`
        : 'https://www.toutiao.com',
      rank: i + 1,
      hotScore: item.HotValue,
    }));

    log.info(`抓取完成: ${items.length} 条`);
    return { platform: this.platform, platformLabel: this.platformLabel, items, scrapedAt: new Date().toISOString() };
  }
}
