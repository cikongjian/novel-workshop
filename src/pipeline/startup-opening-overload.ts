export type StartupOpeningOverloadReport = {
  overloaded: boolean;
  reason?: string;
  firstPayoffParagraphIndex: number;
  payoffParagraphCount: number;
  tailCharsAfterFirstPayoff: number;
  tailShareAfterFirstPayoff: number;
  lateTurnCount: number;
  latePayoffCount: number;
  lateSystemBurstCount: number;
};

const PAYOFF_RE = /成功|到账|入账|签下|签约|成交|开业|绑定|雇佣|解锁|开启|恢复|拿到|通过|赢了|翻盘|击退|站稳|站住|爆了|反杀|转账|奖励/u;
const TURN_RE = /就在这时|下一秒|紧接着|与此同时|随后|很快|片刻后|几分钟后|十分钟后|第二天|话音未落|转身|回到|来到|走进|踏入|推门而入|门外|忽然|突然/u;
const SYSTEM_RE = /【[^】\n]{2,40}】/gu;

function splitParagraphs(text: string): string[] {
  return (text ?? '')
    .split(/\n\s*\n/)
    .map(item => item.trim())
    .filter(Boolean);
}

function countSystemBursts(paragraph: string): number {
  return paragraph.match(SYSTEM_RE)?.length ?? 0;
}

export function detectStartupOpeningOverload(params: {
  chapterContent: string;
  chapterNumber: number;
}): StartupOpeningOverloadReport {
  const paragraphs = splitParagraphs(params.chapterContent);
  if (params.chapterNumber !== 1 || paragraphs.length < 6 || params.chapterContent.length < 500) {
    return {
      overloaded: false,
      firstPayoffParagraphIndex: -1,
      payoffParagraphCount: 0,
      tailCharsAfterFirstPayoff: 0,
      tailShareAfterFirstPayoff: 0,
      lateTurnCount: 0,
      latePayoffCount: 0,
      lateSystemBurstCount: 0,
    };
  }

  const payoffParagraphIndices = paragraphs
    .map((paragraph, index) => PAYOFF_RE.test(paragraph) ? index : -1)
    .filter(index => index >= 0);
  const firstPayoffParagraphIndex = payoffParagraphIndices[0] ?? -1;

  if (firstPayoffParagraphIndex < 0) {
    return {
      overloaded: false,
      firstPayoffParagraphIndex,
      payoffParagraphCount: payoffParagraphIndices.length,
      tailCharsAfterFirstPayoff: 0,
      tailShareAfterFirstPayoff: 0,
      lateTurnCount: 0,
      latePayoffCount: 0,
      lateSystemBurstCount: 0,
    };
  }

  const tailParagraphs = paragraphs.slice(firstPayoffParagraphIndex + 1);
  const tailCharsAfterFirstPayoff = tailParagraphs.join('\n\n').length;
  const tailShareAfterFirstPayoff = params.chapterContent.length > 0
    ? tailCharsAfterFirstPayoff / params.chapterContent.length
    : 0;
  const lateTurnCount = tailParagraphs.filter(paragraph => TURN_RE.test(paragraph)).length;
  const latePayoffCount = tailParagraphs.filter(paragraph => PAYOFF_RE.test(paragraph)).length;
  const lateSystemBurstCount = tailParagraphs.reduce((count, paragraph) => count + countSystemBursts(paragraph), 0);
  const payoffParagraphCount = payoffParagraphIndices.length;

  const stretchedSecondArc = tailCharsAfterFirstPayoff >= 360
    && tailShareAfterFirstPayoff >= 0.33
    && lateTurnCount >= 2
    && (latePayoffCount >= 1 || lateSystemBurstCount >= 2);
  const stackedPayoffs = payoffParagraphCount >= 3 && params.chapterContent.length >= 700;
  const systemHeavyAfterPayoff = lateSystemBurstCount >= 3
    && tailCharsAfterFirstPayoff >= 300
    && lateTurnCount >= 2;

  const overloaded = stretchedSecondArc || stackedPayoffs || systemHeavyAfterPayoff;

  let reason: string | undefined;
  if (stretchedSecondArc) {
    reason = '第一次可见回报后又继续展开大段第二轮推进，像把下一章内容提前塞进了首章。';
  } else if (stackedPayoffs) {
    reason = '首章连续堆叠了过多兑现节点，主回报之后又追加了新的升级/收获，节奏显得过满。';
  } else if (systemHeavyAfterPayoff) {
    reason = '第一次兑现后连续追加系统播报和结构转场，章末钩子被写成了第二轮展开。';
  }

  return {
    overloaded,
    reason,
    firstPayoffParagraphIndex,
    payoffParagraphCount,
    tailCharsAfterFirstPayoff,
    tailShareAfterFirstPayoff,
    lateTurnCount,
    latePayoffCount,
    lateSystemBurstCount,
  };
}
