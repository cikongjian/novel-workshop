/**
 * 上下文构建函数 — 从 chapter-pipeline.ts 提取的纯函数/可独立调用的上下文生成器。
 *
 * 每个函数通过显式参数获取所需数据，不依赖 ChapterPipeline 的 `this`。
 */

import type { CharacterProfile, WorldEntry, CharacterEvent } from '../novel/types.js';
import type { AgentRole } from '../agents/types.js';
import type { PipelineNovelManager } from './types.js';
import type { ChapterReadCache } from './pipeline-constants.js';
import type { ChapterEnhancementThresholds, ConsistencyGuardrailThresholds } from './chapter-enhancement.js';
import type { WorldCard } from './world-context-v2.js';
import { buildConsistencyReport } from '../novel/character-consistency.js';
import {
  buildConsistencyGuardrails as composeConsistencyGuardrails,
  buildAntiTemplateRules as composeAntiTemplateRules,
  buildAntiAiTellsRules as composeAntiAiTellsRules,
  buildAntiAiStructureRules as composeAntiAiStructureRules,
  buildRecurringDescriptionRules as composeRecurringDescriptionRules,
  buildChapterOpeningRules as composeChapterOpeningRules,
  buildPayoffDensityHints as composePayoffDensityHints,
  selectKeyCharacters,
} from './chapter-enhancement.js';
import { buildIdentitySpeechRuleLine } from './character-identity-rules.js';
import { detectCharacterStatus, getLatestStateEntry, isCharacterUnavailable } from '../utils/character-status.js';
import { parseReaderFeedback, buildRevisionInstructions } from './structured-feedback.js';
import { selectRevisionStrategy, buildRevisionModeHint } from './revision-strategy.js';
import {
  PREV_CHAPTER_MAX_CHARS,
  EARLIER_CHAPTER_MAX_CHARS,
  MAX_PREV_CHAPTERS,
  WORLD_CATEGORY_LABELS,
  CHARACTER_ROLE_LABELS,
} from './pipeline-constants.js';
import { OFFSTAGE_CHARACTER_SUMMARY_MAX_CHARS } from './context-budget.js';

// ==================== 前文上下文 ====================

export async function buildPreviousChapterContext(
  novelManager: PipelineNovelManager,
  chapterCache: ChapterReadCache,
  novelId: string,
  currentChapterNumber: number,
): Promise<string> {
  if (currentChapterNumber <= 1) return '';

  const parts: string[] = [];
  const startChapter = Math.max(1, currentChapterNumber - MAX_PREV_CHAPTERS);

  for (let i = startChapter; i < currentChapterNumber; i += 1) {
    try {
      const chapter = await chapterCache.get(novelManager, novelId, i);
      if (!chapter || !chapter.content) continue;

      const isLastChapter = i === currentChapterNumber - 1;
      const label = isLastChapter ? '（上一章）' : '';
      const title = chapter.title ? `《${chapter.title}》` : '';

      if (isLastChapter) {
        let excerpt = chapter.content;
        if (excerpt.length > PREV_CHAPTER_MAX_CHARS) {
          excerpt = `...${excerpt.slice(-PREV_CHAPTER_MAX_CHARS)}`;
        }
        parts.push(`### 第 ${i} 章 ${title}${label}\n${excerpt}`);
      } else if (chapter.summary) {
        parts.push(`### 第 ${i} 章 ${title}（前情提要）\n${chapter.summary}`);
      } else {
        let excerpt = chapter.content;
        if (excerpt.length > EARLIER_CHAPTER_MAX_CHARS) {
          excerpt = `...${excerpt.slice(-EARLIER_CHAPTER_MAX_CHARS)}`;
        }
        parts.push(`### 第 ${i} 章 ${title}\n${excerpt}`);
      }
    } catch {
      // 跳过读取失败的章节
    }
  }

  // 兜底：如果最近窗口内没有找到任何有效章节，继续向前查找最近一个有内容的章节
  // 防止因连续空白/失败章节导致前文上下文为空，触发安全网错误后形成恶性循环
  if (parts.length === 0) {
    const fallbackStart = startChapter > 1 ? startChapter - 1 : currentChapterNumber - 1;
    for (let i = fallbackStart; i >= 1; i -= 1) {
      try {
        const chapter = await chapterCache.get(novelManager, novelId, i);
        if (!chapter || !chapter.content) continue;

        const title = chapter.title ? `《${chapter.title}》` : '';
        if (chapter.summary) {
          parts.push(`### 第 ${i} 章 ${title}（前情提要）\n${chapter.summary}`);
        } else {
          let excerpt = chapter.content;
          if (excerpt.length > EARLIER_CHAPTER_MAX_CHARS) {
            excerpt = `...${excerpt.slice(-EARLIER_CHAPTER_MAX_CHARS)}`;
          }
          parts.push(`### 第 ${i} 章 ${title}\n${excerpt}`);
        }
        break;
      } catch {
        // 跳过读取失败的章节
      }
    }
  }

  if (parts.length === 0) return '';
  return `以下是前文内容，请确保本章与之衔接：\n\n${parts.join('\n\n')}`;
}

