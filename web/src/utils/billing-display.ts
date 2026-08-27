import type { BillingLedgerItem } from '../api/billing';

export type BillingLedgerFilter = 'all' | 'product' | 'recharge' | 'freeze';
type BillingLedgerCategory = Exclude<BillingLedgerFilter, 'all'>;

type BillingLedgerDisplay = {
  title: string;
  detail: string;
  category: BillingLedgerCategory;
  categoryLabel: string;
  tagType: 'success' | 'warning' | 'info';
};

type BillingSettleSummary = {
  actualPoints: number;
  frozenPoints: number | null;
  extraChargePoints: number;
  refundPoints: number;
  isFullRefund: boolean;
};

function parseChapterNumber(bizId: string): number | null {
  const parts = bizId.split(':');
  const value = Number(parts[parts.length - 1]);
  return Number.isFinite(value) ? value : null;
}

function buildSubject(item: BillingLedgerItem): { label: string; category: BillingLedgerCategory } {
  if (item.bizType === 'pkg.kickstart') {
    return { label: '开书包', category: 'product' };
  }
  if (item.bizType === 'pkg.publish-pack') {
    return { label: '发布包装包', category: 'product' };
  }
  if (item.bizType === 'gen.chapter') {
    const chapterNumber = parseChapterNumber(item.bizId);
    return { label: chapterNumber ? `第 ${chapterNumber} 章生成` : '章节生成', category: 'product' };
  }
  if (item.bizType === 'gen.revise') {
    const chapterNumber = parseChapterNumber(item.bizId);
    return { label: chapterNumber ? `第 ${chapterNumber} 章修订` : '章节修订', category: 'product' };
  }
  if (item.bizType === 'gen.resize') {
    const chapterNumber = parseChapterNumber(item.bizId);
    return { label: chapterNumber ? `第 ${chapterNumber} 章扩缩写` : '章节扩缩写', category: 'product' };
  }
  if (item.bizType === 'billing.topup.demo') {
    return { label: '充值到账', category: 'recharge' };
  }
  if (item.bizType === 'billing.signup-gift') {
    return { label: '新人赠送', category: 'recharge' };
  }
  if (item.bizType === 'billing.redeem-code') {
    return { label: '兑换码到账', category: 'recharge' };
  }
  if (item.bizType === 'referral.register-reward') {
    return { label: '推荐注册奖励', category: 'recharge' };
  }
  if (item.bizType === 'referral.commission') {
    return { label: '推荐充值佣金', category: 'recharge' };
  }
  return {
    label: item.bizType,
    category: item.type === 'freeze' || item.type === 'unfreeze' || item.type === 'settle' ? 'freeze' : 'recharge',
  };
}

function parseSettleRemark(remark: string): Omit<BillingSettleSummary, 'frozenPoints'> | null {
  const normalized = remark.trim();

  const refundFrozenMatch = normalized.match(/^Refund frozen (\d+) points$/i);
  if (refundFrozenMatch) {
    const frozenPoints = Number(refundFrozenMatch[1]);
    return {
      actualPoints: 0,
      extraChargePoints: 0,
      refundPoints: frozenPoints,
      isFullRefund: true,
    };
  }

  const settleMatch = normalized.match(/^Settle (\d+) points(?: with extra charge (\d+)| with refund (\d+))?$/i);
  if (!settleMatch) {
    return null;
  }

  return {
    actualPoints: Number(settleMatch[1]),
    extraChargePoints: settleMatch[2] ? Number(settleMatch[2]) : 0,
    refundPoints: settleMatch[3] ? Number(settleMatch[3]) : 0,
    isFullRefund: false,
  };
}

function findRelatedFreezeItem(item: BillingLedgerItem, ledger?: BillingLedgerItem[]): BillingLedgerItem | null {
  if (!ledger?.length) return null;
  const settleIndex = ledger.findIndex((entry) => entry.id === item.id);
  if (settleIndex < 0) return null;

  for (let index = settleIndex - 1; index >= 0; index -= 1) {
    const candidate = ledger[index];
    if (candidate.type !== 'freeze') continue;
    if (candidate.bizType !== item.bizType || candidate.bizId !== item.bizId) continue;
    return candidate;
  }

  return null;
}

export function resolveBillingSettleSummary(
  item: BillingLedgerItem,
  ledger?: BillingLedgerItem[],
): BillingSettleSummary | null {
  if (item.type !== 'settle') return null;

  const parsed = parseSettleRemark(item.remark);
  const freezeItem = findRelatedFreezeItem(item, ledger);
  const frozenPoints = freezeItem ? Math.abs(freezeItem.deltaPoints) : null;

  if (parsed) {
    return {
      ...parsed,
      frozenPoints: parsed.isFullRefund ? parsed.refundPoints : frozenPoints,
    };
  }

  return {
    actualPoints: item.deltaPoints < 0 ? Math.abs(item.deltaPoints) : 0,
    frozenPoints,
    extraChargePoints: item.deltaPoints < 0 ? Math.abs(item.deltaPoints) : 0,
    refundPoints: item.deltaPoints > 0 ? item.deltaPoints : 0,
    isFullRefund: item.deltaPoints > 0 && !!frozenPoints && item.deltaPoints === frozenPoints,
  };
}

