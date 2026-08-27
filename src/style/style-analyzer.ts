import type {
  SentenceLengthDistribution,
  ParagraphStructure,
  DialogueProfile,
  RhetoricProfile,
  VocabularyProfile,
  ToneProfile,
} from './style-types.js';

export type StyleAnalysisResult = {
  sentenceLength: SentenceLengthDistribution;
  paragraphStructure: ParagraphStructure;
  dialogue: DialogueProfile;
  rhetoric: RhetoricProfile;
  vocabulary: VocabularyProfile;
  tone: ToneProfile;
};

// ==================== Helpers ====================

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[], avg: number): number {
  if (arr.length === 0) return 0;
  const variance = arr.reduce((sum, v) => sum + (v - avg) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function per1000(count: number, totalChars: number): number {
  if (totalChars === 0) return 0;
  return Math.round((count / totalChars) * 1000 * 100) / 100;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Strip dialogue content from text, returning narration only */
function stripDialogue(text: string): string {
  return scanDialogues(text).narration;
}

/** Extract all dialogue strings */
function extractDialogues(text: string): string[] {
  return scanDialogues(text).dialogues;
}

function scanDialogues(text: string): { narration: string; dialogues: string[] } {
  const dialogues: string[] = [];
  let narration = '';
  let cursor = 0;
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    if (char !== '\u201c' && char !== '\u300c') {
      index += 1;
      continue;
    }
    let closing = index + 1;
    while (closing < text.length && text[closing] !== '\u201d' && text[closing] !== '\u300d') closing += 1;
    if (closing >= text.length) break;
    narration += text.slice(cursor, index);
    const dialogue = text.slice(index + 1, closing);
    if (dialogue) dialogues.push(dialogue);
    cursor = closing + 1;
    index = closing + 1;
  }
  narration += text.slice(cursor);
  return { narration, dialogues };
}
// ==================== Sentence Length ====================

function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?\n]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function analyzeSentenceLength(text: string): SentenceLengthDistribution {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return { short: 0, medium: 0, long: 0, veryLong: 0, avgLength: 0, stdDev: 0 };
  }
  const lengths = sentences.map(s => s.length);
  let short = 0, med = 0, long = 0, vLong = 0;
  for (const len of lengths) {
    if (len <= 10) short++;
    else if (len <= 30) med++;
    else if (len <= 60) long++;
    else vLong++;
  }
  const total = lengths.length;
  const avg = mean(lengths);
  return {
    short: Math.round((short / total) * 1000) / 1000,
    medium: Math.round((med / total) * 1000) / 1000,
    long: Math.round((long / total) * 1000) / 1000,
    veryLong: Math.round((vLong / total) * 1000) / 1000,
    avgLength: Math.round(avg * 100) / 100,
    stdDev: Math.round(stdDev(lengths, avg) * 100) / 100,
  };
}

// ==================== Paragraph Structure ====================

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

function analyzeParagraphStructure(text: string): ParagraphStructure {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) {
    return { avgSentencesPerParagraph: 0, avgParagraphLength: 0, shortParagraphRatio: 0, longParagraphRatio: 0 };
  }
  const sentenceCounts = paragraphs.map(p => splitSentences(p).length);
  const paraLengths = paragraphs.map(p => p.length);
  const avgLen = mean(paraLengths);
  const shortCount = paraLengths.filter(l => l < 50).length;
  const longCount = paraLengths.filter(l => l > 200).length;
  return {
    avgSentencesPerParagraph: Math.round(mean(sentenceCounts) * 100) / 100,
    avgParagraphLength: Math.round(avgLen * 100) / 100,
    shortParagraphRatio: Math.round((shortCount / paragraphs.length) * 1000) / 1000,
    longParagraphRatio: Math.round((longCount / paragraphs.length) * 1000) / 1000,
  };
}
// ==================== Dialogue ====================

