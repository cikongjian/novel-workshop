import fs from 'node:fs/promises';
import path from 'node:path';
import { countWords, now } from '../utils/text.js';
import {
  Chapter,
  ChapterVersion,
  ChapterVersionHistory,
  type VersionSource,
} from './types.js';
import type { NovelPaths } from './novel-paths.js';
import { readJson, writeJson, readText, writeText, pathExists } from './fs-helpers.js';

/**
 * 章节摘要（用于列表展示）
 */
export type ChapterSummary = {
  chapterNumber: number;
  title: string;
  status: string;
  wordCount: number;
  summary?: string;
  readerScore?: number;
  diagnostics?: {
    startupOpening?: {
      overallScore: number;
      passed: boolean;
      findingsCount: number;
      platformProfile: 'auto' | 'fanqie' | 'qidian';
    };
    lengthGuard?: {
      triggered: boolean;
      usedFallbackTrim: boolean;
      finalWordCount: number;
    };
  };
  updatedAt?: string;
};

// ==================== 章节索引缓存 ====================

const CHAPTER_INDEX_TTL = 30_000; // 30s
const CHAPTER_INDEX_MAX_SIZE = 50;

const chapterIndexCache = new Map<string, { data: ChapterSummary[]; mtime: number }>();
/** in-flight 去重：缓存未命中时防止并发请求重复触发磁盘 I/O */
const chapterIndexInflight = new Map<string, Promise<ChapterSummary[]>>();

/** 使指定小说的章节索引缓存失效 */
export function invalidateChapterIndex(novelId: string): void {
  chapterIndexCache.delete(novelId);
}

// ==================== 章节 CRUD ====================

/**
 * 获取章节（正文 + 元数据）
 */
export async function getChapter(
  paths: NovelPaths,
  novelId: string,
  chapterNumber: number,
): Promise<Chapter | null> {
  const metaPath = paths.chapterMetaPath(novelId, chapterNumber);
  const contentPath = paths.chapterContentPath(novelId, chapterNumber);

  if (!(await pathExists(metaPath))) {
    return null;
  }

  const meta = await readJson<Record<string, unknown> | null>(metaPath, null);
  if (!meta) return null;

  const content = await readText(contentPath);

  return Chapter.parse({
    ...meta,
    content,
    wordCount: countWords(content),
  });
}

/**
 * 保存章节（正文和元数据分开存储）
 */
export async function saveChapter(
  paths: NovelPaths,
  novelId: string,
  chapter: Chapter,
): Promise<void> {
  // 确保章节目录存在
  await fs.mkdir(paths.chaptersDir(novelId), { recursive: true });

  const validated = Chapter.parse({
    ...chapter,
    wordCount: countWords(chapter.content),
    updatedAt: now(),
  });

  // 正文存为 .md
  await writeText(
    paths.chapterContentPath(novelId, validated.chapterNumber),
    validated.content,
  );

  // 元数据存为 .json（不含 content 字段，避免重复存储）
  const { content: _content, ...meta } = validated;
  await writeJson(
    paths.chapterMetaPath(novelId, validated.chapterNumber),
    meta,
  );

  invalidateChapterIndex(novelId);
}

/**
 * 列出小说的所有章节摘要（带内存缓存，避免 500 章时逐文件读取）
 */
export async function listChapters(
  paths: NovelPaths,
  novelId: string,
): Promise<ChapterSummary[]> {
  // 检查缓存
  const cached = chapterIndexCache.get(novelId);
  if (cached && (Date.now() - cached.mtime) < CHAPTER_INDEX_TTL) {
    return cached.data;
  }

  // in-flight 去重：缓存过期时 N 并发只触发 1 次磁盘读
  const inflight = chapterIndexInflight.get(novelId);
  if (inflight) return inflight;

  const loadPromise = _loadChaptersFromDisk(paths, novelId).finally(() => {
    chapterIndexInflight.delete(novelId);
  });
  chapterIndexInflight.set(novelId, loadPromise);
  return loadPromise;
}

