export type PatternFrequencyEntry = {
  text: string;
  totalCount: number;
  chapterIndices: number[];
  lastSeenChapter: number;
  recentCounts: number[];
};

export type PatternFrequencyDB = {
  novelId: string;
  updatedAt: string;
  totalChapters: number;
  totalChars: number;

  ngramFreq: Record<string, PatternFrequencyEntry>;
  expressiveFreq: Record<string, PatternFrequencyEntry>;
  semanticClusterFreq: Record<string, PatternFrequencyEntry>;
  metaphorFreq: Record<string, PatternFrequencyEntry>;
  structureFreq: Record<string, PatternFrequencyEntry>;

  chapterSkeletons: Array<{
    chapter: number;
    openingType: string;
    closingType: string;
    dialogueRatio: number;
    dominantScene: string;
  }>;

  recentEmotionBeats: string[][];
  sceneDistribution: Record<string, number>;
};

export type ExtractedPatterns = {
  ngrams: Map<string, number>;
  expressiveNgrams: Map<string, number>;
  semanticClusters: Map<string, { cluster: string; patterns: string[]; totalCount: number }>;
  metaphors: Map<string, number>;
  structures: Map<string, number>;
  openingType: string;
  closingType: string;
  dialogueRatio: number;
  emotionBeats: string[];
  dominantScene: string;
};

const MIN_NGRAM = 3;
const MAX_NGRAM = 8;
const MIN_FREQ_TO_STORE = 2;
const RECENT_WINDOW = 5;
const MAX_ENTRIES = 5000;
const METAPHOR_PATTERN = /(?:像|如|仿佛|好似|宛如|犹似|恍若|好像)([^，。！？\n]{2,8}?)(?:一样|般|似的|一般|那样)/g;
const STOP_CHARS = new Set(['的', '了', '在', '是', '他', '她', '我', '你', '们', '这', '那', '一', '不', '也', '都', '就', '只', '还', '又', '把', '被', '让', '给', '向', '从', '到', '对', '和', '与', '或', '而', '且', '但', '可', '以', '为', '上', '下', '里', '中', '有', '没', '着', '过', '地', '得', '着', '将', '其', '之', '于', '则', '若', '所', '者', '此', '彼', '些', '么', '吗', '呢', '吧', '啊', '呀', '哦', '嗯']);
const OPENING_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: '环境描写', pattern: /^[^""''「」『』]*?(?:天色|晨光|暮色|阳光|月光|夜色|风|雨|雪|云|雾|空气|光线)/ },
  { type: '动作开头', pattern: /^[^""''「」『』]*?(?:走|跑|跳|站|坐|转|推|拉|抬|放|握|抓|拔|敲|踢)/ },
  { type: '对话开头', pattern: /^[""''「」『』]/ },
  { type: '感官开头', pattern: /^[^""''「」『』]*?(?:听见|听到|闻到|看到|看到|感觉到|嗅到|尝到)/ },
  { type: '叙述开头', pattern: /.*/ },
];
const CLOSING_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: '悬念钩子', pattern: /(?:是谁|什么人|怎么|为何|为什么|究竟|到底|难道)/ },
  { type: '反转钩子', pattern: /(?:却|但|然而|不料|没想到|谁知|岂料|陡然|骤然|突然)/ },
  { type: '危机钩子', pattern: /(?:冲|杀|炸|塌|倒|裂|碎|爆|崩|陷)/ },
  { type: '抉择钩子', pattern: /(?:选|抉择|决定|选择|要不要|是否)/ },
  { type: '叙述收束', pattern: /.*/ },
];

function extractNGrams(text: string, minN: number = MIN_NGRAM, maxN: number = MAX_NGRAM): Map<string, number> {
  const result = new Map<string, number>();
  const cleanText = text.replace(/[\r\n\t\s]+/g, '');

  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i <= cleanText.length - n; i++) {
      const gram = cleanText.slice(i, i + n);

      if (/[，。！？!?；;：:、""''「」『』（）()【】《》\-—…\.\,\s\d]/.test(gram)) continue;

      const cjkCount = (gram.match(/[\u4e00-\u9fff]/g) || []).length;
      if (cjkCount < gram.length * 0.7) continue;

      if (STOP_CHARS.has(gram[0]) && STOP_CHARS.has(gram[gram.length - 1])) continue;

      result.set(gram, (result.get(gram) || 0) + 1);
    }
  }

  const filtered = new Map<string, number>();
  for (const [k, v] of result) {
    if (v >= 1) filtered.set(k, v);
  }
  return filtered;
}

