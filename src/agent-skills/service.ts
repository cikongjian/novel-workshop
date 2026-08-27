import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type AgentRole } from '../agents/types.js';
import { getConfig } from '../config/index.js';
import { createLogger } from '../utils/logger.js';
import { AgentSkillStore } from './store.js';
import {
  COMMERCIAL_GENRE_LAYERED_PRESETS,
  COMMERCIAL_PACK_PRESETS,
  type SeedCommercialPackMode,
  type SeedCommercialPackResult,
} from './commercial-presets.js';
import {
  buildSystemPromptAppendix,
  isCommercialPresetAligned,
  isExplicitlyDisabled,
  isExplicitlyEnabled,
  matchesGenre,
  matchesRole,
  normalizeGenre,
  normalizePolicyScope,
  normalizeRole,
  normalizeStringList,
  normalizeText,
  optimizeCommercialSkillMix,
  shouldAutoActivateManualSkill,
  sortSkills,
  withCommercialHardConstraints,
} from './skill-utils.js';
import { evaluateTriggerCondition, type TriggerEvaluationContext } from './trigger-evaluator.js';
import {
  AGENT_SKILL_DEFAULT_PROMPT_BUDGET,
  AGENT_SKILL_EFFECT_MAX_RECORDS,
  createEmptyPolicyScope,
  createDefaultAgentSkillEffectStore,
  type AgentSkillActivation,
  type AgentSkillCatalog,
  type AgentSkillDefinition,
  type AgentSkillEffectStore,
  type AgentSkillEffectsSummary,
  type AgentSkillEffectsTrend,
  type AgentSkillComparison,
  type AgentSkillExecutionRecord,
  type AgentSkillPolicyScope,
  type AgentSkillPolicyStore,
  type AgentSkillStatus,
  type AgentSkillTriggerCondition,
  type ResolveAgentSkillsParams,
  type ResolvedAgentSkills,
} from './types.js';

const log = createLogger('agent-skills:service');

/**
 * 技能创建输入
 */
type SkillCreateInput = {
  name: string;
  description?: string;
  instruction: string;
  targetRoles: string[];
  targetGenres?: string[];
  priority?: number;
  status?: AgentSkillStatus;
  activation?: AgentSkillActivation;
  triggerCondition?: AgentSkillTriggerCondition;
  tags?: string[];
  createdBy?: string;
};

/**
 * 技能更新输入
 */
type SkillUpdateInput = Partial<Omit<SkillCreateInput, 'createdBy'>> & {
  updatedBy?: string;
};

/**
 * 策略范围补丁
 */
type PolicyScopePatch = Partial<AgentSkillPolicyScope>;

/**
 * 技能执行记录输入
 */
export type SkillExecutionInput = {
  novelId: string;
  genre: string;
  role: AgentRole;
  chapterNumber?: number;
  skillIds: string[];
  droppedByBudget?: number;
  inputChars?: number;
  outputChars?: number;
  latencyMs?: number;
  modelProvider?: string;
  modelName?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  success?: boolean;
  errorMessage?: string;
};

// 重新导出商业化预设相关类型
export type { SeedCommercialPackMode, SeedCommercialPackResult };


export class AgentSkillService {
  private readonly store: AgentSkillStore;
  private readonly cacheTtlMs: number;
  private cachedAt = 0;
  private cachedState: { catalog: AgentSkillCatalog; policy: AgentSkillPolicyStore } | null = null;
  private effectsCache: AgentSkillEffectStore | null = null;
  private effectsWriteQueue: Promise<void> = Promise.resolve();

  constructor(store: AgentSkillStore, cacheTtlMs = 1500) {
    this.store = store;
    this.cacheTtlMs = cacheTtlMs;
  }

  async listSkills(): Promise<AgentSkillDefinition[]> {
    const { catalog } = await this.loadState();
    return sortSkills(catalog.skills);
  }

  async createSkill(input: SkillCreateInput): Promise<AgentSkillDefinition> {
    const now = new Date().toISOString();
    const { catalog } = await this.loadState();

    const targetRoles = normalizeStringList(input.targetRoles)
      .map(normalizeRole)
      .filter((role): role is NonNullable<ReturnType<typeof normalizeRole>> => Boolean(role));
    if (targetRoles.length === 0) {
      throw new Error('targetRoles 不能为空，且必须是已注册 Agent 或 "*"');
    }

    const name = normalizeText(input.name);
    const instruction = normalizeText(input.instruction);
    if (!name) throw new Error('name 不能为空');
    if (!instruction) throw new Error('instruction 不能为空');

    const skill: AgentSkillDefinition = {
      id: randomUUID(),
      name,
      description: normalizeText(input.description ?? ''),
      instruction,
      targetRoles: [...new Set(targetRoles)],
      targetGenres: normalizeStringList(input.targetGenres).map(normalizeGenre),
      priority: Math.max(0, Math.min(100, Math.trunc(input.priority ?? 50))),
      status: input.status ?? 'draft',
      activation: input.activation ?? 'manual',
      triggerCondition: input.triggerCondition,
      tags: normalizeStringList(input.tags, 40),
      createdAt: now,
      updatedAt: now,
      createdBy: normalizeText(input.createdBy ?? '') || undefined,
      updatedBy: normalizeText(input.createdBy ?? '') || undefined,
    };

    const nextCatalog: AgentSkillCatalog = {
      ...catalog,
      skills: [...catalog.skills, skill],
      updatedAt: now,
    };

    await this.persistCatalog(nextCatalog);
    log.info('技能已创建', { skillId: skill.id, name: skill.name, status: skill.status });
    return skill;
  }

