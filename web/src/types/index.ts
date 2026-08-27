// ==================== 小说宪章 ====================

export type ConstitutionClauseCategory =
  | 'core-promise'
  | 'payoff-rhythm'
  | 'scene-mandate'
  | 'anti-drift'
  | 'tone-guide'
  | 'pacing-rule';

export interface ConstitutionClause {
  id: string;
  category: ConstitutionClauseCategory;
  title: string;
  content: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  userEdited: boolean;
}

export interface ConstitutionKeywords {
  payoffKeywords: string[];
  sceneKeywords: string[];
  suspenseDriftKeywords: string[];
  maxSuspenseShare: number;
}

export interface NovelConstitution {
  version: number;
  sourceDigest: string;
  mainPromise: string;
  secondaryPromises: string[];
  clauses: ConstitutionClause[];
  keywords: ConstitutionKeywords;
  generatedAt: string;
  updatedAt: string;
}

export type ConstitutionVersionSource =
  | 'generate'
  | 'manual-save'
  | 'auto-bootstrap'
  | 'kickstart'
  | 'rollback';

export interface ConstitutionVersion {
  version: number;
  source: ConstitutionVersionSource;
  constitution: NovelConstitution;
  createdAt: string;
}

export interface ConstitutionVersionHistory {
  novelId: string;
  versions: ConstitutionVersion[];
  maxVersions: number;
}

// ==================== 小说元数据 ====================

export type NovelGenre = 'fantasy' | 'mystery' | 'modern' | 'scifi' | 'historical' | 'romance' | 'custom';
export type NovelStatus = 'planning' | 'writing' | 'paused' | 'completed' | 'published';
export type StartupPlatformProfile = 'auto' | 'fanqie' | 'qidian';

