/**
 * 查询关键词提取与扩展
 *
 * 当 FTS 搜索面对口语化查询（如"之前那个坏人后来怎么样了"）时，
 * 自动提取有效关键词以提升召回率。
 */

const STOP_WORDS_ZH = new Set([
  // 代词
  '我', '我们', '你', '你们', '他', '她', '它', '他们', '她们',
  '这', '那', '这个', '那个', '这些', '那些', '自己',
  // 助词
  '的', '了', '着', '过', '得', '地', '吗', '呢', '吧', '啊', '呀', '嘛', '啦',
  // 常用动词（模糊）
  '是', '有', '在', '被', '把', '给', '让', '用', '到', '去', '来', '做', '说',
  '看', '找', '想', '要', '能', '会', '可以', '应该', '需要',
  // 介词和连词
  '和', '与', '或', '但', '但是', '因为', '所以', '如果', '虽然',
  '而', '也', '都', '就', '还', '又', '再', '才', '只', '不',
  // 时间（模糊）
  '之前', '以前', '之后', '以后', '刚才', '现在', '昨天', '今天', '明天', '最近',
  // 模糊指代
  '东西', '事情', '事', '什么', '哪个', '哪些', '怎么', '为什么', '多少',
  // 请求词
  '请', '帮', '帮忙', '告诉',
]);

const STOP_WORDS_EN = new Set([
  // 冠词和限定词
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  // 代词
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they', 'them',
  // 常用动词
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'can', 'may', 'might',
  // 介词
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
  // 连词
  'and', 'or', 'but', 'if', 'then', 'because', 'as', 'while', 'when', 'where',
  'what', 'which', 'who', 'how', 'why',
  // 模糊
  'thing', 'things', 'stuff', 'something', 'anything', 'everything', 'nothing',
  'yesterday', 'today', 'tomorrow', 'recently', 'ago', 'just', 'now',
  'please', 'help', 'find', 'show', 'get', 'tell', 'give',
]);

/**
 * 判断 token 是否为有效关键词
 */
function isValidKeyword(token: string): boolean {
  if (!token) return false;
  // 跳过过短的英文词（可能是停用词碎片）
  if (/^[a-zA-Z]+$/.test(token) && token.length < 3) return false;
  // 跳过纯数字
  if (/^\d+$/.test(token)) return false;
  // 跳过纯标点
  if (/^[\p{P}\p{S}]+$/u.test(token)) return false;
  return true;
}

/**
 * 中英文混合分词
 * 中文：单字 + 双字 n-gram
 * 英文：按空格/标点拆分
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const normalized = text.toLowerCase().trim();
  const segments = normalized.split(/[\s\p{P}]+/u).filter(Boolean);

  for (const segment of segments) {
    if (/[\u4e00-\u9fff]/.test(segment)) {
      const chars = [...segment].filter(c => /[\u4e00-\u9fff]/.test(c));
      for (const c of chars) tokens.push(c);
      for (let i = 0; i < chars.length - 1; i++) {
        tokens.push(chars[i] + chars[i + 1]);
      }
    } else {
      tokens.push(segment);
    }
  }

  return tokens;
}

/**
 * 从口语化查询中提取有效关键词。
 *
 * 示例：
 * - "之前讨论的那个方案" → ["讨论", "方案"]
 * - "那个坏人后来怎么样了" → ["坏人", "后来"]
 * - "what was the solution for the bug" → ["solution", "bug"]
 */
export function extractKeywords(query: string): string[] {
  const tokens = tokenize(query);
  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    if (STOP_WORDS_ZH.has(token) || STOP_WORDS_EN.has(token)) continue;
    if (!isValidKeyword(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    keywords.push(token);
  }

  return keywords;
}

/**
 * 扩展 FTS 查询：提取关键词，构建更宽泛的搜索条件。
 * 返回原始查询和提取的关键词列表。
 */
export function expandQueryForFts(query: string): {
  original: string;
  keywords: string[];
} {
  const original = query.trim();
  const keywords = extractKeywords(original);
  return { original, keywords };
}
