/** 拉新系统全局配置 */
export interface ReferralSystemConfig {
  enabled: boolean;
  /** 注册奖励积分（推荐人获得） */
  registerRewardPoints: number;
  /** 注册奖励延迟发放时间（小时） */
  registerRewardDelayHours: number;
  /** 被推荐人需完成的生成次数才算"活跃" */
  requiredActivityCount: number;
  /** 充值佣金结算延迟天数（防退款） */
  commissionDelayDays: number;
  /** 触发佣金的最低充值积分 */
  commissionMinRechargePoints: number;
  /** 同IP注册超过N人自动标记为可疑 */
  flagSameIpCount: number;
  /** 每月最多获得注册奖励次数 */
  maxMonthlyRegisterRewards: number;
  /** 每月最多获得佣金积分 */
  maxMonthlyCommissionPoints: number;
  updatedAt: string;
}

/** 默认配置值 */
export const DEFAULT_REFERRAL_CONFIG: Omit<ReferralSystemConfig, 'updatedAt'> = {
  enabled: false,
  registerRewardPoints: 200,
  registerRewardDelayHours: 24,
  requiredActivityCount: 1,
  commissionDelayDays: 7,
  commissionMinRechargePoints: 100,
  flagSameIpCount: 3,
  maxMonthlyRegisterRewards: 50,
  maxMonthlyCommissionPoints: 50000,
};

/** 席位等级配置 */
export interface ReferralTier {
  /** 等级编号（0-5） */
  tierLevel: number;
  /** 等级名称 */
  tierName: string;
  /** 达到此等级所需的最低充值金额（RMB） */
  minRechargeCny: number;
  /** 可拉新人数配额（-1 = 无限制） */
  referralQuota: number;
  /** 充值佣金比例（0-100，百分比） */
  commissionPct: number;
  description: string | null;
}

/** 默认席位等级 */
export const DEFAULT_REFERRAL_TIERS: ReferralTier[] = [
  { tierLevel: 0, tierName: '新人', minRechargeCny: 0, referralQuota: 0, commissionPct: 0, description: '尚未消费，暂无拉新资格' },
  { tierLevel: 1, tierName: '创作者', minRechargeCny: 19, referralQuota: 5, commissionPct: 0, description: '入门套餐用户，可邀请5人体验' },
  { tierLevel: 2, tierName: '高阶创作者', minRechargeCny: 59, referralQuota: 15, commissionPct: 3, description: '主力套餐用户，可获得3%充值佣金' },
  { tierLevel: 3, tierName: '签约作者', minRechargeCny: 129, referralQuota: 50, commissionPct: 5, description: '专业套餐用户，可获得5%充值佣金' },
  { tierLevel: 4, tierName: '资深作者', minRechargeCny: 299, referralQuota: 200, commissionPct: 8, description: '旗舰套餐用户，可获得8%充值佣金' },
  { tierLevel: 5, tierName: '驻站大神', minRechargeCny: 999, referralQuota: -1, commissionPct: 10, description: '顶级创作者，无限拉新并获得10%充值佣金' },
];

/** 用户推荐码 */
export interface ReferralCode {
  code: string;
  userId: string;
  createdAt: string;
}

/** 拉新关系事件状态 */
export type ReferralEventStatus = 'pending' | 'active' | 'rewarded' | 'flagged' | 'invalid';

/** 拉新关系事件 */
export interface ReferralEvent {
  id: string;
  referrerId: string;
  referredId: string;
  referralCode: string;
  status: ReferralEventStatus;
  registerRewardPoints: number;
  registerRewardScheduledAt: string | null;
  registerRewardGrantedAt: string | null;
  registerRewardLedgerId: string | null;
  activityCount: number;
  rechargedPointsTotal: number;
  commissionPointsTotal: number;
  referredIp: string | null;
  referredDeviceFp: string | null;
  flagReason: string | null;
  createdAt: string;
  activatedAt: string | null;
}

/** 佣金待结算队列项 */
export interface CommissionQueueItem {
  id: string;
  referrerId: string;
  referralEventId: string;
  rechargedPoints: number;
  commissionPct: number;
  commissionPoints: number;
  status: 'pending' | 'settled' | 'cancelled';
  settleAt: string;
  settledAt: string | null;
  ledgerId: string | null;
  cancelReason: string | null;
  createdAt: string;
}

/** 用户拉新统计（面板数据） */
export interface ReferralStats {
  /** 当前等级 */
  currentTier: ReferralTier;
  /** 下一等级（null 表示已满级） */
  nextTier: ReferralTier | null;
  /** 距下一等级还差多少充值金额 */
  nextTierGap: number;
  /** 配额使用情况 */
  quotaUsed: number;
  quotaTotal: number;
  /** 推荐成功（活跃）的人数 */
  activeCount: number;
  /** 已充值的被推荐人数 */
  rechargedCount: number;
  /** 已获得的注册奖励积分总计 */
  totalRegisterRewardPoints: number;
  /** 已获得的佣金积分总计 */
  totalCommissionPoints: number;
  /** 待结算佣金积分 */
  pendingCommissionPoints: number;
  /** 推荐链接 */
  referralCode: string;
}

