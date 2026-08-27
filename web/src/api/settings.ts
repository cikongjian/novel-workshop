import { http, AI_TIMEOUT } from './http';

// ==================== 设置 ====================

export type ProviderPreset = {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  defaultModel: string;
  models: { value: string; label: string }[];
  embeddingBaseUrl?: string;
  embeddingModels?: { value: string; label: string }[];
};

export type HomepageHighlight = {
  title: string;
  description: string;
};

export type HomepageShowcaseItem = {
  novelId: string;
  displayTitle: string;
  authorName: string;
  genreLabel: string;
  logline: string;
  synopsis: string;
  chapterNumbers: number[];
};

export type HomepageShowcaseSection = {
  eyebrow: string;
  title: string;
  description: string;
  items: HomepageShowcaseItem[];
};

export type HomepageVariant = {
  heroTitle: string;
  heroDescription: string;
  primaryActionLabel: string;
  primaryActionRoute: string;
  secondaryActionLabel: string;
  secondaryActionRoute: string;
  capabilities: string[];
  highlights: HomepageHighlight[];
};

export type HomepageFooterContactType =
  | 'email'
  | 'qq'
  | 'wechat'
  | 'wecom'
  | 'telegram'
  | 'phone'
  | 'other';

export type HomepageFooterContact = {
  type: HomepageFooterContactType;
  label: string;
  value: string;
  href: string;
};

export type HomepageFooter = {
  companyName: string;
  copyrightText: string;
  icpNumber: string;
  icpLink: string;
  policeNumber: string;
  policeLink: string;
  supportEmail: string;
  address: string;
  privacyLabel: string;
  privacyLink: string;
  termsLabel: string;
  termsLink: string;
  contactLabel: string;
  contactLink: string;
  contacts: HomepageFooterContact[];
  navGroups: HomepageFooterNavGroup[];
};

export type HomepageFooterNavLink = {
  label: string;
  href: string;
};

export type HomepageFooterNavGroup = {
  title: string;
  links: HomepageFooterNavLink[];
};

export type HomepageConfig = {
  brandSubtitle: string;
  variant: HomepageVariant;
  showcase: HomepageShowcaseSection;
  footer: HomepageFooter;
};

