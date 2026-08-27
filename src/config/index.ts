import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import type { ModelProvider } from '../models/types.js';
import type { AppConfig } from './config-builder.js';
import {
  type HomePageConfig,
  decodeHomePageConfigFromEnv,
  encodeHomePageConfigForEnv,
  normalizeHomePageConfig,
} from './homepage-config.js';
import { ConfigManager, getConfigManager, type ConfigChangeHandler } from './config-manager.js';

export type FriendlyLink = {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
};

function decodeFriendlyLinksFromEnv(raw: string | undefined): FriendlyLink[] {
  if (!raw) return [];
  try {
    const json = Buffer.from(raw, 'base64').toString('utf-8');
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return null;
        const r = item as Record<string, unknown>;
        const id = typeof r.id === 'string' ? r.id.trim() : '';
        const name = typeof r.name === 'string' ? r.name.trim() : '';
        const url = typeof r.url === 'string' ? r.url.trim() : '';
        if (!id || !name || !url) return null;
        return { id, name: name.slice(0, 30), url: url.slice(0, 500), enabled: Boolean(r.enabled) };
      })
      .filter((v): v is FriendlyLink => v !== null);
  } catch {
    return [];
  }
}

function encodeFriendlyLinksForEnv(links: FriendlyLink[]): string {
  const clean = links.map((l) => ({
    id: l.id,
    name: l.name.slice(0, 30),
    url: l.url.slice(0, 500),
    enabled: Boolean(l.enabled),
  }));
  return Buffer.from(JSON.stringify(clean), 'utf-8').toString('base64');
}

function normalizeFriendlyLinks(input: unknown): FriendlyLink[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item: unknown) => {
      if (!item || typeof item !== 'object') return null;
      const r = item as Record<string, unknown>;
      const id = typeof r.id === 'string' ? r.id.trim() : '';
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      const url = typeof r.url === 'string' ? r.url.trim() : '';
      if (!id || !name || !url) return null;
      return { id, name: name.slice(0, 30), url: url.slice(0, 500), enabled: Boolean(r.enabled) };
    })
    .filter((v): v is FriendlyLink => v !== null);
}

/**
 * 加载环境变量优先级：
 * 1. Docker env_file / process.env（最高优先级，不被 dotenv 覆盖）
 * 2. DATA_DIR/.env（持久化设置，Docker volume 中）
 * 3. CWD/.env.production（生产部署）
 * 4. CWD/.env（本地开发）
 */
const DATA_DIR_ENV = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR, '.env')
  : undefined;

/** 设置备份文件：Docker 重建后 .env 可能丢失，从此备份恢复 */
const DATA_DIR_ENV_BACKUP = DATA_DIR_ENV
  ? DATA_DIR_ENV + '.backup'
  : undefined;

/**
 * 检查 .env 是否包含 settings-page 管理的配置段。
 * 如果缺失（Docker 重建导致），尝试从备份恢复。
 */
function restoreSettingsFromBackupIfNeeded(): void {
  if (!DATA_DIR_ENV || !DATA_DIR_ENV_BACKUP) return;
  if (!fs.existsSync(DATA_DIR_ENV_BACKUP)) return;

  const envContent = fs.existsSync(DATA_DIR_ENV)
    ? fs.readFileSync(DATA_DIR_ENV, 'utf-8')
    : '';
  const hasManaged = envContent.includes('# === Managed by settings page ===');

  if (!hasManaged) {
    const backup = fs.readFileSync(DATA_DIR_ENV_BACKUP, 'utf-8');
    // 将备份内容追加到 .env，保留原有非 managed 行
    const merged = envContent.trimEnd() + '\n' + backup;
    fs.writeFileSync(DATA_DIR_ENV, merged, 'utf-8');
    // 重新加载合并后的 .env
    loadDotenv({ path: DATA_DIR_ENV, override: true });
  }
}

// 先尝试加载 DATA_DIR/.env（Docker 持久化设置），再加载 CWD/.env
if (DATA_DIR_ENV && fs.existsSync(DATA_DIR_ENV)) {
  loadDotenv({ path: DATA_DIR_ENV });
}
// 生产环境优先加载 .env.production，再加载 .env 作为补充
if (process.env.NODE_ENV === 'production') {
  const prodEnv = path.resolve('.env.production');
  if (fs.existsSync(prodEnv)) {
    loadDotenv({ path: prodEnv });
  }
}
loadDotenv(); // CWD/.env，不会覆盖已有 env var

// Docker 重建后 .env 可能丢失，从备份恢复
restoreSettingsFromBackupIfNeeded();

export type { AppConfig } from './config-builder.js';
export type { HomePageConfig } from './homepage-config.js';

export function getConfig(): AppConfig {
  return getConfigManager().getConfig();
}

export function getNovelsDir(): string {
  return path.resolve(getConfig().dataDir, 'novels');
}

export async function reloadConfig(): Promise<AppConfig> {
  if (DATA_DIR_ENV && fs.existsSync(DATA_DIR_ENV)) {
    loadDotenv({ path: DATA_DIR_ENV, override: true });
  }
  loadDotenv({ override: true });
  return getConfigManager().reload();
}

export { ConfigManager, getConfigManager, type ConfigChangeHandler };

/**
 * 设置文件路径：优先写入 DATA_DIR/.env（Docker 持久化），回退到 CWD/.env。
 */
const ENV_FILE = DATA_DIR_ENV ?? path.resolve('.env');

function readBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (!raw || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function readAudiobookAccessMode(raw: string | undefined): 'off' | 'admin' | 'on' {
  if (!raw || raw.trim() === '') return 'admin';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'off' || normalized === 'disabled') return 'off';
  if (normalized === 'admin' || normalized === 'admin-only') return 'admin';
  if (normalized === 'on' || normalized === 'enabled' || normalized === 'all') return 'on';
  return 'admin';
}

/**
 * 是否启用模型流式输出（SSE）。默认 false：关闭以兼容缓冲流式响应的部署环境
 * （如某些反向代理/网关会缓冲 SSE，导致 chatStream 拿不到首字节而挂起）。
 */
export function isModelStreamingEnabled(): boolean {
  return readBoolEnv(process.env.MODEL_STREAMING_ENABLED, false);
}

