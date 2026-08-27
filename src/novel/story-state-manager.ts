import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  StoryState,
  StoryStateSnapshot,
  ResourceLedger,
  ResourceTransaction,
  CharacterMatrix,
  CharacterInteraction,
} from './story-state-types.js';
import { formatSnapshot, buildStateContext } from './story-state-formatter.js';
import {
  compressSnapshots,
  compressMegaArcsIfNeeded,
  ARC_COMPRESS_INTERVAL,
  MAX_RECENT_SNAPSHOTS,
} from './story-state-compressor.js';
import { normalizeNovelDataRoot, resolveNovelStorageDir } from './data-root.js';
import { normalizeLoadedStoryState } from './story-state-normalizer.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('story-state-manager');

const STORY_STATE_FILE = 'story-state.json';
const RESOURCE_LEDGER_FILE = 'resource-ledger.json';
const CHARACTER_MATRIX_FILE = 'character-matrix.json';

/**
 * 故事状态管理器
 * 负责持久化、读取、压缩故事状态快照
 * 接收 novelsDir（与 NovelManager 相同），文件存储在 {novelsDir}/novels/{novelId}/story-state.json
 */
export class StoryStateManager {
  private compressionLocks = new Map<string, Promise<boolean>>();
  /** formatSnapshot 缓存：`${novelId}:${chapterNumber}` → formatted string */
  private snapshotFormatCache = new Map<string, string>();
  /** 缓存上限，超出时清空（简易 LRU） */
  private static readonly FORMAT_CACHE_CAP = 200;
  private readonly dataDir: string;

  constructor(novelsDir: string) {
    this.dataDir = normalizeNovelDataRoot(novelsDir);
  }

  private statePath(novelId: string): string {
    return path.join(resolveNovelStorageDir(this.dataDir, novelId), STORY_STATE_FILE);
  }

  private resourceLedgerPath(novelId: string): string {
    return path.join(resolveNovelStorageDir(this.dataDir, novelId), RESOURCE_LEDGER_FILE);
  }

  private characterMatrixPath(novelId: string): string {
    return path.join(resolveNovelStorageDir(this.dataDir, novelId), CHARACTER_MATRIX_FILE);
  }