export type Settings = {
  modelProvider: string;
  modelApiKey: string;
  modelName: string;
  modelBaseUrl: string;
  /** 是否启用模型流式输出（SSE）；默认关闭以兼容缓冲流式的部署环境 */
  modelStreamingEnabled: boolean;
  embeddingProvider: string;
  embeddingApiKey: string;
  embeddingModel: string;
  embeddingBaseUrl: string;
  /** TTS 引擎：`edge-tts` 或 `qwen3-tts` */
  ttsEngine: string;
  /** Qwen3-TTS 服务地址 */
  qwen3TtsUrl: string;
  /** 旁白引擎类型 */
  ttsNarrationEngine: 'edge-tts' | 'kokoro';
  /** Kokoro TTS 服务地址 */
  kokoroUrl: string;
  characterGuardrailMinConflictRate: number;
  characterGuardrailMinHumanityRate: number;
  characterGuardrailMinStabilityScore: number;
  antiTemplateRepeatedOpenerMinCount: number;
  antiTemplateRepeatedClicheMinCount: number;
  antiTemplateLookbackChapters: number;
  antiAiTellsEnabled: boolean;
  antiAiTellsRepeatedMinCount: number;
  antiAiTellsMaxExamples: number;
  antiAiTellsMaxFrequentItems: number;
  antiAiStructureEnabled: boolean;
  antiAiStructureTransitionPer1kMax: number;
  antiAiStructureRepeatedMinCount: number;
  antiAiStructureMaxExamples: number;
  antiAiStructureMaxFrequentItems: number;
  worldContractEnabled: boolean;
  worldGateMode: 'off' | 'warn' | 'strict';
  worldGateStrictFallbackToWarn: boolean;
  worldRetrievalV2Enabled: boolean;
  worldRetrievalTopK: number;
  outlineGateMode: 'off' | 'warn' | 'strict';
  outlineGateStrictFallbackToWarn: boolean;
  outlineGateMaxRequired: number;
  qualityGateMode: 'off' | 'warn' | 'strict';
  qualityGateStrictFallbackToWarn: boolean;
  qualityGatePassScore: number;
  qualityGateMinStructureScore: number;
  qualityGateMinStyleScore: number;
  qualityGateMinEmotionScore: number;
  continuityGateMode: 'off' | 'warn' | 'strict';
  continuityGateStrictFallbackToWarn: boolean;
  powerRuleGateMode: 'off' | 'warn' | 'strict';
  powerRuleGateStrictFallbackToWarn: boolean;
  superLongModeEnabled: boolean;
  truthFilesEnabled: boolean;
  structuredAuditEnabled: boolean;
  snapshotEnabled: boolean;
  aiTraceGateMode: 'off' | 'warn' | 'strict';
  autoRevisionEnabled: boolean;
  autoRevisionScoreThreshold: number;
  autoRevisionMaxRounds: number;
  qualityFloorRevisionEnabled: boolean;
  chapterLengthGuardEnabled: boolean;
  chapterLengthGuardTriggerPercent: number;
  chapterLengthGuardAllowedPercent: number;
  autoCurateEnabled: boolean;
  autoFinalizeEnabled: boolean;
  authorNoteEnabled: boolean;
  registrationProtectionEnabled: boolean;
  registrationProtectionRegPerHour: number;
  registrationProtectionRegPerDay: number;
  newUserCooldownHours: number;
  disableCoverUpload: boolean;
  publishMaxPerMonth: number;
  publishUnlockReads: number;
  publishUnlockLikes: number;
  publishUnlockFavorites: number;
  publishUnlockChapters: number;
  authPasswordMinLength: number;
  authPasswordRequireLowercase: boolean;
  authPasswordRequireUppercase: boolean;
  authPasswordRequireNumbers: boolean;
  authPasswordRequireSpecialChars: boolean;
  userApiFeatureEnabled: boolean;
  userApiAllowPlatformCache: boolean;
  userApiAllowLocalOnly: boolean;
  realNameVerificationEnabled: boolean;
  realNameVerificationProvider: 'basic_submission' | 'mock_identity' | 'http_bridge';
  realNameRequiredForComment: boolean;
  realNameRequiredForCreatorApplication: boolean;
  realNameRequiredForBookPublishing: boolean;
  realNameRequiredForBilling: boolean;
  realNameVerificationMaxFailedAttempts: number;
  realNameVerificationCooldownMinutes: number;
  realNameVerificationHttpUrl: string;
  realNameVerificationHttpToken: string;
  realNameVerificationHttpTimeoutMs: number;
  realNameVerificationHttpHeaders: string;
  imageApiKey: string;
  imageModel: string;
  imageBaseUrl: string;
  homepageConfig: HomepageConfig;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  platformUrl: string;
  commentEnabled: boolean;
  /** 章节漫画（移动端实验功能）全局开关；关闭时入口/路由/计费全部失效 */
  comicChapterEnabled: boolean;
  /** AI 有声书/广播剧访问模式 */
  audiobookAccessMode: 'off' | 'admin' | 'on';
  trendsEnabled: boolean;
  trendsSearchProvider: 'serpapi' | 'bing' | 'tavily' | 'agent-reach' | 'direct' | 'none';
  trendsSearchApiKey: string;
  trendsSearchApiBaseUrl: string;
  trendsScheduleHour: number;
  trendsScheduleMinute: number;
  /** 朋友圈空窗保护（小时），0=不限制 */
  momentsIdleCooldownHours: number;
  configured: boolean;
  baiduPushToken: string;
  providers: ProviderPreset[];
  realNameVerificationProviders?: Array<'basic_submission' | 'mock_identity' | 'http_bridge'>;
  friendlyLinks: FriendlyLink[];
};

export type FriendlyLink = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
};

export type RealNameAuditAction = 'verify_submission' | 'policy_update';
export type RealNameAuditStatus = 'success' | 'rejected';

export type RealNameAuditLog = {
  id: string;
  action: RealNameAuditAction;
  status: RealNameAuditStatus;
  user_id: string | null;
  operator_user_id: string | null;
  scene: 'comment' | 'creatorApplication' | 'bookPublishing' | 'billing' | null;
  provider: 'basic_submission' | 'mock_identity' | 'http_bridge' | null;
  detail: string | null;
  created_at: string;
  username: string | null;
  operator_username: string | null;
};

