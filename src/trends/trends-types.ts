import { z } from 'zod';

// ==================== 平台定义 ====================

export const TrendsPlatformEnum = z.enum([
  'qidian',   // 起点中文网
  'fanqie',   // 番茄小说
  'jjwxc',    // 晋江文学城
  'qimao',    // 七猫小说
  'zongheng', // 纵横中文网
  'other',    // 其他/综合
]);
export type TrendsPlatform = z.infer<typeof TrendsPlatformEnum>;

export const TrendDirectionEnum = z.enum(['rising', 'stable', 'declining']);
export type TrendDirection = z.infer<typeof TrendDirectionEnum>;

export const ConfidenceLevelEnum = z.enum(['high', 'medium', 'low']);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelEnum>;

// ==================== 原始抓取结果 ====================

export type TrendsRawResult = {
  source: string;
  query: string;
  title: string;
  snippet: string;
  url: string;
  rank?: number;
  fetchedAt: string;
};

export type TrendsFetchResult = {
  results: TrendsRawResult[];
  fetchedAt: string;
  queriesExecuted: number;
  queriesFailed: number;
  errors: string[];
};

// ==================== AI 分析结果 ====================

export type TrendsGenreRanking = {
  genre: string;
  rank: number;
  trend: TrendDirection;
  description: string;
};

export type TrendsThemeItem = {
  theme: string;
  popularity: number;  // 1-10
  examples: string[];
};

export type TrendsPlatformAnalysis = {
  platform: string;
  platformName: string;
  topGenres: TrendsGenreRanking[];
  topThemes: TrendsThemeItem[];
  keyInsight: string;
};

export type TrendsOverallSummary = {
  hotGenres: string[];
  emergingThemes: string[];
  decliningThemes: string[];
  crossPlatformTrends: string[];
  marketInsight: string;
};

export type TrendsRecommendation = {
  title: string;
  genre: string;
  themes: string[];
  reasoning: string;
  targetPlatform: string;
  confidenceLevel: ConfidenceLevel;
  storyHook: string;
};

export type TrendsAnalysis = {
  id: string;
  analyzedAt: string;
  platforms: TrendsPlatformAnalysis[];
  overallTrends: TrendsOverallSummary;
  recommendations: TrendsRecommendation[];
  rawResultCount: number;
  modelUsed: string;
  analysisTokens: {
    input: number;
    output: number;
  };
  /** 解析失败时保留的原始 AI 响应（前 2000 字符），便于诊断 */
  rawResponseOnFailure?: string;
  /** 解析是否失败 */
  parseFailed?: boolean;
};

// ==================== 快照存储 ====================

export type TrendsSnapshot = {
  analysis: TrendsAnalysis;
  fetchResult: {
    fetchedAt: string;
    queriesExecuted: number;
    queriesFailed: number;
  };
  sourceHighlights?: TrendsSourceHighlight[];
};

export type TrendsSourceHighlight = {
  source: string;
  query: string;
  title: string;
  snippet: string;
  url: string;
  rank?: number;
  fetchedAt: string;
  platformHints: TrendsPlatform[];
  signalType: 'trend' | 'policy' | 'market';
};

export type TrendsHistoryEntry = {
  date: string;
  analyzedAt: string;
  hotGenres: string[];
  recommendationCount: number;
};

// ==================== 统计（跨快照聚合） ====================

export type TrendsGenreFrequency = {
  genre: string;
  count: number;
  avgRank: number;
  lastSeen: string;
  platforms: string[];
};

export type TrendsThemeFrequency = {
  theme: string;
  count: number;
  avgPopularity: number;
  platforms: string[];
};

export type TrendsPlatformStat = {
  platform: string;
  platformName: string;
  reportCount: number;
  avgGenreCount: number;
  topGenre: string;
};

export type TrendsTimelineEntry = {
  date: string;
  hotGenres: string[];
  emergingThemes: string[];
  decliningThemes: string[];
  platformCount: number;
  recommendationCount: number;
};

export type TrendsStatistics = {
  totalReports: number;
  dateRange: { from: string; to: string } | null;
  genreRanking: TrendsGenreFrequency[];
  themeRanking: TrendsThemeFrequency[];
  platformStats: TrendsPlatformStat[];
  recommendationStats: {
    totalCount: number;
    genreDistribution: { genre: string; count: number }[];
    confidenceDistribution: { level: string; count: number }[];
  };
  timeline: TrendsTimelineEntry[];
};

// ==================== 配置 ====================

export const SearchProviderEnum = z.enum(['serpapi', 'bing', 'tavily', 'direct', 'agent-reach', 'none']);
export type SearchProviderType = z.infer<typeof SearchProviderEnum>;

export const TrendsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  scheduleHour: z.number().int().min(0).max(23).default(8),
  scheduleMinute: z.number().int().min(0).max(59).default(0),
  searchProvider: SearchProviderEnum.default('none'),
  searchApiKey: z.string().default(''),
  searchApiBaseUrl: z.string().default(''),
  customQueries: z.array(z.string()).default([]),
  platforms: z.array(TrendsPlatformEnum).default(['qidian', 'fanqie', 'jjwxc', 'qimao']),
  directSources: z.array(z.string()).default(['weibo', '36kr', 'zhihu', 'baidu']),
});
export type TrendsConfig = z.infer<typeof TrendsConfigSchema>;
