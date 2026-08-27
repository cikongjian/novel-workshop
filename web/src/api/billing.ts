import { http } from './http';

export type BillingAccount = {
  userId: string;
  balancePoints: number;
  frozenPoints: number;
  lifetimeRechargePoints: number;
  lifetimeRechargeCny: number;
  updatedAt: string;
};

export type BillingLedgerItem = {
  id: string;
  userId: string;
  type: 'recharge' | 'consume' | 'refund' | 'adjust' | 'freeze' | 'unfreeze' | 'settle';
  bizType: string;
  bizId: string;
  deltaPoints: number;
  balanceAfter: number;
  frozenAfter: number;
  remark: string;
  createdAt: string;
};

export type BillingRule = {
  code: string;
  title: string;
  description: string;
  category: 'generation' | 'capability' | 'package';
  chargeMode: 'per_1k_chars' | 'per_call' | 'package';
  unitPricePoints: number;
  minPoints: number;
  enabled: boolean;
};

export type BillingRedemptionGrant = {
  enabled: boolean;
  title: string;
  quantity: number;
  pointsPerCode: number;
  expiresInDays: number;
  prefix: string;
  remark: string;
};

export type BillingRechargePackage = {
  id: string;
  title: string;
  amountCny: number;
  points: number;
  bonusPoints: number;
  description: string;
  featured: boolean;
  enabled: boolean;
  redemptionGrant: BillingRedemptionGrant;
};

export type BillingOperationBindings = {
  generateChapterRuleCode: string;
  reviseChapterRuleCode: string;
  resizeChapterRuleCode: string;
  skillGeneratorCostPoints?: number;
  coverAiGenerateRuleCode?: string;
  coverAiPromptRuleCode?: string;
  characterPortraitRuleCode?: string;
  characterPortraitPromptRuleCode?: string;
  polishCharacterIntroRuleCode?: string;
  sideStoryRuleCode?: string;
  characterChatRuleCode?: string;
  expandIdeaRuleCode?: string;
  characterMomentRuleCode?: string;
};

export type BillingFreeTrial = {
  signupGiftPoints: number;
  firstDayMaxChars: number;
  firstWeekMaxChars: number;
  singleChapterMaxChars: number;
};

export type BillingProductPresentation = {
  chapterBoostTitle: string;
};

export type BillingExternalStorefront = {
  enabled: boolean;
  providerName: string;
  title: string;
  description: string;
  buttonText: string;
  url: string;
  openInNewTab: boolean;
  notice: string;
};

export type BillingRedemptionCode = {
  id: string;
  code: string;
  title: string;
  points: number;
  sourceType: 'topup_reward' | 'manual';
  sourceId: string;
  ownerUserId?: string;
  packageId?: string;
  status: 'issued' | 'redeemed' | 'expired' | 'disabled';
  remark: string;
  createdAt: string;
  expiresAt: string | null;
  redeemedAt?: string;
  redeemedByUserId?: string;
};

export type BillingRedemptionBatchSummary = {
  batchKey: string;
  sourceType: BillingRedemptionCode['sourceType'];
  sourceId: string;
  title: string;
  points: number;
  quantity: number;
  issuedCount: number;
  redeemedCount: number;
  expiredCount: number;
  disabledCount: number;
  ownerUserId: string;
  createdAt: string;
  expiresAt: string | null;
  status: 'issued' | 'disabled' | 'partial' | 'completed';
};

export type BillingPageResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
};

export type BillingOrderChannel = 'demo' | 'alipay' | 'wechat';
export type BillingOrderStatus = 'created' | 'paid' | 'failed' | 'closed' | 'refunded';
export type BillingPaymentScene = 'demo' | 'alipay.page' | 'wechat.native' | 'wechat.h5';

export type BillingOrder = {
  id: string;
  userId: string;
  title: string;
  packageId?: string;
  amountCny: number;
  points: number;
  bonusPoints: number;
  totalPoints: number;
  channel: BillingOrderChannel;
  status: BillingOrderStatus;
  paymentScene: BillingPaymentScene;
  remark: string;
  channelTradeNo?: string;
  paymentUrl?: string;
  codeUrl?: string;
  failureReason?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  paidAt?: string;
  closedAt?: string;
};

export type BillingPaymentAction =
  | {
      type: 'redirect';
      channel: 'alipay' | 'wechat';
      scene: 'alipay.page' | 'wechat.h5';
      url: string;
      expiresAt?: string;
    }
  | {
      type: 'qrcode';
      channel: 'wechat';
      scene: 'wechat.native';
      codeUrl: string;
      qrCodeImageUrl?: string;
      expiresAt?: string;
    };

export type BillingPricingCatalog = {
  pointScale: number;
  freeTrial: BillingFreeTrial;
  productPresentation: BillingProductPresentation;
  externalStorefront: BillingExternalStorefront;
  operationBindings: BillingOperationBindings;
  rules: BillingRule[];
  packages: BillingRechargePackage[];
};

export type BillingSystemConfig = BillingPricingCatalog & {
  trialQuotaChars: number;
  updatedAt: string;
};

export type BillingOverview = BillingPricingCatalog & {
  account: BillingAccount;
  ledger: BillingLedgerItem[];
  trialQuota: { remaining: number; total: number };
};

export type BillingEstimateResult = {
  ruleCode: string;
  units: number;
  estimatedPoints: number;
  estimatedCny: number;
};