import { isExpressivePhrase, isContentWord } from './content-word-filter.js';
import { clusterPatterns } from './pattern-semantic-cluster.js';
import { getDominantScene } from './scene-classifier.js';

function filterExpressiveNgrams(ngrams: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [k, v] of ngrams) {
    if (isContentWord(k)) continue;
    if (!isExpressivePhrase(k)) continue;
    result.set(k, v);
  }
  return result;
}

function extractMetaphors(text: string): Map<string, number> {
  const result = new Map<string, number>();
  let match: RegExpExecArray | null;

  METAPHOR_PATTERN.lastIndex = 0;
  while ((match = METAPHOR_PATTERN.exec(text)) !== null) {
    const imagery = match[1].trim();
    if (imagery.length >= 2 && imagery.length <= 8) {
      result.set(imagery, (result.get(imagery) || 0) + 1);
    }
  }

  return result;
}

function extractStructures(text: string): Map<string, number> {
  const result = new Map<string, number>();
  const sentences = text.match(/[^。！？!?]+[。！？!?]?/g) || [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 4 || trimmed.length > 50) continue;

    let skeleton = trimmed
      .replace(/"[^"]*"/g, '「D」')
      .replace(/'[^']*'/g, '「D」')
      .replace(/「[^」]*」/g, '「D」')
      .replace(/『[^』]*』/g, '「D」')
      .replace(/[\u4e00-\u9fff]{2,4}(?=说|道|问|答|喊|叫)/g, '「S」')
      .replace(/[\u4e00-\u9fff]{2,4}(?=了|着|过)/g, '「S」')
      .replace(/\d+/g, '「N」')
      .replace(/[\u4e00-\u9fff]{2,3}(?=来|去|起|下|上|出|进|回|到)/g, '「V」');

    if (skeleton.length >= 4 && skeleton.length <= 30) {
      result.set(skeleton, (result.get(skeleton) || 0) + 1);
    }
  }

  return result;
}

function inferOpeningType(content: string): string {
  const firstLine = content.trim().split('\n')[0]?.trim() || '';
  for (const { type, pattern } of OPENING_PATTERNS) {
    if (pattern.test(firstLine)) return type;
  }
  return '叙述开头';
}

function inferClosingType(content: string): string {
  const lines = content.trim().split('\n').filter(l => l.trim());
  const lastLine = lines[lines.length - 1]?.trim() || '';
  for (const { type, pattern } of CLOSING_PATTERNS) {
    if (pattern.test(lastLine)) return type;
  }
  return '叙述收束';
}

function calcDialogueRatio(content: string): number {
  const dialogueChars = (content.match(/[""''「」『』]/g) || []).length;
  const totalChars = content.length || 1;
  return Math.min(1, dialogueChars / 2 / Math.max(100, totalChars * 0.3));
}

function extractEmotionBeats(content: string): string[] {
  const beats: string[] = [];
  const patterns = [
    /沉默了[一二三四五六七八九十两\d]+?(?:息|秒|刻|瞬|下|会儿)/g,
    /没有(?:说话|回答|开口|出声|动作)/g,
    /(?:深吸|吸了|吐出)一口气/g,
    /(?:眉头|眉心)(?:皱|拧|蹙|舒展)/g,
    /(?:嘴角|唇角)(?:上扬|下撇|抿|勾|扯)/g,
    /(?:眼神|目光|眼底)(?:闪过|掠过|变|冷|沉|暗|亮)/g,
    /(?:心头|心中|心里|胸口)(?:一紧|一沉|一颤|一跳|一凛|一凉)/g,
  ];

  for (const p of patterns) {
    const matches = content.match(p);
    if (matches) {
      beats.push(...matches);
    }
  }

  return beats;
}

export function extractPatterns(content: string): ExtractedPatterns {
  const ngrams = extractNGrams(content);
  const expressiveNgrams = filterExpressiveNgrams(ngrams);
  const semanticClusters = clusterPatterns(expressiveNgrams);
  return {
    ngrams,
    expressiveNgrams,
    semanticClusters,
    metaphors: extractMetaphors(content),
    structures: extractStructures(content),
    openingType: inferOpeningType(content),
    closingType: inferClosingType(content),
    dialogueRatio: calcDialogueRatio(content),
    emotionBeats: extractEmotionBeats(content),
    dominantScene: getDominantScene(content),
  };
}

