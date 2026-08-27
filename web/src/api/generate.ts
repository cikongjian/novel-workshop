import { http, AI_TIMEOUT } from './http';
import type { WorldEntry, Foreshadowing, TitleRecommendation, TitleRecommendationPlatform } from '../types';

// ==================== AI 生成 ====================

// ==================== 批量生成 ====================

export async function startBatchGenerate(params: {
  novelId: string;
  fromChapter: number;
  toChapter: number;
  autoFinalize?: boolean;
  userDirection?: string;
  maxWordCount?: number;
}): Promise<{
  batchId: string;
  status: string;
  items: import('../types').BatchJobItem[];
}> {
  const { data } = await http.post('/generate/batch', params, { timeout: AI_TIMEOUT });
  return data;
}

export async function fetchBatchStatus(novelId?: string): Promise<{
  status: string;
  job: (import('../types').BatchJob & { paused?: boolean }) | null;
  jobs?: import('../types').BatchJob[];
  runningCount?: number;
  maxConcurrent?: number;
  paused?: boolean;
  // 用户级并发信息
  userRunningCount?: number;
  userMaxConcurrent?: number;
  userRunningJobs?: Array<{
    novelId: string;
    status: string;
    currentIndex: number;
    totalItems: number;
    createdAt: string;
  }>;
}> {
  const { data } = await http.get('/generate/batch/status', {
    params: novelId ? { novelId } : undefined,
  });

  // 兼容两种后端响应:
  // 1) 指定 novelId: { status, job }
  // 2) 不指定 novelId: { status, jobs, runningCount, maxConcurrent, userRunningCount, ... }
  if ('job' in data) {
    return data;
  }

  const jobs = Array.isArray(data.jobs) ? data.jobs as import('../types').BatchJob[] : [];
  const matchedJob = novelId
    ? jobs.find(item => item.novelId === novelId) ?? null
    : jobs[0] ?? null;

  return {
    status: typeof data.status === 'string' ? data.status : (matchedJob?.status ?? 'idle'),
    job: matchedJob,
    jobs,
    runningCount: typeof data.runningCount === 'number' ? data.runningCount : undefined,
    maxConcurrent: typeof data.maxConcurrent === 'number' ? data.maxConcurrent : undefined,
    userRunningCount: typeof data.userRunningCount === 'number' ? data.userRunningCount : undefined,
    userMaxConcurrent: typeof data.userMaxConcurrent === 'number' ? data.userMaxConcurrent : undefined,
    userRunningJobs: Array.isArray(data.userRunningJobs) ? data.userRunningJobs : undefined,
  };
}

export async function cancelBatch(novelId: string): Promise<{ status: string }> {
  const { data } = await http.post('/generate/batch/cancel', { novelId });
  return data;
}

export type WorldContractEntry = {
  id: string;
  name: string;
  aliases: string[];
  category: 'geography' | 'history' | 'faction' | 'power' | 'culture' | 'rule' | 'other';
  score: number;
  reason: string;
  constraints: string[];
  consequences: string[];
  baseline: boolean;
};

export type WorldContractData = {
  chapterNumber: number;
  query: string;
  source: 'retrieval-v2' | 'fallback';
  required: WorldContractEntry[];
  supporting: WorldContractEntry[];
  canonical?: WorldContractEntry[];
  prompt: string;
};

export type WorldContractFinding = {
  code: 'missing-required' | 'unsourced-world-term' | 'shallow-required' | 'contradicted-rule';
  level: 'warn' | 'error';
  message: string;
  entryName?: string;
  term?: string;
};

export type WorldFulfillmentReport = {
  gateMode: 'off' | 'warn' | 'strict';
  requiredTotal: number;
  requiredHit: number;
  missingRequired: string[];
  unsourcedTerms: string[];
  findings: WorldContractFinding[];
  passed: boolean;
  summary: string;
};

export type OutlineContractItem = {
  source: 'chapter-outline' | 'outline-agent' | 'foreshadowing';
  text: string;
  keywords: string[];
};

export type OutlineContractData = {
  chapterNumber: number;
  required: OutlineContractItem[];
  prompt: string;
};

