/**
 * 角色高光提取器
 *
 * 从章节正文提取每个角色的「金句」（标志性台词）与「高光场面」（关键章节片段）。
 * 纯本地提取，无 AI 调用——金句来自角色真正说过的话，质感优于凭空生成。
 *
 * 说话人标记格式见 character-state-snapshot.ts / speaker-extractor.ts：
 *   (#角色名)"台词内容"   （引号兼容中英文）
 */
import type { CharacterProfile, CharacterStateSnapshot } from './types.js';

/** 单句金句（带评分，用于跨章排序取 top） */
export interface CharacterQuote {
  text: string;
  chapter: number;
  score: number;
}

/** 高光场面片段 */
export interface CharacterScene {
  text: string;
  chapter: number;
}

/** 单角色本章提取结果 */
export interface PerCharacterHighlights {
  characterId: string;
  quotes: CharacterQuote[];
  scenes: CharacterScene[];
}

export interface SpeakerQuoteMatch {
  name: string;
  quote: string;
  index: number;
  full: string;
}

/**
 * 收集章节内所有「说话人 + 台词」匹配。
 * 兼容两种标记位置（不同生成时期格式不一致）：
 *   模式 A（标记在前）：(#角色名)"台词"
 *   模式 B（标记在后）："台词"(#角色名)
 * 引号兼容中文 “” 与英文 ""。
 */
export function collectSpeakerQuotes(content: string): SpeakerQuoteMatch[] {
  const results: SpeakerQuoteMatch[] = [];
  // 标记与台词之间用 [^\S\n]*（允许空格、禁止换行），避免跨句把「上一句台词 + 下一句标记」错配
  const reA = /[\(（]\s*#\s*([^()（）\n]+?)\s*[\)）][^\S\n]*["“]([^"”]*)["”]/g;
  const reB = /["“]([^"”]*)["”][^\S\n]*[\(（]\s*#\s*([^()（）\n]+?)\s*[\)）]/g;
  let m: RegExpExecArray | null;
  while ((m = reA.exec(content)) !== null) {
    results.push({ name: m[1], quote: m[2], index: m.index, full: m[0] });
  }
  while ((m = reB.exec(content)) !== null) {
    results.push({ name: m[2], quote: m[1], index: m.index, full: m[0] });
  }
  return results.sort((a, b) => a.index - b.index);
}

/** 决断/立场词（不含纯动作动词，避免工作指令刷分；单字狠话另算） */
const DECISIVE_WORDS = [
  '必须', '别', '不会', '不能', '一定', '滚', '知道',
  '真的', '信', '死', '杀', '永远', '绝不', '凭什么', '不可能',
  '给我', '闭嘴', '够了', '轮不到', '由不得', '我说了算',
];

/** 纯功能应答句（信息量低，需惩罚） */
const FUNCTIONAL_QUOTES = new Set([
  '嗯', '好', '是', '不是', '哦', '啊', '对', '行', '唉', '哈',
  '嗯。', '好。', '是。', '哦。', '啊。', '对。', '行。', '唉。', '哈。',
]);

const MIN_QUOTE_LEN = 2;
const MAX_QUOTE_LEN = 60;
const IDEAL_QUOTE_MIN = 8;
const IDEAL_QUOTE_MAX = 30;
const SCENE_MAX_LEN = 100;

/** 金句评分：综合长度、决断词、关键章节、语气、功能句惩罚 */
function scoreQuote(text: string, isCritical: boolean): number {
  const clean = text.trim().replace(/\s+/g, '');
  const len = clean.length;
  const stripped = clean.replace(/[。！？，,.!?，]/g, '');
  let score = 0;

  // 长度适配
  if (len >= IDEAL_QUOTE_MIN && len <= IDEAL_QUOTE_MAX) {
    score += 5;
  } else if (len >= 4 && len < IDEAL_QUOTE_MIN) {
    score += 2;
  } else if (len > 45) {
    score -= 3;
  } else if (len > 30) {
    score -= 1;
  }

  // 单字/双字狠话（「拍。」「滚。」）：强收尾且非功能句，给基础分让其入选
  if (len <= 3 && /[。！]/.test(clean) && !FUNCTIONAL_QUOTES.has(stripped)) {
    score += 4;
  }

  // 决断/立场词
  for (const w of DECISIVE_WORDS) {
    if (clean.includes(w)) score += 2;
  }

  // 关键章节加成
  if (isCritical) score += 3;

  // 强语气标点
  if (/[！？!?]/.test(clean)) score += 1;

  // 纯功能句惩罚
  if (FUNCTIONAL_QUOTES.has(clean) || FUNCTIONAL_QUOTES.has(stripped)) score -= 6;

  return score;
}

/** 角色名（含别名）→ id 映射，键为规范化名 */
function buildNameToIdMap(characters: CharacterProfile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of characters) {
    const names = [c.name, ...(c.aliases || [])]
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    for (const n of names) {
      const key = normalizeName(n);
      if (key && !map.has(key)) map.set(key, c.id);
    }
  }
  return map;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s　·•]/g, '');
}

