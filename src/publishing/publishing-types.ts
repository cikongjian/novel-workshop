import { z } from 'zod';
import type { NovelGenre } from '../novel/types.js';

export const PublishingPlatformEnum = z.enum(['fanqie', 'qimao', 'qidian', 'jjwxc', 'zongheng']);
export type PublishingPlatform = z.infer<typeof PublishingPlatformEnum>;

export const RecommendationConfidenceEnum = z.enum(['high', 'medium', 'low']);
export type RecommendationConfidence = z.infer<typeof RecommendationConfidenceEnum>;

export const PublishingAudienceEnum = z.enum(['male', 'female', 'general']);
export type PublishingAudience = z.infer<typeof PublishingAudienceEnum>;

export const PublishingPaceEnum = z.enum(['fast', 'medium', 'slow']);
export type PublishingPace = z.infer<typeof PublishingPaceEnum>;

export const DraftPublishingRecommendationBodySchema = z.object({
  title: z.string().max(80).optional(),
  genre: z.enum(['fantasy', 'mystery', 'modern', 'scifi', 'historical', 'romance', 'custom']),
  synopsis: z.string().max(4000).optional(),
  targetChapters: z.number().int().positive().max(5000).optional(),
  chapterCount: z.number().int().min(0).max(5000).optional(),
});

export type DraftPublishingRecommendationBody = z.infer<typeof DraftPublishingRecommendationBodySchema>;

export type PublishingTrackedSource = {
  title: string;
  url: string;
};

export type PublishingSourceHighlight = {
  title: string;
  url: string;
  query: string;
  snippet: string;
  signalType: 'trend' | 'policy' | 'market';
  fetchedAt: string;
};

export type PublishingNovelSignals = {
  genre: NovelGenre;
  audience: PublishingAudience;
  pace: PublishingPace;
  chapterCount: number;
  targetChapters?: number;
  tags: string[];
};

export type PublishingPortfolioProfile = {
  sampleCount: number;
  dominantGenres: NovelGenre[];
  dominantAudience: PublishingAudience;
  dominantPace: PublishingPace;
  dominantTags: string[];
};

export type PublishingPlatformIntel = {
  platform: PublishingPlatform;
  platformName: string;
  summary: string;
  topGenres: string[];
  topThemes: string[];
  bestFor: string[];
  caution: string;
  trafficScore: number;
  newcomerSupportScore: number;
  longformScore: number;
  commercialScore: number;
  sourceHighlights: PublishingSourceHighlight[];
  trackedSources: PublishingTrackedSource[];
};

export type PublishingPlatformScore = {
  platform: PublishingPlatform;
  platformName: string;
  totalScore: number;
  baseScore: number;
  portfolioBoost: number;
  trendBoost: number;
  policyBoost: number;
  fitTags: string[];
};

export type PublishingRecommendation = {
  primaryPlatform: PublishingPlatform;
  primaryPlatformName: string;
  confidence: RecommendationConfidence;
  reasons: string[];
  risks: string[];
  matchedSignals: string[];
  scoreBreakdown: PublishingPlatformScore[];
  basedOnSnapshotAt: string | null;
  usingFallback: boolean;
};

export type PublishingActionGuide = {
  submissionChecklist: string[];
  openingTips: string[];
  packagingTips: string[];
};

export type PublishingCopyVariant = {
  platform: PublishingPlatform;
  platformName: string;
  titleDirection: string;
  titleSuggestions: string[];
  shortSynopsis: string;
  longSynopsis: string;
  keywords: string[];
};

export type PublishingOverview = {
  updatedAt: string | null;
  usingFallback: boolean;
  platforms: PublishingPlatformIntel[];
};

export type PublishingRecommendationResponse = {
  overview: PublishingOverview;
  signals: PublishingNovelSignals;
  portfolio: PublishingPortfolioProfile | null;
  recommendation: PublishingRecommendation;
  actionGuide: PublishingActionGuide;
  copyVariants: PublishingCopyVariant[];
};