export async function fetchCoverConfig(): Promise<{ disableCoverUpload: boolean }> {
  const { data } = await http.get<{ disableCoverUpload: boolean }>('/settings/public/cover-config');
  return data;
}

export async function fetchAudiobookConfig(): Promise<{
  mode: 'off' | 'admin' | 'on';
  enabled: boolean;
  hasAccess: boolean;
}> {
  const { data } = await http.get<{
    mode: 'off' | 'admin' | 'on';
    enabled: boolean;
    hasAccess: boolean;
  }>('/settings/public/audiobook-config');
  return data;
}

export async function fetchSettings(): Promise<Settings> {
  const { data } = await http.get<Settings>('/settings');
  return data;
}

export async function saveSettings(params: Omit<Settings, 'configured' | 'providers'>): Promise<Settings> {
  const { data } = await http.put<Settings>('/settings', params);
  return data;
}

export async function fetchRealNameAudits(): Promise<RealNameAuditLog[]> {
  const { data } = await http.get<RealNameAuditLog[]>('/settings/real-name/audits');
  return data;
}

export type TestRealNameProviderParams = {
  provider: 'basic_submission' | 'mock_identity' | 'http_bridge';
  realName: string;
  idNumber: string;
  phoneNumber: string;
  httpUrl?: string;
  httpToken?: string;
  httpTimeoutMs?: number;
  httpHeaders?: string;
};

export type TestRealNameProviderResult = {
  success: boolean;
  provider: 'basic_submission' | 'mock_identity' | 'http_bridge';
  providerLabel: string;
  passed?: boolean;
  detail?: string;
  elapsed?: number;
  error?: string;
};

export async function testRealNameProvider(params: TestRealNameProviderParams): Promise<TestRealNameProviderResult> {
  const { data } = await http.post<TestRealNameProviderResult>(
    '/settings/real-name/test-provider',
    params,
    { timeout: Math.max(15000, (params.httpTimeoutMs ?? 8000) + 5000) },
  );
  return data;
}

export type TestModelResult = {
  success: boolean;
  reply?: string;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number; provider?: string; model?: string };
  elapsed?: number;
  error?: string;
};

export type TestEmbeddingResult = {
  success: boolean;
  dimensions?: number;
  elapsed?: number;
  error?: string;
};

export type TestImageResult = {
  success: boolean;
  model?: string;
  elapsed?: number;
  hasImageUrl?: boolean;
  hasBase64?: boolean;
  error?: string;
};

export type PortraitRoleAttireEntry = {
  id: string;
  label: string;
  category: string;
  keywords: string[];
  identityPrompt: string;
  attirePrompt: string;
};

export type PortraitRoleAttireDictionary = {
  systemCount: number;
  extensionCount: number;
  customCount: number;
  mergedCount: number;
  extensionEntries: PortraitRoleAttireEntry[];
  customEntries: PortraitRoleAttireEntry[];
};

export async function testModel(params: {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  keyIndex?: number;
  novelId?: string;
}): Promise<TestModelResult> {
  const { data } = await http.post<TestModelResult>('/settings/test-model', params, { timeout: 30000 });
  return data;
}

export async function testEmbedding(params: {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  keyIndex?: number;
  novelId?: string;
}): Promise<TestEmbeddingResult> {
  const { data } = await http.post<TestEmbeddingResult>('/settings/test-embedding', params, { timeout: 30000 });
  return data;
}

export async function testImage(params: {
  apiKey: string;
  model: string;
  baseUrl: string;
}): Promise<TestImageResult> {
  const { data } = await http.post<TestImageResult>(
    '/settings/test-image',
    params,
    { timeout: 120000 },
  );
  return data;
}

export async function fetchPortraitRoleAttireDictionary(): Promise<PortraitRoleAttireDictionary> {
  const { data } = await http.get<PortraitRoleAttireDictionary>('/settings/portrait-role-attire-dictionary');
  return data;
}

