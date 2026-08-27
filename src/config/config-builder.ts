import { z } from 'zod';
import path from 'node:path';
import {
  parseAgentModelOverrides,
  readBoolEnv,
  readContinuityGateModeEnv,
  readFloatEnv,
  readIntEnv,
  readOutlineGateModeEnv,
  readPowerRuleGateModeEnv,
  readQualityGateModeEnv,
  readWorldGateModeEnv,
} from './env-readers.js';
import { parseApiKeyList } from '../models/api-key-rotation.js';

const ALL_PROVIDERS = [
  'anthropic', 'openai', 'custom-openai', 'ollama', 'deepseek', 'qwen', 'zhipu',
  'moonshot', 'doubao', 'baichuan', 'stepfun', 'minimax', 'siliconflow',
] as const;

const ConfigSchema = z.object({
  model: z.object({
    provider: z.enum(ALL_PROVIDERS).default('deepseek'),
    apiKey: z.string().default(''),
    apiKeys: z.array(z.string()).default([]),
    model: z.string().default('deepseek-chat'),
    baseUrl: z.string().default(''),
  }),
  embedding: z.object({
    provider: z.string().default('openai'),
    apiKey: z.string().default(''),
    apiKeys: z.array(z.string()).default([]),
    model: z.string().default('BAAI/bge-large-zh-v1.5'),
    baseUrl: z.string().default('https://api.siliconflow.cn/v1'),
  }),
  tts: z.object({
    engine: z.enum(['edge-tts', 'qwen3-tts', 'azure-tts', 'openai-tts']).default('edge-tts'),
    narrationEngine: z.enum(['edge-tts', 'kokoro']).default('edge-tts'),
    qwen3Url: z.string().default('http://127.0.0.1:8765'),
    kokoroUrl: z.string().default('http://127.0.0.1:8767'),
    azureKey: z.string().default(''),
    azureRegion: z.string().default('eastasia'),
    openaiKey: z.string().default(''),
    openaiBaseUrl: z.string().default(''),
    openaiModel: z.string().default('tts-1'),
  }),
  image: z.object({
    apiKey: z.string().default(''),
    model: z.string().default('gpt-image-2'),
    baseUrl: z.string().default(''),
  }),
  server: z.object({
    port: z.number().int().positive().default(3001),
    host: z.string().default('127.0.0.1'),
  }),
  chapterEnhancement: z.object({
    consistency: z.object({
      minConflictRate: z.number().int().min(0).max(100).default(30),
      minHumanityRate: z.number().int().min(0).max(100).default(45),
      minStabilityScore: z.number().int().min(0).max(100).default(45),
    }),
    antiTemplate: z.object({
      repeatedOpenerMinCount: z.number().int().min(1).max(20).default(2),
      repeatedClicheMinCount: z.number().int().min(1).max(20).default(3),
      lookbackChapters: z.number().int().min(1).max(20).default(3),
    }),
    antiAiTells: z.object({
      enabled: z.boolean().default(true),
      repeatedMinCount: z.number().int().min(1).max(50).default(2),
      maxExamples: z.number().int().min(0).max(60).default(18),
      maxFrequentItems: z.number().int().min(0).max(30).default(8),
    }),
    antiAiStructure: z.object({
      enabled: z.boolean().default(true),
      transitionWordsPer1kMax: z.number().int().min(1).max(50).default(8),
      repeatedMinCount: z.number().int().min(1).max(50).default(2),
      maxExamples: z.number().int().min(0).max(60).default(16),
      maxFrequentItems: z.number().int().min(0).max(30).default(8),
    }),
  }),
  worldFeatures: z.object({
    contractEnabled: z.boolean().default(true),
    gateMode: z.enum(['off', 'warn', 'strict']).default('warn'),
    strictFallbackToWarn: z.boolean().default(true),
    retrievalV2Enabled: z.boolean().default(true),
    retrievalTopK: z.number().int().min(4).max(30).default(10),
  }),
  outlineFeatures: z.object({
    gateMode: z.enum(['off', 'warn', 'strict']).default('warn'),
    strictFallbackToWarn: z.boolean().default(true),
    maxRequired: z.number().int().min(2).max(12).default(8),
  }),
  qualityFeatures: z.object({
    gateMode: z.enum(['off', 'warn', 'strict']).default('warn'),
    strictFallbackToWarn: z.boolean().default(true),
    passScore: z.number().int().min(40).max(100).default(76),
    minStructureScore: z.number().int().min(30).max(100).default(65),
    minStyleScore: z.number().int().min(30).max(100).default(62),
    minEmotionScore: z.number().int().min(30).max(100).default(58),
  }),
  continuityFeatures: z.object({
    gateMode: z.enum(['off', 'warn', 'strict']).default('warn'),
    strictFallbackToWarn: z.boolean().default(true),
  }),
  powerRuleFeatures: z.object({
    gateMode: z.enum(['off', 'warn', 'strict']).default('warn'),
    strictFallbackToWarn: z.boolean().default(true),
  }),
  autoRevision: z.object({
    enabled: z.boolean().default(false),
    scoreThreshold: z.number().min(1).max(10).default(7.2),
    maxRounds: z.number().int().min(1).max(5).default(3),
    /**
     * 质量地板强制修订开关。为 true 时，即使 enabled=false，命中质量地板
     * （低分/停滞/读者交付缺失）也会触发 writer+editor 重写循环。
     * 默认开启，避免章节已明显低于读者交付地板仍被当成可交付结果。
     */
    qualityFloorRevisionEnabled: z.boolean().default(true),
  }),
  autoCurate: z.object({
    enabled: z.boolean().default(false),
  }),
  autoFinalize: z.object({
    enabled: z.boolean().default(true),
  }),
  authorNote: z.object({
    enabled: z.boolean().default(true),
  }),
  realNameVerification: z.object({
    enabled: z.boolean().default(false),
    provider: z.enum(['basic_submission', 'mock_identity', 'http_bridge']).default('basic_submission'),
    requiredForComment: z.boolean().default(false),
    requiredForCreatorApplication: z.boolean().default(true),
    requiredForBookPublishing: z.boolean().default(true),
    requiredForBilling: z.boolean().default(true),
    maxFailedAttempts: z.number().int().min(1).max(20).default(3),
    cooldownMinutes: z.number().int().min(1).max(1440).default(30),
    httpUrl: z.string().default(''),
    httpToken: z.string().default(''),
    httpTimeoutMs: z.number().int().min(1000).max(60000).default(8000),
    httpHeaders: z.string().default(''),
  }),
  memory: z.object({
    hybridSearchEnabled: z.boolean().default(true),
  }),
  agentModelOverrides: z.record(z.object({
    provider: z.string(),
    apiKey: z.string(),
    model: z.string(),
    baseUrl: z.string(),
  })).default({}),
  log: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'text']).default('text'),
  }),
  backup: z.object({
    autoBackupOnDelete: z.boolean().default(true),
    maxBackupsPerNovel: z.number().int().min(1).max(100).default(10),
  }),
  registrationProtection: z.object({
    enabled: z.boolean().default(true),
    regPerHour: z.number().int().min(1).max(20).default(2),
    regPerDay: z.number().int().min(1).max(50).default(5),
  }),
  newUserCooldownHours: z.number().int().min(0).max(720).default(24),
  disableCoverUpload: z.boolean().default(true),
  publishLimits: z.object({
    maxPerMonth: z.number().int().min(1).max(50).default(3),
    unlockReads: z.number().int().min(1).max(100000).default(100),
    unlockLikes: z.number().int().min(0).max(10000).default(5),
    unlockFavorites: z.number().int().min(0).max(10000).default(3),
    unlockChapters: z.number().int().min(1).max(500).default(5),
  }),
  passwordPolicy: z.object({
    minLength: z.number().int().min(6).max(128).default(8),
    requireLowercase: z.boolean().default(true),
    requireUppercase: z.boolean().default(false),
    requireNumbers: z.boolean().default(true),
    requireSpecialChars: z.boolean().default(false),
  }),
  userApi: z.object({
    enabled: z.boolean().default(false),
    allowPlatformCache: z.boolean().default(true),
    allowLocalOnly: z.boolean().default(true),
  }),
  auth: z.object({
    enabled: z.boolean().default(false),
    jwtSecret: z.string().default(''),
    jwtExpiresIn: z.string().default('15m'),
    refreshExpiresInDays: z.number().int().min(1).max(90).default(7),
    adminUsername: z.string().default(''),
    adminPassword: z.string().default(''),
    redisHost: z.string().default('127.0.0.1'),
    redisPort: z.number().int().positive().default(6379),
    redisPassword: z.string().default(''),
    redisDb: z.number().int().min(0).max(15).default(0),
  }),
  dataDir: z.string().default('./data'),
  commentEnabled: z.boolean().default(false),
  /** 朋友圈空窗保护：章节无更新超过此小时数后停止自动发帖，0=不限制 */
  momentsIdleCooldownHours: z.number().min(0).default(24),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function buildConfigFromEnv(): AppConfig {
  const raw = {
    model: {
      provider: process.env.MODEL_PROVIDER ?? 'deepseek',
      apiKey: parseApiKeyList(process.env.MODEL_API_KEY)[0] ?? '',
      apiKeys: parseApiKeyList(process.env.MODEL_API_KEY),
      model: process.env.MODEL_NAME ?? 'deepseek-chat',
      baseUrl: process.env.MODEL_BASE_URL ?? '',
    },
    embedding: {
      provider: process.env.EMBEDDING_PROVIDER ?? 'openai',
      apiKey: parseApiKeyList(process.env.EMBEDDING_API_KEY)[0] ?? '',
      apiKeys: parseApiKeyList(process.env.EMBEDDING_API_KEY),
      model: process.env.EMBEDDING_MODEL ?? 'BAAI/bge-large-zh-v1.5',
      baseUrl: process.env.EMBEDDING_BASE_URL ?? 'https://api.siliconflow.cn/v1',
    },
    tts: {
      engine: process.env.TTS_ENGINE ?? 'edge-tts',
      narrationEngine: process.env.TTS_NARRATION_ENGINE ?? 'edge-tts',
      qwen3Url: process.env.QWEN3_TTS_URL ?? 'http://127.0.0.1:8765',
      kokoroUrl: process.env.KOKORO_URL ?? 'http://127.0.0.1:8767',
      azureKey: process.env.TTS_AZURE_KEY ?? '',
      azureRegion: process.env.TTS_AZURE_REGION ?? 'eastasia',
      openaiKey: process.env.TTS_OPENAI_KEY ?? '',
      openaiBaseUrl: process.env.TTS_OPENAI_BASE_URL ?? '',
      openaiModel: process.env.TTS_OPENAI_MODEL ?? 'tts-1',
    },
    image: {
      apiKey: process.env.IMAGE_API_KEY ?? '',
      model: process.env.IMAGE_MODEL ?? 'gpt-image-2',
      baseUrl: process.env.IMAGE_BASE_URL ?? '',
    },
    server: {
      port: Number.parseInt(process.env.PORT ?? '3001', 10),
      host: process.env.HOST ?? '127.0.0.1',
    },
    chapterEnhancement: {
      consistency: {
        minConflictRate: readIntEnv('CHARACTER_GUARDRAIL_MIN_CONFLICT_RATE', 30),
        minHumanityRate: readIntEnv('CHARACTER_GUARDRAIL_MIN_HUMANITY_RATE', 45),
        minStabilityScore: readIntEnv('CHARACTER_GUARDRAIL_MIN_STABILITY_SCORE', 45),
      },
      antiTemplate: {
        repeatedOpenerMinCount: readIntEnv('ANTI_TEMPLATE_REPEATED_OPENER_MIN_COUNT', 2),
        repeatedClicheMinCount: readIntEnv('ANTI_TEMPLATE_REPEATED_CLICHE_MIN_COUNT', 3),
        lookbackChapters: readIntEnv('ANTI_TEMPLATE_LOOKBACK_CHAPTERS', 3),
      },
      antiAiTells: {
        enabled: readBoolEnv('ANTI_AI_TELLS_ENABLED', true),
        repeatedMinCount: readIntEnv('ANTI_AI_TELLS_REPEATED_MIN_COUNT', 2),
        maxExamples: readIntEnv('ANTI_AI_TELLS_MAX_EXAMPLES', 18),
        maxFrequentItems: readIntEnv('ANTI_AI_TELLS_MAX_FREQUENT_ITEMS', 8),
      },
      antiAiStructure: {
        enabled: readBoolEnv('ANTI_AI_STRUCTURE_ENABLED', true),
        transitionWordsPer1kMax: readIntEnv('ANTI_AI_STRUCTURE_TRANSITION_PER_1K_MAX', 8),
        repeatedMinCount: readIntEnv('ANTI_AI_STRUCTURE_REPEATED_MIN_COUNT', 2),
        maxExamples: readIntEnv('ANTI_AI_STRUCTURE_MAX_EXAMPLES', 16),
        maxFrequentItems: readIntEnv('ANTI_AI_STRUCTURE_MAX_FREQUENT_ITEMS', 8),
      },
    },
    worldFeatures: {
      contractEnabled: readBoolEnv('WORLD_CONTRACT_ENABLED', true),
      gateMode: readWorldGateModeEnv(),
      strictFallbackToWarn: readBoolEnv('WORLD_GATE_STRICT_FALLBACK_TO_WARN', true),
      retrievalV2Enabled: readBoolEnv('WORLD_RETRIEVAL_V2_ENABLED', true),
      retrievalTopK: readIntEnv('WORLD_RETRIEVAL_TOP_K', 10),
    },
    outlineFeatures: {
      gateMode: readOutlineGateModeEnv(),
      strictFallbackToWarn: readBoolEnv('OUTLINE_GATE_STRICT_FALLBACK_TO_WARN', true),
      maxRequired: readIntEnv('OUTLINE_GATE_MAX_REQUIRED', 8),
    },
    qualityFeatures: {
      gateMode: readQualityGateModeEnv(),
      strictFallbackToWarn: readBoolEnv('QUALITY_GATE_STRICT_FALLBACK_TO_WARN', true),
      passScore: readIntEnv('QUALITY_GATE_PASS_SCORE', 76),
      minStructureScore: readIntEnv('QUALITY_GATE_MIN_STRUCTURE_SCORE', 65),
      minStyleScore: readIntEnv('QUALITY_GATE_MIN_STYLE_SCORE', 62),
      minEmotionScore: readIntEnv('QUALITY_GATE_MIN_EMOTION_SCORE', 58),
    },
    continuityFeatures: {
      gateMode: readContinuityGateModeEnv(),
      strictFallbackToWarn: readBoolEnv('CONTINUITY_GATE_STRICT_FALLBACK_TO_WARN', true),
    },
    powerRuleFeatures: {
      gateMode: readPowerRuleGateModeEnv(),
      strictFallbackToWarn: readBoolEnv('POWER_RULE_GATE_STRICT_FALLBACK_TO_WARN', true),
    },
    autoRevision: {
      enabled: readBoolEnv('AUTO_REVISION_ENABLED', false),
      scoreThreshold: readFloatEnv('AUTO_REVISION_SCORE_THRESHOLD', 7.2),
      maxRounds: readIntEnv('AUTO_REVISION_MAX_ROUNDS', 3),
      // 默认开启；可用 QUALITY_FLOOR_REVISION_ENABLED 单独关闭
      qualityFloorRevisionEnabled: readBoolEnv(
        'QUALITY_FLOOR_REVISION_ENABLED',
        true,
      ),
    },
    autoCurate: {
      enabled: readBoolEnv('AUTO_CURATE_ENABLED', false),
    },
    autoFinalize: {
      enabled: readBoolEnv('AUTO_FINALIZE_ENABLED', true),
    },
    authorNote: {
      enabled: readBoolEnv('AUTHOR_NOTE_ENABLED', true),
    },
    realNameVerification: {
      enabled: readBoolEnv('REAL_NAME_VERIFICATION_ENABLED', false),
      provider: process.env.REAL_NAME_VERIFICATION_PROVIDER === 'mock_identity'
        ? 'mock_identity'
        : process.env.REAL_NAME_VERIFICATION_PROVIDER === 'http_bridge'
          ? 'http_bridge'
          : 'basic_submission',
      requiredForComment: readBoolEnv('REAL_NAME_REQUIRED_FOR_COMMENT', false),
      requiredForCreatorApplication: readBoolEnv('REAL_NAME_REQUIRED_FOR_CREATOR_APPLICATION', true),
      requiredForBookPublishing: readBoolEnv('REAL_NAME_REQUIRED_FOR_BOOK_PUBLISHING', true),
      requiredForBilling: readBoolEnv('REAL_NAME_REQUIRED_FOR_BILLING', true),
      maxFailedAttempts: readIntEnv('REAL_NAME_VERIFICATION_MAX_FAILED_ATTEMPTS', 3),
      cooldownMinutes: readIntEnv('REAL_NAME_VERIFICATION_COOLDOWN_MINUTES', 30),
      httpUrl: process.env.REAL_NAME_VERIFICATION_HTTP_URL ?? '',
      httpToken: process.env.REAL_NAME_VERIFICATION_HTTP_TOKEN ?? '',
      httpTimeoutMs: readIntEnv('REAL_NAME_VERIFICATION_HTTP_TIMEOUT_MS', 8000),
      httpHeaders: process.env.REAL_NAME_VERIFICATION_HTTP_HEADERS ?? '',
    },
    memory: {
      hybridSearchEnabled: readBoolEnv('MEMORY_HYBRID_SEARCH_ENABLED', true),
    },
    registrationProtection: {
      enabled: readBoolEnv('REGISTRATION_PROTECTION_ENABLED', true),
      regPerHour: readIntEnv('REGISTRATION_PER_HOUR', 2),
      regPerDay: readIntEnv('REGISTRATION_PER_DAY', 5),
    },
    newUserCooldownHours: readIntEnv('NEW_USER_COOLDOWN_HOURS', 24),
    disableCoverUpload: readBoolEnv('DISABLE_COVER_UPLOAD', true),
    publishLimits: {
      maxPerMonth: readIntEnv('PUBLISH_MAX_PER_MONTH', 3),
      unlockReads: readIntEnv('PUBLISH_UNLOCK_READS', 100),
      unlockLikes: readIntEnv('PUBLISH_UNLOCK_LIKES', 5),
      unlockFavorites: readIntEnv('PUBLISH_UNLOCK_FAVORITES', 3),
      unlockChapters: readIntEnv('PUBLISH_UNLOCK_CHAPTERS', 5),
    },
    passwordPolicy: {
      minLength: readIntEnv('AUTH_PASSWORD_MIN_LENGTH', 8),
      requireLowercase: readBoolEnv('AUTH_PASSWORD_REQUIRE_LOWERCASE', true),
      requireUppercase: readBoolEnv('AUTH_PASSWORD_REQUIRE_UPPERCASE', false),
      requireNumbers: readBoolEnv('AUTH_PASSWORD_REQUIRE_NUMBERS', true),
      requireSpecialChars: readBoolEnv('AUTH_PASSWORD_REQUIRE_SPECIAL_CHARS', false),
    },
    userApi: {
      enabled: readBoolEnv('USER_API_FEATURE_ENABLED', true),
      allowPlatformCache: readBoolEnv('USER_API_ALLOW_PLATFORM_CACHE', true),
      allowLocalOnly: readBoolEnv('USER_API_ALLOW_LOCAL_ONLY', true),
    },
    auth: {
      // 兼容托管环境：DMP 注入 DB_HOST 或 JWT_SECRET 时默认启用认证
      enabled: readBoolEnv('AUTH_ENABLED', !!process.env.DB_HOST || !!process.env.JWT_SECRET),
      // AUTH_JWT_SECRET 优先，回退到 DMP 标准 JWT_SECRET，都没有则自动生成（仅限生产启用认证时）
      jwtSecret: process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || '',
      jwtExpiresIn: process.env.AUTH_JWT_EXPIRES_IN ?? '15m',
      refreshExpiresInDays: readIntEnv('AUTH_REFRESH_EXPIRES_DAYS', 7),
      adminUsername: process.env.AUTH_ADMIN_USERNAME || 'admin',
      // 不设兜底值：缺失时 seedAdminUser 会跳过管理员初始化并告警，
      // 避免生成一个口令公开可知的管理员账户
      adminPassword: process.env.AUTH_ADMIN_PASSWORD || '',
      // Redis 连接：AUTH_REDIS_* 优先，回退到 DMP 标准 REDIS_* 变量
      redisHost: process.env.AUTH_REDIS_HOST || process.env.REDIS_HOST || '127.0.0.1',
      redisPort: Number(process.env.AUTH_REDIS_PORT || process.env.REDIS_PORT || 6379) || 6379,
      redisPassword: process.env.AUTH_REDIS_PASSWORD ?? '',
      redisDb: readIntEnv('AUTH_REDIS_DB', 0),
    },
    agentModelOverrides: parseAgentModelOverrides(process.env.AGENT_MODEL_OVERRIDES ?? ''),
    log: {
      level: (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',
      format: (process.env.LOG_FORMAT ?? 'text') as 'json' | 'text',
    },
    backup: {
      autoBackupOnDelete: readBoolEnv('BACKUP_AUTO_ON_DELETE', true),
      maxBackupsPerNovel: readIntEnv('BACKUP_MAX_PER_NOVEL', 10),
    },
    dataDir: process.env.DATA_DIR
      ?? (process.env.SQLITE_PATH ? path.dirname(process.env.SQLITE_PATH) : undefined)
      ?? (process.env.DB_FILE ? path.dirname(process.env.DB_FILE) : undefined)
      ?? (process.env.DATABASE_FILE ? path.dirname(process.env.DATABASE_FILE) : undefined)
      ?? './data',
    commentEnabled: readBoolEnv('COMMENT_ENABLED', false),
    momentsIdleCooldownHours: readIntEnv('MOMENTS_IDLE_COOLDOWN_HOURS', 24),
  };

  // Signing-oriented baseline: 需要显式启用（SIGNING_PIPELINE_PRESET_ENABLED=true），
  // 启用后将门禁升级为 strict 模式并开启自动修订循环。
  if (readBoolEnv('SIGNING_PIPELINE_PRESET_ENABLED', false)) {
    raw.worldFeatures.contractEnabled = true;
    raw.worldFeatures.gateMode = 'strict';
    raw.worldFeatures.strictFallbackToWarn = true;
    raw.worldFeatures.retrievalV2Enabled = true;

    raw.outlineFeatures.gateMode = 'strict';
    raw.outlineFeatures.strictFallbackToWarn = true;
    raw.outlineFeatures.maxRequired = Math.max(raw.outlineFeatures.maxRequired, 8);

    raw.qualityFeatures.gateMode = 'strict';
    raw.qualityFeatures.strictFallbackToWarn = true;
    raw.qualityFeatures.passScore = Math.max(raw.qualityFeatures.passScore, 76);
    raw.qualityFeatures.minStructureScore = Math.max(raw.qualityFeatures.minStructureScore, 65);
    raw.qualityFeatures.minStyleScore = Math.max(raw.qualityFeatures.minStyleScore, 62);
    raw.qualityFeatures.minEmotionScore = Math.max(raw.qualityFeatures.minEmotionScore, 58);

    raw.continuityFeatures.gateMode = 'strict';
    raw.continuityFeatures.strictFallbackToWarn = true;
    raw.powerRuleFeatures.gateMode = 'strict';
    raw.powerRuleFeatures.strictFallbackToWarn = true;

    raw.autoRevision.enabled = true;
    raw.autoRevision.scoreThreshold = Math.max(raw.autoRevision.scoreThreshold, 7.2);
    raw.autoRevision.maxRounds = Math.max(raw.autoRevision.maxRounds, 3);
    raw.autoRevision.qualityFloorRevisionEnabled = true;
  }

  return ConfigSchema.parse(raw);
}
