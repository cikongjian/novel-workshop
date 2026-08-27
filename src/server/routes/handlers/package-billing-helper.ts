import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { BillingService } from '../../../billing/billing-service.js';

export type PackageBillingSession = {
  billingUserId: string;
  freezeId: string;
  ruleCode: string;
  estimatedPoints: number;
  bizId: string;
  bizType: string;
};

type BeginPackageBillingInput = {
  ruleCandidates: readonly string[];
  bizType: string;
  bizId?: string;
  missingRuleMessage?: string;
};

export async function beginPackageBilling(
  req: Request,
  res: Response,
  billingService: BillingService | undefined,
  input: BeginPackageBillingInput,
): Promise<{ blocked: boolean; session: PackageBillingSession | null }> {
  const billingUserId = req.auth?.id;
  if (!billingService || !billingUserId || billingUserId === 'dev') {
    return { blocked: false, session: null };
  }

  const config = await billingService.getSystemConfig();
  const ruleCode = input.ruleCandidates.find(code => config.rules.some(item => item.code === code && item.enabled));
  if (!ruleCode) {
    throw new Error(input.missingRuleMessage ?? 'Package billing rule does not exist or is disabled');
  }

  const estimate = await billingService.estimate({ ruleCode, quantity: 1 });
  const account = await billingService.getAccount(billingUserId);
  if (account.balancePoints < estimate.estimatedPoints) {
    res.status(402).json({
      error: '积分不足，请先充值',
      code: 'INSUFFICIENT_BALANCE',
      required: estimate.estimatedPoints,
      balance: account.balancePoints,
      ruleCode,
    });
    return { blocked: true, session: null };
  }

  const bizId = input.bizId ?? randomUUID();
  const freezeId = await billingService.freezePoints(
    billingUserId,
    estimate.estimatedPoints,
    input.bizType,
    bizId,
  );

  return {
    blocked: false,
    session: {
      billingUserId,
      freezeId,
      ruleCode,
      estimatedPoints: estimate.estimatedPoints,
      bizId,
      bizType: input.bizType,
    },
  };
}

export async function settlePackageBilling(
  billingService: BillingService | undefined,
  session: PackageBillingSession | null,
): Promise<void> {
  if (!billingService || !session) return;
  await billingService.settleFreeze(session.billingUserId, session.freezeId, session.estimatedPoints);
}

export async function cancelPackageBilling(
  billingService: BillingService | undefined,
  session: PackageBillingSession | null,
): Promise<void> {
  if (!billingService || !session) return;
  await billingService.settleFreeze(session.billingUserId, session.freezeId, 0);
}
