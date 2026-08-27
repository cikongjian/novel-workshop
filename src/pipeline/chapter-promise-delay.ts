import type { ChapterPromiseCard } from './chapter-promise-card.js';
import { getTopicProfileById, getTopicProfilesByFocus, type TopicProfile } from './topic-profiles.js';

export type DeferredPayoffPressure = {
  active: boolean;
  repeatedSetupChapters: number;
  anchorKeywords: string[];
  summary: string;
  directive?: string;
};

export type DelayedPayoffAnalysis = DeferredPayoffPressure & {
  triggered: boolean;
  currentSetupHeavy: boolean;
  currentConcreteExecution: boolean;
};

type ChapterPromiseProgressSnapshot = {
  anchorMatches: string[];
  anchorHits: number;
  setupHits: number;
  payoffHits: number;
  executionHits: number;
  backstageHits: number;
  isSetupHeavy: boolean;
  hasConcreteExecution: boolean;
};

const GENERIC_SETUP_KEYWORDS = [
  '明天',
  '次日',
  '翌日',
  '即将',
  '准备',
  '流程',
  '台本',
  '彩排',
  '预热',
  '试探',
  '布局',
  '倒计时',
  '等待',
  '风暴',
  '快开始',
  '开场前',
  '直播前',
  '录制前',
  '会前',
  '赛前',
];

function uniqueKeywords(values: string[]): string[] {
  return [...new Set(values.map(item => item.trim()).filter(Boolean))];
}

function countKeywordHits(text: string, keywords: string[]): number {
  let total = 0;
  for (const keyword of keywords) {
    if (!keyword) continue;
    let index = text.indexOf(keyword);
    while (index >= 0) {
      total += 1;
      index = text.indexOf(keyword, index + keyword.length);
    }
  }
  return total;
}

function getMatchedKeywords(text: string, keywords: string[]): string[] {
  return keywords.filter(keyword => keyword && text.includes(keyword));
}

function resolveCardTopicProfile(card: ChapterPromiseCard): TopicProfile | undefined {
  const fromIds = (card.topicIds ?? [])
    .map(id => getTopicProfileById(id))
    .find(profile => profile?.genreFocus === card.genreFocus);
  return fromIds ?? getTopicProfilesByFocus(card.genreFocus)[0];
}

function buildAnchorKeywords(card: ChapterPromiseCard): string[] {
  const topicProfile = resolveCardTopicProfile(card);
  switch (card.genreFocus) {
    case 'showbiz':
      return uniqueKeywords([
        ...card.requiredScene.keywords,
        ...card.requiredPayoff.keywords,
        '直播',
        '直播间',
        '录制',
        '录制现场',
        '节目',
        '节目组',
        '试镜',
        '热搜',
        '发布会',
        '片场',
        '导演组',
        '现场',
      ]).slice(0, 14);
    case 'career':
      return uniqueKeywords([
        ...card.requiredScene.keywords,
        ...card.requiredPayoff.keywords,
        '会议',
        '汇报',
        '签约',
        '项目',
        '竞标',
        '谈判',
        '发布会',
        '路演',
        '现场',
      ]).slice(0, 12);
    case 'upgrade':
      return uniqueKeywords([
        ...card.requiredScene.keywords,
        ...card.requiredPayoff.keywords,
        '秘境',
        '擂台',
        '考核',
        '大比',
        '拍卖会',
        '宗门',
        '现场',
      ]).slice(0, 12);
    default:
      if (topicProfile?.delayedPayoff?.anchorKeywords?.length) {
        return uniqueKeywords([
          ...card.requiredScene.keywords,
          ...card.requiredPayoff.keywords,
          ...topicProfile.delayedPayoff.anchorKeywords,
          '现场',
        ]).slice(0, 14);
      }
      return uniqueKeywords([
        ...card.requiredScene.keywords,
        ...card.requiredPayoff.keywords,
        '现场',
        '公开',
        '当场',
      ]).slice(0, 10);
  }
}

function buildExecutionKeywords(card: ChapterPromiseCard): string[] {
  const topicProfile = resolveCardTopicProfile(card);
  switch (card.genreFocus) {
    case 'showbiz':
      return uniqueKeywords([
        '开播',
        '登台',
        '主持人报幕',
        '镜头切到',
        '直播间弹幕',
        '弹幕',
        '录制开始',
        '公开发声',
        '冲上热搜',
        '热搜第一',
        '当场拍板',
        '官宣',
      ]).slice(0, 16);
    case 'career':
      return uniqueKeywords([
        '签约',
        '拿下',
        '拍板',
        '通过',
        '宣布',
        '敲定',
        '当场',
      ]).slice(0, 12);
    case 'upgrade':
      return uniqueKeywords([
        '突破',
        '开战',
        '获胜',
        '拿下',
        '闯过',
        '当场',
      ]).slice(0, 12);
    default:
      if (topicProfile?.delayedPayoff?.executionKeywords?.length) {
        return uniqueKeywords([
          ...card.requiredPayoff.keywords,
          ...topicProfile.delayedPayoff.executionKeywords,
        ]).slice(0, 16);
      }
      return uniqueKeywords([
        '当场',
        '公开',
        '拿下',
        '通过',
        '宣布',
      ]).slice(0, 10);
  }
}

