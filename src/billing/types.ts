import { z } from 'zod';

export const BillingUserId = z.string().min(3).max(64).regex(
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/,
  'Invalid billing user id',
);

export const BillingAccount = z.object({
  userId: BillingUserId,
  balancePoints: z.number().int().min(0),
  frozenPoints: z.number().int().min(0).default(0),
  lifetimeRechargePoints: z.number().int().min(0).default(0),
  lifetimeRechargeCny: z.number().min(0).default(0),
  updatedAt: z.string().datetime(),
});
export type BillingAccount = z.infer<typeof BillingAccount>;

export const BillingLedgerItem = z.object({
  id: z.string().uuid(),
  userId: BillingUserId,
  type: z.enum(['recharge', 'consume', 'refund', 'adjust', 'freeze', 'unfreeze', 'settle']),
  bizType: z.string().min(1).max(64),
  bizId: z.string().min(1).max(128),
  deltaPoints: z.number().int(),
  balanceAfter: z.number().int().min(0),
  frozenAfter: z.number().int().min(0).default(0),
  remark: z.string().max(200).default(''),
  createdAt: z.string().datetime(),
});
export type BillingLedgerItem = z.infer<typeof BillingLedgerItem>;

export const BillingRule = z.object({
  code: z.string().min(1).max(64),
  title: z.string().min(1).max(80),
  description: z.string().max(240).default(''),
  category: z.enum(['generation', 'capability', 'package']),
  chargeMode: z.enum(['per_1k_chars', 'per_call', 'package']),
  unitPricePoints: z.number().int().min(0),
  minPoints: z.number().int().min(0).default(0),
  enabled: z.boolean().default(true),
});
export type BillingRule = z.infer<typeof BillingRule>;

export const BillingRedemptionGrant = z.object({
  enabled: z.boolean().default(false),
  title: z.string().max(80).default(''),
  quantity: z.number().int().min(1).max(50).default(1),
  pointsPerCode: z.number().int().min(1).max(1_000_000).default(100),
  expiresInDays: z.number().int().min(1).max(3650).default(30),
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/).default('TOPUP'),
  remark: z.string().max(200).default(''),
});
export type BillingRedemptionGrant = z.infer<typeof BillingRedemptionGrant>;

export const BillingRechargePackage = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(80),
  amountCny: z.number().positive(),
  points: z.number().int().positive(),
  bonusPoints: z.number().int().min(0).default(0),
  description: z.string().max(240).default(''),
  featured: z.boolean().default(false),
  enabled: z.boolean().default(true),
  redemptionGrant: BillingRedemptionGrant.default({
    enabled: false,
    title: '',
    quantity: 1,
    pointsPerCode: 100,
    expiresInDays: 30,
    prefix: 'TOPUP',
    remark: '',
  }),
});
export type BillingRechargePackage = z.infer<typeof BillingRechargePackage>;

export const BillingOperationBindings = z.object({
  generateChapterRuleCode: z.string().min(1).max(64),
  reviseChapterRuleCode: z.string().min(1).max(64),
  resizeChapterRuleCode: z.string().min(1).max(64),
  skillGeneratorCostPoints: z.number().int().min(0).default(99),
  coverAiGenerateRuleCode: z.string().min(1).max(64).default('cap.cover-ai'),
  coverAiPromptRuleCode: z.string().min(1).max(64).default('cap.cover-prompt'),
  characterPortraitRuleCode: z.string().min(1).max(64).default('cap.char-portrait'),
  characterPortraitPromptRuleCode: z.string().min(1).max(64).default('cap.char-portrait-prompt'),
  polishCharacterIntroRuleCode: z.string().min(1).max(64).default('cap.polish-intro'),
  sideStoryRuleCode: z.string().min(1).max(64).default('gen.side-story'),
  characterChatRuleCode: z.string().min(1).max(64).default('cap.char-chat'),
  expandIdeaRuleCode: z.string().min(1).max(64).default('cap.expand-idea'),
  characterMomentRuleCode: z.string().min(1).max(64).default('cap.char-moment'),
  comicPanelRuleCode: z.string().min(1).max(64).default('cap.comic-panel'),
});
export type BillingOperationBindings = z.infer<typeof BillingOperationBindings>;

export const BillingFreeTrial = z.object({
  signupGiftPoints: z.number().int().min(0),
  firstDayMaxChars: z.number().int().min(0),
  firstWeekMaxChars: z.number().int().min(0),
  singleChapterMaxChars: z.number().int().min(0),
});
export type BillingFreeTrial = z.infer<typeof BillingFreeTrial>;

