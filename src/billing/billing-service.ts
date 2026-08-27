import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { now } from '../utils/text.js';
import { BillingConfigStore } from './config-store.js';
import { BillingRedemptionCodeStore } from './redemption-code-store.js';
import {
  BillingAccount,
  BillingEstimateResult,
  BillingLedgerItem,
  BillingOrder,
  BillingRechargePackage,
  BillingSystemConfig,
  type BillingRedemptionCode,
  type BillingSystemConfig as BillingSystemConfigType,
} from './types.js';
import type {
  BillingCodePage,
  BillingRedemptionBatchPage,
} from './billing-db-store.js';
import { BillingTopupOrderStore } from './topup-order-store.js';
import { TrialStore, type TrialUsage } from './trial-store.js';
import type { Database } from 'better-sqlite3';
import {
  getAccount as dbGetAccount,
  batchGetAccounts as dbBatchGetAccounts,
  saveAccount as dbSaveAccount,
  getLedger as dbGetLedger,
  appendLedgerItem as dbAppendLedgerItem,
  findLedgerItem as dbFindLedgerItem,
} from './billing-db-store.js';

type EstimateInput = {
  ruleCode: string;
  charCount?: number;
  quantity?: number;
};

type BillingOperation =
  | 'generateChapter' | 'reviseChapter' | 'resizeChapter'
  | 'coverAiGenerate' | 'coverAiPrompt'
  | 'characterPortrait' | 'characterPortraitPrompt'
  | 'polishCharacterIntro' | 'sideStory' | 'characterChat'
  | 'expandIdea' | 'characterMoment'
  | 'comicPanel';
type ManualCodeInput = {
  title: string;
  points: number;
  quantity: number;
  expiresInDays?: number | null;
  prefix?: string;
  ownerUserId?: string;
  remark?: string;
};

type AdjustPointsInput = {
  remark?: string;
  operatorId?: string;
};