// ==================== 角色上下文 ====================

export function buildCharacterContext(
  characters: CharacterProfile[],
  options?: {
    identityRuleFocusCharacterIds?: string[];
    /**
     * 分层披露：只有 relevantCharacterIds 中的角色输出完整档案，
     * 其余活跃角色仅输出名字 + 角色定位 + 简要当前状态（一行）。
     * 未传入或为空集时，所有活跃角色都输出完整档案（向后兼容）。
     */
    relevantCharacterIds?: Set<string>;
  },
): string {
  if (characters.length === 0) return '';
  const focusedIds = new Set((options?.identityRuleFocusCharacterIds ?? []).filter(Boolean));
  const hasFocus = focusedIds.size > 0;
  const relevantIds = options?.relevantCharacterIds;
  const hasRelevanceFilter = relevantIds != null && relevantIds.size > 0;

  const active: typeof characters = [];
  const unavailable: Array<{ name: string; status: string; lastState: string }> = [];

  for (const c of characters) {
    if (isCharacterUnavailable(c.currentState)) {
      const status = detectCharacterStatus(c.currentState);
      const lastState = getLatestStateEntry(c.currentState || '');
      unavailable.push({
        name: c.name,
        status: status === 'dead' ? '已死亡' : '已退场',
        lastState: lastState.slice(0, OFFSTAGE_CHARACTER_SUMMARY_MAX_CHARS),
      });
    } else {
      active.push(c);
    }
  }

  // 主角始终输出完整档案（即使不在 relevantIds 中）
  const isFullProfile = (c: CharacterProfile): boolean => {
    if (!hasRelevanceFilter) return true;
    if (relevantIds.has(c.id)) return true;
    if (c.role === 'protagonist') return true;
    return false;
  };

  const fullProfileChars = active.filter(c => isFullProfile(c));
  const abbreviatedChars = active.filter(c => !isFullProfile(c));

  const parts: string[] = ['以下是已建立的角色档案：'];

  // 完整档案
  for (const c of fullProfileChars) {
    parts.push(buildFullCharacterBlock(c, active, hasFocus, focusedIds));
  }

  // 缩略档案（仅名字 + 定位 + 状态一行）
  if (abbreviatedChars.length > 0) {
    parts.push('\n---');
    parts.push('### 其他已知角色（本章未重点登场，仅列基本信息）');
    for (const c of abbreviatedChars) {
      const roleLabel = CHARACTER_ROLE_LABELS[c.role] ?? c.role;
      const aliases = c.aliases.length > 0 ? `（${c.aliases.join('/')}）` : '';
      const state = c.currentState
        ? `：${c.currentState.slice(0, OFFSTAGE_CHARACTER_SUMMARY_MAX_CHARS)}`
        : '';
      parts.push(`- ${c.name}${aliases}（${roleLabel}）${state}`);
    }
  }

  if (unavailable.length > 0) {
    parts.push('\n---');
    parts.push('### ⚠️ 禁用角色（已死亡或退场，绝对不得出场、说话或被提及为在场，回忆/闪回除外）');
    for (const u of unavailable) {
      parts.push(`- ${u.name}（${u.status}）：${u.lastState}`);
    }
  }

  return parts.join('\n');
}

