/**
 * AI 痕迹检测器 — 21 条确定性规则引擎
 *
 * 零 LLM 成本，基于正则/统计分析检测中文小说中的 AI 生成痕迹。
 * 复用 template-patterns.ts 的模式库，扩展段落级和密度级分析。
 */

import { countTemplatePatternHits, type TemplatePatternCategory } from './template-patterns.js';

// ==================== 常量 ====================

/** 每 N 字符作为密度计算基数 */
const DENSITY_BASE_CHARS = 3000;

/** 连续段落阈值 */
const CONSECUTIVE_PARAGRAPH_THRESHOLD = 3;

// ==================== 类型 ====================

export type AiTraceSeverity = 'info' | 'warn' | 'error';

export type AiTraceViolation = {
  ruleId: string;
  ruleName: string;
  severity: AiTraceSeverity;
  /** 该规则的扣分值 (0-100) */
  deduction: number;
  details: string;
  /** 违规所在的段落索引 */
  locations: number[];
};

export type AiTraceReport = {
  /** 总分 0-100，100 = 完全干净 */
  score: number;
  violations: AiTraceViolation[];
  passedRules: number;
  totalRules: number;
  perRuleScores: Record<string, number>;
};

/** 外部注入的类型特定规则（来自 GenreWritingRules） */
export type GenreTraceOverrides = {
  /** 额外禁用短语 */
  prohibitions?: string[];
  /** 疲劳词限制覆盖 */
  fatigueWords?: Array<{ word: string; maxPer3000Chars: number }>;
};

// ==================== 规则词库 ====================

/** 规则 2：标记词 — 默认阈值 */
const DEFAULT_MARKER_WORDS: Array<{ word: string; maxPer3000Chars: number }> = [
  { word: '仿佛', maxPer3000Chars: 1 },
  { word: '忽然', maxPer3000Chars: 1 },
  { word: '竟然', maxPer3000Chars: 1 },
  { word: '不禁', maxPer3000Chars: 1 },
  { word: '渐渐', maxPer3000Chars: 1 },
  { word: '缓缓', maxPer3000Chars: 2 },
  { word: '终于', maxPer3000Chars: 2 },
  { word: '果然', maxPer3000Chars: 1 },
  { word: '连忙', maxPer3000Chars: 1 },
  { word: '赶忙', maxPer3000Chars: 1 },
  { word: '微微', maxPer3000Chars: 2 },
  { word: '默默', maxPer3000Chars: 1 },
  { word: '悄悄', maxPer3000Chars: 1 },
  { word: '静静', maxPer3000Chars: 1 },
];

/** 规则 8：对冲词 */
const HEDGING_WORDS = ['也许', '或许', '大概', '似乎', '仿佛', '好像', '恐怕', '想必'];
const HEDGING_DENSITY_THRESHOLD = 3; // 每 3000 字上限

/** 规则 10：感官词库 */
const VISUAL_WORDS = /(?:看|望|瞥|瞧|盯|注视|凝视|扫视|目光|视线|眼|映入|闪现|浮现)/;
const AUDITORY_WORDS = /(?:听|闻|响|声|喊|叫|吼|嗡|嘶|咆哮|低语|呢喃|轰鸣|回荡)/;
const TACTILE_WORDS = /(?:触|摸|碰|握|捏|抚|冰凉|灼热|刺痛|温暖|粗糙|光滑|颤抖|发麻)/;
const OLFACTORY_WORDS = /(?:闻|嗅|臭|香|腥|腐|芬芳|刺鼻|清新|恶臭|气味|味道)/;
const GUSTATORY_WORDS = /(?:尝|咽|甜|苦|酸|辣|咸|涩|鲜|腻)/;

/** 规则 11：直接情感标签词 */
const EMOTION_LABELS = /(?:开心|高兴|愤怒|悲伤|恐惧|焦虑|紧张|兴奋|失望|绝望|惊讶|惊恐|愉悦|痛苦|无奈|烦躁|厌恶|嫉妒|羞愧|内疚|感动|欣慰)/g;

/** 规则 11：行为描写指示词 */
const BEHAVIORAL_INDICATORS = /(?:攥|握|咬|颤|抖|僵|退|冲|砸|摔|跪|蹲|站|坐|躺|转身|后退|扑上|推开|挡住|抱住)/g;

// ==================== 工具函数 ====================

/** 将文本按段落分割（以换行符为界） */
function splitParagraphs(text: string): string[] {
  return text.split(/\n+/).filter(p => p.trim().length > 0);
}

/** 计算密度：某词在文本中的出现次数 per DENSITY_BASE_CHARS */
function countDensity(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  const count = matches ? matches.length : 0;
  return text.length > 0 ? (count / text.length) * DENSITY_BASE_CHARS : 0;
}

