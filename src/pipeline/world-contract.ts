import type { WorldCategory, WorldEntry } from '../novel/types.js';
import type { WorldCard } from './world-context-v2.js';
import { selectWorldCardsV2 } from './world-context-v2.js';
import { evaluateWorldRuleEvidence } from './world-rule-evidence.js';

const WORLD_CATEGORY_LABELS: Record<WorldCategory, string> = {
  geography: '地理',
  history: '历史',
  faction: '势力/阵营',
  power: '力量体系',
  culture: '文化/风俗',
  rule: '世界法则',
  other: '其他',
};

const STORY_ROLE_WEIGHT: Record<string, number> = {
  anchor: 1.4,
  conflict: 1.2,
  constraint: 1.1,
  mystery: 0.8,
  resource: 0.6,
};

const ENTRY_STATE_WEIGHT: Record<string, number> = {
  active: 0.5,
  resolved: -0.6,
  deprecated: -1.0,
};

const STOP_TERMS = new Set([
  '今天',
  '昨天',
  '明天',
  '现在',
  '这里',
  '那里',
  '他们',
  '我们',
  '自己',
  '时候',
  '事情',
  '问题',
  '结果',
  '计划',
]);

export type WorldGateMode = 'off' | 'warn' | 'strict';

export type WorldContractEntry = {
  id: string;
  name: string;
  aliases: string[];
  category: WorldCategory;
  score: number;
  reason: string;
  constraints: string[];
  consequences: string[];
  baseline: boolean;
};