export async function savePortraitRoleAttireDictionary(customEntries: PortraitRoleAttireEntry[]): Promise<{
  message: string;
  customCount: number;
  mergedCount: number;
  customEntries: PortraitRoleAttireEntry[];
}> {
  const { data } = await http.put<{
    message: string;
    customCount: number;
    mergedCount: number;
    customEntries: PortraitRoleAttireEntry[];
  }>('/settings/portrait-role-attire-dictionary', { customEntries });
  return data;
}

export type MemoryReindexParams = {
  scope: 'all' | 'selected';
  novelIds?: string[];
  clearBeforeRebuild?: boolean;
  dryRun?: boolean;
  embeddingProvider?: string;
  embeddingApiKey?: string;
  embeddingModel?: string;
  embeddingBaseUrl?: string;
};

export type MemoryReindexNovelStats = {
  novelId: string;
  worldEntries: number;
  characters: number;
  chapters: number;
  indexedChapters: number;
  skippedEmptyChapters: number;
  durationMs: number;
};

export type MemoryReindexSummary = {
  ok: boolean;
  dryRun: boolean;
  totalNovels: number;
  successNovels: number;
  failedNovels: number;
  clearBeforeRebuild: boolean;
  durationMs: number;
  stats: MemoryReindexNovelStats[];
  failed: Array<{ novelId: string; error: string }>;
};

export type MemoryHealthParams = {
  scope: 'all' | 'selected';
  novelIds?: string[];
};

export type MemoryHealthStatus =
  | 'vector_ready'
  | 'vector_incomplete'
  | 'fts_only'
  | 'empty'
  | 'missing_db'
  | 'error';

export type MemoryHealthItem = {
  novelId: string;
  dbExists: boolean;
  status: MemoryHealthStatus;
  reason?: string;
  chunksRows: number;
  embeddingRows: number;
  vecTableExists: boolean;
  vecRows: number;
};

export type MemoryHealthSummary = {
  ok: boolean;
  scope: 'all' | 'selected';
  totalNovels: number;
  runtime: {
    enabled: boolean;
    reason?: string;
  };
  summary: {
    vectorReady: number;
    vectorIncomplete: number;
    ftsOnly: number;
    empty: number;
    missingDb: number;
    error: number;
  };
  items: MemoryHealthItem[];
};

/**
 * 重建向量记忆索引（支持全量与指定小说）。
 *
 * - dryRun=true：同步返回 MemoryReindexSummary (200)
 * - dryRun=false：后端异步执行，返回 { accepted: true } (202)，进度通过 WebSocket 推送
 */
export async function reindexMemory(
  params: MemoryReindexParams,
): Promise<MemoryReindexSummary | { accepted: boolean; message: string }> {
  const { data } = await http.post<MemoryReindexSummary | { accepted: boolean; message: string }>(
    '/settings/reindex-memory',
    params,
    { timeout: 30_000 },
  );
  return data;
}

/**
 * 检查记忆索引健康状态（向量可用性、向量表与行数）。
 */
export async function inspectMemoryHealth(params: MemoryHealthParams): Promise<MemoryHealthSummary> {
  const { data } = await http.post<MemoryHealthSummary>(
    '/settings/memory-health',
    params,
    { timeout: 120000 },
  );
  return data;
}

/** 查询重建任务运行状态（刷新后恢复进度用） */
export async function getReindexStatus(): Promise<{
  running: boolean;
  progress: {
    novelId: string;
    novelIndex: number;
    totalNovels: number;
    phase: string;
    current: number;
    total: number;
    error?: string;
  } | null;
}> {
  const { data } = await http.get('/settings/reindex-status');
  return data;
}

// ── SMTP 邮件服务 ──

export interface TestSmtpResult {
  success: boolean;
  error?: string;
  elapsed?: number;
}

export async function testSmtp(params: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}): Promise<TestSmtpResult> {
  const { data } = await http.post<TestSmtpResult>(
    '/settings/test-smtp',
    params,
    { timeout: 30000 },
  );
  return data;
}

export async function testSmtpSend(to: string): Promise<TestSmtpResult> {
  const { data } = await http.post<TestSmtpResult>(
    '/settings/test-smtp-send',
    { to },
    { timeout: 30000 },
  );
  return data;
}
