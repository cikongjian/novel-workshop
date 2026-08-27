import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { now } from '../utils/text.js';
import type { NovelConstitution } from './constitution-types.js';
import {
  NovelMetadata,
  WorldEntry,
  CharacterProfile,
  CharacterStateSnapshot,
  OutlineData,
  Chapter,
  ChapterVersionHistory,
  ConstitutionVersionHistory,
  CharacterEvent,
  ChapterFact,
  ChapterPacing,
  type PlotThreadSnapshot,
  type OutlineDeviation,
  type NovelGenre,
  type NovelStatus,
  type ConstitutionVersionSource,
  type VersionSource,
} from './types.js';
import type { CollaborationEntry } from '../pipeline/collaboration-log.js';
import type { StyleDNA } from '../style/style-types.js';
import type { FactGraph } from './fact-graph-types.js';
import type { PlotBranchTree } from './plot-branch-types.js';
import type { NovelCostData, ChapterCostSummary } from '../cost/cost-types.js';

// ==================== Repository modules ====================
import { NovelPaths } from './novel-paths.js';
import { normalizeNovelDataRoot } from './data-root.js';
import { readJson, writeJson, pathExists } from './fs-helpers.js';
import {
  type ChapterSummary,
  invalidateChapterIndex as _invalidateChapterIndex,
  getChapter as _getChapter,
  saveChapter as _saveChapter,
  listChapters as _listChapters,
  deleteChapter as _deleteChapter,
  swapChapters as _swapChapters,
  getChapterVersions as _getChapterVersions,
  archiveChapterVersion as _archiveChapterVersion,
  rollbackChapterToVersion as _rollbackChapterToVersion,
} from './chapter-repository.js';
import {
  type ChapterPageParams,
  type ChapterPageResult,
  listChapterPage as _listChapterPage,
} from './chapter-page-repository.js';
import {
  countChapterSummaries as _countChapterSummaries,
  findLatestChapterNumber as _findLatestChapterNumber,
  listChapterSummariesByNumbers as _listChapterSummariesByNumbers,
} from './chapter-summary-reader.js';
import {
  getConstitutionVersions as _getConstitutionVersions,
  archiveConstitutionVersion as _archiveConstitutionVersion,
} from './constitution-repository.js';
import {
  calculateNovelMetadataStats,
  shouldHydrateNovelMetadataStats,
} from './novel-metadata-stats.js';
import { NovelListSummary } from './novel-list-summary.js';
import {
  type NovelBindingSummary,
  listNovelBindingSummaries as _listNovelBindingSummaries,
} from './novel-binding-summary.js';
import {
  type PendingCharacterCandidate,
  getCharacters as _getCharacters,
  saveCharacter as _saveCharacter,
  deleteCharacter as _deleteCharacter,
  getPendingCharacterCandidates as _getPendingCharacterCandidates,
  upsertPendingCharacterCandidates as _upsertPendingCharacterCandidates,
  markPendingCharacterCandidates as _markPendingCharacterCandidates,
  removePendingCharacterCandidates as _removePendingCharacterCandidates,
  getCharacterStateSnapshots as _getCharacterStateSnapshots,
  saveCharacterStateSnapshot as _saveCharacterStateSnapshot,
  getCharacterEvents as _getCharacterEvents,
  appendCharacterEvents as _appendCharacterEvents,
  getCharacterHighlights as _getCharacterHighlights,
  appendCharacterHighlights as _appendCharacterHighlights,
  getCharacterRelations as _getCharacterRelations,
  appendCharacterRelations as _appendCharacterRelations,
  type CharacterHighlightsEntry,
  type CharacterRelationEntry,
} from './character-repository.js';
import type { PerCharacterHighlights } from './character-highlight-extractor.js';
import type { RelationPair } from './character-relation-extractor.js';
import {
  getWorldEntries as _getWorldEntries,
  saveWorldEntry as _saveWorldEntry,
  deleteWorldEntry as _deleteWorldEntry,
} from './world-repository.js';
import {
  getOutline as _getOutline,
  saveOutline as _saveOutline,
  rebuildOutlineFromChapters as _rebuildOutlineFromChapters,
} from './outline-repository.js';
import {
  type QuoteCleanupFeedback,
  getQuoteCleanupFeedback as _getQuoteCleanupFeedback,
  saveQuoteCleanupFeedback as _saveQuoteCleanupFeedback,
  addIgnoredQuoteTexts as _addIgnoredQuoteTexts,
  getChapterFacts as _getChapterFacts,
  getChapterFact as _getChapterFact,
  saveChapterFact as _saveChapterFact,
  getPacing as _getPacing,
  savePacing as _savePacing,
  getPlotThreadSnapshots as _getPlotThreadSnapshots,
  savePlotThreadSnapshots as _savePlotThreadSnapshots,
  getOutlineDeviations as _getOutlineDeviations,
  saveOutlineDeviation as _saveOutlineDeviation,
  getCollaborationLogs as _getCollaborationLogs,
  saveCollaborationLog as _saveCollaborationLog,
  getStyleDna as _getStyleDna,
  saveStyleDna as _saveStyleDna,
  deleteStyleDna as _deleteStyleDna,
  getFactGraph as _getFactGraph,
  saveFactGraph as _saveFactGraph,
  getPlotBranchTree as _getPlotBranchTree,
  savePlotBranchTree as _savePlotBranchTree,
  getCostData as _getCostData,
  saveCostData as _saveCostData,
  appendChapterCost as _appendChapterCost,
} from './derived-data-repository.js';

// Re-export types so existing consumers don't break
export type { PendingCharacterCandidate } from './character-repository.js';
export type { QuoteCleanupFeedback } from './derived-data-repository.js';
export type { ChapterSummary } from './chapter-repository.js';

