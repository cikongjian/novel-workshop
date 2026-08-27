import type { StartupPlatformProfile } from './startup-retention-hints.js';
import { NOVEL_CONSTITUTION_TAG_IDS } from '../config/novel-constitution-tags.js';
import {
  SHOWBIZ_WARNING_BLUEPRINT,
  SHOWBIZ_WARNING_SIGNAL,
} from './showbiz-warning-profile.js';
import { EXTRA_PROMISE_CONSTITUTION_SIGNALS } from './promise-contract-domain-signals.js';

export type PromiseProfileId =
  | 'generic'
  | 'constitution'
  | 'fanqie-showbiz-warning-rise'
  | 'fanqie-entertainment-rise'
  | 'fanqie-shame-system'
  | 'fanqie-female-career';

export type PromiseContract = {
  profileId: PromiseProfileId;
  constitutionSignals: string[];
  mainPromise: string;
  secondaryPromises: string[];
  requiredPayoffKeywords: string[];
  requiredSceneKeywords: string[];
  suspenseDriftKeywords: string[];
  maxSuspenseShare: number;
  directionHint?: string;
  openingHint?: string;
  payoffHint?: string;
  antiDriftHint?: string;
  summary: string;
};

export type PromiseDriftReport = {
  active: boolean;
  promiseHits: number;
  sceneHits: number;
  suspenseHits: number;
  suspenseShare: number;
  missingPrimaryPayoff: boolean;
  drifting: boolean;
  summary: string;
};

type BuildPromiseContractParams = {
  title: string;
  synopsis?: string;
  tags?: string[];
  constitutionTags?: string[];
  genre?: string;
  platformProfile?: StartupPlatformProfile;
};

type PromiseProfileBlueprint = Omit<PromiseContract, 'summary'>;

type ConstitutionSignal = {
  id: string;
  patterns: RegExp[];
  requiredPayoffKeywords?: string[];
  requiredSceneKeywords?: string[];
  suspenseDriftKeywords?: string[];
  maxSuspenseShare?: number;
  directionHint?: string;
  openingHint?: string;
  payoffHint?: string;
  antiDriftHint?: string;
};

const GENERIC_SUSPENSE_KEYWORDS = [
  '真相',
  '秘密',
  '线索',
  '调查',
  '监控',
  '匿名',
  '录音',
  '抹除',
  '幕后',
  '试探',
  '异常',
  '谜团',
  '证据',
  '来源',
];

function normalizeText(value: string | undefined | null): string {
  return String(value ?? '').trim();
}