export async function fetchBillingPricing(): Promise<BillingPricingCatalog> {
  const { data } = await http.get<BillingPricingCatalog>('/billing/pricing');
  return data;
}

export async function fetchBillingOverview(userId: string, limit = 20): Promise<BillingOverview> {
  const { data } = await http.get<BillingOverview>(`/billing/users/${userId}/overview`, {
    params: { limit },
  });
  return data;
}

export async function estimateBilling(payload: {
  ruleCode: string;
  charCount?: number;
  quantity?: number;
}): Promise<BillingEstimateResult> {
  const { data } = await http.post<BillingEstimateResult>('/billing/estimate', payload);
  return data;
}

export async function createBillingTopupOrder(
  userId: string,
  payload: { packageId?: string; points?: number; amountCny?: number; remark?: string; channel: 'alipay' | 'wechat' },
): Promise<{ order: BillingOrder; paymentAction: BillingPaymentAction }> {
  const { data } = await http.post<{ order: BillingOrder; paymentAction: BillingPaymentAction }>(
    `/billing/users/${userId}/topups/orders`,
    payload,
  );
  return data;
}

export async function fetchBillingTopupOrder(userId: string, orderId: string): Promise<BillingOrder> {
  const { data } = await http.get<BillingOrder>(`/billing/users/${userId}/topups/orders/${orderId}`);
  return data;
}

export async function fetchBillingTopupOrders(userId: string): Promise<BillingOrder[]> {
  const { data } = await http.get<BillingOrder[]>(`/billing/users/${userId}/topups/orders`);
  return data;
}

export async function redeemBillingCode(code: string): Promise<{
  account: BillingAccount;
  ledgerItem: BillingLedgerItem;
  code: BillingRedemptionCode;
}> {
  const { data } = await http.post('/billing/my/redeem-code', { code });
  return data;
}

export async function fetchMyBillingCodes(): Promise<BillingRedemptionCode[]> {
  const { data } = await http.get<BillingRedemptionCode[]>('/billing/my/redemption-codes');
  return data;
}

export async function fetchAdminBillingConfig(): Promise<BillingSystemConfig> {
  const { data } = await http.get<BillingSystemConfig>('/billing/admin/config');
  return data;
}

export async function saveAdminBillingConfig(payload: BillingSystemConfig): Promise<BillingSystemConfig> {
  const { data } = await http.put<BillingSystemConfig>('/billing/admin/config', payload);
  return data;
}

export async function fetchAdminBillingCodes(): Promise<BillingRedemptionCode[]> {
  const { data } = await http.get<BillingRedemptionCode[]>('/billing/admin/redemption-codes');
  return data;
}

export async function fetchAdminBillingCodesPage(
  params: { page?: number; pageSize?: number } = {},
): Promise<BillingPageResult<BillingRedemptionCode>> {
  const { data } = await http.get<BillingPageResult<BillingRedemptionCode>>('/billing/admin/redemption-codes-page', {
    params,
  });
  return data;
}

export async function fetchAdminBillingCodeBatchesPage(
  params: { page?: number; pageSize?: number } = {},
): Promise<BillingPageResult<BillingRedemptionBatchSummary>> {
  const { data } = await http.get<BillingPageResult<BillingRedemptionBatchSummary>>('/billing/admin/redemption-batches', {
    params,
  });
  return data;
}

export async function fetchAdminBillingBatchCodes(batchKey: string): Promise<BillingRedemptionCode[]> {
  const { data } = await http.get<BillingRedemptionCode[]>(
    `/billing/admin/redemption-batches/${encodeURIComponent(batchKey)}/codes`,
  );
  return data;
}

export async function createManualBillingCodes(payload: {
  title: string;
  points: number;
  quantity: number;
  expiresInDays?: number;
  prefix?: string;
  ownerUserId?: string;
  remark?: string;
}): Promise<BillingRedemptionCode[]> {
  const { data } = await http.post<BillingRedemptionCode[]>('/billing/admin/redemption-codes/manual', payload);
  return data;
}

export async function updateBillingCodeStatus(
  codeId: string,
  status: 'issued' | 'disabled',
): Promise<BillingRedemptionCode> {
  const { data } = await http.post<BillingRedemptionCode>(`/billing/admin/redemption-codes/${codeId}/status`, { status });
  return data;
}

export async function updateBillingCodeBatchStatus(
  batchKey: string,
  status: 'issued' | 'disabled',
): Promise<BillingRedemptionCode[]> {
  const { data } = await http.post<BillingRedemptionCode[]>(
    `/billing/admin/redemption-batches/${encodeURIComponent(batchKey)}/status`,
    { status },
  );
  return data;
}

export async function adjustBillingUserPoints(
  userId: string,
  payload: { deltaPoints: number; remark?: string },
): Promise<{ account: BillingAccount; ledgerItem: BillingLedgerItem }> {
  const { data } = await http.post<{ account: BillingAccount; ledgerItem: BillingLedgerItem }>(
    `/billing/admin/users/${userId}/adjust`,
    payload,
  );
  return data;
}

export async function updateBillingUserTrialQuota(
  userId: string,
  payload: { remainingDelta?: number; totalDelta?: number },
): Promise<{ quotaUsed: number; quotaTotal: number; quotaRemaining: number }> {
  const { data } = await http.post<{ quotaUsed: number; quotaTotal: number; quotaRemaining: number }>(
    `/billing/admin/users/${userId}/trial-quota`,
    payload,
  );
  return data;
}
