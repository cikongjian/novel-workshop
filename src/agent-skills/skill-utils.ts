/**
 * Agent Skills 工具函数
 *
 * 本模块包含所有与技能处理相关的工具函数，包括：
 * - 文本规范化函数
 * - 字符串和数组处理
 * - 匹配和过滤函数
 * - 商业化技能相关函数
 * - 策略检查和处理
 * - Prompt 构建函数
 */

import type { AgentRole } from '../agents/types.js';
import { AGENT_NAMES } from '../agents/types.js';
import { getTopicGenreAliases, getTopicSkillSignals } from '../pipeline/topic-profiles.js';
import type { AgentSkillDefinition, AgentSkillPolicyScope, AgentSkillRole } from './types.js';
import { COMMERCIAL_STRUCTURE_GUARD } from './commercial-presets.js';

const KNOWN_AGENT_ROLES = new Set(Object.keys(AGENT_NAMES) as AgentRole[]);

/**
 * 规范化文本：去除首尾空格
 */
export function normalizeText(value: string): string {
  return value.trim();
}

/**
 * 规范化角色：验证角色是否为已注册的 Agent 角色
 */
export function normalizeRole(role: string): AgentSkillRole | null {
  const cleaned = normalizeText(role);
  if (!cleaned) return null;
  if (cleaned === '*') return '*';
  if (KNOWN_AGENT_ROLES.has(cleaned as AgentRole)) {
    return cleaned as AgentRole;
  }
  return null;
}

/**
 * 规范化题材：转小写处理
 */
export function normalizeGenre(genre: string): string {
  return normalizeText(genre).toLowerCase().replace(/[_\s]+/g, '-');
}

function expandGenreAliases(genre: string): Set<string> {
  const normalized = normalizeGenre(genre);
  const aliases = new Set<string>([normalized]);

  const aliasGroups: string[][] = [
    ['modern', 'urban'],
    ['mystery', 'suspense'],
    ['historical', 'history'],
    ['scifi', 'sci-fi', 'science-fiction'],
  ];

  for (const group of aliasGroups) {
    if (!group.includes(normalized)) continue;
    for (const item of group) {
      aliases.add(item);
    }
  }
  for (const item of getTopicGenreAliases(genre)) {
    aliases.add(normalizeGenre(item));
  }

  return aliases;
}

export function inferStorySignals(params: {
  genre?: string;
  novelTitle?: string;
  novelSynopsis?: string;
  novelTags?: string[];
  constitutionTags?: string[];
  startupPlatformProfile?: 'auto' | 'fanqie' | 'qidian';
}): Set<string> {
  const corpus = [
    params.novelTitle ?? '',
    params.novelSynopsis ?? '',
    ...(params.constitutionTags ?? []),
    ...(params.novelTags ?? []),
    params.genre ?? '',
  ].join('\n');

  const signals = new Set<string>();
  if (params.startupPlatformProfile === 'fanqie') signals.add('fanqie');
  if (/(娱乐圈|影帝|顶流|试镜|热搜|剧组|番位|综艺|经纪人)/.test(corpus)) signals.add('showbiz');
  if (/(重生|前世|重回|再来一次|改命|预知)/.test(corpus)) signals.add('rebirth');
  if (/(羞耻系统|社死系统|羞耻|社死|公开处刑)/.test(corpus)) signals.add('shame-system');
  if (/(打脸|爽文|逆袭|反杀|翻盘|踩脸)/.test(corpus)) signals.add('faceslap');
  if (/(大女主|事业线|独美|无cp|无CP|签约|升职|项目)/.test(corpus)) signals.add('female-oriented');
  if (/(甜宠|爽甜|高甜|心动|先婚后爱|追妻|吃醋)/.test(corpus)) signals.add('romance');
  for (const signal of getTopicSkillSignals(params)) {
    signals.add(signal);
  }
  return signals;
}

export function shouldAutoActivateManualSkill(
  skill: AgentSkillDefinition,
  params: {
    genre?: string;
    novelTitle?: string;
    novelSynopsis?: string;
    novelTags?: string[];
    constitutionTags?: string[];
    startupPlatformProfile?: 'auto' | 'fanqie' | 'qidian';
  },
): boolean {
  if (skill.activation !== 'manual') return false;
  const tags = new Set(skill.tags.map(tag => normalizeGenre(tag)));
  const signals = inferStorySignals(params);

  if (signals.has('showbiz') && tags.has('showbiz')) return true;
  if (signals.has('rebirth') && tags.has('rebirth')) return true;
  if (signals.has('shame-system') && tags.has('system')) return true;
  if (signals.has('female-oriented') && tags.has('female-oriented')) return true;
  if (signals.has('romance') && tags.has('romance')) return true;
  if (signals.has('faceslap') && tags.has('faceslap')) return true;
  for (const signal of signals) {
    if (tags.has(normalizeGenre(signal))) return true;
  }
  if (signals.has('fanqie') && tags.has('fanqie') && (signals.has('faceslap') || signals.has('showbiz') || signals.has('shame-system'))) {
    return true;
  }

  return false;
}

