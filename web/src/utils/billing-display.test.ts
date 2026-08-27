import { describe, expect, it } from 'vitest';
import type { BillingLedgerItem } from '../api/billing';
import {
  describeBillingLedgerItem,
  formatBillingSettleFlow,
  resolveBillingSettleSummary,
} from './billing-display';

const BIZ_TYPE = 'chapter-generate';
const BIZ_ID = 'chapter-42';

/** 构造一条账目，只覆盖被测字段 */
function ledgerItem(overrides: Partial<BillingLedgerItem> = {}): BillingLedgerItem {
  return {
    id: 'ledger-1',
    userId: 'user-1',
    type: 'consume',
    bizType: BIZ_TYPE,
    bizId: BIZ_ID,
    deltaPoints: -100,
    balanceAfter: 900,
    frozenAfter: 0,
    remark: '',
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveBillingSettleSummary', () => {
  it('非结算条目返回 null', () => {
    for (const type of ['recharge', 'consume', 'refund', 'adjust', 'freeze', 'unfreeze'] as const) {
      expect(resolveBillingSettleSummary(ledgerItem({ type }))).toBeNull();
    }
  });

  it('解析全额退回备注', () => {
    const summary = resolveBillingSettleSummary(
      ledgerItem({ type: 'settle', deltaPoints: 300, remark: 'Refund frozen 300 points' }),
    );
    expect(summary).toMatchObject({
      actualPoints: 0,
      extraChargePoints: 0,
      refundPoints: 300,
      isFullRefund: true,
      frozenPoints: 300,
    });
  });

  it('解析补扣备注', () => {
    const summary = resolveBillingSettleSummary(
      ledgerItem({ type: 'settle', deltaPoints: -50, remark: 'Settle 250 points with extra charge 50' }),
    );
    expect(summary?.actualPoints).toBe(250);
    expect(summary?.extraChargePoints).toBe(50);
    expect(summary?.isFullRefund).toBe(false);
  });

  it('解析退回备注', () => {
    const summary = resolveBillingSettleSummary(
      ledgerItem({ type: 'settle', deltaPoints: 40, remark: 'Settle 160 points with refund 40' }),
    );
    expect(summary?.actualPoints).toBe(160);
    expect(summary?.refundPoints).toBe(40);
  });

  it('备注无法解析时按 deltaPoints 兜底：扣费方向', () => {
    const summary = resolveBillingSettleSummary(
      ledgerItem({ type: 'settle', deltaPoints: -70, remark: '无法识别的备注' }),
    );
    expect(summary?.actualPoints).toBe(70);
    expect(summary?.extraChargePoints).toBe(70);
    expect(summary?.refundPoints).toBe(0);
  });

  it('备注无法解析时按 deltaPoints 兜底：退款方向', () => {
    const summary = resolveBillingSettleSummary(
      ledgerItem({ type: 'settle', deltaPoints: 70, remark: '' }),
    );
    expect(summary?.actualPoints).toBe(0);
    expect(summary?.refundPoints).toBe(70);
  });

  it('从账目流水回溯配对的冻结条目', () => {
    const freeze = ledgerItem({ id: 'f1', type: 'freeze', deltaPoints: -200 });
    const settle = ledgerItem({ id: 's1', type: 'settle', deltaPoints: -30, remark: '' });
    const summary = resolveBillingSettleSummary(settle, [freeze, settle]);
    expect(summary?.frozenPoints).toBe(200);
  });

  it('bizId 不同的冻结条目不得被错配', () => {
    const otherFreeze = ledgerItem({ id: 'f1', type: 'freeze', deltaPoints: -999, bizId: 'chapter-99' });
    const settle = ledgerItem({ id: 's1', type: 'settle', deltaPoints: -30, remark: '' });
    const summary = resolveBillingSettleSummary(settle, [otherFreeze, settle]);
    expect(summary?.frozenPoints).toBeNull();
  });

  it('bizType 不同的冻结条目不得被错配', () => {
    const otherFreeze = ledgerItem({ id: 'f1', type: 'freeze', deltaPoints: -999, bizType: 'tts' });
    const settle = ledgerItem({ id: 's1', type: 'settle', deltaPoints: -30, remark: '' });
    const summary = resolveBillingSettleSummary(settle, [otherFreeze, settle]);
    expect(summary?.frozenPoints).toBeNull();
  });

  it('无流水时冻结额为 null', () => {
    const summary = resolveBillingSettleSummary(
      ledgerItem({ type: 'settle', deltaPoints: -30, remark: '' }),
    );
    expect(summary?.frozenPoints).toBeNull();
  });
});