  /** 读取完整故事状态，不存在则返回空状态 */
  async getState(novelId: string): Promise<StoryState> {
    try {
      const raw = await fs.readFile(this.statePath(novelId), 'utf-8');
      const json = JSON.parse(raw);
      const { state, droppedSnapshots } = normalizeLoadedStoryState(json, novelId);
      if (droppedSnapshots > 0) {
        // 损坏快照已在内存中被丢弃/补全，下次 saveSnapshot 会把干净数据写回磁盘（自愈）。
        log.warn(
          `novel=${novelId} 读取 story-state 时丢弃了 ${droppedSnapshots} 个损坏快照` +
          '（可能由批量生成失败写入半成品导致），生成将基于剩余有效状态继续。',
        );
      }
      return state;
    } catch {
      return {
        novelId,
        latestChapter: 0,
        snapshots: [],
        compressedArcs: [],
        megaArcs: [],
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /** 获取最新快照 */
  async getLatestSnapshot(novelId: string): Promise<StoryStateSnapshot | null> {
    const state = await this.getState(novelId);
    if (state.snapshots.length === 0) return null;
    return state.snapshots[state.snapshots.length - 1];
  }

  /** 获取指定章节的快照 */
  async getSnapshotAt(novelId: string, chapterNumber: number): Promise<StoryStateSnapshot | null> {
    const state = await this.getState(novelId);
    return state.snapshots.find(s => s.chapterNumber === chapterNumber) ?? null;
  }

  /** 保存新快照（追加或覆盖同章节号） */
  async saveSnapshot(novelId: string, snapshot: StoryStateSnapshot): Promise<void> {
    // 清除该章节的格式化缓存
    this.snapshotFormatCache.delete(`${novelId}:${snapshot.chapterNumber}`);

    const state = await this.getState(novelId);
    const idx = state.snapshots.findIndex(s => s.chapterNumber === snapshot.chapterNumber);
    if (idx >= 0) {
      state.snapshots[idx] = snapshot;
    } else {
      state.snapshots.push(snapshot);
      state.snapshots.sort((a, b) => a.chapterNumber - b.chapterNumber);
    }
    state.latestChapter = Math.max(state.latestChapter, snapshot.chapterNumber);
    state.updatedAt = new Date().toISOString();
    await this.writeState(novelId, state);
  }

  /**
   * 构建注入 Writer 的状态上下文字符串
   * 策略：最近 N 章详细快照 + 更早的压缩弧线摘要
   */
  buildStateContext(state: StoryState, currentChapter: number, maxChars: number = 6000): string {
    return buildStateContext(state, currentChapter, maxChars, this.snapshotFormatCache);
  }

  /**
   * 压缩旧快照为弧线摘要（当快照数超过阈值时自动触发）
   * 保留最近 MAX_RECENT_SNAPSHOTS 个详细快照，更早的压缩为摘要
   */
  async compressIfNeeded(novelId: string): Promise<boolean> {
    // Wait for any in-flight compression on this novel
    const existing = this.compressionLocks.get(novelId);
    if (existing) await existing;

    const promise = this._doCompress(novelId);
    this.compressionLocks.set(novelId, promise);
    try {
      return await promise;
    } finally {
      this.compressionLocks.delete(novelId);
    }
  }

  private async _doCompress(novelId: string): Promise<boolean> {
    const state = await this.getState(novelId);

    // 一级压缩：快照 → CompressedArc
    const result = compressSnapshots(state);
    if (!result.compressed) return false;

    // 二级压缩：CompressedArc → MegaArc
    compressMegaArcsIfNeeded(result.state);

    await this.writeState(novelId, result.state);
    return true;
  }

  /** 构建传递给 StoryStateTracker Agent 的输入 */
  buildTrackerInput(
    chapterNumber: number,
    chapterContent: string,
    previousSnapshot: StoryStateSnapshot | null,
    characterNames: string[],
  ): string {
    const parts: string[] = [
      `## 当前章节：第${chapterNumber}章\n`,
      '## 章节正文',
      chapterContent.length > 12000
        ? chapterContent.slice(0, 4000) + '\n\n[...中间部分省略...]\n\n' + chapterContent.slice(-8000)
        : chapterContent,
      '',
    ];

    if (previousSnapshot) {
      parts.push('## 上一章状态快照（JSON）');
      parts.push(JSON.stringify(previousSnapshot, null, 2));
      parts.push('');
    }

    parts.push('## 已知角色列表');
    parts.push(characterNames.join('、'));

    return parts.join('\n');
  }

  /** 清理指定小说的所有缓存（小说删除时调用） */
  clearNovelCache(novelId: string): void {
    for (const key of this.snapshotFormatCache.keys()) {
      if (key.startsWith(`${novelId}:`)) {
        this.snapshotFormatCache.delete(key);
      }
    }
    this.compressionLocks.delete(novelId);
  }

  async removeChapterArtifacts(novelId: string, chapterNumber: number): Promise<void> {
    const state = await this.getState(novelId);
    const nextSnapshots = state.snapshots.filter(snapshot => snapshot.chapterNumber !== chapterNumber);
    const nextCompressedArcs = state.compressedArcs.filter(arc => arc.chapterRange.end < chapterNumber);
    const nextMegaArcs = state.megaArcs.filter(arc => arc.chapterRange.end < chapterNumber);
    if (
      nextSnapshots.length !== state.snapshots.length
      || nextCompressedArcs.length !== state.compressedArcs.length
      || nextMegaArcs.length !== state.megaArcs.length
    ) {
      await this.writeState(novelId, {
        ...state,
        latestChapter: nextSnapshots.length > 0
          ? Math.max(...nextSnapshots.map(snapshot => snapshot.chapterNumber))
          : 0,
        snapshots: nextSnapshots,
        compressedArcs: nextCompressedArcs,
        megaArcs: nextMegaArcs,
        updatedAt: new Date().toISOString(),
      });
    }

    const ledger = await this.getResourceLedger(novelId);
    const nextLedger: ResourceLedger = {
      ...ledger,
      entries: ledger.entries
        .filter(entry => entry.acquiredAt < chapterNumber)
        .map(entry => ({
          ...entry,
          lastUsedAt: entry.lastUsedAt != null && entry.lastUsedAt >= chapterNumber
            ? undefined
            : entry.lastUsedAt,
        })),
      transactions: ledger.transactions.filter(tx => tx.chapterNumber < chapterNumber),
      updatedAt: new Date().toISOString(),
    };
    await this.updateResourceLedger(novelId, nextLedger);

    const emptyMatrix: CharacterMatrix = {
      novelId,
      interactions: [],
      informationBoundaries: {},
      updatedAt: new Date().toISOString(),
    };
    await this.updateCharacterMatrix(novelId, emptyMatrix);
    this.clearNovelCache(novelId);
  }

  private async writeState(novelId: string, state: StoryState): Promise<void> {
    const filePath = this.statePath(novelId);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  /** 读取资源账本，不存在则返回空账本 */
  async getResourceLedger(novelId: string): Promise<ResourceLedger> {
    try {
      const raw = await fs.readFile(this.resourceLedgerPath(novelId), 'utf-8');
      return JSON.parse(raw) as ResourceLedger;
    } catch {
      return {
        novelId,
        entries: [],
        transactions: [],
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /** 更新资源账本 */
  async updateResourceLedger(novelId: string, ledger: ResourceLedger): Promise<void> {
    ledger.updatedAt = new Date().toISOString();
    const filePath = this.resourceLedgerPath(novelId);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(ledger, null, 2), 'utf-8');
  }

  /** 添加资源交易记录 */
  async addResourceTransaction(novelId: string, transaction: ResourceTransaction): Promise<void> {
    const ledger = await this.getResourceLedger(novelId);

    // 添加交易记录
    ledger.transactions.push(transaction);

    // 更新资源条目
    const entry = ledger.entries.find(e => e.id === transaction.resourceId);
    if (entry) {
      switch (transaction.type) {
        case 'acquire':
          entry.quantity += transaction.amount;
          entry.acquiredAt = transaction.chapterNumber;
          break;
        case 'consume':
          entry.quantity = Math.max(0, entry.quantity - transaction.amount);
          entry.lastUsedAt = transaction.chapterNumber;
          break;
        case 'decay':
          if (entry.durability !== undefined) {
            entry.durability = Math.max(0, entry.durability - transaction.amount);
          }
          entry.lastUsedAt = transaction.chapterNumber;
          break;
        case 'transfer':
          // Transfer logic handled by caller (create two transactions)
          entry.lastUsedAt = transaction.chapterNumber;
          break;
      }
    }

    await this.updateResourceLedger(novelId, ledger);
  }

  async getCharacterMatrix(novelId: string): Promise<CharacterMatrix> {
    try {
      const raw = await fs.readFile(this.characterMatrixPath(novelId), 'utf-8');
      return JSON.parse(raw) as CharacterMatrix;
    } catch {
      return {
        novelId,
        interactions: [],
        informationBoundaries: {},
        updatedAt: new Date().toISOString(),
      };
    }
  }

  async updateCharacterMatrix(novelId: string, matrix: CharacterMatrix): Promise<void> {
    matrix.updatedAt = new Date().toISOString();
    const filePath = this.characterMatrixPath(novelId);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(matrix, null, 2), 'utf-8');
  }

  /** 记录角色交互 */
  async recordInteraction(novelId: string, interaction: CharacterInteraction): Promise<void> {
    const matrix = await this.getCharacterMatrix(novelId);

    // 查找现有交互记录
    const existing = matrix.interactions.find(
      i => (i.characterA === interaction.characterA && i.characterB === interaction.characterB) ||
           (i.characterA === interaction.characterB && i.characterB === interaction.characterA),
    );

    if (existing) {
      // 更新现有记录
      if (interaction.firstMetAt && (!existing.firstMetAt || interaction.firstMetAt < existing.firstMetAt)) {
        existing.firstMetAt = interaction.firstMetAt;
      }
      if (interaction.lastInteractionAt && (!existing.lastInteractionAt || interaction.lastInteractionAt > existing.lastInteractionAt)) {
        existing.lastInteractionAt = interaction.lastInteractionAt;
      }
      if (interaction.relationshipType !== 'unknown') {
        existing.relationshipType = interaction.relationshipType;
      }
      // 合并共享知识
      for (const knowledge of interaction.sharedKnowledge) {
        if (!existing.sharedKnowledge.includes(knowledge)) {
          existing.sharedKnowledge.push(knowledge);
        }
      }
      // 合并非对称知识
      for (const asymmetric of interaction.asymmetricKnowledge) {
        const existingAsymmetric = existing.asymmetricKnowledge.find(
          a => a.knower === asymmetric.knower && a.secret === asymmetric.secret,
        );
        if (!existingAsymmetric) {
          existing.asymmetricKnowledge.push(asymmetric);
        }
      }
    } else {
      // 添加新交互记录
      matrix.interactions.push(interaction);
    }

    await this.updateCharacterMatrix(novelId, matrix);
  }
}
