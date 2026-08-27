import { createLogger } from '../utils/logger.js';
import { MAX_HISTORY_SNAPSHOTS } from './trends-constants.js';
import { TrendsConfigSchema } from './trends-types.js';
import type { TrendsConfig, TrendsHistoryEntry, TrendsSnapshot } from './trends-types.js';
import { readJson, writeJson, pathExists } from '../novel/fs-helpers.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const log = createLogger('trends-store');

function readBoolEnv(raw: string | undefined, fallback: boolean): boolean {
  if (!raw || raw.trim() === '') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  if (!raw || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function readSearchProviderEnv(
  raw: string | undefined,
  fallback: TrendsConfig['searchProvider'],
): TrendsConfig['searchProvider'] {
  const valid = ['serpapi', 'bing', 'tavily', 'direct', 'agent-reach', 'none'] as const;
  return valid.includes(raw as typeof valid[number])
    ? (raw as TrendsConfig['searchProvider'])
    : fallback;
}

/**
 * 趋势数据文件系统存储
 *
 * 目录结构：
 *   data/trends/config.json        — 用户配置
 *   data/trends/latest.json        — 最新完整快照
 *   data/trends/history/YYYY-MM-DD.json  — 每日历史
 */
export class TrendsStore {
  private readonly trendsDir: string;
  private readonly historyDir: string;
  private readonly latestPath: string;
  private readonly configPath: string;

  constructor(dataDir: string) {
    this.trendsDir = path.join(dataDir, 'trends');
    this.historyDir = path.join(this.trendsDir, 'history');
    this.latestPath = path.join(this.trendsDir, 'latest.json');
    this.configPath = path.join(this.trendsDir, 'config.json');
  }

  /** 确保目录存在 */
  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.historyDir, { recursive: true });
  }

  // ==================== 快照读写 ====================

  async getLatest(): Promise<TrendsSnapshot | null> {
    if (!(await pathExists(this.latestPath))) return null;
    return readJson<TrendsSnapshot | null>(this.latestPath, null);
  }

  async saveSnapshot(snapshot: TrendsSnapshot): Promise<void> {
    await this.ensureDirs();

    // 写入 latest
    await writeJson(this.latestPath, snapshot);

    // 写入历史（按日期命名，同一天覆盖）
    const date = snapshot.analysis.analyzedAt.slice(0, 10); // YYYY-MM-DD
    const historyPath = path.join(this.historyDir, `${date}.json`);
    await writeJson(historyPath, snapshot);

    // 清理过期历史
    await this.pruneOldHistory();

    log.info('趋势快照已保存', { date });
  }

  // ==================== 历史查询 ====================

  async listHistory(): Promise<TrendsHistoryEntry[]> {
    if (!(await pathExists(this.historyDir))) return [];

    const files = await fs.readdir(this.historyDir);
    const jsonFiles = files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse(); // 最新在前

    const entries: TrendsHistoryEntry[] = [];
    for (const file of jsonFiles) {
      const filePath = path.join(this.historyDir, file);
      const snapshot = await readJson<TrendsSnapshot | null>(filePath, null);
      if (!snapshot) continue;
      entries.push({
        date: file.replace('.json', ''),
        analyzedAt: snapshot.analysis.analyzedAt,
        hotGenres: snapshot.analysis.overallTrends.hotGenres.slice(0, 3),
        recommendationCount: snapshot.analysis.recommendations.length,
      });
    }
    return entries;
  }

  async getHistorySnapshot(date: string): Promise<TrendsSnapshot | null> {
    const filePath = path.join(this.historyDir, `${date}.json`);
    if (!(await pathExists(filePath))) return null;
    return readJson<TrendsSnapshot | null>(filePath, null);
  }

  /** 读取全部历史快照（按日期升序），用于统计聚合 */
  async getAllSnapshots(): Promise<TrendsSnapshot[]> {
    if (!(await pathExists(this.historyDir))) return [];
    const files = await fs.readdir(this.historyDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();
    const snapshots: TrendsSnapshot[] = [];
    for (const file of jsonFiles) {
      const s = await readJson<TrendsSnapshot | null>(path.join(this.historyDir, file), null);
      if (s) snapshots.push(s);
    }
    return snapshots;
  }

  // ==================== 配置管理 ====================

  async getConfig(): Promise<TrendsConfig> {
    const raw = await readJson<Record<string, unknown>>(this.configPath, {});
    const parsed = TrendsConfigSchema.parse(raw);
    return {
      ...parsed,
      enabled: readBoolEnv(process.env.TRENDS_ENABLED, parsed.enabled),
      scheduleHour: clampInt(process.env.TRENDS_SCHEDULE_HOUR, 0, 23, parsed.scheduleHour),
      scheduleMinute: clampInt(process.env.TRENDS_SCHEDULE_MINUTE, 0, 59, parsed.scheduleMinute),
      searchProvider: readSearchProviderEnv(process.env.TRENDS_SEARCH_PROVIDER, parsed.searchProvider),
      searchApiKey: process.env.TRENDS_SEARCH_API_KEY ?? '',
      searchApiBaseUrl: process.env.TRENDS_SEARCH_API_BASE_URL ?? '',
    };
  }

  async saveConfig(config: TrendsConfig): Promise<void> {
    await this.ensureDirs();
    await writeJson(this.configPath, config);
    log.info('趋势配置已保存');
  }

  // ==================== 清理 ====================

  private async pruneOldHistory(): Promise<void> {
    try {
      const files = await fs.readdir(this.historyDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();
      const excess = jsonFiles.length - MAX_HISTORY_SNAPSHOTS;
      if (excess <= 0) return;

      const toRemove = jsonFiles.slice(0, excess);
      for (const file of toRemove) {
        await fs.unlink(path.join(this.historyDir, file));
      }
      log.info(`已清理 ${toRemove.length} 个过期趋势快照`);
    } catch (err) {
      log.warn('清理历史快照失败', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