export type OutlineFulfillmentFinding = {
  code: 'missing-outline-item';
  level: 'warn' | 'error';
  message: string;
  item: string;
  source: 'chapter-outline' | 'outline-agent' | 'foreshadowing';
};

export type OutlineFulfillmentReport = {
  gateMode: 'off' | 'warn' | 'strict';
  requiredTotal: number;
  requiredHit: number;
  matchedRequired: string[];
  missingRequired: string[];
  findings: OutlineFulfillmentFinding[];
  passed: boolean;
  summary: string;
};

export type QualityGateFinding = {
  code:
    | 'low-scene-coverage'
    | 'low-structure-signal'
    | 'high-template-repetition'
    | 'ai-meta-leak'
    | 'ai-structure-markers'
    | 'transition-overuse'
    | 'dialogue-ratio-mismatch'
    | 'low-emotion-variance';
  level: 'warn' | 'error';
  message: string;
};

export type QualityGateReport = {
  gateMode: 'off' | 'warn' | 'strict';
  structureScore: number;
  styleScore: number;
  emotionScore: number;
  overallScore: number;
  findings: QualityGateFinding[];
  passed: boolean;
  summary: string;
};

export type StartupOpeningGateFinding = {
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
};

export type StartupOpeningGateReport = {
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
};

export type StartupOpeningStrategyDigest = {
  enabled: boolean;
  brief: string;
  summary: string;
  conflicts: string[];
  consumedSkillIds: string[];
};

export type ChapterLengthGuardInfo = {
  triggered: boolean;
  targetWordCount?: number;
  actualWordCount: number;
  allowedMax: number;
  summary: string;
  attemptedCompression: boolean;
  usedFallbackTrim: boolean;
  finalWordCount: number;
};

export type SpeakerWhitelistFinding = {
  name: string;
  occurrences: number;
  inPendingPool: boolean;
};

export type SpeakerWhitelistReport = {
  mode: 'off' | 'warn' | 'strict';
  passed: boolean;
  summary: string;
  findings: SpeakerWhitelistFinding[];
};

export type ContinuityFinding = {
  code: string;
  level: 'warn' | 'error';
  message: string;
};

export type ContinuityGateReport = {
  gateMode: 'off' | 'warn' | 'strict';
  findings: ContinuityFinding[];
  passed: boolean;
  summary: string;
};

export type PowerRuleFinding = {
  code: 'missing-cost-signal' | 'missing-cooldown-signal' | 'missing-risk-signal';
  level: 'warn' | 'error';
  entryName: string;
  message: string;
};

export type PowerRuleGateReport = {
  gateMode: 'off' | 'warn' | 'strict';
  findings: PowerRuleFinding[];
  usedPowerEntries: string[];
  passed: boolean;
  summary: string;
};

export type SuperLongDiagnosticModule = {
  key:
    | 'layered-memory'
    | 'character-ledger'
    | 'timeline-engine'
    | 'foreshadow-debt'
    | 'anti-ai-radar'
    | 'pov-lock'
    | 'chapter-goal-budget'
    | 'hook-planner';
  title: string;
  enabled: boolean;
  score?: number;
  summary: string;
  evidence?: string[];
};

export type SuperLongDiagnostics = {
  enabled: boolean;
  summary: string;
  modules: SuperLongDiagnosticModule[];
};

