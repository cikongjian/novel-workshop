import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NovelManager } from '../novel/novel-manager.js';
import type { Chapter } from '../novel/types.js';
import { listChapterGenerationFailures } from './chapter-generation-failure-store.js';
import { recoverStaleChapterGenerationLock } from './chapter-generation-recovery-service.js';

const tempDirs: string[] = [];
const NOVEL_ID = '11111111-1111-4111-8111-111111111111';

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

async function createTempDataDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'generation-recovery-'));
  tempDirs.push(dir);
  return dir;
}

function lockDir(dataDir: string, novelId = NOVEL_ID): string {
  return path.join(dataDir, 'locks', 'chapter-generation', novelId);
}

async function writeLock(dataDir: string, params: {
  novelId?: string;
  chapterNumber: number;
  heartbeatAt: string;
}): Promise<void> {
  const novelId = params.novelId ?? NOVEL_ID;
  const dir = lockDir(dataDir, novelId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'owner.json'), JSON.stringify({
    novelId,
    chapterNumber: params.chapterNumber,
    runId: `test-${params.chapterNumber}`,
    pid: process.pid,
    host: os.hostname(),
    acquiredAt: params.heartbeatAt,
    heartbeatAt: params.heartbeatAt,
  }, null, 2), 'utf8');
}

function createNovelManagerStub(dataDir: string, existingChapter: Chapter | null = null): NovelManager {
  return {
    getDataDir: () => dataDir,
    getChapter: vi.fn().mockResolvedValue(existingChapter),
    saveChapter: vi.fn().mockResolvedValue(undefined),
  } as unknown as NovelManager;
}

describe('recoverStaleChapterGenerationLock', () => {
  it('clears a stale orphan lock and marks the chapter as retryable failed', async () => {
    const dataDir = await createTempDataDir();
    await writeLock(dataDir, {
      chapterNumber: 2,
      heartbeatAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    });
    const novelManager = createNovelManagerStub(dataDir);

    const result = await recoverStaleChapterGenerationLock({
      novelManager,
      novelId: NOVEL_ID,
      activeChapterNumbers: [],
    });

    expect(result.recovered).toBe(true);
    expect(result.reason).toBe('stale_lock_recovered');
    await expect(fs.access(lockDir(dataDir))).rejects.toThrow();
    const saveChapter = (novelManager as unknown as { saveChapter: ReturnType<typeof vi.fn> }).saveChapter;
    expect(saveChapter).not.toHaveBeenCalled();
    await expect(listChapterGenerationFailures(novelManager, NOVEL_ID)).resolves.toEqual([
      expect.objectContaining({
        chapterNumber: 2,
        errorCode: 'CHAPTER_STALE_GENERATION_LOCK',
        retryable: true,
      }),
    ]);
  });

  it('does not clear a lock while the chapter still has an active task', async () => {
    const dataDir = await createTempDataDir();
    await writeLock(dataDir, {
      chapterNumber: 3,
      heartbeatAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    });
    const novelManager = createNovelManagerStub(dataDir);

    const result = await recoverStaleChapterGenerationLock({
      novelManager,
      novelId: NOVEL_ID,
      activeChapterNumbers: [3],
    });

    expect(result.recovered).toBe(false);
    expect(result.reason).toBe('active_task');
    await expect(fs.access(lockDir(dataDir))).resolves.toBeUndefined();
    const saveChapter = (novelManager as unknown as { saveChapter: ReturnType<typeof vi.fn> }).saveChapter;
    expect(saveChapter).not.toHaveBeenCalled();
  });

  it('does not clear a fresh lock', async () => {
    const dataDir = await createTempDataDir();
    await writeLock(dataDir, {
      chapterNumber: 4,
      heartbeatAt: new Date().toISOString(),
    });
    const novelManager = createNovelManagerStub(dataDir);

    const result = await recoverStaleChapterGenerationLock({
      novelManager,
      novelId: NOVEL_ID,
      activeChapterNumbers: [],
    });

    expect(result.recovered).toBe(false);
    expect(result.reason).toBe('fresh_lock');
    await expect(fs.access(lockDir(dataDir))).resolves.toBeUndefined();
    const saveChapter = (novelManager as unknown as { saveChapter: ReturnType<typeof vi.fn> }).saveChapter;
    expect(saveChapter).not.toHaveBeenCalled();
  });
});
