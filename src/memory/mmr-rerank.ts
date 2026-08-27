/**
 * MMR (Maximal Marginal Relevance) 重排序算法
 *
 * 在保证相关性的前提下最大化结果多样性。
 * 核心公式：MMR = λ × relevance − (1−λ) × max_similarity_to_selected
 *
 * 参考：Carbonell & Goldstein (1998)
 */

/** MMR 配置 */
export type MMRConfig = {
  /** 是否启用 MMR 重排序 */
  enabled: boolean;
  /** Lambda 参数：0=最大多样性，1=最大相关性，默认 0.7 */
  lambda: number;
};

export const DEFAULT_MMR_CONFIG: MMRConfig = {
  enabled: false,
  lambda: 0.7,
};

/**
 * 中英文混合分词，用于 Jaccard 相似度计算。
 * 中文按单字+双字 n-gram，英文按词。
 */
function tokenizeForMMR(text: string): Set<string> {
  const tokens = new Set<string>();
  const normalized = text.toLowerCase();

  // 按空格/标点拆分为段
  const segments = normalized.split(/[\s\p{P}]+/u).filter(Boolean);

  for (const segment of segments) {
    if (/[\u4e00-\u9fff]/.test(segment)) {
      // CJK 字符：单字 + 双字
      const chars = [...segment].filter(c => /[\u4e00-\u9fff]/.test(c));
      for (const c of chars) tokens.add(c);
      for (let i = 0; i < chars.length - 1; i++) {
        tokens.add(chars[i] + chars[i + 1]);
      }
    } else if (/[a-z0-9_]+/.test(segment)) {
      tokens.add(segment);
    }
  }

  return tokens;
}

/**
 * 两个 token 集合的 Jaccard 相似度，值域 [0, 1]。
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  let intersection = 0;
  for (const t of smaller) {
    if (larger.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** MMR 项的访问器接口，允许泛型适配任何数据结构 */
export type MMRAccessors<T> = {
  getId: (item: T) => string;
  getContent: (item: T) => string;
  getScore: (item: T) => number;
};

/**
 * 泛型 MMR 重排序。
 *
 * @param items 待排序列表
 * @param accessors 访问器（从 item 中提取 id/content/score）
 * @param config MMR 配置
 * @returns 重排后的列表
 */
export function mmrRerank<T>(
  items: T[],
  accessors: MMRAccessors<T>,
  config: Partial<MMRConfig> = {},
): T[] {
  const { enabled = DEFAULT_MMR_CONFIG.enabled, lambda = DEFAULT_MMR_CONFIG.lambda } = config;

  if (!enabled || items.length <= 1) return [...items];

  const clampedLambda = Math.max(0, Math.min(1, lambda));
  if (clampedLambda === 1) {
    return [...items].sort((a, b) => accessors.getScore(b) - accessors.getScore(a));
  }

  // 预计算所有 token 集合
  const tokenCache = new Map<string, Set<string>>();
  for (const item of items) {
    tokenCache.set(accessors.getId(item), tokenizeForMMR(accessors.getContent(item)));
  }

  // 分数归一化到 [0, 1]
  const scores = items.map(i => accessors.getScore(i));
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const range = maxScore - minScore;
  const normalize = (s: number) => (range === 0 ? 1 : (s - minScore) / range);

  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const remaining = new Set(items.map((_, i) => i));

  while (remaining.size > 0) {
    let bestIdx = -1;
    let bestMMR = -Infinity;

    for (const idx of remaining) {
      const item = items[idx];
      const id = accessors.getId(item);
      const relevance = normalize(accessors.getScore(item));

      // 计算与已选集合的最大相似度
      let maxSim = 0;
      const candidateTokens = tokenCache.get(id)!;
      for (const sel of selected) {
        const selTokens = tokenCache.get(accessors.getId(sel))!;
        const sim = jaccardSimilarity(candidateTokens, selTokens);
        if (sim > maxSim) maxSim = sim;
      }

      const mmr = clampedLambda * relevance - (1 - clampedLambda) * maxSim;
      if (mmr > bestMMR || (mmr === bestMMR && accessors.getScore(item) > (bestIdx >= 0 ? accessors.getScore(items[bestIdx]) : -Infinity))) {
        bestMMR = mmr;
        bestIdx = idx;
      }
    }

    if (bestIdx < 0) break;
    selected.push(items[bestIdx]);
    selectedIds.add(accessors.getId(items[bestIdx]));
    remaining.delete(bestIdx);
  }

  return selected;
}