export type GenerateChapterResponse = {
  status?: 'accepted';
  novelId?: string;
  chapterNumber?: number;
  message?: string;
  chapterContent: string;
  outline: string;
  worldNotes: string;
  characterNotes: string;
  draft: string;
  editedContent: string;
  readerFeedback: string;
  scenePlan?: string;
  stylePreset?: string;
  outlineContract?: OutlineContractData;
  outlineFulfillment?: OutlineFulfillmentReport;
  outlineGateRewrite?: {
    attempted: boolean;
    applied: boolean;
    reason: string;
    before: OutlineFulfillmentReport;
    after: OutlineFulfillmentReport;
  };
  worldContract?: WorldContractData;
  worldFulfillment?: WorldFulfillmentReport;
  worldGateRewrite?: {
    attempted: boolean;
    applied: boolean;
    reason: string;
    before: WorldFulfillmentReport;
    after: WorldFulfillmentReport;
  };
  qualityReport?: QualityGateReport;
  qualityGateRewrite?: {
    attempted: boolean;
    applied: boolean;
    reason: string;
    before: QualityGateReport;
    after: QualityGateReport;
  };
  startupOpeningStrategy?: StartupOpeningStrategyDigest;
  startupOpeningReport?: StartupOpeningGateReport;
  startupOpeningGateRewrite?: {
    attempted: boolean;
    applied: boolean;
    reason: string;
    before: StartupOpeningGateReport;
    after: StartupOpeningGateReport;
  };
  chapterLengthGuard?: ChapterLengthGuardInfo;
  speakerWhitelistReport?: SpeakerWhitelistReport;
  powerRuleReport?: PowerRuleGateReport;
  continuityReport?: ContinuityGateReport;
  superLongDiagnostics?: SuperLongDiagnostics;
};

export function isGenerateChapterAccepted(
  response: GenerateChapterResponse,
): response is GenerateChapterResponse & { status: 'accepted'; chapterNumber: number } {
  return response.status === 'accepted' && typeof response.chapterNumber === 'number';
}

export type ReviseQualitySnapshot = {
  overallScore: number;
  structureScore: number;
  styleScore: number;
  emotionScore: number;
  findingsCount: number;
  passed: boolean;
  summary: string;
};

export type ReviseChapterResponse = {
  revisedContent?: string;
  editedContent?: string;
  readerFeedback?: string;
  agentOutputs?: unknown[];
  qualityDelta?: {
    before: ReviseQualitySnapshot;
    after: ReviseQualitySnapshot;
    deltaOverall: number;
    targetDelta: number;
    autoBoostAttempted: boolean;
    autoBoostApplied: boolean;
  };
  aiMarkerGuard?: {
    beforeScore: number;
    afterScore: number;
    delta: number;
    rejected: boolean;
    reason?: string;
  };
};

export async function generateChapter(params: {
  novelId: string;
  chapterNumber: number;
  userDirection?: string;
  maxWordCount?: number;
  startupPlatformProfile?: 'auto' | 'fanqie' | 'qidian';
  stylePreset?:
    | 'auto'
    | 'serious'
    | 'comedy'
    | 'wacky'
    | 'historical'
    | 'xianxia'
    | 'wuxia'
    | 'suspense'
    | 'horror'
    | 'campus'
    | 'workplace'
    | 'political'
    | 'hard-scifi'
    | 'romance-sweet'
    | 'romance-angst';
  styleNotes?: string;
}): Promise<GenerateChapterResponse> {
  const { data } = await http.post('/generate/chapter', params, { timeout: AI_TIMEOUT });
  return data;
}

export type RewriteChapterResponse = {
  status: 'ok';
  chapterNumber: number;
  usedDefaultDirection: boolean;
  wordCount: number;
  similarity?: number;
};

export type RewritePreviewResponse = {
  status: 'preview';
  chapterNumber: number;
  chapterContent: string;
  editedContent: string;
  readerFeedback: string;
  similarity: number;
  similarityReason: string;
  usedDefaultDirection: boolean;
  wordCount: number;
};

export async function rewriteChapterPreview(params: {
  novelId: string;
  chapterNumber: number;
  userDirection?: string;
  maxWordCount?: number;
  stylePreset?:
    | 'auto'
    | 'serious'
    | 'comedy'
    | 'wacky'
    | 'historical'
    | 'xianxia'
    | 'wuxia'
    | 'suspense'
    | 'horror'
    | 'campus'
    | 'workplace'
    | 'political'
    | 'hard-scifi'
    | 'romance-sweet'
    | 'romance-angst';
  styleNotes?: string;
}): Promise<RewritePreviewResponse> {
  const { data } = await http.post<RewritePreviewResponse>('/generate/rewrite-chapter-preview', params, { timeout: AI_TIMEOUT });
  return data;
}

