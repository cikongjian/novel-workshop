/**
 * 计费模块 SQLite 操作层
 */

import type { Database } from 'better-sqlite3';
import type {
  BillingAccount as BillingAccountType,
  BillingLedgerItem as BillingLedgerItemType,
  BillingRedemptionCode as BillingRedemptionCodeType,
  BillingOrder as BillingOrderType,
} from './types.js';
import { BillingAccount, BillingLedgerItem, BillingRedemptionCode, BillingOrder } from './types.js';

export type BillingCodePage = {
  items: BillingRedemptionCodeType[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
};

export type BillingRedemptionBatchSummary = {
  batchKey: string;
  sourceType: BillingRedemptionCodeType['sourceType'];
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

export type BillingRedemptionBatchPage = {
  items: BillingRedemptionBatchSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
};

// ==================== 账户 ====================

export function getAccount(db: Database, userId: string): BillingAccountType {
  const row = db.prepare('SELECT * FROM billing_accounts WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!row) {
    return BillingAccount.parse({ userId, balancePoints: 0, frozenPoints: 0, lifetimeRechargePoints: 0, lifetimeRechargeCny: 0, updatedAt: new Date().toISOString() });
  }
  return BillingAccount.parse({ userId: row.user_id, balancePoints: row.balance_points, frozenPoints: row.frozen_points, lifetimeRechargePoints: row.lifetime_recharge_points, lifetimeRechargeCny: row.lifetime_recharge_cny, updatedAt: row.updated_at });
}

/** 批量查询用户账户（用于管理员用户列表） */
export function batchGetAccounts(db: Database, userIds: string[]): Map<string, BillingAccountType> {
  const result = new Map<string, BillingAccountType>();
  if (userIds.length === 0) return result;

  const placeholders = userIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT * FROM billing_accounts WHERE user_id IN (${placeholders})`).all(...userIds) as Record<string, unknown>[];
  for (const row of rows) {
    const account = BillingAccount.parse({
      userId: row.user_id,
      balancePoints: row.balance_points,
      frozenPoints: row.frozen_points,
      lifetimeRechargePoints: row.lifetime_recharge_points,
      lifetimeRechargeCny: row.lifetime_recharge_cny,
      updatedAt: row.updated_at,
    });
    result.set(account.userId, account);
  }
  return result;
}

export function saveAccount(db: Database, account: BillingAccountType): void {
  db.prepare('INSERT INTO billing_accounts (user_id,balance_points,frozen_points,lifetime_recharge_points,lifetime_recharge_cny,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET balance_points=excluded.balance_points,frozen_points=excluded.frozen_points,lifetime_recharge_points=excluded.lifetime_recharge_points,lifetime_recharge_cny=excluded.lifetime_recharge_cny,updated_at=excluded.updated_at')
    .run(account.userId, account.balancePoints, account.frozenPoints, account.lifetimeRechargePoints, account.lifetimeRechargeCny, account.updatedAt);
}

// ==================== 流水 ====================

export function getLedger(db: Database, userId: string, limit = 200): BillingLedgerItemType[] {
  const rows = db.prepare('SELECT * FROM billing_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as Record<string, unknown>[];
  return rows.map(r => BillingLedgerItem.parse({ id: r.id, userId: r.user_id, type: r.type, bizType: r.biz_type, bizId: r.biz_id, deltaPoints: r.delta_points, balanceAfter: r.balance_after, frozenAfter: r.frozen_after, remark: r.remark, createdAt: r.created_at }));
}

export function findLedgerItem(db: Database, userId: string, bizType: string, bizId: string): BillingLedgerItemType | null {
  const row = db.prepare('SELECT * FROM billing_ledger WHERE user_id=? AND biz_type=? AND biz_id=?').get(userId, bizType, bizId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return BillingLedgerItem.parse({ id: row.id, userId: row.user_id, type: row.type, bizType: row.biz_type, bizId: row.biz_id, deltaPoints: row.delta_points, balanceAfter: row.balance_after, frozenAfter: row.frozen_after, remark: row.remark, createdAt: row.created_at });
}

export function appendLedgerItem(db: Database, item: BillingLedgerItemType): void {
  db.prepare('INSERT INTO billing_ledger (id,user_id,type,biz_type,biz_id,delta_points,balance_after,frozen_after,remark,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(item.id, item.userId, item.type, item.bizType, item.bizId ?? null, item.deltaPoints, item.balanceAfter, item.frozenAfter, item.remark, item.createdAt);
}

// ==================== 兑换码 ====================

function rowToCode(r: Record<string, unknown>): BillingRedemptionCodeType {
  return BillingRedemptionCode.parse({ id: r.id, code: r.code, title: r.title, points: r.points, sourceType: r.source_type, sourceId: r.source_id, ownerUserId: r.owner_user_id ?? undefined, packageId: r.package_id ?? undefined, status: r.status, remark: r.remark, createdAt: r.created_at, expiresAt: r.expires_at ?? null, redeemedAt: r.redeemed_at ?? undefined, redeemedByUserId: r.redeemed_by_user_id ?? undefined });
}

export function getCodeByText(db: Database, code: string): BillingRedemptionCodeType | null {
  const row = db.prepare('SELECT * FROM redemption_codes WHERE code = ?').get(code.trim().toUpperCase()) as Record<string, unknown> | undefined;
  return row ? rowToCode(row) : null;
}

export function getCodeById(db: Database, id: string): BillingRedemptionCodeType | null {
  const row = db.prepare('SELECT * FROM redemption_codes WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToCode(row) : null;
}

export function listAllCodes(db: Database): BillingRedemptionCodeType[] {
  const rows = db.prepare('SELECT * FROM redemption_codes ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return rows.map(rowToCode);
}

function normalizePage(input: { page?: number; pageSize?: number }, maxPageSize = 100): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.max(1, Math.min(maxPageSize, Math.floor(input.pageSize ?? 50)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function listCodesPage(db: Database, input: { page?: number; pageSize?: number } = {}): BillingCodePage {
  const { page, pageSize, offset } = normalizePage(input, 100);
  const total = Number((db.prepare('SELECT COUNT(*) AS total FROM redemption_codes').get() as { total: number }).total);
  const rows = db.prepare('SELECT * FROM redemption_codes ORDER BY created_at DESC LIMIT ? OFFSET ?').all(pageSize, offset) as Record<string, unknown>[];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items: rows.map(rowToCode),
    total,
    page,
    pageSize,
    totalPages,
    hasMore: offset + pageSize < total,
  };
}

export function listCodesByBatch(db: Database, sourceType: BillingRedemptionCodeType['sourceType'], sourceId: string): BillingRedemptionCodeType[] {
  const rows = db.prepare('SELECT * FROM redemption_codes WHERE source_type=? AND source_id=? ORDER BY created_at DESC').all(sourceType, sourceId) as Record<string, unknown>[];
  return rows.map(rowToCode);
}

function rowToBatchSummary(r: Record<string, unknown>): BillingRedemptionBatchSummary {
  const issuedCount = Number(r.issued_count ?? 0);
  const disabledCount = Number(r.disabled_count ?? 0);
  let status: BillingRedemptionBatchSummary['status'] = 'completed';
  if (issuedCount > 0 && disabledCount > 0) {
    status = 'partial';
  } else if (issuedCount > 0) {
    status = 'issued';
  } else if (disabledCount > 0) {
    status = 'disabled';
  }

  const sourceType = BillingRedemptionCode.shape.sourceType.parse(r.source_type);
  const sourceId = String(r.source_id);
  return {
    batchKey: `${sourceType}:${sourceId}`,
    sourceType,
    sourceId,
    title: String(r.title ?? ''),
    points: Number(r.points ?? 0),
    quantity: Number(r.quantity ?? 0),
    issuedCount,
    redeemedCount: Number(r.redeemed_count ?? 0),
    expiredCount: Number(r.expired_count ?? 0),
    disabledCount,
    ownerUserId: String(r.owner_user_id ?? ''),
    createdAt: String(r.created_at),
    expiresAt: typeof r.expires_at === 'string' ? r.expires_at : null,
    status,
  };
}

export function listCodeBatchesPage(db: Database, input: { page?: number; pageSize?: number } = {}): BillingRedemptionBatchPage {
  const { page, pageSize, offset } = normalizePage(input, 100);
  const total = Number((db.prepare(`
    SELECT COUNT(*) AS total
    FROM (
      SELECT 1 FROM redemption_codes GROUP BY source_type, source_id
    )
  `).get() as { total: number }).total);
  const rows = db.prepare(`
    WITH grouped AS (
      SELECT
        source_type,
        source_id,
        COUNT(*) AS quantity,
        SUM(CASE WHEN status='issued' THEN 1 ELSE 0 END) AS issued_count,
        SUM(CASE WHEN status='redeemed' THEN 1 ELSE 0 END) AS redeemed_count,
        SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END) AS expired_count,
        SUM(CASE WHEN status='disabled' THEN 1 ELSE 0 END) AS disabled_count,
        MIN(created_at) AS created_at,
        MAX(created_at) AS latest_at
      FROM redemption_codes
      GROUP BY source_type, source_id
    )
    SELECT
      grouped.*,
      latest.title,
      latest.points,
      latest.owner_user_id,
      latest.expires_at
    FROM grouped
    JOIN redemption_codes latest
      ON latest.source_type = grouped.source_type
      AND latest.source_id = grouped.source_id
      AND latest.created_at = grouped.latest_at
    GROUP BY grouped.source_type, grouped.source_id
    ORDER BY grouped.created_at DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset) as Record<string, unknown>[];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items: rows.map(rowToBatchSummary),
    total,
    page,
    pageSize,
    totalPages,
    hasMore: offset + pageSize < total,
  };
}