/**
 * 规范化字符串数组：去重、截断、过滤空值
 */
export function normalizeStringList(values: string[] | undefined, maxLength = 120): string[] {
  if (!values || values.length === 0) return [];
  const deduped = new Set<string>();
  for (const item of values) {
    const cleaned = normalizeText(item);
    if (!cleaned) continue;
    deduped.add(cleaned.slice(0, maxLength));
  }
  return [...deduped];
}

/**
 * 为指令添加商业化硬约束
 */
export function withCommercialHardConstraints(instruction: string): string {
  const base = normalizeText(instruction);
  if (!base) return COMMERCIAL_STRUCTURE_GUARD;
  if (base.includes('结构稳定硬约束') || base.includes('章尾推进触发器')) {
    return base;
  }
  return `${base}\n\n${COMMERCIAL_STRUCTURE_GUARD}`;
}

/**
 * 排序并去重字符串数组
 */
export function sortAndDedupe(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

/**
 * 判断两个字符串数组是否相同（忽略顺序）
 */
export function isSameStringSet(a: string[], b: string[]): boolean {
  const left = sortAndDedupe(a);
  const right = sortAndDedupe(b);
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

/**
 * 判断商业化技能预设是否与已有技能对齐
 */
export function isCommercialPresetAligned(
  skill: AgentSkillDefinition,
  preset: {
    description: string;
    instruction: string;
    targetRoles: AgentSkillRole[];
    targetGenres: string[];
    priority: number;
    tags?: string[];
  },
): boolean {
  if (skill.description !== preset.description) return false;
  if (skill.instruction !== preset.instruction) return false;
  if (!isSameStringSet(skill.targetRoles, preset.targetRoles)) return false;
  if (!isSameStringSet(skill.targetGenres, preset.targetGenres)) return false;
  if (skill.priority !== preset.priority) return false;
  if (preset.tags && !isSameStringSet(skill.tags, preset.tags)) return false;
  return true;
}

/**
 * 规范化角色映射：过滤无效角色和技能 ID
 */
export function normalizeRoleMap(
  input: Record<string, string[] | undefined> | undefined,
  knownSkillIds: Set<string>,
): Record<string, string[]> {
  if (!input) return {};
  const result: Record<string, string[]> = {};
  for (const [rawRole, skillIds] of Object.entries(input)) {
    if (!KNOWN_AGENT_ROLES.has(rawRole as AgentRole)) continue;
    const filtered = normalizeStringList(skillIds ?? []).filter(id => knownSkillIds.has(id));
    if (filtered.length > 0) {
      result[rawRole] = filtered;
    }
  }
  return result;
}

/**
 * 对技能列表按优先级和名称排序
 */
export function sortSkills(skills: AgentSkillDefinition[]): AgentSkillDefinition[] {
  return [...skills].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

/**
 * 检查角色映射中是否包含指定技能
 */
export function roleMapHasSkill(map: Record<string, string[]>, role: AgentRole, skillId: string): boolean {
  const scoped = map[role];
  return Array.isArray(scoped) && scoped.includes(skillId);
}

/**
 * 判断技能是否匹配指定角色
 */
export function matchesRole(skill: AgentSkillDefinition, role: AgentRole): boolean {
  return skill.targetRoles.includes('*') || skill.targetRoles.includes(role);
}

/**
 * 判断技能是否匹配指定题材
 */
export function matchesGenre(skill: AgentSkillDefinition, genre: string): boolean {
  if (skill.targetGenres.length === 0) return true;
  const aliases = expandGenreAliases(genre);
  return skill.targetGenres.some(item => item === '*' || aliases.has(normalizeGenre(item)));
}

/**
 * 判断是否为商业化技能
 */
export function isCommercialSkill(skill: AgentSkillDefinition): boolean {
  return skill.tags.includes('commercial-pack');
}

/**
 * 解析商业化技能类别
 */
export function resolveCommercialSkillCategory(skill: AgentSkillDefinition): string {
  const tags = new Set(skill.tags);
  if (tags.has('genre-layered')) return 'genre';
  if (tags.has('chapter-hook') || tags.has('retention')) return 'hook';
  if (tags.has('pacing') || tags.has('conflict')) return 'structure';
  if (tags.has('style') || tags.has('anti-template')) return 'style';
  if (tags.has('dialogue') || tags.has('character')) return 'dialogue';
  if (tags.has('conversion') || tags.has('paywall')) return 'conversion';
  return 'other';
}

/**
 * 判断是否为题材特定技能
 */
export function isGenreSpecificSkill(skill: AgentSkillDefinition, genre: string): boolean {
  const aliases = expandGenreAliases(genre);
  return skill.targetGenres.some(item => item !== '*' && aliases.has(normalizeGenre(item)));
}

/**
 * 优化商业化技能组合：限制数量并确保类别覆盖
 */
export function optimizeCommercialSkillMix(
  skills: AgentSkillDefinition[],
  role: AgentRole,
  genre: string,
): AgentSkillDefinition[] {
  if (role !== 'writer' && role !== 'editor') {
    return sortSkills(skills);
  }

  const commercial = sortSkills(skills.filter(isCommercialSkill));
  const nonCommercial = sortSkills(skills.filter(skill => !isCommercialSkill(skill)));
  if (commercial.length <= 5) {
    return sortSkills([...nonCommercial, ...commercial]);
  }

  const picked: AgentSkillDefinition[] = [];
  const pickedById = new Set<string>();
  const categoryCount = new Map<string, number>();
  const maxCommercial = role === 'writer' ? 5 : 4;
  const required = role === 'writer'
    ? ['genre', 'structure', 'hook', 'style']
    : ['genre', 'structure', 'style'];

  const orderedCommercial = sortSkills([
    ...commercial.filter(skill => isGenreSpecificSkill(skill, genre)),
    ...commercial.filter(skill => !isGenreSpecificSkill(skill, genre)),
  ]);

  const addSkill = (skill: AgentSkillDefinition, force = false): boolean => {
    if (pickedById.has(skill.id)) return false;
    if (picked.length >= maxCommercial) return false;
    const category = resolveCommercialSkillCategory(skill);
    const count = categoryCount.get(category) ?? 0;
    if (!force && category !== 'other' && count >= 1) return false;
    if (!force && category === 'other' && count >= 2) return false;
    picked.push(skill);
    pickedById.add(skill.id);
    categoryCount.set(category, count + 1);
    return true;
  };

  for (const category of required) {
    const target = orderedCommercial.find(skill => resolveCommercialSkillCategory(skill) === category);
    if (target) addSkill(target, true);
  }

  for (const skill of orderedCommercial) {
    if (picked.length >= maxCommercial) break;
    addSkill(skill);
  }

  return sortSkills([...nonCommercial, ...picked]);
}

/**
 * 检查技能是否被明确禁用
 */
export function isExplicitlyDisabled(
  skillId: string,
  role: AgentRole,
  global: AgentSkillPolicyScope,
  novel: AgentSkillPolicyScope,
): boolean {
  return global.disabledSkillIds.includes(skillId)
    || novel.disabledSkillIds.includes(skillId)
    || roleMapHasSkill(global.roleDisabledSkillIds, role, skillId)
    || roleMapHasSkill(novel.roleDisabledSkillIds, role, skillId);
}

/**
 * 检查技能是否被明确启用
 */
export function isExplicitlyEnabled(
  skillId: string,
  role: AgentRole,
  global: AgentSkillPolicyScope,
  novel: AgentSkillPolicyScope,
): boolean {
  return global.enabledSkillIds.includes(skillId)
    || novel.enabledSkillIds.includes(skillId)
    || roleMapHasSkill(global.roleEnabledSkillIds, role, skillId)
    || roleMapHasSkill(novel.roleEnabledSkillIds, role, skillId);
}

/**
 * 规范化策略范围：过滤无效技能 ID 和角色映射
 */
export function normalizePolicyScope(
  patch: Partial<AgentSkillPolicyScope>,
  knownSkillIds: Set<string>,
): AgentSkillPolicyScope {
  return {
    enabledSkillIds: normalizeStringList(patch.enabledSkillIds).filter(id => knownSkillIds.has(id)),
    disabledSkillIds: normalizeStringList(patch.disabledSkillIds).filter(id => knownSkillIds.has(id)),
    roleEnabledSkillIds: normalizeRoleMap(patch.roleEnabledSkillIds, knownSkillIds),
    roleDisabledSkillIds: normalizeRoleMap(patch.roleDisabledSkillIds, knownSkillIds),
  };
}

/**
 * 构建系统提示词附录：将技能指令格式化为 Markdown
 */
export function buildSystemPromptAppendix(
  skills: AgentSkillDefinition[],
  promptBudgetChars: number,
): { appendix: string; selected: AgentSkillDefinition[]; droppedByBudget: number } {
  if (skills.length === 0 || promptBudgetChars <= 0) {
    return { appendix: '', selected: [], droppedByBudget: 0 };
  }

  const header = [
    '## 平台技能增强（系统级硬约束）',
    '以下规则来自平台技能中心，优先级高于一般风格偏好，需严格执行：',
    '',
  ].join('\n');

  let used = header.length;
  let droppedByBudget = 0;
  const chosen: AgentSkillDefinition[] = [];
  const sections: string[] = [];

  for (const [index, skill] of skills.entries()) {
    const body = normalizeText(skill.instruction);
    if (!body) continue;
    const section = `### 技能 ${index + 1}：${skill.name}\n${body}\n`;
    if (used + section.length > promptBudgetChars) {
      droppedByBudget += 1;
      continue;
    }
    used += section.length;
    chosen.push(skill);
    sections.push(section);
  }

  if (chosen.length === 0) {
    return { appendix: '', selected: [], droppedByBudget };
  }

  const footer = '\n以上技能规则为平台经营策略，请在输出中落实。';
  const appendix = `${header}${sections.join('\n')}${footer}`;
  return { appendix, selected: chosen, droppedByBudget };
}
