import type { PlotThread } from '../novel/types.js';

import {
  evaluatePromiseDrift,
  type PromiseContract,
  type PromiseDriftReport,
} from './promise-contract.js';

export type CommercialGateMode = 'off' | 'warn' | 'strict';

export type CommercialGateFinding = {
  code:
    | 'weak-opening-hook'
    | 'weak-ending-hook'
    | 'low-thread-advancement'
    | 'low-protagonist-agency'
    | 'suspense-overload'
    | 'genre-promise-drift'
    | 'wrong-payoff-type'
    | 'late-protagonist-entry'
    | 'weak-signature-action'
    | 'weak-first-choice'
    | 'missing-early-result'
    | 'weak-emotional-anchor'
    | 'unsupported-information-leap'
    | 'easy-antagonist-surrender';
  level: 'warn' | 'error';
  message: string;
};

export type CommercialGateReport = {
  gateMode: CommercialGateMode;
  openingHook: boolean;
  endingHook: boolean;
  advancedThreads: string[];
  protagonistAgency: boolean;
  protagonistFirstMention: number;
  startupChoiceSignal: boolean;
  startupConsequenceSignal: boolean;
  startupSignatureAction: boolean;
  startupEmotionalAnchor: boolean;
  suspenseDelta: number;
  promiseDrift?: PromiseDriftReport;
  findings: CommercialGateFinding[];
  passed: boolean;
  summary: string;
};

const OPENING_WINDOW = 220;
const ENDING_WINDOW = 320;
const STARTUP_PROTAGONIST_WINDOW = 900;
const STARTUP_CHOICE_WINDOW = 1600;
const STARTUP_RESULT_WINDOW = 2600;
const STARTUP_ANCHOR_WINDOW = 2600;
const HOOK_SIGNAL_RE = /[？?！!]|突然|竟然|不该|来不及|危机|失控|反转|追兵|伏击|选择|当场|压住|翻盘/;
const PROGRESSION_SIGNAL_RE = /决定|下令|行动|交锋|谈判|反击|夺取|拿下|签下|压住|成功|失败|牺牲|代价|推进|撤退|站队|公开|爆了/;
const AGENCY_SIGNAL_RE = /决定|选择|下令|布局|谋划|谈判|拒绝|接受|出手|调兵|承担|押上|牺牲|冒险/;
const STARTUP_CHOICE_RE = /决定|选择|下令|押上|孤注一掷|改道|出兵|动用|赌|冒险|先斩后奏|拒绝|接受|交易|谈判/;
const STARTUP_CONSEQUENCE_RE = /因此|结果|随即|旋即|却|但|代价|伤亡|被迫|失去|反噬|暴露|失败|成功|受挫|遇袭|截杀|丢失|巨响/;
const STARTUP_SIGNATURE_ACTION_RE = /拔剑|按住|闯入|斩|杀|押上|焚毁|动用|出城|潜入|对峙|截杀|夺回|救下|放火|公开|立誓/;
const STARTUP_EMOTIONAL_ANCHOR_RE = /太子|父皇|母后|兄弟|旧友|师门|亡者|愧|怕|不敢|不能失去|必须守住|托孤|执念|软肋|家国|血债/;
const SUSPENSE_NEW_RE = /[？?]|谁在|为何|究竟|真相|秘密|谜团|未解|尚未|不知/g;
const SUSPENSE_RESOLVE_RE = /原来|揭开|证实|查明|终于明白|真相是|答案是|解释了|水落石出|回收/g;
const SYSTEM_CUE_RE = /系统|光幕|面板|倒计时|预警|宿主|提示框/;
const FUTURE_FRAGMENT_RE =
  /画面一闪|破碎画面|破碎的画面|零碎画面|挤进脑海|脑海里闪过|未来片段|未来画面|未来调查片段|零碎数字|看到了.*界面|转账界面/;
const DETAIL_AMOUNT_RE =
  /(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千万两零]+)(?:万|亿|元|块)/g;
