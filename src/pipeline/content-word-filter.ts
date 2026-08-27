import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 内容词过滤器：区分"合理重复"与"套路化重复"。
 *
 * 专有名词（人名/地名/物品名）高频是正常的，功能性短语（"他说""她看"）高频也是正常的，
 * 真正需要检测的是表达性短语（情绪动作、氛围描写、比喻意象）的过度使用。
 *
 * 用法：
 *   1. 在审计章节前调用 `await loadProperNouns(novelDir)` 加载专有名词；
 *   2. 调用 `filterExpressivePatterns(ngrams)` 从 n-gram 中筛出表达性短语。
 */

// ==================== 内置词库 ====================

/** 身体部位词：含此类词的短语多为情绪动作描写，属于表达性内容 */
export const BODY_PART_WORDS = new Set<string>([
  '嘴角', '眉头', '眉心', '眉梢', '眼神', '目光', '眼底', '眼眸', '眼角',
  '心头', '心中', '心里', '胸口', '胸膛', '呼吸', '拳头', '冷汗', '喉结',
  '瞳孔', '脊背', '掌心', '指尖', '脸庞', '额头', '下巴', '嘴唇', '唇角',
  '脖颈', '肩膀', '胸腔', '心脏', '血脉', '经脉', '骨节', '指甲', '手腕',
  '手指', '脸颊', '鼻尖', '耳畔', '牙关', '舌尖',
]);

/** 氛围词：含此类词的短语属于氛围描写，属于表达性内容 */
export const ATMOSPHERE_WORDS = new Set<string>([
  '空气', '气氛', '氛围', '沉默', '安静', '寂静', '静谧', '凝重', '压抑',
  '紧张', '尴尬', '凝滞', '沉重', '死寂', '空旷', '诡异', '肃穆', '冰冷', '寒意',
]);

/** 修饰副词：含此类词的短语属于表达性修饰，属于表达性内容 */
export const MODIFIER_WORDS = new Set<string>([
  '微微', '缓缓', '静静', '默默', '渐渐', '悄悄', '淡淡', '轻轻', '慢慢',
  '悠悠', '深深', '紧紧', '幽幽', '冷冷', '淡然', '黯然', '豁然', '蓦然',
  '骤然', '陡然',
]);

/** 功能性前缀：以代词+动词开头的短语，高频是正常的 */
export const FUNCTIONAL_PREFIXES = new Set<string>([
  '他说', '她说', '他想', '她想', '他看', '她看', '他走', '她走',
  '他笑', '她笑', '他听', '她听', '他做', '她做',
]);

// ==================== 内部词库 ====================

/** 功能性完整短语：连接词、量词组合、方位词组合、时间词等，高频是正常的 */
const FUNCTIONAL_PHRASES = new Set<string>([
  // 代词+动词
  '他说', '她说', '他想', '她想', '他看', '她看', '他走', '她走',
  '他笑', '她笑', '他听', '她听', '他做', '她做',
  // 连接词
  '然后', '于是', '所以', '因为', '因此', '不过', '但是', '然而',
  '可是', '虽然', '如果', '如此', '如何', '如今',
  // 量词组合
  '一个', '这种', '那种', '这种事', '这些', '那些', '什么', '某种',
  '一些', '一下', '一直', '一切',
  // 方位词组合
  '在面前', '在身后', '在手中', '在心中', '在手心', '在眼前', '在前方',
  // 时间词
  '这时候', '那一刻', '突然间', '忽然间', '一时间', '刹那间', '瞬间',
  '此刻', '那时', '这时',
]);

/** 比喻标记词：含此类词的短语可能是比喻意象，属于表达性内容 */
const METAPHOR_MARKERS = new Set<string>([
  '像', '如', '仿佛', '好似', '宛如', '犹似', '恍若', '好像',
]);

/** 感知动词：含此类词的短语属于感知描写，属于表达性内容 */
const PERCEPTION_VERBS = new Set<string>([
  '看到', '听到', '感觉到', '闻到', '嗅到', '尝到', '察觉到', '注意到', '发觉',
]);

// ==================== 专有名词加载 ====================

/** 当前生效的专有名词集合，由 `loadProperNouns` 设置，供 `isContentWord` 使用 */
let properNouns = new Set<string>();

/** 按 novelDir 缓存的专有名词集合，避免重复读取磁盘 */
const properNounCache = new Map<string, Set<string>>();

interface NameCarrier {
  name?: unknown;
  aliases?: unknown;
}

