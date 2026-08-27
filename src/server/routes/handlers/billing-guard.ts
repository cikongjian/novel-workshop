import type { BillingService } from '../../../billing/billing-service.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('BillingGuard');

/**
 * 通用 AI 计费守卫返回值
 */
export interface BillingGuardResult {
  /** 冻结记录 ID，用于结算 */
  freezeId: string;
  /** 预估积分数 */
  estimatedPoints: number;
  /** 计费规则 code */
  ruleCode: string;
}

/**
 * 通用 AI 计费守卫输入
 */
export interface BillingGuardInput {
  billingService: BillingService;
  userId: string;
  /** 操作类型 */
  operation: Parameters<BillingService['getOperationRuleCode']>[0];
  /** 预估字符数（per_1k_chars 模式需要） */
  charCount?: number;
  /** 调用次数（per_call 模式需要，默认 1） */
  quantity?: number;
  /** 业务标识 */
  bizType?: string;
  /** 业务 ID */
  bizId?: string;
}

/**
 * 开始 AI 计费：检查余额 → 冻结积分 → 返回 freezeId
 *
 * 使用方负责：AI 调用完成后调用 billingService.settleFreeze(userId, freezeId, actualPoints)
 * 使用方负责：AI 调用失败时调用 billingService.settleFreeze(userId, freezeId, 0) 退款
 */
export async function beginAIBilling(input: BillingGuardInput): Promise<BillingGuardResult> {
  const { billingService, userId, operation, charCount, quantity, bizType, bizId } = input;

  // 1. 获取操作对应的计费规则
  const ruleCode = await billingService.getOperationRuleCode(operation);

  // 2. 预估费用
  const estimate = await billingService.estimate({
    ruleCode,
    charCount: charCount ?? 3000,
    quantity: quantity ?? 1,
  });

  // 3. 检查余额
  const account = await billingService.getAccount(userId);
  if (account.balancePoints < estimate.estimatedPoints) {
    throw Object.assign(
      new Error('积分不足，请先充值'),
      { code: 'INSUFFICIENT_BALANCE', required: estimate.estimatedPoints, balance: account.balancePoints },
    );
  }

  // 4. 冻结积分
  const freezeId = await billingService.freezePoints(
    userId,
    estimate.estimatedPoints,
    bizType ?? `ai.${operation}`,
    bizId ?? `${operation}:${Date.now()}`,
  );

  log.info(`计费冻结: userId=${userId} operation=${operation} rule=${ruleCode} points=${estimate.estimatedPoints} freezeId=${freezeId}`);

  return { freezeId, estimatedPoints: estimate.estimatedPoints, ruleCode };
}

/**
 * 结算 AI 计费：根据实际消费解冻
 *
 * @param actualPoints 实际应扣积分（<= 0 则全额退款）
 */
export async function settleAIBilling(
  billingService: BillingService,
  userId: string,
  freezeId: string,
  actualPoints: number,
): Promise<void> {
  await billingService.settleFreeze(userId, freezeId, Math.max(0, Math.floor(actualPoints)));
}