export type WorldContract = {
  chapterNumber: number;
  query: string;
  source: 'retrieval-v2' | 'fallback';
  required: WorldContractEntry[];
  supporting: WorldContractEntry[];
  /** 已确认但不要求本章出场的正史；仅在正文主动提及时检查反向描述。 */
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

export type WorldContractFulfillment = {
  gateMode: WorldGateMode;
  requiredTotal: number;
  requiredHit: number;
  missingRequired: string[];
  unsourcedTerms: string[];
  findings: WorldContractFinding[];
  passed: boolean;
  summary: string;
};

export type WorldGateRewriteReport = {
  attempted: boolean;
  applied: boolean;
  reason: string;
  before: WorldContractFulfillment;
  after: WorldContractFulfillment;
};

type BuildWorldContractParams = {
  entries: WorldEntry[];
  chapterNumber: number;
  query: string;
  memoryWorldContext?: string;
  topK?: number;
  selectedCards?: WorldCard[];
  maxRequired?: number;
  maxSupporting?: number;
};

type EvalWorldContractParams = {
  contract: WorldContract;
  chapterContent: string;
  gateMode: WorldGateMode;
  knownWorldEntries: WorldEntry[];
  knownCharacterNames?: string[];
};

function dedupeTerms(input: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function clip(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function buildReason(entry: WorldEntry, chapterNumber: number): string {
  const reasons: string[] = [];
  if (entry.storyRole) {
    reasons.push(`故事角色=${entry.storyRole}`);
  }
  if (typeof entry.lastUsedIn === 'number') {
    const gap = Math.max(0, chapterNumber - entry.lastUsedIn);
    reasons.push(gap <= 2 ? '近期已铺垫，适合连续推进' : `距离上次出现 ${gap} 章，适合回收`);
  } else if (typeof entry.introducedIn === 'number') {
    reasons.push(`第 ${entry.introducedIn} 章引入，建议继续兑现`);
  } else {
    reasons.push('核心设定需在本章发挥剧情作用');
  }
  return reasons.join('；');
}

function containsTerm(text: string, term: string): boolean {
  const value = term.trim();
  if (!value) return false;
  return text.toLowerCase().includes(value.toLowerCase());
}

function countOccurrences(text: string, term: string): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(escaped, 'g');
  let count = 0;
  while (matcher.exec(text)) {
    count += 1;
    if (count >= 10) break;
  }
  return count;
}

function buildKnownTermSet(params: {
  contract: WorldContract;
  knownWorldEntries: WorldEntry[];
  knownCharacterNames: string[];
}): Set<string> {
  const known = new Set<string>();
  const push = (value: string) => {
    const term = value.trim();
    if (term.length >= 2) {
      known.add(term.toLowerCase());
    }
  };

  for (const entry of params.contract.required) {
    push(entry.name);
    entry.aliases.forEach(push);
  }
  for (const entry of params.contract.supporting) {
    push(entry.name);
    entry.aliases.forEach(push);
  }
  for (const entry of params.knownWorldEntries) {
    push(entry.name);
    (entry.aliases ?? []).forEach(push);
  }
  for (const name of params.knownCharacterNames) {
    push(name);
  }
  return known;
}

function extractPotentialWorldTerms(text: string): string[] {
  const terms: string[] = [];

  const quoted = /[「“《【]([\u4e00-\u9fa5A-Za-z0-9]{2,14})[」”》】]/g;
  let match: RegExpExecArray | null = quoted.exec(text);
  while (match) {
    terms.push(match[1]);
    match = quoted.exec(text);
  }

  const nounLike = /([\u4e00-\u9fa5]{2,10}(?:城|国|洲|岛|海|渊|塔|殿|宫|谷|门|盟|会|教|派|族|阵|法|诀))/g;
  match = nounLike.exec(text);
  while (match) {
    terms.push(match[1]);
    match = nounLike.exec(text);
  }

  return dedupeTerms(terms);
}

function isLikelyWorldTerm(term: string): boolean {
  if (term.length < 2 || term.length > 14) return false;
  if (/^[的了在从向把将并且但而若则]/.test(term)) return false;
  if (/[的了着]/.test(term)) return false;
  if (/^\d+$/.test(term)) return false;
  return true;
}

export function buildWorldContract(params: BuildWorldContractParams): WorldContract {
  const {
    entries,
    chapterNumber,
    query,
    memoryWorldContext,
    topK = 10,
    selectedCards,
    maxRequired = 4,
    maxSupporting = 4,
  } = params;

  const cards = selectedCards && selectedCards.length > 0
    ? selectedCards
    : selectWorldCardsV2({
        entries,
        query,
        chapterNumber,
        memoryWorldContext,
        topK,
      });

  const entryById = new Map(entries.map(item => [item.id, item]));
  const candidates = cards
    .map((card) => {
      const entry = entryById.get(card.id);
      if (!entry) return null;
      let priority = card.score;
      priority += STORY_ROLE_WEIGHT[entry.storyRole ?? ''] ?? 0;
      priority += ENTRY_STATE_WEIGHT[entry.state ?? ''] ?? 0;
      if ((entry.useCount ?? 0) === 0) priority += 0.4;
      if ((entry.constraints?.length ?? 0) > 0) priority += 0.2;
      if ((entry.consequences?.length ?? 0) > 0) priority += 0.2;
      if (entry.details?.narrativeFunction) priority += 0.5;
      return { entry, card, priority };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => b.priority - a.priority);

  const requiredSource = candidates.filter(item => item.card.score >= 2.2);
  const requiredPicked = (requiredSource.length > 0 ? requiredSource : candidates).slice(0, maxRequired);
  const requiredIds = new Set(requiredPicked.map(item => item.entry.id));
  const supportingPicked = candidates
    .filter(item => !requiredIds.has(item.entry.id))
    .slice(0, maxSupporting);

  const toContractEntry = (
    item: { entry: WorldEntry; card: WorldCard },
  ): WorldContractEntry => ({
    id: item.entry.id,
    name: item.entry.name,
    aliases: dedupeTerms(item.entry.aliases ?? []),
    category: item.entry.category,
    score: Number(item.card.score.toFixed(2)),
    reason: buildReason(item.entry, chapterNumber),
    constraints: (item.entry.constraints ?? []).slice(0, 2),
    consequences: (item.entry.consequences ?? []).slice(0, 2),
    baseline: item.entry.baseline === true || item.entry.tags.includes('approved'),
  });

  const required = requiredPicked.map(toContractEntry);
  const supporting = supportingPicked.map(toContractEntry);
  const canonical = entries
    .filter(entry => entry.baseline === true || entry.tags.includes('approved'))
    .slice(0, 24)
    .map((entry): WorldContractEntry => ({
      id: entry.id,
      name: entry.name,
      aliases: dedupeTerms(entry.aliases ?? []),
      category: entry.category,
      score: 0,
      reason: '作者确认的世界正史；仅在正文提及时约束一致性',
      constraints: (entry.constraints ?? []).slice(0, 3),
      consequences: (entry.consequences ?? []).slice(0, 3),
      baseline: true,
    }));
  const prompt = renderWorldContractPrompt({
    chapterNumber,
    required,
    supporting,
  });

  return {
    chapterNumber,
    query,
    source: selectedCards && selectedCards.length > 0 ? 'retrieval-v2' : 'fallback',
    required,
    supporting,
    canonical,
    prompt,
  };
}

function renderWorldContractPrompt(params: {
  chapterNumber: number;
  required: WorldContractEntry[];
  supporting: WorldContractEntry[];
}): string {
  const { chapterNumber, required, supporting } = params;
  if (required.length === 0 && supporting.length === 0) return '';

  const lines: string[] = [
    `以下是第 ${chapterNumber} 章世界观契约（World Contract），必须执行：`,
    '',
    '【必引要素】',
  ];

  if (required.length === 0) {
    lines.push('- 暂无强制必引项。');
  } else {
    for (const item of required) {
      const categoryLabel = WORLD_CATEGORY_LABELS[item.category] ?? item.category;
      lines.push(`- ${item.name}（${categoryLabel}，相关度 ${item.score.toFixed(2)}）`);
      lines.push(`  引入理由：${item.reason}`);
      if (item.constraints.length > 0) {
        lines.push(`  硬约束：${item.constraints.join('；')}`);
      }
      if (item.consequences.length > 0) {
        lines.push(`  后果线索：${item.consequences.join('；')}`);
      }
    }
  }

  lines.push('');
  lines.push('【辅助要素】');
  if (supporting.length === 0) {
    lines.push('- 暂无。');
  } else {
    for (const item of supporting) {
      const categoryLabel = WORLD_CATEGORY_LABELS[item.category] ?? item.category;
      lines.push(`- ${item.name}（${categoryLabel}）`);
    }
  }

  lines.push('');
  lines.push('【执行要求】');
  lines.push('- 每个必引要素至少出现一次，且必须推动动作、冲突、决策或后果。');
  lines.push('- 出现约束时要体现代价，不得只做名词点缀。');
  lines.push('- 不得引入与契约冲突的新规则。若新增设定，需与既有要素可并存。');

  return lines.join('\n');
}

export function evaluateWorldContractFulfillment(
  params: EvalWorldContractParams,
): WorldContractFulfillment {
  const {
    contract,
    chapterContent,
    gateMode,
    knownWorldEntries,
    knownCharacterNames = [],
  } = params;

  const requiredTotal = contract.required.length;
  let requiredHit = 0;
  const missingRequired: string[] = [];
  const shallowRequired: string[] = [];
  const contradictedRules: string[] = [];
  const findings: WorldContractFinding[] = [];

  for (const item of contract.required) {
    const hit = containsTerm(chapterContent, item.name)
      || item.aliases.some(alias => containsTerm(chapterContent, alias));
    if (hit) {
      requiredHit += 1;
      if (item.constraints.length > 0 || item.consequences.length > 0) {
        const evidence = evaluateWorldRuleEvidence({
          chapterContent,
          names: [item.name, ...item.aliases],
          constraints: item.constraints,
          consequences: item.consequences,
        });
        if (evidence.contradicted) {
          contradictedRules.push(item.name);
          findings.push({
            code: 'contradicted-rule',
            level: gateMode === 'strict' ? 'error' : 'warn',
            message: `世界规则“${item.name}”在正文中被明确违反或反向描述`,
            entryName: item.name,
          });
        } else if (!evidence.constraintMatched && !evidence.consequenceMatched) {
          shallowRequired.push(item.name);
          findings.push({
            code: 'shallow-required',
            level: gateMode === 'strict' ? 'error' : 'warn',
            message: `世界要素“${item.name}”只被点名，未体现约束、代价或后果`,
            entryName: item.name,
          });
        }
      }
      continue;
    }
    missingRequired.push(item.name);
    findings.push({
      code: 'missing-required',
      level: gateMode === 'strict' ? 'error' : 'warn',
      message: `必引要素“${item.name}”未在章节正文中出现`,
      entryName: item.name,
    });
  }

  const requiredIds = new Set(contract.required.map(item => item.id));
  for (const item of contract.canonical ?? []) {
    if (requiredIds.has(item.id)) continue;
    const hit = containsTerm(chapterContent, item.name)
      || item.aliases.some(alias => containsTerm(chapterContent, alias));
    if (!hit || (item.constraints.length === 0 && item.consequences.length === 0)) continue;
    const evidence = evaluateWorldRuleEvidence({
      chapterContent,
      names: [item.name, ...item.aliases],
      constraints: item.constraints,
      consequences: item.consequences,
    });
    if (!evidence.contradicted) continue;
    contradictedRules.push(item.name);
    findings.push({
      code: 'contradicted-rule',
      level: gateMode === 'strict' ? 'error' : 'warn',
      message: `正文反向描述了已确认世界正史“${item.name}”`,
      entryName: item.name,
    });
  }

  const knownTerms = buildKnownTermSet({
    contract,
    knownWorldEntries,
    knownCharacterNames,
  });
  const candidates = extractPotentialWorldTerms(chapterContent);
  const unsourcedTerms = candidates
    .filter((term) => {
      const key = term.toLowerCase();
      if (knownTerms.has(key)) return false;
      if (STOP_TERMS.has(term)) return false;
      if (!isLikelyWorldTerm(term)) return false;
      return countOccurrences(chapterContent, term) >= 2;
    })
    .slice(0, 6);

  for (const term of unsourcedTerms) {
    findings.push({
      code: 'unsourced-world-term',
      level: gateMode === 'strict' ? 'error' : 'warn',
      message: `疑似无来源设定“${term}”在正文重复出现，请确认是否已入库世界观`,
      term,
    });
  }

  const passed = gateMode !== 'strict'
    ? true
    : missingRequired.length === 0
      && unsourcedTerms.length === 0
      && shallowRequired.length === 0
      && contradictedRules.length === 0;

  const summary = [
    `必引要素命中 ${requiredHit}/${requiredTotal}`,
    missingRequired.length > 0 ? `缺失 ${missingRequired.length}` : '无缺失',
    unsourcedTerms.length > 0 ? `疑似无来源设定 ${unsourcedTerms.length}` : '无可疑新设定',
    shallowRequired.length > 0 ? `仅点名未兑现 ${shallowRequired.length}` : '约束已落地',
    contradictedRules.length > 0 ? `规则冲突 ${contradictedRules.length}` : '无规则冲突',
  ].join('，');

  return {
    gateMode,
    requiredTotal,
    requiredHit,
    missingRequired,
    unsourcedTerms,
    findings,
    passed,
    summary: clip(summary, 120),
  };
}