function analyzeDialogue(text: string): DialogueProfile {
  const totalChars = text.length;
  if (totalChars === 0) {
    return { dialogueRatio: 0, narrationRatio: 1, avgDialogueLength: 0, dialogueDensityPerParagraph: 0 };
  }
  const dialogues = extractDialogues(text);
  const dialogueChars = dialogues.reduce((sum, d) => sum + d.length, 0);
  const paragraphs = splitParagraphs(text);
  const parasWithDialogue = paragraphs.filter(p => /[\u201c\u300c]/.test(p)).length;
  const ratio = clamp01(dialogueChars / totalChars);
  return {
    dialogueRatio: Math.round(ratio * 1000) / 1000,
    narrationRatio: Math.round((1 - ratio) * 1000) / 1000,
    avgDialogueLength: dialogues.length > 0 ? Math.round(mean(dialogues.map(d => d.length)) * 100) / 100 : 0,
    dialogueDensityPerParagraph: paragraphs.length > 0
      ? Math.round((parasWithDialogue / paragraphs.length) * 1000) / 1000
      : 0,
  };
}

// ==================== Rhetoric ====================

function analyzeRhetoric(text: string): RhetoricProfile {
  const totalChars = text.length;
  const narration = stripDialogue(text);

  // Simile: 像...一样, 如同...般, 仿佛, 好似, 宛如, 犹如
  const simileCount = (narration.match(/像[^。！？\n]{1,20}一样|如同[^。！？\n]{1,20}般|仿佛|好似|宛如|犹如/g) || []).length;

  // Metaphor: 化作, 变成了, 是...的化身, 成为了
  const metaphorCount = (narration.match(/化作|变成了|的化身|成为了/g) || []).length;

  // Parallelism: 3+ consecutive sentences of similar length (within 30% of each other)
  const sentences = splitSentences(narration);
  let parallelismCount = 0;
  for (let i = 0; i < sentences.length - 2; i++) {
    const a = sentences[i].length, b = sentences[i + 1].length, c = sentences[i + 2].length;
    const avg3 = (a + b + c) / 3;
    if (avg3 > 0 && Math.abs(a - avg3) / avg3 < 0.3 && Math.abs(b - avg3) / avg3 < 0.3 && Math.abs(c - avg3) / avg3 < 0.3) {
      parallelismCount++;
    }
  }

  // Rhetorical questions: ？ in narration (outside dialogue)
  const rhetoricQCount = (narration.match(/？/g) || []).length;

  // Exclamation
  const exclamationCount = (narration.match(/！/g) || []).length;

  // Ellipsis: ……  or ...
  const ellipsisCount = (text.match(/……|\.{3,}/g) || []).length;

  return {
    simileFrequency: per1000(simileCount, totalChars),
    metaphorFrequency: per1000(metaphorCount, totalChars),
    parallelismFrequency: per1000(parallelismCount, totalChars),
    rhetoricQuestionFrequency: per1000(rhetoricQCount, totalChars),
    exclamationFrequency: per1000(exclamationCount, totalChars),
    ellipsisFrequency: per1000(ellipsisCount, totalChars),
  };
}
// ==================== Vocabulary ====================

const CLASSICAL_PARTICLES = new Set('之乎者也矣焉哉兮');

function analyzeVocabulary(text: string): VocabularyProfile {
  const chars = [...text].filter(c => /[\u4e00-\u9fff]/.test(c));
  const totalChars = chars.length;
  if (totalChars === 0) {
    return { uniqueWordRatio: 0, topBigrams: [], favoredAdjectives: [], favoredVerbs: [], classicalChineseRatio: 0 };
  }

  // Type-token ratio (unique chars / total chars)
  const uniqueChars = new Set(chars);
  const uniqueWordRatio = Math.round((uniqueChars.size / totalChars) * 1000) / 1000;

  // Bigram analysis
  const bigramMap = new Map<string, number>();
  for (let i = 0; i < chars.length - 1; i++) {
    const bigram = chars[i] + chars[i + 1];
    bigramMap.set(bigram, (bigramMap.get(bigram) || 0) + 1);
  }
  const topBigrams = [...bigramMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([bigram, count]) => ({ bigram, count }));

  // Adjective patterns: X的 (look back for 2-char adjective before 的)
  const adjMap = new Map<string, number>();
  const adjRe = /([\u4e00-\u9fff]{1,2})\u7684/g;
  let m: RegExpExecArray | null;
  while ((m = adjRe.exec(text)) !== null) {
    const adj = m[1];
    adjMap.set(adj, (adjMap.get(adj) || 0) + 1);
  }
  const favoredAdjectives = [...adjMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);

  // Verb patterns: X了/着/过
  const verbMap = new Map<string, number>();
  const verbRe = /([\u4e00-\u9fff]{1,2})[\u4e86\u7740\u8fc7]/g;
  while ((m = verbRe.exec(text)) !== null) {
    const verb = m[1];
    verbMap.set(verb, (verbMap.get(verb) || 0) + 1);
  }
  const favoredVerbs = [...verbMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);

  // Classical Chinese ratio
  const classicalCount = chars.filter(c => CLASSICAL_PARTICLES.has(c)).length;
  const classicalChineseRatio = Math.round((classicalCount / totalChars) * 10000) / 10000;

  return { uniqueWordRatio, topBigrams, favoredAdjectives, favoredVerbs, classicalChineseRatio };
}
// ==================== Tone ====================

