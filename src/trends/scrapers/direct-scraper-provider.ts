import { createLogger } from '../../utils/logger.js';
import { SCRAPER_STAGGER_BASE_MS } from '../trends-constants.js';
import type { TrendsRawResult, TrendsFetchResult } from '../trends-types.js';
import type { SearchProvider } from '../search-provider-types.js';
import type { DirectSource, HotListScraper, ScrapeResult } from './scraper-types.js';
import { createScraperRegistry } from './scraper-registry.js';
import { jitteredDelay } from './scraper-http.js';

const log = createLogger('direct-scraper');

/** 每个平台最多返回条数 */
const MAX_ITEMS_PER_PLATFORM = 30;

/**
 * 直接抓取 Provider — 实现 SearchProvider 接口，
 * 同时提供 fetchAll() 方法供 TrendsFetcher 直接调用以跳过查询循环。
 */
export class DirectScraperProvider implements SearchProvider {
  readonly name = 'direct';
  private readonly scrapers: HotListScraper[];

  constructor(enabledSources: readonly DirectSource[]) {
    this.scrapers = createScraperRegistry(enabledSources);
    log.info(`已注册 ${this.scrapers.length} 个直接抓取源: ${this.scrapers.map((s) => s.platform).join(', ')}`);
  }

  /**
   * SearchProvider.search 的兼容实现 — 直接抓取模式下忽略 query 参数，
   * 返回所有已注册源的聚合结果。
   */
  async search(_query: string, _maxResults: number): Promise<TrendsRawResult[]> {
    const result = await this.fetchAll();
    return result.results;
  }

  /**
   * 错峰抓取所有注册源，归一化为 TrendsFetchResult。
   * 每个源之间加入随机间隔（1-2 秒），避免同一 IP 瞬间发出大量请求。
   */
  async fetchAll(): Promise<TrendsFetchResult> {
    const results: TrendsRawResult[] = [];
    const errors: string[] = [];
    let sourcesSucceeded = 0;
    let sourcesFailed = 0;

    for (let i = 0; i < this.scrapers.length; i++) {
      const scraper = this.scrapers[i];

      // 源间随机间隔（首个源不等待）
      if (i > 0) {
        const delay = jitteredDelay(SCRAPER_STAGGER_BASE_MS);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        const result: ScrapeResult = await scraper.scrape(MAX_ITEMS_PER_PLATFORM);
        sourcesSucceeded++;
        for (const item of result.items) {
          results.push({
            source: scraper.platform,
            query: `[直接抓取] ${scraper.platformLabel}`,
            title: item.title,
            snippet: item.snippet,
            url: item.url,
            rank: item.rank,
            fetchedAt: result.scrapedAt,
          });
        }
      } catch (err) {
        sourcesFailed++;
        const msg = `${scraper.platformLabel} 抓取失败: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        log.warn(msg);
      }
    }

    log.info(`直接抓取完成: ${results.length} 条 (${sourcesSucceeded} 成功, ${sourcesFailed} 失败)`);

    return {
      results,
      fetchedAt: new Date().toISOString(),
      queriesExecuted: this.scrapers.length,
      queriesFailed: sourcesFailed,
      errors,
    };
  }
}