export interface NovelMetadata {
  id: string;
  syncId?: string;
  title: string;
  genre: NovelGenre;
  status: NovelStatus;
  synopsis: string;
  description: string;
  edgeNarratorVoice?: string;
  coverImage?: string;
  targetChapters?: number;
  titleGuidance?: boolean;
  startupPlatformProfile?: StartupPlatformProfile;
  chapterCount?: number;
  finalizedChapterCount?: number;
  wordCount?: number;
  modelConfig?: {
    provider: 'anthropic' | 'openai' | 'custom-openai' | 'ollama' | 'deepseek' | 'qwen' | 'zhipu'
      | 'moonshot' | 'doubao' | 'baichuan' | 'stepfun' | 'minimax' | 'siliconflow';
    source?: 'platform' | 'user-profile';
    userApiProfileId?: string;
    userApiProfileStorageMode?: 'server' | 'local';
    userApiProfileName?: string;
    apiKey: string;
    model: string;
    baseUrl: string;
    temperature: number;
  };
  embeddingConfig?: {
    provider: 'openai' | 'ollama' | 'qwen' | 'zhipu' | 'siliconflow';
    apiKey: string;
    model: string;
    baseUrl: string;
  };
  /** 爽文蓝图（由 /api/shuangwen/apply 或 /create 写入） */
  shuangwenBlueprint?: unknown;
  /** 用户自定义分类标签 */
  tags?: string[];
  /** 题材宪章标签（强约束） */
  constitutionTags?: string[];
  /** 小说宪章 */
  constitution?: NovelConstitution;
  /** AI 书名 & 简介推荐历史 */
  titleRecommendations?: TitleRecommendation[];
  /** 营销包装生成历史 */
  marketingPackages?: MarketingPackage[];
  ownerId?: string;
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 书名推荐 ====================

export type TitleRecommendationPlatform = 'qidian' | 'fanqie' | 'general';

export interface TitleRecommendationTitle {
  title: string;
  reasoning: string;
}

export interface TitleRecommendation {
  id: string;
  platform: TitleRecommendationPlatform;
  titles: TitleRecommendationTitle[];
  shortSynopsis: string;
  longSynopsis: string;
  tags: string[];
  marketingInsight: string;
  createdAt: string;
}

// ==================== 营销包装 ====================

export interface MarketingCharacterCard {
  name: string;
  tagline: string;
  description: string;
}

export interface MarketingPackage {
  id: string;
  titles: string[];
  oneLiner: string;
  shortSynopsis: string;
  longSynopsis: string;
  characterCards: MarketingCharacterCard[];
  socialPosts: string[];
  raw: string;
  createdAt: string;
}

// ==================== 上架平台推荐 ====================

export type PublishingPlatform = 'fanqie' | 'qimao' | 'qidian' | 'jjwxc' | 'zongheng';
export type PublishingAudience = 'male' | 'female' | 'general';
export type PublishingPace = 'fast' | 'medium' | 'slow';
export type PublishingConfidence = 'high' | 'medium' | 'low';

export interface PublishingTrackedSource {
  title: string;
  url: string;
}

export interface PublishingSourceHighlight {
  title: string;
  url: string;
  query: string;
  snippet: string;
  signalType: 'trend' | 'policy' | 'market';
  fetchedAt: string;
}

export interface PublishingNovelSignals {
  genre: NovelGenre;
  audience: PublishingAudience;
  pace: PublishingPace;
  chapterCount: number;
  targetChapters?: number;
  tags: string[];
}

export interface PublishingPlatformIntel {
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
}

export interface PublishingPlatformScore {
  platform: PublishingPlatform;
  platformName: string;
  totalScore: number;
  baseScore: number;
  portfolioBoost: number;
  trendBoost: number;
  policyBoost: number;
  fitTags: string[];
}

export interface PublishingPortfolioProfile {
  sampleCount: number;
  dominantGenres: NovelGenre[];
  dominantAudience: PublishingAudience;
  dominantPace: PublishingPace;
  dominantTags: string[];
}

export interface PublishingRecommendation {
  primaryPlatform: PublishingPlatform;
  primaryPlatformName: string;
  confidence: PublishingConfidence;
  reasons: string[];
  risks: string[];
  matchedSignals: string[];
  scoreBreakdown: PublishingPlatformScore[];
  basedOnSnapshotAt: string | null;
  usingFallback: boolean;
}

export interface PublishingActionGuide {
  submissionChecklist: string[];
  openingTips: string[];
  packagingTips: string[];
}

export interface PublishingCopyVariant {
  platform: PublishingPlatform;
  platformName: string;
  titleDirection: string;
  titleSuggestions: string[];
  shortSynopsis: string;
  longSynopsis: string;
  keywords: string[];
}

export interface PublishingOverview {
  updatedAt: string | null;
  usingFallback: boolean;
  platforms: PublishingPlatformIntel[];
}

export interface PublishingRecommendationResponse {
  overview: PublishingOverview;
  signals: PublishingNovelSignals;
  portfolio: PublishingPortfolioProfile | null;
  recommendation: PublishingRecommendation;
  actionGuide: PublishingActionGuide;
  copyVariants: PublishingCopyVariant[];
}

// ==================== 世界观 ====================

export type WorldCategory = 'geography' | 'history' | 'faction' | 'power' | 'culture' | 'rule' | 'other';

export interface WorldEntry {
  id: string;
  category: WorldCategory;
  name: string;
  description: string;
  details: Record<string, string>;
  relatedEntries: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ==================== 角色 ====================

export const CHARACTER_ROLE_VALUES = [
  'protagonist',
  'deuteragonist',
  'antagonist',
  'rival',
  'love_interest',
  'mentor',
  'ally',
  'faction_leader',
  'supporting',
  'family',
  'comic_relief',
  'minor',
] as const;

export type CharacterRole = (typeof CHARACTER_ROLE_VALUES)[number];

export interface CharacterRelationship {
  targetId: string;
  type: string;
  description: string;
  /** 权力关系 */
  powerDynamic?: 'dominant' | 'equal' | 'submissive';
  /** 情感债务/恩怨 */
  emotionalDebt?: string;
  /** 共同经历/秘密 */
  sharedHistory?: string;
  /** 关系紧张度 0-100 */
  tensionLevel?: number;
  /** 表面关系 vs 真实关系 */
  publicVsPrivate?: string;
}

export type CharacterIdentityLabelCategory =
  | 'structural'
  | 'social'
  | 'relationship'
  | 'growth'
  | 'reader';

export interface CharacterIdentityLabel {
  key: string;
  label: string;
  category: CharacterIdentityLabelCategory;
  source: 'derived' | 'ai' | 'user';
  confidence: number;
  evidenceChapter?: number;
  userLocked?: boolean;
}

/** 角色性格 V2（对齐后端 CharacterPersonalityV2） */
export interface CharacterPersonalityV2 {
  traits: string[];
  innerContradictions: string[];
  moralBoundary: string[];
}

/** 角色语言 DNA（对齐后端 CharacterSpeechDNA） */
export interface CharacterSpeechDNA {
  lexicon: string[];
  tempo: 'slow' | 'mid' | 'fast';
  tone: string[];
  tics: string[];
}

/** 关系向量（对齐后端 RelationshipVector） */
export interface RelationshipVector {
  trust: number;
  affection: number;
  respect: number;
  obligation: number;
  fear: number;
  rivalry: number;
}

export interface CharacterProfile {
  id: string;
  name: string;
  aliases: string[];
  role: CharacterRole;
  /** 职位/头衔 */
  position?: string;
  age?: string;
  gender?: string;
  appearance: string;
  personality: string;
  personalityTraits: string[];
  speechStyle: string;
  speechExamples: string[];
  backstory: string;
  motivation: string;
  abilities: string[];
  relationships: CharacterRelationship[];
  arc: string;
  currentState: string;
  firstAppearance?: number;
  ttsVoice?: string;
  /** AI 音效师生成的声音描述指令（Qwen3-TTS VoiceDesign 用） */
  voiceInstruct?: string;
  /** 参考音频文件路径（相对于小说目录） */
  voiceRefAudioPath?: string;
  /** Python 服务端缓存的 voice clone prompt ID */
  voiceClonePromptId?: string;
  /** 序列化的 voice clone prompt 数据（Base64，持久化） */
  voiceClonePromptData?: string;
  /** 声音设计状态 */
  voiceDesignStatus?: 'none' | 'designed' | 'cloned';
  /** 角色立绘图片路径 */
  portraitImagePath?: string;
  /** 生成立绘时使用的提示词 */
  portraitPrompt?: string;
  /** 是否开启角色信箱（读者可给该角色写信） */
  mailboxEnabled?: boolean;
  /** 是否开启角色朋友圈（角色可发动态、互评） */
  momentsEnabled?: boolean;
  /** 公私面具 */
  persona?: CharacterPersona;
  /** 心理画像 */
  psychology?: CharacterPsychology;
  /** 社会身份 */
  socialIdentity?: CharacterSocialIdentity;
  /** 象征系统 */
  symbolism?: CharacterSymbolism;
  /** 成长轨迹 */
  growthTrack?: CharacterGrowthTrack;
  /** 自动投影的角色身份标签 */
  identityLabels?: CharacterIdentityLabel[];
  /** 性格模型 V2 */
  personalityModel?: CharacterPersonalityV2;
  /** 语言 DNA */
  speechDNA?: CharacterSpeechDNA;
  /** 读者友好状态摘要 */
  cardBlurb?: string;
  /** 角色状态 */
  status?: 'active' | 'dead' | 'exited';
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CharacterPersona {
  publicPersona: string;
  privatePersona: string;
  maskTrigger: string;
}

export interface CharacterPsychology {
  worldview: string;
  copingMechanisms: string[];
  emotionalTriggers: string[];
}

export interface CharacterSocialIdentity {
  faction: string;
  socialClass: string;
  reputation: string;
}

export interface CharacterSymbolism {
  symbolObject: string;
  recurringMotif: string;
  themeWord: string;
}

export interface CharacterGrowthMilestone {
  chapter: number;
  event: string;
  insight: string;
}

export interface CharacterGrowthTrack {
  milestones: CharacterGrowthMilestone[];
  archivedMilestonesSummary?: string;
  unresolvedTrauma: string[];
  pendingPromises: string[];
}

// ==================== 大纲/情节 ====================

export type PlotThreadStatus = 'planted' | 'developing' | 'climax' | 'resolved' | 'abandoned';

export interface PlotThread {
  id: string;
  name: string;
  description: string;
  status: PlotThreadStatus;
  plantedInChapter?: number;
  resolvedInChapter?: number;
  relatedCharacters: string[];
  notes: string;
  prerequisites: string[];
  parallelThreads: string[];
  mergeTarget?: string;
}

export interface Foreshadowing {
  id: string;
  hint: string;
  plantedInChapter: number;
  plantedInParagraph?: number;
  resolution: string;
  resolvedInChapter?: number;
  isResolved: boolean;
  relatedPlotThreads: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface SceneBeat {
  id: string;
  summary: string;
  characters: string[];
  location: string;
  tension: number;
  notes: string;
}

export interface ChapterOutline {
  chapterNumber: number;
  title: string;
  summary: string;
  beats: SceneBeat[];
  tensionTarget: number;
  plotThreadsAdvanced: string[];
  keyEvents: string[];
  notes: string;
}

export interface OutlineData {
  chapters: ChapterOutline[];
  plotThreads: PlotThread[];
  foreshadowing: Foreshadowing[];
}

// ==================== 章节 ====================

export type ChapterStatus = 'outlined' | 'drafted' | 'edited' | 'reviewed' | 'finalized';

/** 轻量章节摘要，用于列表展示（不含 content/agentComments/scenes 等重字段） */
export interface ChapterSummary {
  chapterNumber: number;
  title: string;
  status: ChapterStatus;
  wordCount: number;
  summary?: string;
  readerScore?: number;
  diagnostics?: {
    startupOpening?: {
      overallScore: number;
      passed: boolean;
      findingsCount: number;
      platformProfile: 'auto' | 'fanqie' | 'qidian';
    };
    lengthGuard?: {
      triggered: boolean;
      usedFallbackTrim: boolean;
      finalWordCount: number;
    };
    generationLifecycle?: {
      phase: 'draft' | 'final' | 'failed';
      errorCode?: string;
      errorMessage?: string;
      retryable?: boolean;
      updatedAt?: string;
    };
  };
  updatedAt?: string;
}

export interface AgentComment {
  agentRole: string;
  comment: string;
  paragraph?: number;
  timestamp: string;
}

export interface StartupOpeningGateFinding {
  code:
    | 'weak-first-screen'
    | 'unclear-goal'
    | 'unclear-obstacle'
    | 'weak-early-payoff'
    | 'weak-ending-hook'
    | 'heavy-exposition'
    | 'weak-platform-fit'
    | 'word-count-overrun';
  level: 'warn';
  message: string;
}

export interface StartupOpeningGateReport {
  enabled: boolean;
  chapterNumber: number;
  gateMode: 'warn' | 'strict';
  platformProfile: 'auto' | 'fanqie' | 'qidian';
  openingScore: number;
  clarityScore: number;
  payoffScore: number;
  endingHookScore: number;
  platformFitScore: number;
  overallScore: number;
  passed: boolean;
  overrunChars: number;
  findings: StartupOpeningGateFinding[];
  summary: string;
}

export interface StartupOpeningGateRewrite {
  attempted: boolean;
  applied: boolean;
  reason: string;
  before: StartupOpeningGateReport;
  after: StartupOpeningGateReport;
}

export interface StartupOpeningStrategyDigest {
  enabled: boolean;
  brief: string;
  summary: string;
  conflicts: string[];
  consumedSkillIds: string[];
}

export interface ChapterLengthGuard {
  triggered: boolean;
  targetWordCount?: number;
  actualWordCount: number;
  allowedMax: number;
  summary: string;
  attemptedCompression: boolean;
  usedFallbackTrim: boolean;
  finalWordCount: number;
}

export interface ChapterDiagnostics {
  startupOpeningStrategy?: StartupOpeningStrategyDigest;
  startupOpeningReport?: StartupOpeningGateReport;
  startupOpeningGateRewrite?: StartupOpeningGateRewrite;
  chapterLengthGuard?: ChapterLengthGuard;
  worldGate?: {
    gateMode: 'off' | 'warn' | 'strict';
    requiredTotal: number;
    requiredHit: number;
    missingRequired: string[];
    unsourcedTerms: string[];
    hasViolations: boolean;
    passed: boolean;
    summary: string;
    findings: Array<{
      code: 'missing-required' | 'unsourced-world-term' | 'shallow-required' | 'contradicted-rule';
      level: 'warn' | 'error';
      message: string;
      entryName?: string;
      term?: string;
    }>;
    repairAttempted: boolean;
    repairApplied: boolean;
    checkedAt: string;
  };
  updatedAt: string;
}

export interface Chapter {
  novelId: string;
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  status: ChapterStatus;
  outline?: ChapterOutline;
  agentComments: AgentComment[];
  readerScore?: number;
  revisionCount: number;
  /** 定稿时 LLM 生成的前情提要 */
  summary: string;
  scenes?: Scene[];
  sceneMode?: boolean;
  diagnostics?: ChapterDiagnostics;
  /** 作者有话说（章末互动短文，最多 20 条） */
  authorNotes?: string[];
  createdAt: string;
  updatedAt: string;
}

export type SceneStatus = 'planned' | 'generating' | 'drafted' | 'edited' | 'finalized';

export interface Scene {
  id: string;
  sceneNumber: number;
  title: string;
  summary: string;
  characters: string[];
  location: string;
  tension: number;
  wordTarget: number;
  wordCount: number;
  content: string;
  status: SceneStatus;
  notes: string;
  readerScore?: number;
  createdAt: string;
  updatedAt: string;
}

// ==================== IP 改编 ====================

export type AdaptationMode = 'audio' | 'comic' | 'short-drama';

export type AdaptationPackageStatus = 'draft' | 'passed' | 'failed' | 'published';

export interface SceneCardCharacter {
  id: string;
  name: string;
  objective: string;
}

export interface SceneCardEmotionBeat {
  beat: string;
  intensity: number; // 0-10
}

export interface SceneCard {
  id: string;
  chapterNumber: number;
  sceneIndex: number;
  title: string;
  time: string;
  location: string;
  characters: SceneCardCharacter[];
  conflict: string;
  turningPoint: string;
  outcome: string;
  emotionCurve: SceneCardEmotionBeat[];
  continuityRefs: string[];
  rawExcerpt: string;
}

export interface AdaptationPackage {
  id: string;
  novelId: string;
  chapterNumberStart: number;
  chapterNumberEnd: number;
  mode: AdaptationMode;
  version: number;
  status: AdaptationPackageStatus;
  payloadPath: string;
  qaReportPath?: string;
  createdAt: string;
  updatedAt?: string;
}

// ==================== Agent ====================

export type AgentRole =
  | 'world-builder'
  | 'character'
  | 'outline'
  | 'opening-supervisor'
  | 'writer'
  | 'editor'
  | 'reader'
  | 'character-merger'
  | 'world-merger'
  | 'plot-analyst'
  | 'voice-designer'
  | 'foreshadowing-curator'
  | 'culture-curator'
  | 'history-curator'
  | 'power-gradient-designer'
  | 'power-correlation-analyst'
  | 'power-world-integrator'
  | 'faction-culture-architect'
  | 'faction-inheritance-designer'
  | 'faction-motive-mission-planner'
  | 'outline-generator'
  | 'plot-explorer'
  | 'dialogue-polisher'
  | 'marketing-writer'
  | 'writing-assistant'
  | 'foreshadowing-scheduler'
  | 'book-title-recommender'
  | 'author-note-writer';

export const AGENT_NAMES: Record<AgentRole, string> = {
  'world-builder': '世界构建师',
  'character': '角色塑造师',
  'outline': '故事架构师',
  'opening-supervisor': '开篇三章总监',
  'writer': '写手',
  'editor': '编辑',
  'reader': '读者',
  'character-merger': '角色档案专家',
  'world-merger': '世界观专家',
  'plot-analyst': '剧情分析师',
  'voice-designer': 'AI 音效师',
  'foreshadowing-curator': '伏笔梳理师',
  'culture-curator': '文化设定梳理师',
  'history-curator': '历史线梳理师',
  'power-gradient-designer': '力量梯度细化师',
  'power-correlation-analyst': '力量相关性分析师',
  'power-world-integrator': '力量世界嵌入师',
  'faction-culture-architect': '势力文化架构师',
  'faction-inheritance-designer': '势力传承设计师',
  'faction-motive-mission-planner': '势力动机任务策划师',
  'outline-generator': '大纲生成师',
  'plot-explorer': '剧情探索师',
  'dialogue-polisher': '对话打磨师',
  'marketing-writer': '营销文案师',
  'writing-assistant': '写作助手',
  'foreshadowing-scheduler': '伏笔编排大师',
  'book-title-recommender': '书名推荐师',
  'author-note-writer': '作者有话说助手',
};

export const AGENT_COLORS: Record<AgentRole, string> = {
  'world-builder': '#10b981',
  'character': '#f59e0b',
  'outline': '#6366f1',
  'opening-supervisor': '#f97316',
  'writer': '#a855f7',
  'editor': '#3b82f6',
  'reader': '#ec4899',
  'character-merger': '#f97316',
  'world-merger': '#14b8a6',
  'plot-analyst': '#e11d48',
  'voice-designer': '#8b5cf6',
  'foreshadowing-curator': '#f97316',
  'culture-curator': '#0ea5e9',
  'history-curator': '#22c55e',
  'power-gradient-designer': '#f59e0b',
  'power-correlation-analyst': '#ef4444',
  'power-world-integrator': '#8b5cf6',
  'faction-culture-architect': '#14b8a6',
  'faction-inheritance-designer': '#0ea5e9',
  'faction-motive-mission-planner': '#f97316',
  'outline-generator': '#6366f1',
  'plot-explorer': '#8b5cf6',
  'dialogue-polisher': '#3b82f6',
  'marketing-writer': '#ec4899',
  'writing-assistant': '#0ea5e9',
  'foreshadowing-scheduler': '#eab308',
  'book-title-recommender': '#f43f5e',
  'author-note-writer': '#f472b6',
};

export interface AgentEvent {
  type: 'agent:start' | 'agent:chunk' | 'agent:complete' | 'agent:error' | 'pipeline:complete' | 'finalize:mode' | 'novel:metadata-updated';
  agentRole: AgentRole;
  novelId: string;
  chapterNumber?: number;
  data: string;
  timestamp: string;
  /** Token usage for agent:complete events */
  usage?: { inputTokens: number; outputTokens: number; provider?: string; model?: string };
}

// ==================== 通用 ====================

// ==================== 批量生成 ====================

export type BatchJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface BatchJobItem {
  chapterNumber: number;
  status: BatchJobStatus;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  retryCount: number;
  duration?: number;
}

export interface BatchJob {
  id: string;
  novelId: string;
  items: BatchJobItem[];
  autoFinalize: boolean;
  status: BatchJobStatus;
  currentIndex: number;
  createdAt: string;
  completedAt?: string;
}

export type BatchEventType =
  | 'batch:start'
  | 'batch:progress'
  | 'batch:item-complete'
  | 'batch:item-failed'
  | 'batch:item-retry'
  | 'batch:complete'
  | 'batch:failed'
  | 'batch:cancelled'
  | 'batch:paused'
  | 'batch:resumed'
  | 'batch:retry';

export interface BatchEvent {
  type: BatchEventType;
  batchId: string;
  novelId: string;
  chapterNumber?: number;
  currentIndex: number;
  totalItems: number;
  timestamp: string;
  /** 当前自动重试第几次（仅 batch:item-retry） */
  attempt?: number;
  /** 最大自动重试次数（仅 batch:item-retry） */
  maxRetries?: number;
  /** 失败或重试事件的错误摘要 */
  error?: string;
}

// ==================== 批量定稿事件 ====================

export type BatchFinalizeEventType =
  | 'batch-finalize:start'
  | 'batch-finalize:progress'
  | 'batch-finalize:item-complete'
  | 'batch-finalize:item-failed'
  | 'batch-finalize:complete';

export interface BatchFinalizeEvent {
  type: BatchFinalizeEventType;
  batchId: string;
  novelId: string;
  chapterNumber?: number;
  currentIndex: number;
  totalItems: number;
  timestamp: string;
  error?: string;
  succeeded?: number;
  failed?: number;
}

export type BatchFinalizeItemStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BatchFinalizeItem {
  chapterNumber: number;
  status: BatchFinalizeItemStatus;
  error?: string;
}

// ==================== 节奏分析 ====================

export interface PacingProfile {
  dialogue: number;
  action: number;
  description: number;
  psychology: number;
  narration: number;
}

export interface ChapterPacing {
  chapterNumber: number;
  profile: PacingProfile;
  dominantType: string;
  monotonyWarning: boolean;
  analyzedAt: string;
}

export const GENRE_LABELS: Record<NovelGenre, string> = {
  fantasy: '玄幻/奇幻',
  mystery: '悬疑/推理',
  modern: '都市/现代',
  scifi: '科幻',
  historical: '历史',
  romance: '言情',
  custom: '自定义',
};

export const STATUS_LABELS: Record<NovelStatus, string> = {
  planning: '构思中',
  writing: '连载中',
  paused: '暂停',
  completed: '完结',
  published: '已发布',
};

export const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  outlined: '仅大纲',
  drafted: '初稿',
  edited: '已润色',
  reviewed: '已审读',
  finalized: '定稿',
};

export const CHARACTER_ROLE_LABELS: Record<CharacterRole, string> = {
  protagonist: '主角',
  deuteragonist: '副主角',
  antagonist: '反派',
  rival: '宿敌',
  love_interest: '感情线',
  mentor: '导师',
  ally: '盟友',
  faction_leader: '势力核心',
  supporting: '配角',
  family: '亲友',
  comic_relief: '气氛担当',
  minor: '路人',
};

export const WORLD_CATEGORY_LABELS: Record<WorldCategory, string> = {
  geography: '地理',
  history: '历史',
  faction: '势力',
  power: '力量体系',
  culture: '文化',
  rule: '规则',
  other: '其他',
};

export const PLOT_THREAD_STATUS_LABELS: Record<PlotThreadStatus, string> = {
  planted: '已埋下',
  developing: '发展中',
  climax: '高潮',
  resolved: '已收束',
  abandoned: '已弃用',
};

/** 预设关系类型及其展示配色/线型 */
export const RELATIONSHIP_TYPE_PRESETS: Record<string, {
  label: string; color: string; lineType: 'solid' | 'dashed' | 'dotted';
}> = {
  // —— 亲缘 ——
  family:      { label: '亲属',     color: '#f59e0b', lineType: 'solid' },
  spouse:      { label: '夫妻',     color: '#f472b6', lineType: 'solid' },
  sibling:     { label: '兄弟姐妹', color: '#fb923c', lineType: 'solid' },
  parent:      { label: '父母子女', color: '#fbbf24', lineType: 'solid' },
  // —— 情感 ——
  lover:       { label: '恋人',     color: '#ec4899', lineType: 'solid' },
  crush:       { label: '暗恋/仰慕', color: '#f9a8d4', lineType: 'dashed' },
  ex:          { label: '前任',     color: '#9d174d', lineType: 'dotted' },
  // —— 友谊/合作 ——
  friend:      { label: '朋友',     color: '#10b981', lineType: 'solid' },
  childhood:   { label: '青梅竹马', color: '#34d399', lineType: 'solid' },
  sworn:       { label: '结义/金兰', color: '#059669', lineType: 'solid' },
  comrade:     { label: '战友',     color: '#0d9488', lineType: 'solid' },
  ally:        { label: '盟友',     color: '#3b82f6', lineType: 'solid' },
  partner:     { label: '搭档',     color: '#60a5fa', lineType: 'solid' },
  // —— 师承/从属 ——
  mentor:      { label: '师徒',     color: '#6366f1', lineType: 'solid' },
  classmate:   { label: '同门/同学', color: '#818cf8', lineType: 'solid' },
  subordinate: { label: '上下级',   color: '#8b5cf6', lineType: 'dotted' },
  servant:     { label: '主仆',     color: '#a78bfa', lineType: 'dotted' },
  protector:   { label: '守护',     color: '#7c3aed', lineType: 'solid' },
  // —— 对立 ——
  rival:       { label: '对手',     color: '#ef4444', lineType: 'dashed' },
  enemy:       { label: '敌人',     color: '#dc2626', lineType: 'dashed' },
  betrayer:    { label: '背叛',     color: '#991b1b', lineType: 'dashed' },
  nemesis:     { label: '宿敌',     color: '#b91c1c', lineType: 'dashed' },
  // —— 其他 ——
  neighbor:    { label: '邻居',     color: '#78716c', lineType: 'dotted' },
  business:    { label: '生意伙伴', color: '#a8a29e', lineType: 'dotted' },
  other:       { label: '其他',     color: '#6b7280', lineType: 'dotted' },
};

/** 地理条目子类型及其颜色与基础尺寸 */
export const GEOGRAPHY_TYPE_PRESETS: Record<string, {
  label: string; symbol: string; color: string; size: number;
}> = {
  capital:  { label: '国都', symbol: 'circle',    color: '#fbbf24', size: 50 },
  city:     { label: '城市', symbol: 'circle',    color: '#f59e0b', size: 40 },
  town:     { label: '城镇', symbol: 'circle',    color: '#fbbf24', size: 28 },
  village:  { label: '村庄', symbol: 'circle',    color: '#d97706', size: 20 },
  port:     { label: '港口', symbol: 'circle',    color: '#0ea5e9', size: 35 },
  fortress: { label: '要塞', symbol: 'circle',    color: '#ef4444', size: 38 },
  mountain: { label: '山脉', symbol: 'triangle',  color: '#6b7280', size: 35 },
  river:    { label: '河流', symbol: 'diamond',   color: '#3b82f6', size: 30 },
  lake:     { label: '湖泊', symbol: 'diamond',   color: '#06b6d4', size: 32 },
  forest:   { label: '森林', symbol: 'roundRect', color: '#10b981', size: 32 },
  plain:    { label: '平原', symbol: 'rect',      color: '#a3e635', size: 28 },
  desert:   { label: '沙漠', symbol: 'rect',      color: '#fbbf24', size: 28 },
  swamp:    { label: '沼泽', symbol: 'roundRect', color: '#6b8e23', size: 28 },
  ocean:    { label: '海洋', symbol: 'diamond',   color: '#0ea5e9', size: 35 },
  island:   { label: '岛屿', symbol: 'circle',    color: '#14b8a6', size: 30 },
  cave:     { label: '洞穴', symbol: 'circle',    color: '#78716c', size: 25 },
  pass:     { label: '关隘', symbol: 'rect',      color: '#dc2626', size: 30 },
  ruins:    { label: '遗迹', symbol: 'triangle',  color: '#a855f7', size: 30 },
  landmark: { label: '地标', symbol: 'pin',       color: '#a855f7', size: 35 },
  bridge:   { label: '桥梁', symbol: 'rect',      color: '#92400e', size: 25 },
  tower:    { label: '塔楼', symbol: 'pin',       color: '#7c3aed', size: 30 },
  other:    { label: '其他', symbol: 'circle',    color: '#6b7280', size: 22 },
};

// ==================== 风格 DNA ====================

export interface SentenceLengthDistribution {
  short: number;
  medium: number;
  long: number;
  veryLong: number;
  avgLength: number;
  stdDev: number;
}

export interface DialogueProfile {
  dialogueRatio: number;
  narrationRatio: number;
  avgDialogueLength: number;
  dialogueDensityPerParagraph: number;
}

export interface RhetoricProfile {
  metaphorFrequency: number;
  simileFrequency: number;
  parallelismFrequency: number;
  rhetoricQuestionFrequency: number;
  exclamationFrequency: number;
  ellipsisFrequency: number;
}

export interface ToneProfile {
  formality: number;
  emotionIntensity: number;
  humorIndex: number;
  darknessTendency: number;
  lyricalTendency: number;
}

export interface StyleDNA {
  id: string;
  novelId: string;
  name: string;
  sentenceLength: SentenceLengthDistribution;
  paragraphStructure: { avgSentencesPerParagraph: number; avgParagraphLength: number; shortParagraphRatio: number; longParagraphRatio: number };
  dialogue: DialogueProfile;
  rhetoric: RhetoricProfile;
  vocabulary: { uniqueWordRatio: number; topBigrams: { bigram: string; count: number }[]; favoredAdjectives: string[]; favoredVerbs: string[]; classicalChineseRatio: number };
  tone: ToneProfile;
  userNotes: string;
  samples: { name: string; charCount: number; addedAt: string }[];
  totalSampleChars: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  fingerprint?: StyleFingerprint;
  styleGuide?: string;
}

export interface StyleFingerprint {
  sentenceLengthStats: {
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    distribution: Record<string, number>;
  };
  paragraphLengthStats: {
    mean: number;
    stdDev: number;
  };
  ttr: number;
  rhetoricalDensity: {
    metaphorCount: number;
    simileCount: number;
    parallelismCount: number;
  };
}

export interface AiUsageOperationSummary {
  operationKey: string;
  operationLabel: string;
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  lastUsedAt: string | null;
  usageKinds: Array<'chat' | 'chat-stream' | 'embedding-query' | 'embedding-batch' | 'image-generate' | 'tts'>;
}

export interface AiUsageModelSummary {
  provider: string;
  model: string;
  agentRole: string;
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  lastUsedAt: string | null;
}

export interface AgentCostRecord {
  agentRole: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  latencyMs: number;
  timestamp: string;
}

export interface CostOperationSummary {
  operationType: string;
  operationLabel: string;
  agentCosts: AgentCostRecord[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  generatedAt: string;
}

export interface ChapterCostSummary {
  chapterNumber: number;
  operations?: CostOperationSummary[];
  agentCosts: AgentCostRecord[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  generatedAt: string;
  totalTokens?: number;
  deepSeekTokens?: number;
  deepSeekCost?: number;
  requestCount?: number;
  operationCount?: number;
  usageOperations?: AiUsageOperationSummary[];
  usageModels?: AiUsageModelSummary[];
  hasLedgerData?: boolean;
}

export interface NovelCostData {
  novelId: string;
  chapters: ChapterCostSummary[];
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastUpdated: string;
  totalTokens?: number;
  totalRequestCount?: number;
  deepSeekTokens?: number;
  deepSeekCost?: number;
  chapterCount?: number;
  usageOperations?: AiUsageOperationSummary[];
  nonChapterOperations?: AiUsageOperationSummary[];
}

// ==================== 事实图谱 ====================

export interface CharacterAppearance {
  characterName: string;
  chapterNumber: number;
  location: string;
  action: string;
  mentionType: 'onstage' | 'dialogue' | 'reference' | 'memory' | 'dream' | 'corpse';
  confidence: number;
  evidence: string;
  sentenceIndex: number;
}

export interface ItemStatusEntry {
  itemName: string;
  status: 'obtained' | 'used' | 'lost' | 'destroyed' | 'mentioned' | 'transferred';
  holderName: string;
  chapterNumber: number;
  detail: string;
}

export interface LocationVisit {
  characterName: string;
  location: string;
  chapterNumber: number;
  arrivalMethod: string;
}

export interface TimelineEvent {
  id: string;
  chapterNumber: number;
  timeMarker: string;
  dayNumber?: number;
  summary: string;
  involvedCharacterNames: string[];
  location: string;
  importance: number;
  isFlashback: boolean;
  evidence: string;
  sentenceIndex: number;
}

export interface CharacterStateChange {
  characterName: string;
  chapterNumber: number;
  previousState: string;
  newState: 'alive' | 'dead' | 'injured' | 'healed' | 'missing' | 'imprisoned' | 'transformed' | 'powerup' | 'powerdown';
  detail: string;
  certainty: 'confirmed' | 'suspected' | 'rumored';
  sourceType: 'direct' | 'reference' | 'memory' | 'dream';
  evidence: string;
  sentenceIndex: number;
}

export interface FactEvent {
  id: string;
  chapterNumber: number;
  sentenceIndex: number;
  eventType: 'character-mention' | 'item-status' | 'location-visit' | 'timeline-marker' | 'state-change';
  entityType: 'character' | 'item' | 'location' | 'timeline';
  entityName: string;
  detail: string;
  evidence: string;
  confidence: number;
  relatedCharacterNames: string[];
  mentionType?: 'onstage' | 'dialogue' | 'reference' | 'memory' | 'dream' | 'corpse';
  state?: 'alive' | 'dead' | 'injured' | 'healed' | 'missing' | 'imprisoned' | 'transformed' | 'powerup' | 'powerdown';
  itemStatus?: 'obtained' | 'used' | 'lost' | 'destroyed' | 'mentioned' | 'transferred';
  timeMarker: string;
  isFlashback: boolean;
  location: string;
}

export interface FactGraph {
  novelId: string;
  lastUpdatedChapter: number;
  characterAppearances: CharacterAppearance[];
  itemTimeline: ItemStatusEntry[];
  locationVisits: LocationVisit[];
  timelineEvents: TimelineEvent[];
  relationshipChanges: { sourceCharacterName: string; targetCharacterName: string; chapterNumber: number; previousRelation: string; newRelation: string; trigger: string }[];
  characterStateChanges: CharacterStateChange[];
  factEvents: FactEvent[];
  updatedAt: string;
}

export interface Contradiction {
  id: string;
  type: 'character-resurrection' | 'item-reuse-after-destroy' | 'location-teleport' | 'timeline-regression' | 'state-contradiction' | 'relationship-contradiction';
  severity: 'critical' | 'warning' | 'info';
  chapterNumbers: number[];
  description: string;
  evidence: string[];
  evidenceDetails: Array<{
    chapterNumber: number;
    label: string;
    text: string;
    sourceType: 'appearance' | 'state-change' | 'timeline-event' | 'semantic-support' | 'semantic-counterevidence';
  }>;
  suggestion: string;
  resolved: boolean;
  confidence: number;
  entityName: string;
  anchorChapterNumber?: number;
}

// ==================== 剧情分支 ====================

export type PlotBranchStatus = 'proposed' | 'selected' | 'explored' | 'abandoned';

export interface PlotBranchNode {
  id: string;
  parentId: string | null;
  chapterNumber: number;
  title: string;
  description: string;
  impactPrediction: string;
  characterImpacts: { name: string; impact: string }[];
  riskLevel: 'low' | 'medium' | 'high';
  status: PlotBranchStatus;
  committedChapterNumber?: number;
  previewContent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlotBranchTree {
  novelId: string;
  nodes: PlotBranchNode[];
  activePath: string[];
}

export interface PlotBranchDraftInput {
  title: string;
  description: string;
  impactPrediction?: string;
  characterImpacts?: { name: string; impact: string }[];
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface PlotBranchAddResult {
  tree: PlotBranchTree;
  addedNodeIds: string[];
}

export interface PlotBranchApplyResult {
  tree: PlotBranchTree;
  outline: OutlineData;
  nodeId: string;
  appliedChapterNumber: number;
}

export interface PlotBranchForkResult {
  tree: PlotBranchTree;
  forkedNovel: NovelMetadata;
  nodeId: string;
  appliedChapterNumber: number;
}

export interface PlotBranchPreviewResult {
  tree: PlotBranchTree;
  nodeId: string;
  previewContent: string;
  usedAgent: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ==================== 宇宙锚点 ====================

export type AnchorTimeRelation = 'prequel' | 'parallel' | 'sequel';

export const ANCHOR_TIME_RELATION_LABELS: Record<AnchorTimeRelation, string> = {
  prequel: '前传',
  parallel: '平行',
  sequel: '续作',
};

export type CharacterCrossBookValue = 'boss' | 'mysterious' | 'transitional' | 'recurring';

export const CROSS_BOOK_VALUE_LABELS: Record<CharacterCrossBookValue, string> = {
  boss: '大佬/Boss',
  mysterious: '神秘人物',
  transitional: '承上启下',
  recurring: '常驻角色',
};

export interface CharacterPoolCandidate {
  characterId: string;
  name: string;
  aliases: string[];
  role: string;
  crossBookValue: CharacterCrossBookValue;
  reason: string;
  abilitySummary: string;
  lastKnownState: string;
  narrativeHooks: string[];
  confirmed: boolean;
}

export interface AnchorWorldEntry {
  id: string;
  category: string;
  name: string;
  description: string;
  aliases: string[];
  constraints: string[];
  details: Record<string, string>;
  tags: string[];
}

export interface AnchorFactionEndState {
  factionName: string;
  phase: string;
  powerLevel: number;
  description: string;
}

export interface AnchorWorldSnapshot {
  entries: AnchorWorldEntry[];
  factionEndStates: AnchorFactionEndState[];
  timelineEndMarker: string;
}

export interface AnchorForeshadowing {
  hint: string;
  plantedInChapter: number;
  resolvedInAnchor: boolean;
  resolutionHint: string;
}

export interface UniverseAnchor {
  id: string;
  sourceNovelId: string;
  sourceNovelTitle: string;
  world: AnchorWorldSnapshot;
  characterPool: CharacterPoolCandidate[];
  foreshadowing: AnchorForeshadowing[];
  storySummary: string;
  frozenAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnchorLink {
  anchorId: string;
  anchorNovelTitle: string;
  timeRelation: AnchorTimeRelation;
  priority: number;
}

// ==================== 系列蓝图 ====================

export interface BookCrossRef {
  targetBook: number;
  targetProtagonist: string;
  relationship: string;
  foreshadowingHint: string;
}

export interface BookBlueprint {
  bookOrder: number;
  novelId: string;
  title: string;
  protagonist: string;
  origin: string;
  positioning: string;
  fate: string;
  crossRefs: BookCrossRef[];
  keyThemes: string[];
  notes: string;
}

export interface SeriesBlueprint {
  books: BookBlueprint[];
  sharedWorldRules: string;
  overarchingTheme: string;
  timelineOverview: string;
}

export interface SeriesNovelRef {
  novelId: string;
  title: string;
  order: number;
  timelineSpan: string;
  legacy: string[];
  status: 'planning' | 'writing' | 'completed';
}

export interface SeriesMetadata {
  id: string;
  ownerId?: string;
  title: string;
  description: string;
  genre: string;
  masterPlan: string;
  blueprint: SeriesBlueprint;
  novels: SeriesNovelRef[];
  legacy: any;
  createdAt: string;
  updatedAt: string;
}

// ==================== 宇宙工作台 ====================

export type UniverseRelationType =
  | 'mainline-next'
  | 'side-story'
  | 'parallel'
  | 'prequel'
  | 'sequel'
  | 'alt-branch';

export const UNIVERSE_RELATION_LABELS: Record<UniverseRelationType, string> = {
  'mainline-next': '主线下一部',
  'side-story': '外传',
  parallel: '平行篇',
  prequel: '前传',
  sequel: '续作',
  'alt-branch': '分歧线',
};

export interface UniverseNovelRef {
  novelId: string;
  title: string;
  genre?: NovelGenre;
  status?: NovelStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface UniverseRelation {
  id: string;
  fromNovelId: string;
  toNovelId: string;
  type: UniverseRelationType;
  anchorChapterNumber?: number;
  timelineSpan: string;
  spoilerCeiling: string;
  inheritWorld: boolean;
  inheritCharacters: boolean;
  inheritForeshadowing: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface UniverseMetadata {
  id: string;
  ownerId?: string;
  title: string;
  description: string;
  corePremise: string;
  sharedWorldRules: string;
  timelineBaseline: string;
  novels: UniverseNovelRef[];
  relations: UniverseRelation[];
  createdAt: string;
  updatedAt: string;
}

// ==================== Agent Skills ====================

export type AgentSkillStatus = 'draft' | 'active' | 'archived';
export type AgentSkillActivation = 'manual' | 'auto';
export type AgentSkillRole = string | '*';

export type AgentSkillTriggerCondition =
  | { type: 'chapter-range'; min?: number; max?: number }
  | { type: 'chapter-type'; values: string[] }
  | { type: 'plot-thread'; values: string[] }
  | { type: 'tension-range'; min?: number; max?: number }
  | { type: 'platform'; values: ('fanqie' | 'qidian' | 'auto')[] }
  | { type: 'word-count-range'; min?: number; max?: number }
  | { type: 'and'; conditions: AgentSkillTriggerCondition[] }
  | { type: 'or'; conditions: AgentSkillTriggerCondition[] }
  | { type: 'not'; condition: AgentSkillTriggerCondition };

export interface AgentSkillDefinition {
  id: string;
  name: string;
  description: string;
  instruction: string;
  targetRoles: string[];
  targetGenres: string[];
  priority: number;
  status: AgentSkillStatus;
  activation: AgentSkillActivation;
  triggerCondition?: AgentSkillTriggerCondition;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}
