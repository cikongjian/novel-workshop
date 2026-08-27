/**
 * Quantified multi-dimensional relationship vector system.
 * Relationships between characters are represented as 6-dimensional numeric vectors
 * instead of free-text descriptions, enabling precise tracking and classification.
 */

// ── Dimension ranges ────────────────────────────────────────────────
const BIPOLAR_MIN = -100;
const BIPOLAR_MAX = 100;
const UNIPOLAR_MIN = 0;
const UNIPOLAR_MAX = 100;

// ── Classification thresholds ───────────────────────────────────────
const ALLY_TRUST_THRESHOLD = 60;
const ALLY_AFFECTION_THRESHOLD = 40;
const RESPECTED_ALLY_RESPECT_THRESHOLD = 50;
const ENEMY_TRUST_THRESHOLD = -50;
const ENEMY_RIVALRY_THRESHOLD = 50;
const FEARED_ENEMY_TRUST_THRESHOLD = -30;
const FEARED_ENEMY_FEAR_THRESHOLD = 50;
const SUBORDINATE_RESPECT_THRESHOLD = 60;
const SUBORDINATE_OBLIGATION_THRESHOLD = 50;
const RIVAL_RIVALRY_THRESHOLD = 60;
const FEARED_THRESHOLD = 70;
const RELUCTANT_DEBTOR_OBLIGATION_THRESHOLD = 70;
const RELUCTANT_DEBTOR_TRUST_CEILING = 20;

// ── Keyword inference delta ─────────────────────────────────────────
const KEYWORD_DELTA = 20;
const INFERRED_CAP = 80;
const INFERRED_FLOOR = -80;

// ── Core type ───────────────────────────────────────────────────────

export interface RelationshipVector {
  trust: number;      // -100 ~ +100
  affection: number;  // -100 ~ +100
  respect: number;    // -100 ~ +100
  obligation: number; // 0 ~ 100
  fear: number;       // 0 ~ 100
  rivalry: number;    // 0 ~ 100
}

// ── Dimension metadata ──────────────────────────────────────────────

export const VECTOR_DIMENSIONS = [
  'trust', 'affection', 'respect', 'obligation', 'fear', 'rivalry',
] as const;

export type VectorDimension = typeof VECTOR_DIMENSIONS[number];

const DIMENSION_RANGES: Record<VectorDimension, { min: number; max: number }> = {
  trust:      { min: BIPOLAR_MIN, max: BIPOLAR_MAX },
  affection:  { min: BIPOLAR_MIN, max: BIPOLAR_MAX },
  respect:    { min: BIPOLAR_MIN, max: BIPOLAR_MAX },
  obligation: { min: UNIPOLAR_MIN, max: UNIPOLAR_MAX },
  fear:       { min: UNIPOLAR_MIN, max: UNIPOLAR_MAX },
  rivalry:    { min: UNIPOLAR_MIN, max: UNIPOLAR_MAX },
};

const DIMENSION_LABELS: Record<VectorDimension, string> = {
  trust: '信任',
  affection: '亲近',
  respect: '尊敬',
  obligation: '义务',
  fear: '畏惧',
  rivalry: '竞争',
};

// ── Keyword maps for text inference ─────────────────────────────────

interface KeywordRule {
  dimension: VectorDimension;
  delta: number;
}

const KEYWORD_RULES: Array<{ keywords: string[]; rule: KeywordRule }> = [
  { keywords: ['信任', '相信', '托付', '依赖', '坦诚'], rule: { dimension: 'trust', delta: KEYWORD_DELTA } },
  { keywords: ['怀疑', '不信', '猜忌', '防备', '戒心'], rule: { dimension: 'trust', delta: -KEYWORD_DELTA } },
  { keywords: ['亲近', '喜欢', '爱', '关心', '心疼', '温柔'], rule: { dimension: 'affection', delta: KEYWORD_DELTA } },
  { keywords: ['厌恶', '冷漠', '疏远', '恨', '嫌弃'], rule: { dimension: 'affection', delta: -KEYWORD_DELTA } },
  { keywords: ['尊敬', '佩服', '敬仰', '崇拜', '钦佩'], rule: { dimension: 'respect', delta: KEYWORD_DELTA } },
  { keywords: ['轻视', '蔑视', '不屑', '鄙视', '看不起'], rule: { dimension: 'respect', delta: -KEYWORD_DELTA } },
  { keywords: ['欠', '恩情', '报答', '亏欠', '承诺'], rule: { dimension: 'obligation', delta: KEYWORD_DELTA } },
  { keywords: ['恐惧', '害怕', '畏惧', '胆寒', '颤抖'], rule: { dimension: 'fear', delta: KEYWORD_DELTA } },
  { keywords: ['竞争', '较量', '不服', '挑战', '对手'], rule: { dimension: 'rivalry', delta: KEYWORD_DELTA } },
];