const FORMAL_WORDS = ['然而', '因此', '故而', '遂', '乃', '亦', '尚', '且', '虽然', '尽管', '倘若', '若是'];
const COLLOQUIAL_WORDS = ['但是', '所以', '就', '也', '还', '可是', '不过', '反正', '干嘛', '咋', '啥', '咱'];
const EMOTION_WORDS = ['愤怒', '悲伤', '喜悦', '恐惧', '绝望', '狂喜', '痛苦', '幸福', '焦虑', '激动', '震惊', '心碎'];
const HUMOR_WORDS = ['笑', '哈', '噗', '嘿', '逗', '搞笑', '滑稽', '乐', '嘻', '呵'];
const DARK_WORDS = ['死', '血', '暗', '绝望', '毁灭', '黑暗', '阴影', '恐惧', '杀', '亡', '葬', '腐'];
const NATURE_WORDS = ['风', '云', '月', '花', '雨', '雪', '山', '水', '星', '阳', '霞', '雾', '露', '溪'];
const SENSORY_WORDS = ['香', '甜', '冷', '暖', '柔', '清', '幽', '淡', '浓', '润', '凉', '灼'];

function countOccurrences(text: string, words: string[]): number {
  let count = 0;
  for (const w of words) {
    let idx = -1;
    while ((idx = text.indexOf(w, idx + 1)) !== -1) count++;
  }
  return count;
}

function analyzeTone(text: string): ToneProfile {
  const totalChars = text.length;
  if (totalChars === 0) {
    return { formality: 0.5, emotionIntensity: 0, humorIndex: 0, darknessTendency: 0, lyricalTendency: 0 };
  }

  const formalCount = countOccurrences(text, FORMAL_WORDS);
  const colloquialCount = countOccurrences(text, COLLOQUIAL_WORDS);
  const formalTotal = formalCount + colloquialCount;
  const formality = formalTotal > 0 ? clamp01(formalCount / formalTotal) : 0.5;

  const emotionCount = countOccurrences(text, EMOTION_WORDS);
  const exclamationCount = (text.match(/！/g) || []).length;
  const emotionIntensity = clamp01((per1000(emotionCount + exclamationCount, totalChars)) / 20);

  const humorCount = countOccurrences(text, HUMOR_WORDS);
  const humorIndex = clamp01(per1000(humorCount, totalChars) / 15);

  const darkCount = countOccurrences(text, DARK_WORDS);
  const darknessTendency = clamp01(per1000(darkCount, totalChars) / 15);

  const natureCount = countOccurrences(text, NATURE_WORDS);
  const sensoryCount = countOccurrences(text, SENSORY_WORDS);
  const rhetoric = analyzeRhetoric(text);
  const lyricalRaw = per1000(natureCount + sensoryCount, totalChars) + rhetoric.simileFrequency + rhetoric.metaphorFrequency;
  const lyricalTendency = clamp01(lyricalRaw / 30);

  return {
    formality: Math.round(formality * 1000) / 1000,
    emotionIntensity: Math.round(emotionIntensity * 1000) / 1000,
    humorIndex: Math.round(humorIndex * 1000) / 1000,
    darknessTendency: Math.round(darknessTendency * 1000) / 1000,
    lyricalTendency: Math.round(lyricalTendency * 1000) / 1000,
  };
}

// ==================== Main Entry ====================

export function analyzeText(text: string): StyleAnalysisResult {
  return {
    sentenceLength: analyzeSentenceLength(text),
    paragraphStructure: analyzeParagraphStructure(text),
    dialogue: analyzeDialogue(text),
    rhetoric: analyzeRhetoric(text),
    vocabulary: analyzeVocabulary(text),
    tone: analyzeTone(text),
  };
}
