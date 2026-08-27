import { describe, it, expect, vi } from 'vitest';
import { DirectScraperProvider } from './direct-scraper-provider.js';
import type { HotListScraper, ScrapeResult } from './scraper-types.js';

/** 创建 mock 抓取器 */
function mockScraper(platform: string, items: { title: string }[]): HotListScraper {
  return {
    platform,
    platformLabel: `${platform}热榜`,
    scrape: vi.fn().mockResolvedValue({
      platform,
      platformLabel: `${platform}热榜`,
      items: items.map((item, i) => ({
        title: item.title,
        snippet: '',
        url: `https://${platform}.com/${i}`,
        rank: i + 1,
      })),
      scrapedAt: '2026-03-12T00:00:00.000Z',
    } satisfies ScrapeResult),
  };
}

/** 创建会失败的 mock 抓取器 */
function failingScraper(platform: string): HotListScraper {
  return {
    platform,
    platformLabel: `${platform}热榜`,
    scrape: vi.fn().mockRejectedValue(new Error(`${platform} network error`)),
  };
}

describe('DirectScraperProvider', () => {
  it('fetchAll 应归一化结果为 TrendsRawResult 格式', async () => {
    const provider = new DirectScraperProvider(['weibo']);
    // 替换内部 scrapers 为 mock
    const mock = mockScraper('weibo', [{ title: '热搜话题1' }, { title: '热搜话题2' }]);
    (provider as any).scrapers = [mock];

    const result = await provider.fetchAll();

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      source: 'weibo',
      query: '[直接抓取] weibo热榜',
      title: '热搜话题1',
      url: 'https://weibo.com/0',
      rank: 1,
    });
    expect(result.queriesExecuted).toBe(1);
    expect(result.queriesFailed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('fetchAll 应容错单个源失败', async () => {
    const provider = new DirectScraperProvider(['weibo', '36kr']);
    const good = mockScraper('weibo', [{ title: '话题A' }]);
    const bad = failingScraper('36kr');
    (provider as any).scrapers = [good, bad];

    const result = await provider.fetchAll();

    expect(result.results).toHaveLength(1);
    expect(result.results[0].source).toBe('weibo');
    expect(result.queriesFailed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('36kr');
  });

  it('fetchAll 应聚合多个源的结果', async () => {
    const provider = new DirectScraperProvider(['weibo', 'zhihu']);
    const s1 = mockScraper('weibo', [{ title: '微博1' }]);
    const s2 = mockScraper('zhihu', [{ title: '知乎1' }, { title: '知乎2' }]);
    (provider as any).scrapers = [s1, s2];

    const result = await provider.fetchAll();

    expect(result.results).toHaveLength(3);
    expect(result.queriesExecuted).toBe(2);
    expect(result.queriesFailed).toBe(0);
  });

  it('search 方法应委托到 fetchAll', async () => {
    const provider = new DirectScraperProvider(['weibo']);
    const mock = mockScraper('weibo', [{ title: '话题' }]);
    (provider as any).scrapers = [mock];

    const results = await provider.search('ignored query', 10);

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('话题');
  });

  it('所有源都失败时应返回空结果而非抛错', async () => {
    const provider = new DirectScraperProvider(['weibo', '36kr']);
    (provider as any).scrapers = [failingScraper('weibo'), failingScraper('36kr')];

    const result = await provider.fetchAll();

    expect(result.results).toHaveLength(0);
    expect(result.queriesFailed).toBe(2);
    expect(result.errors).toHaveLength(2);
  });
});