/**
 * 小说数据管理器
 * 基于文件系统的 CRUD，每部小说一个独立目录
 *
 * 目录结构：
 * data/novels/{novel-id}/
 *   novel.json          - 小说元数据
 *   world.json          - 世界观条目列表
 *   characters.json     - 角色列表
 *   outline.json        - 大纲数据
 *   chapters/001.md     - 章节正文
 *   chapters/001.json   - 章节元数据
 *
 * 此类为 Facade（门面），内部逻辑委托给各 repository 模块：
 * - chapter-repository.ts
 * - character-repository.ts
 * - world-repository.ts
 * - outline-repository.ts
 * - derived-data-repository.ts
 */
export class NovelManager {
  private dataDir: string;
  private paths: NovelPaths;

  /** syncNovelMetadataByChapters 去抖：同一 novelId 的并发/连续调用合并为一次 */
  private syncMetaInflight = new Map<string, Promise<NovelMetadata>>();
  private syncMetaTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly SYNC_META_DEBOUNCE_MS = 600;

  /**
   * novel.json 元数据的 per-novelId 进程内写锁。
   * 防止后台同步任务（syncNovelMetadataByChapters）与用户编辑（updateNovel / saveConstitution）
   * 并发执行 read-modify-write 时，后写覆盖前写导致 wordCount/chapterCount/status 等字段丢失。
   */
  private novelMetaLocks = new Map<string, Promise<void>>();

  /**
   * 在 novel.json 的 per-novelId 写锁保护下执行临界区（按 novelId 串行）。
   * 注意：该方法非重入，内部若需再次更新元数据必须调用未加锁的 updateNovelCore，
   * 严禁在持锁期间调用 updateNovel / saveConstitution 等会再次取锁的方法。
   */
  private async withNovelMetaLock<T>(novelId: string, fn: () => Promise<T>): Promise<T> {
    const current = this.novelMetaLocks.get(novelId) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const chain = current.then(() => next, () => next);
    this.novelMetaLocks.set(novelId, chain);
    await current;
    try {
      return await fn();
    } finally {
      release();
      // 若本锁仍是队列末尾，清理引用避免 Map 无界增长
      if (this.novelMetaLocks.get(novelId) === chain) this.novelMetaLocks.delete(novelId);
    }
  }

  constructor(dataDir: string) {
    this.dataDir = normalizeNovelDataRoot(dataDir);
    this.paths = new NovelPaths(this.dataDir);
  }

  /** 获取数据根目录 */
  getDataDir(): string {
    return this.dataDir;
  }

  /** 使指定小说的章节索引缓存失效 */
  invalidateChapterIndex(novelId: string): void {
    _invalidateChapterIndex(novelId);
  }

  /**
   * 注入备份管理器（用于删除前自动备份）
   */
  setBackupManager(_manager: { createBackup(novelId: string): Promise<unknown> }): void {
  }

  // ==================== 小说 CRUD ====================

