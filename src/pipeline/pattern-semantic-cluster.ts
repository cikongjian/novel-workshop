/**
 * 语义模式聚类器：把字面不同的 n-gram 按语义类别归组。
 *
 * 解决问题：传统 n-gram 检测器只看字面，无法识别
 *   "沉默了几秒" / "没有说话" / "一言不发"
 * 属于同一语义模式（沉默类）。
 *
 * 实现策略：纯规则、零成本
 *   1. 内置中文小说常用套路化表达的同义词典（按语义类别分组）
 *   2. 短语命中字典 → 直接归类
 *   3. 未命中的短语通过编辑距离匹配到最近的类别成员
 *   4. 提供聚类结果汇总，供检测器消费
 */

export type ClusterResult = {
  cluster: string;
  patterns: string[];
  totalCount: number;
};

export type ClusterSummaryItem = {
  cluster: string;
  hits: string[];
  totalCount: number;
};

/** 语义类别同义词典：key=类别名，value=该类别的代表性表达 */
const SEMANTIC_DICTIONARY: Record<string, string[]> = {
  沉默类: ['沉默', '没有说话', '一言不发', '没有出声', '默然', '缄默', '没开口', '闭口不言'],
  呼吸类: ['深吸一口气', '吐出一口气', '吸了口气', '呼吸一滞', '屏住呼吸', '倒吸一口气'],
  眼神类: ['眼神闪过', '目光掠过', '眼底闪过', '眼中掠过', '眼神一凝', '目光一凛'],
  嘴角类: ['嘴角上扬', '唇角上扬', '嘴角微扬', '嘴角勾起', '唇角微勾', '嘴角一扯'],
  眉头类: ['眉头皱起', '眉心微蹙', '眉头紧锁', '皱了皱眉', '眉峰微聚'],
  心跳类: ['心头一紧', '心里一沉', '心中一凛', '胸口一紧', '心下一沉'],
  拳头类: ['攥紧拳头', '握紧拳头', '捏紧拳头', '拳头攥紧', '双手握拳'],
  冷汗类: ['掌心冷汗', '手心冒汗', '额头冷汗', '背后发凉', '背脊一凉'],
  喉咙类: ['喉咙发紧', '喉结滚动', '喉咙发干', '嗓子发紧'],
  身体类: ['身体一僵', '身形一顿', '脚步一顿', '身躯一震'],
  凝固类: ['时间仿佛静止', '空气仿佛凝固', '血液仿佛凝固', '气氛凝固'],
  惊讶类: ['瞳孔骤缩', '眼睛微睁', '目光一凝', '眼神一变'],
  点头类: ['点了点头', '微微点头', '轻轻点头', '颔首'],
  叹气类: ['叹了口气', '轻叹一声', '发出一声叹息', '长叹一声'],
  微笑类: ['微微一笑', '嘴角含笑', '露出一丝笑意', '笑了笑'],
  转身类: ['转过身', '转身离去', '转身离开', '回过头'],
  沉思类: ['思索片刻', '沉吟片刻', '想了一会儿', '沉思片刻'],
  紧张类: ['紧张得', '心跳加速', '手心出汗', '忐忑不安'],
  愤怒类: ['怒火中烧', '气得发抖', '咬牙切齿', '怒不可遏'],
  悲伤类: ['眼眶微红', '鼻子一酸', '红了眼眶', '泪光闪烁'],
};

/** 编辑距离阈值：短语与字典成员距离 ≤ 该值视为同义 */
const EDIT_DISTANCE_THRESHOLD = 2;
/** 短语包含字典成员（或反之）所需的最小字典成员长度 */
const SUBSTRING_MIN_LEN = 3;

/** 反向索引：短语 → 所属类别，便于 O(1) 查找 */
const PHRASE_TO_CLUSTER: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [cluster, members] of Object.entries(SEMANTIC_DICTIONARY)) {
    for (const phrase of members) {
      map.set(phrase, cluster);
    }
  }
  return map;
})();

/** 类别 → 成员列表，保留字典原始顺序 */
const CLUSTER_TO_MEMBERS: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const [cluster, members] of Object.entries(SEMANTIC_DICTIONARY)) {
    map.set(cluster, [...members]);
  }
  return map;
})();

/** 所有字典短语（扁平化），供编辑距离扫描使用 */
const ALL_DICTIONARY_PHRASES: Array<{ phrase: string; cluster: string }> = (() => {
  const list: Array<{ phrase: string; cluster: string }> = [];
  for (const [cluster, members] of Object.entries(SEMANTIC_DICTIONARY)) {
    for (const phrase of members) {
      list.push({ phrase, cluster });
    }
  }
  return list;
})();

/**
 * 计算两个字符串的 Levenshtein 编辑距离。
 * 标准双行 DP 实现，仅用于短短语（长度 ≤ 12），复杂度可接受。
 */
function editDistance(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  let prev = new Array<number>(lb + 1);
  let curr = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[lb];
}

/** 子串包含判定：用于 "沉默了几秒" 命中 "沉默" 这类前缀/中缀扩展 */
function substringMatch(input: string, dictPhrase: string): boolean {
  if (dictPhrase.length < SUBSTRING_MIN_LEN) return false;
  if (input.length < dictPhrase.length) {
    return dictPhrase.includes(input) && input.length >= SUBSTRING_MIN_LEN;
  }
  return input.includes(dictPhrase);
}

