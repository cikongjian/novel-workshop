import type { WorldEntry, CharacterProfile, Chapter } from '../novel/types.js';
import { evaluateWorldRuleEvidence } from './world-rule-evidence.js';

export type NarrativeWorldCard = {
  id: string;
  name: string;
  category: WorldEntry['category'];
  storyRole: NonNullable<WorldEntry['storyRole']>;
  summary: string;
  constraints: string[];
  consequences: string[];
  pressure: string[];
  chapterUsageHint: string;
};

export type NarrativeCharacterCard = {
  id: string;
  name: string;
  role: CharacterProfile['role'];
  want: string;
  fear: string;
  pressure: string;
  nextChoice: string;
};

export type ChapterNarrativeAudit = {
  worldMentions: Array<{
    name: string;
    category: WorldEntry['category'];
    storyRole: NonNullable<WorldEntry['storyRole']>;
    matchedTerms: string[];
    usageLevel: 'mention' | 'constraint' | 'conflict' | 'cost';
    usedAsConstraint: boolean;
    usedAsConflict: boolean;
    usedAsConsequence: boolean;
    evidence: Array<{
      kind: 'constraint' | 'conflict' | 'cost' | 'pressure';
      term: string;
      signal: string;
      position: number;
      snippet: string;
    }>;
  }>;
  characterMentions: Array<{
    name: string;
    role: CharacterProfile['role'];
    hasWantSignal: boolean;
    hasFearSignal: boolean;
    hasPressureSignal: boolean;
    hasChoiceSignal: boolean;
  }>;
  worldPressureScore: number;
  characterPressureScore: number;
  effectiveUsageScore: number;
  issues: string[];
  suggestions: string[];
};

type NarrativeUsageLevel = ChapterNarrativeAudit['worldMentions'][number]['usageLevel'];
type WorldUsageEvidence = ChapterNarrativeAudit['worldMentions'][number]['evidence'][number];

