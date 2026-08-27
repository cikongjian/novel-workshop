import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { UserBan, BanUserRequest } from './types.js';

const USER_BANS_DATA_FILE = 'user-bans.json';

export class UserBanManager {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private getUserBansFilePath(): string {
    return path.join(this.dataDir, USER_BANS_DATA_FILE);
  }

  private async ensureDataFile(): Promise<void> {
    const filePath = this.getUserBansFilePath();
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, JSON.stringify({ bans: [] }, null, 2), 'utf-8');
    }
  }

  private async readAllBans(): Promise<UserBan[]> {
    await this.ensureDataFile();
    const content = await fs.readFile(this.getUserBansFilePath(), 'utf-8');
    const data = JSON.parse(content);
    return data.bans.map((ban: any) => ({
      ...ban,
      startTime: new Date(ban.startTime),
      endTime: ban.endTime ? new Date(ban.endTime) : undefined,
    }));
  }

  private async writeAllBans(bans: UserBan[]): Promise<void> {
    const filePath = this.getUserBansFilePath();
    await fs.writeFile(filePath, JSON.stringify({ bans }, null, 2), 'utf-8');
  }

  /**
   * 封禁用户
   */
  async banUser(operatorId: string, request: BanUserRequest): Promise<UserBan> {
    const bans = await this.readAllBans();

    // 先将该用户的所有封禁设为失效
    bans.forEach(ban => {
      if (ban.userId === request.userId && ban.isActive) {
        ban.isActive = false;
      }
    });

    const now = new Date();
    const ban: UserBan = {
      id: randomUUID(),
      userId: request.userId,
      banType: request.banType,
      reason: request.reason,
      relatedNovelId: request.relatedNovelId,
      relatedReportId: request.relatedReportId,
      operatorId,
      startTime: now,
      endTime: request.duration ? new Date(now.getTime() + request.duration * 24 * 60 * 60 * 1000) : undefined,
      isActive: true,
    };

    bans.push(ban);
    await this.writeAllBans(bans);

    return ban;
  }

  /**
   * 解除封禁
   */
  async unbanUser(userId: string): Promise<void> {
    const bans = await this.readAllBans();

    bans.forEach(ban => {
      if (ban.userId === userId && ban.isActive) {
        ban.isActive = false;
      }
    });

    await this.writeAllBans(bans);
  }

  /**
   * 获取用户的封禁历史
   */
  async getUserBanHistory(userId: string): Promise<UserBan[]> {
    const bans = await this.readAllBans();
    return bans
      .filter(ban => ban.userId === userId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  /**
   * 自动清理过期的临时封禁
   */
  async cleanupExpiredBans(): Promise<number> {
    const bans = await this.readAllBans();
    const now = new Date();
    let cleanedCount = 0;

    bans.forEach(ban => {
      if (ban.isActive && ban.endTime && ban.endTime <= now) {
        ban.isActive = false;
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      await this.writeAllBans(bans);
    }

    return cleanedCount;
  }

  /**
   * 获取所有被封禁的用户列表
   */
  async getBannedUsers(): Promise<Array<{ userId: string; ban: UserBan }>> {
    const bans = await this.readAllBans();
    const now = new Date();
    const bannedUsers = new Map<string, UserBan>();

    bans.forEach(ban => {
      if (!ban.isActive) return;

      // 永久封禁
      if (ban.banType === 'permanent_ban') {
        bannedUsers.set(ban.userId, ban);
        return;
      }

      // 临时封禁且未过期
      if (ban.endTime && ban.endTime > now) {
        bannedUsers.set(ban.userId, ban);
      }
    });

    return Array.from(bannedUsers.entries()).map(([userId, ban]) => ({
      userId,
      ban,
    }));
  }

  async getBannedUserCount(): Promise<number> {
    const bannedUsers = await this.getBannedUsers();
    return bannedUsers.length;
  }
}