function buildBackstageKeywords(card: ChapterPromiseCard): string[] {
  const topicProfile = resolveCardTopicProfile(card);
  switch (card.genreFocus) {
    case 'showbiz':
      return ['后台', '休息室', '化妆间', '走廊', '保姆车', '准备间', '导播间', '控台'];
    case 'career':
      return ['办公室', '茶水间', '会议前', '电话里', '走廊'];
    case 'upgrade':
      return ['闭关室', '洞府', '山门外', '阵前准备'];
    default:
      if (topicProfile?.delayedPayoff?.backstageKeywords?.length) {
        return topicProfile.delayedPayoff.backstageKeywords;
      }
      return ['后台', '走廊', '准备间'];
  }
}

function inspectChapterProgress(card: ChapterPromiseCard, chapterContent: string): ChapterPromiseProgressSnapshot {
  const anchorKeywords = buildAnchorKeywords(card);
  const executionKeywords = buildExecutionKeywords(card);
  const backstageKeywords = buildBackstageKeywords(card);
  const payoffKeywords = [
    ...card.requiredPayoff.keywords,
    ...(card.optionalPayoff?.keywords ?? []),
  ];
  const anchorMatches = getMatchedKeywords(chapterContent, anchorKeywords);
  const anchorHits = countKeywordHits(chapterContent, anchorKeywords);
  const setupHits = countKeywordHits(chapterContent, GENERIC_SETUP_KEYWORDS);
  const payoffHits = countKeywordHits(chapterContent, payoffKeywords);
  const executionHits = countKeywordHits(chapterContent, executionKeywords);
  const backstageHits = countKeywordHits(chapterContent, backstageKeywords);
  const hasConcreteExecution = anchorHits > 0
    && (
      executionHits >= 2
      || (executionHits >= 1 && payoffHits >= 1)
    );
  const isSetupHeavy = anchorHits > 0
    && setupHits >= 2
    && executionHits === 0
    && !hasConcreteExecution
    && (backstageHits >= 1 || setupHits >= 3 || payoffHits === 0);

  return {
    anchorMatches,
    anchorHits,
    setupHits,
    payoffHits,
    executionHits,
    backstageHits,
    isSetupHeavy,
    hasConcreteExecution,
  };
}

function sharesAnchor(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.some(item => rightSet.has(item));
}

function summarizeAnchors(card: ChapterPromiseCard, anchorKeywords: string[]): string {
  if (anchorKeywords.length > 0) {
    return anchorKeywords.slice(0, 3).join('、');
  }
  return card.requiredScene.label;
}

export function detectDeferredPayoffPressure(params: {
  card: ChapterPromiseCard;
  recentChapterContents: string[];
}): DeferredPayoffPressure {
  const { card, recentChapterContents } = params;
  const inspected = recentChapterContents
    .slice(-3)
    .map(content => inspectChapterProgress(card, content));
  const chain: ChapterPromiseProgressSnapshot[] = [];

  for (let index = inspected.length - 1; index >= 0; index -= 1) {
    const current = inspected[index];
    if (!current.isSetupHeavy || current.anchorMatches.length === 0) {
      break;
    }
    if (chain.length > 0 && !sharesAnchor(current.anchorMatches, chain[0].anchorMatches)) {
      break;
    }
    chain.unshift(current);
  }

  const repeatedSetupChapters = chain.length;
  const anchorKeywords = uniqueKeywords(chain.flatMap(item => item.anchorMatches)).slice(0, 4);
  if (repeatedSetupChapters < 2) {
    return {
      active: false,
      repeatedSetupChapters,
      anchorKeywords,
      summary: 'recent chapters do not show repeated deferred payoff',
    };
  }

  const anchorLabel = summarizeAnchors(card, anchorKeywords);
  return {
    active: true,
    repeatedSetupChapters,
    anchorKeywords,
    summary: `最近 ${repeatedSetupChapters} 章连续在预热「${anchorLabel}」，主回报还没有真正落地。`,
    directive: [
      `连续 ${repeatedSetupChapters} 章已经在预热「${anchorLabel}」。`,
      `本章必须直接进入 ${anchorLabel} 对应现场，并给出可见结果。`,
      '禁止继续只写后台试探、台本调整、流程准备、倒计时或风暴前夜。',
    ].join(''),
  };
}

export function analyzeDelayedPayoff(params: {
  card: ChapterPromiseCard;
  chapterContent: string;
  recentChapterContents: string[];
}): DelayedPayoffAnalysis {
  const pressure = detectDeferredPayoffPressure({
    card: params.card,
    recentChapterContents: params.recentChapterContents,
  });
  const current = inspectChapterProgress(params.card, params.chapterContent);
  const triggered = pressure.active && current.isSetupHeavy && !current.hasConcreteExecution;
  const anchorLabel = summarizeAnchors(params.card, pressure.anchorKeywords);

  return {
    ...pressure,
    triggered,
    currentSetupHeavy: current.isSetupHeavy,
    currentConcreteExecution: current.hasConcreteExecution,
    summary: triggered
      ? `最近已连续 ${pressure.repeatedSetupChapters} 章预热「${anchorLabel}」，本章仍停在准备/试探，没有真正进入兑现现场。`
      : pressure.summary,
  };
}