function compactText(text: string, maxLength: number): string {
  const value = text.replace(/\s+/g, ' ').trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function pickFirstMatch(text: string, candidates: string[]): string {
  for (const candidate of candidates) {
    if (candidate && text.includes(candidate)) return candidate;
  }
  return '';
}

function containsAnySignal(text: string, signals: string[]): boolean {
  return signals.some(signal => signal && text.includes(signal));
}

function createSignalRegex(words: string[]): RegExp {
  const pattern = words
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return new RegExp(pattern, 'u');
}

function buildEvidenceSnippet(text: string, start: number, end: number): string {
  return compactText(text.slice(Math.max(0, start), Math.min(text.length, end)), 90);
}

function stripChapterHeading(text: string): string {
  return text
    .replace(/^\s*#*\s*第\s*\d+\s*章[^\n]*(?:\n+|$)/u, '')
    .trimStart();
}

function findTermNearSignalEvidence(params: {
  text: string;
  terms: string[];
  signalRe: RegExp;
  kind: WorldUsageEvidence['kind'];
  windowSize?: number;
  limit?: number;
}): WorldUsageEvidence[] {
  const { text, terms, signalRe, kind, windowSize = 110, limit = 2 } = params;
  const evidence: WorldUsageEvidence[] = [];
  for (const term of terms) {
    if (!term || term.length < 2) continue;
    let index = text.indexOf(term);
    while (index >= 0) {
      const start = Math.max(0, index - windowSize);
      const end = Math.min(text.length, index + term.length + windowSize);
      const slice = text.slice(start, end);
      const signalMatch = signalRe.exec(slice);
      if (signalMatch?.[0]) {
        evidence.push({
          kind,
          term,
          signal: signalMatch[0],
          position: start + signalMatch.index,
          snippet: buildEvidenceSnippet(text, start, end),
        });
        if (evidence.length >= limit) return evidence;
      }
      index = text.indexOf(term, index + term.length);
    }
  }
  return evidence;
}

function findTermNearLiteralEvidence(params: {
  text: string;
  terms: string[];
  signals: string[];
  kind: WorldUsageEvidence['kind'];
  windowSize?: number;
  limit?: number;
}): WorldUsageEvidence[] {
  const { text, terms, signals, kind, windowSize = 110, limit = 2 } = params;
  const effectiveSignals = signals.filter(signal => signal.length >= 2);
  if (effectiveSignals.length === 0) return [];
  const evidence: WorldUsageEvidence[] = [];
  for (const term of terms) {
    if (!term || term.length < 2) continue;
    let index = text.indexOf(term);
    while (index >= 0) {
      const start = Math.max(0, index - windowSize);
      const end = Math.min(text.length, index + term.length + windowSize);
      const slice = text.slice(start, end);
      const signal = effectiveSignals.find(item => slice.includes(item));
      if (signal) {
        evidence.push({
          kind,
          term,
          signal,
          position: start + slice.indexOf(signal),
          snippet: buildEvidenceSnippet(text, start, end),
        });
        if (evidence.length >= limit) return evidence;
      }
      index = text.indexOf(term, index + term.length);
    }
  }
  return evidence;
}

function hasTermNearSignal(text: string, terms: string[], signalRe: RegExp, windowSize = 110): boolean {
  for (const term of terms) {
    if (!term || term.length < 2) continue;
    let index = text.indexOf(term);
    while (index >= 0) {
      const start = Math.max(0, index - windowSize);
      const end = Math.min(text.length, index + term.length + windowSize);
      if (signalRe.test(text.slice(start, end))) return true;
      index = text.indexOf(term, index + term.length);
    }
  }
  return false;
}

function hasTermNearLiteralSignals(text: string, terms: string[], signals: string[], windowSize = 110): boolean {
  const effectiveSignals = signals.filter(signal => signal.length >= 2);
  if (effectiveSignals.length === 0) return false;
  for (const term of terms) {
    if (!term || term.length < 2) continue;
    let index = text.indexOf(term);
    while (index >= 0) {
      const start = Math.max(0, index - windowSize);
      const end = Math.min(text.length, index + term.length + windowSize);
      const slice = text.slice(start, end);
      if (effectiveSignals.some(signal => slice.includes(signal))) return true;
      index = text.indexOf(term, index + term.length);
    }
  }
  return false;
}

function compactSignals(items: string[]): string[] {
  return items
    .map(item => compactText(item, 18))
    .filter(Boolean);
}

function dedupeStrings(items: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function deriveWorldMentionTerms(entry: WorldEntry, blockedTerms: Set<string>): string[] {
  const terms = [entry.name, ...(entry.aliases ?? [])];
  const normalizedName = entry.name
    .replace(/[（）()【】《》“”"']/g, ' ')
    .replace(/（.*?）|\(.*?\)/g, ' ');
  const fragments = normalizedName
    .split(/与|和|及|、|，|,|\/|：|:|的|之|\s+/)
    .map(item => item.replace(/(规则|系统|关联|势力|机制|制度|预警|档案|医档|年号)$/u, '').trim())
    .filter(item => item.length >= 2 && item.length <= 12)
    .filter(item => !blockedTerms.has(item));
  terms.push(...fragments);
  return dedupeStrings(terms);
}

function buildTermPressureMatcher(terms: string[]): RegExp | null {
  const escapedTerms = terms
    .filter(term => term.length >= 2)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escapedTerms.length === 0) return null;
  const termPattern = `(?:${escapedTerms.join('|')})`;
  const pressurePattern = '(冲突|阻拦|拒绝|代价|后果|必须|不能|不得|惩罚|反噬|选择|决定|寿命|病|死|权|令|密信|追究|暴露|失去|剥夺|祭坛|血|钥匙|锁|引信|黑线|药力|烧伤|灼伤|命|会死|活人|死人)';
  return new RegExp(`${termPattern}[\\s\\S]{0,90}${pressurePattern}|${pressurePattern}[\\s\\S]{0,90}${termPattern}`);
}

const WORLD_CONSTRAINT_SIGNAL_RE = createSignalRegex([
  '必须',
  '不能',
  '不得',
  '只准',
  '除非',
  '需要',
  '钥匙',
  '锁',
  '锁芯',
  '石门',
  '引信',
  '两把钥匙',
  '按在',
  '不许',
  '封住',
  '堵住',
]);

const WORLD_CONFLICT_SIGNAL_RE = createSignalRegex([
  '冲突',
  '阻拦',
  '拒绝',
  '对峙',
  '追兵',
  '围住',
  '搜捕',
  '陷阱',
  '暴露',
  '逼',
  '争',
  '夺',
  '杀',
  '救',
  '站队',
  '翻脸',
  '背叛',
  '锁',
  '钥匙',
  '血书',
  '石门',
]);

const WORLD_DIRECT_COST_SIGNAL_RE = createSignalRegex([
  '代价',
  '后果',
  '会死',
  '困死',
  '流血',
  '活人的血',
  '血是引信',
  '死人的骨',
  '引信',
  '失去',
  '暴露',
  '剥夺',
  '惩罚',
  '封井',
  '追究',
  '杀',
]);

const WORLD_BODY_COST_SIGNAL_RE = createSignalRegex([
  '反噬',
  '寿命',
  '黑线',
  '药力',
  '烧伤',
  '灼伤',
  '骨痛',
  '撑不住',
  '欠',
  '债',
  '裂痕',
]);

const TEXT_PRESSURE_SIGNAL_RE = createSignalRegex([
  '选择',
  '抉择',
  '决定',
  '拒绝',
  '答应',
  '必须',
  '不能',
  '代价',
  '后果',
  '冲突',
  '反转',
  '钩子',
  '反噬',
  '会死',
  '寿命',
  '黑线',
  '药力',
  '钥匙',
  '锁',
  '血',
  '引信',
  '站队',
  '暴露',
]);

const DERIVED_WORLD_TERMS: Array<{
  name: string;
  category: WorldEntry['category'];
  storyRole: NonNullable<WorldEntry['storyRole']>;
  terms: string[];
}> = [
  {
    name: '祭坛门规则',
    category: 'rule',
    storyRole: 'constraint',
    terms: ['石门', '第四道门', '第三道门', '掌印凹槽', '焦痕', '卷轴', '珠子'],
  },
  {
    name: '暗渠通行规则',
    category: 'geography',
    storyRole: 'constraint',
    terms: ['暗渠', '铁栅栏', '护城河底', '绳索', '铁楔子'],
  },
  {
    name: '身体反噬规则',
    category: 'rule',
    storyRole: 'constraint',
    terms: ['焦痕', '灰线', '无名指', '反噬', '黑线', '药力'],
  },
  {
    name: '太后府追踪压力',
    category: 'faction',
    storyRole: 'conflict',
    terms: ['太后府', '府兵', '太后', '火把', '轿子'],
  },
];

function inferStoryRole(entry: WorldEntry): NonNullable<WorldEntry['storyRole']> {
  if (entry.storyRole) return entry.storyRole;
  switch (entry.category) {
    case 'rule':
      return 'constraint';
    case 'power':
      return 'resource';
    case 'faction':
      return 'conflict';
    case 'history':
      return 'mystery';
    case 'geography':
      return 'anchor';
    default:
      return 'anchor';
  }
}

function derivePressureHints(entry: WorldEntry): string[] {
  const hints = [
    ...(entry.constraints ?? []),
    ...(entry.consequences ?? []),
  ].filter(Boolean);
  if (hints.length > 0) return hints.slice(0, 3);

  const details = entry.details ?? {};
  const detailedHints = [details.constraint, details.consequence, details.storyRole, details.function]
    .filter((item): item is string => Boolean(item && item.trim()));
  return detailedHints.slice(0, 3);
}

function deriveChapterUsageHint(entry: WorldEntry, role: NonNullable<WorldEntry['storyRole']>): string {
  const base = compactText(entry.description, 80);
  switch (role) {
    case 'constraint':
      return `把「${entry.name}」写成限制主角行动的规则，避免只作背景说明：${base}`;
    case 'conflict':
      return `把「${entry.name}」写成冲突来源，必须让角色在这里发生选择与代价。`;
    case 'mystery':
      return `把「${entry.name}」写成悬念/未解之谜，至少推动一层新疑问。`;
    case 'resource':
      return `把「${entry.name}」写成争夺资源或能力的对象，强调谁能用、谁不能用。`;
    case 'anchor':
    default:
      return `把「${entry.name}」写成场景锚点，配合具体行动而不是静态说明。`;
  }
}

function bodyCostAppliesToEntry(entry: WorldEntry, role: NonNullable<WorldEntry['storyRole']>): boolean {
  return entry.category === 'rule'
    || entry.category === 'power'
    || role === 'constraint'
    || role === 'resource';
}

function buildDerivedWorldEntry(card: typeof DERIVED_WORLD_TERMS[number]): WorldEntry {
  return {
    id: `derived:${card.name}`,
    name: card.name,
    category: card.category,
    description: card.terms.join('、'),
    aliases: card.terms,
    tags: [],
    relatedEntries: [],
    dependencies: [],
    conflicts: [],
    constraints: [],
    consequences: [],
    storyRole: card.storyRole,
    details: {},
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function buildNarrativeWorldCards(entries: WorldEntry[]): NarrativeWorldCard[] {
  return entries
    .filter((entry) => !entry.tags.includes('dirty-name'))
    .filter((entry) => typeof entry.qualityScore !== 'number' || entry.qualityScore >= 0.35)
    .map((entry) => {
      const storyRole = inferStoryRole(entry);
      return {
        id: entry.id,
        name: entry.name,
        category: entry.category,
        storyRole,
        summary: compactText(entry.description, 120),
        constraints: entry.constraints?.slice(0, 3) ?? [],
        consequences: entry.consequences?.slice(0, 3) ?? [],
        pressure: derivePressureHints(entry),
        chapterUsageHint: deriveChapterUsageHint(entry, storyRole),
      };
    });
}

export function renderNarrativeWorldContext(cards: NarrativeWorldCard[]): string {
  if (cards.length === 0) return '';
  const lines: string[] = ['以下是本章必须按“叙事规则”使用的世界观卡片：'];

  for (const card of cards) {
    lines.push('');
    lines.push(`[${card.category}] ${card.name}`);
    lines.push(`- 叙事角色：${card.storyRole}`);
    lines.push(`- 核心事实：${card.summary}`);
    if (card.constraints.length > 0) {
      lines.push(`- 约束：${card.constraints.join('；')}`);
    }
    if (card.consequences.length > 0) {
      lines.push(`- 后果：${card.consequences.join('；')}`);
    }
    if (card.pressure.length > 0) {
      lines.push(`- 压力点：${card.pressure.join('；')}`);
    }
    lines.push(`- 使用提示：${card.chapterUsageHint}`);
  }

  return lines.join('\n');
}

function deriveCharacterWant(character: CharacterProfile): string {
  return character.drives?.want?.trim()
    || character.motivation?.trim()
    || character.currentState?.trim()
    || '';
}

function deriveCharacterFear(character: CharacterProfile): string {
  const cue = pickFirstMatch(character.currentState ?? '', ['害怕', '担心', '顾虑', '压力', '慌乱', '犹疑']);
  return cue
    || character.drives?.fear?.trim()
    || character.psychology?.emotionalTriggers?.[0]?.trim()
    || character.growthTrack?.unresolvedTrauma?.[0]?.trim()
    || '未显式记录';
}

function deriveCharacterPressure(character: CharacterProfile): string {
  const parts = [
    character.currentState,
    character.motivation,
    character.arc,
    character.persona?.maskTrigger,
    character.psychology?.copingMechanisms?.join('、'),
    character.growthTrack?.pendingPromises?.join('、'),
  ].filter((item): item is string => Boolean(item && item.trim()));
  return parts.length > 0 ? compactText(parts.join(' / '), 90) : '当前压力不足，需在正文中补强选择代价';
}

function deriveCharacterNextChoice(character: CharacterProfile): string {
  const want = deriveCharacterWant(character);
  if (want) return `围绕「${compactText(want, 22)}」做出更有代价的选择`;
  return '给出一个会改变关系或目标的具体选择';
}

export function buildNarrativeCharacterCards(characters: CharacterProfile[]): NarrativeCharacterCard[] {
  return characters.map((character) => ({
    id: character.id,
    name: character.name,
    role: character.role,
    want: deriveCharacterWant(character),
    fear: deriveCharacterFear(character),
    pressure: deriveCharacterPressure(character),
    nextChoice: deriveCharacterNextChoice(character),
  }));
}

export function renderNarrativeCharacterContext(cards: NarrativeCharacterCard[]): string {
  if (cards.length === 0) return '';
  const lines: string[] = ['以下是本章必须保持的角色选择压力：'];

  for (const card of cards) {
    lines.push('');
    lines.push(`[${card.role}] ${card.name}`);
    if (card.want) lines.push(`- 当前欲望：${card.want}`);
    lines.push(`- 当前恐惧：${card.fear}`);
    lines.push(`- 当前压力：${card.pressure}`);
    lines.push(`- 下一步选择：${card.nextChoice}`);
  }

  return lines.join('\n');
}

export function auditChapterNarrativeUsage(params: {
  chapterContent: string;
  worldEntries: WorldEntry[];
  characters: CharacterProfile[];
}): ChapterNarrativeAudit {
  const text = stripChapterHeading(params.chapterContent);
  const characterNameSet = new Set(
    params.characters.flatMap(character => [character.name, ...(character.aliases ?? [])]).filter(Boolean),
  );
  const derivedWorldEntries = DERIVED_WORLD_TERMS
    .filter(card => card.terms.some(term => text.includes(term)))
    .map(buildDerivedWorldEntry);
  const worldEntries = [...params.worldEntries, ...derivedWorldEntries];
  const worldMentions = worldEntries.map((entry) => {
    const role = inferStoryRole(entry);
    const mentionTerms = deriveWorldMentionTerms(entry, characterNameSet);
    const matchedTerms = mentionTerms.filter(term => text.includes(term));
    if (matchedTerms.length === 0) {
      return null;
    }
    const constraints = entry.constraints ?? [];
    const consequences = entry.consequences ?? [];
    const ruleEvidence = evaluateWorldRuleEvidence({
      chapterContent: text,
      names: matchedTerms,
      constraints,
      consequences,
    });
    const pressureSignals = compactSignals(derivePressureHints(entry));
    const constraintEvidence = [
      ...findTermNearLiteralEvidence({
        text,
        terms: matchedTerms,
        signals: compactSignals(constraints),
        kind: 'constraint',
      }),
      ...findTermNearSignalEvidence({
        text,
        terms: matchedTerms,
        signalRe: WORLD_CONSTRAINT_SIGNAL_RE,
        kind: 'constraint',
      }),
    ].slice(0, 2);
    const costEvidence = [
      ...findTermNearLiteralEvidence({
        text,
        terms: matchedTerms,
        signals: compactSignals(consequences),
        kind: 'cost',
      }),
      ...findTermNearSignalEvidence({
        text,
        terms: matchedTerms,
        signalRe: WORLD_DIRECT_COST_SIGNAL_RE,
        kind: 'cost',
      }),
      ...(bodyCostAppliesToEntry(entry, role)
        ? findTermNearSignalEvidence({
            text,
            terms: matchedTerms,
            signalRe: WORLD_BODY_COST_SIGNAL_RE,
            kind: 'cost',
          })
        : []),
    ].slice(0, 2);
    const pressureEvidence = findTermNearLiteralEvidence({
      text,
      terms: matchedTerms,
      signals: pressureSignals,
      kind: 'pressure',
    });
    const usedAsConstraint = !ruleEvidence.contradicted
      && (constraintEvidence.length > 0 || ruleEvidence.constraintMatched);
    const usedAsConsequence = !ruleEvidence.contradicted
      && (costEvidence.length > 0 || ruleEvidence.consequenceMatched);
    const hasPressureSignal = pressureEvidence.length > 0;
    const pressureMatcher = buildTermPressureMatcher(matchedTerms);
    const conflictWindow = pressureMatcher ? pressureMatcher.test(text) : false;
    const conflictEvidence = findTermNearSignalEvidence({
      text,
      terms: matchedTerms,
      signalRe: WORLD_CONFLICT_SIGNAL_RE,
      kind: 'conflict',
    });
    const conflictSignalWindow = conflictEvidence.length > 0;
    const usedAsConflict = !ruleEvidence.contradicted
      && (usedAsConstraint || usedAsConsequence || hasPressureSignal || conflictWindow || conflictSignalWindow);
    const usageLevel: NarrativeUsageLevel = usedAsConsequence
      ? 'cost'
      : conflictWindow || conflictSignalWindow || hasPressureSignal
        ? 'conflict'
        : usedAsConstraint
          ? 'constraint'
          : 'mention';
    const evidence = [
      ...costEvidence,
      ...conflictEvidence,
      ...constraintEvidence,
      ...pressureEvidence,
    ].slice(0, 4);
    return {
      name: entry.name,
      category: entry.category,
      storyRole: role,
      matchedTerms,
      usageLevel,
      usedAsConstraint,
      usedAsConflict,
      usedAsConsequence,
      evidence,
    };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));

  const characterMentions = params.characters.slice(0, 32).map((character) => {
    const mentioned = text.includes(character.name) || (character.aliases ?? []).some(alias => alias && text.includes(alias));
    if (!mentioned) return null;
    const want = deriveCharacterWant(character);
    const fear = deriveCharacterFear(character);
    const pressure = deriveCharacterPressure(character);
    const hasWantSignal = want ? text.includes(want.slice(0, Math.min(8, want.length))) : false;
    const hasFearSignal = fear !== '未显式记录' && text.includes(fear.slice(0, Math.min(8, fear.length)));
    const hasPressureSignal = pressure !== '当前压力不足，需在正文中补强选择代价' && text.includes(pressure.slice(0, Math.min(8, pressure.length)));
    const hasChoiceSignal = /选择|决定|拒绝|答应|必须|转身|离开|留下|承诺|背叛|妥协/.test(text);
    return {
      name: character.name,
      role: character.role,
      hasWantSignal,
      hasFearSignal,
      hasPressureSignal,
      hasChoiceSignal,
    };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));

  const worldPressureScore = worldMentions.length === 0
    ? 0
    : Math.round((worldMentions.reduce((sum, item) => {
        const weight = item.usageLevel === 'cost'
          ? 1
          : item.usageLevel === 'conflict'
            ? 0.75
            : item.usageLevel === 'constraint'
              ? 0.55
              : 0.15;
        return sum + weight;
      }, 0) / worldMentions.length) * 100);
  const characterPressureScore = characterMentions.length === 0
    ? 0
    : Math.round((characterMentions.filter(item => item.hasWantSignal || item.hasFearSignal || item.hasPressureSignal || item.hasChoiceSignal).length / characterMentions.length) * 100);
  const effectiveUsageScore = Math.round((worldPressureScore * 0.55) + (characterPressureScore * 0.45));

  const issues: string[] = [];
  const suggestions: string[] = [];

  if (worldMentions.length > 0 && worldPressureScore < 50) {
    issues.push('世界要素被提及，但多数没有转化为约束/后果/冲突。');
    suggestions.push('把世界要素改写成限制、代价或冲突来源，而不是背景说明。');
  }
  if (worldMentions.some(item => item.usageLevel === 'mention')) {
    issues.push('存在只被点名、未承担剧情功能的世界要素。');
    suggestions.push('让被点名的世界要素至少造成一个行动限制、信息差或现实代价。');
  }
  if (characterMentions.length > 0 && characterPressureScore < 55) {
    issues.push('角色被提及，但选择压力信号偏弱。');
    suggestions.push('给角色加入明确欲望、恐惧和当场选择。');
  }
  if (worldMentions.length === 0 && characterMentions.length === 0) {
    issues.push('本章几乎没有使用可识别的世界或角色要素。');
    suggestions.push('下一章至少调用一个世界规则和一个角色压力点。');
  }
  if (!TEXT_PRESSURE_SIGNAL_RE.test(text)) {
    issues.push('正文缺少显式选择、代价或冲突关键词。');
    suggestions.push('补出可见的行动选择和明确后果。');
  }

  return {
    worldMentions,
    characterMentions,
    worldPressureScore,
    characterPressureScore,
    effectiveUsageScore,
    issues,
    suggestions,
  };
}

export function summarizeNarrativeAudit(audit: ChapterNarrativeAudit): string {
  const parts = [
    `世界压力分：${audit.worldPressureScore}`,
    `角色压力分：${audit.characterPressureScore}`,
    `有效使用分：${audit.effectiveUsageScore}`,
  ];
  if (audit.issues.length > 0) {
    parts.push(`问题：${audit.issues.join('；')}`);
  }
  if (audit.suggestions.length > 0) {
    parts.push(`建议：${audit.suggestions.join('；')}`);
  }
  return parts.join('；');
}

export function mergeNarrativeAuditIntoDiagnostics(
  chapter: Chapter,
  audit: ChapterNarrativeAudit,
): Chapter['diagnostics'] {
  return {
    ...(chapter.diagnostics ?? {}),
    narrativeAudit: {
      ...audit,
    },
    updatedAt: new Date().toISOString(),
  } as Chapter['diagnostics'];
}

export function buildNarrativeAuditForwardHints(chapter: Chapter | null | undefined): string {
  const audit = chapter?.diagnostics?.narrativeAudit;
  if (!audit) return '';

  const mentionOnly = audit.worldMentions
    .filter(item => item.usageLevel === 'mention')
    .map(item => item.name)
    .slice(0, 3);
  const weakWorld = audit.worldPressureScore < 60;
  const weakCharacter = audit.characterPressureScore < 60;
  if (mentionOnly.length === 0 && !weakWorld && !weakCharacter && audit.suggestions.length === 0) return '';

  const lines: string[] = [
    `上一章叙事要素审计提示（第 ${chapter.chapterNumber} 章）：`,
  ];
  if (mentionOnly.length > 0) {
    lines.push(`- 上一章只点名、未形成剧情功能的世界要素：${mentionOnly.join('、')}。本章必须至少让其中一个变成阻碍、信息差、现实代价或角色选择。`);
  }
  if (weakWorld) {
    lines.push(`- 上一章世界压力分 ${audit.worldPressureScore}，本章不能只解释设定，必须让世界规则改变角色行动。`);
  }
  if (weakCharacter) {
    lines.push(`- 上一章角色压力分 ${audit.characterPressureScore}，本章需要补出明确欲望、恐惧和当场选择。`);
  }
  for (const suggestion of audit.suggestions.slice(0, 2)) {
    lines.push(`- ${suggestion}`);
  }
  return lines.join('\n');
}
