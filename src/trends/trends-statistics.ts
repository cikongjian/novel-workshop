import type {
  TrendsSnapshot,
  TrendsStatistics,
  TrendsGenreFrequency,
  TrendsThemeFrequency,
  TrendsPlatformStat,
  TrendsTimelineEntry,
} from './trends-types.js';

type GenreAccum = { count: number; rankSum: number; lastSeen: string; platforms: Set<string> };
type ThemeAccum = { count: number; popSum: number; platforms: Set<string> };
type PlatformAccum = { name: string; count: number; genreCounts: number[]; genres: Map<string, number> };

/**
 * 根据所有历史快照，计算跨日期聚合统计。
 * 纯函数，不产生副作用。
 */
export function computeTrendsStatistics(snapshots: TrendsSnapshot[]): TrendsStatistics {
  if (snapshots.length === 0) {
    return emptyStatistics();
  }

  const sorted = [...snapshots].sort((a, b) =>
    a.analysis.analyzedAt.localeCompare(b.analysis.analyzedAt),
  );

  const genreMap = new Map<string, GenreAccum>();
  const themeMap = new Map<string, ThemeAccum>();
  const platformMap = new Map<string, PlatformAccum>();
  const recGenreMap = new Map<string, number>();
  const confMap = new Map<string, number>();
  let totalRecs = 0;
  const timeline: TrendsTimelineEntry[] = [];

  for (const { analysis } of sorted) {
    const date = analysis.analyzedAt.slice(0, 10);

    timeline.push({
      date,
      hotGenres: analysis.overallTrends.hotGenres,
      emergingThemes: analysis.overallTrends.emergingThemes,
      decliningThemes: analysis.overallTrends.decliningThemes,
      platformCount: analysis.platforms.length,
      recommendationCount: analysis.recommendations.length,
    });

    for (const platform of analysis.platforms) {
      accumulatePlatform(platformMap, platform, genreMap, themeMap, date);
    }

    for (const rec of analysis.recommendations) {
      totalRecs++;
      recGenreMap.set(rec.genre, (recGenreMap.get(rec.genre) ?? 0) + 1);
      confMap.set(rec.confidenceLevel, (confMap.get(rec.confidenceLevel) ?? 0) + 1);
    }
  }

  const dates = sorted.map((s) => s.analysis.analyzedAt.slice(0, 10));

  return {
    totalReports: sorted.length,
    dateRange: { from: dates[0], to: dates[dates.length - 1] },
    genreRanking: buildGenreRanking(genreMap),
    themeRanking: buildThemeRanking(themeMap),
    platformStats: buildPlatformStats(platformMap),
    recommendationStats: {
      totalCount: totalRecs,
      genreDistribution: mapToSortedArray(recGenreMap, 'genre'),
      confidenceDistribution: mapToSortedArray(confMap, 'level'),
    },
    timeline,
  };
}

// ── helpers ──

function accumulatePlatform(
  platformMap: Map<string, PlatformAccum>,
  platform: { platform: string; platformName: string; topGenres: { genre: string; rank: number }[]; topThemes: { theme: string; popularity: number }[] },
  genreMap: Map<string, GenreAccum>,
  themeMap: Map<string, ThemeAccum>,
  date: string,
): void {
  const ps: PlatformAccum = platformMap.get(platform.platform) ?? {
    name: platform.platformName,
    count: 0,
    genreCounts: [],
    genres: new Map(),
  };
  ps.count++;
  ps.genreCounts.push(platform.topGenres.length);

  for (const g of platform.topGenres) {
    const ge = genreMap.get(g.genre) ?? { count: 0, rankSum: 0, lastSeen: '', platforms: new Set() };
    ge.count++;
    ge.rankSum += g.rank;
    ge.lastSeen = date;
    ge.platforms.add(platform.platform);
    genreMap.set(g.genre, ge);
    ps.genres.set(g.genre, (ps.genres.get(g.genre) ?? 0) + 1);
  }

  for (const t of platform.topThemes) {
    const te = themeMap.get(t.theme) ?? { count: 0, popSum: 0, platforms: new Set() };
    te.count++;
    te.popSum += t.popularity;
    te.platforms.add(platform.platform);
    themeMap.set(t.theme, te);
  }

  platformMap.set(platform.platform, ps);
}

function buildGenreRanking(map: Map<string, GenreAccum>): TrendsGenreFrequency[] {
  return [...map.entries()]
    .map(([genre, d]) => ({
      genre,
      count: d.count,
      avgRank: Math.round((d.rankSum / d.count) * 10) / 10,
      lastSeen: d.lastSeen,
      platforms: [...d.platforms],
    }))
    .sort((a, b) => b.count - a.count);
}

function buildThemeRanking(map: Map<string, ThemeAccum>): TrendsThemeFrequency[] {
  return [...map.entries()]
    .map(([theme, d]) => ({
      theme,
      count: d.count,
      avgPopularity: Math.round((d.popSum / d.count) * 10) / 10,
      platforms: [...d.platforms],
    }))
    .sort((a, b) => b.count - a.count);
}

function buildPlatformStats(map: Map<string, PlatformAccum>): TrendsPlatformStat[] {
  return [...map.entries()]
    .map(([platform, d]) => {
      const topGenre = [...d.genres.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      const avgGC = d.genreCounts.reduce((a, b) => a + b, 0) / d.genreCounts.length;
      return {
        platform,
        platformName: d.name,
        reportCount: d.count,
        avgGenreCount: Math.round(avgGC * 10) / 10,
        topGenre,
      };
    })
    .sort((a, b) => b.reportCount - a.reportCount);
}

function mapToSortedArray<K extends string>(
  map: Map<string, number>,
  keyName: K,
): ({ count: number } & Record<K, string>)[] {
  return [...map.entries()]
    .map(([key, count]) => ({ [keyName]: key, count }) as { count: number } & Record<K, string>)
    .sort((a, b) => b.count - a.count);
}

function emptyStatistics(): TrendsStatistics {
  return {
    totalReports: 0,
    dateRange: null,
    genreRanking: [],
    themeRanking: [],
    platformStats: [],
    recommendationStats: { totalCount: 0, genreDistribution: [], confidenceDistribution: [] },
    timeline: [],
  };
}