export function createEmptyDB(novelId: string): PatternFrequencyDB {
  return {
    novelId,
    updatedAt: new Date().toISOString(),
    totalChapters: 0,
    totalChars: 0,
    ngramFreq: {},
    expressiveFreq: {},
    semanticClusterFreq: {},
    metaphorFreq: {},
    structureFreq: {},
    chapterSkeletons: [],
    recentEmotionBeats: [],
    sceneDistribution: {},
  };
}

function mergeIntoFreq(
  target: Record<string, PatternFrequencyEntry>,
  extracted: Map<string, number>,
  chapterIndex: number,
): void {
  for (const [text, count] of extracted) {
    if (count < 1) continue;
    const existing = target[text];
    if (existing) {
      existing.totalCount += count;
      existing.chapterIndices.push(chapterIndex);
      existing.lastSeenChapter = Math.max(existing.lastSeenChapter, chapterIndex);
      existing.recentCounts.push(count);
      if (existing.recentCounts.length > RECENT_WINDOW) {
        existing.recentCounts.shift();
      }
    } else {
      target[text] = {
        text,
        totalCount: count,
        chapterIndices: [chapterIndex],
        lastSeenChapter: chapterIndex,
        recentCounts: [count],
      };
    }
  }
}

function pruneLowFreq(db: PatternFrequencyDB): void {
  const prune = (freq: Record<string, PatternFrequencyEntry>) => {
    const entries = Object.entries(freq);
    if (entries.length <= MAX_ENTRIES) {
      for (const [key, entry] of entries) {
        if (entry.totalCount < MIN_FREQ_TO_STORE) {
          delete freq[key];
        }
      }
      return;
    }

    const sorted = entries.sort((a, b) => b[1].totalCount - a[1].totalCount);
    const keepCount = Math.floor(MAX_ENTRIES * 0.8);
    for (let i = keepCount; i < sorted.length; i++) {
      delete freq[sorted[i][0]];
    }
    for (const [key, entry] of Object.entries(freq)) {
      if (entry.totalCount < MIN_FREQ_TO_STORE) delete freq[key];
    }
  };

  prune(db.ngramFreq);
  prune(db.expressiveFreq);
  prune(db.semanticClusterFreq);
  prune(db.metaphorFreq);
  prune(db.structureFreq);
}

export function updatePatternDB(
  db: PatternFrequencyDB,
  chapterIndex: number,
  content: string,
): PatternFrequencyDB {
  const patterns = extractPatterns(content);

  mergeIntoFreq(db.ngramFreq, patterns.ngrams, chapterIndex);
  mergeIntoFreq(db.expressiveFreq, patterns.expressiveNgrams, chapterIndex);

  const clusterFreqMap = new Map<string, number>();
  for (const [, cluster] of patterns.semanticClusters) {
    clusterFreqMap.set(cluster.cluster, (clusterFreqMap.get(cluster.cluster) || 0) + cluster.totalCount);
  }
  mergeIntoFreq(db.semanticClusterFreq, clusterFreqMap, chapterIndex);

  mergeIntoFreq(db.metaphorFreq, patterns.metaphors, chapterIndex);
  mergeIntoFreq(db.structureFreq, patterns.structures, chapterIndex);

  db.chapterSkeletons.push({
    chapter: chapterIndex,
    openingType: patterns.openingType,
    closingType: patterns.closingType,
    dialogueRatio: patterns.dialogueRatio,
    dominantScene: patterns.dominantScene,
  });

  if (db.chapterSkeletons.length > RECENT_WINDOW * 2) {
    db.chapterSkeletons = db.chapterSkeletons.slice(-RECENT_WINDOW * 2);
  }

  db.recentEmotionBeats.push(patterns.emotionBeats);
  if (db.recentEmotionBeats.length > RECENT_WINDOW) {
    db.recentEmotionBeats.shift();
  }

  db.sceneDistribution[patterns.dominantScene] = (db.sceneDistribution[patterns.dominantScene] || 0) + 1;

  db.totalChapters += 1;
  db.totalChars += content.length;
  db.updatedAt = new Date().toISOString();

  pruneLowFreq(db);
  return db;
}