export const BillingProductPresentation = z.object({
  chapterBoostTitle: z.string().min(1).max(80).default('章节增强包'),
});
export type BillingProductPresentation = z.infer<typeof BillingProductPresentation>;

export const BillingExternalStorefront = z.object({
  enabled: z.boolean().default(false),
  providerName: z.string().min(1).max(40).default('第三方发卡平台'),
  title: z.string().min(1).max(80).default('购买兑换码'),
  description: z.string().max(240).default('通过第三方发卡平台购买兑换码，购买完成后回到站内兑换积分。'),
  buttonText: z.string().min(1).max(40).default('前往购买'),
  url: z.union([z.literal(''), z.string().url()]).default(''),
  openInNewTab: z.boolean().default(true),
  notice: z.string().max(240).default('购买成功后复制兑换码，回到积分中心输入兑换码即可到账。'),
});
export type BillingExternalStorefront = z.infer<typeof BillingExternalStorefront>;

export const BillingSystemConfig = z.object({
  pointScale: z.number().int().positive(),
  trialQuotaChars: z.number().int().min(0).default(30000),
  freeTrial: BillingFreeTrial,
  productPresentation: BillingProductPresentation.default({
    chapterBoostTitle: '章节增强包',
  }),
  externalStorefront: BillingExternalStorefront.default({
    enabled: false,
    providerName: '第三方发卡平台',
    title: '购买兑换码',
    description: '通过第三方发卡平台购买兑换码，购买完成后回到站内兑换积分。',
    buttonText: '前往购买',
    url: '',
    openInNewTab: true,
    notice: '购买成功后复制兑换码，回到积分中心输入兑换码即可到账。',
  }),
  operationBindings: BillingOperationBindings,
  rules: BillingRule.array(),
  packages: BillingRechargePackage.array(),
  updatedAt: z.string().datetime(),
});
export type BillingSystemConfig = z.infer<typeof BillingSystemConfig>;

export const BillingOrderChannel = z.enum(['demo', 'alipay', 'wechat']);
export type BillingOrderChannel = z.infer<typeof BillingOrderChannel>;

export const BillingOrderStatus = z.enum(['created', 'paid', 'failed', 'closed', 'refunded']);
export type BillingOrderStatus = z.infer<typeof BillingOrderStatus>;

export const BillingPaymentScene = z.enum(['demo', 'alipay.page', 'wechat.native', 'wechat.h5']);
export type BillingPaymentScene = z.infer<typeof BillingPaymentScene>;

export const BillingOrder = z.object({
  id: z.string().uuid(),
  userId: BillingUserId,
  title: z.string().min(1).max(120).default('Account topup'),
  packageId: z.string().max(64).optional(),
  amountCny: z.number().positive(),
  points: z.number().int().positive(),
  bonusPoints: z.number().int().min(0).default(0),
  totalPoints: z.number().int().positive(),
  channel: BillingOrderChannel,
  status: BillingOrderStatus,
  paymentScene: BillingPaymentScene.default('demo'),
  remark: z.string().max(200).default(''),
  channelTradeNo: z.string().max(128).optional(),
  paymentUrl: z.string().max(4000).optional(),
  codeUrl: z.string().max(4000).optional(),
  failureReason: z.string().max(240).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  paidAt: z.string().datetime().optional(),
  closedAt: z.string().datetime().optional(),
});
export type BillingOrder = z.infer<typeof BillingOrder>;

export const BillingEstimateResult = z.object({
  ruleCode: z.string(),
  units: z.number().positive(),
  estimatedPoints: z.number().int().min(0),
  estimatedCny: z.number().min(0),
});
export type BillingEstimateResult = z.infer<typeof BillingEstimateResult>;

export const BillingRedemptionCode = z.object({
  id: z.string().uuid(),
  code: z.string().min(6).max(32).regex(/^[A-Z0-9-]+$/),
  title: z.string().min(1).max(80),
  points: z.number().int().positive(),
  sourceType: z.enum(['topup_reward', 'manual']),
  sourceId: z.string().min(1).max(128),
  ownerUserId: BillingUserId.optional(),
  packageId: z.string().max(64).optional(),
  status: z.enum(['issued', 'redeemed', 'expired', 'disabled']).default('issued'),
  remark: z.string().max(200).default(''),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable().default(null),
  redeemedAt: z.string().datetime().optional(),
  redeemedByUserId: BillingUserId.optional(),
});
export type BillingRedemptionCode = z.infer<typeof BillingRedemptionCode>;
