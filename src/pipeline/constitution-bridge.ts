import type { NovelConstitution } from '../novel/constitution-types.js';
import type { PromiseContract } from './promise-contract.js';
import {
  CONSTITUTION_CLAUSE_CATEGORIES,
  type ConstitutionClauseCategory,
} from '../novel/constitution-types.js';

/**
 * 将宪章的结构化字段映射为 PromiseContract，
 * 使门禁（commercial-gate / startup-opening-gate）无需改动即可消费宪章数据。
 *
 * 设计原则：宪章的 keywords 字段直接映射到 PromiseContract 的关键词字段，
 * 保证 Writer 看到的约束和门禁检测用的关键词是同一份数据。
 */
export function constitutionToPromiseContract(
  constitution: NovelConstitution,
  params: {
    genre: string;
    fallbackContract?: PromiseContract;
  },
): PromiseContract {
  const { keywords, clauses, mainPromise, secondaryPromises } = constitution;

  // 按 category 分组条款，拼接成 hint 文本
  const grouped = groupClausesByCategory(clauses);

  const directionHint = buildHintSection('题材宪章（自动生成）', [
    ...formatClauseGroup(grouped, 'core-promise', '核心承诺'),
    ...formatClauseGroup(grouped, 'anti-drift', '防偏约束'),
  ]);

  const openingHint = buildHintSection('开篇策略', [
    ...formatClauseGroup(grouped, 'pacing-rule', '节奏规则'),
    ...formatClauseGroup(grouped, 'tone-guide', '基调指南'),
  ]);

  const payoffHint = buildHintSection('爽点兑现', [
    ...formatClauseGroup(grouped, 'payoff-rhythm', '爽点节奏'),
    ...formatClauseGroup(grouped, 'scene-mandate', '必写场景'),
  ]);

  const antiDriftHint = buildAntiDriftHint(grouped, keywords.suspenseDriftKeywords);

  const constitutionContract: PromiseContract = {
    profileId: 'constitution',
    constitutionSignals: [],
    mainPromise,
    secondaryPromises,
    requiredPayoffKeywords: keywords.payoffKeywords,
    requiredSceneKeywords: keywords.sceneKeywords,
    suspenseDriftKeywords: keywords.suspenseDriftKeywords,
    maxSuspenseShare: keywords.maxSuspenseShare,
    directionHint,
    openingHint,
    payoffHint,
    antiDriftHint,
    summary: `题材宪章 v${constitution.version}（${params.genre}）：${mainPromise}`,
  };

  return mergeWithFallbackContract(constitutionContract, params.fallbackContract);
}

// ── helpers ──

type ClauseGroup = Map<ConstitutionClauseCategory, Array<{ title: string; content: string; priority: string }>>;

function groupClausesByCategory(
  clauses: NovelConstitution['clauses'],
): ClauseGroup {
  const map: ClauseGroup = new Map();
  for (const cat of CONSTITUTION_CLAUSE_CATEGORIES) {
    map.set(cat, []);
  }
  for (const clause of clauses) {
    const list = map.get(clause.category);
    if (list) {
      list.push({ title: clause.title, content: clause.content, priority: clause.priority });
    }
  }
  return map;
}

function formatClauseGroup(
  grouped: ClauseGroup,
  category: ConstitutionClauseCategory,
  label: string,
): string[] {
  const items = grouped.get(category) ?? [];
  if (items.length === 0) return [];
  const lines = [`### ${label}`];
  for (const item of items) {
    const prefix = item.priority === 'high' ? '【必须】' : item.priority === 'medium' ? '【建议】' : '【参考】';
    lines.push(`- ${prefix}${item.title}：${item.content}`);
  }
  return lines;
}

function buildHintSection(heading: string, lines: string[]): string {
  if (lines.length === 0) return '';
  return [`## ${heading}`, ...lines].join('\n');
}

function buildAntiDriftHint(grouped: ClauseGroup, driftKeywords: string[]): string {
  const antiDriftClauses = grouped.get('anti-drift') ?? [];
  const lines: string[] = ['## 防偏检测'];
  if (antiDriftClauses.length > 0) {
    for (const clause of antiDriftClauses) {
      lines.push(`- ${clause.content}`);
    }
  }
  if (driftKeywords.length > 0) {
    lines.push(`- 漂移关键词（出现过多则判定偏题）：${driftKeywords.join('、')}`);
  }
  return lines.length > 1 ? lines.join('\n') : '';
}

function mergeWithFallbackContract(
  constitutionContract: PromiseContract,
  fallbackContract?: PromiseContract,
): PromiseContract {
  if (!fallbackContract) return constitutionContract;
  return {
    ...constitutionContract,
    constitutionSignals: mergeUnique([
      ...constitutionContract.constitutionSignals,
      ...fallbackContract.constitutionSignals,
    ]),
    mainPromise: constitutionContract.mainPromise || fallbackContract.mainPromise,
    secondaryPromises: mergeUnique([
      ...constitutionContract.secondaryPromises,
      ...fallbackContract.secondaryPromises,
    ]),
    requiredPayoffKeywords: mergeUnique([
      ...constitutionContract.requiredPayoffKeywords,
      ...fallbackContract.requiredPayoffKeywords,
    ]),
    requiredSceneKeywords: mergeUnique([
      ...constitutionContract.requiredSceneKeywords,
      ...fallbackContract.requiredSceneKeywords,
    ]),
    suspenseDriftKeywords: mergeUnique([
      ...constitutionContract.suspenseDriftKeywords,
      ...fallbackContract.suspenseDriftKeywords,
    ]),
    maxSuspenseShare: Math.min(
      constitutionContract.maxSuspenseShare,
      fallbackContract.maxSuspenseShare,
    ),
    directionHint: mergeHint(constitutionContract.directionHint, fallbackContract.directionHint),
    openingHint: mergeHint(constitutionContract.openingHint, fallbackContract.openingHint),
    payoffHint: mergeHint(constitutionContract.payoffHint, fallbackContract.payoffHint),
    antiDriftHint: mergeHint(constitutionContract.antiDriftHint, fallbackContract.antiDriftHint),
    summary: `${constitutionContract.summary}；卡片回填信号：${fallbackContract.constitutionSignals.join(' / ') || '无'}`,
  };
}

function mergeHint(primary?: string, fallback?: string): string | undefined {
  const merged = [primary, fallback].filter(Boolean).join('\n\n');
  return merged || undefined;
}

function mergeUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