/** 统计正则匹配总数 */
function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

/** 提取段落开头 N 个字作为"句式指纹" */
function extractParagraphPrefix(paragraph: string, prefixLen: number = 4): string {
  const trimmed = paragraph.trim();
  // 跳过对话开头（引号内容变化大，不算雷同）
  if (trimmed.startsWith('"') || trimmed.startsWith('"') || trimmed.startsWith('「')) return '';
  return trimmed.slice(0, prefixLen);
}

// ==================== 11 条规则 ====================

type RuleEvaluator = (text: string, paragraphs: string[], overrides?: GenreTraceOverrides) => AiTraceViolation | null;

/**
 * 规则 1：禁用短语检测
 * 复用 template-patterns ai-structure 类别 + 自定义禁用词
 */
function rule01ForbiddenPhrases(text: string, _p: string[], overrides?: GenreTraceOverrides): AiTraceViolation | null {
  const hits = countTemplatePatternHits(text, ['ai-structure'] as TemplatePatternCategory[]);
  const totalHits = hits.reduce((sum, h) => sum + h.count, 0);

  // 追加类型特定禁用词
  let extraHits = 0;
  if (overrides?.prohibitions) {
    for (const phrase of overrides.prohibitions) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'g');
      extraHits += countMatches(text, re);
    }
  }

  const combined = totalHits + extraHits;
  if (combined === 0) return null;

  const deduction = Math.min(combined * 4, 20);
  const details = hits.map(h => `${h.label}×${h.count}`).join('、');
  return {
    ruleId: 'forbidden-phrases',
    ruleName: '禁用短语',
    severity: combined >= 5 ? 'error' : combined >= 2 ? 'warn' : 'info',
    deduction,
    details: `检测到 ${combined} 处结构性 AI 短语: ${details}${extraHits > 0 ? ` + ${extraHits} 处类型特定禁用词` : ''}`,
    locations: [],
  };
}

/**
 * 规则 2：标记词密度
 * 仿佛/忽然/竟然/不禁 等标记词每 3000 字出现频次
 */
function rule02MarkerWordDensity(text: string, _p: string[], overrides?: GenreTraceOverrides): AiTraceViolation | null {
  const wordList = overrides?.fatigueWords ?? DEFAULT_MARKER_WORDS;
  const violations: string[] = [];
  let totalExcess = 0;

  for (const { word, maxPer3000Chars } of wordList) {
    const re = new RegExp(word, 'g');
    const density = countDensity(text, re);
    if (density > maxPer3000Chars) {
      const excess = density - maxPer3000Chars;
      totalExcess += excess;
      violations.push(`"${word}" ${density.toFixed(1)}次/3k字 (上限${maxPer3000Chars})`);
    }
  }

  if (violations.length === 0) return null;

  const deduction = Math.min(Math.round(totalExcess * 3), 15);
  return {
    ruleId: 'marker-word-density',
    ruleName: '标记词密度',
    severity: totalExcess > 5 ? 'error' : totalExcess > 2 ? 'warn' : 'info',
    deduction,
    details: violations.join('；'),
    locations: [],
  };
}

/**
 * 规则 3：破折号过度使用
 */
function rule03EmDashOveruse(text: string): AiTraceViolation | null {
  const EM_DASH_RE = /——/g;
  const density = countDensity(text, EM_DASH_RE);
  const MAX_DENSITY = 2; // 每 3000 字 2 个

  if (density <= MAX_DENSITY) return null;

  const excess = density - MAX_DENSITY;
  const deduction = Math.min(Math.round(excess * 3), 10);
  return {
    ruleId: 'em-dash-overuse',
    ruleName: '破折号过度',
    severity: excess > 4 ? 'error' : 'warn',
    deduction,
    details: `破折号(——)密度 ${density.toFixed(1)}次/3k字 (上限${MAX_DENSITY})`,
    locations: [],
  };
}

/**
 * 规则 4：段首雷同
 * 检测连续 3+ 段落以相同句式开头
 */
function rule04ParagraphPrefixRepetition(_text: string, paragraphs: string[]): AiTraceViolation | null {
  const prefixes = paragraphs.map(p => extractParagraphPrefix(p));
  const violations: number[] = [];
  let maxConsecutive = 1;
  let currentRun = 1;

  for (let i = 1; i < prefixes.length; i++) {
    if (prefixes[i] && prefixes[i] === prefixes[i - 1]) {
      currentRun++;
      if (currentRun >= CONSECUTIVE_PARAGRAPH_THRESHOLD) {
        violations.push(i);
        maxConsecutive = Math.max(maxConsecutive, currentRun);
      }
    } else {
      currentRun = 1;
    }
  }

  if (violations.length === 0) return null;

  const deduction = Math.min(violations.length * 3, 12);
  return {
    ruleId: 'paragraph-prefix-repetition',
    ruleName: '段首雷同',
    severity: maxConsecutive >= 5 ? 'error' : 'warn',
    deduction,
    details: `${violations.length} 处连续 ${maxConsecutive}+ 段使用相同开头句式`,
    locations: violations,
  };
}