/**
 * 查找短语所属的语义类别。
 * 优先级：精确命中 > 子串包含 > 编辑距离近似。
 * 未匹配返回 null。
 */
export function findCluster(phrase: string): string | null {
  if (!phrase) return null;

  const trimmed = phrase.trim();
  if (!trimmed) return null;

  // 1. 精确命中
  const exact = PHRASE_TO_CLUSTER.get(trimmed);
  if (exact) return exact;

  // 2. 子串包含：扫一遍字典（成员较少，开销可接受）
  for (const { phrase: dictPhrase, cluster } of ALL_DICTIONARY_PHRASES) {
    if (substringMatch(trimmed, dictPhrase)) return cluster;
  }

  // 3. 编辑距离近似：仅对短短语生效，避免长 n-gram 误归类
  if (trimmed.length > 12) return null;
  let bestCluster: string | null = null;
  let bestDist = EDIT_DISTANCE_THRESHOLD + 1;
  for (const { phrase: dictPhrase, cluster } of ALL_DICTIONARY_PHRASES) {
    if (Math.abs(dictPhrase.length - trimmed.length) > EDIT_DISTANCE_THRESHOLD) continue;
    const dist = editDistance(trimmed, dictPhrase);
    if (dist < bestDist) {
      bestDist = dist;
      bestCluster = cluster;
    }
  }
  return bestDist <= EDIT_DISTANCE_THRESHOLD ? bestCluster : null;
}

/** 获取某个语义类别的所有成员（返回副本，避免外部修改字典） */
export function getClusterMembers(cluster: string): string[] {
  const members = CLUSTER_TO_MEMBERS.get(cluster);
  return members ? [...members] : [];
}

/** 列出所有语义类别名，便于上层枚举展示 */
export function listAllClusters(): string[] {
  return Object.keys(SEMANTIC_DICTIONARY);
}

/**
 * 把输入的 n-gram 按语义类别归组。
 * - key=原始 n-gram 字符串，value=出现次数
 * - 返回 Map<代表短语, ClusterResult>
 * - 代表短语采用该簇中频率最高的成员；未归类的短语不输出
 */
export function clusterPatterns(patterns: Map<string, number>): Map<string, ClusterResult> {
  const buckets = new Map<string, Map<string, number>>();

  for (const [phrase, count] of patterns) {
    const cluster = findCluster(phrase);
    if (!cluster) continue;

    let bucket = buckets.get(cluster);
    if (!bucket) {
      bucket = new Map<string, number>();
      buckets.set(cluster, bucket);
    }
    bucket.set(phrase, (bucket.get(phrase) || 0) + count);
  }

  const result = new Map<string, ClusterResult>();
  for (const [cluster, bucket] of buckets) {
    const entries = Array.from(bucket.entries());
    // 选频次最高的短语作为代表
    entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const representative = entries[0][0];
    const patternsList = entries.map(([p]) => p);
    const totalCount = entries.reduce((sum, [, c]) => sum + c, 0);
    result.set(representative, {
      cluster,
      patterns: patternsList,
      totalCount,
    });
  }

  return result;
}

/**
 * 从文本中提取并聚类所有命中。
 * 复用已有的 n-gram 提取逻辑（与 pattern-frequency-extractor 同款滑动窗口），
 * 但仅保留能归入某个语义类别的短语。
 */
export function clusterAndSummarize(text: string): ClusterSummaryItem[] {
  const ngrams = extractCJKNGrams(text);
  const clustered = clusterPatterns(ngrams);

  const summary: ClusterSummaryItem[] = [];
  for (const [, result] of clustered) {
    summary.push({
      cluster: result.cluster,
      hits: result.patterns,
      totalCount: result.totalCount,
    });
  }
  summary.sort((a, b) => b.totalCount - a.totalCount);
  return summary;
}

const MIN_NGRAM = 3;
const MAX_NGRAM = 8;
const STOP_CHARS = new Set([
  '的', '了', '在', '是', '他', '她', '我', '你', '们', '这', '那',
  '一', '不', '也', '都', '就', '只', '还', '又', '把', '被', '让',
]);

function extractCJKNGrams(text: string): Map<string, number> {
  const result = new Map<string, number>();
  const clean = text.replace(/[\r\n\t\s]+/g, '');
  for (let n = MIN_NGRAM; n <= MAX_NGRAM; n++) {
    for (let i = 0; i <= clean.length - n; i++) {
      const gram = clean.slice(i, i + n);
      if (/[，。！？!?；;：:、""''「」『』（）()【】《》\-—…\.\,\s\d]/.test(gram)) continue;
      const cjkCount = (gram.match(/[\u4e00-\u9fff]/g) || []).length;
      if (cjkCount < gram.length * 0.7) continue;
      if (STOP_CHARS.has(gram[0]) && STOP_CHARS.has(gram[gram.length - 1])) continue;
      result.set(gram, (result.get(gram) || 0) + 1);
    }
  }
  return result;
}