const DETAIL_ENTITY_RE = /公司|传媒|工作室|法人|注册地址|专项|空壳|转账|账户|账目|流水|银行卡|项目协调员|副总监/g;
const DETAIL_ADDRESS_RE = /(?:\d+号|\d+室|[A-Z]座\d+|\d+楼|创业园|高新区|园区)/g;
const DETAIL_TRACE_RE = /发票号|票号|单号|尾号|账户尾号|卡号尾号|后六位|后四位|末尾几位|编号/g;
const EVIDENCE_BRIDGE_RE = /账单|流水|合同|邮件|录音|照片|截图|聊天记录|文件|资料|U盘|举报材料|搜到|翻出|查到|证据|监控视频/g;
const SURRENDER_TRIGGER_RE = /你想怎么谈|重新谈|开条件|说吧|你要什么/;
const THREAT_RE = /住哪儿|小心点|保不住|律师函|配合|不然|弄死|拖累|查到/;
const COMPLIANCE_RE = /转账|到账|同意|答应|照做|安排|拨出去|压住|撤诉|推上热搜|资源|保护/g;
const COMPROMISE_RE = /条件|代价|交换|只能|一半|先|之后|拖|不保证|风险|报复|留后手|秋后算账/g;

function isTrue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function extractThreadTokens(thread: PlotThread): string[] {
  const raw = [thread.name, thread.description].join(' ');
  const words = raw.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,8}/g) ?? [];
  return [...new Set(words)].slice(0, 8);
}

