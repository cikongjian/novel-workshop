import type { AuthDb } from './types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { NovelGenre, NovelStatus } from '../novel/types.js';
import type { BillingService } from '../billing/billing-service.js';
import type { BillingOrder, BillingPaymentScene } from '../billing/types.js';
import type { ReferralService } from '../referral/referral-service.js';
import { listUserApiProfiles } from './user-api-service.js';
import {
  getAdminUserCoreProfile,
  type AdminUserCoreProfile,
  logOptionalSectionFallback,
  pickLatest,
  compareTimestampsDesc,
} from './admin-user-insights-support.js';

type AdminUserRecentNovel = {
  id: string;
  title: string;
  genre: NovelGenre;
  status: NovelStatus;
  chapterCount: number;
  totalWords: number;
  updatedAt: string;
};

type AdminUserRecentOrder = {
  id: string;
  title: string;
  channel: BillingOrder['channel'];
  paymentScene: BillingPaymentScene;
  status: BillingOrder['status'];
  amountCny: number;
  totalPoints: number;
  createdAt: string;
  paidAt: string | null;
};

type AdminUserReferralSummary = {
  referralCode: string;
  quotaUsed: number;
  quotaTotal: number;
  activeCount: number;
  rechargedCount: number;
  totalRegisterRewardPoints: number;
  totalCommissionPoints: number;
  pendingCommissionPoints: number;
  flaggedEvents: number;
};

export type AdminUserInsights = {
  profile: AdminUserCoreProfile;
  creation: {
    novelCount: number;
    completedNovelCount: number;
    publishedNovelCount: number;
    chapterCount: number;
    totalWords: number;
    averageWordsPerChapter: number;
    topGenres: Array<{ genre: NovelGenre; count: number }>;
    recentNovels: AdminUserRecentNovel[];
  };
  activity: {
    lastActiveAt: string | null;
    activeDays7: number;
    activeDays30: number;
    preferredActivePeriod: string;
    preferredPaymentScene: string;
    recentActivitySources: string[];
    behaviorTags: string[];
    inferenceBasis: string;
  };
  billing: {
    balancePoints: number;
    frozenPoints: number;
    lifetimeRechargePoints: number;
    lifetimeRechargeCny: number;
    ledgerIncomePoints: number;
    ledgerExpensePoints: number;
    recentOrders: AdminUserRecentOrder[];
  };
  referral: AdminUserReferralSummary | null;
  apiProfiles: {
    total: number;
    enabledCount: number;
    defaultProfileName: string | null;
    defaultProvider: string | null;
    lastUsedAt: string | null;
    localStorageCount: number;
    serverStorageCount: number;
    recentProfiles: Array<{
      id: string;
      name: string;
      provider: string;
      model: string;
      storageMode: 'server' | 'local';
      isDefault: boolean;
      enabled: boolean;
      lastUsedAt: string | null;
    }>;
  };
  operational: {
    riskFlags: string[];
    notes: string[];
  };
};

type ServiceDeps = {
  db: AuthDb;
  novelManager?: NovelManager;
  billingService?: BillingService;
  referralService?: ReferralService;
};

function getPreferredPeriod(hour: number | null): string {
  if (hour == null) return '暂无明显活跃时段';
  if (hour < 6) return '凌晨活跃';
  if (hour < 12) return '上午活跃';
  if (hour < 18) return '下午活跃';
  if (hour < 23) return '晚间活跃';
  return '深夜活跃';
}