async function _loadChaptersFromDisk(
  paths: NovelPaths,
  novelId: string,
): Promise<ChapterSummary[]> {
  const chapDir = paths.chaptersDir(novelId);
  if (!(await pathExists(chapDir))) {
    return [];
  }

  const files = await fs.readdir(chapDir);
  const jsonFiles = files
    // 仅保留章节元数据文件，如 001.json；排除 001-versions.json 等辅助文件
    .filter(f => /^\d+\.json$/.test(f))
    .sort();

  // 并行读取所有元数据文件（比串行快 5-10 倍）
  const BATCH_SIZE = 50;
  const chapters: ChapterSummary[] = [];

  for (let i = 0; i < jsonFiles.length; i += BATCH_SIZE) {
    const batch = jsonFiles.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(file =>
        readJson<Record<string, unknown>>(path.join(chapDir, file), {}),
      ),
    );
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const meta = result.value;
      if (meta.chapterNumber !== undefined) {
        const diagnosticsRaw = meta.diagnostics as Record<string, unknown> | undefined;
        const startupOpeningRaw = diagnosticsRaw?.startupOpeningReport as Record<string, unknown> | undefined;
        const lengthGuardRaw = diagnosticsRaw?.chapterLengthGuard as Record<string, unknown> | undefined;
        chapters.push({
          chapterNumber: meta.chapterNumber as number,
          title: (meta.title as string) ?? '',
          status: (meta.status as string) ?? 'outlined',
          wordCount: (meta.wordCount as number) ?? 0,
          summary: (meta.summary as string) ?? '',
          readerScore: meta.readerScore as number | undefined,
          diagnostics: startupOpeningRaw || lengthGuardRaw
            ? {
                startupOpening: startupOpeningRaw
                  ? {
                      overallScore: Number(startupOpeningRaw.overallScore ?? 0),
                      passed: startupOpeningRaw.passed !== false,
                      findingsCount: Array.isArray(startupOpeningRaw.findings) ? startupOpeningRaw.findings.length : 0,
                      platformProfile: (startupOpeningRaw.platformProfile as 'auto' | 'fanqie' | 'qidian') ?? 'auto',
                    }
                  : undefined,
                lengthGuard: lengthGuardRaw
                  ? {
                      triggered: lengthGuardRaw.triggered === true,
                      usedFallbackTrim: lengthGuardRaw.usedFallbackTrim === true,
                      finalWordCount: Number(lengthGuardRaw.finalWordCount ?? 0),
                    }
                  : undefined,
              }
            : undefined,
          updatedAt: (meta.updatedAt as string) ?? '',
        });
      }
    }
  }

  chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);

  // 写入缓存
  chapterIndexCache.set(novelId, { data: chapters, mtime: Date.now() });

  // LRU 淘汰：超出上限时移除最久未访问的条目
  if (chapterIndexCache.size > CHAPTER_INDEX_MAX_SIZE) {
    let oldestKey = '';
    let oldestMtime = Infinity;
    for (const [key, entry] of chapterIndexCache) {
      if (entry.mtime < oldestMtime) {
        oldestMtime = entry.mtime;
        oldestKey = key;
      }
    }
    if (oldestKey) chapterIndexCache.delete(oldestKey);
  }

  return chapters;
}

/**
 * 删除章节（正文 + 元数据）
 */
export async function deleteChapter(
  paths: NovelPaths,
  novelId: string,
  chapterNumber: number,
): Promise<void> {
  const metaPath = paths.chapterMetaPath(novelId, chapterNumber);
  const contentPath = paths.chapterContentPath(novelId, chapterNumber);

  if (!(await pathExists(metaPath))) {
    throw new Error(`第 ${chapterNumber} 章不存在`);
  }

  // 删除前归档到版本历史，防止误删无法恢复
  await archiveChapterVersion(paths, novelId, chapterNumber, 'delete').catch(() => {});

  await Promise.all([
    fs.unlink(metaPath).catch(() => {}),
    fs.unlink(contentPath).catch(() => {}),
  ]);

  invalidateChapterIndex(novelId);
}

