import type { AntiAiStructureThresholds, StylePreset } from './chapter-enhancement.js';
import { extractScenePlanChecks } from './scene-plan.js';
import { countTemplatePatternHits } from './template-patterns.js';

export type QualityGateMode = 'off' | 'warn' | 'strict';

export type QualityGateThresholds = {
  passScore: number;
  minStructureScore: number;
  minStyleScore: number;
  minEmotionScore: number;
};

export type QualityGateFinding = {
  code:
    | 'low-scene-coverage'
    | 'low-structure-signal'
    | 'stalled-momentum'
    | 'late-momentum-drop'
    | 'high-template-repetition'
    | 'ai-tell-overuse'
    | 'ai-tell-clustered'
    | 'ai-meta-leak'
    | 'ai-structure-markers'
    | 'voiceprint-homogenized'
    | 'transition-overuse'
    | 'dialogue-ratio-mismatch'
    | 'low-emotion-variance';
  level: 'warn' | 'error';
  message: string;
};

export type QualityGateReport = {
  gateMode: QualityGateMode;
  structureScore: number;
  styleScore: number;
  emotionScore: number;
  overallScore: number;
  findings: QualityGateFinding[];
  passed: boolean;
  summary: string;
};

export type QualityGateRewriteReport = {
  attempted: boolean;
  applied: boolean;
  reason: string;
  before: QualityGateReport;
  after: QualityGateReport;
};

type EvaluateQualityGateParams = {
  chapterContent: string;
  scenePlan?: string;
  stylePreset?: StylePreset;
  antiAiStructure?: AntiAiStructureThresholds;
  gateMode: QualityGateMode;
  thresholds?: Partial<QualityGateThresholds>;
  enableAiTellClusterGate?: boolean;
  domainStructureKeywords?: string[];
};

const DEFAULT_THRESHOLDS: QualityGateThresholds = {
  passScore: 72,
  minStructureScore: 60,
  minStyleScore: 58,
  minEmotionScore: 55,
};
const AI_TELL_SOFT_CAP_PER_1K = 2.5;
const AI_TELL_FINDING_PER_1K = 3.0;
const AI_TELL_CLUSTER_PER_PARAGRAPH = 2;

const EMOTION_WORDS = [
  '愤怒', '恐惧', '喜悦', '悲伤', '羞愧', '懊恼', '兴奋', '焦虑',
  '压抑', '释然', '震惊', '疑惑', '绝望', '期待', '紧张', '平静',
];

const SENSORY_WORDS = [
  '刺痛', '灼热', '冰冷', '颤抖', '潮湿', '血腥', '轰鸣', '低语',
  '刺鼻', '余温', '眩晕', '麻木', '窒息', '寒意',
  '铁锈味', '苦涩', '渗出', '发烫', '发热', '烧伤', '灼伤', '疼痛',
  '骨痛', '发抖', '苍白', '心跳', '呼吸停', '咬住', '血迹', '伤口',
  '灰线', '灰色', '石化', '金色纹路', '左臂', '指尖', '掌心',
];

