import { randomUUID, randomInt } from 'node:crypto';
import { now } from '../utils/text.js';
import { BillingRedemptionCode, type BillingRedemptionCode as BillingRedemptionCodeType } from './types.js';
import type { Database } from 'better-sqlite3';
import {
  getCodeByText,
  getCodeById,
  listAllCodes,
  listCodesPage,
  listCodeBatchesPage,
  listCodesByBatch,
  listCodesForUser,
  insertCode,
  updateCodeStatus,
  type BillingCodePage,
  type BillingRedemptionBatchPage,
} from './billing-db-store.js';

type CreateCodeInput = {
  code?: string;
  title: string;
  points: number;
  sourceType: 'topup_reward' | 'manual';
  sourceId: string;
  ownerUserId?: string;
  packageId?: string;
  remark?: string;
  expiresAt?: string | null;
};

type UpdateCodeInput = BillingRedemptionCodeType;

function randomCodeFragment(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let output = '';
  for (let index = 0; index < length; index += 1) {
    output += alphabet[randomInt(alphabet.length)];
  }
  return output;
}

export class BillingRedemptionCodeStore {
  private readonly db: Database;

  constructor(_dataDir: string, db: Database) {
    this.db = db;
  }

  async listCodes(): Promise<BillingRedemptionCodeType[]> {
    return listAllCodes(this.db);
  }

  async listCodesPage(input: { page?: number; pageSize?: number } = {}): Promise<BillingCodePage> {
    return listCodesPage(this.db, input);
  }

  async listCodeBatchesPage(input: { page?: number; pageSize?: number } = {}): Promise<BillingRedemptionBatchPage> {
    return listCodeBatchesPage(this.db, input);
  }

  async listCodesByBatch(sourceType: BillingRedemptionCodeType['sourceType'], sourceId: string): Promise<BillingRedemptionCodeType[]> {
    return listCodesByBatch(this.db, sourceType, sourceId);
  }

  async getCodeByText(code: string): Promise<BillingRedemptionCodeType | null> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return null;
    return getCodeByText(this.db, normalized);
  }

  async getCodeById(id: string): Promise<BillingRedemptionCodeType | null> {
    return getCodeById(this.db, id);
  }

  async createCodes(inputs: CreateCodeInput[]): Promise<BillingRedemptionCodeType[]> {
    const created: BillingRedemptionCodeType[] = [];
    const usedCodes = new Set<string>();

    for (const input of inputs) {
      let candidate = input.code?.trim().toUpperCase() ?? '';
      if (!candidate) {
        do {
          candidate = `${input.title.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'CODE'}-${randomCodeFragment(4)}-${randomCodeFragment(4)}`;
        } while (usedCodes.has(candidate) || getCodeByText(this.db, candidate));
      } else if (usedCodes.has(candidate) || getCodeByText(this.db, candidate)) {
        throw new Error(`Redemption code already exists: ${candidate}`);
      }
      usedCodes.add(candidate);
      const code = BillingRedemptionCode.parse({
        id: randomUUID(),
        code: candidate,
        title: input.title,
        points: input.points,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        ownerUserId: input.ownerUserId,
        packageId: input.packageId,
        status: 'issued',
        remark: input.remark ?? '',
        createdAt: now(),
        expiresAt: input.expiresAt ?? null,
      });
      insertCode(this.db, code);
      created.push(code);
    }
    return created;
  }

  async saveCode(input: UpdateCodeInput): Promise<BillingRedemptionCodeType> {
    const code = BillingRedemptionCode.parse(input);
    updateCodeStatus(this.db, code.id, code.status, {
      redeemedAt: code.redeemedAt,
      redeemedByUserId: code.redeemedByUserId,
    });
    // 更新其他可变字段
    this.db.prepare('UPDATE redemption_codes SET status=?,remark=?,expires_at=?,redeemed_at=?,redeemed_by_user_id=? WHERE id=?')
      .run(code.status, code.remark, code.expiresAt ?? null, code.redeemedAt ?? null, code.redeemedByUserId ?? null, code.id);
    return code;
  }

  async listCodesForUser(userId: string): Promise<BillingRedemptionCodeType[]> {
    return listCodesForUser(this.db, userId);
  }
}
