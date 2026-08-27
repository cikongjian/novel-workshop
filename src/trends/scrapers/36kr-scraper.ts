import { createLogger } from '../../utils/logger.js';
import type { HotListScraper, ScrapeResult, ScrapedItem } from './scraper-types.js';
import { fetchWithRetry, randomUserAgent } from './scraper-http.js';

const log = createLogger('scraper:36kr');

const ENDPOINT = 'https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot';

type Kr36RankItem = {
  itemId: number;
  publishTime: string;
  templateMaterial?: {
    widgetTitle?: string;
    widgetImage?: string;
    authorName?: string;
    summary?: string;
    statCollect?: number;
  };
};

export class ThirtySixKrScraper implements HotListScraper {
  readonly platform = '36kr';
  readonly platformLabel = '36氪热榜';

  async scrape(maxResults: number): Promise<ScrapeResult> {
    const res = await fetchWithRetry(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': randomUserAgent(),
      },
      body: JSON.stringify({
        partner_id: 'wap',
        param: { siteId: 1, platformId: 2 },
        timestamp: Date.now(),
      }),
    });
    if (!res.ok) throw new Error(`36Kr HTTP ${res.status}`);

    const json = (await res.json()) as { data?: { hotRankList?: Kr36RankItem[] } };
    const list = json.data?.hotRankList ?? [];

    const items: ScrapedItem[] = list.slice(0, maxResults).map((item, i) => ({
      title: item.templateMaterial?.widgetTitle ?? '',
      snippet: item.templateMaterial?.summary ?? '',
      url: `https://www.36kr.com/p/${item.itemId}`,
      rank: i + 1,
      hotScore: item.templateMaterial?.statCollect,
    }));

    log.info(`抓取完成: ${items.length} 条`);
    return { platform: this.platform, platformLabel: this.platformLabel, items, scrapedAt: new Date().toISOString() };
  }
}