function addDays(baseIso: string, days: number): string {
  const date = new Date(baseIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/**
 * 简易互斥锁 — 确保同一 key 的操作串行执行，防止竞态条件
 * 用于 per-user 计费操作和 per-code 兑换码操作
 */
class UserMutex {
  private locks = new Map<string, Promise<void>>();

  async acquire(userId: string): Promise<() => void> {
    let release!: () => void;
    const current = this.locks.get(userId) ?? Promise.resolve();
    const next = new Promise<void>((resolve) => { release = resolve; });
    this.locks.set(userId, current.then(() => next));
    await current;
    return () => {
      release();
      // 如果当前锁是队列中最后一个，清理引用
      if (this.locks.get(userId) === next) this.locks.delete(userId);
    };
  }
}

export class BillingService {
  private readonly db: Database;
  private readonly configStore: BillingConfigStore;
  private readonly redemptionCodeStore: BillingRedemptionCodeStore;
  private readonly orderStore: BillingTopupOrderStore;
  private readonly trialStore: TrialStore;
  private readonly userMutex = new UserMutex();
  private readonly codeMutex = new UserMutex();

  constructor(dataDir: string, db: Database) {
    this.db = db;
    this.configStore = new BillingConfigStore(dataDir);
    this.redemptionCodeStore = new BillingRedemptionCodeStore(dataDir, db);
    this.orderStore = new BillingTopupOrderStore(dataDir, db);
    this.trialStore = new TrialStore(dataDir);
  }

  async getOverview(userId: string, ledgerLimit = 20) {
    const [config, account, ledger] = await Promise.all([
      this.getSystemConfig(),
      this.getAccount(userId),
      this.getLedger(userId, ledgerLimit),
    ]);

    const trialQuota = await this.checkTrialQuota(userId);

    return {
      pointScale: config.pointScale,
      freeTrial: config.freeTrial,
      productPresentation: config.productPresentation,
      operationBindings: config.operationBindings,
      trialQuota,
      account,
      ledger,
      rules: config.rules,
      packages: config.packages.filter(item => item.enabled),
    };
  }

  async getPricingCatalog() {
    const config = await this.getSystemConfig();
    return {
      pointScale: config.pointScale,
      trialQuotaChars: config.trialQuotaChars,
      freeTrial: config.freeTrial,
      productPresentation: config.productPresentation,
      operationBindings: config.operationBindings,
      rules: config.rules,
      packages: config.packages.filter(item => item.enabled),
    };
  }

  async getSystemConfig(): Promise<BillingSystemConfigType> {
    return this.configStore.getConfig();
  }

  async updateSystemConfig(input: BillingSystemConfigType): Promise<BillingSystemConfigType> {
    const nextConfig = BillingSystemConfig.parse(input);
    const enabledRuleCodes = new Set(nextConfig.rules.filter(item => item.enabled).map(item => item.code));
    const bindings = Object.entries(nextConfig.operationBindings)
      .filter(([key]) => key.endsWith('RuleCode'))
      .map(([, value]) => value as string);
    for (const ruleCode of bindings) {
      if (!enabledRuleCodes.has(ruleCode)) {
        throw new Error(`Operation binding rule is missing or disabled: ${ruleCode}`);
      }
    }
    return this.configStore.saveConfig(nextConfig);
  }

  async getPackages(): Promise<BillingRechargePackage[]> {
    return (await this.getSystemConfig()).packages.filter(item => item.enabled);
  }

  async getAccount(userId: string) {
    return dbGetAccount(this.db, userId);
  }

  /** 批量查询用户账户（用于管理员用户列表） */
  batchGetAccounts(userIds: string[]) {
    return dbBatchGetAccounts(this.db, userIds);
  }

  /** 批量查询用户试用字数用量（用于管理员用户列表） */
  batchGetTrials(userIds: string[]) {
    return this.trialStore.batchGet(userIds);
  }

  async listOrdersForUser(userId: string, limit = 20) {
    return this.orderStore.listOrdersForUser(userId, limit);
  }

  async getLedger(userId: string, limit = 50) {
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
    return dbGetLedger(this.db, userId, safeLimit);
  }

  async getOperationRuleCode(operation: BillingOperation): Promise<string> {
    const config = await this.getSystemConfig();
    const b = config.operationBindings;
    if (operation === 'generateChapter') return b.generateChapterRuleCode;
    if (operation === 'reviseChapter') return b.reviseChapterRuleCode;
    if (operation === 'resizeChapter') return b.resizeChapterRuleCode;
    if (operation === 'coverAiGenerate') return b.coverAiGenerateRuleCode;
    if (operation === 'coverAiPrompt') return b.coverAiPromptRuleCode;
    if (operation === 'characterPortrait') return b.characterPortraitRuleCode;
    if (operation === 'characterPortraitPrompt') return b.characterPortraitPromptRuleCode;
    if (operation === 'polishCharacterIntro') return b.polishCharacterIntroRuleCode;
    if (operation === 'sideStory') return b.sideStoryRuleCode;
    if (operation === 'characterChat') return b.characterChatRuleCode;
    if (operation === 'expandIdea') return b.expandIdeaRuleCode;
    if (operation === 'characterMoment') return b.characterMomentRuleCode;
    if (operation === 'comicPanel') return b.comicPanelRuleCode;
    return b.resizeChapterRuleCode;
  }

  async estimate(input: EstimateInput) {
    const config = await this.getSystemConfig();
    const rule = config.rules.find(item => item.code === input.ruleCode && item.enabled);
    if (!rule) {
      throw new Error('Billing rule does not exist or is disabled');
    }

    let units = 1;
    if (rule.chargeMode === 'per_1k_chars') {
      const charCount = Math.floor(input.charCount ?? 0);
      if (!Number.isFinite(charCount) || charCount <= 0) {
        throw new Error('charCount is required for per_1k_chars rules');
      }
      units = Math.max(1, Math.ceil(charCount / 1000));
    } else if (rule.chargeMode === 'per_call') {
      units = Math.max(1, Math.floor(input.quantity ?? 1));
    }

    const estimatedPoints = Math.max(rule.minPoints, rule.unitPricePoints * units);
    return BillingEstimateResult.parse({
      ruleCode: rule.code,
      units,
      estimatedPoints,
      estimatedCny: Number((estimatedPoints / config.pointScale).toFixed(2)),
    });
  }

  async creditTopupOrder(orderInput: BillingOrder): Promise<{
    account: BillingAccount;
    ledgerItem: BillingLedgerItem;
    issuedCodes: BillingRedemptionCode[];
  }> {
    const order = BillingOrder.parse(orderInput);
    if (order.status !== 'paid') {
      throw new Error(`Topup order ${order.id} is not paid`);
    }
    const releaseLock = await this.userMutex.acquire(order.userId);
    try {
    const [account, existingLedger, existingIssuedCodes, config] = await Promise.all([
      this.getAccount(order.userId),
      this.readLedger(order.userId),
      this.redemptionCodeStore.listCodesByBatch('topup_reward', order.id),
      this.getSystemConfig(),
    ]);

    const existingLedgerItem = existingLedger.find(item => item.bizType === 'billing.topup.order' && item.bizId === order.id);

    if (existingLedgerItem) {
      return {
        account,
        ledgerItem: existingLedgerItem,
        issuedCodes: existingIssuedCodes,
      };
    }

    const updatedAccount = BillingAccount.parse({
      ...account,
      balancePoints: account.balancePoints + order.totalPoints,
      lifetimeRechargePoints: account.lifetimeRechargePoints + order.totalPoints,
      lifetimeRechargeCny: Number((account.lifetimeRechargeCny + order.amountCny).toFixed(2)),
      updatedAt: order.paidAt ?? now(),
    });

    const ledgerItem = BillingLedgerItem.parse({
      id: randomUUID(),
      userId: order.userId,
      type: 'recharge',
      bizType: 'billing.topup.order',
      bizId: order.id,
      deltaPoints: order.totalPoints,
      balanceAfter: updatedAccount.balancePoints,
      frozenAfter: updatedAccount.frozenPoints,
      remark: order.remark || order.title,
      createdAt: order.paidAt ?? now(),
    });

    this.db.transaction(() => {
      dbSaveAccount(this.db, updatedAccount);
      dbAppendLedgerItem(this.db, ledgerItem);
    })();

    const packageConfig = order.packageId
      ? config.packages.find(item => item.id === order.packageId)
      : undefined;
    const issuedCodes = packageConfig && existingIssuedCodes.length === 0
      ? await this.issuePackageRewardCodes(order.userId, order.id, packageConfig, order.paidAt ?? now())
      : existingIssuedCodes;

    return { account: updatedAccount, ledgerItem, issuedCodes };
    } finally { releaseLock(); }
  }

  async freezePoints(userId: string, points: number, bizType: string, bizId: string) {
    const safePoints = Math.max(0, Math.floor(points));
    if (safePoints <= 0) {
      throw new Error('Frozen points must be greater than 0');
    }
    const releaseLock = await this.userMutex.acquire(userId);
    try {
    const account = await this.getAccount(userId);
    if (account.balancePoints < safePoints) {
      throw new Error('Insufficient balance');
    }

    const freezeId = randomUUID();
    const updatedAccount = BillingAccount.parse({
      ...account,
      balancePoints: account.balancePoints - safePoints,
      frozenPoints: account.frozenPoints + safePoints,
      updatedAt: now(),
    });

    const ledgerItem = BillingLedgerItem.parse({
      id: freezeId,
      userId,
      type: 'freeze',
      bizType,
      bizId,
      deltaPoints: -safePoints,
      balanceAfter: updatedAccount.balancePoints,
      frozenAfter: updatedAccount.frozenPoints,
      remark: `Freeze ${safePoints} points`,
      createdAt: now(),
    });

    const existingLedger = await this.readLedger(userId);
    this.db.transaction(() => {
      dbSaveAccount(this.db, updatedAccount);
      dbAppendLedgerItem(this.db, ledgerItem);
    })();

    return freezeId;
    } finally { releaseLock(); }
  }

  async settleFreeze(userId: string, freezeId: string, actualPoints: number) {
    const releaseLock = await this.userMutex.acquire(userId);
    try {
    const existingLedger = await this.readLedger(userId);
    const freezeRecord = existingLedger.find(item => item.id === freezeId && item.type === 'freeze');
    if (!freezeRecord) {
      throw new Error('Freeze record does not exist');
    }

    const frozenAmount = Math.abs(freezeRecord.deltaPoints);
    const account = await this.getAccount(userId);
    const safeActualPoints = Math.max(0, Math.floor(actualPoints));
    const refund = Math.max(0, frozenAmount - safeActualPoints);
    const extraCharge = Math.max(0, safeActualPoints - frozenAmount);

    if (extraCharge > account.balancePoints) {
      throw new Error(`Settlement requires ${extraCharge} extra points but balance is only ${account.balancePoints}`);
    }

    const updatedAccount = BillingAccount.parse({
      ...account,
      balancePoints: account.balancePoints + refund - extraCharge,
      frozenPoints: Math.max(0, account.frozenPoints - frozenAmount),
      updatedAt: now(),
    });

    const ledgerItem = BillingLedgerItem.parse({
      id: randomUUID(),
      userId,
      type: 'settle',
      bizType: freezeRecord.bizType,
      bizId: freezeRecord.bizId,
      deltaPoints: refund > 0 ? refund : -extraCharge,
      balanceAfter: updatedAccount.balancePoints,
      frozenAfter: updatedAccount.frozenPoints,
      remark: safeActualPoints === 0
        ? `Refund frozen ${frozenAmount} points`
        : extraCharge > 0
          ? `Settle ${safeActualPoints} points with extra charge ${extraCharge}`
          : refund > 0
            ? `Settle ${safeActualPoints} points with refund ${refund}`
            : `Settle ${safeActualPoints} points`,
      createdAt: now(),
    });

    this.db.transaction(() => {
      dbSaveAccount(this.db, updatedAccount);
      dbAppendLedgerItem(this.db, ledgerItem);
    })();
    } finally { releaseLock(); }
  }

  async updateFreezeBizId(userId: string, freezeId: string, nextBizId: string) {
    const safeBizId = nextBizId.trim();
    if (!safeBizId) {
      throw new Error('bizId is required');
    }
    const releaseLock = await this.userMutex.acquire(userId);
    try {
    const existingLedger = await this.readLedger(userId);
    const freezeIndex = existingLedger.findIndex(item => item.id === freezeId && item.type === 'freeze');
    if (freezeIndex < 0) {
      throw new Error('Freeze record does not exist');
    }

    const freezeRecord = existingLedger[freezeIndex];
    if (freezeRecord.bizId === safeBizId) {
      return freezeRecord;
    }

    const updatedFreezeRecord = BillingLedgerItem.parse({
      ...freezeRecord,
      bizId: safeBizId,
    });
    existingLedger[freezeIndex] = updatedFreezeRecord;
    // 更新流水记录：删除旧的，插入新的（SQLite 无法直接 UPDATE 主键外的 bizId）
    const dbLedger = this.db;
    dbLedger.prepare('UPDATE billing_ledger SET biz_id=? WHERE id=?').run(safeBizId, freezeId);
    return updatedFreezeRecord;
    } finally { releaseLock(); }
  }

  async consumePoints(userId: string, points: number, bizType: string, bizId: string, remark = '') {
    const safePoints = Math.max(0, Math.floor(points));
    if (safePoints <= 0) {
      throw new Error('Consumed points must be greater than 0');
    }
    const releaseLock = await this.userMutex.acquire(userId);
    try {
    const account = await this.getAccount(userId);
    if (account.balancePoints < safePoints) {
      throw new Error('Insufficient balance');
    }

    const updatedAccount = BillingAccount.parse({
      ...account,
      balancePoints: account.balancePoints - safePoints,
      updatedAt: now(),
    });

    const ledgerItem = BillingLedgerItem.parse({
      id: randomUUID(),
      userId,
      type: 'consume',
      bizType,
      bizId,
      deltaPoints: -safePoints,
      balanceAfter: updatedAccount.balancePoints,
      frozenAfter: updatedAccount.frozenPoints,
      remark: remark || `Consume ${safePoints} points`,
      createdAt: now(),
    });

    const existingLedger = await this.readLedger(userId);
    this.db.transaction(() => {
      dbSaveAccount(this.db, updatedAccount);
      dbAppendLedgerItem(this.db, ledgerItem);
    })();
    } finally { releaseLock(); }
  }

  async grantSignupGift(userId: string) {
    const releaseLock = await this.userMutex.acquire(userId);
    try {
    const [config, existingLedger, account] = await Promise.all([
      this.getSystemConfig(),
      this.readLedger(userId),
      this.getAccount(userId),
    ]);
    const alreadyGranted = existingLedger.some(item => item.bizType === 'billing.signup-gift');
    if (alreadyGranted) return false;

    const giftPoints = config.freeTrial.signupGiftPoints;
    const updatedAccount = BillingAccount.parse({
      ...account,
      balancePoints: account.balancePoints + giftPoints,
      updatedAt: now(),
    });

    const ledgerItem = BillingLedgerItem.parse({
      id: randomUUID(),
      userId,
      type: 'recharge',
      bizType: 'billing.signup-gift',
      bizId: userId,
      deltaPoints: giftPoints,
      balanceAfter: updatedAccount.balancePoints,
      frozenAfter: updatedAccount.frozenPoints,
      remark: `Signup gift ${giftPoints} points`,
      createdAt: now(),
    });

    this.db.transaction(() => {
      dbSaveAccount(this.db, updatedAccount);
      dbAppendLedgerItem(this.db, ledgerItem);
    })();
    return true;
    } finally { releaseLock(); }
  }

  async adjustPoints(userId: string, deltaPoints: number, input: AdjustPointsInput = {}) {
    const safeDelta = Math.trunc(deltaPoints);
    if (!Number.isFinite(safeDelta) || safeDelta === 0 || Math.abs(safeDelta) > 1_000_000) {
      throw new Error('Invalid adjustment delta');
    }
    const releaseLock = await this.userMutex.acquire(userId);
    try {
    const [account, existingLedger] = await Promise.all([
      this.getAccount(userId),
      this.readLedger(userId),
    ]);

    if (safeDelta < 0 && account.balancePoints < Math.abs(safeDelta)) {
      throw new Error(`Adjustment exceeds balance, current balance is ${account.balancePoints}`);
    }

    const createdAt = now();
    const updatedAccount = BillingAccount.parse({
      ...account,
      balancePoints: account.balancePoints + safeDelta,
      updatedAt: createdAt,
    });

    const operatorText = input.operatorId?.trim() ? `operator:${input.operatorId.trim()}` : 'operator:system';
    const defaultRemark = safeDelta > 0
      ? `Admin added ${safeDelta} points (${operatorText})`
      : `Admin deducted ${Math.abs(safeDelta)} points (${operatorText})`;
    const ledgerItem = BillingLedgerItem.parse({
      id: randomUUID(),
      userId,
      type: 'adjust',
      bizType: 'billing.admin-adjust',
      bizId: randomUUID(),
      deltaPoints: safeDelta,
      balanceAfter: updatedAccount.balancePoints,
      frozenAfter: updatedAccount.frozenPoints,
      remark: input.remark?.trim() || defaultRemark,
      createdAt,
    });

    this.db.transaction(() => {
      dbSaveAccount(this.db, updatedAccount);
      dbAppendLedgerItem(this.db, ledgerItem);
    })();

    return { account: updatedAccount, ledgerItem };
    } finally { releaseLock(); }
  }

  /**
   * 检查试用额度 — 基于 trialQuotaChars 全局配置
   * 返回剩余可用字数，0 表示试用已用完
   */
  async checkTrialQuota(userId: string): Promise<{ remaining: number; total: number }> {
    const config = await this.getSystemConfig();
    const usage = await this.trialStore.get(userId);
    const total = usage.totalQuota === undefined ? config.trialQuotaChars : usage.totalQuota;
    return {
      remaining: Math.max(0, total - usage.usedChars),
      total,
    };
  }

  /**
   * 消耗试用字数（按章节去重）
   */
  async consumeTrialQuota(userId: string, chars: number, chapterKey?: string): Promise<{ remaining: number; total: number; consumed: boolean }> {
    const config = await this.getSystemConfig();
    const result = await this.trialStore.consume(userId, chars, chapterKey);
    const total = result.totalQuota === undefined ? config.trialQuotaChars : result.totalQuota;
    return {
      remaining: Math.max(0, total - result.usedChars),
      total,
      consumed: result.consumed,
    };
  }

  /**
   * 为指定用户单独设置试用字数上限（体验号专用）
   */
  async setTrialQuotaTotal(userId: string, totalQuota: number): Promise<void> {
    await this.trialStore.setTotalQuota(userId, totalQuota);
  }

  async adjustUserTrialQuota(userId: string, input: { remainingDelta?: number; totalDelta?: number }): Promise<{
    quotaUsed: number;
    quotaTotal: number;
    quotaRemaining: number;
    trial: TrialUsage;
  }> {
    const [config, current] = await Promise.all([
      this.getSystemConfig(),
      this.trialStore.get(userId),
    ]);
    const currentTotal = current.totalQuota === undefined ? config.trialQuotaChars : current.totalQuota;
    const currentRemaining = Math.max(0, currentTotal - current.usedChars);
    const totalDelta = Math.floor(input.totalDelta ?? 0);
    const remainingDelta = Math.floor(input.remainingDelta ?? 0);
    const nextTotal = Math.max(0, currentTotal + totalDelta);
    const nextRemaining = Math.max(0, currentRemaining + remainingDelta);
    const trial = await this.trialStore.updateQuota(userId, {
      totalQuota: nextTotal,
      remainingChars: nextRemaining,
    });
    const quotaTotal = trial.totalQuota ?? 0;
    return {
      quotaUsed: trial.usedChars,
      quotaTotal,
      quotaRemaining: Math.max(0, quotaTotal - trial.usedChars),
      trial,
    };
  }

  async checkFreeTrialQuota(userId: string, requestedChars: number): Promise<{ allowed: boolean; reason?: string }> {
    void userId;
    void requestedChars;
    return { allowed: true };
  }

  async listRedemptionCodesForUser(userId: string): Promise<BillingRedemptionCode[]> {
    return this.redemptionCodeStore.listCodesForUser(userId);
  }

  async listAllRedemptionCodes(): Promise<BillingRedemptionCode[]> {
    const codes = await this.redemptionCodeStore.listCodes();
    return codes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listRedemptionCodesPage(input: { page?: number; pageSize?: number } = {}): Promise<BillingCodePage> {
    return this.redemptionCodeStore.listCodesPage(input);
  }

  async listRedemptionCodeBatchesPage(input: { page?: number; pageSize?: number } = {}): Promise<BillingRedemptionBatchPage> {
    return this.redemptionCodeStore.listCodeBatchesPage(input);
  }

  async listRedemptionCodesByBatch(batchKey: string): Promise<BillingRedemptionCode[]> {
    const { sourceType, sourceId } = this.parseRedemptionBatchKey(batchKey);
    return this.redemptionCodeStore.listCodesByBatch(sourceType, sourceId);
  }

  async createManualRedemptionCodes(input: ManualCodeInput): Promise<BillingRedemptionCode[]> {
    const quantity = Math.max(1, Math.min(200, Math.floor(input.quantity)));
    const points = Math.max(1, Math.floor(input.points));
    const prefix = (input.prefix?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'MANUAL').slice(0, 10) || 'MANUAL';
    const createdAt = now();
    const batchSourceId = randomUUID();
    const expiresAt = input.expiresInDays && input.expiresInDays > 0
      ? addDays(createdAt, Math.floor(input.expiresInDays))
      : null;

    const codes = await this.redemptionCodeStore.createCodes(
      Array.from({ length: quantity }, (_, index) => ({
        code: `${prefix}-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`,
        title: input.title,
        points,
        sourceType: 'manual',
        sourceId: batchSourceId,
        ownerUserId: input.ownerUserId,
        remark: input.remark || `Manual code batch #${index + 1}`,
        expiresAt,
      })),
    );

    return codes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateRedemptionCodeStatus(
    codeId: string,
    nextStatus: 'issued' | 'disabled',
  ): Promise<BillingRedemptionCode> {
    const code = await this.redemptionCodeStore.getCodeById(codeId);
    if (!code) {
      throw new Error('Redemption code does not exist');
    }
    if (code.status === 'redeemed' || code.status === 'expired') {
      throw new Error(`Cannot change status for ${code.status} code`);
    }
    const updatedCode = {
      ...code,
      status: nextStatus,
    };
    return this.redemptionCodeStore.saveCode(updatedCode);
  }

  async updateRedemptionCodeBatchStatus(
    batchKey: string,
    nextStatus: 'issued' | 'disabled',
  ): Promise<BillingRedemptionCode[]> {
    const { sourceType, sourceId } = this.parseRedemptionBatchKey(batchKey);
    const targetCodes = await this.redemptionCodeStore.listCodesByBatch(sourceType, sourceId);
    if (!targetCodes.length) {
      throw new Error('Redemption batch does not exist');
    }

    const mutableCodes = targetCodes.filter(item => item.status === 'issued' || item.status === 'disabled');
    const updatedCodes: BillingRedemptionCode[] = [];
    for (const code of mutableCodes) {
      if (code.status === nextStatus) {
        updatedCodes.push(code);
        continue;
      }
      updatedCodes.push(await this.redemptionCodeStore.saveCode({
        ...code,
        status: nextStatus,
      }));
    }

    return updatedCodes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private parseRedemptionBatchKey(batchKey: string): {
    sourceType: BillingRedemptionCode['sourceType'];
    sourceId: string;
  } {
    const separatorIndex = batchKey.indexOf(':');
    if (separatorIndex <= 0 || separatorIndex === batchKey.length - 1) {
      throw new Error('Invalid batch key');
    }

    const sourceType = batchKey.slice(0, separatorIndex);
    const sourceId = batchKey.slice(separatorIndex + 1);
    if (sourceType !== 'manual' && sourceType !== 'topup_reward') {
      throw new Error('Unsupported batch type');
    }
    return { sourceType, sourceId };
  }

  async redeemCode(userId: string, codeText: string): Promise<{ account: BillingAccount; ledgerItem: BillingLedgerItem; code: BillingRedemptionCode }> {
    // 先锁码再锁用户，防止跨用户同时兑换同一码（注意锁顺序要一致，避免死锁）
    const releaseCodeLock = await this.codeMutex.acquire(codeText.toUpperCase());
    const releaseLock = await this.userMutex.acquire(userId);
    try {
    const code = await this.redemptionCodeStore.getCodeByText(codeText);
    if (!code) {
      throw new Error('Redemption code does not exist');
    }

    if (code.status !== 'issued') {
      throw new Error('Redemption code is not available');
    }

    if (code.expiresAt && new Date(code.expiresAt).getTime() < Date.now()) {
      const expiredCode = { ...code, status: 'expired' as const };
      await this.redemptionCodeStore.saveCode(expiredCode);
      throw new Error('Redemption code has expired');
    }

    const account = await this.getAccount(userId);
    const updatedAccount = BillingAccount.parse({
      ...account,
      balancePoints: account.balancePoints + code.points,
      updatedAt: now(),
    });

    const ledgerItem = BillingLedgerItem.parse({
      id: randomUUID(),
      userId,
      type: 'recharge',
      bizType: 'billing.redeem-code',
      bizId: code.id,
      deltaPoints: code.points,
      balanceAfter: updatedAccount.balancePoints,
      frozenAfter: updatedAccount.frozenPoints,
      remark: `Redeem code ${code.code}`,
      createdAt: now(),
    });

    const existingLedger = await this.readLedger(userId);
    const updatedCode = {
      ...code,
      status: 'redeemed' as const,
      redeemedAt: now(),
      redeemedByUserId: userId,
    };

    this.db.transaction(() => {
      dbSaveAccount(this.db, updatedAccount);
      dbAppendLedgerItem(this.db, ledgerItem);
    });
    await this.redemptionCodeStore.saveCode(updatedCode);

    return { account: updatedAccount, ledgerItem, code: updatedCode };
    } finally {
      releaseLock();
      releaseCodeLock();
    }
  }

  private async issuePackageRewardCodes(
    userId: string,
    orderId: string,
    pkg: BillingRechargePackage,
    createdAt: string,
  ): Promise<BillingRedemptionCode[]> {
    if (!pkg.redemptionGrant.enabled) {
      return [];
    }

    const inputs = Array.from({ length: pkg.redemptionGrant.quantity }, (_, index) => {
      const rawPrefix = pkg.redemptionGrant.prefix.trim().toUpperCase();
      const compactPrefix = rawPrefix.length > 6 ? rawPrefix.slice(0, 6) : rawPrefix;
      const titlePrefix = pkg.redemptionGrant.title.trim() || `${pkg.title} Reward`;
      return {
        code: `${compactPrefix}-${randomUUID().slice(0, 4).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`,
        title: titlePrefix,
        points: pkg.redemptionGrant.pointsPerCode,
        sourceType: 'topup_reward' as const,
        sourceId: orderId,
        ownerUserId: userId,
        packageId: pkg.id,
        remark: pkg.redemptionGrant.remark || `${pkg.title} reward code #${index + 1}`,
        expiresAt: addDays(createdAt, pkg.redemptionGrant.expiresInDays),
      };
    });

    return this.redemptionCodeStore.createCodes(inputs);
  }

  private async readLedger(userId: string) {
    return dbGetLedger(this.db, userId, 1000);
  }
}