/** 从台词标记位置抽取高光场面：台词前的完整叙述句（动作描写）+ 台词本身，不含后续应答 */
function buildScene(
  content: string,
  matchFull: string,
  matchIndex: number,
  quoteText: string,
): string {
  const matchEnd = matchIndex + matchFull.length;
  const SENTENCE_END_RE = /[。！？\n]/;
  const lookBackLimit = Math.max(0, matchIndex - 100);

  // 前向：台词前 100 字内找最近的句子结束符，作为叙述起点（保证句首完整）
  let start = -1;
  for (let i = matchIndex - 1; i >= lookBackLimit; i--) {
    if (SENTENCE_END_RE.test(content[i] ?? '')) {
      start = i + 1;
      break;
    }
  }

  // 100 字内无句子边界 → 场面只用台词，避免句首残缺
  if (start === -1) {
    return quoteText.length > SCENE_MAX_LEN
      ? quoteText.slice(0, SCENE_MAX_LEN) + '…'
      : quoteText;
  }

  // 叙述句 + 台词（到台词结束，不含后续应答）；去说话人标记，保留引号台词
  let segment = content.slice(start, matchEnd);
  segment = segment
    .replace(/[\(（]\s*#\s*[^()（）]+[\)）]\s*/g, '')
    .replace(/\s+/g, '');
  if (segment.length > SCENE_MAX_LEN) segment = segment.slice(0, SCENE_MAX_LEN) + '…';
  return segment;
}

/**
 * 提取一章内每个出场角色的金句候选与高光场面候选。
 *
 * - 金句：每角色本章只保留评分最高的一句（管线层跨章累积后再取 top）。
 * - 高光场面：仅对 isCritical 角色提取，取本章首句高分台词的上下文。
 *
 * 仅处理本章有 snapshot 的角色（presentIds），避免给未登场角色误配台词。
 */
export function extractChapterHighlights(params: {
  chapterContent: string;
  characters: CharacterProfile[];
  snapshots: CharacterStateSnapshot[];
  chapterNumber: number;
}): PerCharacterHighlights[] {
  const { chapterContent, characters, snapshots, chapterNumber } = params;
  if (!chapterContent.trim() || characters.length === 0 || snapshots.length === 0) {
    return [];
  }

  const nameToId = buildNameToIdMap(characters);
  const criticalIds = new Set(
    snapshots.filter((s) => s.isCritical).map((s) => s.characterId),
  );
  const presentIds = new Set(snapshots.map((s) => s.characterId));

  // 每角色记录本章最高分金句及其匹配位置（场面围绕 top 金句，而非首个台词）
  const bestByChar = new Map<string, { quote: CharacterQuote; match: SpeakerQuoteMatch }>();

  const matches = collectSpeakerQuotes(chapterContent);
  for (const match of matches) {
    const rawName = (match.name || '').trim();
    const quoteText = (match.quote || '').trim();
    if (!rawName || !quoteText) continue;

    const id = nameToId.get(normalizeName(rawName));
    if (!id || !presentIds.has(id)) continue;

    const cleanQuote = quoteText.slice(0, MAX_QUOTE_LEN);
    if (cleanQuote.length < MIN_QUOTE_LEN) continue;

    const isCritical = criticalIds.has(id);
    const score = scoreQuote(cleanQuote, isCritical);

    const prev = bestByChar.get(id);
    if (!prev || score > prev.quote.score) {
      bestByChar.set(id, {
        quote: { text: cleanQuote, chapter: chapterNumber, score },
        match,
      });
    }
  }

  // isCritical 角色：围绕其 top 金句取上下文作为高光场面
  const scenesByChar = new Map<string, CharacterScene[]>();
  for (const [id, { quote, match }] of bestByChar) {
    if (!criticalIds.has(id) || quote.score <= 0) continue;
    scenesByChar.set(id, [
      {
        text: buildScene(chapterContent, match.full, match.index, quote.text),
        chapter: chapterNumber,
      },
    ]);
  }

  const result: PerCharacterHighlights[] = [];
  for (const [characterId, { quote }] of bestByChar) {
    // 仅保留正分金句（过滤掉平庸对话）
    const quotes = quote.score > 0 ? [quote] : [];
    const scenes = scenesByChar.get(characterId) ?? [];
    if (quotes.length === 0 && scenes.length === 0) continue;
    result.push({ characterId, quotes, scenes });
  }
  return result;
}