/**
 * 规则 5：套话密度
 * 复用 cliche 类别，归一化到每千字
 */
function rule05ClicheDensity(text: string): AiTraceViolation | null {
  const hits = countTemplatePatternHits(text, ['cliche'] as TemplatePatternCategory[]);
  const totalHits = hits.reduce((sum, h) => sum + h.count, 0);
  const densityPer1k = text.length > 0 ? (totalHits / text.length) * 1000 : 0;
  const CLICHE_THRESHOLD = 2; // 每千字 2 个

  if (densityPer1k <= CLICHE_THRESHOLD) return null;

  const excess = densityPer1k - CLICHE_THRESHOLD;
  const deduction = Math.min(Math.round(excess * 4), 15);
  return {
    ruleId: 'cliche-density',
    ruleName: '套话密度',
    severity: excess > 3 ? 'error' : 'warn',
    deduction,
    details: `套话密度 ${densityPer1k.toFixed(1)}/千字 (上限${CLICHE_THRESHOLD})：${hits.slice(0, 5).map(h => `${h.label}×${h.count}`).join('、')}`,
    locations: [],
  };
}

/**
 * 规则 6：元叙事检测
 * AI/作者/写作元语言泄露，零容忍
 */
function rule06MetaNarrative(text: string): AiTraceViolation | null {
  const hits = countTemplatePatternHits(text, ['ai-meta'] as TemplatePatternCategory[]);
  const totalHits = hits.reduce((sum, h) => sum + h.count, 0);

  if (totalHits === 0) return null;

  const deduction = Math.min(totalHits * 8, 25);
  return {
    ruleId: 'meta-narrative',
    ruleName: '元叙事泄露',
    severity: 'error',
    deduction,
    details: `检测到 ${totalHits} 处元叙事/AI身份泄露：${hits.map(h => `${h.label}×${h.count}`).join('、')}`,
    locations: [],
  };
}

/**
 * 规则 7：微动作聚集
 * 单段落 ai-tell 类命中不超过 2 个
 */
function rule07MicroActionClustering(_text: string, paragraphs: string[]): AiTraceViolation | null {
  const MAX_PER_PARAGRAPH = 2;
  const violations: number[] = [];
  let worstCount = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const hits = countTemplatePatternHits(paragraphs[i], ['ai-tell'] as TemplatePatternCategory[]);
    const total = hits.reduce((sum, h) => sum + h.count, 0);
    if (total > MAX_PER_PARAGRAPH) {
      violations.push(i);
      worstCount = Math.max(worstCount, total);
    }
  }

  if (violations.length === 0) return null;

  const deduction = Math.min(violations.length * 3, 15);
  return {
    ruleId: 'micro-action-clustering',
    ruleName: '微动作聚集',
    severity: violations.length >= 5 ? 'error' : 'warn',
    deduction,
    details: `${violations.length} 个段落含 ${MAX_PER_PARAGRAPH}+ 个 AI 微动作模板 (最多${worstCount}个)`,
    locations: violations,
  };
}

/**
 * 规则 8：过度对冲
 * 也许/或许/大概/似乎等对冲词密度检测
 */
function rule08ExcessiveHedging(text: string): AiTraceViolation | null {
  let totalCount = 0;
  const wordCounts: string[] = [];

  for (const word of HEDGING_WORDS) {
    const re = new RegExp(word, 'g');
    const count = countMatches(text, re);
    if (count > 0) {
      totalCount += count;
      wordCounts.push(`${word}×${count}`);
    }
  }

  const densityPer3k = text.length > 0 ? (totalCount / text.length) * DENSITY_BASE_CHARS : 0;
  if (densityPer3k <= HEDGING_DENSITY_THRESHOLD) return null;

  const excess = densityPer3k - HEDGING_DENSITY_THRESHOLD;
  const deduction = Math.min(Math.round(excess * 3), 10);
  return {
    ruleId: 'excessive-hedging',
    ruleName: '过度对冲',
    severity: excess > 4 ? 'error' : 'warn',
    deduction,
    details: `对冲词密度 ${densityPer3k.toFixed(1)}/3k字 (上限${HEDGING_DENSITY_THRESHOLD})：${wordCounts.join('、')}`,
    locations: [],
  };
}