  /**
   * 创建新小说，初始化目录结构和默认文件
   */
  async createNovel(params: {
    title: string;
    genre: NovelGenre;
    synopsis?: string;
    description?: string;
    constitutionTags?: string[];
    ownerId?: string;
  }): Promise<NovelMetadata> {
    const id = randomUUID();
    const timestamp = now();

    const metadata: NovelMetadata = NovelMetadata.parse({
      id,
      syncId: id,
      title: params.title,
      genre: params.genre,
      status: 'planning',
      synopsis: params.synopsis ?? '',
      description: params.description ?? '',
      constitutionTags: params.constitutionTags ?? [],
      ownerId: params.ownerId ?? 'dev',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // 创建目录结构
    const dir = this.paths.novelDir(id);
    await fs.mkdir(path.join(dir, 'chapters'), { recursive: true });

    // 写入初始文件
    await Promise.all([
      writeJson(this.paths.novelMetaPath(id), metadata),
      writeJson(this.paths.worldPath(id), []),
      writeJson(this.paths.charactersPath(id), []),
      writeJson(this.paths.pendingCharactersPath(id), []),
      writeJson(this.paths.characterStatesPath(id), []),
      writeJson(this.paths.outlinePath(id), { chapters: [], plotThreads: [], foreshadowing: [] }),
    ]);

    return metadata;
  }

  /**
   * 获取小说元数据
   */
  async getNovel(id: string): Promise<NovelMetadata> {
    const metaPath = this.paths.novelMetaPath(id);
    if (!(await pathExists(metaPath))) {
      throw new Error(`小说不存在: ${id}`);
    }

    const raw = await readJson<Record<string, unknown> | null>(metaPath, null);
    if (!raw) {
      throw new Error(`小说元数据损坏: ${id}`);
    }
    const parsed = NovelMetadata.parse(raw);
    let diskChapterCount = parsed.chapterCount ?? 0;
    if (diskChapterCount === 0) {
      const chaptersDir = this.paths.chaptersDir(id);
      if (await pathExists(chaptersDir)) {
        const files = await fs.readdir(chaptersDir);
        diskChapterCount = files.filter(file => /^\d+\.json$/.test(file)).length;
      }
    }
    const shouldHydrate = typeof raw.wordCount !== 'number'
      || !Number.isFinite(raw.wordCount)
      || raw.wordCount < 0
      || typeof raw.finalizedChapterCount !== 'number'
      || !Number.isFinite(raw.finalizedChapterCount)
      || raw.finalizedChapterCount < 0
      || (diskChapterCount > 0 && parsed.wordCount === 0);
    if (!shouldHydrate) {
      return parsed;
    }

    const stats = calculateNovelMetadataStats(await this.listChapters(id));
    return {
      ...parsed,
      ...stats,
    };
  }

  /**
   * 列出所有小说
   */
  async listNovels(): Promise<NovelMetadata[]> {
    const novelsDir = this.paths.novelsDir();
    await fs.mkdir(novelsDir, { recursive: true });
    const legacyNovelsDir = this.paths.legacyNovelsDir();
    const [directEntries, legacyEntries] = await Promise.all([
      fs.readdir(novelsDir, { withFileTypes: true }),
      fs.readdir(legacyNovelsDir, { withFileTypes: true }).catch(() => [] as Array<{ name: string; isDirectory(): boolean }>),
    ]);
    const entryNames = new Set<string>();
    for (const entry of [...directEntries, ...legacyEntries]) {
      if (entry.isDirectory()) entryNames.add(entry.name);
    }
    const novels: NovelMetadata[] = [];
    const ids = [...entryNames];
    const BATCH = 10;

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(async (novelId) => {
        const metaPath = this.paths.novelMetaPath(novelId);
        const raw = await readJson<Record<string, unknown> | null>(metaPath, null);
        if (!raw) return null;
        const parsed = NovelMetadata.parse(raw);
        let chapterCount = parsed.chapterCount ?? 0;
        let finalizedChapterCount = parsed.finalizedChapterCount ?? 0;
        let wordCount = parsed.wordCount ?? 0;
        try {
          const chapDir = this.paths.chaptersDir(novelId);
          const files = await fs.readdir(chapDir);
          chapterCount = files.filter(f => /^\d+\.json$/.test(f)).length;
        } catch { /* chapters dir may not exist */ }
        if (shouldHydrateNovelMetadataStats(raw, chapterCount)) {
          const stats = calculateNovelMetadataStats(await this.listChapters(novelId));
          finalizedChapterCount = stats.finalizedChapterCount;
          wordCount = stats.wordCount;
        }
        return { ...parsed, chapterCount, finalizedChapterCount, wordCount };
      }));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) novels.push(r.value);
      }
    }

    // 按更新时间降序排列
    novels.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return novels;
  }

  /**
   * 列出小说摘要，仅保留列表页所需字段。
   * 避免触发章节级统计回填，适合大量小说时的卡片/筛选场景。
   */
  async listNovelSummaries(): Promise<NovelListSummary[]> {
    const novelsDir = this.paths.novelsDir();
    await fs.mkdir(novelsDir, { recursive: true });
    const legacyNovelsDir = this.paths.legacyNovelsDir();
    const [directEntries, legacyEntries] = await Promise.all([
      fs.readdir(novelsDir, { withFileTypes: true }),
      fs.readdir(legacyNovelsDir, { withFileTypes: true }).catch(() => [] as Array<{ name: string; isDirectory(): boolean }>),
    ]);
    const entryNames = new Set<string>();
    for (const entry of [...directEntries, ...legacyEntries]) {
      if (entry.isDirectory()) entryNames.add(entry.name);
    }

    const novels: NovelListSummary[] = [];
    const ids = [...entryNames];
    const BATCH = 10;

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map(async (novelId) => {
        const metaPath = this.paths.novelMetaPath(novelId);
        const raw = await readJson<Record<string, unknown> | null>(metaPath, null);
        if (!raw) return null;
        let chapterCount = typeof raw.chapterCount === 'number' && Number.isFinite(raw.chapterCount)
          ? Math.max(0, Math.trunc(raw.chapterCount))
          : 0;
        try {
          const chapDir = this.paths.chaptersDir(novelId);
          const files = await fs.readdir(chapDir);
          chapterCount = files.filter((file) => /^\d+\.json$/.test(file)).length;
        } catch { /* chapters 目录可能还不存在 */ }
        return NovelListSummary.parse({
          ...raw,
          chapterCount,
          finalizedChapterCount: typeof raw.finalizedChapterCount === 'number' && Number.isFinite(raw.finalizedChapterCount)
            ? Math.max(0, Math.trunc(raw.finalizedChapterCount)) : 0,
          wordCount: typeof raw.wordCount === 'number' && Number.isFinite(raw.wordCount)
            ? Math.max(0, Math.trunc(raw.wordCount)) : 0,
        });
      }));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) novels.push(r.value);
      }
    }

    novels.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return novels;
  }

  async listNovelBindingSummaries(): Promise<NovelBindingSummary[]> {
    return _listNovelBindingSummaries(this.paths);
  }

  /**
   * 更新小说元数据（不加锁版本，供已持有 novelMetaLock 的内部临界区调用，避免重入死锁）
   */
  private async updateNovelCore(
    id: string,
    updates: Partial<NovelMetadata>,
  ): Promise<NovelMetadata> {
    const current = await this.getNovel(id);

    const updated = NovelMetadata.parse({
      ...current,
      ...updates,
      id: current.id, // 禁止修改 ID
      createdAt: current.createdAt, // 禁止修改创建时间
      updatedAt: now(),
    });

    await writeJson(this.paths.novelMetaPath(id), updated);
    return updated;
  }

  /**
   * 更新小说元数据
   */
  async updateNovel(
    id: string,
    updates: Partial<NovelMetadata>,
  ): Promise<NovelMetadata> {
    return this.withNovelMetaLock(id, () => this.updateNovelCore(id, updates));
  }

  async getConstitutionVersions(novelId: string): Promise<ConstitutionVersionHistory> {
    return _getConstitutionVersions(this.paths, novelId);
  }

  async saveConstitution(
    novelId: string,
    constitution: NovelConstitution,
    source: ConstitutionVersionSource,
  ): Promise<NovelMetadata> {
    return this.withNovelMetaLock(novelId, async () => {
      const current = await this.getNovel(novelId);
      if (current.constitution) {
        await _archiveConstitutionVersion(this.paths, novelId, current.constitution, source);
      }
      return this.updateNovelCore(novelId, { constitution } as Partial<NovelMetadata>);
    });
  }

  async rollbackConstitutionToVersion(
    novelId: string,
    targetVersion: number,
  ): Promise<NovelConstitution> {
    return this.withNovelMetaLock(novelId, async () => {
      const current = await this.getNovel(novelId);
      const history = await _getConstitutionVersions(this.paths, novelId);
      const versionEntry = history.versions.find(item => item.version === targetVersion);
      if (!versionEntry) {
        throw new Error(`宪章版本 ${targetVersion} 不存在`);
      }

      if (current.constitution) {
        await _archiveConstitutionVersion(this.paths, novelId, current.constitution, 'rollback');
      }

      const restored: NovelConstitution = {
        ...versionEntry.constitution,
        version: (current.constitution?.version ?? 0) + 1,
        updatedAt: now(),
      };
      await this.updateNovelCore(novelId, { constitution: restored } as Partial<NovelMetadata>);
      return restored;
    });
  }

  /**
   * Recalculate novel metadata from chapter progress and always refresh updatedAt.
   */
  async syncNovelMetadataByChapters(id: string): Promise<NovelMetadata> {
    return this.withNovelMetaLock(id, async () => {
      const novel = await this.getNovel(id);
      const chapters = await this.listChapters(id);
      const stats = calculateNovelMetadataStats(chapters);
      const finalizedCount = stats.finalizedChapterCount;
      const hasDraftProgress = chapters.some(ch => ch.status !== 'outlined');
      const hasChapters = stats.chapterCount > 0;
      const target = novel.targetChapters;

      let nextStatus: NovelStatus;
      if (novel.status === 'paused' || novel.status === 'completed' || novel.status === 'published') {
        nextStatus = novel.status;
      } else if (target && finalizedCount >= target && hasChapters) {
        nextStatus = 'completed';
      } else if (hasChapters && hasDraftProgress) {
        nextStatus = 'writing';
      } else {
        nextStatus = 'planning';
      }

      return this.updateNovelCore(id, {
        status: nextStatus,
        chapterCount: stats.chapterCount,
        finalizedChapterCount: stats.finalizedChapterCount,
        wordCount: stats.wordCount,
      });
    });
  }

  /**
   * 去抖版 syncNovelMetadataByChapters
   */
  syncNovelMetadataDebounced(id: string): Promise<NovelMetadata> {
    const inflight = this.syncMetaInflight.get(id);
    if (inflight) return inflight;

    const prev = this.syncMetaTimers.get(id);
    if (prev) clearTimeout(prev);

    const promise = new Promise<NovelMetadata>((resolve, reject) => {
      const timer = setTimeout(async () => {
        this.syncMetaTimers.delete(id);
        try {
          const result = await this.syncNovelMetadataByChapters(id);
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.syncMetaInflight.delete(id);
        }
      }, NovelManager.SYNC_META_DEBOUNCE_MS);
      this.syncMetaTimers.set(id, timer);
    });

    this.syncMetaInflight.set(id, promise);
    return promise;
  }

  /**
   * 软删除：将小说移入回收站（data/trash/）
   */
  async deleteNovel(id: string): Promise<void> {
    return this.withNovelMetaLock(id, async () => {
      const dir = this.paths.novelDir(id);
      if (!(await pathExists(dir))) {
        throw new Error(`小说不存在: ${id}`);
      }
      const trashBase = this.paths.trashBase();
      await fs.mkdir(trashBase, { recursive: true });

      // 写入删除时间戳，方便后续展示
      const meta = await readJson<Record<string, unknown>>(this.paths.novelMetaPath(id), {});
      meta.deletedAt = now();
      await writeJson(this.paths.novelMetaPath(id), meta);

      const dest = this.paths.trashDir(id);
      // 如果回收站已有同 id（极端情况），先清理
      if (await pathExists(dest)) {
        await fs.rm(dest, { recursive: true, force: true });
      }
      await fs.rename(dir, dest);
    });
  }

  /**
   * 列出回收站中的小说
   */
  async listTrash(): Promise<(NovelMetadata & { deletedAt?: string })[]> {
    const trashBase = this.paths.trashBase();
    await fs.mkdir(trashBase, { recursive: true });

    const entries = await fs.readdir(trashBase, { withFileTypes: true });
    const results: (NovelMetadata & { deletedAt?: string })[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const metaPath = path.join(trashBase, entry.name, 'novel.json');
        const raw = await readJson<Record<string, unknown>>(metaPath, null as unknown as Record<string, unknown>);
        if (raw) {
          const deletedAt = typeof raw.deletedAt === 'string' ? raw.deletedAt : undefined;
          const parsed = NovelMetadata.parse(raw);
          results.push({ ...parsed, deletedAt });
        }
      } catch { /* 跳过损坏条目 */ }
    }

    return results.sort((a, b) =>
      (b.deletedAt ?? b.updatedAt).localeCompare(a.deletedAt ?? a.updatedAt),
    );
  }

  /**
   * 从回收站恢复小说
   */
  async restoreNovel(id: string): Promise<NovelMetadata> {
    const trashPath = this.paths.trashDir(id);
    if (!(await pathExists(trashPath))) {
      throw new Error(`回收站中不存在该小说: ${id}`);
    }
    const dest = this.paths.novelDir(id);
    if (await pathExists(dest)) {
      throw new Error(`小说目录已存在，无法恢复: ${id}`);
    }
    await fs.mkdir(this.paths.novelsDir(), { recursive: true });
    await fs.rename(trashPath, dest);

    // 移除 deletedAt 标记
    const meta = await readJson<Record<string, unknown>>(this.paths.novelMetaPath(id), {});
    delete meta.deletedAt;
    meta.updatedAt = now();
    await writeJson(this.paths.novelMetaPath(id), meta);

    return this.getNovel(id);
  }

  /**
   * 永久删除回收站中的小说
   */
  async permanentDeleteNovel(id: string): Promise<void> {
    const trashPath = this.paths.trashDir(id);
    if (!(await pathExists(trashPath))) {
      throw new Error(`回收站中不存在该小说: ${id}`);
    }
    await fs.rm(trashPath, { recursive: true, force: true });
  }

  // ==================== 引述清理反馈（委托） ====================

  async getQuoteCleanupFeedback(novelId: string): Promise<QuoteCleanupFeedback> {
    return _getQuoteCleanupFeedback(this.paths, novelId);
  }

  async saveQuoteCleanupFeedback(novelId: string, feedback: QuoteCleanupFeedback): Promise<void> {
    return _saveQuoteCleanupFeedback(this.paths, novelId, feedback);
  }

  async addIgnoredQuoteTexts(novelId: string, quoteTexts: string[]): Promise<QuoteCleanupFeedback> {
    return _addIgnoredQuoteTexts(this.paths, novelId, quoteTexts);
  }

  // ==================== 章节管理（委托） ====================

  async getChapter(novelId: string, chapterNumber: number): Promise<Chapter | null> {
    return _getChapter(this.paths, novelId, chapterNumber);
  }

  async saveChapter(novelId: string, chapter: Chapter): Promise<void> {
    return _saveChapter(this.paths, novelId, chapter);
  }

  async listChapters(novelId: string): Promise<ChapterSummary[]> {
    return _listChapters(this.paths, novelId);
  }

  async listChapterPage(novelId: string, params: ChapterPageParams): Promise<ChapterPageResult> {
    return _listChapterPage(this.paths, novelId, params);
  }

  async countChapters(novelId: string): Promise<number> {
    return _countChapterSummaries(this.paths, novelId);
  }

  async listChapterSummariesByNumbers(novelId: string, chapterNumbers: number[]): Promise<ChapterSummary[]> {
    return _listChapterSummariesByNumbers(this.paths, novelId, chapterNumbers);
  }

  /**
   * 批量获取多本小说的 `interactiveConfig.enabled` 标志。
   *
   * 优化点：原本每本书都要走一次 `getNovel`（读 novel.json），列表 N 本 → N 次文件读。
   * 改为单次 Promise.all 并发读 + Map 归并，单本失败降级为 false。
   * 文件级读取并发安全（fs 异步），没有锁问题。
   */
  async getInteractiveFlagsByNovelIds(novelIds: readonly string[]): Promise<Map<string, boolean>> {
    const uniqueIds = [...new Set(novelIds.filter((id) => typeof id === 'string' && id.length > 0))];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const results = await Promise.allSettled(
      uniqueIds.map(async (novelId) => {
        try {
          const novel = await this.getNovel(novelId);
          const cfg = novel.interactiveConfig as { enabled?: unknown } | undefined;
          return { novelId, enabled: !!cfg?.enabled };
        } catch {
          return { novelId, enabled: false };
        }
      }),
    );
    const flagMap = new Map<string, boolean>();
    for (const r of results) {
      if (r.status === 'fulfilled') {
        flagMap.set(r.value.novelId, r.value.enabled);
      }
    }
    return flagMap;
  }

  async findLatestChapterNumber(
    novelId: string,
    params?: { preferWritten?: boolean; batchSize?: number },
  ): Promise<number> {
    return _findLatestChapterNumber(this.paths, novelId, params);
  }

  async deleteChapter(novelId: string, chapterNumber: number): Promise<void> {
    return _deleteChapter(this.paths, novelId, chapterNumber);
  }

  async swapChapters(
    novelId: string,
    chapterNumA: number,
    chapterNumB: number,
  ): Promise<void> {
    return _swapChapters(this.paths, novelId, chapterNumA, chapterNumB);
  }

  // ==================== 世界观管理（委托） ====================

  async getWorldEntries(novelId: string): Promise<WorldEntry[]> {
    return _getWorldEntries(this.paths, novelId);
  }

  async saveWorldEntry(novelId: string, entry: WorldEntry): Promise<void> {
    return _saveWorldEntry(this.paths, novelId, entry);
  }

  async deleteWorldEntry(novelId: string, entryId: string): Promise<void> {
    return _deleteWorldEntry(this.paths, novelId, entryId);
  }

  // ==================== 角色管理（委托） ====================

  async getCharacters(novelId: string): Promise<CharacterProfile[]> {
    return _getCharacters(this.paths, novelId);
  }

  async saveCharacter(novelId: string, character: CharacterProfile): Promise<void> {
    return _saveCharacter(this.paths, novelId, character);
  }

  async deleteCharacter(novelId: string, characterId: string): Promise<void> {
    return _deleteCharacter(this.paths, novelId, characterId);
  }

  async getPendingCharacterCandidates(novelId: string): Promise<PendingCharacterCandidate[]> {
    return _getPendingCharacterCandidates(this.paths, novelId);
  }

  async upsertPendingCharacterCandidates(
    novelId: string,
    chapterNumber: number,
    names: string[],
  ): Promise<PendingCharacterCandidate[]> {
    return _upsertPendingCharacterCandidates(this.paths, novelId, chapterNumber, names);
  }

  async markPendingCharacterCandidates(
    novelId: string,
    names: string[],
    status: PendingCharacterCandidate['status'],
  ): Promise<PendingCharacterCandidate[]> {
    return _markPendingCharacterCandidates(this.paths, novelId, names, status);
  }

  async removePendingCharacterCandidates(
    novelId: string,
    names?: string[],
  ): Promise<PendingCharacterCandidate[]> {
    return _removePendingCharacterCandidates(this.paths, novelId, names);
  }

  async getCharacterStateSnapshots(
    novelId: string,
    characterId?: string,
  ): Promise<CharacterStateSnapshot[]> {
    return _getCharacterStateSnapshots(this.paths, novelId, characterId);
  }

  async saveCharacterStateSnapshot(
    novelId: string,
    snapshot: CharacterStateSnapshot,
  ): Promise<void> {
    return _saveCharacterStateSnapshot(this.paths, novelId, snapshot);
  }

  // ==================== 大纲管理（委托） ====================

  async getOutline(novelId: string): Promise<OutlineData> {
    return _getOutline(this.paths, novelId);
  }

  async saveOutline(novelId: string, outline: OutlineData): Promise<void> {
    return _saveOutline(this.paths, novelId, outline);
  }

  // ==================== 章节版本历史（委托） ====================

  async getChapterVersions(novelId: string, chapterNumber: number): Promise<ChapterVersionHistory> {
    return _getChapterVersions(this.paths, novelId, chapterNumber);
  }

  async archiveChapterVersion(
    novelId: string,
    chapterNumber: number,
    source: VersionSource,
  ): Promise<void> {
    return _archiveChapterVersion(this.paths, novelId, chapterNumber, source);
  }

  async rollbackChapterToVersion(
    novelId: string,
    chapterNumber: number,
    targetVersion: number,
  ): Promise<Chapter> {
    return _rollbackChapterToVersion(this.paths, novelId, chapterNumber, targetVersion);
  }

  // ==================== 角色事件记忆链（委托） ====================

  async getCharacterEvents(
    novelId: string,
    characterId?: string,
    fromChapter?: number,
    toChapter?: number,
  ): Promise<CharacterEvent[]> {
    return _getCharacterEvents(this.paths, novelId, characterId, fromChapter, toChapter);
  }

  async appendCharacterEvents(novelId: string, newEvents: CharacterEvent[]): Promise<void> {
    return _appendCharacterEvents(this.paths, novelId, newEvents);
  }
  async getCharacterHighlights(
    novelId: string,
    characterId?: string,
  ): Promise<CharacterHighlightsEntry[]> {
    return _getCharacterHighlights(this.paths, novelId, characterId);
  }
  async appendCharacterHighlights(
    novelId: string,
    perChapter: PerCharacterHighlights[],
  ): Promise<void> {
    return _appendCharacterHighlights(this.paths, novelId, perChapter);
  }
  async getCharacterRelations(
    novelId: string,
    characterId?: string,
  ): Promise<CharacterRelationEntry[]> {
    return _getCharacterRelations(this.paths, novelId, characterId);
  }
  async appendCharacterRelations(
    novelId: string,
    pairs: RelationPair[],
  ): Promise<void> {
    return _appendCharacterRelations(this.paths, novelId, pairs);
  }

  // ==================== 章节事实快照（委托） ====================

  async getChapterFacts(novelId: string): Promise<Record<number, ChapterFact>> {
    return _getChapterFacts(this.paths, novelId);
  }

  async getChapterFact(novelId: string, chapterNumber: number): Promise<ChapterFact | null> {
    return _getChapterFact(this.paths, novelId, chapterNumber);
  }

  async saveChapterFact(novelId: string, chapterNumber: number, fact: ChapterFact): Promise<void> {
    return _saveChapterFact(this.paths, novelId, chapterNumber, fact);
  }

  // ==================== 节奏分析（委托） ====================

  async getPacing(novelId: string): Promise<ChapterPacing[]> {
    return _getPacing(this.paths, novelId);
  }

  async savePacing(novelId: string, pacing: ChapterPacing[]): Promise<void> {
    return _savePacing(this.paths, novelId, pacing);
  }

  // ==================== 情节线追踪快照（委托） ====================

  async getPlotThreadSnapshots(novelId: string): Promise<PlotThreadSnapshot[]> {
    return _getPlotThreadSnapshots(this.paths, novelId);
  }

  async savePlotThreadSnapshots(novelId: string, snapshots: PlotThreadSnapshot[]): Promise<void> {
    return _savePlotThreadSnapshots(this.paths, novelId, snapshots);
  }

  // ==================== 大纲偏离度（委托） ====================

  async getOutlineDeviations(novelId: string): Promise<OutlineDeviation[]> {
    return _getOutlineDeviations(this.paths, novelId);
  }

  async saveOutlineDeviation(novelId: string, deviation: OutlineDeviation): Promise<void> {
    return _saveOutlineDeviation(this.paths, novelId, deviation);
  }

  // ==================== 协作日志（委托） ====================

  async getCollaborationLogs(novelId: string): Promise<Record<number, CollaborationEntry[]>> {
    return _getCollaborationLogs(this.paths, novelId);
  }

  async saveCollaborationLog(novelId: string, chapterNumber: number, entries: CollaborationEntry[]): Promise<void> {
    return _saveCollaborationLog(this.paths, novelId, chapterNumber, entries);
  }

  // ==================== 风格 DNA（委托） ====================

  async getStyleDna(novelId: string): Promise<StyleDNA | null> {
    return _getStyleDna(this.paths, novelId);
  }

  async saveStyleDna(novelId: string, dna: StyleDNA): Promise<void> {
    return _saveStyleDna(this.paths, novelId, dna);
  }

  async deleteStyleDna(novelId: string): Promise<void> {
    return _deleteStyleDna(this.paths, novelId);
  }

  // ==================== 导出 ====================

  /** 去除说话人标记 (#角色名)，导出/发布时不保留 TTS 标注 */
  private static stripSpeakerMarkers(text: string): string {
    return text
      .replace(/[\(\uFF08]\s*[#\uFF03]\s*[^()\uFF08\uFF09\n]+?\s*[\)\uFF09]/g, '')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  /**
   * 导出小说为指定格式
   * 默认自动去除 (#角色名) 说话人标记
   */
  async exportNovel(novelId: string, format: 'markdown' | 'txt'): Promise<string> {
    const novel = await this.getNovel(novelId);
    const chapters = await this.listChapters(novelId);
    const parts: string[] = [];

    if (format === 'markdown') {
      parts.push(`# ${novel.title}\n`);
      if (novel.synopsis) {
        parts.push(`> ${novel.synopsis}\n`);
      }
      parts.push('');

      for (const chapterMeta of chapters) {
        const chapter = await this.getChapter(novelId, chapterMeta.chapterNumber);
        if (!chapter) continue;

        const title = chapter.title || `第${chapter.chapterNumber}章`;
        parts.push(`## ${title}\n`);
        parts.push(NovelManager.stripSpeakerMarkers(chapter.content));
        parts.push('');
      }
    } else {
      // txt 格式：纯文本
      parts.push(novel.title);
      if (novel.synopsis) {
        parts.push(novel.synopsis);
      }
      parts.push('');
      parts.push('='.repeat(40));
      parts.push('');

      for (const chapterMeta of chapters) {
        const chapter = await this.getChapter(novelId, chapterMeta.chapterNumber);
        if (!chapter) continue;

        const title = chapter.title || `第${chapter.chapterNumber}章`;
        parts.push(title);
        parts.push('-'.repeat(20));
        parts.push(NovelManager.stripSpeakerMarkers(chapter.content));
        parts.push('');
      }
    }

    return parts.join('\n');
  }

  // ==================== 分支（Fork） ====================

  /**
   * 从指定章节创建分支：复制小说数据，只保留 fromChapter 及之前的章节。
   */
  async forkNovel(
    novelId: string,
    fromChapter: number,
    newTitle?: string,
    ownerId?: string,
  ): Promise<NovelMetadata> {
    const source = await this.getNovel(novelId);
    const sourceChapters = await this.listChapters(novelId);

    if (fromChapter < 1) {
      throw new Error('分叉点章节号必须 >= 1');
    }
    if (!sourceChapters.some(ch => ch.chapterNumber <= fromChapter)) {
      throw new Error(`源小说在第 ${fromChapter} 章及之前没有任何章节`);
    }

    // 1. 创建新小说
    const newId = randomUUID();
    const timestamp = now();
    const title = newTitle || `${source.title} - 分支(从第${fromChapter}章)`;

    const newMeta: NovelMetadata = NovelMetadata.parse({
      ...source,
      id: newId,
      title,
      status: 'writing',
      ownerId: ownerId ?? source.ownerId ?? 'dev',
      modelConfig: undefined,
      chapterCount: undefined,
      finalizedChapterCount: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const newDir = this.paths.novelDir(newId);
    await fs.mkdir(path.join(newDir, 'chapters'), { recursive: true });

    // 2. 写入小说元数据
    await writeJson(this.paths.novelMetaPath(newId), newMeta);

    // 2.5 物理复制封面图片和角色头像文件（二进制资源，不能用 readJson/writeJson）
    const sourceDir = this.paths.novelDir(novelId);
    // 封面文件
    if (source.coverImage) {
      const sourceCoverPath = path.join(sourceDir, source.coverImage);
      try {
        await fs.copyFile(sourceCoverPath, path.join(newDir, source.coverImage));
      } catch {
        // 封面文件可能不存在（旧数据），忽略错误
      }
    }
    // 角色头像目录
    const sourcePortraitsDir = path.join(sourceDir, 'portraits');
    if (await pathExists(sourcePortraitsDir)) {
      const newPortraitsDir = path.join(newDir, 'portraits');
      await fs.mkdir(newPortraitsDir, { recursive: true });
      try {
        const portraitFiles = await fs.readdir(sourcePortraitsDir);
        await Promise.all(
          portraitFiles.map((file) =>
            fs.copyFile(path.join(sourcePortraitsDir, file), path.join(newPortraitsDir, file)),
          ),
        );
      } catch {
        // 头像目录读取失败时忽略
      }
    }

    // 3. 复制角色、世界观（完整复制，这些是小说级共享数据）
    const [characters, worldEntries] = await Promise.all([
      this.getCharacters(novelId),
      this.getWorldEntries(novelId),
    ]);
    await Promise.all([
      writeJson(this.paths.charactersPath(newId), characters),
      writeJson(this.paths.worldPath(newId), worldEntries),
    ]);

    // 4. 复制大纲，裁剪到 fromChapter
    const outline = await this.getOutline(novelId);
    const trimmedOutline: OutlineData = OutlineData.parse({
      chapters: outline.chapters.filter(ch => ch.chapterNumber <= fromChapter),
      plotThreads: outline.plotThreads,
      foreshadowing: outline.foreshadowing.map(f => ({
        ...f,
        // 分叉点之后的回收标记清除
        ...(f.resolvedInChapter && f.resolvedInChapter > fromChapter
          ? { resolvedInChapter: undefined, isResolved: false }
          : {}),
      })),
    });
    await writeJson(this.paths.outlinePath(newId), trimmedOutline);

    // 5. 复制章节（只复制 <= fromChapter 的）
    const chaptersToCopy = sourceChapters.filter(ch => ch.chapterNumber <= fromChapter);
    for (const chMeta of chaptersToCopy) {
      const chapter = await this.getChapter(novelId, chMeta.chapterNumber);
      if (!chapter) continue;
      await this.saveChapter(newId, { ...chapter, novelId: newId });

      // 复制版本历史
      const versionsPath = this.paths.chapterVersionsPath(novelId, chMeta.chapterNumber);
      if (await pathExists(versionsPath)) {
        const versions = await readJson(versionsPath, null);
        if (versions) {
          await writeJson(
            this.paths.chapterVersionsPath(newId, chMeta.chapterNumber),
            { ...versions as Record<string, unknown>, novelId: newId },
          );
        }
      }
    }

    // 6. 复制角色状态快照（裁剪到 fromChapter）
    const charStates = await this.getCharacterStateSnapshots(novelId);
    const trimmedStates = charStates.filter(s => s.chapterNumber <= fromChapter);
    await writeJson(this.paths.characterStatesPath(newId), trimmedStates);

    // 7. 复制角色事件（裁剪到 fromChapter，写入按章拆分目录）
    const charEvents = await this.getCharacterEvents(novelId, undefined, undefined, fromChapter);
    const eventsDir = this.paths.characterEventsDir(newId);
    await fs.mkdir(eventsDir, { recursive: true });
    const eventsByChapter = new Map<number, CharacterEvent[]>();
    for (const e of charEvents) {
      const list = eventsByChapter.get(e.chapterNumber) ?? [];
      list.push(e);
      eventsByChapter.set(e.chapterNumber, list);
    }
    const eventBatches = [...eventsByChapter.entries()];
    const EVT_BATCH = 20;
    for (let i = 0; i < eventBatches.length; i += EVT_BATCH) {
      const batch = eventBatches.slice(i, i + EVT_BATCH);
      await Promise.all(
        batch.map(([chNum, evts]) =>
          writeJson(this.paths.characterEventsFilePath(newId, chNum), evts),
        ),
      );
    }

    // 8. 复制章节事实（裁剪到 fromChapter，写入按章拆分目录）
    const facts = await this.getChapterFacts(novelId);
    const factsDir = this.paths.chapterFactsDir(newId);
    await fs.mkdir(factsDir, { recursive: true });
    const factEntries = Object.entries(facts)
      .filter(([key]) => Number(key) <= fromChapter);
    const FACT_BATCH = 20;
    for (let i = 0; i < factEntries.length; i += FACT_BATCH) {
      const batch = factEntries.slice(i, i + FACT_BATCH);
      await Promise.all(
        batch.map(([key, value]) =>
          writeJson(this.paths.chapterFactFilePath(newId, Number(key)), value),
        ),
      );
    }

    // 9. 复制节奏数据（裁剪到 fromChapter）
    const pacing = await this.getPacing(novelId);
    await writeJson(
      this.paths.pacingPath(newId),
      pacing.filter(p => p.chapterNumber <= fromChapter),
    );

    // 10. 复制情节线快照（裁剪到 fromChapter）
    const plotSnapshots = await this.getPlotThreadSnapshots(novelId);
    await writeJson(
      this.paths.plotThreadSnapshotsPath(newId),
      plotSnapshots.filter(s => s.chapterNumber <= fromChapter),
    );

    // 11. 复制大纲偏离度（裁剪到 fromChapter）
    const deviations = await this.getOutlineDeviations(novelId);
    await writeJson(
      this.paths.outlineDeviationsPath(newId),
      deviations.filter(d => d.chapterNumber <= fromChapter),
    );

    // 12. 复制协作日志（裁剪到 fromChapter）
    const collabLogs = await this.getCollaborationLogs(novelId);
    const trimmedLogs: Record<number, CollaborationEntry[]> = {};
    for (const [key, value] of Object.entries(collabLogs)) {
      const num = Number(key);
      if (num <= fromChapter) trimmedLogs[num] = value;
    }
    await writeJson(this.paths.collaborationLogPath(newId), trimmedLogs);

    // 13. 复制待审角色候选（保留 firstDetectedIn <= fromChapter 的）
    const pending = await this.getPendingCharacterCandidates(novelId);
    const trimmedPending = pending.filter(p => p.firstDetectedIn <= fromChapter);
    await writeJson(this.paths.pendingCharactersPath(newId), trimmedPending);

    // 注意：memory-lance（向量数据库）不复制，新分支首次生成时会自动重建索引

    // 14. 写入分叉溯源信息
    const forkedMeta: NovelMetadata = {
      ...newMeta,
      forkedFrom: {
        originalNovelId: source.id,
        originalTitle: source.title,
        chapter: fromChapter,
        forkedBy: ownerId ?? source.ownerId ?? 'dev',
      },
    };
    await writeJson(this.paths.novelMetaPath(newId), forkedMeta);

    return forkedMeta;
  }

  // ==================== 事实图谱（委托） ====================

  async getFactGraph(novelId: string): Promise<FactGraph> {
    return _getFactGraph(this.paths, novelId);
  }

  async saveFactGraph(novelId: string, graph: FactGraph): Promise<void> {
    return _saveFactGraph(this.paths, novelId, graph);
  }

  // ==================== 情节分支（委托） ====================

  async getPlotBranchTree(novelId: string): Promise<PlotBranchTree> {
    return _getPlotBranchTree(this.paths, novelId);
  }

  async savePlotBranchTree(novelId: string, tree: PlotBranchTree): Promise<void> {
    return _savePlotBranchTree(this.paths, novelId, tree);
  }

  // ==================== 费用数据（委托） ====================

  async getCostData(novelId: string): Promise<NovelCostData> {
    return _getCostData(this.paths, novelId);
  }

  async saveCostData(novelId: string, data: NovelCostData): Promise<void> {
    return _saveCostData(this.paths, novelId, data);
  }

  async appendChapterCost(novelId: string, chapterCost: ChapterCostSummary): Promise<void> {
    return _appendChapterCost(this.paths, novelId, chapterCost);
  }
}