/** 构建单个角色的完整档案块 */
function buildFullCharacterBlock(
  c: CharacterProfile,
  allActive: CharacterProfile[],
  hasFocus: boolean,
  focusedIds: Set<string>,
): string {
  const roleLabel = CHARACTER_ROLE_LABELS[c.role] ?? c.role;
  const fields: string[] = [];
  fields.push(`- 角色定位：${roleLabel}`);
  // 设定漂移风险高的角色：currentState/abilities/relationships 可能含漂移设定，降权提示
  const highDrift = typeof c.driftRisk === 'number' && c.driftRisk >= 0.6;
  if (highDrift) {
    fields.push('- ⚠️ 设定漂移风险高：近期能力/关系/状态可能含漂移内容，核心人设以创作宪法为准');
  }
  const includeIdentityRule = !hasFocus || focusedIds.has(c.id);
  if (includeIdentityRule) {
    if (c.position) fields.push(`- 职衔/爵位：${c.position}`);
    const identitySpeechRule = buildIdentitySpeechRuleLine(c);
    if (identitySpeechRule) fields.push(`- 称谓/自称硬约束：${identitySpeechRule}`);
  }
  if (c.personality) fields.push(`- 性格：${c.personality}`);
  if (c.personalityTraits.length > 0) fields.push(`- 性格标签：${c.personalityTraits.join('、')}`);
  if (c.appearance) fields.push(`- 外貌：${c.appearance}`);
  if (c.backstory) fields.push(`- 背景：${c.backstory}`);
  if (c.speechStyle) fields.push(`- 说话风格：${c.speechStyle}`);
  if (c.motivation) fields.push(`- 动机：${c.motivation}`);
  if (c.currentState && !highDrift) fields.push(`- 当前状态：${c.currentState}`);
  if (c.abilities.length > 0 && !highDrift) fields.push(`- 能力：${c.abilities.join('、')}`);
  // 社会身份
  if (c.socialIdentity) {
    const si = c.socialIdentity;
    if (si.faction) fields.push(`- 阵营/组织：${si.faction}`);
    if (si.socialClass) fields.push(`- 社会阶层：${si.socialClass}`);
    if (si.reputation) fields.push(`- 名声：${si.reputation}`);
  }
  // 公私面具
  if (c.persona) {
    const p = c.persona;
    if (p.publicPersona) fields.push(`- 公众形象：${p.publicPersona}`);
    if (p.privatePersona) fields.push(`- 私下面目：${p.privatePersona}`);
    if (p.maskTrigger) fields.push(`- 面具裂缝：${p.maskTrigger}`);
  }
  // 心理画像
  if (c.psychology) {
    const ps = c.psychology;
    if (ps.worldview) fields.push(`- 世界观：${ps.worldview}`);
    if (ps.copingMechanisms.length > 0) fields.push(`- 压力应对：${ps.copingMechanisms.join('、')}`);
    if (ps.emotionalTriggers.length > 0) fields.push(`- 情绪触发：${ps.emotionalTriggers.join('、')}`);
  }
  // 象征系统
  if (c.symbolism) {
    const sym = c.symbolism;
    if (sym.symbolObject) fields.push(`- 象征物品：${sym.symbolObject}`);
    if (sym.recurringMotif) fields.push(`- 习惯动作：${sym.recurringMotif}`);
    if (sym.themeWord) fields.push(`- 主题词：${sym.themeWord}`);
  }
  // 成长轨迹
  if (c.growthTrack) {
    const gt = c.growthTrack;
    if (gt.unresolvedTrauma.length > 0) fields.push(`- 未解决创伤：${gt.unresolvedTrauma.join('、')}`);
    if (gt.pendingPromises.length > 0) fields.push(`- 未兑现承诺：${gt.pendingPromises.join('、')}`);
  }
  // 关系增强信息（漂移风险高的角色跳过，关系描述易含漂移设定如"坐标修复锚点"）
  if (c.relationships.length > 0 && !highDrift) {
    const relParts = c.relationships.map(r => {
      const target = allActive.find(a => a.id === r.targetId)?.name ?? r.targetId;
      let desc = `${target}（${r.type}）`;
      if (r.powerDynamic) desc += `[${r.powerDynamic === 'dominant' ? '主导' : r.powerDynamic === 'submissive' ? '从属' : '对等'}]`;
      if (r.emotionalDebt) desc += `[恩怨：${r.emotionalDebt}]`;
      if (r.publicVsPrivate) desc += `[表里：${r.publicVsPrivate}]`;
      if (r.tensionLevel != null && r.tensionLevel > 50) desc += `[紧张度：${r.tensionLevel}]`;
      return desc;
    });
    fields.push(`- 关系：${relParts.join('；')}`);
  }
  const aliases = c.aliases.length > 0 ? `（别名：${c.aliases.join('/')}）` : '';
  return `\n### ${c.name}${aliases}\n${fields.join('\n')}`;
}