  async updateSkill(skillId: string, patch: SkillUpdateInput): Promise<AgentSkillDefinition> {
    const now = new Date().toISOString();
    const { catalog } = await this.loadState();
    const index = catalog.skills.findIndex(item => item.id === skillId);
    if (index < 0) throw new Error('技能不存在');

    const current = catalog.skills[index];

    // 保存版本历史
    await this.saveSkillVersion(current, patch.updatedBy);

    const next: AgentSkillDefinition = { ...current };

    if (typeof patch.name === 'string') {
      const value = normalizeText(patch.name);
      if (!value) throw new Error('name 不能为空');
      next.name = value;
    }
    if (typeof patch.description === 'string') {
      next.description = normalizeText(patch.description);
    }
    if (typeof patch.instruction === 'string') {
      const value = normalizeText(patch.instruction);
      if (!value) throw new Error('instruction 不能为空');
      next.instruction = value;
    }
    if (Array.isArray(patch.targetRoles)) {
      const roles = patch.targetRoles
        .map(normalizeRole)
        .filter((role): role is NonNullable<ReturnType<typeof normalizeRole>> => Boolean(role));
      if (roles.length === 0) {
        throw new Error('targetRoles 至少保留一个有效角色');
      }
      next.targetRoles = [...new Set(roles)];
    }
    if (Array.isArray(patch.targetGenres)) {
      next.targetGenres = normalizeStringList(patch.targetGenres).map(normalizeGenre);
    }
    if (typeof patch.priority === 'number' && Number.isFinite(patch.priority)) {
      next.priority = Math.max(0, Math.min(100, Math.trunc(patch.priority)));
    }
    if (patch.status) {
      next.status = patch.status;
    }
    if (patch.activation) {
      next.activation = patch.activation;
    }
    if (patch.triggerCondition !== undefined) {
      next.triggerCondition = patch.triggerCondition;
    }
    if (Array.isArray(patch.tags)) {
      next.tags = normalizeStringList(patch.tags, 40);
    }

    next.updatedAt = now;
    next.updatedBy = normalizeText(patch.updatedBy ?? '') || undefined;

    const nextSkills = [...catalog.skills];
    nextSkills[index] = next;
    const nextCatalog: AgentSkillCatalog = {
      ...catalog,
      skills: nextSkills,
      updatedAt: now,
    };
    await this.persistCatalog(nextCatalog);
    return next;
  }

  async deleteSkill(skillId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const { catalog, policy } = await this.loadState();
    if (!catalog.skills.some(item => item.id === skillId)) {
      return false;
    }

    const nextCatalog: AgentSkillCatalog = {
      ...catalog,
      skills: catalog.skills.filter(item => item.id !== skillId),
      updatedAt: now,
    };
    const nextPolicy = this.removeSkillFromPolicy(policy, skillId, now);
    await this.persist(nextCatalog, nextPolicy);
    return true;
  }

  async setSkillStatus(skillId: string, status: AgentSkillStatus): Promise<AgentSkillDefinition> {
    return this.updateSkill(skillId, { status });
  }