// ── Functions ───────────────────────────────────────────────────────

export function createDefaultVector(): RelationshipVector {
  return { trust: 0, affection: 0, respect: 0, obligation: 0, fear: 0, rivalry: 0 };
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampVector(v: RelationshipVector): RelationshipVector {
  const result = { ...v };
  for (const dim of VECTOR_DIMENSIONS) {
    const { min, max } = DIMENSION_RANGES[dim];
    result[dim] = clampValue(result[dim], min, max);
  }
  return result;
}

export function classifyVector(v: RelationshipVector): string {
  if (v.trust > ALLY_TRUST_THRESHOLD && v.affection > ALLY_AFFECTION_THRESHOLD) {
    return 'ally';
  }
  if (v.trust > ALLY_TRUST_THRESHOLD && v.respect > RESPECTED_ALLY_RESPECT_THRESHOLD && v.affection <= ALLY_AFFECTION_THRESHOLD) {
    return 'respected_ally';
  }
  if (v.trust < ENEMY_TRUST_THRESHOLD && v.rivalry > ENEMY_RIVALRY_THRESHOLD) {
    return 'enemy';
  }
  if (v.trust < FEARED_ENEMY_TRUST_THRESHOLD && v.fear > FEARED_ENEMY_FEAR_THRESHOLD) {
    return 'feared_enemy';
  }
  if (v.respect > SUBORDINATE_RESPECT_THRESHOLD && v.obligation > SUBORDINATE_OBLIGATION_THRESHOLD) {
    return 'subordinate';
  }
  if (v.rivalry > RIVAL_RIVALRY_THRESHOLD && v.trust > 0) {
    return 'rival';
  }
  if (v.fear > FEARED_THRESHOLD) {
    return 'feared';
  }
  if (v.obligation > RELUCTANT_DEBTOR_OBLIGATION_THRESHOLD && v.trust < RELUCTANT_DEBTOR_TRUST_CEILING) {
    return 'reluctant_debtor';
  }
  return 'neutral';
}

export function vectorDistance(a: RelationshipVector, b: RelationshipVector): number {
  let sumSq = 0;
  for (const dim of VECTOR_DIMENSIONS) {
    const diff = a[dim] - b[dim];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

export function mergeVectorDelta(
  base: RelationshipVector,
  delta: Partial<RelationshipVector>,
  weight: number = 1.0,
): RelationshipVector {
  const result = { ...base };
  for (const dim of VECTOR_DIMENSIONS) {
    const deltaVal = delta[dim];
    if (deltaVal !== undefined) {
      result[dim] = base[dim] + deltaVal * weight;
    }
  }
  return clampVector(result);
}

export function inferVectorFromText(changeDescription: string): Partial<RelationshipVector> {
  const accumulator: Record<string, number> = {};

  for (const { keywords, rule } of KEYWORD_RULES) {
    for (const keyword of keywords) {
      if (changeDescription.includes(keyword)) {
        const current = accumulator[rule.dimension] ?? 0;
        accumulator[rule.dimension] = current + rule.delta;
      }
    }
  }

  const result: Partial<RelationshipVector> = {};
  for (const [dim, raw] of Object.entries(accumulator)) {
    const clamped = clampValue(raw, INFERRED_FLOOR, INFERRED_CAP);
    if (clamped !== 0) {
      result[dim as VectorDimension] = clamped;
    }
  }
  return result;
}

export function vectorToPromptText(
  from: string,
  to: string,
  v: RelationshipVector,
): string {
  const parts = VECTOR_DIMENSIONS.map(
    (dim) => `${DIMENSION_LABELS[dim]}(${v[dim]})`,
  );
  return `${from}\u2192${to}\uFF1A${parts.join(' ')}`;
}