export type SettingsPayload = {
  modelProvider: ModelProvider;
  modelApiKey: string;
  modelName: string;
  modelBaseUrl: string;
  /** 是否启用模型流式输出（SSE）；关闭后 Agent 改用一次性返回，兼容缓冲流式响应的部署环境 */
  modelStreamingEnabled: boolean;
  embeddingProvider: string;
  embeddingApiKey: string;
  embeddingModel: string;
  embeddingBaseUrl: string;
  ttsEngine: 'edge-tts' | 'qwen3-tts' | 'azure-tts' | 'openai-tts';
  ttsNarrationEngine: 'edge-tts' | 'kokoro';
  qwen3TtsUrl: string;
  kokoroUrl: string;
  ttsAzureKey: string;
  ttsAzureRegion: string;
  ttsOpenaiKey: string;
  ttsOpenaiBaseUrl: string;
  ttsOpenaiModel: string;
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
  /** 触发 Resizer 的超字数百分比（如 35 表示超过目标 35% 才触发） */
  chapterLengthGuardTriggerPercent: number;
  /** 最终允许的超字数百分比（如 5 表示最多超过目标 5%） */
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
  agentModelOverrides: string;
  imageApiKey: string;
  imageModel: string;
  imageBaseUrl: string;
  homepageConfig: HomePageConfig;
  contentAuditProvider: string;
  contentAuditApiKey: string;
  contentAuditSecretKey: string;
  contentAuditRegion: string;
  contentAuditPassThreshold: number;
  contentAuditBlockThreshold: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  platformUrl: string;
  commentEnabled: boolean;
  momentsIdleCooldownHours: number;
  baiduPushToken: string;
  friendlyLinks: FriendlyLink[];
  /** 章节漫画（移动端实验功能）全局开关；关闭时相关入口、路由与计费全部失效，等价于功能不存在 */
  comicChapterEnabled: boolean;
  /** AI 有声书/广播剧访问模式：off 关闭 / admin 仅管理员 / on 全员开放 */
  audiobookAccessMode: 'off' | 'admin' | 'on';
  trendsEnabled: boolean;
  trendsSearchProvider: 'serpapi' | 'bing' | 'tavily' | 'agent-reach' | 'direct' | 'none';
  trendsSearchApiKey: string;
  trendsSearchApiBaseUrl: string;
  trendsScheduleHour: number;
  trendsScheduleMinute: number;
};