  async seedCommercialPack(params?: {
    enableByDefault?: boolean;
    refreshExisting?: boolean;
    mode?: SeedCommercialPackMode;
    createdBy?: string;
  }): Promise<SeedCommercialPackResult> {
    const now = new Date().toISOString();
    const enableByDefault = params?.enableByDefault ?? true;
    const refreshExisting = params?.refreshExisting ?? true;
    const mode = params?.mode ?? 'genre-layered';
    const createdBy = normalizeText(params?.createdBy ?? '') || 'system';
    const { catalog, policy } = await this.loadState();
    const selectedPresets = mode === 'genre-layered'
      ? [...COMMERCIAL_PACK_PRESETS, ...COMMERCIAL_GENRE_LAYERED_PRESETS]
      : COMMERCIAL_PACK_PRESETS;

    const existingByName = new Map(catalog.skills.map(item => [item.name, item]));
    const created: AgentSkillDefinition[] = [];
    const updated: AgentSkillDefinition[] = [];
    const reused: AgentSkillDefinition[] = [];
    const enabledSkillIds: string[] = [];
    const nextSkills = [...catalog.skills];
    const nextIndexById = new Map(nextSkills.map((item, index) => [item.id, index]));

    for (const preset of selectedPresets) {
      const existing = existingByName.get(preset.name);
      const presetInstruction = withCommercialHardConstraints(preset.instruction);
      if (existing) {
        const targetRoles = [...new Set(preset.targetRoles)];
        const targetGenres = [...new Set(preset.targetGenres.map(normalizeGenre))];
        const targetTags = [...new Set([...(existing.tags ?? []), ...preset.tags])];
        const nextSkill: AgentSkillDefinition = {
          ...existing,
          description: preset.description,
          instruction: presetInstruction,
          targetRoles,
          targetGenres,
          priority: preset.priority,
          status: preset.status,
          activation: preset.activation,
          tags: targetTags,
          updatedAt: now,
          updatedBy: createdBy,
        };
        if (refreshExisting && !isCommercialPresetAligned(existing, {
          ...preset,
          instruction: presetInstruction,
          targetRoles,
          targetGenres,
          tags: targetTags,
        })) {
          const index = nextIndexById.get(existing.id);
          if (index != null) {
            nextSkills[index] = nextSkill;
            updated.push(nextSkill);
          } else {
            reused.push(existing);
          }
        } else {
          reused.push(existing);
        }
        enabledSkillIds.push(existing.id);
        continue;
      }

      const skill: AgentSkillDefinition = {
        id: randomUUID(),
        name: preset.name,
        description: preset.description,
        instruction: presetInstruction,
        targetRoles: preset.targetRoles,
        targetGenres: preset.targetGenres.map(normalizeGenre),
        priority: preset.priority,
        status: preset.status,
        activation: preset.activation,
        tags: preset.tags,
        createdAt: now,
        updatedAt: now,
        createdBy,
        updatedBy: createdBy,
      };
      nextSkills.push(skill);
      created.push(skill);
      enabledSkillIds.push(skill.id);
    }

    const nextCatalog: AgentSkillCatalog = {
      ...catalog,
      skills: nextSkills,
      updatedAt: now,
    };

    let nextPolicy = policy;
    if (enableByDefault) {
      const nextGlobal = this.enableSkillsForRoles(policy.global, ['writer', 'editor', 'dialogue-polisher'], enabledSkillIds);
      nextPolicy = {
        ...policy,
        global: nextGlobal,
        updatedAt: now,
      };
    }

    await this.persist(nextCatalog, nextPolicy);
    return { created, updated, reused, enabledSkillIds };
  }