/**
 * 规则 9：排比句过度使用
 * 3+ 连续句子以相同前缀/结构开头
 */
function rule09ParallelStructureRepetition(_text: string, paragraphs: string[]): AiTraceViolation | null {
  const violations: number[] = [];
  let maxRun = 0;
  const PREFIX_LEN = 2;

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const sentences = paragraphs[pi].split(/[。！？；]/).filter(s => s.trim().length > 0);
    if (sentences.length < CONSECUTIVE_PARAGRAPH_THRESHOLD) continue;

    let run = 1;
    for (let si = 1; si < sentences.length; si++) {
      const prevPrefix = sentences[si - 1].trim().slice(0, PREFIX_LEN);
      const currPrefix = sentences[si].trim().slice(0, PREFIX_LEN);
      if (prevPrefix && prevPrefix === currPrefix) {
        run++;
        if (run >= CONSECUTIVE_PARAGRAPH_THRESHOLD) {
          violations.push(pi);
          maxRun = Math.max(maxRun, run);
        }
      } else {
        run = 1;
      }
    }
  }

  // 去重段落索引
  const uniqueViolations = [...new Set(violations)];
  if (uniqueViolations.length === 0) return null;

  const deduction = Math.min(uniqueViolations.length * 3, 10);
  return {
    ruleId: 'parallel-structure-repetition',
    ruleName: '排比句过度',
    severity: maxRun >= 5 ? 'error' : 'warn',
    deduction,
    details: `${uniqueViolations.length} 个段落含连续 ${maxRun}+ 个相同前缀句子`,
    locations: uniqueViolations,
  };
}

/**
 * 规则 10：感官描写单调
 * 连续 3+ 段仅使用视觉描写（无听觉/触觉/嗅觉/味觉）
 */
function rule10SensoryMonotony(_text: string, paragraphs: string[]): AiTraceViolation | null {
  const violations: number[] = [];
  let maxRun = 0;
  let currentRun = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    // 跳过对话主导段落（对话不需要感官描写）
    const dialogueRatio = (p.match(/[""\u201C\u201D「」]/g)?.length ?? 0) / Math.max(1, p.length);
    if (dialogueRatio > 0.02) {
      currentRun = 0;
      continue;
    }

    const hasVisual = VISUAL_WORDS.test(p);
    const hasAuditory = AUDITORY_WORDS.test(p);
    const hasTactile = TACTILE_WORDS.test(p);
    const hasOlfactory = OLFACTORY_WORDS.test(p);
    const hasGustatory = GUSTATORY_WORDS.test(p);

    const nonVisualSenses = [hasAuditory, hasTactile, hasOlfactory, hasGustatory].filter(Boolean).length;

    if (hasVisual && nonVisualSenses === 0 && p.length >= 50) {
      currentRun++;
      if (currentRun >= CONSECUTIVE_PARAGRAPH_THRESHOLD) {
        violations.push(i);
        maxRun = Math.max(maxRun, currentRun);
      }
    } else {
      currentRun = 0;
    }
  }

  if (violations.length === 0) return null;

  const deduction = Math.min(violations.length * 2, 8);
  return {
    ruleId: 'sensory-monotony',
    ruleName: '感官单调',
    severity: maxRun >= 6 ? 'error' : 'warn',
    deduction,
    details: `${violations.length} 处连续 ${CONSECUTIVE_PARAGRAPH_THRESHOLD}+ 段仅用视觉描写，缺少听/触/嗅/味觉`,
    locations: violations,
  };
}

/**
 * 规则 11：情感告知比
 * 直接标签情感 vs 行为描写的比例
 */
function rule11EmotionTellShowRatio(text: string): AiTraceViolation | null {
  const emotionLabelCount = countMatches(text, EMOTION_LABELS);
  const behavioralCount = countMatches(text, BEHAVIORAL_INDICATORS);

  if (emotionLabelCount === 0) return null;

  const total = emotionLabelCount + behavioralCount;
  const tellRatio = emotionLabelCount / total;
  const TELL_RATIO_THRESHOLD = 0.6; // 60% 以上为"告知过多"

  if (tellRatio <= TELL_RATIO_THRESHOLD) return null;

  const excess = tellRatio - TELL_RATIO_THRESHOLD;
  const deduction = Math.min(Math.round(excess * 25), 10);
  return {
    ruleId: 'emotion-tell-show-ratio',
    ruleName: '情感告知比',
    severity: tellRatio > 0.8 ? 'error' : 'warn',
    deduction,
    details: `情感表达中 ${Math.round(tellRatio * 100)}% 是直接标签（上限 ${Math.round(TELL_RATIO_THRESHOLD * 100)}%）：标签词${emotionLabelCount}次 vs 行为描写${behavioralCount}次`,
    locations: [],
  };
}

