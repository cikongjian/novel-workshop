import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { BillingService } from '../../../../billing/billing-service.js';

const KICKSTART_RULE_CANDIDATES = ['pkg.kickstart', 'cap.project-init'] as const;
const KICKSTART_BIZ_TYPE = 'pkg.kickstart';

export type KickstartBillingSession = {
  billingUserId: string;
  freezeId: string;
  ruleCode: string;
  estimatedPoints: number;
  bizId: string;
};

export async function beginKickstartBilling(
  req: Request,
  res: Response,
  billingService?: BillingService,
  bizId: string = randomUUID(),
  skipBilling: boolean = false,
): Promise<{ blocked: boolean; session: KickstartBillingSession | null }> {
  if (skipBilling) {
    return { blocked: false, session: null };
  }
  const billingUserId = req.auth?.id;
  if (!billingService || !billingUserId || billingUserId === 'dev') {
    return { blocked: false, session: null };
  }

  const config = await billingService.getSystemConfig();
  const ruleCode = KICKSTART_RULE_CANDIDATES.find(code => config.rules.some(item => item.code === code && item.enabled));
  if (!ruleCode) {
    throw new Error('Kickstart billing rule does not exist or is disabled');
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

  const freezeId = await billingService.freezePoints(
    billingUserId,
    estimate.estimatedPoints,
    KICKSTART_BIZ_TYPE,
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
    },
  };
}

export async function settleKickstartBilling(
  billingService: BillingService | undefined,
  session: KickstartBillingSession | null,
): Promise<void> {
  if (!billingService || !session) return;
  await billingService.settleFreeze(session.billingUserId, session.freezeId, session.estimatedPoints);
}

export async function bindKickstartBillingBizId(
  billingService: BillingService | undefined,
  session: KickstartBillingSession | null,
  bizId: string,
): Promise<void> {
  if (!billingService || !session) return;
  await billingService.updateFreezeBizId(session.billingUserId, session.freezeId, bizId);
  session.bizId = bizId;
}

export async function cancelKickstartBilling(
  billingService: BillingService | undefined,
  session: KickstartBillingSession | null,
): Promise<void> {
  if (!billingService || !session) return;
  await billingService.settleFreeze(session.billingUserId, session.freezeId, 0);
}
