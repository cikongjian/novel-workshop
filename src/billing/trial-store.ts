import path from 'node:path';
import fs from 'node:fs/promises';
import { readJson, writeJson, pathExists } from '../novel/fs-helpers.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('trial-store');

export type TrialUsage = {
  userId: string;
  usedChars: number;
  updatedAt: string;
  /** 已消耗过试用的章节标识，防止重复扣费 */
  consumedChapterKeys: string[];
  /** 按用户单独设定的试用上限（未定义表示用全局默认） */
  totalQuota?: number;
};

/**
 * 试用额度存储 —— 每个用户一个 JSON 文件
 * 存储路径: data/billing/trials/{userId}.json
 */
export class TrialStore {
  private readonly trialsDir: string;

  constructor(dataDir: string) {
    this.trialsDir = path.join(dataDir, 'billing', 'trials');
  }

  private trialPath(userId: string): string {
    return path.join(this.trialsDir, `${userId}.json`);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.trialsDir, { recursive: true });
  }

  async get(userId: string): Promise<TrialUsage> {
    const filePath = this.trialPath(userId);
    if (!(await pathExists(filePath))) {
      return { userId, usedChars: 0, updatedAt: new Date().toISOString(), consumedChapterKeys: [] };
    }
    const data = await readJson<{ usedChars: number; updatedAt: string; consumedChapterKeys?: string[]; totalQuota?: number }>(filePath, {
      usedChars: 0,
      updatedAt: new Date().toISOString(),
    });
    return { userId, ...data, consumedChapterKeys: data.consumedChapterKeys ?? [] };
  }

  /**
   * 为用户单独设置试用字数上限（体验号专用）
   */
  async setTotalQuota(userId: string, totalQuota: number): Promise<void> {
    await this.updateQuota(userId, { totalQuota });
    log.info(`试用额度上限设置: ${userId} totalQuota=${totalQuota}`);
  }

  async updateQuota(userId: string, input: { totalQuota?: number; remainingChars?: number }): Promise<TrialUsage> {
    await this.ensureDir();
    const current = await this.get(userId);
    const totalQuota = input.totalQuota === undefined
      ? Math.max(0, current.totalQuota ?? 0)
      : Math.max(0, Math.floor(input.totalQuota));
    const currentRemaining = Math.max(0, totalQuota - current.usedChars);
    const remainingChars = input.remainingChars === undefined
      ? currentRemaining
      : Math.max(0, Math.min(Math.floor(input.remainingChars), totalQuota));
    const next: TrialUsage = {
      userId,
      usedChars: totalQuota - remainingChars,
      updatedAt: new Date().toISOString(),
      consumedChapterKeys: current.consumedChapterKeys,
      totalQuota,
    };
    await writeJson(this.trialPath(userId), {
      usedChars: next.usedChars,
      updatedAt: next.updatedAt,
      consumedChapterKeys: next.consumedChapterKeys,
      totalQuota: next.totalQuota,
    });
    log.info(`试用额度更新: ${userId} totalQuota=${totalQuota} remainingChars=${remainingChars}`);
    return next;
  }

  /**
   * 消耗试用字数（按章节去重，同一章只扣一次）
   * @returns consumed=true 表示实际扣了字数，false 表示该章节已扣过
   */
  async consume(userId: string, chars: number, chapterKey?: string): Promise<TrialUsage & { consumed: boolean }> {
    await this.ensureDir();
    const current = await this.get(userId);

    // 章节去重：如果已在 consumedChapterKeys 中，不再重复扣除
    if (chapterKey && current.consumedChapterKeys.includes(chapterKey)) {
      return { ...current, consumed: false };
    }

    const nextKeys = chapterKey
      ? [...current.consumedChapterKeys, chapterKey].slice(-200)
      : current.consumedChapterKeys;

    const next: TrialUsage = {
      userId,
      usedChars: current.usedChars + Math.max(0, Math.floor(chars)),
      updatedAt: new Date().toISOString(),
      consumedChapterKeys: nextKeys,
      totalQuota: current.totalQuota,
    };
    await writeJson(this.trialPath(userId), {
      usedChars: next.usedChars,
      updatedAt: next.updatedAt,
      consumedChapterKeys: next.consumedChapterKeys,
      totalQuota: next.totalQuota,
    });
    log.info(`试用额度消耗: ${userId} +${chars} = ${next.usedChars}${chapterKey ? ` chapter=${chapterKey}` : ''}`);
    return { ...next, consumed: true };
  }

  /** 批量查询指定用户的试用用量（用于管理员用户列表，避免遍历全目录） */
  async batchGet(userIds: string[]): Promise<Map<string, TrialUsage>> {
    const result = new Map<string, TrialUsage>();
    if (userIds.length === 0) return result;

    await this.ensureDir();
    for (const userId of userIds) {
      const usage = await this.get(userId);
      result.set(userId, usage);
    }
    return result;
  }

  async listAll(): Promise<TrialUsage[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.trialsDir);
    const results: TrialUsage[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const userId = file.replace('.json', '');
      results.push(await this.get(userId));
    }
    return results.sort((a, b) => b.usedChars - a.usedChars);
  }
}
