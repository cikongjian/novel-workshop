import { createLogger } from '../../utils/logger.js';
import type { HotListScraper, ScrapeResult, ScrapedItem } from './scraper-types.js';
import { fetchWithRetry, randomUserAgent } from './scraper-http.js';

const log = createLogger('scraper:zhihu');

const ENDPOINT = 'https://api.zhihu.com/topstory/hot-lists/total?limit=50';

type ZhihuHotItem = {
  target: {
    id: number;
    title: string;
    excerpt?: string;
    url?: string;
  };
  detail_text?: string;
};

export class ZhihuScraper implements HotListScraper {
  readonly platform = 'zhihu';
  readonly platformLabel = '知乎热榜';

  async scrape(maxResults: number): Promise<ScrapeResult> {
    const res = await fetchWithRetry(ENDPOINT, {
      headers: {
        'User-Agent': randomUserAgent(),
        'x-api-version': '3.0.76',
        'Accept': 'application/json, text/plain, */*',
      },
    });
    if (!res.ok) throw new Error(`Zhihu HTTP ${res.status}`);

    const json = (await res.json()) as { data?: ZhihuHotItem[] };
    const list = json.data ?? [];

    const items: ScrapedItem[] = list.slice(0, maxResults).map((item, i) => ({
      title: item.target.title,
      snippet: item.target.excerpt ?? item.detail_text ?? '',
      url: `https://www.zhihu.com/question/${item.target.id}`,
      rank: i + 1,
    }));

    log.info(`抓取完成: ${items.length} 条`);
    return { platform: this.platform, platformLabel: this.platformLabel, items, scrapedAt: new Date().toISOString() };
  }
}
