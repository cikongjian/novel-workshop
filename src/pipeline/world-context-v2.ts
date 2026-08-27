import type { WorldEntry, WorldCategory } from '../novel/types.js';
import { isDirtyWorldEntryName } from '../novel/world-entry-quality.js';
import {
  buildNarrativeWorldCards,
  renderNarrativeWorldContext,
} from './narrative-audit.js';

const WORLD_CATEGORY_LABELS: Record<WorldCategory, string> = {
  geography: '地理',
  history: '历史',
  faction: '势力/阵营',
  power: '力量体系',
  culture: '文化/风俗',
  rule: '世界法则',
  other: '其他',
};

const DEFAULT_CATEGORY_QUOTAS: Record<WorldCategory, number> = {
  geography: 2,
  history: 1,
  faction: 2,
  power: 1,
  culture: 1,
  rule: 2,
  other: 1,
};

const MIN_RELEVANT_SCORE = 2;

const QUERY_SEMANTIC_GROUPS = [
  ['夜间', '夜晚', '深夜', '夜色', '日落', '宵禁'],
  ['潜入', '闯入', '越界', '偷渡', '通行', '进入', '门禁', '城门'],
  ['追捕', '抓捕', '扣押', '处罚', '惩罚', '追责'],
  ['修炼', '施术', '能力', '力量', '灵力', '灵脉', '经脉'],
  ['组织', '阵营', '议会', '宗门', '派系', '决议', '命令'],
];

type WorldContextV2Params = {
  entries: WorldEntry[];
  query: string;
  chapterNumber: number;
  topK?: number;
  memoryWorldContext?: string;
};

export type WorldCard = {
  id: string;
  name: string;
  category: WorldCategory;
  score: number;
  summary: string;
  lastUsedIn?: number;
  constraints: string[];
  consequences: string[];
  conflictWarnings?: string[];
};

type ScoredEntry = {
  entry: WorldEntry;
  score: number;
};

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function extractKeywords(input: string): string[] {
  const normalized = input
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
  if (!normalized) return [];
  const words = normalized
    .split(/\s+/)
    .filter(word => word.length >= 2);
  const expanded = words.flatMap((word) => {
    if (!/^[\u4e00-\u9fa5]+$/.test(word) || word.length <= 4) return [word];
    const ngrams: string[] = [word];
    for (let index = 0; index < word.length - 1; index++) {
      ngrams.push(word.slice(index, index + 2));
    }
    return ngrams;
  });
  for (const group of QUERY_SEMANTIC_GROUPS) {
    if (group.some(term => normalized.includes(term))) {
      expanded.push(...group);
    }
  }
  return unique(expanded).slice(0, 64);
}

function extractMemoryHitNames(memoryWorldContext?: string): Set<string> {
  if (!memoryWorldContext) return new Set();
  const names = new Set<string>();
  // 匹配 《名称》 和 【名称】 两种格式
  const matcher = /[《【]([^》】\n]{1,48})[》】]/g;
  let match: RegExpExecArray | null = matcher.exec(memoryWorldContext);
  while (match) {
    names.add(match[1].trim());
    match = matcher.exec(memoryWorldContext);
  }
  return names;
}

function summarize(description: string, maxLength: number): string {
  const oneLine = description.replace(/\s+/g, ' ').trim();
  if (!oneLine) return '（暂无描述）';
  if (oneLine.length <= maxLength) return oneLine;
  return `${oneLine.slice(0, maxLength)}...`;
}

