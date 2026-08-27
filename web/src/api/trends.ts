import { http, AI_TIMEOUT } from './http';

// ==================== 类型定义 ====================

export type TrendsGenreRanking = {
  genre: string;
  rank: number;
  trend: 'rising' | 'stable' | 'declining';
  description: string;
};

export type TrendsThemeItem = {
  theme: string;
  popularity: number;
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
  confidenceLevel: 'high' | 'medium' | 'low';
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
  analysisTokens: { input: number; output: number };
  /** 解析失败时保留的原始 AI 响应（前 2000 字符），便于诊断 */
  rawResponseOnFailure?: string;
  /** 解析是否失败 */
  parseFailed?: boolean;
};

export type TrendsSnapshot = {
  analysis: TrendsAnalysis;
  fetchResult: {
    fetchedAt: string;
    queriesExecuted: number;
    queriesFailed: number;
  };
};

export type TrendsHistoryEntry = {
  date: string;
  analyzedAt: string;
  hotGenres: string[];
  recommendationCount: number;
};

// ── 统计（跨快照聚合） ──

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

export type TrendsConfig = {
  enabled: boolean;
  scheduleHour: number;
  scheduleMinute: number;
  searchProvider: string;
  searchApiKey: string;
  searchApiBaseUrl: string;
  customQueries: string[];
  platforms: string[];
  directSources: string[];
};

// ==================== API 函数 ====================

export async function fetchTrendsLatest(): Promise<TrendsSnapshot | null> {
  const { data } = await http.get<TrendsSnapshot | { analysis: null }>('/trends/latest');
  if (!data.analysis) return null;
  return data as TrendsSnapshot;
}

export async function refreshTrends(): Promise<TrendsSnapshot> {
  const { data } = await http.post<TrendsSnapshot>(
    '/trends/refresh',
    {},
    { timeout: AI_TIMEOUT },
  );
  return data;
}

export async function fetchTrendsHistory(): Promise<TrendsHistoryEntry[]> {
  const { data } = await http.get<{ snapshots: TrendsHistoryEntry[] }>('/trends/history');
  return data.snapshots;
}

export async function fetchTrendsHistorySnapshot(date: string): Promise<TrendsSnapshot> {
  const { data } = await http.get<TrendsSnapshot>(`/trends/history/${date}`);
  return data;
}

export async function fetchTrendsConfig(): Promise<TrendsConfig> {
  const { data } = await http.get<TrendsConfig>('/trends/config');
  return data;
}

export async function saveTrendsConfig(config: TrendsConfig): Promise<TrendsConfig> {
  const { data } = await http.put<TrendsConfig>('/trends/config', config);
  return data;
}

export async function fetchTrendsStatistics(): Promise<TrendsStatistics> {
  const { data } = await http.get<TrendsStatistics>('/trends/statistics');
  return data;
}