/**
 * 轻量角色上下文 — 仅包含名字、定位、当前状态和关键关系。
 * 用于 Outline Agent 等不需要完整档案的场景，大幅减少 token 消耗。
 */
export function buildCharacterContextLight(characters: CharacterProfile[]): string {
  if (characters.length === 0) return '';
  const active = characters.filter(c => !isCharacterUnavailable(c.currentState));
  const unavailable = characters.filter(c => isCharacterUnavailable(c.currentState));

  const parts: string[] = ['角色列表（简要）：'];
  for (const c of active) {
    const roleLabel = CHARACTER_ROLE_LABELS[c.role] ?? c.role;
    const aliases = c.aliases.length > 0 ? `（${c.aliases.join('/')}）` : '';
    const state = c.currentState ? ` — ${c.currentState.slice(0, 100)}` : '';
    const relSummary = c.relationships.length > 0
      ? ` [关系：${c.relationships.slice(0, 3).map(r => {
          const target = active.find(a => a.id === r.targetId)?.name ?? r.targetId;
          return `${target}/${r.type}`;
        }).join('、')}]`
      : '';
    parts.push(`- ${c.name}${aliases}（${roleLabel}）${state}${relSummary}`);
  }
  if (unavailable.length > 0) {
    parts.push('');
    parts.push('禁用角色：' + unavailable.map(c => {
      const status = detectCharacterStatus(c.currentState);
      return `${c.name}（${status === 'dead' ? '已死亡' : '已退场'}）`;
    }).join('、'));
  }
  return parts.join('\n');
}

// ==================== 世界观上下文 ====================

export function buildWorldContext(
  entries: WorldEntry[],
): string {
  if (entries.length === 0) return '';

  const grouped = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (entry.tags.includes('auto-generated')) continue;
    const category = entry.category;
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)!.push(entry);
  }

  if (grouped.size === 0) return '';
  const parts: string[] = ['以下是已建立的世界观设定：'];
  for (const [category, categoryEntries] of grouped) {
    const label = WORLD_CATEGORY_LABELS[category] ?? category;
    parts.push(`\n### ${label}`);
    for (const entry of categoryEntries) {
      const desc = entry.description.length > 500
        ? `${entry.description.slice(0, 500)}...`
        : entry.description;
      parts.push(`- **${entry.name}**：${desc}`);
      if (entry.constraints?.length) {
        parts.push(`  - 约束：${entry.constraints.slice(0, 3).join('；')}`);
      }
      if (entry.consequences?.length) {
        parts.push(`  - 后果：${entry.consequences.slice(0, 3).join('；')}`);
      }
    }
  }
  return parts.join('\n');
}

// ==================== 一致性护栏 ====================

export async function buildConsistencyGuardrails(
  novelManager: PipelineNovelManager,
  characters: CharacterProfile[],
  novelId: string,
  consistencyThreshold: ConsistencyGuardrailThresholds,
): Promise<string> {
  if (characters.length === 0) return '';

  const keyCharacters = selectKeyCharacters(characters);
  const reports = await Promise.all(
    keyCharacters.map(async character => {
      const snapshots = await novelManager.getCharacterStateSnapshots(novelId, character.id);
      return {
        character,
        report: buildConsistencyReport(snapshots),
      };
    }),
  );
  return composeConsistencyGuardrails(reports, consistencyThreshold);
}

// ==================== 角色事件时间线 ====================

