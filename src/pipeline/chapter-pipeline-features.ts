import {
  readCharacterWhitelistGateModeEnv,
  readPowerRuleGateModeEnv,
  readSettingDriftGateModeEnv,
  readAiTraceGateModeEnv,
  readBoolEnv,
  type WorldFeatureOptions,
  type OutlineFeatureOptions,
  type QualityFeatureOptions,
  type CharacterWhitelistFeatureOptions,
  type ContinuityFeatureOptions,
  type PowerRuleFeatureOptions,
  type SettingDriftFeatureOptions,
  type LongFormFeatureOptions,
  type MemoryOrchestratorFeatureOptions,
  type AiTraceFeatureOptions,
  type TruthFileFeatureOptions,
  type StructuredAuditFeatureOptions,
  type SnapshotFeatureOptions,
} from './pipeline-constants.js';

function readIntEnv(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export type ChapterPipelineFeatures = {
  worldFeatures: Required<WorldFeatureOptions>;
  outlineFeatures: Required<OutlineFeatureOptions>;
  qualityFeatures: Required<QualityFeatureOptions>;
  characterWhitelistFeatures: Required<CharacterWhitelistFeatureOptions>;
  continuityFeatures: Required<ContinuityFeatureOptions>;
  powerRuleFeatures: Required<PowerRuleFeatureOptions>;
  settingDriftFeatures: Required<SettingDriftFeatureOptions>;
  longFormFeatures: Required<LongFormFeatureOptions>;
  memoryOrchestratorFeatures: Required<MemoryOrchestratorFeatureOptions>;
  aiTraceFeatures: Required<AiTraceFeatureOptions>;
  truthFileFeatures: Required<TruthFileFeatureOptions>;
  structuredAuditFeatures: Required<StructuredAuditFeatureOptions>;
  snapshotFeatures: Required<SnapshotFeatureOptions>;
};

export function resolveChapterPipelineFeatures(params: {
  worldFeatures?: WorldFeatureOptions;
  outlineFeatures?: OutlineFeatureOptions;
  qualityFeatures?: QualityFeatureOptions;
  characterWhitelistFeatures?: CharacterWhitelistFeatureOptions;
  continuityFeatures?: ContinuityFeatureOptions;
  powerRuleFeatures?: PowerRuleFeatureOptions;
  settingDriftFeatures?: SettingDriftFeatureOptions;
  longFormFeatures?: LongFormFeatureOptions;
  memoryOrchestratorFeatures?: MemoryOrchestratorFeatureOptions;
  aiTraceFeatures?: AiTraceFeatureOptions;
  truthFileFeatures?: TruthFileFeatureOptions;
  structuredAuditFeatures?: StructuredAuditFeatureOptions;
  snapshotFeatures?: SnapshotFeatureOptions;
}): ChapterPipelineFeatures {
  const signingPresetEnabled = readBoolEnv(process.env.SIGNING_PIPELINE_PRESET_ENABLED, false);
  const worldFeatures = params.worldFeatures ?? {};
  const outlineFeatures = params.outlineFeatures ?? {};
  const qualityFeatures = params.qualityFeatures ?? {};
  const characterWhitelistFeatures = params.characterWhitelistFeatures ?? {};
  const continuityFeatures = params.continuityFeatures ?? {};
  const powerRuleFeatures = params.powerRuleFeatures ?? {};
  const settingDriftFeatures = params.settingDriftFeatures ?? {};
  const longFormFeatures = params.longFormFeatures ?? {};
  const memoryOrchestratorFeatures = params.memoryOrchestratorFeatures ?? {};
  const aiTraceFeatures = params.aiTraceFeatures ?? {};
  const truthFileFeatures = params.truthFileFeatures ?? {};
  const structuredAuditFeatures = params.structuredAuditFeatures ?? {};
  const snapshotFeatures = params.snapshotFeatures ?? {};

  return {
    worldFeatures: {
      contractEnabled: signingPresetEnabled ? true : (worldFeatures.contractEnabled ?? true),
      gateMode: signingPresetEnabled ? 'strict' : (worldFeatures.gateMode ?? 'warn'),
      strictFallbackToWarn: signingPresetEnabled ? true : (worldFeatures.strictFallbackToWarn ?? true),
      retrievalV2Enabled: signingPresetEnabled ? true : (worldFeatures.retrievalV2Enabled ?? true),
      retrievalTopK: worldFeatures.retrievalTopK ?? 6,
    },
    outlineFeatures: {
      gateMode: signingPresetEnabled ? 'strict' : (outlineFeatures.gateMode ?? 'warn'),
      strictFallbackToWarn: signingPresetEnabled ? true : (outlineFeatures.strictFallbackToWarn ?? true),
      maxRequired: Math.max(outlineFeatures.maxRequired ?? 6, signingPresetEnabled ? 6 : 4),
    },
    qualityFeatures: {
      gateMode: signingPresetEnabled ? 'strict' : (qualityFeatures.gateMode ?? 'warn'),
      strictFallbackToWarn: signingPresetEnabled ? true : (qualityFeatures.strictFallbackToWarn ?? true),
      passScore: Math.max(qualityFeatures.passScore ?? 72, signingPresetEnabled ? 72 : 68),
      minStructureScore: Math.max(qualityFeatures.minStructureScore ?? 60, signingPresetEnabled ? 60 : 55),
      minStyleScore: Math.max(qualityFeatures.minStyleScore ?? 58, signingPresetEnabled ? 58 : 54),
      minEmotionScore: Math.max(qualityFeatures.minEmotionScore ?? 54, signingPresetEnabled ? 54 : 50),
      shadowMode: qualityFeatures.shadowMode
        ?? readBoolEnv(process.env.QUALITY_GATE_SHADOW_MODE, false),
      enableLocalizedAntiAiRewrite: qualityFeatures.enableLocalizedAntiAiRewrite
        ?? readBoolEnv(process.env.QUALITY_GATE_ENABLE_LOCALIZED_ANTI_AI_REWRITE, true),
      enableRegressionGuard: qualityFeatures.enableRegressionGuard
        ?? readBoolEnv(process.env.QUALITY_GATE_ENABLE_REGRESSION_GUARD, true),
      enableAiTellClusterGate: qualityFeatures.enableAiTellClusterGate
        ?? readBoolEnv(process.env.QUALITY_GATE_ENABLE_AI_TELL_CLUSTER_GATE, true),
      enableVoiceAnchors: qualityFeatures.enableVoiceAnchors
        ?? readBoolEnv(process.env.QUALITY_GATE_ENABLE_VOICE_ANCHORS, true),
      enablePatternRotationCache: qualityFeatures.enablePatternRotationCache
        ?? readBoolEnv(process.env.QUALITY_GATE_ENABLE_PATTERN_ROTATION_CACHE, true),
      enableAntiClicheDetection: qualityFeatures.enableAntiClicheDetection
        ?? readBoolEnv(process.env.QUALITY_GATE_ENABLE_ANTI_CLICHE_DETECTION, true),
      enableGenreAdaptiveThresholds: qualityFeatures.enableGenreAdaptiveThresholds
        ?? readBoolEnv(process.env.QUALITY_GATE_ENABLE_GENRE_ADAPTIVE_THRESHOLDS, true),
      localRewriteMaxWindows: qualityFeatures.localRewriteMaxWindows
        ?? readIntEnv(process.env.QUALITY_GATE_LOCAL_REWRITE_MAX_WINDOWS, 8, 1, 24),
    },
    characterWhitelistFeatures: {
      gateMode: signingPresetEnabled ? 'strict' : (characterWhitelistFeatures.gateMode ?? readCharacterWhitelistGateModeEnv()),
      strictFallbackToWarn: signingPresetEnabled
        ? true
        : (characterWhitelistFeatures.strictFallbackToWarn
          ?? readBoolEnv(process.env.CHARACTER_WHITELIST_GATE_STRICT_FALLBACK_TO_WARN, true)),
    },
    continuityFeatures: {
      gateMode: signingPresetEnabled ? 'strict' : (continuityFeatures.gateMode ?? 'warn'),
      strictFallbackToWarn: signingPresetEnabled ? true : (continuityFeatures.strictFallbackToWarn ?? true),
      shadowMode: continuityFeatures.shadowMode
        ?? readBoolEnv(process.env.CONTINUITY_GATE_SHADOW_MODE, false),
      enableIdentitySelfAddress: continuityFeatures.enableIdentitySelfAddress
        ?? readBoolEnv(process.env.CONTINUITY_GATE_ENABLE_IDENTITY_SELF_ADDRESS, true),
      enableIdentityAddress: continuityFeatures.enableIdentityAddress
        ?? readBoolEnv(process.env.CONTINUITY_GATE_ENABLE_IDENTITY_ADDRESS, true),
    },
    powerRuleFeatures: {
      gateMode: signingPresetEnabled ? 'strict' : (powerRuleFeatures.gateMode ?? readPowerRuleGateModeEnv()),
      strictFallbackToWarn: powerRuleFeatures.strictFallbackToWarn
        ?? readBoolEnv(process.env.POWER_RULE_GATE_STRICT_FALLBACK_TO_WARN, true),
    },
    settingDriftFeatures: {
      gateMode: signingPresetEnabled ? 'strict' : (settingDriftFeatures.gateMode ?? readSettingDriftGateModeEnv()),
      strictFallbackToWarn: settingDriftFeatures.strictFallbackToWarn
        ?? readBoolEnv(process.env.SETTING_DRIFT_GATE_STRICT_FALLBACK_TO_WARN, true),
    },
    longFormFeatures: {
      superLongModeEnabled: longFormFeatures.superLongModeEnabled
        ?? readBoolEnv(process.env.SUPER_LONG_MODE_ENABLED, false),
    },
    memoryOrchestratorFeatures: {
      enabled: memoryOrchestratorFeatures.enabled
        ?? readBoolEnv(process.env.MEMORY_ORCHESTRATOR_ENABLED, true),
    },
    aiTraceFeatures: {
      gateMode: aiTraceFeatures.gateMode ?? readAiTraceGateModeEnv(),
      strictFallbackToWarn: aiTraceFeatures.strictFallbackToWarn
        ?? readBoolEnv(process.env.AI_TRACE_GATE_STRICT_FALLBACK_TO_WARN, true),
      passThreshold: aiTraceFeatures.passThreshold ?? 60,
    },
    truthFileFeatures: {
      enabled: truthFileFeatures.enabled
        ?? readBoolEnv(process.env.TRUTH_FILES_ENABLED, true),
    },
    structuredAuditFeatures: {
      enabled: structuredAuditFeatures.enabled
        ?? readBoolEnv(process.env.STRUCTURED_AUDIT_ENABLED, true),
    },
    snapshotFeatures: {
      enabled: snapshotFeatures.enabled
        ?? readBoolEnv(process.env.SNAPSHOT_ENABLED, true),
    },
  };
}