export async function rewriteChapterConfirm(params: {
  novelId: string;
  chapterNumber: number;
}): Promise<RewriteChapterResponse> {
  const { data } = await http.post<RewriteChapterResponse>('/generate/rewrite-chapter-confirm', params);
  return data;
}

export async function rewriteChapter(params: {
  novelId: string;
  chapterNumber: number;
  userDirection?: string;
  maxWordCount?: number;
  stylePreset?:
    | 'auto'
    | 'serious'
    | 'comedy'
    | 'wacky'
    | 'historical'
    | 'xianxia'
    | 'wuxia'
    | 'suspense'
    | 'horror'
    | 'campus'
    | 'workplace'
    | 'political'
    | 'hard-scifi'
    | 'romance-sweet'
    | 'romance-angst';
  styleNotes?: string;
}): Promise<RewriteChapterResponse> {
  const { data } = await http.post<RewriteChapterResponse>('/generate/rewrite-chapter', params, { timeout: AI_TIMEOUT });
  return data;
}

export type BatchRewriteChapterResult = {
  chapterNumber: number;
  ok: boolean;
  usedDefaultDirection?: boolean;
  wordCount?: number;
  similarity?: number;
  error?: string;
};

export type RewriteBatchResponse = {
  status: 'completed' | 'partial';
  total: number;
  succeeded: number;
  failed: number;
  results: BatchRewriteChapterResult[];
};

export async function rewriteBatch(params: {
  novelId: string;
  chapterNumbers: number[];
  userDirection?: string;
  maxWordCount?: number;
  stylePreset?:
    | 'auto'
    | 'serious'
    | 'comedy'
    | 'wacky'
    | 'historical'
    | 'xianxia'
    | 'wuxia'
    | 'suspense'
    | 'horror'
    | 'campus'
    | 'workplace'
    | 'political'
    | 'hard-scifi'
    | 'romance-sweet'
    | 'romance-angst';
  styleNotes?: string;
}): Promise<RewriteBatchResponse> {
  const { data } = await http.post<RewriteBatchResponse>('/generate/rewrite-batch', params, { timeout: AI_TIMEOUT });
  return data;
}

export async function reviseChapter(params: {
  novelId: string;
  chapterNumber: number;
  feedback: string;
  enableAiMarkerGuard?: boolean;
  aiMarkerGuardThreshold?: number;
  mode?: 'rewrite' | 'spot-fix';
}): Promise<ReviseChapterResponse> {
  const { data } = await http.post<ReviseChapterResponse>('/generate/revise', params, { timeout: AI_TIMEOUT });
  return data;
}

export type ResizeChapterResponse = {
  content: string;
  originalWordCount: number;
  newWordCount: number;
  mode: string;
};

export async function resizeChapter(params: {
  novelId: string;
  chapterNumber: number;
  targetWordCount: number;
  mode: 'compress' | 'expand';
  preserveNotes?: string;
}): Promise<ResizeChapterResponse> {
  const { data } = await http.post<ResizeChapterResponse>('/generate/resize-chapter', params, { timeout: AI_TIMEOUT });
  return data;
}

export type CurateForeshadowingResponse = {
  applied: boolean;
  summary: string;
  beforeCount: number;
  afterCount: number;
  overdueBefore: number;
  overdueAfter: number;
  foreshadowing: Foreshadowing[];
};

export async function curateForeshadowing(params: {
  novelId: string;
  apply?: boolean;
  maxItems?: number;
}): Promise<CurateForeshadowingResponse> {
  const { data } = await http.post<CurateForeshadowingResponse>('/generate/curate-foreshadowing', params, {
    timeout: AI_TIMEOUT,
  });
  return data;
}

export async function applyCuratedForeshadowing(params: {
  novelId: string;
  foreshadowing: Foreshadowing[];
  maxItems?: number;
  summary?: string;
}): Promise<CurateForeshadowingResponse> {
  const { data } = await http.post<CurateForeshadowingResponse>('/generate/apply-curated-foreshadowing', params, {
    timeout: AI_TIMEOUT,
  });
  return data;
}

