import { randomUUID, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { AuthDb } from './types.js';
import type { BillingService } from '../billing/billing-service.js';
import { readJson, writeJson, pathExists } from '../novel/fs-helpers.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TrialAccountService');

const BCRYPT_ROUNDS = 12;

export interface TrialAccountMeta {
  userId: string;
  username: string;
  password: string;
  initialPoints: number;
  trialQuotaChars: number;
  expiresAt: string;
  createdAt: string;
  createdBy: string;
}

export interface CreateTrialAccountsInput {
  count: number;
  initialPoints: number;
  trialQuotaChars: number;
  expiresAt: string;
  password?: string;
}

export interface CreateTrialAccountsResult {
  accounts: TrialAccountMeta[];
}

/** 生成随机用户名: 试用_XXXXXX */
function randomTrialUsername(): string {
  const suffix = randomBytes(4).toString('hex'); // 8 chars
  return `试用_${suffix}`;
}

/** 生成随机密码: 12 位字母数字 */
function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  const bytes = randomBytes(12);
  for (let i = 0; i < 12; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export class TrialAccountService {
  private readonly metaDir: string;

  constructor(private readonly dataDir: string) {
    this.metaDir = path.join(dataDir, 'billing', 'trial-accounts');
  }

  private metaPath(userId: string): string {
    return path.join(this.metaDir, `${userId}.json`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.metaDir, { recursive: true });
  }

  /** 批量创建体验账号 */
  async createTrialAccounts(
    db: AuthDb,
    billingService: BillingService | undefined,
    input: CreateTrialAccountsInput,
    createdBy: string,
  ): Promise<CreateTrialAccountsResult> {
    await this.ensureDir();
    const accounts: TrialAccountMeta[] = [];

    for (let i = 0; i < input.count; i++) {
      let username = randomTrialUsername();

      // 检查用户名唯一性，重试最多 5 次
      for (let retry = 0; retry < 5; retry++) {
        try {
          const [existing] = await db.execute(
            'SELECT id FROM users WHERE username = ?',
            [username],
          ) as unknown as [Array<{ id: string }>];
          if (existing.length === 0) break;
          username = randomTrialUsername();
        } catch {
          username = randomTrialUsername();
        }
      }

      const userId = randomUUID();
      const password = input.password || randomPassword();
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      await db.execute(
        `INSERT INTO users (id, username, password_hash, role, creator_status, creator_approved_at, phone)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, username, passwordHash, 'user', 'approved', new Date(), ''],
      );

      // 发放初始积分
      if (billingService && input.initialPoints > 0) {
        try {
          await billingService.adjustPoints(userId, input.initialPoints, {
            remark: '体验账号初始积分',
            operatorId: createdBy,
          });
        } catch (err) {
          log.warn(`体验账号 ${username} 初始积分发放失败:`, { error: err instanceof Error ? err.message : String(err) });
        }
      }

      // 设置体验号专用试用字数上限
      if (billingService && input.trialQuotaChars > 0) {
        try {
          await billingService.setTrialQuotaTotal(userId, input.trialQuotaChars);
        } catch (err) {
          log.warn(`体验账号 ${username} 试用额度设置失败:`, { error: err instanceof Error ? err.message : String(err) });
        }
      }

      const meta: TrialAccountMeta = {
        userId,
        username,
        password,
        initialPoints: input.initialPoints,
        trialQuotaChars: input.trialQuotaChars,
        expiresAt: input.expiresAt,
        createdAt: new Date().toISOString(),
        createdBy,
      };

      await writeJson(this.metaPath(userId), meta);
      accounts.push(meta);
    }

    log.info(`批量创建 ${accounts.length} 个体验账号，操作者: ${createdBy}`);
    return { accounts };
  }

  /** 获取单个体验账号元数据 */
  async getMeta(userId: string): Promise<TrialAccountMeta | null> {
    const filePath = this.metaPath(userId);
    if (!(await pathExists(filePath))) return null;
    return readJson<TrialAccountMeta | null>(filePath, null);
  }

  /** 列出所有体验账号 */
  async listAll(): Promise<TrialAccountMeta[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.metaDir);
    const results: TrialAccountMeta[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const userId = file.replace('.json', '');
      const meta = await this.getMeta(userId);
      if (meta) results.push(meta);
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** 删除体验账号元数据（用户删除由 admin-user-service 负责） */
  async deleteMeta(userId: string): Promise<void> {
    const filePath = this.metaPath(userId);
    if (await pathExists(filePath)) {
      await fs.unlink(filePath);
    }
  }

  /** 检查体验账号是否已过期，返回 true 表示已过期 */
  async isExpired(userId: string): Promise<boolean> {
    const meta = await this.getMeta(userId);
    if (!meta) return false;
    return new Date(meta.expiresAt).getTime() < Date.now();
  }
}