export function readSettings(): SettingsPayload & { configured: boolean } {
  const cfg = getConfig();
  const mask = (key: string) =>
    key ? `${key.slice(0, 3)}****` : '';
  const maskKeys = (keys: string[]) =>
    keys.length > 1 ? keys.map(mask).join(',') : mask(keys[0] ?? '');

  return {
    modelProvider: cfg.model.provider,
    modelApiKey: maskKeys(cfg.model.apiKeys.length > 0 ? cfg.model.apiKeys : [cfg.model.apiKey]),
    modelName: cfg.model.model,
    modelBaseUrl: cfg.model.baseUrl,
    modelStreamingEnabled: readBoolEnv(process.env.MODEL_STREAMING_ENABLED, false),
    embeddingProvider: cfg.embedding.provider,
    embeddingApiKey: maskKeys(cfg.embedding.apiKeys.length > 0 ? cfg.embedding.apiKeys : [cfg.embedding.apiKey]),
    embeddingModel: cfg.embedding.model,
    embeddingBaseUrl: cfg.embedding.baseUrl,
    ttsEngine: cfg.tts.engine,
    ttsNarrationEngine: cfg.tts.narrationEngine,
    qwen3TtsUrl: cfg.tts.qwen3Url,
    kokoroUrl: cfg.tts.kokoroUrl,
    ttsAzureKey: mask(cfg.tts.azureKey),
    ttsAzureRegion: cfg.tts.azureRegion,
    ttsOpenaiKey: mask(cfg.tts.openaiKey),
    ttsOpenaiBaseUrl: cfg.tts.openaiBaseUrl,
    ttsOpenaiModel: cfg.tts.openaiModel,
    characterGuardrailMinConflictRate: cfg.chapterEnhancement.consistency.minConflictRate,
    characterGuardrailMinHumanityRate: cfg.chapterEnhancement.consistency.minHumanityRate,
    characterGuardrailMinStabilityScore: cfg.chapterEnhancement.consistency.minStabilityScore,
    antiTemplateRepeatedOpenerMinCount: cfg.chapterEnhancement.antiTemplate.repeatedOpenerMinCount,
    antiTemplateRepeatedClicheMinCount: cfg.chapterEnhancement.antiTemplate.repeatedClicheMinCount,
    antiTemplateLookbackChapters: cfg.chapterEnhancement.antiTemplate.lookbackChapters,
    antiAiTellsEnabled: cfg.chapterEnhancement.antiAiTells.enabled,
    antiAiTellsRepeatedMinCount: cfg.chapterEnhancement.antiAiTells.repeatedMinCount,
    antiAiTellsMaxExamples: cfg.chapterEnhancement.antiAiTells.maxExamples,
    antiAiTellsMaxFrequentItems: cfg.chapterEnhancement.antiAiTells.maxFrequentItems,
    antiAiStructureEnabled: cfg.chapterEnhancement.antiAiStructure.enabled,
    antiAiStructureTransitionPer1kMax: cfg.chapterEnhancement.antiAiStructure.transitionWordsPer1kMax,
    antiAiStructureRepeatedMinCount: cfg.chapterEnhancement.antiAiStructure.repeatedMinCount,
    antiAiStructureMaxExamples: cfg.chapterEnhancement.antiAiStructure.maxExamples,
    antiAiStructureMaxFrequentItems: cfg.chapterEnhancement.antiAiStructure.maxFrequentItems,
    worldContractEnabled: cfg.worldFeatures.contractEnabled,
    worldGateMode: cfg.worldFeatures.gateMode,
    worldGateStrictFallbackToWarn: cfg.worldFeatures.strictFallbackToWarn,
    worldRetrievalV2Enabled: cfg.worldFeatures.retrievalV2Enabled,
    worldRetrievalTopK: cfg.worldFeatures.retrievalTopK,
    outlineGateMode: cfg.outlineFeatures.gateMode,
    outlineGateStrictFallbackToWarn: cfg.outlineFeatures.strictFallbackToWarn,
    outlineGateMaxRequired: cfg.outlineFeatures.maxRequired,
    qualityGateMode: cfg.qualityFeatures.gateMode,
    qualityGateStrictFallbackToWarn: cfg.qualityFeatures.strictFallbackToWarn,
    qualityGatePassScore: cfg.qualityFeatures.passScore,
    qualityGateMinStructureScore: cfg.qualityFeatures.minStructureScore,
    qualityGateMinStyleScore: cfg.qualityFeatures.minStyleScore,
    qualityGateMinEmotionScore: cfg.qualityFeatures.minEmotionScore,
    continuityGateMode: cfg.continuityFeatures.gateMode,
    continuityGateStrictFallbackToWarn: cfg.continuityFeatures.strictFallbackToWarn,
    powerRuleGateMode: cfg.powerRuleFeatures.gateMode,
    powerRuleGateStrictFallbackToWarn: cfg.powerRuleFeatures.strictFallbackToWarn,
    superLongModeEnabled: readBoolEnv(process.env.SUPER_LONG_MODE_ENABLED, false),
    truthFilesEnabled: readBoolEnv(process.env.TRUTH_FILES_ENABLED, true),
    structuredAuditEnabled: readBoolEnv(process.env.STRUCTURED_AUDIT_ENABLED, true),
    snapshotEnabled: readBoolEnv(process.env.SNAPSHOT_ENABLED, true),
    aiTraceGateMode: (['off', 'warn', 'strict'].includes(process.env.AI_TRACE_GATE_MODE ?? '') ? process.env.AI_TRACE_GATE_MODE as 'off' | 'warn' | 'strict' : 'warn'),
    autoRevisionEnabled: cfg.autoRevision.enabled,
    autoRevisionScoreThreshold: cfg.autoRevision.scoreThreshold,
    autoRevisionMaxRounds: cfg.autoRevision.maxRounds,
    qualityFloorRevisionEnabled: cfg.autoRevision.qualityFloorRevisionEnabled,
    autoCurateEnabled: cfg.autoCurate.enabled,
    autoFinalizeEnabled: cfg.autoFinalize.enabled,
    authorNoteEnabled: cfg.authorNote.enabled,
    chapterLengthGuardEnabled: readBoolEnv(process.env.CHAPTER_LENGTH_GUARD_ENABLED, true),
    chapterLengthGuardTriggerPercent: Number(process.env.CHAPTER_LENGTH_GUARD_TRIGGER_PERCENT) || 20,
    chapterLengthGuardAllowedPercent: Number(process.env.CHAPTER_LENGTH_GUARD_ALLOWED_PERCENT) || 5,
    registrationProtectionEnabled: cfg.registrationProtection.enabled,
    registrationProtectionRegPerHour: cfg.registrationProtection.regPerHour,
    registrationProtectionRegPerDay: cfg.registrationProtection.regPerDay,
    newUserCooldownHours: cfg.newUserCooldownHours,
    disableCoverUpload: cfg.disableCoverUpload,
    publishMaxPerMonth: cfg.publishLimits.maxPerMonth,
    publishUnlockReads: cfg.publishLimits.unlockReads,
    publishUnlockLikes: cfg.publishLimits.unlockLikes,
    publishUnlockFavorites: cfg.publishLimits.unlockFavorites,
    publishUnlockChapters: cfg.publishLimits.unlockChapters,
    authPasswordMinLength: cfg.passwordPolicy.minLength,
    authPasswordRequireLowercase: cfg.passwordPolicy.requireLowercase,
    authPasswordRequireUppercase: cfg.passwordPolicy.requireUppercase,
    authPasswordRequireNumbers: cfg.passwordPolicy.requireNumbers,
    authPasswordRequireSpecialChars: cfg.passwordPolicy.requireSpecialChars,
    userApiFeatureEnabled: cfg.userApi.enabled,
    userApiAllowPlatformCache: cfg.userApi.allowPlatformCache,
    userApiAllowLocalOnly: cfg.userApi.allowLocalOnly,
    realNameVerificationEnabled: cfg.realNameVerification.enabled,
    realNameVerificationProvider: cfg.realNameVerification.provider,
    realNameRequiredForComment: cfg.realNameVerification.requiredForComment,
    realNameRequiredForCreatorApplication: cfg.realNameVerification.requiredForCreatorApplication,
    realNameRequiredForBookPublishing: cfg.realNameVerification.requiredForBookPublishing,
    realNameRequiredForBilling: cfg.realNameVerification.requiredForBilling,
    realNameVerificationMaxFailedAttempts: cfg.realNameVerification.maxFailedAttempts,
    realNameVerificationCooldownMinutes: cfg.realNameVerification.cooldownMinutes,
    realNameVerificationHttpUrl: cfg.realNameVerification.httpUrl,
    realNameVerificationHttpToken: mask(cfg.realNameVerification.httpToken),
    realNameVerificationHttpTimeoutMs: cfg.realNameVerification.httpTimeoutMs,
    realNameVerificationHttpHeaders: cfg.realNameVerification.httpHeaders,
    agentModelOverrides: JSON.stringify(
      Object.fromEntries(
        Object.entries(cfg.agentModelOverrides).map(([agent, override]) => [
          agent,
          { ...override, ...(override.apiKey ? { apiKey: mask(override.apiKey) } : {}) },
        ]),
      ),
    ),
    imageApiKey: mask(cfg.image.apiKey),
    imageModel: cfg.image.model,
    imageBaseUrl: cfg.image.baseUrl,
    homepageConfig: decodeHomePageConfigFromEnv(process.env.HOMEPAGE_CONFIG_BASE64),
    friendlyLinks: decodeFriendlyLinksFromEnv(process.env.FRIENDLY_LINKS_BASE64),
    contentAuditProvider: process.env.CONTENT_AUDIT_PROVIDER || 'keyword',
    contentAuditApiKey: mask(process.env.CONTENT_AUDIT_API_KEY || ''),
    contentAuditSecretKey: mask(process.env.CONTENT_AUDIT_SECRET_KEY || ''),
    contentAuditRegion: process.env.CONTENT_AUDIT_REGION || 'ap-guangzhou',
    contentAuditPassThreshold: Number(process.env.CONTENT_AUDIT_PASS_THRESHOLD) || 60,
    contentAuditBlockThreshold: Number(process.env.CONTENT_AUDIT_BLOCK_THRESHOLD) || 80,
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: Number(process.env.SMTP_PORT) || 465,
    smtpSecure: (process.env.SMTP_SECURE ?? 'true') === 'true',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: mask(process.env.SMTP_PASS || ''),
    smtpFrom: process.env.SMTP_FROM || '',
    platformUrl: process.env.PLATFORM_URL || '',
    commentEnabled: readBoolEnv(process.env.COMMENT_ENABLED, false),
    momentsIdleCooldownHours: cfg.momentsIdleCooldownHours,
    baiduPushToken: mask(process.env.BAIDU_PUSH_TOKEN || ''),
    comicChapterEnabled: readBoolEnv(process.env.COMIC_CHAPTER_ENABLED, false),
    audiobookAccessMode: readAudiobookAccessMode(process.env.AUDIOBOOK_ACCESS_MODE),
    trendsEnabled: readBoolEnv(process.env.TRENDS_ENABLED, true),
    trendsSearchProvider: (['serpapi', 'bing', 'tavily', 'agent-reach', 'direct', 'none'].includes(process.env.TRENDS_SEARCH_PROVIDER ?? '')
      ? process.env.TRENDS_SEARCH_PROVIDER as 'serpapi' | 'bing' | 'tavily' | 'agent-reach' | 'direct' | 'none'
      : 'none'),
    trendsSearchApiKey: mask(process.env.TRENDS_SEARCH_API_KEY || ''),
    trendsSearchApiBaseUrl: process.env.TRENDS_SEARCH_API_BASE_URL || '',
    trendsScheduleHour: Math.max(0, Math.min(23, Number(process.env.TRENDS_SCHEDULE_HOUR) || 8)),
    trendsScheduleMinute: Math.max(0, Math.min(59, Number(process.env.TRENDS_SCHEDULE_MINUTE) || 0)),
    configured: !!cfg.model.apiKey,
  };
}

