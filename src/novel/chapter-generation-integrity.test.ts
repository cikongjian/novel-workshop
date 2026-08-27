import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listChapterGenerationFailures } from '../services/chapter-generation-failure-store.js';
import {
  auditChapterGenerationIntegrity,
  ChapterGenerationRepairActiveError,
  ChapterGenerationRepairPlanConflictError,
  repairChapterGenerationIntegrity,
} from './chapter-generation-integrity.js';
import { NovelManager } from './novel-manager.js';
import { NovelPaths } from './novel-paths.js';
import type { Chapter } from './types.js';
import { NovelGenerationLock } from '../pipeline/novel-generation-lock.js';

const roots: string[] = [];

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chapter-integrity-'));
  roots.push(root);
  const manager = new NovelManager(path.join(root, 'novels'));
  const novel = await manager.createNovel({ title: '空章修复测试', genre: 'modern' });
  const timestamp = new Date().toISOString();
  const placeholder: Chapter = {
    novelId: novel.id,
    chapterNumber: 1,
    title: '',
    summary: '',
    content: '',
    wordCount: 0,
    status: 'outlined',
    agentComments: [],
    revisionCount: 0,
    diagnostics: {
      generationLifecycle: {
        mode: 'observe',
        phase: 'failed',
        chapterStatus: 'outlined',
        warnings: [],
        errorCode: 'CHAPTER_GENERATION_TIMEOUT',
        errorMessage: '余额不足或网络中断',
        retryable: true,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const manualEmpty: Chapter = {
    ...placeholder,
    chapterNumber: 2,
    title: '作者预留章节',
    diagnostics: undefined,
  };
  await manager.saveChapter(novel.id, placeholder);
  await manager.saveChapter(novel.id, manualEmpty);
  return { manager, novel };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('chapter generation integrity repair', () => {
  it('only classifies strict failed placeholders as repairable', async () => {
    const { manager, novel } = await createFixture();
    const report = await auditChapterGenerationIntegrity(manager, novel.id);

    expect(report.summary).toMatchObject({
      emptyChapterCount: 2,
      repairablePlaceholderCount: 1,
      suspiciousEmptyChapterCount: 1,
    });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ chapterNumber: 1, code: 'failed_empty_placeholder', repairable: true }),
      expect.objectContaining({ chapterNumber: 2, code: 'empty_chapter', repairable: false }),
    ]));
    expect(report.planToken).toMatch(/^[a-f0-9]{64}$/u);
  }, 15_000);

  it('detects an empty content file even when metadata still reports words', async () => {
    const { manager, novel } = await createFixture();
    const timestamp = new Date().toISOString();
    await manager.saveChapter(novel.id, {
      novelId: novel.id,
      chapterNumber: 3,
      title: '写入中断章节',
      summary: '',
      content: '这段正文写入后，正文文件被模拟截断。',
      wordCount: 18,
      status: 'edited',
      agentComments: [],
      revisionCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const paths = new NovelPaths(manager.getDataDir());
    await fs.writeFile(paths.chapterContentPath(novel.id, 3), '', 'utf8');

    const report = await auditChapterGenerationIntegrity(manager, novel.id);

    expect(report.issues).toContainEqual(expect.objectContaining({
      chapterNumber: 3,
      code: 'empty_chapter',
      repairable: false,
    }));
  });

  it('backs up, removes the placeholder and preserves its failure reason outside chapters', async () => {
    const { manager, novel } = await createFixture();
    const preview = await repairChapterGenerationIntegrity({
      novelManager: manager,
      novelId: novel.id,
    });
    const createBackup = vi.fn(async () => ({
      id: 'backup-empty',
      novelId: novel.id,
      filename: 'backup-empty.tar.gz',
      size: 256,
      createdAt: new Date().toISOString(),
    }));

    const result = await repairChapterGenerationIntegrity({
      novelManager: manager,
      novelId: novel.id,
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: { createBackup },
    });

    expect(createBackup).toHaveBeenCalledOnce();
    expect(result.deletedChapterNumbers).toEqual([1]);
    expect(await manager.getChapter(novel.id, 1)).toBeNull();
    expect(await manager.getChapter(novel.id, 2)).not.toBeNull();
    expect(await listChapterGenerationFailures(manager, novel.id)).toEqual([
      expect.objectContaining({ chapterNumber: 1, errorCode: 'CHAPTER_GENERATION_TIMEOUT' }),
    ]);
    expect((await manager.getNovel(novel.id)).chapterCount).toBe(1);
  }, 15_000);

  it('rejects a stale repair plan before backup or deletion', async () => {
    const { manager, novel } = await createFixture();
    const preview = await auditChapterGenerationIntegrity(manager, novel.id);
    const placeholder = await manager.getChapter(novel.id, 1);
    if (!placeholder) throw new Error('placeholder fixture missing');
    await manager.saveChapter(novel.id, { ...placeholder, title: '预览后被修改' });
    const createBackup = vi.fn();

    await expect(repairChapterGenerationIntegrity({
      novelManager: manager,
      novelId: novel.id,
      apply: true,
      expectedPlanToken: preview.planToken,
      backupManager: { createBackup },
    })).rejects.toBeInstanceOf(ChapterGenerationRepairPlanConflictError);
    expect(createBackup).not.toHaveBeenCalled();
    expect(await manager.getChapter(novel.id, 1)).not.toBeNull();
  });

  it('refuses repair while the novel generation lock is active', async () => {
    const { manager, novel } = await createFixture();
    const preview = await auditChapterGenerationIntegrity(manager, novel.id);
    const generationLock = new NovelGenerationLock(manager.getDataDir());
    const release = await generationLock.acquire({
      novelId: novel.id,
      chapterNumber: 1,
      runId: 'active-generation-test',
    });
    const createBackup = vi.fn();

    try {
      await expect(repairChapterGenerationIntegrity({
        novelManager: manager,
        novelId: novel.id,
        apply: true,
        expectedPlanToken: preview.planToken,
        backupManager: { createBackup },
      })).rejects.toBeInstanceOf(ChapterGenerationRepairActiveError);
      expect(createBackup).not.toHaveBeenCalled();
    } finally {
      await release();
    }
  }, 10_000);
});
