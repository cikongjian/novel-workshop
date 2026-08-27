import type { StartupPlatformProfile } from './startup-retention-hints.js';
import {
  evaluatePromiseDrift,
  type PromiseContract,
  type PromiseDriftReport,
} from './promise-contract.js';
import {
  detectStartupOpeningOverload,
  type StartupOpeningOverloadReport,
} from './startup-opening-overload.js';
import { evaluateStartupTopicOpeningSignals } from './startup-opening-topic-signals.js';

export type StartupOpeningGateFinding = {
  code:
    | 'weak-first-screen'
    | 'unclear-goal'
    | 'unclear-obstacle'
    | 'weak-early-payoff'
    | 'weak-ending-hook'
    | 'heavy-exposition'
    | 'weak-platform-fit'
    | 'missing-promise-payoff'
    | 'suspense-drift'
    | 'overloaded-opening'
    | 'word-count-overrun';
  level: 'warn';
  message: string;
};

export type StartupOpeningGateReport = {
  enabled: boolean;
  chapterNumber: number;
  gateMode: 'warn' | 'strict';
  platformProfile: StartupPlatformProfile;
  openingScore: number;
  clarityScore: number;
  payoffScore: number;
  endingHookScore: number;
  platformFitScore: number;
  promiseConsistencyScore: number;
  overallScore: number;
  passed: boolean;
  overrunChars: number;
  promiseDrift?: PromiseDriftReport;
  overload?: StartupOpeningOverloadReport;
  findings: StartupOpeningGateFinding[];
  summary: string;
};

export type StartupOpeningReport = StartupOpeningGateReport;

const FIRST_SCREEN_WINDOW = 320;
const GOAL_WINDOW = 1000;
const PAYOFF_WINDOW = 2600;
const ENDING_WINDOW = 260;
const WORLD_SETUP_WINDOW = 1200;
const LONG_PROMISE_WINDOW = 2200;