export async function writeSettings(payload: SettingsPayload): Promise<void> {
  let existing = '';
  if (fs.existsSync(ENV_FILE)) {
    existing = fs.readFileSync(ENV_FILE, 'utf-8');
  }

  const managed = new Set([
    'MODEL_PROVIDER', 'MODEL_API_KEY', 'MODEL_NAME', 'MODEL_BASE_URL', 'MODEL_STREAMING_ENABLED',
    'EMBEDDING_PROVIDER', 'EMBEDDING_API_KEY', 'EMBEDDING_MODEL', 'EMBEDDING_BASE_URL',
    'TTS_ENGINE', 'QWEN3_TTS_URL', 'TTS_NARRATION_ENGINE', 'KOKORO_URL',
    'CHARACTER_GUARDRAIL_MIN_CONFLICT_RATE',
    'CHARACTER_GUARDRAIL_MIN_HUMANITY_RATE',
    'CHARACTER_GUARDRAIL_MIN_STABILITY_SCORE',
    'ANTI_TEMPLATE_REPEATED_OPENER_MIN_COUNT',
    'ANTI_TEMPLATE_REPEATED_CLICHE_MIN_COUNT',
    'ANTI_TEMPLATE_LOOKBACK_CHAPTERS',
    'ANTI_AI_TELLS_ENABLED',
    'ANTI_AI_TELLS_REPEATED_MIN_COUNT',
    'ANTI_AI_TELLS_MAX_EXAMPLES',
    'ANTI_AI_TELLS_MAX_FREQUENT_ITEMS',
    'ANTI_AI_STRUCTURE_ENABLED',
    'ANTI_AI_STRUCTURE_TRANSITION_PER_1K_MAX',
    'ANTI_AI_STRUCTURE_REPEATED_MIN_COUNT',
    'ANTI_AI_STRUCTURE_MAX_EXAMPLES',
    'ANTI_AI_STRUCTURE_MAX_FREQUENT_ITEMS',
    'WORLD_CONTRACT_ENABLED',
    'WORLD_GATE_MODE',
    'WORLD_GATE_STRICT_FALLBACK_TO_WARN',
    'WORLD_RETRIEVAL_V2_ENABLED',
    'WORLD_RETRIEVAL_TOP_K',
    'OUTLINE_GATE_MODE',
    'OUTLINE_GATE_STRICT_FALLBACK_TO_WARN',
    'OUTLINE_GATE_MAX_REQUIRED',
    'QUALITY_GATE_MODE',
    'QUALITY_GATE_STRICT_FALLBACK_TO_WARN',
    'QUALITY_GATE_PASS_SCORE',
    'QUALITY_GATE_MIN_STRUCTURE_SCORE',
    'QUALITY_GATE_MIN_STYLE_SCORE',
    'QUALITY_GATE_MIN_EMOTION_SCORE',
    'CONTINUITY_GATE_MODE',
    'CONTINUITY_GATE_STRICT_FALLBACK_TO_WARN',
    'POWER_RULE_GATE_MODE',
    'POWER_RULE_GATE_STRICT_FALLBACK_TO_WARN',
    'SUPER_LONG_MODE_ENABLED',
    'TRUTH_FILES_ENABLED',
    'STRUCTURED_AUDIT_ENABLED',
    'SNAPSHOT_ENABLED',
    'AI_TRACE_GATE_MODE',
    'AUTO_REVISION_ENABLED',
    'AUTO_REVISION_SCORE_THRESHOLD',
    'AUTO_REVISION_MAX_ROUNDS',
    'AUTO_CURATE_ENABLED',
    'AUTHOR_NOTE_ENABLED',
    'CHAPTER_LENGTH_GUARD_ENABLED',
    'CHAPTER_LENGTH_GUARD_TRIGGER_PERCENT',
    'CHAPTER_LENGTH_GUARD_ALLOWED_PERCENT',
    'REGISTRATION_PROTECTION_ENABLED',
    'REGISTRATION_PER_HOUR',
    'REGISTRATION_PER_DAY',
    'NEW_USER_COOLDOWN_HOURS',
    'DISABLE_COVER_UPLOAD',
    'PUBLISH_MAX_PER_MONTH',
    'PUBLISH_UNLOCK_READS',
    'PUBLISH_UNLOCK_LIKES',
    'PUBLISH_UNLOCK_FAVORITES',
    'PUBLISH_UNLOCK_CHAPTERS',
    'AUTH_PASSWORD_MIN_LENGTH',
    'AUTH_PASSWORD_REQUIRE_LOWERCASE',
    'AUTH_PASSWORD_REQUIRE_UPPERCASE',
    'AUTH_PASSWORD_REQUIRE_NUMBERS',
    'AUTH_PASSWORD_REQUIRE_SPECIAL_CHARS',
    'USER_API_FEATURE_ENABLED',
    'USER_API_ALLOW_PLATFORM_CACHE',
    'USER_API_ALLOW_LOCAL_ONLY',
    'REAL_NAME_VERIFICATION_ENABLED',
    'REAL_NAME_VERIFICATION_PROVIDER',
    'REAL_NAME_REQUIRED_FOR_COMMENT',
    'REAL_NAME_REQUIRED_FOR_CREATOR_APPLICATION',
    'REAL_NAME_REQUIRED_FOR_BOOK_PUBLISHING',
    'REAL_NAME_REQUIRED_FOR_BILLING',
    'REAL_NAME_VERIFICATION_MAX_FAILED_ATTEMPTS',
    'REAL_NAME_VERIFICATION_COOLDOWN_MINUTES',
    'REAL_NAME_VERIFICATION_HTTP_URL',
    'REAL_NAME_VERIFICATION_HTTP_TOKEN',
    'REAL_NAME_VERIFICATION_HTTP_TIMEOUT_MS',
    'REAL_NAME_VERIFICATION_HTTP_HEADERS',
    'AGENT_MODEL_OVERRIDES',
    'IMAGE_API_KEY', 'IMAGE_MODEL', 'IMAGE_BASE_URL',
    'HOMEPAGE_CONFIG_BASE64',
    'CONTENT_AUDIT_PROVIDER', 'CONTENT_AUDIT_API_KEY', 'CONTENT_AUDIT_SECRET_KEY',
    'CONTENT_AUDIT_REGION', 'CONTENT_AUDIT_PASS_THRESHOLD', 'CONTENT_AUDIT_BLOCK_THRESHOLD',
    'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'OPENAI_API_KEY', 'OPENAI_MODEL',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'PLATFORM_URL',
    'COMMENT_ENABLED',
    'MOMENTS_IDLE_COOLDOWN_HOURS',
    'BAIDU_PUSH_TOKEN',
    'COMIC_CHAPTER_ENABLED',
    'AUDIOBOOK_ACCESS_MODE',
    'TRENDS_ENABLED',
    'TRENDS_SEARCH_PROVIDER',
    'TRENDS_SEARCH_API_KEY',
    'TRENDS_SEARCH_API_BASE_URL',
    'TRENDS_SCHEDULE_HOUR',
    'TRENDS_SCHEDULE_MINUTE',
    'FRIENDLY_LINKS_BASE64',
  ]);

  const preserved = existing
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return true;
      const key = trimmed.split('=')[0]?.trim();
      return !managed.has(key ?? '');
    });

  const cfg = getConfig();
  const resolveKey = (newVal: string, oldVal: string) =>
    newVal.includes('****') ? oldVal : newVal;

  /** 逐个还原多 Key（逗号分隔），已掩码的 Key 还原为对应位置的旧值 */
  const resolveMultiKeys = (newCsv: string, oldKeys: string[]): string => {
    const parts = newCsv.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return '';
    return parts.map((part, i) => {
      if (part.includes('****')) {
        return oldKeys[i] ?? part;
      }
      return part;
    }).join(',');
  };

  const modelKey = resolveMultiKeys(
    payload.modelApiKey,
    cfg.model.apiKeys.length > 0 ? cfg.model.apiKeys : [cfg.model.apiKey],
  );
  const embeddingKey = resolveMultiKeys(
    payload.embeddingApiKey,
    cfg.embedding.apiKeys.length > 0 ? cfg.embedding.apiKeys : [cfg.embedding.apiKey],
  );
  const imageKey = resolveKey(payload.imageApiKey, cfg.image.apiKey);
  const realNameHttpToken = resolveKey(payload.realNameVerificationHttpToken, cfg.realNameVerification.httpToken);
  const contentAuditApiKey = resolveKey(payload.contentAuditApiKey, process.env.CONTENT_AUDIT_API_KEY || '');
  const contentAuditSecretKey = resolveKey(payload.contentAuditSecretKey, process.env.CONTENT_AUDIT_SECRET_KEY || '');
  const smtpPass = resolveKey(payload.smtpPass, process.env.SMTP_PASS || '');
  const baiduPushToken = resolveKey(payload.baiduPushToken, process.env.BAIDU_PUSH_TOKEN || '');
  const trendsSearchApiKey = resolveKey(payload.trendsSearchApiKey, process.env.TRENDS_SEARCH_API_KEY || '');
  const homepageConfigBase64 = encodeHomePageConfigForEnv(normalizeHomePageConfig(payload.homepageConfig));
  const friendlyLinksBase64 = encodeFriendlyLinksForEnv(normalizeFriendlyLinks(payload.friendlyLinks));

  const newLines = [
    ...preserved,
    '',
    '# === Managed by settings page ===',
    `MODEL_PROVIDER=${payload.modelProvider}`,
    `MODEL_API_KEY=${modelKey}`,
    `MODEL_NAME=${payload.modelName}`,
    `MODEL_BASE_URL=${payload.modelBaseUrl}`,
    `MODEL_STREAMING_ENABLED=${payload.modelStreamingEnabled ? 'true' : 'false'}`,
    `EMBEDDING_PROVIDER=${payload.embeddingProvider}`,
    `EMBEDDING_API_KEY=${embeddingKey}`,
    `EMBEDDING_MODEL=${payload.embeddingModel}`,
    `EMBEDDING_BASE_URL=${payload.embeddingBaseUrl}`,
    `TTS_ENGINE=${payload.ttsEngine || 'edge-tts'}`,
    `TTS_NARRATION_ENGINE=${payload.ttsNarrationEngine || 'edge-tts'}`,
    `QWEN3_TTS_URL=${payload.qwen3TtsUrl || 'http://127.0.0.1:8765'}`,
    `KOKORO_URL=${payload.kokoroUrl || 'http://127.0.0.1:8767'}`,
    `CHARACTER_GUARDRAIL_MIN_CONFLICT_RATE=${payload.characterGuardrailMinConflictRate}`,
    `CHARACTER_GUARDRAIL_MIN_HUMANITY_RATE=${payload.characterGuardrailMinHumanityRate}`,
    `CHARACTER_GUARDRAIL_MIN_STABILITY_SCORE=${payload.characterGuardrailMinStabilityScore}`,
    `ANTI_TEMPLATE_REPEATED_OPENER_MIN_COUNT=${payload.antiTemplateRepeatedOpenerMinCount}`,
    `ANTI_TEMPLATE_REPEATED_CLICHE_MIN_COUNT=${payload.antiTemplateRepeatedClicheMinCount}`,
    `ANTI_TEMPLATE_LOOKBACK_CHAPTERS=${payload.antiTemplateLookbackChapters}`,
    `ANTI_AI_TELLS_ENABLED=${payload.antiAiTellsEnabled ? 'true' : 'false'}`,
    `ANTI_AI_TELLS_REPEATED_MIN_COUNT=${payload.antiAiTellsRepeatedMinCount}`,
    `ANTI_AI_TELLS_MAX_EXAMPLES=${payload.antiAiTellsMaxExamples}`,
    `ANTI_AI_TELLS_MAX_FREQUENT_ITEMS=${payload.antiAiTellsMaxFrequentItems}`,
    `ANTI_AI_STRUCTURE_ENABLED=${payload.antiAiStructureEnabled ? 'true' : 'false'}`,
    `ANTI_AI_STRUCTURE_TRANSITION_PER_1K_MAX=${payload.antiAiStructureTransitionPer1kMax}`,
    `ANTI_AI_STRUCTURE_REPEATED_MIN_COUNT=${payload.antiAiStructureRepeatedMinCount}`,
    `ANTI_AI_STRUCTURE_MAX_EXAMPLES=${payload.antiAiStructureMaxExamples}`,
    `ANTI_AI_STRUCTURE_MAX_FREQUENT_ITEMS=${payload.antiAiStructureMaxFrequentItems}`,
    `WORLD_CONTRACT_ENABLED=${payload.worldContractEnabled ? 'true' : 'false'}`,
    `WORLD_GATE_MODE=${payload.worldGateMode}`,
    `WORLD_GATE_STRICT_FALLBACK_TO_WARN=${payload.worldGateStrictFallbackToWarn ? 'true' : 'false'}`,
    `WORLD_RETRIEVAL_V2_ENABLED=${payload.worldRetrievalV2Enabled ? 'true' : 'false'}`,
    `WORLD_RETRIEVAL_TOP_K=${payload.worldRetrievalTopK}`,
    `OUTLINE_GATE_MODE=${payload.outlineGateMode}`,
    `OUTLINE_GATE_STRICT_FALLBACK_TO_WARN=${payload.outlineGateStrictFallbackToWarn ? 'true' : 'false'}`,
    `OUTLINE_GATE_MAX_REQUIRED=${payload.outlineGateMaxRequired}`,
    `QUALITY_GATE_MODE=${payload.qualityGateMode}`,
    `QUALITY_GATE_STRICT_FALLBACK_TO_WARN=${payload.qualityGateStrictFallbackToWarn ? 'true' : 'false'}`,
    `QUALITY_GATE_PASS_SCORE=${payload.qualityGatePassScore}`,
    `QUALITY_GATE_MIN_STRUCTURE_SCORE=${payload.qualityGateMinStructureScore}`,
    `QUALITY_GATE_MIN_STYLE_SCORE=${payload.qualityGateMinStyleScore}`,
    `QUALITY_GATE_MIN_EMOTION_SCORE=${payload.qualityGateMinEmotionScore}`,
    `CONTINUITY_GATE_MODE=${payload.continuityGateMode}`,
    `CONTINUITY_GATE_STRICT_FALLBACK_TO_WARN=${payload.continuityGateStrictFallbackToWarn ? 'true' : 'false'}`,
    `POWER_RULE_GATE_MODE=${payload.powerRuleGateMode}`,
    `POWER_RULE_GATE_STRICT_FALLBACK_TO_WARN=${payload.powerRuleGateStrictFallbackToWarn ? 'true' : 'false'}`,
    `SUPER_LONG_MODE_ENABLED=${payload.superLongModeEnabled ? 'true' : 'false'}`,
    `TRUTH_FILES_ENABLED=${payload.truthFilesEnabled ? 'true' : 'false'}`,
    `STRUCTURED_AUDIT_ENABLED=${payload.structuredAuditEnabled ? 'true' : 'false'}`,
    `SNAPSHOT_ENABLED=${payload.snapshotEnabled ? 'true' : 'false'}`,
    `AI_TRACE_GATE_MODE=${payload.aiTraceGateMode}`,
    `AUTO_REVISION_ENABLED=${payload.autoRevisionEnabled ? 'true' : 'false'}`,
    `AUTO_REVISION_SCORE_THRESHOLD=${payload.autoRevisionScoreThreshold}`,
    `AUTO_REVISION_MAX_ROUNDS=${payload.autoRevisionMaxRounds}`,
    `QUALITY_FLOOR_REVISION_ENABLED=${payload.qualityFloorRevisionEnabled ? 'true' : 'false'}`,
    `AUTO_CURATE_ENABLED=${payload.autoCurateEnabled ? 'true' : 'false'}`,
    `AUTO_FINALIZE_ENABLED=${payload.autoFinalizeEnabled ? 'true' : 'false'}`,
    `AUTHOR_NOTE_ENABLED=${payload.authorNoteEnabled ? 'true' : 'false'}`,
    `CHAPTER_LENGTH_GUARD_ENABLED=${payload.chapterLengthGuardEnabled ? 'true' : 'false'}`,
    `CHAPTER_LENGTH_GUARD_TRIGGER_PERCENT=${payload.chapterLengthGuardTriggerPercent}`,
    `CHAPTER_LENGTH_GUARD_ALLOWED_PERCENT=${payload.chapterLengthGuardAllowedPercent}`,
    `REGISTRATION_PROTECTION_ENABLED=${payload.registrationProtectionEnabled ? 'true' : 'false'}`,
    `REGISTRATION_PER_HOUR=${payload.registrationProtectionRegPerHour}`,
    `REGISTRATION_PER_DAY=${payload.registrationProtectionRegPerDay}`,
    `NEW_USER_COOLDOWN_HOURS=${payload.newUserCooldownHours}`,
    `DISABLE_COVER_UPLOAD=${payload.disableCoverUpload ? 'true' : 'false'}`,
    `PUBLISH_MAX_PER_MONTH=${payload.publishMaxPerMonth}`,
    `PUBLISH_UNLOCK_READS=${payload.publishUnlockReads}`,
    `PUBLISH_UNLOCK_LIKES=${payload.publishUnlockLikes}`,
    `PUBLISH_UNLOCK_FAVORITES=${payload.publishUnlockFavorites}`,
    `PUBLISH_UNLOCK_CHAPTERS=${payload.publishUnlockChapters}`,
    `AUTH_PASSWORD_MIN_LENGTH=${payload.authPasswordMinLength}`,
    `AUTH_PASSWORD_REQUIRE_LOWERCASE=${payload.authPasswordRequireLowercase ? 'true' : 'false'}`,
    `AUTH_PASSWORD_REQUIRE_UPPERCASE=${payload.authPasswordRequireUppercase ? 'true' : 'false'}`,
    `AUTH_PASSWORD_REQUIRE_NUMBERS=${payload.authPasswordRequireNumbers ? 'true' : 'false'}`,
    `AUTH_PASSWORD_REQUIRE_SPECIAL_CHARS=${payload.authPasswordRequireSpecialChars ? 'true' : 'false'}`,
    `USER_API_FEATURE_ENABLED=${payload.userApiFeatureEnabled ? 'true' : 'false'}`,
    `USER_API_ALLOW_PLATFORM_CACHE=${payload.userApiAllowPlatformCache ? 'true' : 'false'}`,
    `USER_API_ALLOW_LOCAL_ONLY=${payload.userApiAllowLocalOnly ? 'true' : 'false'}`,
    `REAL_NAME_VERIFICATION_ENABLED=${payload.realNameVerificationEnabled ? 'true' : 'false'}`,
    `REAL_NAME_VERIFICATION_PROVIDER=${payload.realNameVerificationProvider}`,
    `REAL_NAME_REQUIRED_FOR_COMMENT=${payload.realNameRequiredForComment ? 'true' : 'false'}`,
    `REAL_NAME_REQUIRED_FOR_CREATOR_APPLICATION=${payload.realNameRequiredForCreatorApplication ? 'true' : 'false'}`,
    `REAL_NAME_REQUIRED_FOR_BOOK_PUBLISHING=${payload.realNameRequiredForBookPublishing ? 'true' : 'false'}`,
    `REAL_NAME_REQUIRED_FOR_BILLING=${payload.realNameRequiredForBilling ? 'true' : 'false'}`,
    `REAL_NAME_VERIFICATION_MAX_FAILED_ATTEMPTS=${payload.realNameVerificationMaxFailedAttempts}`,
    `REAL_NAME_VERIFICATION_COOLDOWN_MINUTES=${payload.realNameVerificationCooldownMinutes}`,
    `REAL_NAME_VERIFICATION_HTTP_URL=${payload.realNameVerificationHttpUrl}`,
    `REAL_NAME_VERIFICATION_HTTP_TOKEN=${realNameHttpToken}`,
    `REAL_NAME_VERIFICATION_HTTP_TIMEOUT_MS=${payload.realNameVerificationHttpTimeoutMs}`,
    `REAL_NAME_VERIFICATION_HTTP_HEADERS=${payload.realNameVerificationHttpHeaders}`,
    `AGENT_MODEL_OVERRIDES=${payload.agentModelOverrides || '{}'}`,
    `IMAGE_API_KEY=${imageKey}`,
    `IMAGE_MODEL=${payload.imageModel}`,
    `IMAGE_BASE_URL=${payload.imageBaseUrl}`,
    `CONTENT_AUDIT_PROVIDER=${payload.contentAuditProvider}`,
    `CONTENT_AUDIT_API_KEY=${contentAuditApiKey}`,
    `CONTENT_AUDIT_SECRET_KEY=${contentAuditSecretKey}`,
    `CONTENT_AUDIT_REGION=${payload.contentAuditRegion}`,
    `CONTENT_AUDIT_PASS_THRESHOLD=${payload.contentAuditPassThreshold}`,
    `CONTENT_AUDIT_BLOCK_THRESHOLD=${payload.contentAuditBlockThreshold}`,
    `HOMEPAGE_CONFIG_BASE64=${homepageConfigBase64}`,
    `FRIENDLY_LINKS_BASE64=${friendlyLinksBase64}`,
    `SMTP_HOST=${payload.smtpHost}`,
    `SMTP_PORT=${payload.smtpPort}`,
    `SMTP_SECURE=${payload.smtpSecure ? 'true' : 'false'}`,
    `SMTP_USER=${payload.smtpUser}`,
    `SMTP_PASS=${smtpPass}`,
    `SMTP_FROM=${payload.smtpFrom}`,
    `PLATFORM_URL=${payload.platformUrl}`,
    `COMMENT_ENABLED=${payload.commentEnabled ? 'true' : 'false'}`,
    `MOMENTS_IDLE_COOLDOWN_HOURS=${payload.momentsIdleCooldownHours}`,
    `BAIDU_PUSH_TOKEN=${baiduPushToken}`,
    `COMIC_CHAPTER_ENABLED=${payload.comicChapterEnabled ? 'true' : 'false'}`,
    `AUDIOBOOK_ACCESS_MODE=${payload.audiobookAccessMode}`,
    `TRENDS_ENABLED=${payload.trendsEnabled ? 'true' : 'false'}`,
    `TRENDS_SEARCH_PROVIDER=${payload.trendsSearchProvider}`,
    `TRENDS_SEARCH_API_KEY=${trendsSearchApiKey}`,
    `TRENDS_SEARCH_API_BASE_URL=${payload.trendsSearchApiBaseUrl}`,
    `TRENDS_SCHEDULE_HOUR=${payload.trendsScheduleHour}`,
    `TRENDS_SCHEDULE_MINUTE=${payload.trendsScheduleMinute}`,
    '',
  ];

  fs.writeFileSync(ENV_FILE, newLines.join('\n'), 'utf-8');
  // 同时写入备份文件，防止 Docker 重建后丢失
  if (DATA_DIR_ENV_BACKUP) {
    // 只备份 managed 段的内容（从 # === Managed 标记行开始）
    const managedStart = newLines.indexOf('# === Managed by settings page ===');
    if (managedStart >= 0) {
      fs.writeFileSync(DATA_DIR_ENV_BACKUP, newLines.slice(managedStart).join('\n'), 'utf-8');
    }
  }

  process.env.MODEL_PROVIDER = payload.modelProvider;
  process.env.MODEL_API_KEY = modelKey;
  process.env.MODEL_NAME = payload.modelName;
  process.env.MODEL_BASE_URL = payload.modelBaseUrl;
  process.env.MODEL_STREAMING_ENABLED = payload.modelStreamingEnabled ? 'true' : 'false';
  process.env.EMBEDDING_PROVIDER = payload.embeddingProvider;
  process.env.EMBEDDING_API_KEY = embeddingKey;
  process.env.EMBEDDING_MODEL = payload.embeddingModel;
  process.env.EMBEDDING_BASE_URL = payload.embeddingBaseUrl;
  process.env.TTS_ENGINE = payload.ttsEngine || 'edge-tts';
  process.env.TTS_NARRATION_ENGINE = payload.ttsNarrationEngine || 'edge-tts';
  process.env.QWEN3_TTS_URL = payload.qwen3TtsUrl || 'http://127.0.0.1:8765';
  process.env.KOKORO_URL = payload.kokoroUrl || 'http://127.0.0.1:8767';
  process.env.CHARACTER_GUARDRAIL_MIN_CONFLICT_RATE = String(payload.characterGuardrailMinConflictRate);
  process.env.CHARACTER_GUARDRAIL_MIN_HUMANITY_RATE = String(payload.characterGuardrailMinHumanityRate);
  process.env.CHARACTER_GUARDRAIL_MIN_STABILITY_SCORE = String(payload.characterGuardrailMinStabilityScore);
  process.env.ANTI_TEMPLATE_REPEATED_OPENER_MIN_COUNT = String(payload.antiTemplateRepeatedOpenerMinCount);
  process.env.ANTI_TEMPLATE_REPEATED_CLICHE_MIN_COUNT = String(payload.antiTemplateRepeatedClicheMinCount);
  process.env.ANTI_TEMPLATE_LOOKBACK_CHAPTERS = String(payload.antiTemplateLookbackChapters);
  process.env.ANTI_AI_TELLS_ENABLED = payload.antiAiTellsEnabled ? 'true' : 'false';
  process.env.ANTI_AI_TELLS_REPEATED_MIN_COUNT = String(payload.antiAiTellsRepeatedMinCount);
  process.env.ANTI_AI_TELLS_MAX_EXAMPLES = String(payload.antiAiTellsMaxExamples);
  process.env.ANTI_AI_TELLS_MAX_FREQUENT_ITEMS = String(payload.antiAiTellsMaxFrequentItems);
  process.env.ANTI_AI_STRUCTURE_ENABLED = payload.antiAiStructureEnabled ? 'true' : 'false';
  process.env.ANTI_AI_STRUCTURE_TRANSITION_PER_1K_MAX = String(payload.antiAiStructureTransitionPer1kMax);
  process.env.ANTI_AI_STRUCTURE_REPEATED_MIN_COUNT = String(payload.antiAiStructureRepeatedMinCount);
  process.env.ANTI_AI_STRUCTURE_MAX_EXAMPLES = String(payload.antiAiStructureMaxExamples);
  process.env.ANTI_AI_STRUCTURE_MAX_FREQUENT_ITEMS = String(payload.antiAiStructureMaxFrequentItems);
  process.env.WORLD_CONTRACT_ENABLED = payload.worldContractEnabled ? 'true' : 'false';
  process.env.WORLD_GATE_MODE = payload.worldGateMode;
  process.env.WORLD_GATE_STRICT_FALLBACK_TO_WARN = payload.worldGateStrictFallbackToWarn ? 'true' : 'false';
  process.env.WORLD_RETRIEVAL_V2_ENABLED = payload.worldRetrievalV2Enabled ? 'true' : 'false';
  process.env.WORLD_RETRIEVAL_TOP_K = String(payload.worldRetrievalTopK);
  process.env.OUTLINE_GATE_MODE = payload.outlineGateMode;
  process.env.OUTLINE_GATE_STRICT_FALLBACK_TO_WARN = payload.outlineGateStrictFallbackToWarn ? 'true' : 'false';
  process.env.OUTLINE_GATE_MAX_REQUIRED = String(payload.outlineGateMaxRequired);
  process.env.QUALITY_GATE_MODE = payload.qualityGateMode;
  process.env.QUALITY_GATE_STRICT_FALLBACK_TO_WARN = payload.qualityGateStrictFallbackToWarn ? 'true' : 'false';
  process.env.QUALITY_GATE_PASS_SCORE = String(payload.qualityGatePassScore);
  process.env.QUALITY_GATE_MIN_STRUCTURE_SCORE = String(payload.qualityGateMinStructureScore);
  process.env.QUALITY_GATE_MIN_STYLE_SCORE = String(payload.qualityGateMinStyleScore);
  process.env.QUALITY_GATE_MIN_EMOTION_SCORE = String(payload.qualityGateMinEmotionScore);
  process.env.CONTINUITY_GATE_MODE = payload.continuityGateMode;
  process.env.CONTINUITY_GATE_STRICT_FALLBACK_TO_WARN = payload.continuityGateStrictFallbackToWarn ? 'true' : 'false';
  process.env.POWER_RULE_GATE_MODE = payload.powerRuleGateMode;
  process.env.POWER_RULE_GATE_STRICT_FALLBACK_TO_WARN = payload.powerRuleGateStrictFallbackToWarn ? 'true' : 'false';
  process.env.SUPER_LONG_MODE_ENABLED = payload.superLongModeEnabled ? 'true' : 'false';
  process.env.TRUTH_FILES_ENABLED = payload.truthFilesEnabled ? 'true' : 'false';
  process.env.STRUCTURED_AUDIT_ENABLED = payload.structuredAuditEnabled ? 'true' : 'false';
  process.env.SNAPSHOT_ENABLED = payload.snapshotEnabled ? 'true' : 'false';
  process.env.AI_TRACE_GATE_MODE = payload.aiTraceGateMode;
  process.env.AUTO_REVISION_ENABLED = payload.autoRevisionEnabled ? 'true' : 'false';
  process.env.AUTO_REVISION_SCORE_THRESHOLD = String(payload.autoRevisionScoreThreshold);
  process.env.AUTO_REVISION_MAX_ROUNDS = String(payload.autoRevisionMaxRounds);
  process.env.QUALITY_FLOOR_REVISION_ENABLED = payload.qualityFloorRevisionEnabled ? 'true' : 'false';
  process.env.AUTO_CURATE_ENABLED = payload.autoCurateEnabled ? 'true' : 'false';
  process.env.AUTO_FINALIZE_ENABLED = payload.autoFinalizeEnabled ? 'true' : 'false';
  process.env.AUTHOR_NOTE_ENABLED = payload.authorNoteEnabled ? 'true' : 'false';
  process.env.CHAPTER_LENGTH_GUARD_ENABLED = payload.chapterLengthGuardEnabled ? 'true' : 'false';
  process.env.CHAPTER_LENGTH_GUARD_TRIGGER_PERCENT = String(payload.chapterLengthGuardTriggerPercent);
  process.env.CHAPTER_LENGTH_GUARD_ALLOWED_PERCENT = String(payload.chapterLengthGuardAllowedPercent);
  process.env.REGISTRATION_PROTECTION_ENABLED = payload.registrationProtectionEnabled ? 'true' : 'false';
  process.env.REGISTRATION_PER_HOUR = String(payload.registrationProtectionRegPerHour);
  process.env.REGISTRATION_PER_DAY = String(payload.registrationProtectionRegPerDay);
  process.env.NEW_USER_COOLDOWN_HOURS = String(payload.newUserCooldownHours);
  process.env.DISABLE_COVER_UPLOAD = payload.disableCoverUpload ? 'true' : 'false';
  process.env.PUBLISH_MAX_PER_MONTH = String(payload.publishMaxPerMonth);
  process.env.PUBLISH_UNLOCK_READS = String(payload.publishUnlockReads);
  process.env.PUBLISH_UNLOCK_LIKES = String(payload.publishUnlockLikes);
  process.env.PUBLISH_UNLOCK_FAVORITES = String(payload.publishUnlockFavorites);
  process.env.PUBLISH_UNLOCK_CHAPTERS = String(payload.publishUnlockChapters);
  process.env.AUTH_PASSWORD_MIN_LENGTH = String(payload.authPasswordMinLength);
  process.env.AUTH_PASSWORD_REQUIRE_LOWERCASE = payload.authPasswordRequireLowercase ? 'true' : 'false';
  process.env.AUTH_PASSWORD_REQUIRE_UPPERCASE = payload.authPasswordRequireUppercase ? 'true' : 'false';
  process.env.AUTH_PASSWORD_REQUIRE_NUMBERS = payload.authPasswordRequireNumbers ? 'true' : 'false';
  process.env.AUTH_PASSWORD_REQUIRE_SPECIAL_CHARS = payload.authPasswordRequireSpecialChars ? 'true' : 'false';
  process.env.USER_API_FEATURE_ENABLED = payload.userApiFeatureEnabled ? 'true' : 'false';
  process.env.USER_API_ALLOW_PLATFORM_CACHE = payload.userApiAllowPlatformCache ? 'true' : 'false';
  process.env.USER_API_ALLOW_LOCAL_ONLY = payload.userApiAllowLocalOnly ? 'true' : 'false';
  process.env.REAL_NAME_VERIFICATION_ENABLED = payload.realNameVerificationEnabled ? 'true' : 'false';
  process.env.REAL_NAME_VERIFICATION_PROVIDER = payload.realNameVerificationProvider;
  process.env.REAL_NAME_REQUIRED_FOR_COMMENT = payload.realNameRequiredForComment ? 'true' : 'false';
  process.env.REAL_NAME_REQUIRED_FOR_CREATOR_APPLICATION = payload.realNameRequiredForCreatorApplication ? 'true' : 'false';
  process.env.REAL_NAME_REQUIRED_FOR_BOOK_PUBLISHING = payload.realNameRequiredForBookPublishing ? 'true' : 'false';
  process.env.REAL_NAME_REQUIRED_FOR_BILLING = payload.realNameRequiredForBilling ? 'true' : 'false';
  process.env.REAL_NAME_VERIFICATION_MAX_FAILED_ATTEMPTS = String(payload.realNameVerificationMaxFailedAttempts);
  process.env.REAL_NAME_VERIFICATION_COOLDOWN_MINUTES = String(payload.realNameVerificationCooldownMinutes);
  process.env.REAL_NAME_VERIFICATION_HTTP_URL = payload.realNameVerificationHttpUrl;
  process.env.REAL_NAME_VERIFICATION_HTTP_TOKEN = realNameHttpToken;
  process.env.REAL_NAME_VERIFICATION_HTTP_TIMEOUT_MS = String(payload.realNameVerificationHttpTimeoutMs);
  process.env.REAL_NAME_VERIFICATION_HTTP_HEADERS = payload.realNameVerificationHttpHeaders;
  process.env.AGENT_MODEL_OVERRIDES = payload.agentModelOverrides || '{}';
  process.env.IMAGE_API_KEY = imageKey;
  process.env.IMAGE_MODEL = payload.imageModel;
  process.env.IMAGE_BASE_URL = payload.imageBaseUrl;
  process.env.CONTENT_AUDIT_PROVIDER = payload.contentAuditProvider;
  process.env.CONTENT_AUDIT_API_KEY = contentAuditApiKey;
  process.env.CONTENT_AUDIT_SECRET_KEY = contentAuditSecretKey;
  process.env.CONTENT_AUDIT_REGION = payload.contentAuditRegion;
  process.env.CONTENT_AUDIT_PASS_THRESHOLD = String(payload.contentAuditPassThreshold);
  process.env.CONTENT_AUDIT_BLOCK_THRESHOLD = String(payload.contentAuditBlockThreshold);
  process.env.HOMEPAGE_CONFIG_BASE64 = homepageConfigBase64;
  process.env.FRIENDLY_LINKS_BASE64 = friendlyLinksBase64;
  process.env.SMTP_HOST = payload.smtpHost;
  process.env.SMTP_PORT = String(payload.smtpPort);
  process.env.SMTP_SECURE = payload.smtpSecure ? 'true' : 'false';
  process.env.SMTP_USER = payload.smtpUser;
  process.env.SMTP_PASS = smtpPass;
  process.env.SMTP_FROM = payload.smtpFrom;
  process.env.PLATFORM_URL = payload.platformUrl;
  process.env.COMMENT_ENABLED = payload.commentEnabled ? 'true' : 'false';
  process.env.MOMENTS_IDLE_COOLDOWN_HOURS = String(payload.momentsIdleCooldownHours);
  process.env.BAIDU_PUSH_TOKEN = baiduPushToken;
  process.env.COMIC_CHAPTER_ENABLED = payload.comicChapterEnabled ? 'true' : 'false';
  process.env.AUDIOBOOK_ACCESS_MODE = payload.audiobookAccessMode;

  await reloadConfig();
}
