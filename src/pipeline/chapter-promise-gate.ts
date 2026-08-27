import type { ChapterPromiseCard } from './chapter-promise-card.js';
import { analyzeDelayedPayoff } from './chapter-promise-delay.js';
import {
  RITUAL_MECHANIC_DRIFT_KEYWORDS,
  WAR_STATECRAFT_ANCHOR_KEYWORDS,
} from './domain-drift-keywords.js';
import { getTopicProfileById } from './topic-profiles.js';

export type ChapterPromiseGateMode = 'off' | 'warn' | 'strict';

export type ChapterPromiseGateFinding = {
  code:
    | 'missing-primary-payoff'
    | 'missing-signature-scene'
    | 'forbidden-substitution-dominant'
    | 'system-evidence-substitution'
    | 'startup-result-not-landed'
    | 'off-promise-ending-hook'
    | 'forbidden-opening-substitution'
    | 'overpacked-startup-scope'
    | 'deferred-payoff-loop'
    | 'private-deal-dominant'
    | 'off-domain-ritual-mechanic';
  level: 'warn' | 'error';
  message: string;
};

export type ChapterPromiseGateReport = {
  gateMode: ChapterPromiseGateMode;
  chapterNumber: number;
  phase: ChapterPromiseCard['phase'];
  payoffHits: number;
  optionalPayoffHits: number;
  sceneHits: number;
  forbiddenHits: number;
  passed: boolean;
  findings: ChapterPromiseGateFinding[];
  summary: string;
};

type EvaluateChapterPromiseGateParams = {
  chapterContent: string;
  chapterNumber: number;
  gateMode: ChapterPromiseGateMode;
  card: ChapterPromiseCard;
  recentChapterContents?: string[];
};

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

function countRegexHits(text: string, regex: RegExp): number {
  const matches = text.match(new RegExp(regex.source, 'g'));
  return matches ? matches.length : 0;
}

function uniqueKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map(item => item.trim()).filter(Boolean))];
}

function collectTopicPayoffKeywords(card: ChapterPromiseCard): string[] {
  return uniqueKeywords((card.topicIds ?? [])
    .map(id => getTopicProfileById(id))
    .filter((profile): profile is NonNullable<ReturnType<typeof getTopicProfileById>> => Boolean(profile))
    .flatMap(profile => profile.requiredPayoffKeywords));
}

function collectTopicSceneKeywords(card: ChapterPromiseCard): string[] {
  return uniqueKeywords((card.topicIds ?? [])
    .map(id => getTopicProfileById(id))
    .filter((profile): profile is NonNullable<ReturnType<typeof getTopicProfileById>> => Boolean(profile))
    .flatMap(profile => profile.requiredSceneKeywords));
}

function collectEffectivePayoffKeywords(card: ChapterPromiseCard): string[] {
  return uniqueKeywords([
    ...card.requiredPayoff.keywords,
    ...(card.optionalPayoff?.keywords ?? []),
    ...collectTopicPayoffKeywords(card),
  ]);
}

function collectEffectiveSceneKeywords(card: ChapterPromiseCard): string[] {
  return uniqueKeywords([
    ...card.requiredScene.keywords,
    ...collectTopicSceneKeywords(card),
  ]);
}

const SHOWBIZ_PUBLIC_BATTLE_KEYWORDS = [
  '直播',
  '热搜',
  '片场',
  '试镜',
  '摄影棚',
  '拍摄区',
  '导演组',
  '摄影师',
  '镜头',
  '定妆',
  '录制',
  '微博',
  '评论区',
];

const SHOWBIZ_PRIVATE_DEAL_KEYWORDS = [
  '休息区',
  '休息室',
  '会客室',
  '办公室',
  '副总办公室',
  '大厦',
  '角落',
  '单独',
  '帘子',
  '文件夹',
  '律师函',
  '合同',
  '转账',
  '条件',
  '私下',
  '助理',
  '桌沿',
  '沙发',
  '茶几',
  '群聊截图',
  '道歉声明',
  '律师',
  '会所',
  '监控',
];

const SYSTEM_CUE_RE = /系统|光幕|倒计时|预警|风险关联|敌意标记/;
const FUTURE_FRAGMENT_RE =
  /画面一闪|破碎画面|破碎的画面|模糊画面|未来片段|未来画面|挤进脑海|脑海里闪过|弹窗|标签信息|看到.*画面/;
const CASE_FILE_DETAIL_RE =
  /项目结余款|报销单|审查组|财务副总监|内部审查|关联交易|账户|账号|流水|合同|酒店住宿费|修改金额|空壳公司|妻弟|法人|转账方/;
