import { createLogger } from '../utils/logger.js';
import type { TrendsRawResult, TrendsFetchResult, TrendsConfig } from './trends-types.js';
import type { SearchProvider } from './search-provider-types.js';
import {
  DEFAULT_SEARCH_QUERIES,
  DEFAULT_DIRECT_SOURCES,
  MAX_RESULTS_PER_QUERY,
  SEARCH_CONCURRENCY,
  SEARCH_REQUEST_TIMEOUT_MS,
} from './trends-constants.js';
import { DirectScraperProvider } from './scrapers/direct-scraper-provider.js';
import type { DirectSource } from './scrapers/scraper-types.js';

const log = createLogger('trends-fetcher');
export type { SearchProvider } from './search-provider-types.js';

/**
 * 禁止出现在搜索查询中的 shell 危险字符。
 *
 * query 最终通过 `exec`(shell) 拼接进 mcporter 命令，上述任意字符都可在 POSIX shell
 * 或 Windows cmd.exe 中逃逸双引号 / 拼接额外命令，构成命令注入。
 * 默认搜索词（见 trends-constants.ts）与合法自定义词均为自然语言，不含这些字符。
 */
const SHELL_UNSAFE_QUERY = /[`$\\|;&<>()%\n\r]/;

// ==================== SerpAPI 实现 ====================

export class SerpApiSearchProvider implements SearchProvider {
  readonly name = 'serpapi';
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://serpapi.com',
  ) {}

  async search(query: string, maxResults: number): Promise<TrendsRawResult[]> {
    const url = new URL('/search.json', this.baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('engine', 'google');
    url.searchParams.set('hl', 'zh-cn');
    url.searchParams.set('gl', 'cn');
    url.searchParams.set('num', String(maxResults));

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(SEARCH_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as {
      organic_results?: { title: string; snippet: string; link: string; position: number }[];
    };
    const now = new Date().toISOString();
    return (data.organic_results ?? []).map((r) => ({
      source: 'serpapi',
      query,
      title: r.title,
      snippet: r.snippet ?? '',
      url: r.link,
      rank: r.position,
      fetchedAt: now,
    }));
  }
}

// ==================== Bing Search 实现 ====================

export class BingSearchProvider implements SearchProvider {
  readonly name = 'bing';
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.bing.microsoft.com',
  ) {}

  async search(query: string, maxResults: number): Promise<TrendsRawResult[]> {
    const url = new URL('/v7.0/search', this.baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(maxResults));
    url.searchParams.set('mkt', 'zh-CN');

    const res = await fetch(url.toString(), {
      headers: { 'Ocp-Apim-Subscription-Key': this.apiKey },
      signal: AbortSignal.timeout(SEARCH_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Bing ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as {
      webPages?: { value?: { name: string; snippet: string; url: string }[] };
    };
    const now = new Date().toISOString();
    return (data.webPages?.value ?? []).map((r, i) => ({
      source: 'bing',
      query,
      title: r.name,
      snippet: r.snippet ?? '',
      url: r.url,
      rank: i + 1,
      fetchedAt: now,
    }));
  }
}

// ==================== Tavily 实现 ====================

export class TavilySearchProvider implements SearchProvider {
  readonly name = 'tavily';
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.tavily.com',
  ) {}

  async search(query: string, maxResults: number): Promise<TrendsRawResult[]> {
    const res = await fetch(new URL('/search', this.baseUrl).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: false,
      }),
      signal: AbortSignal.timeout(SEARCH_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Tavily ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as {
      results?: { title: string; content: string; url: string }[];
    };
    const now = new Date().toISOString();
    return (data.results ?? []).map((r, i) => ({
      source: 'tavily',
      query,
      title: r.title,
      snippet: r.content ?? '',
      url: r.url,
      rank: i + 1,
      fetchedAt: now,
    }));
  }
}

// ==================== Agent Reach 实现 ====================

export class AgentReachProvider implements SearchProvider {
  readonly name = 'agent-reach';

  async search(query: string, maxResults: number): Promise<TrendsRawResult[]> {
    // 命令注入防护：禁止任何 shell 元字符进入命令拼接
    if (SHELL_UNSAFE_QUERY.test(query)) {
      throw new Error('搜索查询包含不允许的字符，已拒绝执行');
    }
    try {
      // 使用 Exa 搜索（通过 mcporter）
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // 转义查询字符串中的双引号
      const escapedQuery = query.replace(/"/g, '\\"');
      // 构建 mcporter 命令，使用位置参数避免 shell 转义问题
      const command = `mcporter call exa.web_search_exa query="${escapedQuery}" num_results=${maxResults}`;

      const { stdout } = await execAsync(command, {
        timeout: SEARCH_REQUEST_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        // 确保在项目根目录执行，以便 mcporter 能找到配置文件
        cwd: process.cwd(),
      });

      // 解析 mcporter 输出
      const results = this.parseExaResults(stdout, query);
      log.info(`Agent Reach (Exa) 搜索完成: ${results.length} 条结果`);
      return results;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error(`Agent Reach 搜索失败 [${query}]: ${msg}`);
      throw new Error(`Agent Reach search failed: ${msg}`);
    }
  }

  private parseExaResults(output: string, query: string): TrendsRawResult[] {
    const now = new Date().toISOString();
    const results: TrendsRawResult[] = [];

    try {
      // mcporter 输出格式：
      // Title: xxx
      // Author: xxx (可选)
      // Published Date: xxx (可选)
      // URL: xxx
      // Text: xxx
      // (空行分隔)

      const blocks = output.split(/\n\n+/);
      let rank = 1;

      for (const block of blocks) {
        const lines = block.trim().split('\n');
        let title = '';
        let url = '';
        let text = '';

        for (const line of lines) {
          if (line.startsWith('Title: ')) {
            title = line.substring(7).trim();
          } else if (line.startsWith('URL: ')) {
            url = line.substring(5).trim();
          } else if (line.startsWith('Text: ')) {
            text = line.substring(6).trim();
          }
        }

        if (title && url) {
          results.push({
            source: 'agent-reach',
            query,
            title,
            snippet: text || '',
            url,
            rank: rank++,
            fetchedAt: now,
          });
        }
      }

      return results;
    } catch (error) {
      log.warn(`解析 Exa 结果失败: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}