function buildScoredEntry(params: {
  entry: WorldEntry;
  keywords: string[];
  memoryHits: Set<string>;
  chapterNumber: number;
}): ScoredEntry {
  const { entry, keywords, memoryHits, chapterNumber } = params;

  // ── 快速预判：无关键词、无记忆命中、无近期使用 → 直接返回零分 ──
  const hasMemoryHit = memoryHits.has(entry.name.trim())
    || (entry.aliases?.some(alias => memoryHits.has(alias.trim())) ?? false);
  const isRecent = typeof entry.lastUsedIn === 'number' && (chapterNumber - entry.lastUsedIn) <= 10;
  const isNewlyIntroduced = typeof entry.introducedIn === 'number' && entry.introducedIn >= chapterNumber - 1;

  const isApprovedBaseline = entry.baseline === true || entry.tags.includes('approved');
  if (!isApprovedBaseline && !hasMemoryHit && !isRecent && !isNewlyIntroduced && keywords.length > 0) {
    const nameLower = entry.name.toLowerCase();
    const hasAnyKeyword = keywords.some(kw => nameLower.includes(kw));
    if (!hasAnyKeyword) {
      // 名称无命中，再快速检查描述前 200 字符
      const descSnippet = [
        entry.description,
        ...(entry.constraints ?? []),
        ...(entry.consequences ?? []),
        ...Object.values(entry.details ?? {}),
      ].join('\n').slice(0, 600).toLowerCase();
      if (!keywords.some(kw => descSnippet.includes(kw))) {
        // 仅 qualityScore 不足以达到 MIN_RELEVANT_SCORE，直接跳过
        const maxPossible = (typeof entry.qualityScore === 'number' ? entry.qualityScore * 1.2 : 0)
          - (entry.tags.includes('dirty-name') ? 2.5 : 0)
          - (entry.tags.includes('auto-generated') ? 1.2 : 0);
        if (maxPossible < MIN_RELEVANT_SCORE) {
          return { entry, score: 0 };
        }
      }
    }
  }

  const haystack = [
    entry.name,
    entry.description,
    ...(entry.constraints ?? []),
    ...(entry.consequences ?? []),
    ...Object.values(entry.details ?? {}),
  ].join('\n').toLowerCase();

  let keywordNameHit = 0;
  let keywordDescHit = 0;
  for (const keyword of keywords) {
    if (entry.name.toLowerCase().includes(keyword)) keywordNameHit += 1;
    else if (haystack.includes(keyword)) keywordDescHit += 1;
  }

  let score = keywordNameHit * 2.2 + keywordDescHit * 1.0;

  if (hasMemoryHit) {
    if (memoryHits.has(entry.name.trim())) score += 3.5;
    if (entry.aliases?.some(alias => memoryHits.has(alias.trim()))) score += 1.5;
  }

  if (typeof entry.lastUsedIn === 'number') {
    const distance = Math.max(0, chapterNumber - entry.lastUsedIn);
    if (distance <= 2) score += 1.8;
    else if (distance <= 5) score += 1.1;
    else if (distance <= 10) score += 0.6;
  }

  if (isNewlyIntroduced) {
    score += 0.6;
  }

  if (typeof entry.qualityScore === 'number') {
    score += entry.qualityScore * 1.2;
  }

  if (entry.tags.includes('dirty-name')) score -= 2.5;
  if (entry.tags.includes('auto-generated')) score -= 1.2;
  // 人工确认只提供稳定性加权，是否进入本章仍由场景相关性决定。
  if (isApprovedBaseline) score += 0.8;
  if (typeof entry.driftRisk === 'number') score -= entry.driftRisk * 4;

  return { entry, score };
}

function selectWithQuota(scored: ScoredEntry[], topK: number): ScoredEntry[] {
  const byCategory = new Map<WorldCategory, ScoredEntry[]>();
  for (const item of scored) {
    const category = item.entry.category;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(item);
  }

  for (const [, items] of byCategory) {
    items.sort((a, b) => b.score - a.score);
  }

  const selected: ScoredEntry[] = [];
  const selectedIds = new Set<string>();

  for (const [category, quota] of Object.entries(DEFAULT_CATEGORY_QUOTAS) as Array<[WorldCategory, number]>) {
    const items = (byCategory.get(category) ?? []).filter(item => item.score >= MIN_RELEVANT_SCORE);
    for (const item of items.slice(0, quota)) {
      if (selectedIds.has(item.entry.id)) continue;
      selected.push(item);
      selectedIds.add(item.entry.id);
      if (selected.length >= topK) return selected;
    }
  }

  const remaining = scored
    .filter(item => !selectedIds.has(item.entry.id))
    .filter(item => item.score >= MIN_RELEVANT_SCORE)
    .sort((a, b) => b.score - a.score);

  for (const item of remaining) {
    selected.push(item);
    if (selected.length >= topK) break;
  }

  return selected;
}

const DEPENDENCY_BOOST = 1.5;

/**
 * 依赖拉取：被选中（高分）卡片的 dependencies 关联条目自动加分，
 * 确保依赖的前置设定不会被遗漏。
 */
