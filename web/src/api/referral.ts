import { http } from './http';

export type ReferralTier = {
  tierLevel: number;
  tierName: string;
  minRechargeCny: number;
  referralQuota: number;
  commissionPct: number;
  description: string | null;
};

export type ReferralStats = {
  currentTier: ReferralTier;
  nextTier: ReferralTier | null;
  nextTierGap: number;
  quotaUsed: number;
  quotaTotal: number;
  activeCount: number;
  rechargedCount: number;
  totalRegisterRewardPoints: number;
  totalCommissionPoints: number;
  pendingCommissionPoints: number;
  referralCode: string;
};

export type ReferralSystemConfig = {
  enabled: boolean;
  registerRewardPoints: number;
  registerRewardDelayHours: number;
  requiredActivityCount: number;
  commissionDelayDays: number;
  commissionMinRechargePoints: number;
  flagSameIpCount: number;
  maxMonthlyRegisterRewards: number;
  maxMonthlyCommissionPoints: number;
  updatedAt: string;
};

// ─── 用户接口 ────────────────────────────────────────────────

export async function fetchMyReferralStats(): Promise<ReferralStats> {
  const res = await http.get('/referral/me/stats');
  return res.data;
}

// ─── 管理员接口 ──────────────────────────────────────────────

export async function fetchAdminReferralConfig(): Promise<ReferralSystemConfig> {
  const res = await http.get('/referral/admin/config');
  return res.data;
}

export async function saveAdminReferralConfig(patch: Partial<ReferralSystemConfig>): Promise<ReferralSystemConfig> {
  const res = await http.put('/referral/admin/config', patch);
  return res.data;
}

export async function fetchAdminReferralTiers(): Promise<ReferralTier[]> {
  const res = await http.get('/referral/admin/tiers');
  return res.data;
}

export async function saveAdminReferralTier(
  level: number,
  patch: Partial<Omit<ReferralTier, 'tierLevel'>>,
): Promise<ReferralTier> {
  const res = await http.put(`/referral/admin/tiers/${level}`, patch);
  return res.data;
}

