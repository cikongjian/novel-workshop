/**
 * 管线模块共享常量、类型和工具函数
 *
 * 从 chapter-pipeline.ts 提取，供 context-builders / gate-orchestrator / editor-output-parser 等模块使用。
 */

import type { WorldGateMode } from './world-contract.js';
import type { OutlineGateMode } from './outline-gate.js';
import type { QualityGateMode } from './quality-gate.js';
import type { ContinuityGateMode } from './continuity-gate.js';
import type { PowerRuleGateMode } from './power-rule-gate.js';
import type { PipelineNovelManager } from './types.js';

// ==================== 截断与回溯常量 ====================

export const PREV_CHAPTER_MAX_CHARS = 6000;
export const EARLIER_CHAPTER_MAX_CHARS = 1500;
export const MAX_PREV_CHAPTERS = 3;

// ==================== 标签映射 ====================

export const WORLD_CATEGORY_LABELS: Record<string, string> = {
  geography: '地理',
  history: '历史',
  faction: '势力/阵营',
  power: '力量体系',
  culture: '文化/风俗',
  rule: '世界法则',
  other: '其他',
};

export const CHARACTER_ROLE_LABELS: Record<string, string> = {
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

// ==================== 内建白名单 ====================

export const BUILTIN_ALLOWED_SPEAKERS = new Set([
  '旁白',
  '叙述者',
  '系统',
  'os',
]);

// ==================== Feature Options 类型 ====================

export type WorldFeatureOptions = {
  contractEnabled?: boolean;
  gateMode?: WorldGateMode;
  strictFallbackToWarn?: boolean;
  retrievalV2Enabled?: boolean;
  retrievalTopK?: number;
};

export type OutlineFeatureOptions = {
  gateMode?: OutlineGateMode;
  strictFallbackToWarn?: boolean;
  maxRequired?: number;
};

export type QualityFeatureOptions = {
  gateMode?: QualityGateMode;
  strictFallbackToWarn?: boolean;
  passScore?: number;
  minStructureScore?: number;
  minStyleScore?: number;
  minEmotionScore?: number;
  shadowMode?: boolean;
  enableLocalizedAntiAiRewrite?: boolean;
  enableRegressionGuard?: boolean;
  enableAiTellClusterGate?: boolean;
  enableVoiceAnchors?: boolean;
  enablePatternRotationCache?: boolean;
  enableAntiClicheDetection?: boolean;
  enableGenreAdaptiveThresholds?: boolean;
  localRewriteMaxWindows?: number;
};

export type CharacterWhitelistGateMode = 'off' | 'warn' | 'strict';

export type CharacterWhitelistFeatureOptions = {
  gateMode?: CharacterWhitelistGateMode;
  strictFallbackToWarn?: boolean;
};

export type ContinuityFeatureOptions = {
  gateMode?: ContinuityGateMode;
  strictFallbackToWarn?: boolean;
  shadowMode?: boolean;
  enableIdentitySelfAddress?: boolean;
  enableIdentityAddress?: boolean;
};

export type PowerRuleFeatureOptions = {
  gateMode?: PowerRuleGateMode;
  strictFallbackToWarn?: boolean;
};

export type SettingDriftFeatureOptions = {
  gateMode?: import('./setting-drift-gate.js').SettingDriftGateMode;
  strictFallbackToWarn?: boolean;
};

export type LongFormFeatureOptions = {
  superLongModeEnabled?: boolean;
};

export type MemoryOrchestratorFeatureOptions = {
  /** 启用统一记忆编排器替代 loadEnhancedMemoryContext */
  enabled?: boolean;
};

export type TruthFileFeatureOptions = {
  /** 启用真相文件系统（默认关闭） */
  enabled?: boolean;
};

export type SnapshotFeatureOptions = {
  /** 启用章节生成前自动快照（默认关闭） */
  enabled?: boolean;
};

export type StructuredAuditFeatureOptions = {
  /** 启用结构化审计维度（默认关闭） */
  enabled?: boolean;
};

export type AiTraceFeatureOptions = {
  /** AI 痕迹门禁模式 (off / warn / strict)，默认 off */
  gateMode?: import('./ai-trace-gate.js').AiTraceGateMode;
  /** strict 失败后是否降级为 warn（而非抛出错误） */
  strictFallbackToWarn?: boolean;
  /** 门禁通过阈值 (0-100)，默认 60 */
  passThreshold?: number;
};

// ==================== 环境变量读取工具 ====================

export function readCharacterWhitelistGateModeEnv(): CharacterWhitelistGateMode {
  const raw = (process.env.CHARACTER_WHITELIST_GATE_MODE ?? 'warn').trim().toLowerCase();
  if (raw === 'off' || raw === 'warn' || raw === 'strict') return raw;
  return 'warn';
}

export function readPowerRuleGateModeEnv(): PowerRuleGateMode {
  const raw = (process.env.POWER_RULE_GATE_MODE ?? 'warn').trim().toLowerCase();
  if (raw === 'off' || raw === 'warn' || raw === 'strict') return raw;
  return 'warn';
}

export function readSettingDriftGateModeEnv(): import('./setting-drift-gate.js').SettingDriftGateMode {
  const raw = (process.env.SETTING_DRIFT_GATE_MODE ?? 'warn').trim().toLowerCase();
  if (raw === 'off' || raw === 'warn' || raw === 'strict') return raw;
  return 'warn';
}

export function readAiTraceGateModeEnv(): import('./ai-trace-gate.js').AiTraceGateMode {
  const raw = (process.env.AI_TRACE_GATE_MODE ?? 'warn').trim().toLowerCase();
  if (raw === 'off' || raw === 'warn' || raw === 'strict') return raw;
  return 'warn';
}

export function readBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (!raw || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function resolveChapterLengthGuardSkip(
  explicitSkip: boolean | undefined,
  rawEnabled: string | undefined = process.env.CHAPTER_LENGTH_GUARD_ENABLED,
): boolean {
  return explicitSkip ?? !readBoolEnv(rawEnabled, true);
}

// ==================== 章节读取缓存 ====================

/** 单次生成周期内的章节读取缓存，避免 buildPrevContext / buildAntiTemplate 重复 I/O */
export class ChapterReadCache {
  private cache = new Map<string, any>();
  async get(novelManager: PipelineNovelManager, novelId: string, chapterNumber: number): Promise<any> {
    const key = `${novelId}:${chapterNumber}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const ch = await novelManager.getChapter(novelId, chapterNumber);
    this.cache.set(key, ch ?? null);
    return ch ?? null;
  }
  clear() { this.cache.clear(); }
}
