/**
 * 存储清理调度器
 *
 * 定期扫描小说目录，清理可重建的衍生数据（memory-lance、TTS 音频、voices、adaptations），
 * 释放服务器磁盘空间。
 *
 * 清理条件（满足任一即触发）：
 * - 小说状态为 completed 且超过指定天数未更新
 * - 小说超过指定天数未更新（无论状态）
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '../utils/logger.js';

const log = createLogger('storage-cleanup');

/** 可清理的衍生数据目录名 */
const CLEANABLE_DIRS = ['memory-lance', 'tts', 'voices', 'adaptations'] as const;

/** 清理结果 */
export interface CleanupResult {
  /** 本次扫描的小说总数 */
  scannedCount: number;
  /** 本次清理的小说数量 */
  cleanedCount: number;
  /** 总释放空间（字节） */
  freedBytes: number;
  /** 每本被清理小说的详情 */
  details: Array<{
    novelId: string;
    title: string;
    reason: 'completed' | 'inactive';
    dirs: string[];
    freedBytes: number;
  }>;
  /** 执行时间（毫秒） */
  durationMs: number;
}

export interface StorageCleanupConfig {
  /** 是否启用自动清理 */
  enabled: boolean;
  /** 已完结小说多少天后清理衍生数据（默认 7 天） */
  completedInactiveDays: number;
  /** 非完结小说多少天后清理衍生数据（默认 30 天） */
  inactiveDays: number;
  /** 每日执行清理的小时（0-23，默认 4 点） */
  scheduleHour: number;
}

const DEFAULT_CONFIG: StorageCleanupConfig = {
  enabled: true,
  completedInactiveDays: 7,
  inactiveDays: 30,
  scheduleHour: 4,
};

const MS_PER_DAY = 86_400_000;

export class StorageCleanupScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private config: StorageCleanupConfig;

  constructor(
    private readonly novelsDir: string,
    config?: Partial<StorageCleanupConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 启动每日定时清理 */
  start(): void {
    if (!this.config.enabled) {
      log.info('存储自动清理已禁用');
      return;
    }
    this.scheduleNext();
    log.info(`存储自动清理已启动，每日 ${String(this.config.scheduleHour).padStart(2, '0')}:00 执行`);
    log.info(`清理策略: 已完结 >${this.config.completedInactiveDays} 天, 非活跃 >${this.config.inactiveDays} 天`);
  }

  /** 停止调度 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 手动触发一次清理（管理后台可调用） */
  async runNow(): Promise<CleanupResult> {
    return this.executeCleanup();
  }

  /** 预览清理（dry-run，不实际删除） */
  async preview(): Promise<CleanupResult> {
    return this.executeCleanup(true);
  }

  /** 计算到下一个目标时刻的延迟并设置定时器 */
  private scheduleNext(): void {
    const now = new Date();
    const next = new Date(now);
    next.setHours(this.config.scheduleHour, 0, 0, 0);

    if (next.getTime() <= now.getTime()) {
      next.setTime(next.getTime() + MS_PER_DAY);
    }

    const delay = next.getTime() - now.getTime();
    const hoursUntil = (delay / 3_600_000).toFixed(1);
    log.info(`下次存储清理: ${next.toLocaleString()} (${hoursUntil} 小时后)`);

    this.timer = setTimeout(() => {
      void this.runAndReschedule();
    }, delay);
  }

  /** 执行清理并重新调度下一次 */
  private async runAndReschedule(): Promise<void> {
    try {
      const result = await this.executeCleanup();
      if (result.cleanedCount > 0) {
        const freedMB = (result.freedBytes / 1024 / 1024).toFixed(1);
        log.info(`定时清理完成: ${result.cleanedCount} 本小说, 释放 ${freedMB} MB`);
      } else {
        log.info('定时清理完成: 无需清理');
      }
    } catch (err) {
      log.error('定时清理失败', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    this.scheduleNext();
  }

  /** 执行清理逻辑 */
  private async executeCleanup(dryRun = false): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      scannedCount: 0,
      cleanedCount: 0,
      freedBytes: 0,
      details: [],
      durationMs: 0,
    };

    let entries: string[];
    try {
      entries = await fs.readdir(this.novelsDir);
    } catch {
      log.warn('小说目录不存在，跳过清理');
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const now = Date.now();

    for (const entry of entries) {
      // 只处理 UUID 格式的目录
      if (!/^[0-9a-f]{8}-/.test(entry)) continue;

      const novelDir = path.join(this.novelsDir, entry);
      const stat = await fs.stat(novelDir).catch(() => null);
      if (!stat?.isDirectory()) continue;

      // 读取小说元数据
      let meta: { title?: string; status?: string; updatedAt?: string };
      try {
        meta = JSON.parse(await fs.readFile(path.join(novelDir, 'novel.json'), 'utf-8'));
      } catch {
        continue; // 无法读取元数据，跳过
      }

      result.scannedCount++;

      const updatedAt = meta.updatedAt ? new Date(meta.updatedAt).getTime() : 0;
      const inactiveDays = (now - updatedAt) / MS_PER_DAY;
      const isCompleted = meta.status === 'completed';

      // 判断是否需要清理
      let reason: 'completed' | 'inactive' | null = null;
      if (isCompleted && inactiveDays > this.config.completedInactiveDays) {
        reason = 'completed';
      } else if (inactiveDays > this.config.inactiveDays) {
        reason = 'inactive';
      }

      if (!reason) continue;

      // 扫描可清理的衍生数据目录
      const cleanableDirs: string[] = [];
      let novelFreed = 0;

      for (const dirName of CLEANABLE_DIRS) {
        const dirPath = path.join(novelDir, dirName);
        const dirStat = await fs.stat(dirPath).catch(() => null);
        if (!dirStat?.isDirectory()) continue;

        const dirSize = await this.calcDirSize(dirPath);
        if (dirSize > 0) {
          cleanableDirs.push(dirName);
          novelFreed += dirSize;
        }
      }

      if (cleanableDirs.length === 0) continue;

      // 执行清理（非 dry-run）
      if (!dryRun) {
        for (const dirName of cleanableDirs) {
          const dirPath = path.join(novelDir, dirName);
          try {
            await fs.rm(dirPath, { recursive: true, force: true });
            log.info('清理衍生数据', {
              novelId: entry,
              title: meta.title,
              dir: dirName,
              reason,
              inactiveDays: Math.floor(inactiveDays),
            });
          } catch (err) {
            log.warn('清理失败', {
              novelId: entry,
              dir: dirName,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      result.cleanedCount++;
      result.freedBytes += novelFreed;
      result.details.push({
        novelId: entry,
        title: meta.title || entry,
        reason,
        dirs: cleanableDirs,
        freedBytes: novelFreed,
      });
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /** 递归计算目录大小 */
  private async calcDirSize(dirPath: string): Promise<number> {
    let totalSize = 0;
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isFile()) {
          const stat = await fs.stat(fullPath).catch(() => null);
          if (stat) totalSize += stat.size;
        } else if (entry.isDirectory()) {
          totalSize += await this.calcDirSize(fullPath);
        }
      }
    } catch { /* directory inaccessible */ }
    return totalSize;
  }
}
