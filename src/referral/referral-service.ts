import type { AuthDb } from '../auth/types.js';
import type { BillingService } from '../billing/billing-service.js';
import type { ReferralStats, ReferralEvent } from './types.js';
import {
  getReferralConfig,
  getReferralTiers,
  getOrCreateReferralCode,
  getReferralCodeByCode,
  createReferralEvent,
  getReferralEventByReferred,
  markReferralEventActive,
  markReferralRewardGranted,
  incrementReferralActivity,
  addReferralRechargedPoints,
  getReferrerQuotaUsed,
  getPendingRegisterRewards,
  listReferralEventsByReferrer,
  enqueueCommission,
  getDueCommissions,
  getCommissionsByReferrer,
  markCommissionSettled,
  getMonthlyCommissionPoints,
  getMonthlyRegisterRewardCount,
  countReferralsByIp,
} from './referral-db.js';
import type { ReferralSystemConfig, ReferralTier } from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ReferralService');

// ─── 公共错误类 ──────────────────────────────────────────────

export class ReferralNotEnabledError extends Error {
  constructor() { super('拉新功能未开启'); this.name = 'ReferralNotEnabledError'; }
}

export class ReferralNoQuotaError extends Error {
  constructor() { super('您当前的席位等级暂无拉新资格，或拉新名额已用完'); this.name = 'ReferralNoQuotaError'; }
}

export class ReferralCodeNotFoundError extends Error {
  constructor() { super('推荐码无效'); this.name = 'ReferralCodeNotFoundError'; }
}

// ─── 服务类 ──────────────────────────────────────────────────

export class ReferralService {
  constructor(
    private readonly db: AuthDb,
    private readonly billingService: BillingService,
  ) {}

  // ── 计算用户当前等级 ──────────────────────────────────────

  async getUserTier(userId: string): Promise<ReferralTier> {
    const [account, tiers] = await Promise.all([
      this.billingService.getAccount(userId),
      getReferralTiers(this.db),
    ]);

    const rechargeCny = account.lifetimeRechargeCny ?? 0;
    // 从最高等级往下找第一个满足条件的
    const sorted = [...tiers].sort((a, b) => b.minRechargeCny - a.minRechargeCny);
    const matched = sorted.find((t) => rechargeCny >= t.minRechargeCny);
    return matched ?? tiers[0];
  }

  // ── 获取/生成推荐码（需等级 >= 1 且启用功能） ─────────────

  async getMyReferralCode(userId: string): Promise<{ code: string; tier: ReferralTier; quotaUsed: number }> {
    const config = await getReferralConfig(this.db);
    if (!config.enabled) throw new ReferralNotEnabledError();

    const tier = await this.getUserTier(userId);
    if (tier.referralQuota === 0) throw new ReferralNoQuotaError();

    const [code, quotaUsed] = await Promise.all([
      getOrCreateReferralCode(this.db, userId),
      getReferrerQuotaUsed(this.db, userId),
    ]);

    return { code: code.code, tier, quotaUsed };
  }

  // ── 验证推荐码（注册时调用） ─────────────────────────────

  async validateReferralCode(
    code: string,
  ): Promise<{ referrerId: string; referrerTier: ReferralTier; registerRewardPoints: number }> {
    const config = await getReferralConfig(this.db);
    if (!config.enabled) throw new ReferralNotEnabledError();

    const referralCode = await getReferralCodeByCode(this.db, code);
    if (!referralCode) throw new ReferralCodeNotFoundError();

    const referrerId = referralCode.userId;
    const [referrerTier, quotaUsed] = await Promise.all([
      this.getUserTier(referrerId),
      getReferrerQuotaUsed(this.db, referrerId),
    ]);

    if (referrerTier.referralQuota === 0) {
      throw new ReferralNoQuotaError();
    }
    // -1 表示无限制
    if (referrerTier.referralQuota !== -1 && quotaUsed >= referrerTier.referralQuota) {
      throw new ReferralNoQuotaError();
    }

    return { referrerId, referrerTier, registerRewardPoints: config.registerRewardPoints };
  }

  // ── 用户注册成功后调用 ────────────────────────────────────

