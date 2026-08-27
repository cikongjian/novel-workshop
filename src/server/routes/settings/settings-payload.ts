import type { SettingsPayload } from '../../../config/index.js';
import { normalizeHomePageConfig } from '../../../config/homepage-config.js';
import { resolveCompatibleApiKey } from './api-key.js';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeSettingsPayload(body: SettingsPayload): SettingsPayload {
  return {
    modelProvider: body.modelProvider,
    modelApiKey: resolveCompatibleApiKey({
      provider: body.modelProvider,
      apiKey: body.modelApiKey ?? '',
      baseUrl: body.modelBaseUrl ?? '',
    }),
    modelName: body.modelName ?? '',
    modelBaseUrl: body.modelBaseUrl ?? '',
    modelStreamingEnabled: Boolean(body.modelStreamingEnabled ?? false),
    embeddingProvider: body.embeddingProvider ?? '',
    embeddingApiKey: resolveCompatibleApiKey({
      provider: body.embeddingProvider ?? '',
      apiKey: body.embeddingApiKey ?? '',
      baseUrl: body.embeddingBaseUrl ?? '',
    }),
    embeddingModel: body.embeddingModel ?? '',
    embeddingBaseUrl: body.embeddingBaseUrl ?? '',
    ttsEngine: body.ttsEngine ?? 'edge-tts',
    ttsNarrationEngine: body.ttsNarrationEngine ?? 'edge-tts',
    qwen3TtsUrl: body.qwen3TtsUrl ?? 'http://127.0.0.1:8765',
    kokoroUrl: body.kokoroUrl ?? 'http://127.0.0.1:8767',
    ttsAzureKey: body.ttsAzureKey ?? '',
    ttsAzureRegion: body.ttsAzureRegion ?? '',
    ttsOpenaiKey: body.ttsOpenaiKey ?? '',
    ttsOpenaiBaseUrl: body.ttsOpenaiBaseUrl ?? '',
    ttsOpenaiModel: body.ttsOpenaiModel ?? 'tts-1',
    characterGuardrailMinConflictRate: Number(body.characterGuardrailMinConflictRate ?? 30),
    characterGuardrailMinHumanityRate: Number(body.characterGuardrailMinHumanityRate ?? 45),
    characterGuardrailMinStabilityScore: Number(body.characterGuardrailMinStabilityScore ?? 45),
    antiTemplateRepeatedOpenerMinCount: Number(body.antiTemplateRepeatedOpenerMinCount ?? 2),
    antiTemplateRepeatedClicheMinCount: Number(body.antiTemplateRepeatedClicheMinCount ?? 3),
    antiTemplateLookbackChapters: Number(body.antiTemplateLookbackChapters ?? 3),
    antiAiTellsEnabled: Boolean(body.antiAiTellsEnabled ?? true),
    antiAiTellsRepeatedMinCount: clamp(Number(body.antiAiTellsRepeatedMinCount ?? 2), 1, 50),
    antiAiTellsMaxExamples: clamp(Number(body.antiAiTellsMaxExamples ?? 18), 0, 60),
    antiAiTellsMaxFrequentItems: clamp(Number(body.antiAiTellsMaxFrequentItems ?? 8), 0, 30),
    antiAiStructureEnabled: Boolean(body.antiAiStructureEnabled ?? true),
    antiAiStructureTransitionPer1kMax: clamp(Number(body.antiAiStructureTransitionPer1kMax ?? 8), 1, 50),
    antiAiStructureRepeatedMinCount: clamp(Number(body.antiAiStructureRepeatedMinCount ?? 2), 1, 50),
    antiAiStructureMaxExamples: clamp(Number(body.antiAiStructureMaxExamples ?? 16), 0, 60),
    antiAiStructureMaxFrequentItems: clamp(Number(body.antiAiStructureMaxFrequentItems ?? 8), 0, 30),
    worldContractEnabled: Boolean(body.worldContractEnabled ?? true),
    worldGateMode: body.worldGateMode === 'off' || body.worldGateMode === 'warn' || body.worldGateMode === 'strict'
      ? body.worldGateMode
      : 'warn',
    worldGateStrictFallbackToWarn: Boolean(body.worldGateStrictFallbackToWarn ?? true),
    worldRetrievalV2Enabled: Boolean(body.worldRetrievalV2Enabled ?? true),
    worldRetrievalTopK: clamp(Number(body.worldRetrievalTopK ?? 10), 4, 30),
    outlineGateMode: body.outlineGateMode === 'off' || body.outlineGateMode === 'warn' || body.outlineGateMode === 'strict'
      ? body.outlineGateMode
      : 'warn',
    outlineGateStrictFallbackToWarn: Boolean(body.outlineGateStrictFallbackToWarn ?? true),
    outlineGateMaxRequired: clamp(Number(body.outlineGateMaxRequired ?? 8), 2, 12),
    qualityGateMode: body.qualityGateMode === 'off' || body.qualityGateMode === 'warn' || body.qualityGateMode === 'strict'
      ? body.qualityGateMode
      : 'warn',
    qualityGateStrictFallbackToWarn: Boolean(body.qualityGateStrictFallbackToWarn ?? true),
    qualityGatePassScore: clamp(Number(body.qualityGatePassScore ?? 76), 40, 100),
    qualityGateMinStructureScore: clamp(Number(body.qualityGateMinStructureScore ?? 65), 30, 100),
    qualityGateMinStyleScore: clamp(Number(body.qualityGateMinStyleScore ?? 62), 30, 100),
    qualityGateMinEmotionScore: clamp(Number(body.qualityGateMinEmotionScore ?? 58), 30, 100),
    continuityGateMode: body.continuityGateMode === 'off' || body.continuityGateMode === 'warn' || body.continuityGateMode === 'strict'
      ? body.continuityGateMode
      : 'warn',
    continuityGateStrictFallbackToWarn: Boolean(body.continuityGateStrictFallbackToWarn ?? true),
    powerRuleGateMode: body.powerRuleGateMode === 'off' || body.powerRuleGateMode === 'warn' || body.powerRuleGateMode === 'strict'
      ? body.powerRuleGateMode
      : 'warn',
    powerRuleGateStrictFallbackToWarn: Boolean(body.powerRuleGateStrictFallbackToWarn ?? true),
    superLongModeEnabled: Boolean(body.superLongModeEnabled ?? false),
    truthFilesEnabled: Boolean(body.truthFilesEnabled ?? true),
    structuredAuditEnabled: Boolean(body.structuredAuditEnabled ?? true),
    snapshotEnabled: Boolean(body.snapshotEnabled ?? true),
    aiTraceGateMode: body.aiTraceGateMode === 'off' || body.aiTraceGateMode === 'warn' || body.aiTraceGateMode === 'strict'
      ? body.aiTraceGateMode
      : 'warn',
    autoRevisionEnabled: Boolean(body.autoRevisionEnabled ?? false),
    autoRevisionScoreThreshold: clamp(Number(body.autoRevisionScoreThreshold ?? 7.2), 1, 10),
    autoRevisionMaxRounds: clamp(Number(body.autoRevisionMaxRounds ?? 3), 1, 5),
    qualityFloorRevisionEnabled: Boolean(body.qualityFloorRevisionEnabled ?? false),
    autoCurateEnabled: Boolean(body.autoCurateEnabled ?? false),
    autoFinalizeEnabled: Boolean(body.autoFinalizeEnabled ?? true),
    authorNoteEnabled: Boolean(body.authorNoteEnabled ?? true),
    chapterLengthGuardEnabled: Boolean(body.chapterLengthGuardEnabled ?? true),
    chapterLengthGuardTriggerPercent: clamp(Number(body.chapterLengthGuardTriggerPercent ?? 20), 10, 100),
    chapterLengthGuardAllowedPercent: clamp(Number(body.chapterLengthGuardAllowedPercent ?? 5), 0, 50),
    registrationProtectionEnabled: Boolean(body.registrationProtectionEnabled ?? true),
    registrationProtectionRegPerHour: clamp(Number(body.registrationProtectionRegPerHour ?? 2), 1, 20),
    registrationProtectionRegPerDay: clamp(Number(body.registrationProtectionRegPerDay ?? 5), 1, 50),
    newUserCooldownHours: Math.max(0, Math.min(720, Number(body.newUserCooldownHours ?? 24))),
    disableCoverUpload: Boolean(body.disableCoverUpload ?? true),
    publishMaxPerMonth: Math.max(1, Math.min(50, Number(body.publishMaxPerMonth ?? 3))),
    publishUnlockReads: Math.max(1, Math.min(100000, Number(body.publishUnlockReads ?? 100))),
    publishUnlockLikes: Math.max(0, Math.min(10000, Number(body.publishUnlockLikes ?? 5))),
    publishUnlockFavorites: Math.max(0, Math.min(10000, Number(body.publishUnlockFavorites ?? 3))),
    publishUnlockChapters: Math.max(1, Math.min(500, Number(body.publishUnlockChapters ?? 5))),
    authPasswordMinLength: clamp(Number(body.authPasswordMinLength ?? 10), 6, 128),
    authPasswordRequireLowercase: Boolean(body.authPasswordRequireLowercase ?? true),
    authPasswordRequireUppercase: Boolean(body.authPasswordRequireUppercase ?? true),
    authPasswordRequireNumbers: Boolean(body.authPasswordRequireNumbers ?? true),
    authPasswordRequireSpecialChars: Boolean(body.authPasswordRequireSpecialChars ?? true),
    userApiFeatureEnabled: Boolean(body.userApiFeatureEnabled ?? false),
    userApiAllowPlatformCache: Boolean(body.userApiAllowPlatformCache ?? true),
    userApiAllowLocalOnly: Boolean(body.userApiAllowLocalOnly ?? true),
    realNameVerificationEnabled: Boolean(body.realNameVerificationEnabled ?? false),
    realNameVerificationProvider: body.realNameVerificationProvider === 'mock_identity'
      ? 'mock_identity'
      : body.realNameVerificationProvider === 'http_bridge'
        ? 'http_bridge'
        : 'basic_submission',
    realNameRequiredForComment: Boolean(body.realNameRequiredForComment ?? false),
    realNameRequiredForCreatorApplication: Boolean(body.realNameRequiredForCreatorApplication ?? true),
    realNameRequiredForBookPublishing: Boolean(body.realNameRequiredForBookPublishing ?? true),
    realNameRequiredForBilling: Boolean(body.realNameRequiredForBilling ?? true),
    realNameVerificationMaxFailedAttempts: Math.max(1, Math.min(20, Number(body.realNameVerificationMaxFailedAttempts ?? 3))),
    realNameVerificationCooldownMinutes: Math.max(1, Math.min(1440, Number(body.realNameVerificationCooldownMinutes ?? 30))),
    realNameVerificationHttpUrl: body.realNameVerificationHttpUrl ?? '',
    realNameVerificationHttpToken: body.realNameVerificationHttpToken ?? '',
    realNameVerificationHttpTimeoutMs: clamp(Number(body.realNameVerificationHttpTimeoutMs ?? 8000), 1000, 60000),
    realNameVerificationHttpHeaders: body.realNameVerificationHttpHeaders ?? '',
    agentModelOverrides: typeof body.agentModelOverrides === 'string' ? body.agentModelOverrides : '{}',
    imageApiKey: body.imageApiKey ?? '',
    imageModel: body.imageModel?.trim() || 'gpt-image-2',
    imageBaseUrl: body.imageBaseUrl ?? '',
    homepageConfig: normalizeHomePageConfig(body.homepageConfig),
    contentAuditProvider: String(body.contentAuditProvider ?? 'keyword').trim() || 'keyword',
    contentAuditApiKey: body.contentAuditApiKey ?? '',
    contentAuditSecretKey: body.contentAuditSecretKey ?? '',
    contentAuditRegion: body.contentAuditRegion ?? 'ap-guangzhou',
    contentAuditPassThreshold: clamp(Number(body.contentAuditPassThreshold ?? 60), 0, 100),
    contentAuditBlockThreshold: clamp(Number(body.contentAuditBlockThreshold ?? 80), 0, 100),
    smtpHost: body.smtpHost ?? '',
    smtpPort: Number(body.smtpPort) || 465,
    smtpSecure: Boolean(body.smtpSecure ?? true),
    smtpUser: body.smtpUser ?? '',
    smtpPass: body.smtpPass ?? '',
    smtpFrom: body.smtpFrom ?? '',
    platformUrl: body.platformUrl ?? '',
    commentEnabled: Boolean(body.commentEnabled ?? false),
    momentsIdleCooldownHours: Math.max(0, Number(body.momentsIdleCooldownHours ?? 24)),
    baiduPushToken: String(body.baiduPushToken ?? '').trim(),
    friendlyLinks: Array.isArray(body.friendlyLinks) ? body.friendlyLinks : [],
    comicChapterEnabled: Boolean(body.comicChapterEnabled ?? false),
    audiobookAccessMode: body.audiobookAccessMode === 'off' || body.audiobookAccessMode === 'admin' || body.audiobookAccessMode === 'on'
      ? body.audiobookAccessMode
      : 'admin',
    trendsEnabled: Boolean(body.trendsEnabled ?? true),
    trendsSearchProvider: (['serpapi', 'bing', 'tavily', 'agent-reach', 'direct', 'none'].includes(body.trendsSearchProvider ?? '')
      ? body.trendsSearchProvider
      : 'none') as 'serpapi' | 'bing' | 'tavily' | 'agent-reach' | 'direct' | 'none',
    trendsSearchApiKey: body.trendsSearchApiKey ?? '',
    trendsSearchApiBaseUrl: body.trendsSearchApiBaseUrl ?? '',
    trendsScheduleHour: Math.max(0, Math.min(23, Number(body.trendsScheduleHour ?? 8))),
    trendsScheduleMinute: Math.max(0, Math.min(59, Number(body.trendsScheduleMinute ?? 0))),
  };
}