export type CurateCultureWorldResponse = {
  applied: boolean;
  summary: string;
  beforeCount: number;
  afterCount: number;
  entries: WorldEntry[];
  degraded?: boolean;
};

export async function curateCultureWorld(params: {
  novelId: string;
  apply?: boolean;
  maxItems?: number;
}): Promise<CurateCultureWorldResponse> {
  const { data } = await http.post<CurateCultureWorldResponse>('/generate/curate-culture-world', params, {
    timeout: AI_TIMEOUT,
  });
  return data;
}

export async function applyCuratedCultureWorld(params: {
  novelId: string;
  entries: WorldEntry[];
  maxItems?: number;
  summary?: string;
}): Promise<CurateCultureWorldResponse> {
  const { data } = await http.post<CurateCultureWorldResponse>('/generate/apply-curated-culture-world', params, {
    timeout: AI_TIMEOUT,
  });
  return data;
}

export type CurateHistoryWorldResponse = {
  applied: boolean;
  summary: string;
  beforeCount: number;
  afterCount: number;
  entries: WorldEntry[];
  degraded?: boolean;
};

export async function curateHistoryWorld(params: {
  novelId: string;
  apply?: boolean;
  maxItems?: number;
}): Promise<CurateHistoryWorldResponse> {
  const { data } = await http.post<CurateHistoryWorldResponse>('/generate/curate-history-world', params, {
    timeout: AI_TIMEOUT,
  });
  return data;
}

export async function applyCuratedHistoryWorld(params: {
  novelId: string;
  entries: WorldEntry[];
  maxItems?: number;
  summary?: string;
}): Promise<CurateHistoryWorldResponse> {
  const { data } = await http.post<CurateHistoryWorldResponse>('/generate/apply-curated-history-world', params, {
    timeout: AI_TIMEOUT,
  });
  return data;
}

export type CuratePowerWorldStageReport = {
  role: string;
  summary: string;
  producedCount: number;
};

export type CuratePowerWorldResponse = {
  applied: boolean;
  summary: string;
  beforeCount: number;
  afterCount: number;
  entries: WorldEntry[];
  degraded?: boolean;
  stageReports?: CuratePowerWorldStageReport[];
};

export async function curatePowerWorld(params: {
  novelId: string;
  apply?: boolean;
  maxItems?: number;
}): Promise<CuratePowerWorldResponse> {
  const { data } = await http.post<CuratePowerWorldResponse>('/generate/curate-power-world', params, {
    timeout: AI_TIMEOUT,
  });
  return data;
}

export async function applyCuratedPowerWorld(params: {
  novelId: string;
  entries: WorldEntry[];
  maxItems?: number;
  summary?: string;
}): Promise<CuratePowerWorldResponse> {
  const { data } = await http.post<CuratePowerWorldResponse>('/generate/apply-curated-power-world', params, {
    timeout: AI_TIMEOUT,
  });
  return data;
}

export type CurateFactionWorldStageReport = {
  role: string;
  summary: string;
  producedCount: number;
};

export type CurateFactionWorldResponse = {
  applied: boolean;
  summary: string;
  beforeCount: number;
  afterCount: number;
  entries: WorldEntry[];
  degraded?: boolean;
  stageReports?: CurateFactionWorldStageReport[];
};

export async function curateFactionWorld(params: {
  novelId: string;
  apply?: boolean;
  maxItems?: number;
}): Promise<CurateFactionWorldResponse> {
  const { data } = await http.post<CurateFactionWorldResponse>('/generate/curate-faction-world', params, {
    timeout: AI_TIMEOUT,
  });
  return data;
}

export async function applyCuratedFactionWorld(params: {
  novelId: string;
  entries: WorldEntry[];
  maxItems?: number;
  summary?: string;
}): Promise<CurateFactionWorldResponse> {
  const { data } = await http.post<CurateFactionWorldResponse>('/generate/apply-curated-faction-world', params, {
    timeout: AI_TIMEOUT,
  });
  return data;
}

export async function finalizeChapter(novelId: string, chapterNumber: number, options?: { force?: boolean }): Promise<{
  status: string;
}> {
  const query = options?.force ? '?force=true' : '';
  const { data } = await http.post(`/novels/${novelId}/chapters/finalize/${chapterNumber}${query}`);
  return data;
}