const DETAIL_AMOUNT_RE = /(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千万两零]+)万/;
const VENUE_DETAIL_RE = /兰亭|会所|包厢|监控|文件袋|采购款|设备采购款|子公司/;

export function evaluateChapterPromiseGate(params: EvaluateChapterPromiseGateParams): ChapterPromiseGateReport {
  const { chapterContent, chapterNumber, gateMode, card } = params;
  if (gateMode === 'off') {
    return {
      gateMode,
      chapterNumber,
      phase: card.phase,
      payoffHits: 0,
      optionalPayoffHits: 0,
      sceneHits: 0,
      forbiddenHits: 0,
      passed: true,
      findings: [],
      summary: 'chapter promise gate disabled',
    };
  }

  const level: ChapterPromiseGateFinding['level'] = gateMode === 'strict' ? 'error' : 'warn';
  const scope = chapterContent.slice(0, card.phase === 'startup' ? 3200 : 4200);
  const openingWindow = chapterContent.slice(0, 1200);
  const endingWindow = chapterContent.slice(Math.max(0, chapterContent.length - 360));
  const earlyWindow = chapterContent.slice(0, 2200);
  const effectivePayoffKeywords = collectEffectivePayoffKeywords(card);
  const effectiveSceneKeywords = collectEffectiveSceneKeywords(card);
  const payoffHits = countKeywordHits(scope, effectivePayoffKeywords);
  const optionalPayoffHits = countKeywordHits(scope, card.optionalPayoff?.keywords ?? []);
  const sceneHits = countKeywordHits(scope, effectiveSceneKeywords);
  const forbiddenHits = countKeywordHits(scope, card.forbiddenSubstitutions.flatMap(item => item.keywords));
  const warStatecraftHits = card.genreFocus === 'war-statecraft'
    ? countKeywordHits(scope, [...new Set([
        ...effectivePayoffKeywords,
        ...effectiveSceneKeywords,
        ...WAR_STATECRAFT_ANCHOR_KEYWORDS,
      ])])
    : 0;
  const ritualMechanicHits = card.genreFocus === 'war-statecraft'
    ? countKeywordHits(scope, RITUAL_MECHANIC_DRIFT_KEYWORDS)
    : 0;
  const openingSceneHits = countKeywordHits(openingWindow, effectiveSceneKeywords);
  const openingForbiddenHits = countKeywordHits(openingWindow, card.forbiddenSubstitutions.flatMap(item => item.keywords));
  const endingPayoffHits = countKeywordHits(endingWindow, [
    ...effectivePayoffKeywords,
    ...effectiveSceneKeywords,
  ]);
  const endingForbiddenHits = countKeywordHits(endingWindow, card.forbiddenSubstitutions.flatMap(item => item.keywords));
  const findings: ChapterPromiseGateFinding[] = [];
  const dayJumpMatch = chapterContent.match(/第二天|次日|翌日|隔天|第二日上午|第二天下午|第二日|翌日下午|翌日上午/);
  const delayedPayoffAnalysis = analyzeDelayedPayoff({
    card,
    chapterContent,
    recentChapterContents: params.recentChapterContents ?? [],
  });
  const publicBattleHits = card.genreFocus === 'showbiz'
    ? countKeywordHits(scope, SHOWBIZ_PUBLIC_BATTLE_KEYWORDS)
    : 0;
  const privateDealHits = card.genreFocus === 'showbiz'
    ? countKeywordHits(scope, SHOWBIZ_PRIVATE_DEAL_KEYWORDS)
    : 0;
  const earlyPublicBattleHits = card.genreFocus === 'showbiz'
    ? countKeywordHits(earlyWindow, SHOWBIZ_PUBLIC_BATTLE_KEYWORDS)
    : 0;
  const earlyPrivateDealHits = card.genreFocus === 'showbiz'
    ? countKeywordHits(earlyWindow, SHOWBIZ_PRIVATE_DEAL_KEYWORDS)
    : 0;
  const systemEvidenceSubstitution =
    (card.genreFocus === 'showbiz' || card.genreFocus === 'system')
    && SYSTEM_CUE_RE.test(scope)
    && (
      FUTURE_FRAGMENT_RE.test(scope)
      || (
        countKeywordHits(scope, ['系统', '光幕', '预警']) >= 1
        && (
          countRegexHits(scope, CASE_FILE_DETAIL_RE) >= 2
          || (countRegexHits(scope, DETAIL_AMOUNT_RE) >= 1 && countRegexHits(scope, VENUE_DETAIL_RE) >= 1)
        )
      )
    );

  if (payoffHits <= 0) {
    findings.push({
      code: 'missing-primary-payoff',
      level,
      message: `本章没有兑现承诺卡要求的主回报：${card.requiredPayoff.label}。`,
    });
  }
  if (sceneHits <= 0) {
    findings.push({
      code: 'missing-signature-scene',
      level,
      message: `本章没有落到承诺卡要求的主场景：${card.requiredScene.label}。`,
    });
  }
  if (forbiddenHits >= 3 && forbiddenHits > payoffHits + optionalPayoffHits + sceneHits) {
    findings.push({
      code: 'forbidden-substitution-dominant',
      level,
      message: '调查/秘密/预案/排查类内容正在替代题材主回报，章节已偏离宪章。',
    });
  }
  if (
    card.genreFocus === 'war-statecraft'
    && ritualMechanicHits >= 4
    && ritualMechanicHits >= Math.max(2, warStatecraftHits)
  ) {
    findings.push({
      code: 'off-domain-ritual-mechanic',
      level,
      message: `战争/权谋章节被祭坛、钥匙、坐标、碎片、秘门等机制接管（漂移=${ritualMechanicHits}，军政=${warStatecraftHits}），已经背离简介和蓝图。`,
    });
  }
  if (systemEvidenceSubstitution) {
    findings.push({
      code: 'system-evidence-substitution',
      level,
      message: '系统/预警正在用未来片段或案卷级细节代替现实来源，主角的反击失去真实边界。',
    });
  }
  if (card.startupMustLandResult && (payoffHits <= 0 || sceneHits <= 0)) {
    findings.push({
      code: 'startup-result-not-landed',
      level,
      message: '冷启动章节必须当章落结果，不能只停在计划、试探或信息推进。',
    });
  }
  if (card.startupMustLandResult && openingForbiddenHits >= 3 && openingForbiddenHits > openingSceneHits) {
    findings.push({
      code: 'forbidden-opening-substitution',
      level,
      message: '冷启动开头被禁区内容接管了，应该先上题材主场景和主回报，而不是技术潜入/调查/预案。',
    });
  }
  if (card.startupMustLandResult && dayJumpMatch?.index != null && dayJumpMatch.index > 0) {
    const beforeJump = chapterContent.slice(0, dayJumpMatch.index);
    const afterJump = chapterContent.slice(dayJumpMatch.index);
    const beforePayoffHits = countKeywordHits(beforeJump, effectivePayoffKeywords);
    const beforeForbiddenHits = countKeywordHits(beforeJump, card.forbiddenSubstitutions.flatMap(item => item.keywords));
    const afterPayoffHits = countKeywordHits(afterJump, effectivePayoffKeywords);
    const afterSceneHits = countKeywordHits(afterJump, effectiveSceneKeywords);
    if ((beforePayoffHits > 0 || beforeForbiddenHits > 0) && (afterPayoffHits > 0 || afterSceneHits > 0)) {
      findings.push({
        code: 'overpacked-startup-scope',
        level,
        message: '冷启动章节在已经落一轮结果后又跨天推进新主场景，像把两章内容塞进了一章。',
      });
    }
  }
  if (card.genreFocus !== 'generic' && endingForbiddenHits >= 2 && endingForbiddenHits > endingPayoffHits) {
    findings.push({
      code: 'off-promise-ending-hook',
      level,
      message: `章末钩子正在偏向禁区内容，应该优先收在：${card.preferredEndingFocus.join('、')}。`,
    });
  }
  if (delayedPayoffAnalysis.triggered) {
    findings.push({
      code: 'deferred-payoff-loop',
      level,
      message: `${delayedPayoffAnalysis.summary} 下一章级别的公开兑现，不能再拖。`,
    });
  }
  if (
    card.genreFocus === 'showbiz'
    && card.phase === 'startup'
    && (
      (privateDealHits >= 4 && privateDealHits > publicBattleHits + 1)
      || (earlyPrivateDealHits >= 3 && earlyPrivateDealHits > earlyPublicBattleHits + 1)
      || (earlyPrivateDealHits >= 4 && earlyPublicBattleHits <= 1)
    )
  ) {
    findings.push({
      code: 'private-deal-dominant',
      level,
      message: '娱乐圈冷启动章被私下谈判吃掉太多篇幅，直播/热搜/片场这类公开战场不够强。',
    });
  }

  const passed = findings.length === 0;
  const summary = passed
    ? `chapter promise gate passed (payoff=${payoffHits}, scene=${sceneHits}, forbidden=${forbiddenHits})`
    : `chapter promise gate found ${findings.length} issue(s) (payoff=${payoffHits}, scene=${sceneHits}, forbidden=${forbiddenHits})`;

  return {
    gateMode,
    chapterNumber,
    phase: card.phase,
    payoffHits,
    optionalPayoffHits,
    sceneHits,
    forbiddenHits,
    passed,
    findings,
    summary,
  };
}