export function buildCharacterEventContext(
  characters: CharacterProfile[],
  events: CharacterEvent[],
  chapterNumber: number,
): string {
  if (events.length === 0 || characters.length === 0) return '';

  const parts: string[] = ['以下是各角色的关键经历时间线，请确保后续行为与过往经历一致：'];

  for (const character of characters) {
    const charEvents = events
      .filter(e => e.characterId === character.id && e.chapterNumber < chapterNumber)
      .sort((a, b) => a.chapterNumber - b.chapterNumber);
    if (charEvents.length === 0) continue;

    // 最近 5 个 + 最重要的 2 个历史事件
    const recent = charEvents.slice(-5);
    const important = charEvents
      .filter(e => e.importance >= 4 && !recent.includes(e))
      .slice(-2);
    const selected = [...important, ...recent]
      .sort((a, b) => a.chapterNumber - b.chapterNumber);

    const eventLines = selected
      .map(e => `  - 第${e.chapterNumber}章：${e.summary}`)
      .join('\n');
    parts.push(`\n### ${character.name}\n${eventLines}`);
  }

  return parts.length > 1 ? parts.join('\n') : '';
}

// ==================== 反模板规则 ====================

export async function buildAntiTemplateRules(
  novelManager: PipelineNovelManager,
  chapterCache: ChapterReadCache,
  novelId: string,
  chapterNumber: number,
  thresholds: ChapterEnhancementThresholds,
): Promise<{ antiTemplateRules: string; recurringDescriptionHints: string; chapterOpeningHints: string; payoffDensityHints: string }> {
  const start = Math.max(1, chapterNumber - thresholds.antiTemplate.lookbackChapters);
  const history = chapterNumber <= 1
    ? []
    : await Promise.all(
      Array.from({ length: chapterNumber - start }, (_, idx) => chapterCache.get(novelManager, novelId, start + idx)),
    );

  const chapters = history.filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter));
  const antiTemplate = chapters.length > 0
    ? composeAntiTemplateRules(chapters, thresholds.antiTemplate)
    : '';
  const antiAiTells = composeAntiAiTellsRules(chapters, thresholds.antiAiTells);
  const antiAiStructure = composeAntiAiStructureRules(chapters, thresholds.antiAiStructure);
  const recurringDescriptionHints = composeRecurringDescriptionRules(chapters);
  const chapterOpeningHints = composeChapterOpeningRules(chapters);
  const payoffDensityHints = composePayoffDensityHints(chapters);

  return {
    antiTemplateRules: [antiTemplate, antiAiTells, antiAiStructure].filter(Boolean).join('\n\n'),
    recurringDescriptionHints,
    chapterOpeningHints,
    payoffDensityHints,
  };
}

// ==================== 自动修订指令 ====================

export function buildAutoRevisionDirection(
  originalDirection: string,
  readerFeedback: string,
): string {
  const score = parseReaderScore(readerFeedback);
  const structured = parseReaderFeedback(readerFeedback, score);
  const strategy = selectRevisionStrategy(structured);
  const modeHint = buildRevisionModeHint(strategy);
  const revisionInstructions = buildRevisionInstructions(structured);

  const parts: string[] = [
    modeHint,
    '',
    '【自动修订 - 结构化 Reader 反馈】',
    revisionInstructions,
  ];

  if (strategy.instructions) {
    parts.push('', '【修订策略】', strategy.instructions);
  }

  if (originalDirection) {
    parts.push('', '【用户原始指令】', originalDirection);
  }

  return parts.join('\n');
}

// ==================== 多查询搜索 ====================

/**
 * 从大纲内容中提取结构化实体（角色名、地点），
 * 供多查询检索和角色维度聚合使用。
 */
export function extractOutlineEntities(outlineContent: string): {
  characterNames: string[];
  locations: string[];
} {
  const characterNames: string[] = [];
  const locations: string[] = [];

  const charPattern = /出场角色[^：:]*[：:]\s*([^\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = charPattern.exec(outlineContent)) !== null) {
    const names = match[1].split(/[、，,/\s和与及]+/).filter(Boolean);
    characterNames.push(...names);
  }

  const locPattern = /(?:地点|场景|场所|位置)[^：:]*[：:]\s*([^\n]+)/g;
  while ((match = locPattern.exec(outlineContent)) !== null) {
    const loc = match[1].trim();
    if (loc) locations.push(loc);
  }

  return {
    characterNames: characterNames.slice(0, 5),
    locations: locations.slice(0, 3),
  };
}

