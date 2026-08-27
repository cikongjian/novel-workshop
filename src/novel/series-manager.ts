import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BookBlueprint, SeriesMetadata, SeriesNovelRef } from './story-state-types.js';

const SERIES_DIR = 'series';
const SERIES_META_FILE = 'series.json';

/**
 * 系列作品管理器
 * 管理多本小说组成的系列（如三体三部曲、指环王系列）
 * 数据存储在 data/series/{seriesId}/series.json
 */
export class SeriesManager {
  constructor(private readonly dataDir: string) {}

  private seriesDir(seriesId: string): string {
    return path.join(this.dataDir, SERIES_DIR, seriesId);
  }

  private seriesMetaPath(seriesId: string): string {
    return path.join(this.seriesDir(seriesId), SERIES_META_FILE);
  }

  async createSeries(params: {
    title: string;
    description?: string;
    genre?: string;
    masterPlan?: string;
    ownerId?: string;
  }): Promise<SeriesMetadata> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const series: SeriesMetadata = {
      id,
      ownerId: params.ownerId,
      title: params.title,
      description: params.description ?? '',
      genre: params.genre ?? '',
      masterPlan: params.masterPlan ?? '',
      blueprint: {
        books: [],
        sharedWorldRules: '',
        overarchingTheme: '',
        timelineOverview: '',
      },
      novels: [],
      legacy: {
        persistentCharacters: [],
        worldEvolution: [],
        seriesForeshadowing: [],
        thematicProgression: '',
      },
      createdAt: now,
      updatedAt: now,
    };
    await this.writeSeries(series);
    return series;
  }

  async getSeries(seriesId: string): Promise<SeriesMetadata | null> {
    try {
      const raw = await fs.readFile(this.seriesMetaPath(seriesId), 'utf-8');
      const parsed = JSON.parse(raw) as SeriesMetadata;
      return this.normalizeAndPersistSeries(parsed);
    } catch {
      return null;
    }
  }

  async listSeries(): Promise<SeriesMetadata[]> {
    const baseDir = path.join(this.dataDir, SERIES_DIR);
    try {
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      const results: SeriesMetadata[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const series = await this.getSeries(entry.name);
          if (series) results.push(series);
        }
      }
      return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  async updateSeries(seriesId: string, updates: Partial<Pick<SeriesMetadata, 'title' | 'description' | 'genre' | 'masterPlan' | 'blueprint'>>): Promise<SeriesMetadata | null> {
    const series = await this.getSeries(seriesId);
    if (!series) return null;

    // 深度合并更新，特别处理 blueprint 嵌套对象
    if (updates.blueprint) {
      series.blueprint = updates.blueprint;
    }
    if (updates.title !== undefined) series.title = updates.title;
    if (updates.description !== undefined) series.description = updates.description;
    if (updates.genre !== undefined) series.genre = updates.genre;
    if (updates.masterPlan !== undefined) series.masterPlan = updates.masterPlan;

    series.updatedAt = new Date().toISOString();
    return this.writeSeries(series);
  }

  async deleteSeries(seriesId: string): Promise<boolean> {
    try {
      await fs.rm(this.seriesDir(seriesId), { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  /** 将小说添加到系列 */
  async addNovel(seriesId: string, ref: Omit<SeriesNovelRef, 'order'>): Promise<SeriesMetadata | null> {
    const series = await this.getSeries(seriesId);
    if (!series) return null;

    const existing = series.novels.find(n => n.novelId === ref.novelId);
    if (existing) {
      existing.title = ref.title;
      existing.timelineSpan = ref.timelineSpan;
      existing.legacy = ref.legacy;
      existing.status = ref.status;
    } else {
      const maxOrder = series.novels.reduce((max, n) => Math.max(max, n.order), 0);
      series.novels.push({ ...ref, order: maxOrder + 1 });
    }

    series.updatedAt = new Date().toISOString();
    return this.writeSeries(series);
  }

  async updateNovelRef(
    seriesId: string,
    novelId: string,
    updates: Partial<Pick<SeriesNovelRef, 'title' | 'timelineSpan' | 'legacy' | 'status' | 'order'>>,
  ): Promise<SeriesMetadata | null> {
    const series = await this.getSeries(seriesId);
    if (!series) return null;

    const existing = series.novels.find(n => n.novelId === novelId);
    if (!existing) return null;

    if (updates.title !== undefined) existing.title = updates.title;
    if (updates.timelineSpan !== undefined) existing.timelineSpan = updates.timelineSpan;
    if (updates.legacy !== undefined) existing.legacy = updates.legacy;
    if (updates.status !== undefined) existing.status = updates.status;
    if (updates.order !== undefined && Number.isFinite(updates.order)) {
      const others = series.novels
        .filter(n => n.novelId !== novelId)
        .sort((a, b) => a.order - b.order);
      const safeOrder = Math.max(1, Math.min(Math.floor(updates.order), others.length + 1));
      const reordered = [...others];
      reordered.splice(safeOrder - 1, 0, existing);
      reordered.forEach((novel, index) => {
        novel.order = index + 1;
      });
      series.novels = reordered;
    }

    series.updatedAt = new Date().toISOString();
    return this.writeSeries(series);
  }

  /** 从系列中移除小说 */
  async removeNovel(seriesId: string, novelId: string): Promise<SeriesMetadata | null> {
    const series = await this.getSeries(seriesId);
    if (!series) return null;
    series.novels = series.novels.filter(n => n.novelId !== novelId);
    // 重新排序
    series.novels.sort((a, b) => a.order - b.order);
    series.novels.forEach((n, i) => { n.order = i + 1; });
    series.updatedAt = new Date().toISOString();
    return this.writeSeries(series);
  }

  /** 查找某本小说所属的系列 */
  async findSeriesByNovel(novelId: string): Promise<SeriesMetadata | null> {
    const allSeries = await this.listSeries();
    return allSeries.find(s => s.novels.some(n => n.novelId === novelId)) ?? null;
  }

  /**
   * 构建系列上下文（注入到新书的 Writer）
   * 包含前几本书的遗产信息 + 蓝图指令
   */
  buildSeriesContext(series: SeriesMetadata, currentNovelId: string): string {
    const currentNovel = series.novels.find(n => n.novelId === currentNovelId);
    if (!currentNovel) return '';

    const prevNovels = series.novels
      .filter(n => n.order < currentNovel.order && n.status === 'completed')
      .sort((a, b) => a.order - b.order);

    const hasBlueprint = series.blueprint && series.blueprint.books.length > 0;
    if (prevNovels.length === 0 && !series.masterPlan && !hasBlueprint) return '';

    const parts: string[] = ['## 📚 系列作品上下文\n'];

    parts.push(`系列名：${series.title}`);
    if (series.masterPlan) {
      parts.push(`总体构想：${series.masterPlan}`);
    }
    parts.push(`本书是系列第 ${currentNovel.order} 部\n`);

    // 蓝图注入
    if (hasBlueprint) {
      const bp = series.blueprint;
      const currentBook = bp.books.find(b => b.novelId === currentNovel.novelId)
        ?? bp.books.find(b => b.bookOrder === currentNovel.order);

      if (bp.overarchingTheme) {
        parts.push(`### 🎯 系列总主题\n${bp.overarchingTheme}\n`);
      }

      if (bp.sharedWorldRules) {
        parts.push(`### 🌍 共享世界规则\n${bp.sharedWorldRules}\n`);
      }

      if (bp.timelineOverview) {
        parts.push(`### ⏱️ 时间线概览\n${bp.timelineOverview}\n`);
      }

      if (currentBook) {
        parts.push('### 📖 本书蓝图定位');
        parts.push(`- 主角：${currentBook.protagonist}`);
        if (currentBook.origin) parts.push(`- 本源：${currentBook.origin}`);
        if (currentBook.positioning) parts.push(`- 定位：${currentBook.positioning}`);
        if (currentBook.fate) parts.push(`- 宿命：${currentBook.fate}`);
        if (currentBook.keyThemes.length > 0) {
          parts.push(`- 关键主题：${currentBook.keyThemes.join('、')}`);
        }
        if (currentBook.notes) parts.push(`- 备注：${currentBook.notes}`);
        parts.push('');

        if (currentBook.crossRefs.length > 0) {
          parts.push('### 🔗 跨书伏笔指令（请在本书中自然埋下）');
          for (const ref of currentBook.crossRefs) {
            const targetBook = bp.books.find(b => b.bookOrder === ref.targetBook);
            const targetTitle = targetBook?.title || `第${ref.targetBook}部`;
            parts.push(`- 为《${targetTitle}》（主角：${ref.targetProtagonist}）埋伏笔`);
            parts.push(`  关系：${ref.relationship}`);
            if (ref.foreshadowingHint) {
              parts.push(`  提示：${ref.foreshadowingHint}`);
            }
          }
          parts.push('');
        }
      }

      // 其他书概览（让 AI 知道全局）
      const otherBooks = bp.books.filter(b => b.bookOrder !== currentNovel.order);
      if (otherBooks.length > 0) {
        parts.push('### 📚 系列其他书概览');
        for (const book of otherBooks.sort((a, b) => a.bookOrder - b.bookOrder)) {
          parts.push(`- 第${book.bookOrder}部${book.title ? `《${book.title}》` : ''}：主角 ${book.protagonist}${book.positioning ? `，${book.positioning}` : ''}`);
        }
        parts.push('');
      }
    }

    if (prevNovels.length > 0) {
      parts.push('### 前作概要');
      for (const n of prevNovels) {
        parts.push(`- 第${n.order}部《${n.title}》${n.timelineSpan ? `（${n.timelineSpan}）` : ''}`);
        if (n.legacy.length > 0) {
          for (const l of n.legacy) parts.push(`  - ${l}`);
        }
      }
      parts.push('');
    }

    const leg = series.legacy;
    if (leg.persistentCharacters.length > 0) {
      parts.push('### 跨书角色');
      for (const c of leg.persistentCharacters) {
        parts.push(`- ${c.name}：${c.roleAcrossBooks}${c.lastKnownState ? `（最后状态：${c.lastKnownState}）` : ''}`);
      }
      parts.push('');
    }

    if (leg.worldEvolution.length > 0) {
      parts.push('### 世界观演变');
      for (const w of leg.worldEvolution) {
        parts.push(`- ${w.aspect}：${w.evolution}`);
      }
      parts.push('');
    }

    const unresolvedSeries = leg.seriesForeshadowing.filter(f => !f.resolved);
    if (unresolvedSeries.length > 0) {
      parts.push('### 系列级伏笔（跨书悬念）');
      for (const f of unresolvedSeries) {
        parts.push(`- 第${f.plantedInBook}部埋下：${f.hint}`);
      }
      parts.push('');
    }

    if (leg.thematicProgression) {
      parts.push(`### 主题演变\n${leg.thematicProgression}`);
    }

    return parts.join('\n');
  }

  private createEmptyBookBlueprint(ref: Pick<SeriesNovelRef, 'novelId' | 'order' | 'title'>): BookBlueprint {
    return {
      bookOrder: ref.order,
      novelId: ref.novelId,
      title: ref.title,
      protagonist: '',
      origin: '',
      positioning: '',
      fate: '',
      crossRefs: [],
      keyThemes: [],
      notes: '',
    };
  }

  private normalizeSeries(series: SeriesMetadata): SeriesMetadata {
    const next: SeriesMetadata = JSON.parse(JSON.stringify(series)) as SeriesMetadata;
    next.blueprint = next.blueprint ?? {
      books: [],
      sharedWorldRules: '',
      overarchingTheme: '',
      timelineOverview: '',
    };
    next.novels = [...(next.novels ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((novel, index) => ({
        ...novel,
        order: index + 1,
        timelineSpan: novel.timelineSpan ?? '',
        legacy: Array.isArray(novel.legacy) ? novel.legacy : [],
      }));

    const novelsById = new Map(next.novels.map((novel) => [novel.novelId, novel]));
    const linkedNovelIds = new Set<string>();
    const normalizedBooks: BookBlueprint[] = [];

    for (const rawBook of next.blueprint.books ?? []) {
      const partialBook = rawBook as Partial<BookBlueprint>;
      const book: BookBlueprint = {
        bookOrder: partialBook.bookOrder ?? 1,
        novelId: partialBook.novelId ?? '',
        title: partialBook.title ?? '',
        protagonist: partialBook.protagonist ?? '',
        origin: partialBook.origin ?? '',
        positioning: partialBook.positioning ?? '',
        fate: partialBook.fate ?? '',
        crossRefs: Array.isArray(partialBook.crossRefs) ? partialBook.crossRefs : [],
        keyThemes: Array.isArray(partialBook.keyThemes) ? partialBook.keyThemes : [],
        notes: partialBook.notes ?? '',
      };

      if (book.novelId) {
        const linkedNovel = novelsById.get(book.novelId);
        if (!linkedNovel) {
          continue;
        }
        linkedNovelIds.add(linkedNovel.novelId);
        normalizedBooks.push({
          ...book,
          novelId: linkedNovel.novelId,
          bookOrder: linkedNovel.order,
          title: linkedNovel.title,
        });
        continue;
      }

      normalizedBooks.push(book);
    }

    for (const novel of next.novels) {
      if (linkedNovelIds.has(novel.novelId)) continue;

      const looseIndex = normalizedBooks.findIndex((book) => !book.novelId && book.bookOrder === novel.order);
      if (looseIndex >= 0) {
        normalizedBooks[looseIndex] = {
          ...normalizedBooks[looseIndex],
          novelId: novel.novelId,
          bookOrder: novel.order,
          title: novel.title,
        };
        continue;
      }

      normalizedBooks.push(this.createEmptyBookBlueprint(novel));
    }

    next.blueprint.books = normalizedBooks.sort((a, b) => a.bookOrder - b.bookOrder);
    return next;
  }

  private async normalizeAndPersistSeries(series: SeriesMetadata): Promise<SeriesMetadata> {
    const normalized = this.normalizeSeries(series);
    const before = JSON.stringify(series);
    const after = JSON.stringify(normalized);
    if (before !== after) {
      await this.writeSeries(normalized);
    }
    return normalized;
  }

  private async writeSeries(series: SeriesMetadata): Promise<SeriesMetadata> {
    const normalized = this.normalizeSeries(series);
    const dir = this.seriesDir(series.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.seriesMetaPath(series.id), JSON.stringify(normalized, null, 2), 'utf-8');
    return normalized;
  }
}