export function buildChapterPromiseGateFixHints(card: ChapterPromiseCard, report: ChapterPromiseGateReport): string {
  const payoffKeywords = collectEffectivePayoffKeywords(card);
  const sceneKeywords = collectEffectiveSceneKeywords(card);
  const lines: string[] = [
    '## 章节承诺门禁修正（必须落实）',
    `- 本章主回报必须改成：${card.requiredPayoff.label}。关键词可直接落地：${payoffKeywords.slice(0, 12).join('、')}。`,
    `- 本章主要冲突必须放回：${card.requiredScene.label}。关键词可直接落地：${sceneKeywords.slice(0, 12).join('、')}。`,
  ];

  if (card.optionalPayoff) {
    lines.push(`- 若篇幅允许，可补一个辅回报：${card.optionalPayoff.label}。`);
  }

  if (report.findings.some(item => item.code === 'forbidden-substitution-dominant')) {
    lines.push(`- 压缩或删除这些替代性内容：${card.forbiddenSubstitutions.map(item => item.label).join('、')}。`);
  }
  if (report.findings.some(item => item.code === 'off-domain-ritual-mechanic')) {
    lines.push('- 删除或降级祭坛、钥匙、坐标、碎片、秘门、封印、传送等伪主线机制；它们最多只能做一句背景压力。');
    lines.push('- 把同等篇幅改回战争/权谋蓝图：攻城破城、收编残兵、军令执行、兵权争夺、废奴政令、军功爵、科举/国子监、旧贵族反扑。');
    lines.push('- 章末必须收在战场结果、城门控制、兵权/政令变化或敌方军政反制上，不能收在“第三门打开/坐标锁定/钥匙碎片集齐”。');
  }
  if (report.findings.some(item => item.code === 'system-evidence-substitution')) {
    lines.push('- 删除系统提供的未来片段、模糊画面、报销单/账户/合同等案卷级细节，不要再让系统替代现实证据。');
    lines.push('- 若主角要反击，只能说到系统已经建立过的标签级信息，或补一个现场可见来源。');
    lines.push('- 不能写“她忽然知道账号/金额/尾号/会所/监控/合同细节”；没有现场来源就整段删除。');
    lines.push('- 把反击改写成公开现场可见信号驱动：直播异常、片场清场、品牌方撤物料、热搜爬升、工作人员反应、当事人口风变化。');
  }
  if (report.findings.some(item => item.code === 'forbidden-opening-substitution')) {
    lines.push(`- 开头 1200 字必须先进入：${card.requiredScene.label}，不要以技术潜入、密码破解、调查排查起章。`);
  }
  if (report.findings.some(item => item.code === 'overpacked-startup-scope')) {
    lines.push('- 当前冷启动章内容过满：已经落完第一轮结果后，不要再跨天开启第二个主场景，应拆到下一章。');
  }
  if (report.findings.some(item => item.code === 'deferred-payoff-loop')) {
    lines.push(`- 最近连续在预热同一场事件，本章必须直接进入：${card.requiredScene.label} 对应的公开兑现现场。`);
    lines.push('- 禁止继续只写后台试探、流程讨论、临场准备、倒计时或风暴前夜。');
    lines.push(`- 本章至少要给出一次可见结果：${payoffKeywords.slice(0, 12).join('、')}，或者把结果公开打到场面上。`);
  }
  if (report.findings.some(item => item.code === 'private-deal-dominant')) {
    lines.push('- 娱乐圈章的私下交易戏过重，至少删掉一半休息室/会客室谈判，把回报移回直播、热搜、片场、定妆、围观反馈这些公开战场。');
    lines.push('- 如果保留谈判，它只能服务于公开结果，不能替代公开结果本身。');
  }

  if (card.startupMustLandResult) {
    lines.push('- 冷启动章必须让读者看到“结果已经发生”，不能只看到计划、预案、试探、调查。');
  }

  lines.push(`- 章末钩子优先用：${card.allowedHookTypes.join('、')}，并把最后落点收在：${card.preferredEndingFocus.join('、')}。`);
  return lines.join('\n');
}