export function buildMultiQuerySearches(
  userDirection: string,
  outlineContent?: string,
): string[] {
  const queries: string[] = [userDirection];

  if (!outlineContent) return queries;

  const { characterNames, locations } = extractOutlineEntities(outlineContent);
  if (characterNames.length > 0) {
    queries.push(characterNames.join(' '));
  }
  for (const loc of locations) {
    queries.push(loc);
  }

  // 如果没有结构化提取结果，用大纲前 200 字作为补充查询
  if (queries.length === 1 && outlineContent.length > 0) {
    queries.push(outlineContent.slice(0, 200));
  }

  return queries.slice(0, 3);
}

// ==================== 章节类型推断 ====================

export function inferChapterType(
  direction: string,
  outlineSummary?: string,
): 'action' | 'dialogue' | 'worldbuilding' | 'emotional' | 'transition' {
  const text = [direction, outlineSummary].filter(Boolean).join(' ');
  const actionKw = /战斗|打斗|追逐|冲突|对决|比武|逃跑|围攻/;
  const dialogueKw = /对话|谈判|辩论|商议|密谈|争吵|告白/;
  const worldbuildingKw = /探索|发现|旅行|新地方|秘境|遗迹/;
  const emotionalKw = /回忆|告别|重逢|悲伤|感动|思念|离别/;

  if (actionKw.test(text)) return 'action';
  if (dialogueKw.test(text)) return 'dialogue';
  if (worldbuildingKw.test(text)) return 'worldbuilding';
  if (emotionalKw.test(text)) return 'emotional';
  return 'transition';
}

// ==================== 自适应温度 ====================

export function getAdaptiveTemperature(role: AgentRole, isRetry: boolean): number {
  switch (role) {
    case 'outline': return isRetry ? 0.5 : 0.6;
    case 'writer': return isRetry ? 0.7 : 0.8;
    case 'editor': return 0.4;
    case 'reader': return 0.3;
    case 'world-builder': return 0.5;
    case 'character': return 0.5;
    default: return 0.7;
  }
}

// ==================== Reader 评分解析 ====================

export function parseReaderScore(content: string): number {
  const trimmed = content.trim();
  const jsonSource = (() => {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
    return trimmed;
  })();

  try {
    const parsed = JSON.parse(jsonSource) as { overallScore?: unknown };
    const score = Number(parsed.overallScore);
    if (Number.isFinite(score)) {
      return Math.max(0, Math.min(10, score));
    }
  } catch {
    // fallback to regex extraction
  }

  const jsonMatch = content.match(/"overallScore"\s*:\s*(\d+(?:\.\d+)?)/);
  if (jsonMatch) {
    const score = Number.parseFloat(jsonMatch[1]);
    if (Number.isFinite(score)) return Math.max(0, Math.min(10, score));
  }
  const slashMatch = content.match(/(\d+(?:\.\d+)?)\s*[/／]\s*10/);
  if (slashMatch) {
    const score = Number.parseFloat(slashMatch[1]);
    if (Number.isFinite(score)) return Math.max(0, Math.min(10, score));
  }
  return 5; // Fail-safe: unknown score should trigger revision loop, not bypass it.
}

// ==================== 文化故事钩子 ====================

/**
 * 从 description 中提取触发条件（匹配"当…时"/"若…则"/"如果…就"模式）
 */
function extractTriggerFromDesc(desc: string): string {
  const patterns = [
    /当([^，。；]{4,30})时/,
    /若([^，。；]{4,30})则/,
    /如果([^，。；]{4,30})就/,
    /一旦([^，。；]{4,30})[，,]/,
  ];
  for (const pattern of patterns) {
    const match = desc.match(pattern);
    if (match) return match[0];
  }
  return '';
}