function splitSentences(text: string): string[] {
  return text
    .split(/[。！？?!\n]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function countRegexHits(text: string, regex: RegExp): number {
  const matched = text.match(regex);
  return matched ? matched.length : 0;
}

function evaluateInformationLeap(chapterContent: string, promiseContract?: PromiseContract): boolean {
  const maxSuspenseShare = promiseContract?.maxSuspenseShare ?? 0.5;
  if (maxSuspenseShare > 0.55) return false;

  const systemMatches = [...chapterContent.matchAll(new RegExp(SYSTEM_CUE_RE.source, 'g'))];
  if (systemMatches.length === 0) return false;

  return systemMatches.some(match => {
    const systemIndex = match.index ?? -1;
    if (systemIndex < 0) return false;

    const revealWindow = chapterContent.slice(
      Math.max(0, systemIndex - 180),
      Math.min(chapterContent.length, systemIndex + 1800),
    );
    const detailHits =
      countRegexHits(revealWindow, DETAIL_AMOUNT_RE)
      + countRegexHits(revealWindow, DETAIL_ENTITY_RE)
      + countRegexHits(revealWindow, DETAIL_ADDRESS_RE)
      + countRegexHits(revealWindow, DETAIL_TRACE_RE);
    const evidenceHits = countRegexHits(revealWindow, EVIDENCE_BRIDGE_RE);
    const futureFragment = FUTURE_FRAGMENT_RE.test(revealWindow);
    const traceHeavyLeak =
      countRegexHits(revealWindow, DETAIL_TRACE_RE) >= 2
      && countRegexHits(revealWindow, DETAIL_AMOUNT_RE) >= 1
      && evidenceHits === 0;

    return (detailHits >= 5 && evidenceHits === 0)
      || (futureFragment && detailHits >= 3)
      || traceHeavyLeak;
  });
}

function evaluateEasyAntagonistSurrender(chapterContent: string): boolean {
  const threatIndex = chapterContent.search(THREAT_RE);
  const triggerIndex = chapterContent.search(SURRENDER_TRIGGER_RE);
  if (threatIndex < 0 || triggerIndex <= threatIndex) return false;

  const complianceMatch = chapterContent.slice(triggerIndex).search(COMPLIANCE_RE);
  if (complianceMatch < 0) return false;

  const complianceIndex = triggerIndex + complianceMatch;
  const window = chapterContent.slice(triggerIndex, Math.min(chapterContent.length, complianceIndex + 520));
  const rewardHits = countRegexHits(window, COMPLIANCE_RE);
  const compromiseHits = countRegexHits(window, COMPROMISE_RE);
  return rewardHits >= 3 && compromiseHits <= 1;
}

function evaluateHooks(chapterContent: string): { openingHook: boolean; endingHook: boolean } {
  const opening = chapterContent.slice(0, OPENING_WINDOW);
  const ending = chapterContent.slice(Math.max(0, chapterContent.length - ENDING_WINDOW));
  return {
    openingHook: HOOK_SIGNAL_RE.test(opening),
    endingHook: HOOK_SIGNAL_RE.test(ending),
  };
}

function evaluateThreadAdvancement(chapterContent: string, plotThreads: PlotThread[]): string[] {
  if (plotThreads.length === 0) return [];
  const activeThreads = plotThreads.filter(item => item.status !== 'resolved' && item.status !== 'abandoned');
  const sentences = splitSentences(chapterContent);
  const advanced: string[] = [];

  for (const thread of activeThreads) {
    const tokens = extractThreadTokens(thread);
    if (tokens.length === 0) continue;
    const matchedSentence = sentences.find(sentence =>
      tokens.some(token => sentence.includes(token)) && PROGRESSION_SIGNAL_RE.test(sentence),
    );
    if (matchedSentence) {
      advanced.push(thread.name);
    }
  }
  return [...new Set(advanced)];
}

function evaluateProtagonistAgency(chapterContent: string, protagonistNames: string[]): boolean {
  if (protagonistNames.length === 0) return true;
  const sentences = splitSentences(chapterContent);
  return sentences.some(sentence =>
    protagonistNames.some(name => sentence.includes(name)) && AGENCY_SIGNAL_RE.test(sentence),
  );
}

function findFirstProtagonistMention(chapterContent: string, protagonistNames: string[]): number {
  if (protagonistNames.length === 0) return 0;
  let min = -1;
  for (const name of protagonistNames) {
    const idx = chapterContent.indexOf(name);
    if (idx < 0) continue;
    min = min < 0 ? idx : Math.min(min, idx);
  }
  return min;
}

function evaluateStartupSignals(chapterContent: string, protagonistNames: string[]): {
  choice: boolean;
  consequence: boolean;
  signatureAction: boolean;
  emotionalAnchor: boolean;
} {
  if (protagonistNames.length === 0) {
    return {
      choice: true,
      consequence: true,
      signatureAction: true,
      emotionalAnchor: true,
    };
  }

  const choiceWindow = chapterContent.slice(0, STARTUP_CHOICE_WINDOW);
  const resultWindow = chapterContent.slice(0, STARTUP_RESULT_WINDOW);
  const anchorWindow = chapterContent.slice(0, STARTUP_ANCHOR_WINDOW);
  const choiceSentences = splitSentences(choiceWindow);
  const resultSentences = splitSentences(resultWindow);
  const anchorSentences = splitSentences(anchorWindow);

  const hasProtagonist = (sentence: string) => protagonistNames.some(name => sentence.includes(name));

  let choice = false;
  let consequence = false;

  for (const sentence of resultSentences) {
    if (!choice && hasProtagonist(sentence) && STARTUP_CHOICE_RE.test(sentence)) {
      choice = true;
      if (STARTUP_CONSEQUENCE_RE.test(sentence)) {
        consequence = true;
      }
      continue;
    }
    if (choice && STARTUP_CONSEQUENCE_RE.test(sentence)) {
      consequence = true;
      break;
    }
  }

  const signatureAction = choiceSentences.some(sentence =>
    hasProtagonist(sentence) && STARTUP_SIGNATURE_ACTION_RE.test(sentence),
  );

  const emotionalAnchor = anchorSentences.some(sentence =>
    hasProtagonist(sentence) && STARTUP_EMOTIONAL_ANCHOR_RE.test(sentence),
  );

  return {
    choice,
    consequence,
    signatureAction,
    emotionalAnchor,
  };
}

export function evaluateCommercialGate(params: {
  chapterContent: string;
  chapterNumber: number;
  plotThreads: PlotThread[];
  protagonistNames: string[];
  promiseContract?: PromiseContract;
  gateMode: CommercialGateMode;
}): CommercialGateReport {
  const { chapterContent, chapterNumber, plotThreads, protagonistNames, promiseContract, gateMode } = params;
  if (gateMode === 'off') {
    return {
      gateMode,
      openingHook: true,
      endingHook: true,
      advancedThreads: [],
      protagonistAgency: true,
      protagonistFirstMention: 0,
      startupChoiceSignal: true,
      startupConsequenceSignal: true,
      startupSignatureAction: true,
      startupEmotionalAnchor: true,
      suspenseDelta: 0,
      promiseDrift: undefined,
      findings: [],
      passed: true,
      summary: 'commercial gate disabled',
    };
  }

  const findings: CommercialGateFinding[] = [];
  const level: CommercialGateFinding['level'] = gateMode === 'strict' ? 'error' : 'warn';
  const startupChecksEnabled = isTrue(process.env.STARTUP_RETENTION_ENABLED) && chapterNumber <= 3;
  const { openingHook, endingHook } = evaluateHooks(chapterContent);
  const advancedThreads = evaluateThreadAdvancement(chapterContent, plotThreads);
  const protagonistAgency = evaluateProtagonistAgency(chapterContent, protagonistNames);
  const protagonistFirstMention = findFirstProtagonistMention(chapterContent, protagonistNames);
  const startupSignals = evaluateStartupSignals(chapterContent, protagonistNames);
  const suspenseNew = countRegexHits(chapterContent, SUSPENSE_NEW_RE);
  const suspenseResolved = countRegexHits(chapterContent, SUSPENSE_RESOLVE_RE);
  const suspenseDelta = suspenseNew - suspenseResolved;
  const promiseDrift = evaluatePromiseDrift(chapterContent, promiseContract, {
    windowChars: chapterNumber <= 3 ? 3200 : 4200,
  });
  const informationLeap = evaluateInformationLeap(chapterContent, promiseContract);
  const easyAntagonistSurrender = evaluateEasyAntagonistSurrender(chapterContent);
  const activeThreadCount = plotThreads.filter(item => item.status !== 'resolved' && item.status !== 'abandoned').length;
  const minAdvancedThreads = activeThreadCount >= 3 ? 2 : activeThreadCount >= 1 ? 1 : 0;

  if (!openingHook) {
    findings.push({
      code: 'weak-opening-hook',
      level,
      message: 'Chapter opening lacks a clear hook signal in the first 220 chars.',
    });
  }
  if (!endingHook) {
    findings.push({
      code: 'weak-ending-hook',
      level,
      message: 'Chapter ending lacks a continuation hook in the last 320 chars.',
    });
  }
  if (advancedThreads.length < minAdvancedThreads) {
    findings.push({
      code: 'low-thread-advancement',
      level,
      message: `Active thread advancement is insufficient (${advancedThreads.length}/${minAdvancedThreads}).`,
    });
  }
  if (!protagonistAgency) {
    findings.push({
      code: 'low-protagonist-agency',
      level,
      message: 'No strong protagonist agency signal (decision/action) was detected.',
    });
  }
  const suspenseOverload =
    (chapterNumber <= 3 && promiseDrift.active && suspenseDelta > 2)
    || (chapterNumber > 3 && suspenseDelta > 4);

  if (suspenseOverload) {
    findings.push({
      code: 'suspense-overload',
      level,
      message: `Suspense debt is growing too fast (new-resolved = ${suspenseDelta}).`,
    });
  }
  if (promiseDrift.active && promiseDrift.missingPrimaryPayoff) {
    findings.push({
      code: 'wrong-payoff-type',
      level,
      message: 'Visible chapter payoff does not match the novel promise; the chapter advances information but not the selling fantasy.',
    });
  }
  if (promiseDrift.active && promiseDrift.drifting) {
    findings.push({
      code: 'genre-promise-drift',
      level,
      message: 'Mystery/suspense signals are overpowering the intended subgenre fantasy.',
    });
  }
  if (startupChecksEnabled && chapterNumber === 1 && protagonistNames.length > 0 && protagonistFirstMention > STARTUP_PROTAGONIST_WINDOW) {
    findings.push({
      code: 'late-protagonist-entry',
      level,
      message: `Protagonist appears too late for chapter 1 (index ${protagonistFirstMention}, expected <= ${STARTUP_PROTAGONIST_WINDOW}).`,
    });
  }
  if (startupChecksEnabled && chapterNumber === 1 && !startupSignals.signatureAction) {
    findings.push({
      code: 'weak-signature-action',
      level,
      message: 'Chapter 1 lacks a memorable protagonist signature action in the early window.',
    });
  }
  if (startupChecksEnabled && !startupSignals.choice) {
    findings.push({
      code: 'weak-first-choice',
      level,
      message: 'No clear protagonist decision signal was detected in early chapter progression.',
    });
  }
  if (startupChecksEnabled && !startupSignals.consequence) {
    findings.push({
      code: 'missing-early-result',
      level,
      message: 'The chapter does not show visible short-term consequences after the protagonist decision.',
    });
  }
  if (startupChecksEnabled && chapterNumber === 1 && !startupSignals.emotionalAnchor) {
    findings.push({
      code: 'weak-emotional-anchor',
      level,
      message: 'Chapter 1 lacks an explicit emotional anchor (stake/soft spot/relationship pull).',
    });
  }
  if (informationLeap) {
    findings.push({
      code: 'unsupported-information-leap',
      level,
      message: 'The chapter lets the protagonist jump from system-level hints to case-file-level details without showing an on-page evidence bridge.',
    });
  }
  if (easyAntagonistSurrender) {
    findings.push({
      code: 'easy-antagonist-surrender',
      level,
      message: 'The antagonist folds too fast and gives multiple concrete rewards in one beat, which weakens confrontation credibility.',
    });
  }

  const passed = findings.length === 0;
  const summary = passed
    ? `commercial gate passed (threads advanced: ${advancedThreads.length}, suspense delta: ${suspenseDelta})`
    : `commercial gate found ${findings.length} issue(s)`;

  return {
    gateMode,
    openingHook,
    endingHook,
    advancedThreads,
    protagonistAgency,
    protagonistFirstMention,
    startupChoiceSignal: startupSignals.choice,
    startupConsequenceSignal: startupSignals.consequence,
    startupSignatureAction: startupSignals.signatureAction,
    startupEmotionalAnchor: startupSignals.emotionalAnchor,
    suspenseDelta,
    promiseDrift,
    findings,
    passed,
    summary,
  };
}

export function buildCommercialGateFixHints(report: CommercialGateReport): string {
  const lines: string[] = [
    'The chapter failed commercial-retention checks. Apply minimal but concrete edits:',
  ];

  if (!report.openingHook) {
    lines.push('- Opening: add immediate conflict/suspense/action within first 220 chars.');
  }
  if (!report.endingHook) {
    lines.push('- Ending: add a forward hook in the final 320 chars (reversal, threat, or choice).');
  }
  if (!report.protagonistAgency) {
    lines.push('- Protagonist: add a visible decision/action sentence with consequences.');
  }
  if (report.findings.some(item => item.code === 'low-thread-advancement')) {
    lines.push('- Main threads: advance at least one active thread with explicit progression verbs.');
  }
  if (report.findings.some(item => item.code === 'suspense-overload')) {
    lines.push('- Suspense debt: resolve at least one existing mystery before adding more.');
  }
  if (report.findings.some(item => item.code === 'wrong-payoff-type')) {
    lines.push('- Promise payoff: replace at least one info-only beat with a visible subgenre payoff that readers can immediately feel.');
  }
  if (report.findings.some(item => item.code === 'genre-promise-drift')) {
    lines.push('- Genre drift: reduce investigation/secret beats and restore the novel’s promised scene type and emotional reward.');
  }
  if (report.findings.some(item => item.code === 'late-protagonist-entry')) {
    lines.push('- Chapter 1 startup: move protagonist appearance into first 900 chars.');
  }
  if (report.findings.some(item => item.code === 'weak-signature-action')) {
    lines.push('- Chapter 1 startup: add one memorable protagonist action, not just report/listen/think.');
  }
  if (report.findings.some(item => item.code === 'weak-first-choice')) {
    lines.push('- Early progression: add a concrete protagonist decision that changes risk exposure.');
  }
  if (report.findings.some(item => item.code === 'missing-early-result')) {
    lines.push('- Early progression: show immediate consequence of that decision (loss/gain/escalation).');
  }
  if (report.findings.some(item => item.code === 'weak-emotional-anchor')) {
    lines.push('- Chapter 1 empathy: add one line revealing the protagonist emotional stake/soft spot.');
  }
  if (report.findings.some(item => item.code === 'unsupported-information-leap')) {
    lines.push('- Information boundary: remove unsupported exact details, or add a visible on-page source (document/chat/recording/receipt) before the protagonist states them.');
  }
  if (report.findings.some(item => item.code === 'easy-antagonist-surrender')) {
    lines.push('- Confrontation credibility: reduce instant compliance. Keep only partial concessions, and add bargaining, delay, retaliation, or extra cost.');
  }

  lines.push('- Keep plot order intact; avoid full rewrite.');
  lines.push('- Keep output format: polished chapter + ---EDITOR_NOTES--- + change notes.');
  return lines.join('\n');
}