function getSceneLabel(scene: BillingPaymentScene | null): string {
  if (!scene) return '暂无支付偏好';
  if (scene === 'wechat.h5') return '移动 H5 支付偏好';
  if (scene === 'wechat.native') return '扫码支付偏好';
  if (scene === 'alipay.page') return '网页支付宝支付偏好';
  return '演示支付';
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export async function getAdminUserInsights(
  userId: string,
  deps: ServiceDeps,
): Promise<AdminUserInsights | null> {
  const profile = await getAdminUserCoreProfile(deps.db, userId);
  if (!profile) return null;

  const recentActivityTimestamps: string[] = [profile.updatedAt];
  const recentActivitySources = new Set<string>(['账号资料']);
  const activityDayKeys7 = new Set<string>();
  const activityDayKeys30 = new Set<string>();
  const hourBuckets = new Map<number, number>();

  const rememberActivity = (value: string | Date | null | undefined, source: string) => {
    if (!value) return;
    const isoValue = value instanceof Date ? value.toISOString() : String(value);
    recentActivityTimestamps.push(isoValue);
    recentActivitySources.add(source);

    const date = value instanceof Date ? value : new Date(isoValue);
    if (Number.isNaN(date.getTime())) return;

    const hour = date.getHours();
    hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + 1);

    const dayKey = isoValue.slice(0, 10);
    const ageDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (ageDays <= 7) activityDayKeys7.add(dayKey);
    if (ageDays <= 30) activityDayKeys30.add(dayKey);
  };

  rememberActivity(profile.createdAt, '注册时间');
  rememberActivity(profile.creatorAppliedAt, '作家申请');
  rememberActivity(profile.creatorApprovedAt, '作家审核');
  rememberActivity(profile.realNameVerifiedAt, '实名认证');

  let novelCount = 0;
  let completedNovelCount = 0;
  let publishedNovelCount = 0;
  let chapterCount = 0;
  let totalWords = 0;
  const genreCounter = new Map<NovelGenre, number>();
  const recentNovels: AdminUserRecentNovel[] = [];

  if (deps.novelManager) {
    try {
      const novels = (await deps.novelManager.listNovels())
        .filter((item) => (item.ownerId ?? 'dev') === userId);

      novelCount = novels.length;
      completedNovelCount = novels.filter((item) => item.status === 'completed').length;
      publishedNovelCount = novels.filter((item) => item.status === 'published').length;

      const snapshots = novels.map((novel) => {
        rememberActivity(novel.updatedAt, '小说更新');

        return {
          id: novel.id,
          title: novel.title,
          genre: novel.genre,
          status: novel.status,
          chapterCount: novel.chapterCount ?? 0,
          totalWords: novel.wordCount ?? 0,
          updatedAt: novel.updatedAt,
        } satisfies AdminUserRecentNovel;
      });

      for (const item of snapshots) {
        chapterCount += item.chapterCount;
        totalWords += item.totalWords;
        genreCounter.set(item.genre, (genreCounter.get(item.genre) ?? 0) + 1);
      }

      recentNovels.push(
        ...snapshots
          .sort((a, b) => compareTimestampsDesc(a.updatedAt, b.updatedAt))
          .slice(0, 5),
      );
    } catch (error) {
      logOptionalSectionFallback('creation insights', error);
    }
  }

  const topGenres = [...genreCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([genre, count]) => ({ genre, count }));
  const averageWordsPerChapter = chapterCount > 0 ? Math.round(totalWords / chapterCount) : 0;

  let balancePoints = 0;
  let frozenPoints = 0;
  let lifetimeRechargePoints = 0;
  let lifetimeRechargeCny = 0;
  let ledgerIncomePoints = 0;
  let ledgerExpensePoints = 0;
  let recentOrders: AdminUserRecentOrder[] = [];
  let preferredPaymentScene: BillingPaymentScene | null = null;

  if (deps.billingService) {
    try {
      const [account, ledger, orders] = await Promise.all([
        deps.billingService.getAccount(userId),
        deps.billingService.getLedger(userId, 60),
        deps.billingService.listOrdersForUser(userId, 20),
      ]);

      balancePoints = account.balancePoints;
      frozenPoints = account.frozenPoints;
      lifetimeRechargePoints = account.lifetimeRechargePoints;
      lifetimeRechargeCny = account.lifetimeRechargeCny;
      rememberActivity(account.updatedAt, '积分账户');

      for (const item of ledger) {
        if (item.deltaPoints >= 0) {
          ledgerIncomePoints += item.deltaPoints;
        } else {
          ledgerExpensePoints += Math.abs(item.deltaPoints);
        }
        rememberActivity(item.createdAt, '积分流水');
      }

      recentOrders = orders
        .sort((a, b) => compareTimestampsDesc(a.createdAt, b.createdAt))
        .slice(0, 6)
        .map((order) => ({
          id: order.id,
          title: order.title,
          channel: order.channel,
          paymentScene: order.paymentScene,
          status: order.status,
          amountCny: order.amountCny,
          totalPoints: order.totalPoints,
          createdAt: order.createdAt,
          paidAt: order.paidAt ?? null,
        }));

      const sceneCounter = new Map<BillingPaymentScene, number>();
      for (const order of recentOrders) {
        sceneCounter.set(order.paymentScene, (sceneCounter.get(order.paymentScene) ?? 0) + 1);
        rememberActivity(order.paidAt ?? order.createdAt, '充值支付');
      }

      preferredPaymentScene = [...sceneCounter.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    } catch (error) {
      logOptionalSectionFallback('billing insights', error);
    }
  }

  let apiProfiles: Awaited<ReturnType<typeof listUserApiProfiles>> = [];
  try {
    apiProfiles = await listUserApiProfiles(deps.db, userId);
  } catch (error) {
    logOptionalSectionFallback('user api profiles', error);
  }

  const enabledCount = apiProfiles.filter((item) => item.enabled).length;
  const defaultProfile = apiProfiles.find((item) => item.isDefault) ?? null;
  const lastApiUsedAt = pickLatest(apiProfiles.map((item) => item.lastUsedAt));
  rememberActivity(lastApiUsedAt, '用户 API');

  let referral: AdminUserReferralSummary | null = null;
  if (deps.referralService) {
    try {
      const [stats, events] = await Promise.all([
        deps.referralService.getUserReferralStats(userId),
        deps.referralService.getMyReferralEvents(userId, 100, 0),
      ]);

      referral = {
        referralCode: stats.referralCode,
        quotaUsed: stats.quotaUsed,
        quotaTotal: stats.quotaTotal,
        activeCount: stats.activeCount,
        rechargedCount: stats.rechargedCount,
        totalRegisterRewardPoints: stats.totalRegisterRewardPoints,
        totalCommissionPoints: stats.totalCommissionPoints,
        pendingCommissionPoints: stats.pendingCommissionPoints,
        flaggedEvents: events.filter((item) => item.status === 'flagged' || item.status === 'invalid').length,
      };

      for (const item of events) {
        rememberActivity(item.createdAt, '拉新事件');
        rememberActivity(item.activatedAt, '拉新激活');
      }
    } catch (error) {
      logOptionalSectionFallback('referral insights', error);
    }
  }

  const preferredHour = [...hourBuckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const lastActiveAt = recentActivityTimestamps.sort((a, b) => compareTimestampsDesc(a, b))[0] ?? null;

  const behaviorTags = unique([
    novelCount >= 5 ? '多项目创作用戶' : '',
    averageWordsPerChapter >= 2500 ? '长章节输出' : chapterCount > 0 ? '短平快更新' : '',
    activityDayKeys7.size >= 4 ? '近 7 天高频活跃' : '',
    publishedNovelCount > 0 ? '已有上架作品' : '',
    lifetimeRechargeCny >= 99 ? '高价值付费用戶' : lifetimeRechargeCny > 0 ? '付费用戶' : '未充值用户',
    enabledCount > 0 ? '已配置专属模型 API' : '',
    preferredPaymentScene === 'wechat.h5' ? '移动端支付偏好' : '',
    referral && referral.activeCount > 0 ? '具备拉新传播能力' : '',
    preferredHour != null ? getPreferredPeriod(preferredHour) : '',
  ].filter(Boolean));

  const riskFlags = unique([
    profile.status === 'disabled' ? '账号当前已禁用' : '',
    !profile.email ? '未绑定邮箱' : '',
    profile.role !== 'admin' && profile.creatorStatus === 'approved' && !profile.realNameVerified ? '作家资格已通过但尚未实名' : '',
    apiProfiles.some((item) => item.storageMode === 'local') ? '存在仅本地保存的用户 API 配置' : '',
    referral && referral.flaggedEvents > 0 ? `拉新异常事件 ${referral.flaggedEvents} 条` : '',
    lifetimeRechargeCny > 0 && novelCount === 0 ? '已充值但暂无名下小说' : '',
    novelCount > 0 && activityDayKeys30.size === 0 ? '近 30 天无创作活跃' : '',
  ].filter(Boolean));

  const notes = unique([
    topGenres[0] ? `主力题材偏向 ${topGenres[0].genre}` : '',
    recentNovels[0] ? `最近更新作品为《${recentNovels[0].title}》` : '',
    referral?.referralCode ? `已开通推荐码 ${referral.referralCode}` : '',
    defaultProfile ? `默认模型配置为 ${defaultProfile.provider} / ${defaultProfile.model}` : '',
    recentOrders[0] ? `最近一次充值场景为 ${getSceneLabel(recentOrders[0].paymentScene)}` : '',
  ].filter(Boolean));

  return {
    profile,
    creation: {
      novelCount,
      completedNovelCount,
      publishedNovelCount,
      chapterCount,
      totalWords,
      averageWordsPerChapter,
      topGenres,
      recentNovels,
    },
    activity: {
      lastActiveAt,
      activeDays7: activityDayKeys7.size,
      activeDays30: activityDayKeys30.size,
      preferredActivePeriod: getPreferredPeriod(preferredHour),
      preferredPaymentScene: getSceneLabel(preferredPaymentScene),
      recentActivitySources: [...recentActivitySources].slice(0, 8),
      behaviorTags,
      inferenceBasis: '基于账号资料、小说与章节更新时间、积分流水、充值订单、用户 API 使用和拉新事件推断。',
    },
    billing: {
      balancePoints,
      frozenPoints,
      lifetimeRechargePoints,
      lifetimeRechargeCny,
      ledgerIncomePoints,
      ledgerExpensePoints,
      recentOrders,
    },
    referral,
    apiProfiles: {
      total: apiProfiles.length,
      enabledCount,
      defaultProfileName: defaultProfile?.name ?? null,
      defaultProvider: defaultProfile?.provider ?? null,
      lastUsedAt: lastApiUsedAt,
      localStorageCount: apiProfiles.filter((item) => item.storageMode === 'local').length,
      serverStorageCount: apiProfiles.filter((item) => item.storageMode === 'server').length,
      recentProfiles: apiProfiles
        .slice()
        .sort((a, b) => compareTimestampsDesc(b.lastUsedAt ?? b.updatedAt, a.lastUsedAt ?? a.updatedAt))
        .slice(0, 5)
        .map((item) => ({
          id: item.id,
          name: item.name,
          provider: item.provider,
          model: item.model,
          storageMode: item.storageMode,
          isDefault: item.isDefault,
          enabled: item.enabled,
          lastUsedAt: item.lastUsedAt,
        })),
    },
    operational: {
      riskFlags,
      notes,
    },
  };
}
