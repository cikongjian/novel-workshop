import { z } from 'zod';
import {
  BillingRechargePackage,
  BillingRule,
  BillingSystemConfig,
  BillingUserId,
} from '../../../billing/types.js';

export const LedgerQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const EstimateBody = z.object({
  ruleCode: z.string().min(1).max(64),
  charCount: z.number().int().positive().optional(),
  quantity: z.number().int().positive().optional(),
});

export const RedeemCodeBody = z.object({
  code: z.string().min(6).max(32),
});

export const ManualCodeBody = z.object({
  title: z.string().min(1).max(80),
  points: z.number().int().positive().max(1_000_000),
  quantity: z.number().int().min(1).max(200),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
  prefix: z.string().trim().min(2).max(12).optional(),
  ownerUserId: z.string().trim().min(3).max(64).optional(),
  remark: z.string().max(200).optional(),
});

export const CodeStatusBody = z.object({
  status: z.enum(['issued', 'disabled']),
});

export const BatchStatusBody = z.object({
  status: z.enum(['issued', 'disabled']),
});

export const BillingPageQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const BillingConfigBody = z.object({
  pointScale: z.number().int().positive(),
  trialQuotaChars: z.number().int().min(0).optional(),
  freeTrial: z.object({
    signupGiftPoints: z.number().int().min(0),
    firstDayMaxChars: z.number().int().min(0),
    firstWeekMaxChars: z.number().int().min(0),
    singleChapterMaxChars: z.number().int().min(0),
  }),
  productPresentation: z.object({
    chapterBoostTitle: z.string().min(1).max(80),
  }),
  externalStorefront: z.object({
    enabled: z.boolean(),
    providerName: z.string().min(1).max(40),
    title: z.string().min(1).max(80),
    description: z.string().max(240),
    buttonText: z.string().min(1).max(40),
    url: z.union([z.literal(''), z.string().url()]),
    openInNewTab: z.boolean(),
    notice: z.string().max(240),
  }),
  operationBindings: z.object({
    generateChapterRuleCode: z.string().min(1).max(64),
    reviseChapterRuleCode: z.string().min(1).max(64),
    resizeChapterRuleCode: z.string().min(1).max(64),
    skillGeneratorCostPoints: z.number().int().min(0).optional(),
  }),
  rules: BillingRule.array().min(1),
  packages: BillingRechargePackage.array().min(1),
});

export function parseUserId(raw: string): string | null {
  const parsed = BillingUserId.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function authorizeUserAccess(req: import('express').Request, userId: string): string | null {
  const authId = req.auth?.id;
  const authRole = req.auth?.role;

  if (authRole === 'admin') return null;

  if (process.env.NODE_ENV === 'development' && authId === 'dev') {
    return null;
  }

  if (!authId || authId !== userId) return 'Forbidden';

  return null;
}

export function sendDeprecated(res: import('express').Response, code: string) {
  const messageByCode: Record<string, string> = {
    BILLING_RULES_DEPRECATED: '该计费规则接口已下线，请改用 /billing/pricing。',
    BILLING_PACKAGES_DEPRECATED: '该充值包接口已下线，请改用 /billing/pricing。',
    BILLING_MY_OVERVIEW_DEPRECATED: '该个人计费概览接口已下线，请改用 /billing/users/:userId/overview。',
    BILLING_MY_ACCOUNT_DEPRECATED: '该个人账户明细接口已下线，请改用 /billing/users/:userId/overview。',
    BILLING_MY_LEDGER_DEPRECATED: '该个人流水接口已下线，请改用 /billing/users/:userId/overview。',
    BILLING_USER_ACCOUNT_DEPRECATED: '该用户账户明细接口已下线，请改用 /billing/users/:userId/overview。',
    BILLING_USER_LEDGER_DEPRECATED: '该用户流水接口已下线，请改用 /billing/users/:userId/overview。',
  };
  return res.status(410).json({
    error: messageByCode[code] ?? '该计费接口已下线。',
    code,
  });
}

export function buildNextBillingConfig(input: z.infer<typeof BillingConfigBody>) {
  return BillingSystemConfig.parse({
    ...input,
    updatedAt: new Date().toISOString(),
  });
}