const ACTION_RE = /冲|扑|抓|推|拉|砸|拔|刺|躲|追|跑|闯|打|杀|救|夺|斩|扑上|转身|推门|抬手|落下|按住|出手|扑过去/;
const HOOK_RE = /[？?！!]|突然|竟然|危机|失控|反转|追兵|伏击|来不及|生死|翻盘|当场|顶上|压住/;
const DIALOGUE_RE = /[“"「『][^”"」』]{2,80}[”"」』]/;
const GOAL_RE = /想要|必须|得先|打算|决定|目标|任务|为了|只想|得把|要做的|得拿下|准备拍|恢复拍|保住|准时到|去拍|上镜|开播|定妆/;
const OBSTACLE_RE = /但是|却|可偏偏|拦|挡|追杀|麻烦|危机|断了|没钱|受伤|暴露|失败|限制|封锁|怀疑|取消|换人|封杀|起诉|暂停|待定|不让拍|取消化妆/;
const PAYOFF_RE = /终于|反击|翻盘|赢了|拿到|突破|救下|击退|到账|夺回|斩落|压住|逼退|签下|爆了|站队|打脸/;
const WORLD_SETUP_RE = /规则|体系|境界|天赋|法则|组织|宗门|职业|路线|权限|副本|位阶|模块|面板|系统/;
const LONG_PROMISE_RE = /变强|升级|复仇|活下去|登顶|查清|夺回|守住|回去|翻案|掌控|下一阶段|第一步|主线/;
const EXPOSITION_RE = /据说|原来|曾经|那一年|很多年前|历史上|传闻|一直以来|众所周知|所谓|资料显示|介绍一下/;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function scoreBoolean(value: boolean, passScore: number, failScore: number): number {
  return value ? passScore : failScore;
}

function resolvePayoffWindow(params: {
  chapterNumber: number;
  maxWordCount?: number;
  targetWordCount?: number;
}): number {
  const target = params.maxWordCount ?? params.targetWordCount;
  if (!target) {
    return params.chapterNumber === 1 ? 1800 : PAYOFF_WINDOW;
  }
  if (params.chapterNumber !== 1) {
    return Math.max(1500, Math.min(PAYOFF_WINDOW, Math.floor(target * 0.82)));
  }
  return Math.max(1400, Math.min(2200, Math.floor(target * 0.75)));
}

function detectHeavyExposition(text: string): boolean {
  const expositionHits = text.match(new RegExp(EXPOSITION_RE.source, 'g'))?.length ?? 0;
  const actionHits = text.match(new RegExp(ACTION_RE.source, 'g'))?.length ?? 0;
  const dialogueHits = text.match(new RegExp(DIALOGUE_RE.source, 'g'))?.length ?? 0;
  return expositionHits >= 2 && actionHits + dialogueHits <= 1;
}

export function evaluateStartupOpeningGate(params: {
  chapterContent: string;
  chapterNumber: number;
  platformProfile: StartupPlatformProfile;
  promiseContract?: PromiseContract;
  maxWordCount?: number;
  targetWordCount?: number;
  gateMode?: 'warn' | 'strict';
}): StartupOpeningGateReport {
  const {
    chapterContent,
    chapterNumber,
    platformProfile,
    promiseContract,
    maxWordCount: rawMaxWordCount,
    targetWordCount,
    gateMode = 'warn',
  } = params;
  const maxWordCount = rawMaxWordCount ?? targetWordCount;
  if (chapterNumber < 1 || chapterNumber > 3) {
    return {
      enabled: false,
      chapterNumber,
      gateMode,
      platformProfile,
      openingScore: 100,
      clarityScore: 100,
      payoffScore: 100,
      endingHookScore: 100,
      platformFitScore: 100,
      promiseConsistencyScore: 100,
      overallScore: 100,
      passed: true,
      overrunChars: 0,
      promiseDrift: undefined,
      overload: undefined,
      findings: [],
      summary: '非首三章，不启用开篇门禁。',
    };
  }

  const firstScreen = chapterContent.slice(0, FIRST_SCREEN_WINDOW);
  const firstGoalWindow = chapterContent.slice(0, GOAL_WINDOW);
  const payoffWindowChars = resolvePayoffWindow({ chapterNumber, maxWordCount, targetWordCount });
  const payoffWindow = chapterContent.slice(0, payoffWindowChars);
  const endingWindow = chapterContent.slice(Math.max(0, chapterContent.length - ENDING_WINDOW));
  const worldWindow = chapterContent.slice(0, WORLD_SETUP_WINDOW);
  const longPromiseWindow = chapterContent.slice(0, LONG_PROMISE_WINDOW);
  const heavyExposition = detectHeavyExposition(chapterContent.slice(0, 800));
  const hasOpeningAction = ACTION_RE.test(firstScreen) || DIALOGUE_RE.test(firstScreen);
  const hasOpeningHook = HOOK_RE.test(firstScreen) || hasOpeningAction;
  const topicOpeningSignals = evaluateStartupTopicOpeningSignals({
    chapterContent,
    goalWindow: firstGoalWindow,
    payoffWindow,
    promiseContract,
  });
  const hasGoal = GOAL_RE.test(firstGoalWindow) || topicOpeningSignals.hasGoal;
  const hasObstacle = OBSTACLE_RE.test(firstGoalWindow) || topicOpeningSignals.hasObstacle;
  const hasPayoff = PAYOFF_RE.test(payoffWindow) || topicOpeningSignals.hasPayoff;
  const hasEndingHook = HOOK_RE.test(endingWindow);
  const hasWorldSetup = WORLD_SETUP_RE.test(worldWindow);
  const hasLongPromise = LONG_PROMISE_RE.test(longPromiseWindow);
  const overrunChars = maxWordCount ? Math.max(0, chapterContent.length - maxWordCount) : 0;
  const promiseDrift = evaluatePromiseDrift(chapterContent, promiseContract, {
    windowChars: chapterNumber === 1 ? 2400 : 3000,
  });
  const overload = detectStartupOpeningOverload({
    chapterContent,
    chapterNumber,
  });

  const findings: StartupOpeningGateFinding[] = [];

  if (!hasOpeningHook) {
    findings.push({ code: 'weak-first-screen', level: 'warn', message: '前 300 字缺少明确事件或可感知钩子，首屏抓力偏弱。' });
  }
  if (!hasGoal) {
    findings.push({ code: 'unclear-goal', level: 'warn', message: '前 1000 字没有清晰交代主角当前目标。' });
  }
  if (!hasObstacle) {
    findings.push({ code: 'unclear-obstacle', level: 'warn', message: '前 1000 字阻碍不够清楚，读者难以判断冲突强度。' });
  }
  if (!hasPayoff) {
    findings.push({ code: 'weak-early-payoff', level: 'warn', message: '前段缺少第一次回报或明显反馈，容易只剩铺垫。' });
  }
  if (!hasEndingHook) {
    findings.push({ code: 'weak-ending-hook', level: 'warn', message: '章末缺少明确追读点，收束过平。' });
  }
  if (heavyExposition) {
    findings.push({ code: 'heavy-exposition', level: 'warn', message: '开头背景说明偏重，动作和结果不够靠前。' });
  }
  if (overrunChars > 0) {
    findings.push({ code: 'word-count-overrun', level: 'warn', message: `章节超出目标字数 ${overrunChars} 字，冷启动期不利于节奏控制。` });
  }
  if (promiseDrift.active && promiseDrift.missingPrimaryPayoff) {
    findings.push({
      code: 'missing-promise-payoff',
      level: 'warn',
      message: '前段没有兑现题材主卖点的可见回报，读者容易觉得卖点没落地。',
    });
  }
  if (promiseDrift.active && promiseDrift.drifting) {
    findings.push({
      code: 'suspense-drift',
      level: 'warn',
      message: '前段的秘密/调查/真相信号强于题材回报，章节正在往悬疑化漂移。',
    });
  }
  if (overload.overloaded) {
    findings.push({
      code: 'overloaded-opening',
      level: 'warn',
      message: overload.reason ?? '首章在第一次兑现后又追加了过多推进，读感容易变成“这一章写了太多事”。',
    });
  }

  let openingScore = scoreBoolean(hasOpeningHook, 84, 48);
  if (heavyExposition) openingScore -= 16;
  openingScore = clamp(openingScore, 0, 100);

  let clarityScore = 35;
  if (hasGoal) clarityScore += 30;
  if (hasObstacle) clarityScore += 30;
  clarityScore = clamp(clarityScore, 0, 100);

  let payoffScore = scoreBoolean(hasPayoff, 82, 42);
  if (chapterNumber === 1 && !hasPayoff) payoffScore -= 6;
  payoffScore = clamp(payoffScore, 0, 100);

  const endingHookScore = scoreBoolean(hasEndingHook, 82, 45);
  const adjustedEndingHookScore = clamp(endingHookScore - (overload.overloaded ? 10 : 0), 0, 100);

  let platformFitScore = 62;
  if (platformProfile === 'fanqie') {
    if (hasOpeningHook) platformFitScore += 12;
    if (hasPayoff) platformFitScore += 12;
    if (hasGoal && hasObstacle) platformFitScore += 8;
    if (heavyExposition) platformFitScore -= 20;
  } else if (platformProfile === 'qidian') {
    if (hasWorldSetup) platformFitScore += 12;
    if (hasLongPromise) platformFitScore += 12;
    if (hasGoal) platformFitScore += 8;
    if (!hasOpeningHook && !hasWorldSetup) platformFitScore -= 10;
  } else {
    if (hasOpeningHook) platformFitScore += 8;
    if (hasGoal && hasObstacle) platformFitScore += 8;
    if (hasPayoff) platformFitScore += 8;
    if (heavyExposition) platformFitScore -= 14;
  }
  if (platformFitScore < 60) {
    findings.push({ code: 'weak-platform-fit', level: 'warn', message: '当前开篇节奏和所选平台范式匹配度偏低。' });
  }
  if (overload.overloaded) {
    platformFitScore -= 10;
  }
  platformFitScore = clamp(platformFitScore, 0, 100);

  let promiseConsistencyScore = 82;
  if (promiseDrift.active) {
    promiseConsistencyScore = 78;
    if (!promiseDrift.missingPrimaryPayoff) promiseConsistencyScore += 12;
    if (!promiseDrift.drifting) promiseConsistencyScore += 10;
    if (promiseDrift.suspenseShare <= (promiseContract?.maxSuspenseShare ?? 0.5)) promiseConsistencyScore += 4;
    if (promiseDrift.drifting) promiseConsistencyScore -= 26;
  }
  promiseConsistencyScore = clamp(promiseConsistencyScore, 0, 100);

  const overallScore = round(
    (openingScore + clarityScore + payoffScore + adjustedEndingHookScore + platformFitScore + promiseConsistencyScore) / 6,
  );
  const passed = !overload.overloaded
    && overallScore >= 62
    && overrunChars <= Math.max(120, Math.floor((maxWordCount ?? 0) * 0.08));
  const summary = passed
    ? `开篇门禁通过，综合分 ${overallScore}。首屏抓力与追读结构基本在线。`
    : `开篇门禁告警，综合分 ${overallScore}。建议优先补强首屏事件、前段回报、章末追读点或首章收束。`;

  return {
    enabled: true,
    chapterNumber,
    gateMode,
    platformProfile,
    openingScore: round(openingScore),
    clarityScore: round(clarityScore),
    payoffScore: round(payoffScore),
    endingHookScore: round(adjustedEndingHookScore),
    platformFitScore: round(platformFitScore),
    promiseConsistencyScore: round(promiseConsistencyScore),
    overallScore,
    passed,
    overrunChars,
    promiseDrift,
    overload,
    findings,
    summary,
  };
}

export function buildStartupOpeningFixHints(report: StartupOpeningGateReport): string {
  if (!report.enabled) return '';
  const lines: string[] = ['## 开篇三章总监修正建议（优先落实）'];
  for (const finding of report.findings) {
    switch (finding.code) {
      case 'weak-first-screen':
        lines.push('- 重写前 300 字：先上事件、动作或冲突，不要先讲背景。');
        break;
      case 'unclear-goal':
        lines.push('- 前 1000 字内明确写出主角此刻要做什么，不要只写氛围和困境。');
        break;
      case 'unclear-obstacle':
        lines.push('- 尽早写清阻碍来源：人、规则、资源、风险至少落一个。');
        break;
      case 'weak-early-payoff':
        lines.push('- 在本章前半段加入一次短回报：反击、发现、兑现、爆点或更大后果。');
        break;
      case 'weak-ending-hook':
        lines.push('- 章末停在“下一步必须继续看”的问题点，而不是平收。');
        break;
      case 'heavy-exposition':
        lines.push('- 压缩背景说明，把设定改成通过冲突和行动带出。');
        break;
      case 'weak-platform-fit':
        lines.push(report.platformProfile === 'fanqie'
          ? '- 按番茄范式前置冲突和反馈，减少慢热铺垫。'
          : report.platformProfile === 'qidian'
            ? '- 按起点范式补强设定抓手、成长路径和长线承诺。'
            : '- 把开篇节奏改成“先事件、再目标、再回报”。');
        break;
      case 'missing-promise-payoff':
        lines.push('- 前段必须补一次题材主卖点的可见回报，不要只给“发现/揭开/证实”。');
        break;
      case 'suspense-drift':
        lines.push('- 减少秘密、真相、调查、线索的主导篇幅，把冲突改回题材主场景和可视化赢点。');
        break;
      case 'overloaded-opening':
        lines.push('- 首章只保留“一次主兑现 + 一个章末新变量”。第一次结果落地后，删掉完整第二轮升级/搬场/收编/核查，只把新变量留到章末点到为止。');
        break;
      case 'word-count-overrun':
        lines.push('- 控制篇幅，优先删去重复说明和无结果描写，保证节奏密度。');
        break;
      default:
        break;
    }
  }
  if (lines.length === 1) {
    lines.push('- 当前结构基本达标，继续保持首屏事件和章末追读点。');
  }
  return lines.join('\n');
}