// ==================== 聊天与灵感扩写 ====================

export async function chat(params: {
  novelId?: string;
  message: string;
  timeout?: number;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ reply: string; model?: string; usage?: unknown }> {
  const { timeout, ...requestParams } = params;
  const { data } = await http.post('/generate/chat', requestParams, {
    timeout: timeout ?? AI_TIMEOUT,
  });
  return data;
}

/** 灵感扩写（魔法棒）— 把简短想法扩展成详细的创作方向或风格说明 */
export async function expandIdea(params: {
  novelId: string;
  text: string;
  field?: 'direction' | 'styleNotes';
  chapterNumber?: number;
}): Promise<{ expanded: string; model?: string; usage?: unknown }> {
  const { data } = await http.post('/generate/expand-idea', params, { timeout: 30000 });
  return data;
}

// ==================== 书名 & 简介推荐 ====================

/** AI 生成书名和简介推荐 */
export async function recommendBookTitle(params: {
  novelId: string;
  platform?: TitleRecommendationPlatform;
  userDirection?: string;
}): Promise<{ recommendation: TitleRecommendation }> {
  const { data } = await http.post('/generate/recommend-book-title', params, { timeout: AI_TIMEOUT });
  return data;
}

/** 删除一条书名推荐记录 */
export async function deleteBookTitleRecommendation(
  novelId: string,
  recId: string,
): Promise<void> {
  await http.delete(`/generate/recommend-book-title/${novelId}/${recId}`);
}

// ==================== 作品介绍生成 ====================

/** 生成起点/番茄风格的作品介绍 */
export async function generateSynopsis(params: {
  novelId: string;
}): Promise<{
  qidian: {
    synopsis: string;
    tags: string[];
    reasoning: string;
  };
  fanqie: {
    synopsis: string;
    tags: string[];
    reasoning: string;
  };
}> {
  const { data } = await http.post('/generate/synopsis', params, { timeout: AI_TIMEOUT });
  return data;
}

// ==================== 作者有话说 ====================

/** 为指定章节生成一条"作者有话说" */
export async function generateAuthorNote(params: {
  novelId: string;
  chapterNumber: number;
  userDirection?: string;
}): Promise<{ authorNote: string; authorNotes: string[]; chapterNumber: number }> {
  const { data } = await http.post('/generate/author-note', params, { timeout: AI_TIMEOUT });
  return data;
}

/** 智能检测关键章节并批量生成作者有话说 */
/** 关键章节检测结果项 */
export interface KeyChapterInfo {
  chapterNumber: number;
  score: number;
  keyType: string;
  signals: string[];
  hasExistingNotes: boolean;
}

/** 检测关键章节（不启动生成） */
export async function detectKeyChapters(params: {
  novelId: string;
  threshold?: number;
  skipExisting?: boolean;
}): Promise<{
  keyChapters: KeyChapterInfo[];
  toGenerate: KeyChapterInfo[];
  totalChapters: number;
  skippedWithExisting: number;
}> {
  const { data } = await http.post('/generate/batch-author-notes/detect', params);
  return data;
}

/** 启动批量作者有话说生成（用户确认后调用） */
export async function startBatchAuthorNotes(params: {
  novelId: string;
  chapterNumbers?: number[];
  userDirection?: string;
  maxWords?: number;
  threshold?: number;
  skipExisting?: boolean;
}): Promise<{
  batchId: string | null;
  total: number;
  message?: string;
}> {
  const { data } = await http.post('/generate/batch-author-notes/start', params, { timeout: AI_TIMEOUT });
  return data;
}

/** 删除作者有话说（传 index 删单条，不传清空全部） */
export async function deleteAuthorNote(
  novelId: string,
  chapterNumber: number,
  index?: number,
): Promise<{ authorNotes: string[] }> {
  const query = index != null ? `?index=${index}` : '';
  const { data } = await http.delete(`/generate/author-note/${novelId}/${chapterNumber}${query}`);
  return data;
}