  async onUserRegistered(
    referredId: string,
    referralCode: string,
    referredIp: string | null,
    referredDeviceFp: string | null,
  ): Promise<void> {
    try {
      const config = await getReferralConfig(this.db);
      const referralCodeRecord = await getReferralCodeByCode(this.db, referralCode);
      if (!referralCodeRecord) {
        log.warn(`推荐码不存在，跳过 referralCode=${referralCode}`);
        return;
      }

      const referrerId = referralCodeRecord.userId;

      // 反欺诈：同 IP 检测
      let isSuspectedFraud = false;
      let flagReason: string | null = null;
      if (referredIp) {
        const sameIpCount = await countReferralsByIp(this.db, referredIp);
        if (sameIpCount >= config.flagSameIpCount) {
          isSuspectedFraud = true;
          flagReason = `同一 IP (${referredIp}) 已有 ${sameIpCount} 个推荐注册，超过阈值 ${config.flagSameIpCount}`;
        }
      }

      await createReferralEvent(this.db, {
        referrerId,
        referredId,
        referralCode,
        registerRewardPoints: config.registerRewardPoints,
        registerRewardDelayHours: config.registerRewardDelayHours,
        referredIp,
        referredDeviceFp: referredDeviceFp ?? null,
        isSuspectedFraud,
        flagReason,
      });

      log.info(`拉新关系已记录: referrer=${referrerId.slice(0, 8)}, referred=${referredId.slice(0, 8)}, flagged=${isSuspectedFraud}`);
    } catch (err) {
      log.warn('onUserRegistered 处理失败', { message: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── 被推荐人完成首次生成时调用 ───────────────────────────

  async onUserActivityCompleted(userId: string): Promise<void> {
    try {
      const event = await getReferralEventByReferred(this.db, userId);
      if (!event) return; // 该用户无推荐关系

      if (event.status === 'pending') {
        await markReferralEventActive(this.db, event.id);
        log.info(`拉新事件激活: eventId=${event.id}`);
      } else {
        await incrementReferralActivity(this.db, event.id);
      }
    } catch (err) {
      log.warn('onUserActivityCompleted 处理失败', { message: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── 被推荐人充值成功时调用 ───────────────────────────────

  async onUserRecharged(userId: string, rechargePoints: number): Promise<void> {
    try {
      const config = await getReferralConfig(this.db);
      if (!config.enabled) return;
      if (rechargePoints < config.commissionMinRechargePoints) return;

      const event = await getReferralEventByReferred(this.db, userId);
      if (!event || event.status === 'invalid' || event.status === 'flagged') return;

      const referrerId = event.referrerId;

      // 更新被推荐人累计充值
      await addReferralRechargedPoints(this.db, event.id, rechargePoints);

      // 检查推荐人等级及佣金比例
      const referrerTier = await this.getUserTier(referrerId);
      if (referrerTier.commissionPct <= 0) return;

      // 检查月度上限
      const monthlyCommission = await getMonthlyCommissionPoints(this.db, referrerId);
      if (monthlyCommission >= config.maxMonthlyCommissionPoints) {
        log.info(`推荐人 ${referrerId.slice(0, 8)} 本月佣金已达上限，跳过`);
        return;
      }

      const rawCommission = Math.floor((rechargePoints * referrerTier.commissionPct) / 100);
      // 确保不超过月度剩余额度
      const remainingQuota = config.maxMonthlyCommissionPoints - monthlyCommission;
      const commissionPoints = Math.min(rawCommission, remainingQuota);

      if (commissionPoints <= 0) return;

      await enqueueCommission(this.db, {
        referrerId,
        referralEventId: event.id,
        rechargedPoints: rechargePoints,
        commissionPct: referrerTier.commissionPct,
        commissionPoints,
        commissionDelayDays: config.commissionDelayDays,
      });

      log.info(`佣金入队: referrer=${referrerId.slice(0, 8)}, points=${commissionPoints}, settleIn=${config.commissionDelayDays}d`);
    } catch (err) {
      log.warn('onUserRecharged 处理失败', { message: err instanceof Error ? err.message : String(err) });
    }
  }

  // ── 结算到期注册奖励（调度器调用） ──────────────────────

  async settlePendingRegisterRewards(): Promise<void> {
    const events = await getPendingRegisterRewards(this.db);
    if (events.length === 0) return;

    log.info(`待结算注册奖励: ${events.length} 条`);
    for (const event of events) {
      try {
        const config = await getReferralConfig(this.db);

        // 检查月度上限
        const monthlyCount = await getMonthlyRegisterRewardCount(this.db, event.referrerId);
        if (monthlyCount >= config.maxMonthlyRegisterRewards) {
          log.info(`推荐人 ${event.referrerId.slice(0, 8)} 本月注册奖励已达上限`);
          continue;
        }

        const { ledgerItem } = await this.billingService.adjustPoints(
          event.referrerId,
          event.registerRewardPoints,
          {
            remark: `拉新注册奖励，被推荐用户 ${event.referredId.slice(0, 8)}`,
            operatorId: `referral:${event.id}`,
          },
        );

        // 覆盖 bizType 为 referral.register-reward
        ledgerItem.bizType = 'referral.register-reward';
        ledgerItem.bizId = event.id;

        await markReferralRewardGranted(this.db, event.id, ledgerItem.id);
        log.info(`注册奖励已发放: eventId=${event.id}, points=${event.registerRewardPoints}`);
      } catch (err) {
        log.warn(`注册奖励发放失败 eventId=${event.id}`, { message: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  // ── 结算到期佣金（调度器调用） ───────────────────────────

  async settleDueCommissions(): Promise<void> {
    const items = await getDueCommissions(this.db);
    if (items.length === 0) return;

    log.info(`待结算佣金: ${items.length} 条`);
    for (const item of items) {
      try {
        const { ledgerItem } = await this.billingService.adjustPoints(
          item.referrerId,
          item.commissionPoints,
          {
            remark: `拉新充值佣金 ${item.commissionPct}%，积分 ${item.commissionPoints}`,
            operatorId: `referral-commission:${item.id}`,
          },
        );

        ledgerItem.bizType = 'referral.commission';
        ledgerItem.bizId = item.id;

        await markCommissionSettled(this.db, item.id, ledgerItem.id);
        log.info(`佣金已结算: id=${item.id}, points=${item.commissionPoints}`);
      } catch (err) {
        log.warn(`佣金结算失败 id=${item.id}`, { message: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  // ── 用户面板统计 ─────────────────────────────────────────

  async getUserReferralStats(userId: string): Promise<ReferralStats> {
    const [tiers, code, quotaUsed] = await Promise.all([
      getReferralTiers(this.db),
      getOrCreateReferralCode(this.db, userId).catch(() => null),
      getReferrerQuotaUsed(this.db, userId),
    ]);

    const account = await this.billingService.getAccount(userId);
    const rechargeCny = account.lifetimeRechargeCny ?? 0;

    const sorted = [...tiers].sort((a, b) => b.minRechargeCny - a.minRechargeCny);
    const currentTier = sorted.find((t) => rechargeCny >= t.minRechargeCny) ?? tiers[0];
    const nextTier = tiers.find((t) => t.tierLevel === currentTier.tierLevel + 1) ?? null;
    const nextTierGap = nextTier ? Math.max(0, nextTier.minRechargeCny - rechargeCny) : 0;

    const events = await listReferralEventsByReferrer(this.db, userId, 1000, 0);
    const activeCount = events.filter((e) => e.status === 'active' || e.status === 'rewarded').length;
    const rechargedCount = events.filter((e) => e.rechargedPointsTotal > 0).length;
    const totalRegisterRewardPoints = events
      .filter((e) => e.registerRewardGrantedAt)
      .reduce((sum, e) => sum + e.registerRewardPoints, 0);
    const totalCommissionPoints = events.reduce((sum, e) => sum + e.commissionPointsTotal, 0);

    // 待结算佣金（从用户队列统计）
    const myCommissions = await getCommissionsByReferrer(this.db, userId);
    const pendingCommissionPoints = myCommissions
      .filter((i) => i.status === 'pending')
      .reduce((sum, i) => sum + i.commissionPoints, 0);

    return {
      currentTier,
      nextTier,
      nextTierGap,
      quotaUsed,
      quotaTotal: currentTier.referralQuota,
      activeCount,
      rechargedCount,
      totalRegisterRewardPoints,
      totalCommissionPoints,
      pendingCommissionPoints,
      referralCode: code?.code ?? '',
    };
  }

  // ── 获取拉新事件列表 ─────────────────────────────────────

  async getMyReferralEvents(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<ReferralEvent[]> {
    return listReferralEventsByReferrer(this.db, userId, limit, offset);
  }

  // ── 管理员接口 ───────────────────────────────────────────

  async getAdminConfig(): Promise<ReferralSystemConfig> {
    return getReferralConfig(this.db);
  }

  async updateAdminConfig(patch: Partial<Omit<ReferralSystemConfig, 'updatedAt'>>): Promise<ReferralSystemConfig> {
    const updated = await import('./referral-db.js').then((m) => m.updateReferralConfig(this.db, patch));
    log.info('拉新系统配置已更新');
    return updated;
  }

  async getAdminTiers(): Promise<ReferralTier[]> {
    return getReferralTiers(this.db);
  }

  async updateAdminTier(
    tierLevel: number,
    patch: Partial<Omit<ReferralTier, 'tierLevel'>>,
  ): Promise<void> {
    await import('./referral-db.js').then((m) => m.updateReferralTier(this.db, tierLevel, patch));
    log.info(`席位等级 ${tierLevel} 已更新`);
  }
}