describe('formatBillingSettleFlow', () => {
  it('summary 为 null 时返回 null', () => {
    expect(formatBillingSettleFlow(null)).toBeNull();
  });

  it('全额退回的文案包含预扣与退回', () => {
    const text = formatBillingSettleFlow({
      actualPoints: 0,
      frozenPoints: 300,
      extraChargePoints: 0,
      refundPoints: 300,
      isFullRefund: true,
    });
    expect(text).toContain('300');
    expect(text).toContain('全额退回');
  });

  it('缺少冻结额时只描述实际结算', () => {
    const text = formatBillingSettleFlow({
      actualPoints: 120,
      frozenPoints: null,
      extraChargePoints: 0,
      refundPoints: 0,
      isFullRefund: false,
    });
    expect(text).toContain('120');
    expect(text).not.toContain('预扣');
  });

  it('补扣文案同时给出预扣与补扣额', () => {
    const text = formatBillingSettleFlow({
      actualPoints: 250,
      frozenPoints: 200,
      extraChargePoints: 50,
      refundPoints: 0,
      isFullRefund: false,
    });
    expect(text).toContain('200');
    expect(text).toContain('50');
    expect(text).toContain('补扣');
  });

  it('退回文案同时给出预扣与退回额', () => {
    const text = formatBillingSettleFlow({
      actualPoints: 160,
      frozenPoints: 200,
      extraChargePoints: 0,
      refundPoints: 40,
      isFullRefund: false,
    });
    expect(text).toContain('40');
    expect(text).toContain('退回');
  });

  it('无补差时明确说明', () => {
    const text = formatBillingSettleFlow({
      actualPoints: 200,
      frozenPoints: 200,
      extraChargePoints: 0,
      refundPoints: 0,
      isFullRefund: false,
    });
    expect(text).toContain('无补差');
  });
});

describe('describeBillingLedgerItem', () => {
  it('冻结条目归入 freeze 类别', () => {
    const display = describeBillingLedgerItem(ledgerItem({ type: 'freeze', deltaPoints: -200 }));
    expect(display.category).toBe('freeze');
    expect(display.title).toContain('预扣冻结');
  });

  it('全额退回的结算标题体现退回', () => {
    const display = describeBillingLedgerItem(
      ledgerItem({ type: 'settle', deltaPoints: 300, remark: 'Refund frozen 300 points' }),
    );
    expect(display.title).toContain('结算退回');
  });

  it('各类型都返回非空标题与类别', () => {
    for (const type of ['recharge', 'consume', 'refund', 'adjust', 'freeze', 'unfreeze', 'settle'] as const) {
      const display = describeBillingLedgerItem(ledgerItem({ type }));
      expect(display.title.length).toBeGreaterThan(0);
      expect(display.category.length).toBeGreaterThan(0);
      expect(display.categoryLabel.length).toBeGreaterThan(0);
    }
  });

  it('不因异常输入抛错', () => {
    expect(() => describeBillingLedgerItem(ledgerItem({ remark: '{{{', bizType: '', bizId: '' }))).not.toThrow();
    expect(() => describeBillingLedgerItem(ledgerItem({ deltaPoints: 0 }))).not.toThrow();
  });
});