function collectNames(
  entries: unknown[],
  target: Set<string>,
  minLength = 2,
): void {
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as NameCarrier;
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    if (name.length >= minLength) target.add(name);
    if (Array.isArray(entry.aliases)) {
      for (const alias of entry.aliases) {
        if (typeof alias !== 'string') continue;
        const trimmed = alias.trim();
        if (trimmed.length >= minLength) target.add(trimmed);
      }
    }
  }
}

/**
 * 从小说目录的 characters.json 与 world.json 中加载专有名词。
 *
 * 包含人名、地名、物品名、技能名、组织名等及其别名。
 * 结果会缓存到模块级状态，供 `isContentWord` 使用；
 * 多次调用同一 novelDir 不会重复读盘。
 */
export async function loadProperNouns(novelDir: string): Promise<Set<string>> {
  const cached = properNounCache.get(novelDir);
  if (cached) {
    properNouns = cached;
    return cached;
  }

  const nouns = new Set<string>();

  const charsPath = path.join(novelDir, 'characters.json');
  try {
    const content = await fs.readFile(charsPath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) collectNames(parsed, nouns);
  } catch {
    // characters.json 不存在或格式错误，忽略
  }

  const worldPath = path.join(novelDir, 'world.json');
  try {
    const content = await fs.readFile(worldPath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) collectNames(parsed, nouns);
  } catch {
    // world.json 不存在或格式错误，忽略
  }

  properNounCache.set(novelDir, nouns);
  properNouns = nouns;
  return nouns;
}

// ==================== 判断函数 ====================

/** 判断是否为功能性短语（代词+动词、连接词、量词、方位词、时间词） */
function matchesFunctionalPhrase(phrase: string): boolean {
  if (FUNCTIONAL_PHRASES.has(phrase)) return true;
  // 以功能性前缀开头且整体较短（如"他说道""她看着"），视为功能性
  for (const prefix of FUNCTIONAL_PREFIXES) {
    if (phrase.startsWith(prefix) && phrase.length <= prefix.length + 2) {
      return true;
    }
  }
  return false;
}

/** 判断是否与专有名词相关（完全匹配、包含专有名词、被专有名词包含） */
function matchesProperNoun(phrase: string): boolean {
  if (properNouns.size === 0) return false;
  if (phrase.length < 2) return false;
  if (properNouns.has(phrase)) return true;
  for (const noun of properNouns) {
    if (phrase.includes(noun) || noun.includes(phrase)) {
      return true;
    }
  }
  return false;
}

function containsAny(phrase: string, words: Set<string>): boolean {
  for (const word of words) {
    if (phrase.includes(word)) return true;
  }
  return false;
}

/**
 * 判断是否为剧情必需词（应过滤掉，不作为套路化检测目标）。
 *
 * 返回 true 表示该短语属于专有名词或功能性短语，高频是合理的。
 * 注意：需先调用 `loadProperNouns` 加载专有名词，否则不会进行专有名词判断。
 */
export function isContentWord(phrase: string): boolean {
  if (!phrase || phrase.length < 2) return false;
  if (matchesFunctionalPhrase(phrase)) return true;
  if (matchesProperNoun(phrase)) return true;
  return false;
}

/**
 * 判断是否为表达性短语（应检测套路化）。
 *
 * 返回 true 表示该短语属于情绪动作、氛围描写、比喻意象、修饰副词或感知描写，
 * 其过度使用属于套路化重复，需要被检测。
 */
export function isExpressivePhrase(phrase: string): boolean {
  if (!phrase || phrase.length < 2) return false;
  if (containsAny(phrase, BODY_PART_WORDS)) return true;
  if (containsAny(phrase, ATMOSPHERE_WORDS)) return true;
  if (containsAny(phrase, METAPHOR_MARKERS)) return true;
  if (containsAny(phrase, MODIFIER_WORDS)) return true;
  if (containsAny(phrase, PERCEPTION_VERBS)) return true;
  return false;
}

/**
 * 从 n-gram 频次表中筛出表达性短语。
 *
 * 过滤逻辑：
 *   1. 若为剧情必需词（专有名词或功能性短语），跳过；
 *   2. 若不属于表达性短语，跳过；
 *   3. 其余保留，作为套路化检测的目标。
 */
export function filterExpressivePatterns(
  patterns: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [phrase, count] of patterns) {
    if (isContentWord(phrase)) continue;
    if (!isExpressivePhrase(phrase)) continue;
    result.set(phrase, count);
  }
  return result;
}
