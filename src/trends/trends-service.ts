import type { ModelClient } from '../models/types.js';
import type {
  TrendsConfig,
  TrendsFetchResult,
  TrendsHistoryEntry,
  TrendsSnapshot,
  TrendsSourceHighlight,
  TrendsStatistics,
  TrendsPlatform,
} from './trends-types.js';
import { computeTrendsStatistics } from './trends-statistics.js';
import { TrendsStore } from './trends-store.js';
import { TrendsFetcher, createSearchProvider } from './trends-fetcher.js';
import { TrendsAnalyzer } from './trends-analyzer.js';
import { MIN_REFRESH_INTERVAL_MS } from './trends-constants.js';
import { createLogger } from '../utils/logger.js';
import { runWithAiUsageContextAsync } from '../ai/usage-context.js';

const log = createLogger('trends-service');

const PLATFORM_HINTS: Array<{ platform: TrendsPlatform; keywords: string[] }> = [
  { platform: 'qidian', keywords: ['起点'] },
  { platform: 'fanqie', keywords: ['番茄'] },
  { platform: 'jjwxc', keywords: ['晋江'] },
  { platform: 'qimao', keywords: ['七猫'] },
  { platform: 'zongheng', keywords: ['纵横'] },
];

function inferPlatformHints(text: string): TrendsPlatform[] {
  const matched = PLATFORM_HINTS
    .filter((item) => item.keywords.some((keyword) => text.includes(keyword)))
    .map((item) => item.platform);
  return matched.length > 0 ? matched : ['other'];
}

function inferSignalType(text: string): TrendsSourceHighlight['signalType'] {
  if (/(福利|扶持|公告|征文|签约|奖励|计划)/.test(text)) {
    return 'policy';
  }
  if (/(报告|月活|市场|用户|行业|规模)/.test(text)) {
    return 'market';
  }
  return 'trend';
}

function buildSourceHighlights(fetchResult: TrendsFetchResult): TrendsSourceHighlight[] {
  return fetchResult.results
    .slice()
    .sort((left, right) => {
      const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER;
      const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank;
    })
    .slice(0, 36)
    .map((item) => {
      const text = `${item.query} ${item.title} ${item.snippet}`;
      return {
        source: item.source,
        query: item.query,
        title: item.title,
        snippet: item.snippet,
        url: item.url,
        rank: item.rank,
        fetchedAt: item.fetchedAt,
        platformHints: inferPlatformHints(text),
        signalType: inferSignalType(text),
      };
    });
}

/**
 * 趋势分析服务 — 编排 fetch → analyze → save 全流程
 */
export class TrendsService {
  private readonly store: TrendsStore;
  private readonly analyzer: TrendsAnalyzer;
  private lastRefreshAt = 0;
  private refreshing = false;

  constructor(
    dataDir: string,
    private readonly modelClient: ModelClient,
  ) {
    this.store = new TrendsStore(dataDir);
    this.analyzer = new TrendsAnalyzer();
  }

  /** 完整刷新：fetch → analyze → save */
  async refresh(): Promise<TrendsSnapshot> {
    if (this.refreshing) {
      throw new Error('趋势分析正在进行中，请稍候');
    }
    const elapsed = Date.now() - this.lastRefreshAt;
    if (this.lastRefreshAt > 0 && elapsed < MIN_REFRESH_INTERVAL_MS) {
      const waitMin = Math.ceil((MIN_REFRESH_INTERVAL_MS - elapsed) / 60_000);
      throw new Error(`请求过于频繁，请 ${waitMin} 分钟后再试`);
    }

    this.refreshing = true;
    try {
      const config = await this.store.getConfig();

      // 1. 抓取
      const provider = createSearchProvider(config);
      const fetcher = new TrendsFetcher(provider);
      const fetchResult = await fetcher.fetch(config);
      log.info(`抓取完成: ${fetchResult.results.length} 条结果`);

      // 2. AI 分析
      const analysis = await runWithAiUsageContextAsync({
        scope: 'system',
        operationKey: 'system.trends.analyze',
        operationLabel: '趋势分析',
        operationRegistered: true,
      }, async () => this.analyzer.analyze(
        fetchResult.results,
        this.modelClient,
      ));
      log.info(`分析完成: ${analysis.recommendations.length} 条推荐`);

      // 3. 保存快照
      const snapshot: TrendsSnapshot = {
        analysis,
        fetchResult: {
          fetchedAt: fetchResult.fetchedAt,
          queriesExecuted: fetchResult.queriesExecuted,
          queriesFailed: fetchResult.queriesFailed,
        },
        sourceHighlights: buildSourceHighlights(fetchResult),
      };
      await this.store.saveSnapshot(snapshot);

      this.lastRefreshAt = Date.now();
      return snapshot;
    } finally {
      this.refreshing = false;
    }
  }

  get isRefreshing(): boolean {
    return this.refreshing;
  }

  // ==================== 委托给 store ====================

  async getLatest(): Promise<TrendsSnapshot | null> {
    return this.store.getLatest();
  }

  async listHistory(): Promise<TrendsHistoryEntry[]> {
    return this.store.listHistory();
  }

  async getHistorySnapshot(date: string): Promise<TrendsSnapshot | null> {
    return this.store.getHistorySnapshot(date);
  }

  async getStatistics(): Promise<TrendsStatistics> {
    const snapshots = await this.store.getAllSnapshots();
    return computeTrendsStatistics(snapshots);
  }

  async getConfig(): Promise<TrendsConfig> {
    return this.store.getConfig();
  }

  async saveConfig(config: TrendsConfig): Promise<void> {
    return this.store.saveConfig(config);
  }
}