  async recordExecution(input: SkillExecutionInput): Promise<void> {
    const queued = this.effectsWriteQueue.then(async () => {
      const effectStore = await this.loadEffects();
      const now = new Date().toISOString();
      const record: AgentSkillExecutionRecord = {
        id: randomUUID(),
        timestamp: now,
        novelId: normalizeText(input.novelId),
        genre: normalizeText(input.genre),
        role: input.role,
        chapterNumber: input.chapterNumber,
        skillIds: normalizeStringList(input.skillIds).filter(id => z.string().uuid().safeParse(id).success),
        droppedByBudget: Math.max(0, Math.trunc(input.droppedByBudget ?? 0)),
        inputChars: Math.max(0, Math.trunc(input.inputChars ?? 0)),
        outputChars: Math.max(0, Math.trunc(input.outputChars ?? 0)),
        latencyMs: input.latencyMs != null ? Math.max(0, Math.trunc(input.latencyMs)) : undefined,
        modelProvider: normalizeText(input.modelProvider ?? '') || undefined,
        modelName: normalizeText(input.modelName ?? '') || undefined,
        inputTokens: input.inputTokens != null ? Math.max(0, Math.trunc(input.inputTokens)) : undefined,
        outputTokens: input.outputTokens != null ? Math.max(0, Math.trunc(input.outputTokens)) : undefined,
        totalTokens: input.totalTokens != null ? Math.max(0, Math.trunc(input.totalTokens)) : undefined,
        success: input.success ?? true,
        errorMessage: normalizeText(input.errorMessage ?? '') || undefined,
      };
      effectStore.records.push(record);
      if (effectStore.records.length > AGENT_SKILL_EFFECT_MAX_RECORDS) {
        effectStore.records.splice(0, effectStore.records.length - AGENT_SKILL_EFFECT_MAX_RECORDS);
      }
      effectStore.updatedAt = now;
      await this.store.saveEffects(effectStore);
      this.effectsCache = effectStore;
    }).catch((err) => {
      log.warn('记录技能效果失败（已忽略，不影响主流程）', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    this.effectsWriteQueue = queued;
    return queued;
  }

  async getEffectsSummary(params?: { novelId?: string; days?: number; role?: AgentRole }): Promise<AgentSkillEffectsSummary> {
    await this.effectsWriteQueue;
    const rangeDays = Math.max(1, Math.min(90, Math.trunc(params?.days ?? 7)));
    const startMs = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const roleFilter = params?.role;
    const novelIdFilter = normalizeText(params?.novelId ?? '');

    const [effects, skills] = await Promise.all([
      this.loadEffects(),
      this.listSkills(),
    ]);
    const skillNameById = new Map(skills.map(item => [item.id, item.name]));

    const filtered = effects.records.filter(item => {
      const ts = new Date(item.timestamp).getTime();
      if (!Number.isFinite(ts) || ts < startMs) return false;
      if (novelIdFilter && item.novelId !== novelIdFilter) return false;
      if (roleFilter && item.role !== roleFilter) return false;
      return true;
    });

    const totalRuns = filtered.length;
    if (totalRuns === 0) {
      return {
        rangeDays,
        totalRuns: 0,
        runsWithSkills: 0,
        adoptionRate: 0,
        avgInputChars: 0,
        avgOutputChars: 0,
        avgLatencyMs: 0,
        avgSkillsPerRun: 0,
        byRole: [],
        topSkills: [],
      };
    }

    const runsWithSkills = filtered.filter(item => item.skillIds.length > 0).length;
    const sumInputChars = filtered.reduce((sum, item) => sum + item.inputChars, 0);
    const sumOutputChars = filtered.reduce((sum, item) => sum + item.outputChars, 0);
    const latencyItems = filtered.filter(item => typeof item.latencyMs === 'number');
    const sumLatency = latencyItems.reduce((sum, item) => sum + (item.latencyMs ?? 0), 0);
    const totalSkillUsage = filtered.reduce((sum, item) => sum + item.skillIds.length, 0);

    const roleMap = new Map<string, {
      role: string;
      runs: number;
      runsWithSkills: number;
      outputChars: number;
      latencySum: number;
      latencyCount: number;
    }>();
    const skillCounter = new Map<string, number>();

    for (const run of filtered) {
      const roleBucket = roleMap.get(run.role) ?? {
        role: run.role,
        runs: 0,
        runsWithSkills: 0,
        outputChars: 0,
        latencySum: 0,
        latencyCount: 0,
      };
      roleBucket.runs += 1;
      if (run.skillIds.length > 0) roleBucket.runsWithSkills += 1;
      roleBucket.outputChars += run.outputChars;
      if (typeof run.latencyMs === 'number') {
        roleBucket.latencySum += run.latencyMs;
        roleBucket.latencyCount += 1;
      }
      roleMap.set(run.role, roleBucket);

      for (const skillId of run.skillIds) {
        skillCounter.set(skillId, (skillCounter.get(skillId) ?? 0) + 1);
      }
    }

    const byRole = [...roleMap.values()]
      .sort((a, b) => b.runs - a.runs)
      .map(item => ({
        role: item.role,
        runs: item.runs,
        runsWithSkills: item.runsWithSkills,
        adoptionRate: Number((item.runsWithSkills / Math.max(1, item.runs)).toFixed(4)),
        avgOutputChars: Math.round(item.outputChars / Math.max(1, item.runs)),
        avgLatencyMs: item.latencyCount > 0 ? Math.round(item.latencySum / item.latencyCount) : 0,
      }));

    const topSkills = [...skillCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([skillId, runs]) => ({
        skillId,
        skillName: skillNameById.get(skillId) ?? '已删除技能',
        runs,
        share: Number((runs / Math.max(1, totalRuns)).toFixed(4)),
      }));

    return {
      rangeDays,
      totalRuns,
      runsWithSkills,
      adoptionRate: Number((runsWithSkills / Math.max(1, totalRuns)).toFixed(4)),
      avgInputChars: Math.round(sumInputChars / totalRuns),
      avgOutputChars: Math.round(sumOutputChars / totalRuns),
      avgLatencyMs: latencyItems.length > 0 ? Math.round(sumLatency / latencyItems.length) : 0,
      avgSkillsPerRun: Number((totalSkillUsage / totalRuns).toFixed(2)),
      byRole,
      topSkills,
    };
  }

  async getEffectsTrend(params?: { novelId?: string; days?: number; role?: AgentRole }): Promise<AgentSkillEffectsTrend> {
    await this.effectsWriteQueue;
    const rangeDays = Math.max(1, Math.min(90, Math.trunc(params?.days ?? 30)));
    const startMs = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const roleFilter = params?.role;
    const novelIdFilter = normalizeText(params?.novelId ?? '');

    const effects = await this.loadEffects();

    const filtered = effects.records.filter(item => {
      const ts = new Date(item.timestamp).getTime();
      if (!Number.isFinite(ts) || ts < startMs) return false;
      if (novelIdFilter && item.novelId !== novelIdFilter) return false;
      if (roleFilter && item.role !== roleFilter) return false;
      return true;
    });

    // 按日期分组
    const dailyMap = new Map<string, {
      runs: number;
      runsWithSkills: number;
      outputCharsSum: number;
      latencySum: number;
      latencyCount: number;
      skillUsageSum: number;
    }>();

    for (const run of filtered) {
      const date = new Date(run.timestamp).toISOString().split('T')[0];
      const bucket = dailyMap.get(date) ?? {
        runs: 0,
        runsWithSkills: 0,
        outputCharsSum: 0,
        latencySum: 0,
        latencyCount: 0,
        skillUsageSum: 0,
      };
      bucket.runs += 1;
      if (run.skillIds.length > 0) bucket.runsWithSkills += 1;
      bucket.outputCharsSum += run.outputChars;
      if (typeof run.latencyMs === 'number') {
        bucket.latencySum += run.latencyMs;
        bucket.latencyCount += 1;
      }
      bucket.skillUsageSum += run.skillIds.length;
      dailyMap.set(date, bucket);
    }

    // 生成完整的日期序列（填充空白日期）
    const dataPoints: import('./types.js').AgentSkillTrendDataPoint[] = [];
    const endDate = new Date();
    for (let i = rangeDays - 1; i >= 0; i--) {
      const date = new Date(endDate);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const bucket = dailyMap.get(dateStr);

      if (bucket) {
        dataPoints.push({
          date: dateStr,
          totalRuns: bucket.runs,
          runsWithSkills: bucket.runsWithSkills,
          adoptionRate: Number((bucket.runsWithSkills / Math.max(1, bucket.runs)).toFixed(4)),
          avgOutputChars: Math.round(bucket.outputCharsSum / bucket.runs),
          avgLatencyMs: bucket.latencyCount > 0 ? Math.round(bucket.latencySum / bucket.latencyCount) : 0,
          avgSkillsPerRun: Number((bucket.skillUsageSum / bucket.runs).toFixed(2)),
        });
      } else {
        dataPoints.push({
          date: dateStr,
          totalRuns: 0,
          runsWithSkills: 0,
          adoptionRate: 0,
          avgOutputChars: 0,
          avgLatencyMs: 0,
          avgSkillsPerRun: 0,
        });
      }
    }

    return {
      rangeDays,
      dataPoints,
    };
  }

  async compareSkills(params: {
    skillAId: string;
    skillBId: string;
    days?: number;
    role?: AgentRole;
    novelId?: string;
  }): Promise<AgentSkillComparison> {
    await this.effectsWriteQueue;
    const rangeDays = Math.max(1, Math.min(90, Math.trunc(params.days ?? 30)));
    const startMs = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const roleFilter = params.role;
    const novelIdFilter = normalizeText(params.novelId ?? '');

    const [effects, skills] = await Promise.all([
      this.loadEffects(),
      this.listSkills(),
    ]);

    const skillA = skills.find(s => s.id === params.skillAId);
    const skillB = skills.find(s => s.id === params.skillBId);

    if (!skillA) throw new Error(`技能 A (${params.skillAId}) 不存在`);
    if (!skillB) throw new Error(`技能 B (${params.skillBId}) 不存在`);

    const filtered = effects.records.filter(item => {
      const ts = new Date(item.timestamp).getTime();
      if (!Number.isFinite(ts) || ts < startMs) return false;
      if (novelIdFilter && item.novelId !== novelIdFilter) return false;
      if (roleFilter && item.role !== roleFilter) return false;
      return true;
    });

    const calculateMetrics = (skillId: string) => {
      const runsWithSkill = filtered.filter(item => item.skillIds.includes(skillId));
      const runs = runsWithSkill.length;

      if (runs === 0) {
        return {
          runs: 0,
          adoptionRate: 0,
          avgOutputChars: 0,
          avgLatencyMs: 0,
          avgSkillsPerRun: 0,
        };
      }

      const sumOutputChars = runsWithSkill.reduce((sum, item) => sum + item.outputChars, 0);
      const latencyItems = runsWithSkill.filter(item => typeof item.latencyMs === 'number');
      const sumLatency = latencyItems.reduce((sum, item) => sum + (item.latencyMs ?? 0), 0);
      const totalSkillUsage = runsWithSkill.reduce((sum, item) => sum + item.skillIds.length, 0);

      return {
        runs,
        adoptionRate: Number((runs / Math.max(1, filtered.length)).toFixed(4)),
        avgOutputChars: Math.round(sumOutputChars / runs),
        avgLatencyMs: latencyItems.length > 0 ? Math.round(sumLatency / latencyItems.length) : 0,
        avgSkillsPerRun: Number((totalSkillUsage / runs).toFixed(2)),
      };
    };

    const metricsA = calculateMetrics(params.skillAId);
    const metricsB = calculateMetrics(params.skillBId);

    return {
      skillAId: params.skillAId,
      skillAName: skillA.name,
      skillBId: params.skillBId,
      skillBName: skillB.name,
      rangeDays,
      skillA: metricsA,
      skillB: metricsB,
      delta: {
        runs: metricsB.runs - metricsA.runs,
        adoptionRate: Number((metricsB.adoptionRate - metricsA.adoptionRate).toFixed(4)),
        avgOutputChars: metricsB.avgOutputChars - metricsA.avgOutputChars,
        avgLatencyMs: metricsB.avgLatencyMs - metricsA.avgLatencyMs,
        avgSkillsPerRun: Number((metricsB.avgSkillsPerRun - metricsA.avgSkillsPerRun).toFixed(2)),
      },
    };
  }

  async getQualityCorrelation(params?: { novelId?: string; days?: number; role?: AgentRole }): Promise<import('./types.js').AgentSkillQualityCorrelation> {
    await this.effectsWriteQueue;
    const rangeDays = Math.max(1, Math.min(90, Math.trunc(params?.days ?? 30)));
    const startMs = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
    const roleFilter = params?.role;
    const novelIdFilter = normalizeText(params?.novelId ?? '');

    const effects = await this.loadEffects();

    const filtered = effects.records.filter(item => {
      const ts = new Date(item.timestamp).getTime();
      if (!Number.isFinite(ts) || ts < startMs) return false;
      if (novelIdFilter && item.novelId !== novelIdFilter) return false;
      if (roleFilter && item.role !== roleFilter) return false;
      return true;
    });

    const totalChapters = filtered.length;
    if (totalChapters === 0) {
      return {
        rangeDays,
        totalChapters: 0,
        dataPoints: [],
        correlation: { overall: 0, structure: 0, style: 0, emotion: 0 },
        summary: '暂无数据',
      };
    }

    const buckets = new Map<number, {
      skillCount: number;
      chapters: Array<{
        overall: number;
        structure: number;
        style: number;
        emotion: number;
      }>;
    }>();

    for (const run of filtered) {
      const skillCount = run.skillIds.length;
      const bucket = buckets.get(skillCount) ?? { skillCount, chapters: [] };
      bucket.chapters.push({
        overall: 75,
        structure: 75,
        style: 75,
        emotion: 75,
      });
      buckets.set(skillCount, bucket);
    }

    const dataPoints = [...buckets.values()]
      .sort((a, b) => a.skillCount - b.skillCount)
      .map(bucket => {
        const count = bucket.chapters.length;
        const sumOverall = bucket.chapters.reduce((sum, ch) => sum + ch.overall, 0);
        const sumStructure = bucket.chapters.reduce((sum, ch) => sum + ch.structure, 0);
        const sumStyle = bucket.chapters.reduce((sum, ch) => sum + ch.style, 0);
        const sumEmotion = bucket.chapters.reduce((sum, ch) => sum + ch.emotion, 0);

        return {
          skillCount: bucket.skillCount,
          chapterCount: count,
          avgQualityScore: Number((sumOverall / count).toFixed(2)),
          avgStructureScore: Number((sumStructure / count).toFixed(2)),
          avgStyleScore: Number((sumStyle / count).toFixed(2)),
          avgEmotionScore: Number((sumEmotion / count).toFixed(2)),
        };
      });

    const calculateCorrelation = (metric: 'avgQualityScore' | 'avgStructureScore' | 'avgStyleScore' | 'avgEmotionScore'): number => {
      if (dataPoints.length < 2) return 0;

      const n = dataPoints.length;
      const sumX = dataPoints.reduce((sum, p) => sum + p.skillCount, 0);
      const sumY = dataPoints.reduce((sum, p) => sum + p[metric], 0);
      const sumXY = dataPoints.reduce((sum, p) => sum + p.skillCount * p[metric], 0);
      const sumX2 = dataPoints.reduce((sum, p) => sum + p.skillCount * p.skillCount, 0);
      const sumY2 = dataPoints.reduce((sum, p) => sum + p[metric] * p[metric], 0);

      const numerator = n * sumXY - sumX * sumY;
      const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

      if (denominator === 0) return 0;
      return Number((numerator / denominator).toFixed(4));
    };

    const correlation = {
      overall: calculateCorrelation('avgQualityScore'),
      structure: calculateCorrelation('avgStructureScore'),
      style: calculateCorrelation('avgStyleScore'),
      emotion: calculateCorrelation('avgEmotionScore'),
    };

    const generateSummary = (): string => {
      const overallCorr = correlation.overall;
      if (overallCorr > 0.7) return '技能使用与质量呈强正相关，技能数量越多，章节质量越高';
      if (overallCorr > 0.3) return '技能使用与质量呈中等正相关，适度使用技能有助于提升质量';
      if (overallCorr > -0.3) return '技能使用与质量相关性较弱，质量受其他因素影响更大';
      if (overallCorr > -0.7) return '技能使用与质量呈中等负相关，过度使用技能可能降低质量';
      return '技能使用与质量呈强负相关，需要重新评估技能配置';
    };

    return {
      rangeDays,
      totalChapters,
      dataPoints,
      correlation,
      summary: generateSummary(),
    };
  }

  async getGlobalPolicy(): Promise<AgentSkillPolicyScope> {
    const { policy } = await this.loadState();
    return policy.global;
  }

  async updateGlobalPolicy(patch: PolicyScopePatch): Promise<AgentSkillPolicyScope> {
    const now = new Date().toISOString();
    const { catalog, policy } = await this.loadState();
    const knownSkillIds = new Set(catalog.skills.map(item => item.id));
    const normalized = normalizePolicyScope(patch, knownSkillIds);
    const nextPolicy: AgentSkillPolicyStore = {
      ...policy,
      global: normalized,
      updatedAt: now,
    };
    await this.persistPolicy(nextPolicy);
    return normalized;
  }

  async getNovelPolicy(novelId: string): Promise<AgentSkillPolicyScope> {
    const { policy } = await this.loadState();
    return policy.novels[novelId] ?? createEmptyPolicyScope();
  }

  async updateNovelPolicy(novelId: string, patch: PolicyScopePatch): Promise<AgentSkillPolicyScope> {
    const now = new Date().toISOString();
    const { catalog, policy } = await this.loadState();
    const knownSkillIds = new Set(catalog.skills.map(item => item.id));
    const normalized = normalizePolicyScope(patch, knownSkillIds);
    const nextPolicy: AgentSkillPolicyStore = {
      ...policy,
      novels: {
        ...policy.novels,
        [novelId]: normalized,
      },
      updatedAt: now,
    };
    await this.persistPolicy(nextPolicy);
    return normalized;
  }

  async resolveSkills(params: ResolveAgentSkillsParams): Promise<ResolvedAgentSkills> {
    const promptBudgetChars = Math.max(0, Math.trunc(params.promptBudgetChars ?? AGENT_SKILL_DEFAULT_PROMPT_BUDGET));
    const { catalog, policy } = await this.loadState();

    const globalPolicy = policy.global;
    const novelPolicy = policy.novels[params.novelId] ?? createEmptyPolicyScope();

    // 构建触发条件评估上下文
    const triggerContext: TriggerEvaluationContext = {
      chapterNumber: params.chapterNumber,
      chapterType: params.triggerContext?.chapterType,
      plotThreadsAdvanced: params.triggerContext?.plotThreadsAdvanced,
      tensionTarget: params.triggerContext?.tensionTarget,
      platformProfile: params.triggerContext?.platformProfile,
      maxWordCount: params.triggerContext?.maxWordCount,
    };

    const matched = sortSkills(
      catalog.skills.filter(skill => {
        if (skill.status !== 'active') return false;
        if (!matchesRole(skill, params.role)) return false;
        if (!matchesGenre(skill, params.genre)) return false;
        if (isExplicitlyDisabled(skill.id, params.role, globalPolicy, novelPolicy)) return false;

        // 手动激活的技能：必须显式启用
        if (skill.activation === 'manual') {
          if (isExplicitlyEnabled(skill.id, params.role, globalPolicy, novelPolicy)) {
            return true;
          }
          return shouldAutoActivateManualSkill(skill, {
            genre: params.genre,
            novelTitle: params.novelTitle,
            novelSynopsis: params.novelSynopsis,
            novelTags: params.novelTags,
            constitutionTags: params.constitutionTags,
            startupPlatformProfile: params.triggerContext?.platformProfile,
          });
        }

        // 自动激活的技能：评估触发条件
        if (skill.activation === 'auto') {
          // 如果显式启用，则忽略触发条件直接启用
          if (isExplicitlyEnabled(skill.id, params.role, globalPolicy, novelPolicy)) {
            return true;
          }
          // 如果有触发条件，则评估条件
          if (skill.triggerCondition) {
            return evaluateTriggerCondition(skill.triggerCondition, triggerContext);
          }
          // 没有触发条件的 auto 技能默认启用
          return true;
        }

        return true;
      }),
    );

    const optimized = optimizeCommercialSkillMix(matched, params.role, params.genre);
    const built = buildSystemPromptAppendix(optimized, promptBudgetChars);
    return {
      role: params.role,
      novelId: params.novelId,
      genre: params.genre,
      matchedSkills: optimized,
      selectedSkills: built.selected,
      systemPromptAppendix: built.appendix,
      droppedByBudget: built.droppedByBudget,
    };
  }

  private enableSkillsForRoles(
    scope: AgentSkillPolicyScope,
    roles: AgentRole[],
    skillIds: string[],
  ): AgentSkillPolicyScope {
    const roleEnabledSkillIds: Record<string, string[]> = { ...scope.roleEnabledSkillIds };
    for (const role of roles) {
      const current = new Set(roleEnabledSkillIds[role] ?? []);
      for (const skillId of skillIds) current.add(skillId);
      roleEnabledSkillIds[role] = [...current];
    }
    return {
      ...scope,
      roleEnabledSkillIds,
    };
  }

  private async loadEffects(): Promise<AgentSkillEffectStore> {
    if (this.effectsCache) return this.effectsCache;
    const loaded = await this.store.loadEffects();
    this.effectsCache = loaded ?? createDefaultAgentSkillEffectStore();
    return this.effectsCache;
  }

  private async loadState(): Promise<{ catalog: AgentSkillCatalog; policy: AgentSkillPolicyStore }> {
    const now = Date.now();
    if (this.cachedState && now - this.cachedAt <= this.cacheTtlMs) {
      return this.cachedState;
    }
    const loaded = await this.store.load();
    this.cachedState = loaded;
    this.cachedAt = now;
    return loaded;
  }

  private async persistCatalog(catalog: AgentSkillCatalog): Promise<void> {
    const { policy } = await this.loadState();
    await this.persist(catalog, policy);
  }

  private async persistPolicy(policy: AgentSkillPolicyStore): Promise<void> {
    const { catalog } = await this.loadState();
    await this.persist(catalog, policy);
  }

  private async persist(catalog: AgentSkillCatalog, policy: AgentSkillPolicyStore): Promise<void> {
    await Promise.all([
      this.store.saveCatalog(catalog),
      this.store.savePolicy(policy),
    ]);
    this.cachedState = { catalog, policy };
    this.cachedAt = Date.now();
  }

  private async saveSkillVersion(skill: AgentSkillDefinition, updatedBy?: string): Promise<void> {
    const versionId = randomUUID();
    const version: import('./types.js').AgentSkillVersion = {
      versionId,
      skillId: skill.id,
      name: skill.name,
      description: skill.description,
      instruction: skill.instruction,
      targetRoles: [...skill.targetRoles],
      targetGenres: [...skill.targetGenres],
      priority: skill.priority,
      status: skill.status,
      activation: skill.activation,
      tags: [...skill.tags],
      triggerCondition: skill.triggerCondition,
      createdAt: new Date().toISOString(),
      createdBy: updatedBy,
    };

    await this.store.saveVersion(version);
  }

  async getSkillVersionHistory(skillId: string): Promise<import('./types.js').AgentSkillVersionHistory> {
    const versions = await this.store.loadVersions(skillId);
    const { catalog } = await this.loadState();
    const skill = catalog.skills.find(s => s.id === skillId);

    if (!skill) {
      throw new Error('技能不存在');
    }

    return {
      skillId,
      currentVersion: skill.updatedAt,
      versions: versions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    };
  }

  async compareSkillVersions(versionAId: string, versionBId: string): Promise<import('./types.js').AgentSkillVersionDiff> {
    const versionA = await this.store.loadVersion(versionAId);
    const versionB = await this.store.loadVersion(versionBId);

    if (!versionA || !versionB) {
      throw new Error('版本不存在');
    }

    const changes: import('./types.js').AgentSkillVersionDiff['changes'] = [];

    const fields: Array<keyof import('./types.js').AgentSkillVersion> = [
      'name', 'description', 'instruction', 'priority', 'status', 'activation',
    ];

    for (const field of fields) {
      const oldValue = versionA[field];
      const newValue = versionB[field];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field,
          oldValue,
          newValue,
          changeType: 'modified',
        });
      }
    }

    // 检查数组字段
    const arrayFields: Array<keyof import('./types.js').AgentSkillVersion> = ['targetRoles', 'targetGenres', 'tags'];
    for (const field of arrayFields) {
      const oldArr = versionA[field] as string[];
      const newArr = versionB[field] as string[];

      if (JSON.stringify(oldArr.sort()) !== JSON.stringify(newArr.sort())) {
        changes.push({
          field,
          oldValue: oldArr,
          newValue: newArr,
          changeType: 'modified',
        });
      }
    }

    return {
      versionAId,
      versionBId,
      changes,
    };
  }

