/**
 * 操作审计日志（State Reflog）
 *
 * 类似 git reflog，记录所有对故事状态的修改操作，
 * 提供可追溯的操作历史，便于调试和回滚分析。
 */

import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// ── 常量 ──────────────────────────────────────────────────────────

const DEFAULT_MAX_ENTRIES = 10000;
const DEFAULT_QUERY_LIMIT = 100;

// ── 类型 ──────────────────────────────────────────────────────────

export type ReflogActor = 'agent' | 'user' | 'system';

export type ReflogAction =
  | 'save_snapshot'
  | 'compress_arc'
  | 'compress_mega_arc'
  | 'update_fact_graph'
  | 'propagate_knowledge'
  | 'manual_edit'
  | 'delete_snapshot'
  | 'branch_create'
  | 'branch_merge';

export type ReflogEntityType =
  | 'story_state'
  | 'fact_graph'
  | 'knowledge_graph'
  | 'character_matrix'
  | 'resource_ledger';

export interface ReflogEntry {
  id: string;
  timestamp: string;
  actor: ReflogActor;
  action: ReflogAction;
  entityType: ReflogEntityType;
  chapterNumber?: number;
  reason: string;
  /** Approximate size of the change in bytes */
  changeSize: number;
  /** Optional metadata for additional context */
  metadata?: Record<string, unknown>;
}

interface ReflogData {
  entries: ReflogEntry[];
  rotatedAt?: string;
}

// ── 实现 ──────────────────────────────────────────────────────────

export class StateReflog {
  private filePath: string;
  private buffer: ReflogEntry[] = [];
  private flushPromise: Promise<void> | null = null;

  /** Batch flush threshold: write to disk after N buffered entries */
  private static readonly FLUSH_THRESHOLD = 5;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** Append a new entry to the reflog */
  async append(
    entry: Omit<ReflogEntry, 'id' | 'timestamp'>,
  ): Promise<ReflogEntry> {
    const full: ReflogEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.buffer.push(full);

    if (this.buffer.length >= StateReflog.FLUSH_THRESHOLD) {
      await this.flush();
    }
    return full;
  }

  /** Get reflog history, newest first */
  async getHistory(opts: {
    entityType?: ReflogEntityType;
    action?: ReflogAction;
    limit?: number;
  } = {}): Promise<ReflogEntry[]> {
    await this.flush();
    const data = await this.readData();
    const limit = opts.limit ?? DEFAULT_QUERY_LIMIT;

    let entries = data.entries;

    if (opts.entityType) {
      entries = entries.filter(e => e.entityType === opts.entityType);
    }
    if (opts.action) {
      entries = entries.filter(e => e.action === opts.action);
    }

    // Return newest first, limited
    return entries.slice(-limit).reverse();
  }

  /** Rotate old entries when total exceeds maxEntries */
  async rotate(maxEntries: number = DEFAULT_MAX_ENTRIES): Promise<number> {
    await this.flush();
    const data = await this.readData();

    if (data.entries.length <= maxEntries) return 0;

    const removed = data.entries.length - maxEntries;
    data.entries = data.entries.slice(removed);
    data.rotatedAt = new Date().toISOString();

    await this.writeData(data);
    return removed;
  }

  /** Force flush buffered entries to disk */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    // Serialize concurrent flushes
    if (this.flushPromise) await this.flushPromise;

    const toFlush = [...this.buffer];
    this.buffer = [];

    this.flushPromise = this.doFlush(toFlush);
    await this.flushPromise;
    this.flushPromise = null;
  }

  private async doFlush(entries: ReflogEntry[]): Promise<void> {
    const data = await this.readData();
    data.entries.push(...entries);
    await this.writeData(data);
  }

  private async readData(): Promise<ReflogData> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as ReflogData;
    } catch {
      return { entries: [] };
    }
  }

  private async writeData(data: ReflogData): Promise<void> {
    const dir = this.filePath.replace(/[/\\][^/\\]+$/, '');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

// ── 便利工厂 ──────────────────────────────────────────────────────

/** Create a reflog entry for a snapshot save operation */
export function snapshotSaveEntry(
  chapterNumber: number,
  changeSize: number,
  actor: ReflogActor = 'agent',
): Omit<ReflogEntry, 'id' | 'timestamp'> {
  return {
    actor,
    action: 'save_snapshot',
    entityType: 'story_state',
    chapterNumber,
    reason: `保存第${chapterNumber}章快照`,
    changeSize,
  };
}

/** Create a reflog entry for an arc compression operation */
export function arcCompressEntry(
  startChapter: number,
  endChapter: number,
  changeSize: number,
): Omit<ReflogEntry, 'id' | 'timestamp'> {
  return {
    actor: 'system',
    action: 'compress_arc',
    entityType: 'story_state',
    reason: `压缩第${startChapter}-${endChapter}章为弧线摘要`,
    changeSize,
    metadata: { startChapter, endChapter },
  };
}

/** Create a reflog entry for a fact graph update */
export function factGraphUpdateEntry(
  chapterNumber: number,
  factCount: number,
): Omit<ReflogEntry, 'id' | 'timestamp'> {
  return {
    actor: 'agent',
    action: 'update_fact_graph',
    entityType: 'fact_graph',
    chapterNumber,
    reason: `从第${chapterNumber}章提取${factCount}条事实`,
    changeSize: factCount,
  };
}