/**
 * 交换两个章节的编号（用于调整顺序）
 */
export async function swapChapters(
  paths: NovelPaths,
  novelId: string,
  chapterNumA: number,
  chapterNumB: number,
): Promise<void> {
  if (chapterNumA === chapterNumB) return;

  const chapterA = await getChapter(paths, novelId, chapterNumA);
  const chapterB = await getChapter(paths, novelId, chapterNumB);

  if (!chapterA) throw new Error(`第 ${chapterNumA} 章不存在`);
  if (!chapterB) throw new Error(`第 ${chapterNumB} 章不存在`);

  // 删除原文件
  await Promise.all([
    deleteChapter(paths, novelId, chapterNumA),
    deleteChapter(paths, novelId, chapterNumB),
  ]);

  // 以交换后的编号重新保存
  await Promise.all([
    saveChapter(paths, novelId, { ...chapterA, chapterNumber: chapterNumB }),
    saveChapter(paths, novelId, { ...chapterB, chapterNumber: chapterNumA }),
  ]);
}

// ==================== 版本历史 ====================

/**
 * 获取章节版本历史
 */
export async function getChapterVersions(
  paths: NovelPaths,
  novelId: string,
  chapterNumber: number,
): Promise<ChapterVersionHistory> {
  const raw = await readJson(
    paths.chapterVersionsPath(novelId, chapterNumber),
    { novelId, chapterNumber, versions: [], maxVersions: 20 },
  );
  return ChapterVersionHistory.parse(raw);
}

/**
 * 归档当前章节版本（在覆盖保存前调用）
 */
export async function archiveChapterVersion(
  paths: NovelPaths,
  novelId: string,
  chapterNumber: number,
  source: VersionSource,
): Promise<void> {
  const chapter = await getChapter(paths, novelId, chapterNumber);
  if (!chapter || !chapter.content.trim()) return;

  const history = await getChapterVersions(paths, novelId, chapterNumber);
  const nextVersion = history.versions.length > 0
    ? Math.max(...history.versions.map(v => v.version)) + 1
    : 1;

  const versionEntry: ChapterVersion = {
    version: nextVersion,
    content: chapter.content,
    title: chapter.title,
    wordCount: chapter.wordCount,
    status: chapter.status,
    readerScore: chapter.readerScore,
    revisionCount: chapter.revisionCount,
    source,
    createdAt: now(),
  };

  history.versions.push(versionEntry);

  while (history.versions.length > history.maxVersions) {
    history.versions.shift();
  }

  await writeJson(paths.chapterVersionsPath(novelId, chapterNumber), history);
}

/**
 * 回滚章节到指定版本
 */
export async function rollbackChapterToVersion(
  paths: NovelPaths,
  novelId: string,
  chapterNumber: number,
  targetVersion: number,
): Promise<Chapter> {
  const history = await getChapterVersions(paths, novelId, chapterNumber);
  const versionEntry = history.versions.find(v => v.version === targetVersion);
  if (!versionEntry) {
    throw new Error(`版本 ${targetVersion} 不存在`);
  }

  // 先归档当前版本
  await archiveChapterVersion(paths, novelId, chapterNumber, 'rollback');

  const chapter = await getChapter(paths, novelId, chapterNumber);
  if (!chapter) throw new Error(`第 ${chapterNumber} 章不存在`);

  const restored: Chapter = {
    ...chapter,
    content: versionEntry.content,
    title: versionEntry.title,
    wordCount: versionEntry.wordCount,
    status: versionEntry.status,
    readerScore: versionEntry.readerScore,
    revisionCount: chapter.revisionCount,
    updatedAt: now(),
  };

  await saveChapter(paths, novelId, restored);
  return restored;
}