const STRUCTURE_SIGNAL_RE = /冲突|转折|反转|危机|抉择|选择|决定|代价|后果|揭示|线索|对峙|背叛|突袭|僵持|破局|伏笔|回收|阻碍|搜捕|追兵|陷阱|锁芯|钥匙|血书|开启|激活|推进|兑现|失败|学会|救下|挡住|塌陷|裂开|逼近|撞上/g;
const TRANSITION_SIGNAL_RE = /然而|但是|不过|却|与此同时|下一刻|忽然|旋即|随即|直到|最终|就在这时/g;
const ACTION_SIGNAL_RE = /冲|扑|抓|推|拉|砸|撞|拔|刺|躲|追|跑|走|赶|绕|翻|蹲|按|握|塞|递|挡|问|答|喊|笑|哭|跪|站起|转身|推门|关门|抬手|落下|接过|取出|割|写|滴|打开|开启|激活|加固|封死|检查|受伤|碎裂|渗出/g;
const DIALOGUE_SEGMENT_RE = /[“"「『][^”"」』]{2,120}[”"」』]/g;
const SPEAKER_DIALOGUE_RE = /(?:\(|（)\s*#\s*([^)）\n]{1,24})\s*(?:\)|）)\s*[“"「『]([^”"」』\n]{1,120})[”"」』]/g;
const SCENE_FRAGMENT_STOPWORDS = new Set([
  '场景', '教学', '失败', '第一', '第二', '第三', '一轮', '二轮', '三轮',
  '代价', '内容', '要点', '地点', '角色', '出场', '关系', '变化',
  '推进', '联合', '阻挡', '结构', '能力', '共同', '防御', '压力',
  '逼近', '轻量', '收束', '本章', '章节',
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function clip(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function normalizeText(text: string): string {
  return text
    .replace(/[\(\uFF08]\s*#\s*[^()\uFF08\uFF09\n]+?\s*[\)\uFF09]/g, '')
    .replace(/\r/g, '')
    .trim();
}

function normalizeDomainKeywords(keywords?: string[]): string[] {
  if (!keywords?.length) return [];
  const normalized = keywords
    .map(keyword => keyword.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').trim())
    .filter(keyword => keyword.length >= 2 && keyword.length <= 12);
  return [...new Set(normalized)].slice(0, 32);
}

function countDomainKeywordHits(text: string, keywords: string[]): number {
  let total = 0;
  for (const keyword of keywords) {
    let count = 0;
    let index = text.indexOf(keyword);
    while (index >= 0) {
      count += 1;
      index = text.indexOf(keyword, index + keyword.length);
    }
    total += Math.min(count, 6);
  }
  return total;
}

function countSentences(text: string): number {
  return text
    .split(/[。！？!?]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .length;
}

function countParagraphs(text: string): number {
  return text
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean)
    .length;
}

function detectDialogueRatio(text: string): number {
  if (!text.length) return 0;
  const quoteSegments = text.match(DIALOGUE_SEGMENT_RE) ?? [];
  const quoteChars = quoteSegments.reduce((sum, item) => sum + item.length, 0);
  return quoteChars / text.length;
}

function expectedDialogueRatio(stylePreset?: StylePreset): [number, number] {
  switch (stylePreset) {
    case 'comedy':
    case 'wacky':
    case 'campus':
    case 'romance-sweet':
    case 'romance-angst':
      return [0.14, 0.5];
    case 'political':
    case 'workplace':
    case 'wuxia':
      return [0.1, 0.4];
    case 'hard-scifi':
    case 'historical':
    case 'serious':
    case 'suspense':
    case 'horror':
    case 'xianxia':
    default:
      return [0.06, 0.35];
  }
}

function sentenceLengthCV(text: string): number {
  const lengths = text
    .split(/[。！？!?]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.length);
  if (lengths.length <= 1) return 0;
  const mean = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
  if (mean <= 0) return 0;
  const variance = lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length;
  return Math.sqrt(variance) / mean;
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function hasParagraphProgress(paragraph: string, domainKeywords: string[] = []): boolean {
  if (!paragraph) return false;
  if (paragraph.length <= 24) return true;
  if (/^(?:沈渊|苏清月|赵铁山|沈忠|太后|那个声音)?(?:没有回答|没有接话|沉默|点头|摇头|停下|没动|没转头|没移开目光)[。！？]?$/u.test(paragraph)) {
    return true;
  }
  if ((paragraph.match(STRUCTURE_SIGNAL_RE) ?? []).length > 0) return true;
  if (countDomainKeywordHits(paragraph, domainKeywords) > 0) return true;
  if ((paragraph.match(TRANSITION_SIGNAL_RE) ?? []).length > 0) return true;
  if ((paragraph.match(DIALOGUE_SEGMENT_RE) ?? []).length > 0) return true;
  if ((paragraph.match(ACTION_SIGNAL_RE) ?? []).length > 0) return true;
  return false;
}

function paragraphProgressStats(text: string, domainKeywords: string[] = []): { maxStalledParagraphRun: number } {
  const paragraphs = text
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean);
  let currentStalledRun = 0;
  let maxStalledParagraphRun = 0;
  for (const paragraph of paragraphs) {
    if (hasParagraphProgress(paragraph, domainKeywords)) {
      currentStalledRun = 0;
      continue;
    }
    currentStalledRun += 1;
    if (currentStalledRun > maxStalledParagraphRun) {
      maxStalledParagraphRun = currentStalledRun;
    }
  }
  return { maxStalledParagraphRun };
}

function momentumDensity(text: string, domainKeywords: string[] = []): number {
  if (!text.trim()) return 0;
  const structureSignals = (text.match(STRUCTURE_SIGNAL_RE) ?? []).length;
  const domainSignals = countDomainKeywordHits(text, domainKeywords);
  const transitions = (text.match(TRANSITION_SIGNAL_RE) ?? []).length;
  const dialogues = (text.match(DIALOGUE_SEGMENT_RE) ?? []).length;
  const actions = (text.match(ACTION_SIGNAL_RE) ?? []).length;
  const total = structureSignals + domainSignals * 0.7 + transitions + dialogues + actions;
  return total / Math.max(1, text.length / 1000);
}

function sceneCheckFulfilled(text: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const requiredHits = keywords.length >= 3 ? 2 : 1;
  const hits = keywords.filter(keyword => keywordMatched(text, keyword));
  const hasStrongPhraseHit = hits.some(keyword => isStrongSceneKeyword(keyword));
  if (hits.length < requiredHits && !hasStrongPhraseHit) return false;
  const paragraphs = text
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean);
  const relevantParagraphs = paragraphs.filter(paragraph => hits.some(keyword => keywordMatched(paragraph, keyword)));
  return relevantParagraphs.some(paragraph =>
    (paragraph.match(DIALOGUE_SEGMENT_RE) ?? []).length > 0
    || (paragraph.match(ACTION_SIGNAL_RE) ?? []).length > 0
    || (paragraph.match(STRUCTURE_SIGNAL_RE) ?? []).length > 0
    || /决定|选择|抉择|逼问|发现|换|离开|入祭坛|显出|给出|递给|交出|夺下|打开|掀开|受伤|裂开|碎裂|血|代价|救下|挡住/.test(paragraph),
  );
}

function keywordMatched(text: string, keyword: string): boolean {
  const normalized = keyword.trim();
  if (!normalized) return false;
  if (text.includes(normalized)) return true;
  if (normalized.length < 5) return false;

  const fragments = extractSceneKeywordFragments(normalized);
  if (fragments.length === 0) return false;
  const fragmentHits = fragments.filter(fragment => text.includes(fragment));
  return fragmentHits.length >= Math.min(2, fragments.length)
    || fragmentHits.length / fragments.length >= 0.45;
}

function isStrongSceneKeyword(keyword: string): boolean {
  if (keyword.length < 5) return false;
  return extractSceneKeywordFragments(keyword).length >= 2;
}

function extractSceneKeywordFragments(keyword: string): string[] {
  const normalized = keyword
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
    .trim();
  if (normalized.length < 5) return [];

  const fragments = new Set<string>();
  for (const match of normalized.matchAll(/[\u4e00-\u9fa5]{2,4}|[A-Za-z0-9]{2,12}/g)) {
    const word = match[0];
    if (!SCENE_FRAGMENT_STOPWORDS.has(word)) {
      fragments.add(word);
    }
  }
  for (let size = 2; size <= 4; size += 1) {
    if (normalized.length < size) continue;
    for (let index = 0; index <= normalized.length - size; index += size) {
      const fragment = normalized.slice(index, index + size);
      if (!SCENE_FRAGMENT_STOPWORDS.has(fragment)) {
        fragments.add(fragment);
      }
    }
  }
  return [...fragments].slice(0, 10);
}

function evaluateVoiceprintHomogenization(text: string): {
  homogenized: boolean;
  summary: string;
} {
  const matcher = new RegExp(SPEAKER_DIALOGUE_RE.source, 'g');
  const buckets = new Map<string, string[]>();
  let matched: RegExpExecArray | null = matcher.exec(text);
  while (matched) {
    const speaker = matched[1]?.trim();
    const line = matched[2]?.trim();
    if (speaker && line) {
      const list = buckets.get(speaker) ?? [];
      list.push(line);
      buckets.set(speaker, list);
    }
    matched = matcher.exec(text);
  }

  const usable = [...buckets.entries()]
    .map(([speaker, lines]) => ({ speaker, lines }))
    .filter(item => item.lines.length >= 2);
  const totalLines = usable.reduce((sum, item) => sum + item.lines.length, 0);
  if (usable.length < 3 || totalLines < 8) {
    return { homogenized: false, summary: '' };
  }

  const avgLengths = usable.map(item => item.lines.reduce((sum, line) => sum + line.length, 0) / item.lines.length);
  const meanLength = avgLengths.reduce((sum, value) => sum + value, 0) / avgLengths.length;
  const lengthCv = meanLength > 0 ? stddev(avgLengths) / meanLength : 0;

  const questionRates = usable.map(item => {
    const questions = item.lines.filter(line => /[?？]/.test(line)).length;
    return questions / item.lines.length;
  });
  const modalRates = usable.map(item => {
    const modalHits = item.lines.filter(line => /[吧吗呢啊呀嘛啦哎]/.test(line)).length;
    return modalHits / item.lines.length;
  });

  const questionStd = stddev(questionRates);
  const modalStd = stddev(modalRates);
  const homogenized = lengthCv < 0.18 && questionStd < 0.12 && modalStd < 0.12;
  return {
    homogenized,
    summary: homogenized ? usable.slice(0, 3).map(item => item.speaker).join('/') : '',
  };
}

function evaluateStructureScore(text: string, scenePlan?: string, domainStructureKeywords?: string[]): {
  score: number;
  sceneCoverage: number;
  structureSignalHits: number;
  maxStalledParagraphRun: number;
  lateMomentumRatio: number;
} {
  const domainKeywords = normalizeDomainKeywords(domainStructureKeywords);
  const scenes = extractScenePlanChecks(scenePlan);
  const coverage = scenes.length === 0
    ? 1
    : scenes.filter(scene => sceneCheckFulfilled(text, scene.keywords)).length / scenes.length;

  const structureSignals = (text.match(STRUCTURE_SIGNAL_RE) ?? []).length;
  const domainStructureSignals = countDomainKeywordHits(text, domainKeywords);
  const transitions = (text.match(TRANSITION_SIGNAL_RE) ?? []).length;
  const paragraphCount = countParagraphs(text);
  const sentenceCount = countSentences(text);
  const { maxStalledParagraphRun } = paragraphProgressStats(text, domainKeywords);

  const splitIndex = Math.max(0, Math.floor(text.length * 0.6));
  const lead = text.slice(0, splitIndex);
  const tail = text.slice(splitIndex);
  const leadMomentum = momentumDensity(lead, domainKeywords);
  const tailMomentum = momentumDensity(tail, domainKeywords);
  const lateMomentumRatio = leadMomentum > 0 ? round(tailMomentum / leadMomentum) : 1;
  const latePenalty = lateMomentumRatio < 0.7 ? (0.7 - lateMomentumRatio) * 18 : 0;
  const stalledPenalty = maxStalledParagraphRun >= 3 ? (maxStalledParagraphRun - 2) * 3.5 : 0;

  const score = clamp(
    28
      + coverage * 40
      + Math.min((structureSignals + domainStructureSignals * 0.6) * 2.4, 18)
      + Math.min(transitions * 1.4, 10)
      + Math.min(paragraphCount, 12)
      + Math.min(sentenceCount / 8, 10)
      - latePenalty
      - stalledPenalty,
    0,
    100,
  );
  return {
    score: round(score),
    sceneCoverage: round(coverage * 100),
    structureSignalHits: structureSignals + domainStructureSignals + transitions,
    maxStalledParagraphRun,
    lateMomentumRatio,
  };
}

function evaluateStyleScore(
  text: string,
  stylePreset?: StylePreset,
  antiAiStructure?: AntiAiStructureThresholds,
  rawText?: string,
): {
  score: number;
  repetitionPenalty: number;
  dialogueRatio: number;
  templateHitSummary: string;
  aiTellSummary: string;
  aiMetaSummary: string;
  aiStructureSummary: string;
  aiTellHitsTotal: number;
  aiTellPer1k: number;
  voiceprintHomogenized: boolean;
  voiceprintSummary: string;
  transitionPer1k: number;
  metaHitsTotal: number;
  structureHitsTotal: number;
} {
  const sentences = text
    .split(/[。！？!?]+/)
    .map(item => item.trim())
    .filter(Boolean);
  const prefixCount = new Map<string, number>();
  for (const sentence of sentences) {
    const prefix = sentence.slice(0, 10);
    if (prefix.length < 4) continue;
    prefixCount.set(prefix, (prefixCount.get(prefix) ?? 0) + 1);
  }

  const repeatedPrefix = [...prefixCount.values()].filter(count => count >= 3).length;
  const templateHits = countTemplatePatternHits(text, ['cliche', 'ai-tell']);
  const templateHitsTotal = templateHits.reduce((sum, item) => sum + item.count, 0);
  const aiTellHits = templateHits.filter(item => item.category === 'ai-tell');
  const aiTellHitsTotal = aiTellHits.reduce((sum, item) => sum + item.count, 0);
  const aiTellPer1k = text.length > 0 ? round(aiTellHitsTotal / (text.length / 1000)) : 0;
  const templateHitSummary = templateHits.slice(0, 3).map(item => `${item.label}×${item.count}`).join('、');
  const aiTellSummary = aiTellHits.slice(0, 3).map(item => `${item.label}×${item.count}`).join('、');

  const metaHits = countTemplatePatternHits(text, ['ai-meta']);
  const structureHits = countTemplatePatternHits(text, ['ai-structure']);
  const metaHitsTotal = metaHits.reduce((sum, item) => sum + item.count, 0);
  const structureHitsTotal = structureHits.reduce((sum, item) => sum + item.count, 0);
  const aiMetaSummary = metaHits.slice(0, 3).map(item => `${item.label}×${item.count}`).join('、');
  const aiStructureSummary = structureHits.slice(0, 3).map(item => `${item.label}×${item.count}`).join('、');

  const transitionHits = (text.match(TRANSITION_SIGNAL_RE) ?? []).length;
  const transitionPer1k = text.length > 0 ? round(transitionHits / (text.length / 1000)) : 0;
  const transitionPenalty = antiAiStructure?.enabled && transitionPer1k > antiAiStructure.transitionWordsPer1kMax
    ? (transitionPer1k - antiAiStructure.transitionWordsPer1kMax) * 3
    : 0;

  const dialogueRatio = detectDialogueRatio(text);
  const [minRatio, maxRatio] = expectedDialogueRatio(stylePreset);
  const ratioPenalty = dialogueRatio < minRatio
    ? (minRatio - dialogueRatio) * 95
    : dialogueRatio > maxRatio
      ? (dialogueRatio - maxRatio) * 80
      : 0;

  const cv = sentenceLengthCV(text);
  const rhythmPenalty = cv < 0.35 ? (0.35 - cv) * 35 : 0;

  const structurePenalty = antiAiStructure?.enabled ? structureHitsTotal * 4 : 0;
  const aiTellPenalty = aiTellPer1k > AI_TELL_SOFT_CAP_PER_1K
    ? (aiTellPer1k - AI_TELL_SOFT_CAP_PER_1K) * 4.8
    : 0;
  const voiceprint = evaluateVoiceprintHomogenization(rawText ?? text);
  const voiceprintPenalty = voiceprint.homogenized ? 6 : 0;
  const repetitionPenalty = repeatedPrefix * 4
    + templateHitsTotal * 3
    + structurePenalty
    + aiTellPenalty
    + voiceprintPenalty
    + metaHitsTotal * 8
    + transitionPenalty
    + ratioPenalty
    + rhythmPenalty;
  const score = clamp(92 - repetitionPenalty, 0, 100);
  return {
    score: round(score),
    repetitionPenalty: round(repetitionPenalty),
    dialogueRatio: round(dialogueRatio * 100),
    templateHitSummary,
    aiTellSummary,
    aiMetaSummary,
    aiStructureSummary,
    aiTellHitsTotal,
    aiTellPer1k,
    voiceprintHomogenized: voiceprint.homogenized,
    voiceprintSummary: voiceprint.summary,
    transitionPer1k,
    metaHitsTotal,
    structureHitsTotal,
  };
}

function evaluateEmotionScore(text: string): {
  score: number;
  emotionHits: number;
} {
  const hits = EMOTION_WORDS.reduce((sum, word) => sum + (text.match(new RegExp(word, 'g')) ?? []).length, 0);
  const sensoryHits = SENSORY_WORDS.reduce((sum, word) => sum + (text.match(new RegExp(word, 'g')) ?? []).length, 0);
  const punctuationTurns = (text.match(/[！？!?]/g) ?? []).length;
  const paragraphList = text
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean);
  const paragraphs = Math.max(1, paragraphList.length);
  const density = (hits + sensoryHits * 0.6) / paragraphs;

  const bodySignalRe = /血|伤|痛|疼|烧|灼|抖|颤|冷|热|苦|铁锈|呼吸|心跳|指尖|掌心|骨|喉|舌|泪|汗|麻|窒息/;
  const costSignalRe = /代价|反噬|药力|十二个时辰|会死|失去|欠|债|裂痕|血书|寿命|命|不能|必须|来不及|撑不住/;
  const relationshipSignalRe = /她|他|你|我|我们|族长|孩子|人群|众人|同伴|递给|挡在|护住|扶住|拉住|跟着|等|留给|低声|盯着|看着|喊|问|回答|退后|靠近|跪下|举起|接过/;
  const choiceSignalRe = /选择|抉择|决定|必须|需要|不能|要去|站起来|走出|回不来|回来|救|找|启动|开启/;
  const competitivePayoffSignalRe = /比分|反超|命中|得分|助攻|篮板|补防|抢断|首发|选拔赛|记分牌|防住|回合|传球|传给|底角|三分|上篮|投篮|抢到|名单|组牌/;
  const competitiveFeedbackSignalRe = /队友|教练|击掌|好传|点头|递|看向|看着|吹哨|哨|宣布|名单|信任|主动传|不传|拒绝|陈维|张恒|刘洋|孙毅|林霄/;
  const businessPayoffSignalRe = /铜板|成交|排队|试吃|尝尝|卖光|售罄|净利|收入|成本|赚|回头客|带客|添面粉|木牌|陶碗|价目牌|小份|大份/;
  const businessFeedbackSignalRe = /食客|客人|妇人|壮汉|挑夫|掌柜|赵掌柜|邻居|大嫂|孩子|围观|喊|说|问|递|掏出|站队|抢客|压制|抽成|合作|拒绝|里正/;
  const romancePayoffSignalRe = /牵手|同居|直播|白板|心动|吃醋|护短|偏爱|旧伤|肩|星星吊饰|便利贴|等花开|站过来|靠近|吻|抱|三明治|气泡水/;
  const romanceFeedbackSignalRe = /弹幕|Lisa|镜头|看着|偏头|没回答|沉默|辨认|真假|攥紧|手抖|掌心|指尖|呼吸|笑|疼|发烫|出汗|不自在|停住|走过去/;
  let embodiedCostBeats = 0;
  let relationshipBeats = 0;
  let choicePressureBeats = 0;
  let competitivePayoffBeats = 0;
  let businessPayoffBeats = 0;
  let romancePayoffBeats = 0;

  for (const paragraph of paragraphList) {
    const hasBody = bodySignalRe.test(paragraph);
    const hasCost = costSignalRe.test(paragraph);
    const hasRelationship = relationshipSignalRe.test(paragraph);
    const hasChoice = choiceSignalRe.test(paragraph);
    if (hasBody && hasCost) embodiedCostBeats += 1;
    if (hasBody && hasRelationship) relationshipBeats += 1;
    if ((hasBody || hasRelationship) && hasChoice && hasCost) choicePressureBeats += 1;
    if (competitivePayoffSignalRe.test(paragraph) && competitiveFeedbackSignalRe.test(paragraph)) {
      competitivePayoffBeats += 1;
    }
    if (businessPayoffSignalRe.test(paragraph) && businessFeedbackSignalRe.test(paragraph)) {
      businessPayoffBeats += 1;
    }
    if (romancePayoffSignalRe.test(paragraph) && romanceFeedbackSignalRe.test(paragraph)) {
      romancePayoffBeats += 1;
    }
  }

  const beatScore = Math.min(embodiedCostBeats * 3.2, 13)
    + Math.min(relationshipBeats * 2.4, 10)
    + Math.min(choicePressureBeats * 3.5, 9)
    + Math.min(competitivePayoffBeats * 3.5, 20)
    + Math.min(businessPayoffBeats * 4.2, 24)
    + Math.min(romancePayoffBeats * 3.8, 18);
  const hasEarlyBeat = paragraphList.slice(0, Math.max(1, Math.ceil(paragraphs * 0.35))).some(paragraph =>
    bodySignalRe.test(paragraph) && (costSignalRe.test(paragraph) || relationshipSignalRe.test(paragraph)),
  );
  const hasLateBeat = paragraphList.slice(Math.floor(paragraphs * 0.65)).some(paragraph =>
    bodySignalRe.test(paragraph) && (costSignalRe.test(paragraph) || choiceSignalRe.test(paragraph)),
  );
  const hasEarlyCompetitivePayoff = paragraphList.slice(0, Math.max(1, Math.ceil(paragraphs * 0.35))).some(paragraph =>
    competitivePayoffSignalRe.test(paragraph) && competitiveFeedbackSignalRe.test(paragraph),
  );
  const hasLateCompetitivePayoff = paragraphList.slice(Math.floor(paragraphs * 0.65)).some(paragraph =>
    competitivePayoffSignalRe.test(paragraph) && competitiveFeedbackSignalRe.test(paragraph),
  );
  const hasEarlyBusinessPayoff = paragraphList.slice(0, Math.max(1, Math.ceil(paragraphs * 0.35))).some(paragraph =>
    businessPayoffSignalRe.test(paragraph) && businessFeedbackSignalRe.test(paragraph),
  );
  const hasLateBusinessPayoff = paragraphList.slice(Math.floor(paragraphs * 0.65)).some(paragraph =>
    businessPayoffSignalRe.test(paragraph) && businessFeedbackSignalRe.test(paragraph),
  );
  const hasEarlyRomancePayoff = paragraphList.slice(0, Math.max(1, Math.ceil(paragraphs * 0.35))).some(paragraph =>
    romancePayoffSignalRe.test(paragraph) && romanceFeedbackSignalRe.test(paragraph),
  );
  const hasLateRomancePayoff = paragraphList.slice(Math.floor(paragraphs * 0.65)).some(paragraph =>
    romancePayoffSignalRe.test(paragraph) && romanceFeedbackSignalRe.test(paragraph),
  );
  const arcScore = (hasEarlyBeat ? 4 : 0)
    + (hasLateBeat ? 4 : 0)
    + (hasEarlyCompetitivePayoff ? 3 : 0)
    + (hasLateCompetitivePayoff ? 5 : 0)
    + (hasEarlyBusinessPayoff ? 4 : 0)
    + (hasLateBusinessPayoff ? 7 : 0)
    + (hasEarlyRomancePayoff ? 4 : 0)
    + (hasLateRomancePayoff ? 6 : 0);
  const labelDensity = hits / paragraphs;
  const tellPenalty = labelDensity > 0.45 && embodiedCostBeats + relationshipBeats < hits
    ? Math.min((labelDensity - 0.45) * 18, 14)
    : 0;

  const score = clamp(
    28
      + Math.min(density * 16, 34)
      + Math.min(punctuationTurns * 1.2, 14)
      + Math.min(sensoryHits * 0.9, 9)
      + beatScore
      + arcScore
      - tellPenalty,
    0,
    100,
  );
  return { score: round(score), emotionHits: hits + sensoryHits };
}

function detectAiTellCluster(text: string): {
  maxPerParagraph: number;
  sampleSummary: string;
} {
  const paragraphs = text
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean);
  let maxPerParagraph = 0;
  let sampleSummary = '';

  for (const paragraph of paragraphs) {
    const hits = countTemplatePatternHits(paragraph, ['ai-tell']);
    const total = hits.reduce((sum, item) => sum + item.count, 0);
    if (total <= maxPerParagraph) continue;
    maxPerParagraph = total;
    sampleSummary = hits.slice(0, 2).map(item => `${item.label}×${item.count}`).join('、');
  }

  return { maxPerParagraph, sampleSummary };
}

export function evaluateQualityGate(params: EvaluateQualityGateParams): QualityGateReport {
  const thresholds: QualityGateThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(params.thresholds ?? {}),
  };

  const rawText = params.chapterContent.replace(/\r/g, '').trim();
  const normalizedText = normalizeText(rawText);
  const structure = evaluateStructureScore(normalizedText, params.scenePlan, params.domainStructureKeywords);
  const style = evaluateStyleScore(normalizedText, params.stylePreset, params.antiAiStructure, rawText);
  const emotion = evaluateEmotionScore(normalizedText);
  const aiTellCluster = detectAiTellCluster(normalizedText);

  const overallScore = round(structure.score * 0.4 + style.score * 0.35 + emotion.score * 0.25);
  const findings: QualityGateFinding[] = [];
  const level: 'warn' | 'error' = params.gateMode === 'strict' ? 'error' : 'warn';

  if (structure.sceneCoverage < 60) {
    findings.push({
      code: 'low-scene-coverage',
      level,
      message: `场景兑现覆盖率偏低（${structure.sceneCoverage}%）`,
    });
  }
  if (structure.structureSignalHits < 6) {
    findings.push({
      code: 'low-structure-signal',
      level,
      message: '冲突/转折信号偏少，章节推进感不足',
    });
  }
  if (structure.maxStalledParagraphRun >= 3) {
    findings.push({
      code: 'stalled-momentum',
      level,
      message: `连续 ${structure.maxStalledParagraphRun} 段推进信号偏弱，容易出现“水段”感`,
    });
  }
  if (countParagraphs(normalizedText) >= 6 && structure.lateMomentumRatio < 0.7) {
    findings.push({
      code: 'late-momentum-drop',
      level,
      message: `后程推进强度下滑（后40%/前60%约 ${structure.lateMomentumRatio}）`,
    });
  }
  if (style.repetitionPenalty > 25) {
    findings.push({
      code: 'high-template-repetition',
      level,
      message: style.templateHitSummary
        ? `模板句或重复句式偏多，文风辨识度下降（高频：${style.templateHitSummary}）`
        : '模板句或重复句式偏多，文风辨识度下降',
    });
  }
  if (style.aiTellPer1k > AI_TELL_FINDING_PER_1K) {
    findings.push({
      code: 'ai-tell-overuse',
      level,
      message: style.aiTellSummary
        ? `微动作/氛围模板句过密（约 ${style.aiTellPer1k}/千字，高频：${style.aiTellSummary}）`
        : `微动作/氛围模板句过密（约 ${style.aiTellPer1k}/千字）`,
    });
  }
  if ((params.enableAiTellClusterGate ?? true) && aiTellCluster.maxPerParagraph >= AI_TELL_CLUSTER_PER_PARAGRAPH) {
    findings.push({
      code: 'ai-tell-clustered',
      level,
      message: aiTellCluster.sampleSummary
        ? `单段微动作模板扎堆（最高 ${aiTellCluster.maxPerParagraph} 次，示例：${aiTellCluster.sampleSummary}）`
        : `单段微动作模板扎堆（最高 ${aiTellCluster.maxPerParagraph} 次）`,
    });
  }

  if (style.metaHitsTotal > 0) {
    findings.push({
      code: 'ai-meta-leak',
      level,
      message: style.aiMetaSummary
        ? `出现 AI/写作 meta 泄露（${style.aiMetaSummary}）`
        : '出现 AI/写作 meta 泄露（如“作为AI/本文/读者”等）',
    });
  }

  if (params.antiAiStructure?.enabled && style.structureHitsTotal > 0) {
    findings.push({
      code: 'ai-structure-markers',
      level,
      message: style.aiStructureSummary
        ? `出现总结腔/条理腔（${style.aiStructureSummary}）`
        : '出现总结腔/条理腔（如“首先/其次/总之/不难发现”等）',
    });
  }

  if (params.antiAiStructure?.enabled && style.transitionPer1k > params.antiAiStructure.transitionWordsPer1kMax) {
    findings.push({
      code: 'transition-overuse',
      level,
      message: `转折连接词密度偏高（约 ${style.transitionPer1k}/千字）`,
    });
  }
  if (style.voiceprintHomogenized) {
    findings.push({
      code: 'voiceprint-homogenized',
      level,
      message: style.voiceprintSummary
        ? `角色对话口吻同质化（${style.voiceprintSummary}）`
        : '角色对话口吻同质化，区分度偏弱',
    });
  }
  if (style.score < thresholds.minStyleScore) {
    findings.push({
      code: 'dialogue-ratio-mismatch',
      level,
      message: `对话密度与风格预期不匹配（当前 ${style.dialogueRatio}%）`,
    });
  }
  if (emotion.score < thresholds.minEmotionScore) {
    findings.push({
      code: 'low-emotion-variance',
      level,
      message: '情绪层次偏平，缺少有效起伏',
    });
  }

  const passed = params.gateMode !== 'strict'
    || (
      overallScore >= thresholds.passScore
      && structure.score >= thresholds.minStructureScore
      && style.score >= thresholds.minStyleScore
      && emotion.score >= thresholds.minEmotionScore
    );

  const summary = clip(
    `质量分 ${overallScore}（结构 ${structure.score} / 文风 ${style.score} / 情绪 ${emotion.score}）`,
    120,
  );

  return {
    gateMode: params.gateMode,
    structureScore: structure.score,
    styleScore: style.score,
    emotionScore: emotion.score,
    overallScore,
    findings,
    passed,
    summary,
  };
}

export function buildQualityGateFixHints(
  report: QualityGateReport,
  stylePreset?: StylePreset,
  scenePlan?: string,
): string {
  const lines: string[] = [
    '以下是质量门禁修复要求，请做最小必要改写：',
  ];

  if (report.structureScore < 65) {
    lines.push('- 补一段明确冲突升级和一段结果落地，确保因果闭环。');
  }
  if (report.findings.some(f => f.code === 'stalled-momentum')) {
    lines.push('- 拆分连续静态段落：每2-3段至少加入一次动作、决策或信息增量。');
  }
  if (report.findings.some(f => f.code === 'late-momentum-drop')) {
    lines.push('- 强化后40%段落：加入二次压力升级、关键选择与明确后果。');
  }
  if (report.styleScore < 62) {
    lines.push('- 删除重复开场句式，替换至少两处模板化表达。');
    lines.push('- 对话与叙述比例按题材重平衡，避免“全对话”或“全说明”。');
  }
  if (report.findings.some(f => f.code === 'ai-tell-overuse')) {
    lines.push('- 同段微动作模板最多保留一个，优先改成“事件->反应->后果”。');
  }
  if (report.findings.some(f => f.code === 'ai-tell-clustered')) {
    lines.push('- 出现模板句扎堆段落：删除同段重复微动作，替换为环境反馈或动作后果。');
  }
  if (report.findings.some(f => f.code === 'voiceprint-homogenized')) {
    lines.push('- 给主要角色设置差异口吻：句长、语气词、反问频率、常用词至少区分两维。');
  }
  if (report.findings.some(f => f.code === 'ai-meta-leak')) {
    lines.push('- 删除任何 AI/写作 meta 泄露（如“作为AI/本文/读者/抱歉/我无法…”等）。');
  }
  if (report.findings.some(f => f.code === 'ai-structure-markers')) {
    lines.push('- 删改“首先/其次/总之/不难发现/值得一提”等总结腔词汇，用事件推进逻辑。');
  }
  if (report.findings.some(f => f.code === 'transition-overuse')) {
    lines.push('- 降低“然而/但是/不过/忽然/下一刻”等转折词密度，改用动作因果衔接。');
  }
  if (report.emotionScore < 60) {
    lines.push('- 在关键行动前后补情绪触发与行为后果，形成情绪波峰。');
  }

  if (scenePlan) {
    lines.push('- 回看场景计划，确保每个场景至少有一个可感知事件落地。');
  }

  lines.push(`- 当前风格：${stylePreset ?? 'auto'}`);
  lines.push('- 输出格式保持“润色后正文 + ---EDITOR_NOTES--- + 修改说明”。');
  return lines.join('\n');
}