export function listCodesForUser(db: Database, userId: string): BillingRedemptionCodeType[] {
  const rows = db.prepare('SELECT * FROM redemption_codes WHERE owner_user_id=? OR redeemed_by_user_id=? ORDER BY created_at DESC').all(userId, userId) as Record<string, unknown>[];
  return rows.map(rowToCode);
}

export function insertCode(db: Database, code: BillingRedemptionCodeType): void {
  db.prepare('INSERT INTO redemption_codes (id,code,title,points,source_type,source_id,owner_user_id,package_id,status,remark,created_at,expires_at,redeemed_at,redeemed_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(code.id, code.code, code.title, code.points, code.sourceType, code.sourceId, code.ownerUserId ?? null, code.packageId ?? null, code.status, code.remark, code.createdAt, code.expiresAt ?? null, code.redeemedAt ?? null, code.redeemedByUserId ?? null);
}

export function updateCodeStatus(db: Database, id: string, status: string, extra?: { redeemedAt?: string; redeemedByUserId?: string }): void {
  db.prepare('UPDATE redemption_codes SET status=?,redeemed_at=?,redeemed_by_user_id=? WHERE id=?')
    .run(status, extra?.redeemedAt ?? null, extra?.redeemedByUserId ?? null, id);
}

// ==================== 充值订单 ====================

function rowToOrder(r: Record<string, unknown>): BillingOrderType {
  return BillingOrder.parse({
    id: r.id, userId: r.user_id, title: r.title, packageId: r.package_id ?? undefined,
    amountCny: r.amount_cny, points: r.points, bonusPoints: r.bonus_points, totalPoints: r.total_points,
    channel: r.channel, status: r.status, paymentScene: r.payment_scene, remark: r.remark,
    channelTradeNo: r.channel_trade_no ?? undefined, paymentUrl: r.payment_url ?? undefined,
    codeUrl: r.code_url ?? undefined, failureReason: r.failure_reason ?? undefined,
    metadata: r.metadata ? JSON.parse(r.metadata as string) : undefined,
    createdAt: r.created_at, updatedAt: r.updated_at, expiresAt: r.expires_at ?? undefined,
    paidAt: r.paid_at ?? undefined, closedAt: r.closed_at ?? undefined,
  });
}

export function getOrder(db: Database, orderId: string): BillingOrderType | null {
  const row = db.prepare('SELECT * FROM topup_orders WHERE id = ?').get(orderId) as Record<string, unknown> | undefined;
  return row ? rowToOrder(row) : null;
}

export function getOrderByChannelTradeNo(db: Database, channelTradeNo: string): BillingOrderType | null {
  const row = db.prepare('SELECT * FROM topup_orders WHERE channel_trade_no = ?').get(channelTradeNo) as Record<string, unknown> | undefined;
  return row ? rowToOrder(row) : null;
}

export function saveOrder(db: Database, order: BillingOrderType): void {
  db.prepare('INSERT INTO topup_orders (id,user_id,title,package_id,amount_cny,points,bonus_points,total_points,channel,status,payment_scene,remark,channel_trade_no,payment_url,code_url,failure_reason,metadata,created_at,updated_at,expires_at,paid_at,closed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,channel_trade_no=excluded.channel_trade_no,payment_url=excluded.payment_url,code_url=excluded.code_url,failure_reason=excluded.failure_reason,metadata=excluded.metadata,updated_at=excluded.updated_at,expires_at=excluded.expires_at,paid_at=excluded.paid_at,closed_at=excluded.closed_at')
    .run(order.id, order.userId, order.title, order.packageId ?? null, order.amountCny, order.points, order.bonusPoints, order.totalPoints, order.channel, order.status, order.paymentScene, order.remark, order.channelTradeNo ?? null, order.paymentUrl ?? null, order.codeUrl ?? null, order.failureReason ?? null, order.metadata ? JSON.stringify(order.metadata) : null, order.createdAt, order.updatedAt, order.expiresAt ?? null, order.paidAt ?? null, order.closedAt ?? null);
}

export function listOrdersForUser(db: Database, userId: string, limit = 50): BillingOrderType[] {
  const rows = db.prepare('SELECT * FROM topup_orders WHERE user_id=? ORDER BY created_at DESC LIMIT ?').all(userId, limit) as Record<string, unknown>[];
  return rows.map(rowToOrder);
}

// ==================== 迁移辅助 ====================

export function importBillingData(db: Database, data: {
  accounts: BillingAccountType[];
  ledgerItems: BillingLedgerItemType[];
  codes: BillingRedemptionCodeType[];
  orders: BillingOrderType[];
}): void {
  const migrate = db.transaction(() => {
    for (const a of data.accounts) saveAccount(db, a);
    for (const l of data.ledgerItems) {
      db.prepare('INSERT OR IGNORE INTO billing_ledger (id,user_id,type,biz_type,biz_id,delta_points,balance_after,frozen_after,remark,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(l.id, l.userId, l.type, l.bizType, l.bizId ?? null, l.deltaPoints, l.balanceAfter, l.frozenAfter, l.remark, l.createdAt);
    }
    for (const c of data.codes) {
      db.prepare('INSERT OR IGNORE INTO redemption_codes (id,code,title,points,source_type,source_id,owner_user_id,package_id,status,remark,created_at,expires_at,redeemed_at,redeemed_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(c.id, c.code, c.title, c.points, c.sourceType, c.sourceId, c.ownerUserId ?? null, c.packageId ?? null, c.status, c.remark, c.createdAt, c.expiresAt ?? null, c.redeemedAt ?? null, c.redeemedByUserId ?? null);
    }
    for (const o of data.orders) saveOrder(db, o);
  });
  migrate();
}