/**
 * 规则 12：Markdown 格式残留
 * 小说正文中不应出现任何 Markdown 语法标记
 */
function rule12MarkdownFormatting(text: string): AiTraceViolation | null {
  const hits = countTemplatePatternHits(text, ['ai-formatting'] as TemplatePatternCategory[]);
  const totalHits = hits.reduce((sum, h) => sum + h.count, 0);

  if (totalHits === 0) return null;

  const deduction = Math.min(totalHits * 5, 20);
  return {
    ruleId: 'markdown-formatting',
    ruleName: 'Markdown 格式残留',
    severity: totalHits >= 5 ? 'error' : totalHits >= 2 ? 'warn' : 'info',
    deduction,
    details: `检测到 ${totalHits} 处 Markdown 格式标记：${hits.map(h => `${h.label}×${h.count}`).join('、')}`,
    locations: [],
  };
}

/**
 * 规则 13：过渡连接词段首堆砌
 * AI 检测工具的核心特征之一：然而/此外/与此同时 等词在段首密集出现
 */
function rule13ConnectorDensity(text: string): AiTraceViolation | null {
  const hits = countTemplatePatternHits(text, ['ai-connector'] as TemplatePatternCategory[]);
  const totalHits = hits.reduce((sum, h) => sum + h.count, 0);
  const densityPer3k = text.length > 0 ? (totalHits / text.length) * DENSITY_BASE_CHARS : 0;
  const CONNECTOR_THRESHOLD = 2; // 每 3000 字段首过渡词上限

  if (densityPer3k <= CONNECTOR_THRESHOLD) return null;

  const excess = densityPer3k - CONNECTOR_THRESHOLD;
  const deduction = Math.min(Math.round(excess * 4), 15);
  return {
    ruleId: 'connector-density',
    ruleName: '过渡词段首堆砌',
    severity: excess > 3 ? 'error' : 'warn',
    deduction,
    details: `段首过渡连接词密度 ${densityPer3k.toFixed(1)}/3k字 (上限${CONNECTOR_THRESHOLD})：${hits.slice(0, 5).map(h => `${h.label}×${h.count}`).join('、')}`,
    locations: [],
  };
}

/** 规则 14 常量：中文句子分割（句号/问号/叹号/分号作为句边界） */
const SENTENCE_SPLIT_RE = /[。！？；\n]+/;
/** 规则 14 常量：最小句子长度（过短片段不计入统计） */
const MIN_SENTENCE_LEN = 4;
/** 规则 14 常量：句长标准差阈值（低于此值 = 过度均匀） */
const SENTENCE_LEN_STD_DEV_THRESHOLD = 6;
/** 规则 14 常量：最少句子数（太少句子不具备统计意义） */
const MIN_SENTENCES_FOR_UNIFORMITY = 15;

/**
 * 规则 14：句长均匀度
 * AI 生成文本句子长度标准差极小（burstiness 低），是 GPTZero 等工具的核心检测指标
 */