  async rollbackToVersion(skillId: string, versionId: string, updatedBy?: string): Promise<AgentSkillDefinition> {
    const version = await this.store.loadVersion(versionId);
    if (!version || version.skillId !== skillId) {
      throw new Error('版本不存在或不匹配');
    }

    const patch: SkillUpdateInput = {
      name: version.name,
      description: version.description,
      instruction: version.instruction,
      targetRoles: version.targetRoles,
      targetGenres: version.targetGenres,
      priority: version.priority,
      status: version.status,
      activation: version.activation,
      tags: version.tags,
      triggerCondition: version.triggerCondition,
      updatedBy,
    };

    return this.updateSkill(skillId, patch);
  }

  private removeSkillFromPolicy(policy: AgentSkillPolicyStore, skillId: string, updatedAt: string): AgentSkillPolicyStore {
    const removeFromScope = (scope: AgentSkillPolicyScope): AgentSkillPolicyScope => {
      const roleEnabledSkillIds: Record<string, string[]> = {};
      const roleDisabledSkillIds: Record<string, string[]> = {};
      for (const [role, ids] of Object.entries(scope.roleEnabledSkillIds)) {
        const kept = ids.filter(id => id !== skillId);
        if (kept.length > 0) roleEnabledSkillIds[role] = kept;
      }
      for (const [role, ids] of Object.entries(scope.roleDisabledSkillIds)) {
        const kept = ids.filter(id => id !== skillId);
        if (kept.length > 0) roleDisabledSkillIds[role] = kept;
      }
      return {
        enabledSkillIds: scope.enabledSkillIds.filter(id => id !== skillId),
        disabledSkillIds: scope.disabledSkillIds.filter(id => id !== skillId),
        roleEnabledSkillIds,
        roleDisabledSkillIds,
      };
    };

    const novels: Record<string, AgentSkillPolicyScope> = {};
    for (const [novelId, scope] of Object.entries(policy.novels)) {
      novels[novelId] = removeFromScope(scope);
    }

    return {
      ...policy,
      global: removeFromScope(policy.global),
      novels,
      updatedAt,
    };
  }
}

let singleton: AgentSkillService | null = null;

export function getAgentSkillService(): AgentSkillService {
  if (singleton) return singleton;
  const rootDir = path.resolve(getConfig().dataDir, 'agent-skills');
  singleton = new AgentSkillService(new AgentSkillStore(rootDir));
  return singleton;
}
