export type WechatArticleProjectStatus =
  | 'planning'
  | 'drafting'
  | 'reviewing'
  | 'approved'
  | 'published';

export type WechatArticleReviewDimensionId =
  | 'title_attraction'
  | 'structure_stability'
  | 'data_credibility'
  | 'reader_value'
  | 'length_fitness';

export type WechatArticleReviewDimension = {
  id: WechatArticleReviewDimensionId;
  label: string;
  score: number;
  verdict: string;
  fixes: string[];
};

export type WechatArticleReviewReport = {
  overallScore: number;
  pass: boolean;
  threshold: number;
  summary: string;
  nextAction: string;
  reviewedAt: string;
  dimensions: WechatArticleReviewDimension[];
};

export type WechatArticleTopicHeatLevel = 'hot' | 'warm' | 'steady';

export type WechatArticleTopicIdea = {
  id: string;
  title: string;
  heatLevel: WechatArticleTopicHeatLevel;
  heatScore: number;
  angle: string;
  whyNow: string;
  targetAudience: string;
  articleType: string;
  corePromise: string;
  sourceNotes: string;
  targetWords: number;
};

export type WechatArticleProject = {
  id: string;
  title: string;
  targetAudience: string;
  articleType: string;
  corePromise: string;
  sourceNotes: string;
  targetWords: number;
  status: WechatArticleProjectStatus;
  latestScore: number | null;
  latestDraft: string;
  latestTitleOptions: string[];
  latestReview: WechatArticleReviewReport | null;
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateWechatArticleProjectInput = {
  title: string;
  targetAudience: string;
  articleType: string;
  corePromise: string;
  sourceNotes?: string;
  targetWords: number;
};