export function formatBillingSettleFlow(summary: BillingSettleSummary | null): string | null {
  if (!summary) return null;
  if (summary.isFullRefund && summary.frozenPoints !== null) {
    return `先预扣 ${summary.frozenPoints} 积分，任务取消后全额退回`;
  }
  if (summary.frozenPoints === null) {
    return `最终按实际结算 ${summary.actualPoints} 积分`;
  }
  if (summary.extraChargePoints > 0) {
    return `先预扣 ${summary.frozenPoints} 积分，完成后补扣 ${summary.extraChargePoints} 积分`;
  }
  if (summary.refundPoints > 0) {
    return `先预扣 ${summary.frozenPoints} 积分，完成后退回 ${summary.refundPoints} 积分`;
  }
  return `先预扣 ${summary.frozenPoints} 积分，完成后无补差`;
}

export function describeBillingLedgerItem(
  item: BillingLedgerItem,
  ledger?: BillingLedgerItem[],
): BillingLedgerDisplay {
  const subject = buildSubject(item);
  const settleSummary = item.type === 'settle' ? resolveBillingSettleSummary(item, ledger) : null;
  const settleFlow = formatBillingSettleFlow(settleSummary);

  if (item.type === 'freeze') {
    return {
      title: `预扣冻结：${subject.label}`,
      detail: '任务开始前先锁定积分，完成后会按实际结果补差或退款。',
      category: 'freeze',
      categoryLabel: '冻结中',
      tagType: 'warning',
    };
  }

  if (item.type === 'settle') {
    if (settleSummary?.isFullRefund) {
      return {
        title: `结算退回：${subject.label}`,
        detail: settleFlow ? `${settleFlow}，本次未产生实际消费。` : '预扣积分已全额退回，本次未产生实际消费。',
        category: 'freeze',
        categoryLabel: '已退回',
        tagType: 'info',
      };
    }

    if (item.deltaPoints < 0) {
      return {
        title: `结算扣费：${subject.label}`,
        detail: settleSummary
          ? `${settleFlow ?? `最终按实际结算 ${settleSummary.actualPoints} 积分`}，实际消费 ${settleSummary.actualPoints} 积分。`
          : '任务执行完成后按实际消耗扣减积分。',
        category: subject.category === 'product' ? 'product' : 'freeze',
        categoryLabel: subject.category === 'product' ? '商品消费' : '结算扣费',
        tagType: subject.category === 'product' ? 'success' : 'warning',
      };
    }

    if (item.deltaPoints === 0) {
      return {
        title: `结算完成：${subject.label}`,
        detail: settleSummary
          ? `${settleFlow ?? `最终按实际结算 ${settleSummary.actualPoints} 积分`}，实际消费 ${settleSummary.actualPoints} 积分。`
          : '预扣积分已转为实际消费，本次没有额外补扣或退款。',
        category: subject.category === 'product' ? 'product' : 'freeze',
        categoryLabel: subject.category === 'product' ? '商品结算' : '结算完成',
        tagType: subject.category === 'product' ? 'success' : 'warning',
      };
    }

    return {
      title: `结算退款：${subject.label}`,
      detail: settleSummary
        ? `${settleFlow ?? `最终按实际结算 ${settleSummary.actualPoints} 积分`}，实际消费 ${settleSummary.actualPoints} 积分。`
        : '预扣积分高于实际消耗，系统已自动退回差额。',
      category: 'freeze',
      categoryLabel: '自动退款',
      tagType: 'info',
    };
  }

  if (item.type === 'unfreeze') {
    return {
      title: `解除冻结：${subject.label}`,
      detail: '任务取消或未继续执行，冻结积分已解锁。',
      category: 'freeze',
      categoryLabel: '已解冻',
      tagType: 'info',
    };
  }

  if (item.type === 'recharge') {
    const label = subject.category === 'recharge' ? '充值到账' : '积分入账';
    return {
      title: subject.label,
      detail: label,
      category: 'recharge',
      categoryLabel: '充值入账',
      tagType: 'success',
    };
  }

  if (item.type === 'refund') {
    return {
      title: `退款返还：${subject.label}`,
      detail: '异常回滚或售后退款返还的积分。',
      category: 'recharge',
      categoryLabel: '退款返还',
      tagType: 'info',
    };
  }

  if (item.type === 'adjust') {
    return {
      title: `人工调整：${subject.label}`,
      detail: item.remark || '管理员进行了积分校正。',
      category: 'recharge',
      categoryLabel: '人工调整',
      tagType: 'info',
    };
  }

  return {
    title: subject.label,
    detail: item.remark || '积分流水',
    category: subject.category,
    categoryLabel: subject.category === 'product' ? '商品消费' : subject.category === 'freeze' ? '冻结结算' : '充值入账',
    tagType: subject.category === 'product' ? 'success' : subject.category === 'freeze' ? 'warning' : 'info',
  };
}