export function buildCultureStoryHooks(params: {
  worldEntries: WorldEntry[];
  selectedWorldCards: WorldCard[];
  chapterNumber: number;
}): string {
  const { worldEntries, selectedWorldCards, chapterNumber } = params;
  const byId = new Map(worldEntries.map(item => [item.id, item]));

  const fromCards = selectedWorldCards
    .filter(card => card.category === 'culture')
    .map(card => byId.get(card.id))
    .filter((entry): entry is WorldEntry => Boolean(entry));

  const fallback = worldEntries
    .filter(entry => entry.category === 'culture')
    .sort((a, b) => {
      const aUsed = typeof a.lastUsedIn === 'number' ? Math.abs(chapterNumber - a.lastUsedIn) : 9999;
      const bUsed = typeof b.lastUsedIn === 'number' ? Math.abs(chapterNumber - b.lastUsedIn) : 9999;
      if (aUsed !== bUsed) return aUsed - bUsed;
      const aScore = typeof a.qualityScore === 'number' ? a.qualityScore : 0;
      const bScore = typeof b.qualityScore === 'number' ? b.qualityScore : 0;
      return bScore - aScore;
    });

  const pool = (fromCards.length > 0 ? fromCards : fallback).slice(0, 5);
  if (pool.length === 0) return '';

  const lines: string[] = ['以下文化要素可直接转化为剧情动作：'];
  for (const entry of pool) {
    const details = entry.details ?? {};

    // 触发条件：优先从 description 中提取"当…时/若…则"模式，再回退到 details
    const descTrigger = extractTriggerFromDesc(entry.description);
    const detailTrigger = details.trigger || details['触发条件'] || details.sceneTrigger || details.ritual || details['仪式'] || '';
    const trigger = descTrigger || detailTrigger;

    // 约束：优先用一等字段 constraints，再回退到 details
    const constraint = (entry.constraints ?? []).join('；')
      || details.taboo || details['禁忌'] || details.cost || details['代价'] || '';

    // 后果：优先用一等字段 consequences，再回退到 details
    const consequence = (entry.consequences ?? []).join('；')
      || details.consequence || details['后果'] || details.punishment || details.backlash
      || details.impact || details.sceneHook || details['剧情作用'] || '';

    lines.push('');
    lines.push(`- ${entry.name}`);
    lines.push(`  - 触发：${trigger || '在冲突/谈判/抉择场景中可触发'}`);
    lines.push(`  - 约束：${constraint || '角色必须遵守对应文化规范'}`);
    lines.push(`  - 后果：${consequence || '违背规范会产生关系裂痕或势力反制'}`);
    if (details.narrativeFunction) {
      lines.push(`  - 叙事功能：${details.narrativeFunction}`);
    }
  }
  lines.push('');
  lines.push('写作要求：至少让其中 1-2 条在本章形成可见冲突或角色抉择。');
  return lines.join('\n');
}

// ==================== 势力动态提示 ====================

export function buildFactionFronts(params: {
  worldEntries: WorldEntry[];
  chapterNumber: number;
}): string {
  const { worldEntries, chapterNumber } = params;
  const DORMANT_THRESHOLD = 3;

  const dormantFactions = worldEntries
    .filter(entry => entry.category === 'faction' && (entry.state ?? 'active') === 'active')
    .filter(entry => {
      const gap = typeof entry.lastUsedIn === 'number'
        ? chapterNumber - entry.lastUsedIn
        : 9999;
      return gap >= DORMANT_THRESHOLD;
    })
    .filter(entry => {
      const front = entry.details?.defaultFront;
      return front && front.trim().length > 0;
    })
    .sort((a, b) => {
      const aGap = typeof a.lastUsedIn === 'number' ? chapterNumber - a.lastUsedIn : 9999;
      const bGap = typeof b.lastUsedIn === 'number' ? chapterNumber - b.lastUsedIn : 9999;
      return bGap - aGap;
    })
    .slice(0, 3);

  if (dormantFactions.length === 0) return '';

  const lines: string[] = ['以下势力已多章未出场，其主动议程正在幕后推进——可通过传闻、信件、后果等方式让读者感知世界在运转：'];
  for (const entry of dormantFactions) {
    const gap = typeof entry.lastUsedIn === 'number' ? chapterNumber - entry.lastUsedIn : '未知';
    lines.push('');
    lines.push(`- ${entry.name}（已 ${gap} 章未出场）`);
    lines.push(`  - 幕后行动：${entry.details!.defaultFront}`);
    if (entry.details?.vulnerability) {
      lines.push(`  - 弱点：${entry.details.vulnerability}`);
    }
    if (entry.details?.controlledResource) {
      lines.push(`  - 控制资源：${entry.details.controlledResource}`);
    }
  }
  lines.push('');
  lines.push('写作要求：至少通过 1 处间接描写（传闻、消息、环境变化）暗示上述势力的幕后动向。');
  return lines.join('\n');
}