function applyDependencyBoost(scored: ScoredEntry[]): void {
  const scoreById = new Map(scored.map(s => [s.entry.id, s]));
  const topEntries = scored.filter(s => s.score >= MIN_RELEVANT_SCORE);

  for (const s of topEntries) {
    const deps = s.entry.dependencies ?? [];
    for (const depId of deps) {
      const target = scoreById.get(depId);
      if (target) {
        target.score += DEPENDENCY_BOOST;
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
}

/**
 * 冲突检测：检查被选中卡片之间是否存在互斥冲突，
 * 返回去重后的警告信息列表。
 */
function detectCardConflicts(picked: ScoredEntry[], allEntries: WorldEntry[]): string[] {
  const warnings: string[] = [];
  const pickedIds = new Set(picked.map(p => p.entry.id));

  for (const p of picked) {
    const conflicts = p.entry.conflicts ?? [];
    for (const conflictId of conflicts) {
      if (pickedIds.has(conflictId)) {
        const conflictEntry = allEntries.find(e => e.id === conflictId);
        if (conflictEntry) {
          warnings.push(
            `⚠️ 冲突：「${p.entry.name}」与「${conflictEntry.name}」存在矛盾，请勿在同一章节中同时使用`,
          );
        }
      }
    }
  }
  // Deduplicate (A conflicts B = B conflicts A)
  return [...new Set(warnings)];
}

export function selectWorldCardsV2(params: WorldContextV2Params): WorldCard[] {
  const { entries, query, chapterNumber, memoryWorldContext, topK = 10 } = params;
  const filtered = entries.filter((entry) => {
    if (entry.tags.includes('dirty-name')) return false;
    if (isDirtyWorldEntryName(entry.name)) return false;
    if (typeof entry.qualityScore === 'number' && entry.qualityScore < 0.55) return false;
    return true;
  });
  if (filtered.length === 0) return [];

  const keywords = extractKeywords(query);
  const memoryHits = extractMemoryHitNames(memoryWorldContext);

  const scored = filtered
    .map(entry => buildScoredEntry({ entry, keywords, memoryHits, chapterNumber }))
    .filter(s => s.score >= MIN_RELEVANT_SCORE)
    .sort((a, b) => b.score - a.score);

  // ── 依赖拉取：被选中卡片的依赖条目自动加分 ──
  applyDependencyBoost(scored);
  const picked = selectWithQuota(scored, topK).sort((a, b) => b.score - a.score);
  if (picked.length === 0) return [];

  // ── 冲突检测：标记被选中卡片之间的冲突 ──
  const conflictWarnings = detectCardConflicts(picked, filtered);

  const result: WorldCard[] = picked.map(({ entry, score }) => ({
    id: entry.id,
    name: entry.name,
    category: entry.category,
    score: Number(score.toFixed(2)),
    summary: summarize(entry.description, 110),
    lastUsedIn: entry.lastUsedIn,
    constraints: entry.constraints?.slice(0, 2) ?? [],
    consequences: entry.consequences?.slice(0, 2) ?? [],
  }));

  if (conflictWarnings.length > 0 && result.length > 0) {
    result[0].conflictWarnings = conflictWarnings;
  }

  return result;
}

export function buildWorldContextV2(params: WorldContextV2Params): string {
  const selectedCards = selectWorldCardsV2(params);
  const selectedIds = new Set(selectedCards.map(card => card.id));
  const narrativeEntries = selectedIds.size > 0
    ? params.entries.filter(entry => selectedIds.has(entry.id))
    : params.entries.slice(0, Math.min(params.topK ?? 10, 10));
  const narrativeCards = buildNarrativeWorldCards(narrativeEntries);
  const narrativeContext = renderNarrativeWorldContext(narrativeCards);
  const legacyContext = renderWorldCardsContextV2(selectedCards);
  return [narrativeContext, legacyContext].filter(Boolean).join('\n\n');
}

function renderWorldCardsContextV2(cards: WorldCard[]): string {
  if (cards.length === 0) return '';
  const lines: string[] = [
    '以下是本章相关世界观卡片（Top-K 筛选，需严格遵循）：',
  ];

  for (const card of cards) {
    const categoryLabel = WORLD_CATEGORY_LABELS[card.category] ?? card.category;
    lines.push('');
    lines.push(`[${categoryLabel}] ${card.name}`);
    lines.push(`- 关键事实：${card.summary}`);
    if (card.constraints.length > 0) {
      lines.push(`- 约束：${card.constraints.join('；')}`);
    }
    if (card.consequences.length > 0) {
      lines.push(`- 可能后果：${card.consequences.join('；')}`);
    }
    if (typeof card.lastUsedIn === 'number') {
      lines.push(`- 最近出现：第 ${card.lastUsedIn} 章`);
    }
    lines.push(`- 相关度：${card.score.toFixed(2)}`);
  }


  const warnings = cards[0]?.conflictWarnings;
  if (warnings && warnings.length > 0) {
    lines.push('');
    lines.push('【世界观冲突警告】');
    for (const w of warnings) {
      lines.push(w);
    }
  }

  return lines.join('\n');
}