function rule14SentenceLengthUniformity(text: string): AiTraceViolation | null {
  const sentences = text.split(SENTENCE_SPLIT_RE)
    .map(s => s.replace(/[\s""\u201C\u201D「」（）()#]/g, '').trim())
    .filter(s => s.length >= MIN_SENTENCE_LEN);

  if (sentences.length < MIN_SENTENCES_FOR_UNIFORMITY) return null;

  const lengths = sentences.map(s => s.length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, len) => sum + (len - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev >= SENTENCE_LEN_STD_DEV_THRESHOLD) return null;

  const deficit = SENTENCE_LEN_STD_DEV_THRESHOLD - stdDev;
  const deduction = Math.min(Math.round(deficit * 2), 12);
  return {
    ruleId: 'sentence-length-uniformity',
    ruleName: '句长过度均匀',
    severity: stdDev < 3 ? 'error' : 'warn',
    deduction,
    details: `句子长度标准差 ${stdDev.toFixed(1)} (阈值≥${SENTENCE_LEN_STD_DEV_THRESHOLD})，均值 ${mean.toFixed(0)} 字/句，共 ${sentences.length} 句。句长过于一致是 AI 生成的典型特征`,
    locations: [],
  };
}

/** 规则 15 常量：括号动作标签模式 */
const GESTURE_TAG_RE = /[（(][^()（）\n]{1,8}[）)]\s*[""\u201C]/g;

/**
 * 规则 15：括号动作标签
 * 检测 （冷笑）"……" / (压低声音)"……" 等 AI 特有的戏剧指示写法
 */
function rule15GestureTagDialogue(text: string): AiTraceViolation | null {
  const count = countMatches(text, GESTURE_TAG_RE);

  if (count === 0) return null;

  const deduction = Math.min(count * 4, 15);
  return {
    ruleId: 'gesture-tag-dialogue',
    ruleName: '括号动作标签',
    severity: count >= 5 ? 'error' : count >= 2 ? 'warn' : 'info',
    deduction,
    details: `检测到 ${count} 处括号动作标签+对话 (如 "（冷笑）'…'"），应改写为叙述性描写`,
    locations: [],
  };
}

/** 规则 16 常量：段长标准差阈值 */
const PARAGRAPH_LEN_STD_DEV_THRESHOLD = 30;
/** 规则 16 常量：最少段落数 */
const MIN_PARAGRAPHS_FOR_UNIFORMITY = 8;

/**
 * 规则 16：段长均匀度
 * AI 段落长度高度一致，缺少单句段和长描写段的节奏交替
 */
function rule16ParagraphLengthUniformity(_text: string, paragraphs: string[]): AiTraceViolation | null {
  if (paragraphs.length < MIN_PARAGRAPHS_FOR_UNIFORMITY) return null;

  const lengths = paragraphs.map(p => p.replace(/\s/g, '').length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((sum, len) => sum + (len - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev >= PARAGRAPH_LEN_STD_DEV_THRESHOLD) return null;

  const deficit = PARAGRAPH_LEN_STD_DEV_THRESHOLD - stdDev;
  const deduction = Math.min(Math.round(deficit * 0.4), 10);
  return {
    ruleId: 'paragraph-length-uniformity',
    ruleName: '段长过度均匀',
    severity: stdDev < 15 ? 'error' : 'warn',
    deduction,
    details: `段落长度标准差 ${stdDev.toFixed(1)} (阈值≥${PARAGRAPH_LEN_STD_DEV_THRESHOLD})，均值 ${mean.toFixed(0)} 字/段，共 ${paragraphs.length} 段。应穿插短段（单句段制造节奏感）和长段`,
    locations: [],
  };
}

/** 规则 17 常量：弱修饰词模式 */
const WEAK_MODIFIER_RE = /(?:很|非常|十分|极其|特别|无比|格外|相当|颇为)(?:开心|高兴|愤怒|伤心|悲伤|难过|害怕|恐惧|紧张|焦虑|兴奋|失望|痛苦|惊讶|意外|感动|无奈|烦躁)/g;

/**
 * 规则 17：弱修饰词堆叠
 * "很伤心"、"非常愤怒" 等 很/非常+情感形容词 是最初级的 "告知不展示"
 */
function rule17WeakModifiers(text: string): AiTraceViolation | null {
  const count = countMatches(text, WEAK_MODIFIER_RE);

  if (count === 0) return null;

  const densityPer3k = text.length > 0 ? (count / text.length) * DENSITY_BASE_CHARS : 0;
  const deduction = Math.min(count * 3, 10);
  return {
    ruleId: 'weak-modifiers',
    ruleName: '弱修饰词堆叠',
    severity: count >= 5 ? 'error' : count >= 2 ? 'warn' : 'info',
    deduction,
    details: `检测到 ${count} 处"程度副词+情感形容词"直接告知 (密度 ${densityPer3k.toFixed(1)}/3k字)，应改用行为/细节展示情感`,
    locations: [],
  };
}

/** 规则 18：省略号过度使用 */
const ELLIPSIS_RE = /……/g;
const ELLIPSIS_DENSITY_THRESHOLD = 3; // 每 3000 字上限

/**
 * 规则 18：省略号过度使用
 * AI 文本频繁使用"……"来表达犹豫/停顿/省略，密度远高于人类写作
 */
function rule18EllipsisOveruse(text: string): AiTraceViolation | null {
  const density = countDensity(text, ELLIPSIS_RE);

  if (density <= ELLIPSIS_DENSITY_THRESHOLD) return null;

  const excess = density - ELLIPSIS_DENSITY_THRESHOLD;
  const deduction = Math.min(Math.round(excess * 2), 10);
  return {
    ruleId: 'ellipsis-overuse',
    ruleName: '省略号过度',
    severity: excess > 5 ? 'error' : 'warn',
    deduction,
    details: `省略号(……)密度 ${density.toFixed(1)}次/3k字 (上限${ELLIPSIS_DENSITY_THRESHOLD})，过多省略号是AI生成的常见特征`,
    locations: [],
  };
}

/** 规则 19：感知动词句式重复 */
const PERCEPTION_OPENING_RE = /(?:^|(?<=\n))\s*(?:他|她|我|众人|所有人|大家)(?:看到|发现|感觉到?|注意到|意识到|感受到|察觉到|听到|闻到|看见)/gm;

/**
 * 规则 19：感知动词句式重复
 * AI 大量使用"他看到/发现/感觉到/注意到"作为句首，是典型的"告知式叙事"
 */
function rule19PerceptionOpening(text: string): AiTraceViolation | null {
  const count = countMatches(text, PERCEPTION_OPENING_RE);
  const densityPer3k = text.length > 0 ? (count / text.length) * DENSITY_BASE_CHARS : 0;
  const THRESHOLD = 3; // 每 3000 字上限

  if (densityPer3k <= THRESHOLD) return null;

  const excess = densityPer3k - THRESHOLD;
  const deduction = Math.min(Math.round(excess * 3), 12);
  return {
    ruleId: 'perception-opening',
    ruleName: '感知句式重复',
    severity: excess > 4 ? 'error' : 'warn',
    deduction,
    details: `"他/她+感知动词"句式 ${densityPer3k.toFixed(1)}次/3k字 (上限${THRESHOLD})，应改为直接描写感知对象而非标注感知动作`,
    locations: [],
  };
}

/**
 * 规则 20：句尾单调
 * 连续多个句子以相同的语气词/助词结尾（了、着、的），节奏机械
 */
function rule20SentenceEndingMonotony(text: string): AiTraceViolation | null {
  const sentences = text.split(/[。！？]+/).filter(s => s.trim().length >= MIN_SENTENCE_LEN);
  if (sentences.length < 10) return null;

  const endings = sentences.map(s => {
    const trimmed = s.replace(/[\s"""'']+$/g, '').trim();
    return trimmed.slice(-1);
  });

  let maxRun = 1;
  let currentRun = 1;
  let violationCount = 0;
  const MONOTONY_THRESHOLD = 4; // 连续 4 句同尾

  for (let i = 1; i < endings.length; i++) {
    if (endings[i] === endings[i - 1] && /[了着的过去来]/.test(endings[i])) {
      currentRun++;
      if (currentRun >= MONOTONY_THRESHOLD) {
        violationCount++;
        maxRun = Math.max(maxRun, currentRun);
      }
    } else {
      currentRun = 1;
    }
  }

  if (violationCount === 0) return null;

  const deduction = Math.min(violationCount * 2, 10);
  return {
    ruleId: 'sentence-ending-monotony',
    ruleName: '句尾单调',
    severity: maxRun >= 6 ? 'error' : 'warn',
    deduction,
    details: `${violationCount} 处连续 ${MONOTONY_THRESHOLD}+ 个句子以相同助词结尾 (最长连续${maxRun}句)，应变换句式节奏`,
    locations: [],
  };
}

/** 规则 21：纠偏对照句
 * “不是X，而是Y / 不是X，是Y / 所谓X不是……而是……” 这类表达识别度极高，正文默认禁用
 */
function rule21ContrastPhrasing(text: string): AiTraceViolation | null {
  const CONTRAST_RE = /(?:不是[^。！？；\n]{1,20}(?:而是|[，,]是)[^。！？；\n]{1,24}|所谓[^。！？；\n]{1,16}不是[^。！？；\n]{1,20}而是[^。！？；\n]{1,24}|并非[^。！？；\n]{1,20}而是[^。！？；\n]{1,24}|与其说[^。！？；\n]{1,20}不如说[^。！？；\n]{1,24})/g;
  const count = countMatches(text, CONTRAST_RE);

  if (count === 0) return null;

  const deduction = Math.min(6 + count * 4, 18);
  return {
    ruleId: 'contrast-phrasing',
    ruleName: '纠偏对照句',
    severity: count >= 2 ? 'error' : 'warn',
    deduction,
    details: `检测到 ${count} 处“不是X，而是Y / 并非X，而是Y / 与其说X，不如说Y”类对照句，这类句式在正文中默认禁用`,
    locations: [],
  };
}

// ==================== 规则注册表 ====================

type RuleEntry = {
  id: string;
  evaluate: RuleEvaluator | ((text: string, paragraphs: string[]) => AiTraceViolation | null) | ((text: string) => AiTraceViolation | null);
  needsParagraphs: boolean;
  needsOverrides: boolean;
};

const RULES: RuleEntry[] = [
  { id: 'forbidden-phrases', evaluate: rule01ForbiddenPhrases, needsParagraphs: false, needsOverrides: true },
  { id: 'marker-word-density', evaluate: rule02MarkerWordDensity, needsParagraphs: false, needsOverrides: true },
  { id: 'em-dash-overuse', evaluate: rule03EmDashOveruse, needsParagraphs: false, needsOverrides: false },
  { id: 'paragraph-prefix-repetition', evaluate: rule04ParagraphPrefixRepetition, needsParagraphs: true, needsOverrides: false },
  { id: 'cliche-density', evaluate: rule05ClicheDensity, needsParagraphs: false, needsOverrides: false },
  { id: 'meta-narrative', evaluate: rule06MetaNarrative, needsParagraphs: false, needsOverrides: false },
  { id: 'micro-action-clustering', evaluate: rule07MicroActionClustering, needsParagraphs: true, needsOverrides: false },
  { id: 'excessive-hedging', evaluate: rule08ExcessiveHedging, needsParagraphs: false, needsOverrides: false },
  { id: 'parallel-structure-repetition', evaluate: rule09ParallelStructureRepetition, needsParagraphs: true, needsOverrides: false },
  { id: 'sensory-monotony', evaluate: rule10SensoryMonotony, needsParagraphs: true, needsOverrides: false },
  { id: 'emotion-tell-show-ratio', evaluate: rule11EmotionTellShowRatio, needsParagraphs: false, needsOverrides: false },
  { id: 'markdown-formatting', evaluate: rule12MarkdownFormatting, needsParagraphs: false, needsOverrides: false },
  { id: 'connector-density', evaluate: rule13ConnectorDensity, needsParagraphs: false, needsOverrides: false },
  { id: 'sentence-length-uniformity', evaluate: rule14SentenceLengthUniformity, needsParagraphs: false, needsOverrides: false },
  { id: 'gesture-tag-dialogue', evaluate: rule15GestureTagDialogue, needsParagraphs: false, needsOverrides: false },
  { id: 'paragraph-length-uniformity', evaluate: rule16ParagraphLengthUniformity, needsParagraphs: true, needsOverrides: false },
  { id: 'weak-modifiers', evaluate: rule17WeakModifiers, needsParagraphs: false, needsOverrides: false },
  { id: 'ellipsis-overuse', evaluate: rule18EllipsisOveruse, needsParagraphs: false, needsOverrides: false },
  { id: 'perception-opening', evaluate: rule19PerceptionOpening, needsParagraphs: false, needsOverrides: false },
  { id: 'sentence-ending-monotony', evaluate: rule20SentenceEndingMonotony, needsParagraphs: false, needsOverrides: false },
  { id: 'contrast-phrasing', evaluate: rule21ContrastPhrasing, needsParagraphs: false, needsOverrides: false },
];

// ==================== 主入口 ====================

/**
 * 评估文本的 AI 痕迹程度
 * @param text 待检测的章节文本
 * @param overrides 类型特定规则覆盖（来自 GenreWritingRules）
 * @param learnedPatterns 自学习模式（运行时动态注入，来自 ai-trace-learner）
 * @returns AI 痕迹报告，score 越高越干净
 */
export function evaluateAiTrace(text: string, overrides?: GenreTraceOverrides, learnedPatterns?: RegExp[]): AiTraceReport {
  if (!text || text.trim().length === 0) {
    return {
      score: 100,
      violations: [],
      passedRules: RULES.length,
      totalRules: RULES.length,
      perRuleScores: Object.fromEntries(RULES.map(r => [r.id, 100])),
    };
  }

  const paragraphs = splitParagraphs(text);
  const violations: AiTraceViolation[] = [];
  const perRuleScores: Record<string, number> = {};
  let totalDeduction = 0;

  for (const rule of RULES) {
    const result = (rule.evaluate as RuleEvaluator)(text, paragraphs, overrides);
    if (result) {
      violations.push(result);
      totalDeduction += result.deduction;
      perRuleScores[rule.id] = Math.max(0, 100 - result.deduction * 10);
    } else {
      perRuleScores[rule.id] = 100;
    }
  }

  // 自学习模式检测（运行时动态注入）
  if (learnedPatterns && learnedPatterns.length > 0) {
    let learnedHits = 0;
    const learnedDetails: string[] = [];
    for (const pattern of learnedPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        learnedHits += matches.length;
        learnedDetails.push(`"${matches[0]}"×${matches.length}`);
      }
    }
    if (learnedHits > 0) {
      const deduction = Math.min(learnedHits * 2, 10);
      totalDeduction += deduction;
      violations.push({
        ruleId: 'learned-patterns',
        ruleName: '自学习模式',
        severity: learnedHits >= 5 ? 'error' : learnedHits >= 2 ? 'warn' : 'info',
        deduction,
        details: `检测到 ${learnedHits} 处自学习 AI 痕迹模式：${learnedDetails.slice(0, 5).join('、')}`,
        locations: [],
      });
      perRuleScores['learned-patterns'] = Math.max(0, 100 - deduction * 10);
    }
  }

  const score = Math.max(0, Math.min(100, 100 - totalDeduction));
  const passedRules = RULES.length - violations.length;

  return {
    score,
    violations,
    passedRules,
    totalRules: RULES.length,
    perRuleScores,
  };
}