function joinSourceText(params: BuildPromiseContractParams): string {
  return [
    normalizeText(params.title),
    normalizeText(params.synopsis),
    ...(params.constitutionTags ?? []),
    ...(params.tags ?? []),
    normalizeText(params.genre),
  ].join('\n');
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
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

function createBlueprint(blueprint: PromiseProfileBlueprint): PromiseContract {
  return {
    ...blueprint,
    summary: `题材宪法：主承诺=${blueprint.mainPromise}；副承诺=${blueprint.secondaryPromises.join('、') || '无'}。`,
  };
}

function mergeUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

const CONSTITUTION_SIGNALS: ConstitutionSignal[] = [
  SHOWBIZ_WARNING_SIGNAL,
  {
    id: 'rebirth',
    patterns: [/(重生|前世|重回|再来一次|改命|预知)/],
    requiredPayoffKeywords: ['截胡', '抢先', '改命', '避开', '先手', '改写'],
    requiredSceneKeywords: ['重生', '前世', '预知', '改写'],
    maxSuspenseShare: 0.42,
    directionHint: '小说卡片含有“重生”信号，必须把先知优势写成即时收益或反杀，不要只留下新的谜团。',
    payoffHint: '前段至少出现一次“知道未来所以抢先/避坑/反抢”的兑现动作。',
    antiDriftHint: '重生文的信息差要转成收益，不是转成调查幕后来源。',
  },
  {
    id: 'faceslap',
    patterns: [/(打脸|爽文|逆袭|翻盘|反杀|踩脸)/],
    requiredPayoffKeywords: ['打脸', '震惊', '后悔', '翻车', '碾压', '跪了'],
    maxSuspenseShare: 0.38,
    directionHint: '小说卡片含有“打脸/爽文”信号，必须优先写压人、反杀、围观反应，不要空转悬疑。',
    payoffHint: '每章前段都该有一次可见情绪回报，不要让“发现秘密”顶替“打脸”。',
  },
  {
    id: 'sweet',
    patterns: [/(甜宠|爽甜|甜文|高甜|恋爱|心动)/],
    requiredPayoffKeywords: ['心动', '护短', '偏爱', '吃醋', '靠近', '抱住'],
    maxSuspenseShare: 0.34,
    directionHint: '小说卡片含有“甜”信号，关系拉扯和情绪回报必须前置，不要被解谜抢走。',
  },
  {
    id: 'female-career',
    patterns: [/(大女主|事业线|独美|无cp|无CP|职场文|职场事业|项目交付|客户签约|签约回报|升职)/],
    requiredPayoffKeywords: ['项目', '升职', '签约', '客户', '反杀', '开除', '站队'],
    requiredSceneKeywords: ['会议室', '办公室', '项目组', '客户', '合同'],
    maxSuspenseShare: 0.42,
    directionHint: '小说卡片含有“事业线/大女主”信号，公开反击和事业推进必须优先，不得主写幕后调查。',
  },
  {
    id: 'fantasy-upgrade',
    patterns: [/(玄幻|修仙|修真|灵根|秘境|宗门|金手指|境界|灵气|法宝|练气|筑基|修炼升级|战力升级)/],
    requiredPayoffKeywords: ['突破', '升级', '觉醒', '机缘', '斩杀', '拿下'],
    requiredSceneKeywords: ['宗门', '秘境', '擂台', '洞府', '灵根', '功法'],
    maxSuspenseShare: 0.44,
    directionHint: '小说卡片含有“玄幻/升级”信号，必须优先给境界、机缘、碾压或资源回报，不要写成探案文。',
  },
  ...EXTRA_PROMISE_CONSTITUTION_SIGNALS,
];

function detectConstitutionSignals(params: BuildPromiseContractParams): string[] {
  const text = joinSourceText(params);
  const explicit = new Set(
    (params.constitutionTags ?? []).filter((item): item is string => NOVEL_CONSTITUTION_TAG_IDS.includes(item as any)),
  );
  for (const id of explicit) {
    if (id === 'female-career') explicit.add('female-career');
  }
  for (const signal of CONSTITUTION_SIGNALS) {
    if (includesAny(text, signal.patterns)) {
      explicit.add(signal.id);
    }
  }
  return [...explicit];
}

function applyConstitutionSignals(
  contract: PromiseContract,
  params: BuildPromiseContractParams,
): PromiseContract {
  const signalIds = detectConstitutionSignals(params);
  if (signalIds.length === 0) {
    return {
      ...contract,
      summary: `${contract.summary} 强制来源：小说卡片分类/标签优先于通用悬念模板。`,
    };
  }

  const signals = CONSTITUTION_SIGNALS.filter(signal => signalIds.includes(signal.id));
  let maxSuspenseShare = contract.maxSuspenseShare;
  const directionHints: string[] = [];
  const openingHints: string[] = [];
  const payoffHints: string[] = [];
  const antiDriftHints: string[] = [];

  for (const signal of signals) {
    contract.requiredPayoffKeywords = mergeUnique([
      ...contract.requiredPayoffKeywords,
      ...(signal.requiredPayoffKeywords ?? []),
    ]);
    contract.requiredSceneKeywords = mergeUnique([
      ...contract.requiredSceneKeywords,
      ...(signal.requiredSceneKeywords ?? []),
    ]);
    contract.suspenseDriftKeywords = mergeUnique([
      ...(signal.suspenseDriftKeywords ?? []),
      ...contract.suspenseDriftKeywords,
    ]);
    if (signal.maxSuspenseShare != null) {
      maxSuspenseShare = Math.min(maxSuspenseShare, signal.maxSuspenseShare);
    }
    if (signal.directionHint) directionHints.push(signal.directionHint);
    if (signal.openingHint) openingHints.push(signal.openingHint);
    if (signal.payoffHint) payoffHints.push(signal.payoffHint);
    if (signal.antiDriftHint) antiDriftHints.push(signal.antiDriftHint);
  }

  return {
    ...contract,
    constitutionSignals: mergeUnique([...contract.constitutionSignals, ...signalIds]),
    maxSuspenseShare,
    directionHint: [
      '## 题材宪法（高于通用悬念）',
      '- 小说卡片上的分类与标签属于硬约束，必须先兑现这些幻想，再处理秘密和来源。',
      contract.directionHint,
      ...directionHints,
    ].filter(Boolean).join('\n'),
    openingHint: mergeUnique([contract.openingHint ?? '', ...openingHints]).join('\n'),
    payoffHint: mergeUnique([contract.payoffHint ?? '', ...payoffHints]).join('\n'),
    antiDriftHint: mergeUnique([contract.antiDriftHint ?? '', ...antiDriftHints]).join('\n'),
    summary: `${contract.summary} 强制标签：${signalIds.join(' / ')}。小说卡片标签优先级高于通用悬疑驱动。`,
  };
}

function buildShowbizWarningRiseBlueprint(): PromiseContract {
  return createBlueprint(SHOWBIZ_WARNING_BLUEPRINT);
}

function buildEntertainmentRiseBlueprint(): PromiseContract {
  return createBlueprint({
    profileId: 'fanqie-entertainment-rise',
    constitutionSignals: ['showbiz'],
    mainPromise: '娱乐圈逆袭与名利场反杀',
    secondaryPromises: ['资源兑现', '影帝/贵人站队', '舆论放大'],
    requiredPayoffKeywords: [
      '试镜',
      '角色',
      '导演',
      '剧组',
      '合同',
      '热搜',
      '通稿',
      '资源',
      '番位',
      '站队',
      '压戏',
      '爆了',
      '翻红',
      '黑红',
      '出道',
    ],
    requiredSceneKeywords: [
      '片场',
      '试镜间',
      '导演组',
      '节目组',
      '经纪人',
      '综艺',
      '直播',
      '后台',
      '微博',
      '评论区',
    ],
    suspenseDriftKeywords: [...GENERIC_SUSPENSE_KEYWORDS, '删评', '暗网', '资本网络'],
    maxSuspenseShare: 0.42,
    directionHint: [
      '## 题材承诺合同（娱乐圈逆袭）',
      '- 前三章的主驱动力必须是娱乐圈场景里的赢、翻、压、抢、红，不是查秘密。',
      '- 允许有黑幕线，但黑幕只能做辅线，不能抢走资源争夺、试镜打脸、舆论反杀的主位。',
    ].join('\n'),
    openingHint: '开头优先落在试镜、剧组、节目组、资源争夺、舆论发酵这类可视化场景，不要先查幕后。',
    payoffHint: '本章至少兑现一次娱乐圈可见回报：拿到角色、压住对家、热搜起爆、贵人站队、资源反抢，至少一项。',
    antiDriftHint: '如果正文前段主要在删评、调查、监控、线索、匿名短信上打转，说明已经偏成悬疑，必须改回娱乐圈正面冲突。',
  });
}

function buildShameSystemBlueprint(): PromiseContract {
  return createBlueprint({
    profileId: 'fanqie-shame-system',
    constitutionSignals: ['shame-system'],
    mainPromise: '羞耻任务驱动的社死喜剧',
    secondaryPromises: ['任务惩罚', '围观反应', '关系翻车或升温'],
    requiredPayoffKeywords: [
      '任务',
      '惩罚',
      '奖励',
      '羞耻',
      '社死',
      '脸红',
      '围观',
      '起哄',
      '翻车',
      '嘴硬',
      '尴尬',
      '积分',
      '公开处刑',
    ],
    requiredSceneKeywords: [
      '系统',
      '任务栏',
      '倒计时',
      '围观',
      '同学',
      '同事',
      '弹幕',
      '现场',
      '大厅',
      '教室',
    ],
    suspenseDriftKeywords: [...GENERIC_SUSPENSE_KEYWORDS, '绑定原因', '系统来源', '幕后操控'],
    maxSuspenseShare: 0.35,
    directionHint: [
      '## 题材承诺合同（羞耻系统喜剧）',
      '- 前三章主驱动力必须是任务执行、社死现场、惩罚升级、关系变化，不是研究系统来源。',
      '- 系统可以神秘，但神秘感只能做调味，不能代替笑点和社死回报。',
    ].join('\n'),
    openingHint: '开头优先让任务触发并立刻把主角推入尴尬现场，不要先写系统解释。',
    payoffHint: '本章至少兑现一次社死或惩罚回报，并放大围观反应，让读者看到主角当场翻车或硬撑。',
    antiDriftHint: '如果正文主要在分析系统规则、来源、幕后黑手，而没有社死动作和围观反应，说明已经偏成解谜文。',
  });
}

function buildFemaleCareerBlueprint(): PromiseContract {
  return createBlueprint({
    profileId: 'fanqie-female-career',
    constitutionSignals: ['female-career'],
    mainPromise: '女性事业线逆袭与情绪宣泄',
    secondaryPromises: ['职场反杀', '关系站位变化', '去恋爱脑化成长'],
    requiredPayoffKeywords: [
      '升职',
      '项目',
      '反杀',
      '打脸',
      '签约',
      '抢回',
      '站队',
      '独立',
      '开除',
      '爆单',
      '发疯',
    ],
    requiredSceneKeywords: [
      '会议室',
      '项目组',
      '办公室',
      '合同',
      '汇报',
      '客户',
      '舆论',
      '公司',
    ],
    suspenseDriftKeywords: GENERIC_SUSPENSE_KEYWORDS,
    maxSuspenseShare: 0.45,
    directionHint: [
      '## 题材承诺合同（女性事业逆袭）',
      '- 前三章优先给事业推进、情绪宣泄、公开反击，不要把主线写成幕后调查。',
    ].join('\n'),
    openingHint: '开头优先用职场或公众场景里的压迫和反击触发阅读惯性。',
    payoffHint: '本章至少给一次事业线可见回报或公开反杀，不能只给情报进展。',
    antiDriftHint: '如果前段主要在铺幕后秘密，说明事业线爽感被抽空了，必须补回公开冲突和结果。',
  });
}

export function buildPromiseContract(params: BuildPromiseContractParams): PromiseContract {
  const text = joinSourceText(params);
  const profile = params.platformProfile ?? 'auto';

  if (
    profile === 'fanqie'
    && includesAny(text, [/(娱乐圈|影帝|顶流|试镜|剧组|综艺|经纪人|出道|热搜)/])
    && includesAny(text, SHOWBIZ_WARNING_SIGNAL.patterns)
  ) {
    return applyConstitutionSignals(buildShowbizWarningRiseBlueprint(), params);
  }

  if (profile === 'fanqie' && includesAny(text, [/(娱乐圈|影帝|顶流|试镜|剧组|综艺|经纪人|出道|热搜)/])) {
    return applyConstitutionSignals(buildEntertainmentRiseBlueprint(), params);
  }

  if (
    profile === 'fanqie'
    && includesAny(text, [/(羞耻系统|社死系统|羞耻|社死)/, /(系统)/])
    && includesAny(text, [/(羞耻|社死|尴尬|脸红|公开处刑|嘴硬)/])
  ) {
    return applyConstitutionSignals(buildShameSystemBlueprint(), params);
  }

  if (profile === 'fanqie' && includesAny(text, [/(无cp|无CP|大女主|事业线|独美|发疯|逆袭)/])) {
    return applyConstitutionSignals(buildFemaleCareerBlueprint(), params);
  }

  return applyConstitutionSignals(createBlueprint({
    profileId: 'generic',
    constitutionSignals: [],
    mainPromise: '卖点兑现优先于谜团堆叠',
    secondaryPromises: ['可视化回报', '题材主场景', '章尾追读点'],
    requiredPayoffKeywords: [],
    requiredSceneKeywords: [],
    suspenseDriftKeywords: GENERIC_SUSPENSE_KEYWORDS,
    maxSuspenseShare: 0.5,
    directionHint: [
      '## 题材承诺合同（通用）',
      '- 先兑现书名和简介承诺的幻想，再补谜团；不要让秘密感取代题材回报。',
    ].join('\n'),
    openingHint: '开头优先用本题材最有辨识度的场景和动作，不要用泛化悬疑替代。',
    payoffHint: '本章前半段至少给一次可见回报，不要把“发现线索”当唯一回报。',
    antiDriftHint: '如果前段的秘密、真相、调查词明显多于题材卖点词，说明已经偏题。',
  }), params);
}

export function evaluatePromiseDrift(
  chapterContent: string,
  contract: PromiseContract | undefined,
  options?: { windowChars?: number },
): PromiseDriftReport {
  if (!contract) {
    return {
      active: false,
      promiseHits: 0,
      sceneHits: 0,
      suspenseHits: 0,
      suspenseShare: 0,
      missingPrimaryPayoff: false,
      drifting: false,
      summary: 'promise drift inactive (no contract)',
    };
  }

  const windowChars = Math.max(400, options?.windowChars ?? 2800);
  const scoped = chapterContent.slice(0, windowChars);
  const promiseHits = countKeywordHits(scoped, contract.requiredPayoffKeywords);
  const sceneHits = countKeywordHits(scoped, contract.requiredSceneKeywords);
  const suspenseHits = countKeywordHits(scoped, contract.suspenseDriftKeywords);
  const totalSignalHits = promiseHits + sceneHits + suspenseHits;
  const suspenseShare = totalSignalHits > 0 ? suspenseHits / totalSignalHits : 0;
  const missingPrimaryPayoff = promiseHits === 0;
  const drifting = suspenseHits >= 2
    && (missingPrimaryPayoff || suspenseShare > contract.maxSuspenseShare)
    && suspenseHits > promiseHits + sceneHits;

  const summary = drifting
    ? `promise drift detected: suspense=${suspenseHits}, promise=${promiseHits}, scenes=${sceneHits}`
    : `promise aligned: suspense=${suspenseHits}, promise=${promiseHits}, scenes=${sceneHits}`;

  return {
    active: true,
    promiseHits,
    sceneHits,
    suspenseHits,
    suspenseShare,
    missingPrimaryPayoff,
    drifting,
    summary,
  };
}