// ==================== 空实现（未配置时降级） ====================

export class NoopSearchProvider implements SearchProvider {
  readonly name = 'none';
  async search(): Promise<TrendsRawResult[]> {
    return [];
  }
}

// ==================== 工厂函数 ====================

export function createSearchProvider(config: TrendsConfig): SearchProvider {
  const { searchProvider, searchApiKey, searchApiBaseUrl } = config;
  switch (searchProvider) {
    case 'serpapi':
      return new SerpApiSearchProvider(searchApiKey, searchApiBaseUrl || undefined);
    case 'bing':
      return new BingSearchProvider(searchApiKey, searchApiBaseUrl || undefined);
    case 'tavily':
      return new TavilySearchProvider(searchApiKey, searchApiBaseUrl || undefined);
    case 'direct':
      return new DirectScraperProvider(
        (config.directSources ?? DEFAULT_DIRECT_SOURCES) as DirectSource[],
      );
    case 'agent-reach':
      return new AgentReachProvider();
    default:
      return new NoopSearchProvider();
  }
}

// ==================== 主抓取器 ====================

export class TrendsFetcher {
  constructor(private readonly provider: SearchProvider) {}

  async fetch(config: TrendsConfig): Promise<TrendsFetchResult> {
    // 直接抓取模式：跳过查询循环，直接并行抓取所有源
    if (this.provider instanceof DirectScraperProvider) {
      return this.provider.fetchAll();
    }

    const queries = this.buildQueries(config);
    const results: TrendsRawResult[] = [];
    const errors: string[] = [];
    let queriesExecuted = 0;
    let queriesFailed = 0;

    // 分批并发执行（SEARCH_CONCURRENCY 为并发数）
    for (let i = 0; i < queries.length; i += SEARCH_CONCURRENCY) {
      const batch = queries.slice(i, i + SEARCH_CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((q) => this.provider.search(q, MAX_RESULTS_PER_QUERY)),
      );

      for (let j = 0; j < batchResults.length; j++) {
        queriesExecuted++;
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(...result.value);
        } else {
          queriesFailed++;
          const msg = `查询失败 [${batch[j]}]: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`;
          errors.push(msg);
          log.warn(msg);
        }
      }
    }

    // 按 URL 去重
    const seen = new Set<string>();
    const deduped = results.filter((r) => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    log.info(`抓取完成: ${deduped.length} 条结果 (${queriesExecuted} 查询, ${queriesFailed} 失败)`);

    return {
      results: deduped,
      fetchedAt: new Date().toISOString(),
      queriesExecuted,
      queriesFailed,
      errors,
    };
  }

  /** 构建搜索查询列表 */
  private buildQueries(config: TrendsConfig): string[] {
    const year = new Date().getFullYear().toString();
    const queries: string[] = [];

    // 按启用平台添加默认查询
    for (const platform of config.platforms) {
      const templates = DEFAULT_SEARCH_QUERIES[platform];
      if (templates) {
        queries.push(...templates.map((t) => t.replace('{year}', year)));
      }
    }

    // 总是添加综合查询
    const generalTemplates = DEFAULT_SEARCH_QUERIES.general ?? [];
    queries.push(...generalTemplates.map((t) => t.replace('{year}', year)));

    // 添加用户自定义查询
    if (config.customQueries.length > 0) {
      queries.push(...config.customQueries.map((q) => q.replace('{year}', year)));
    }

    return queries;
  }
}
