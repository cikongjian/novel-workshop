import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { NovelManager } from '../novel/novel-manager.js';
import type { Chapter } from '../novel/types.js';
import { recordChapterGenerationFailure } from './chapter-generation-failure-store.js';
import {
  resolveChapterGenerationStatus,
  type BufferedGenerationStatus,
} from './chapter-generation-status-service.js';

const tempDirs: string[] = [];
const NOVEL_ID = '11111111-1111-4111-8111-111111111111';

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

function emptyStatus(overrides: Partial<BufferedGenerationStatus> = {}): BufferedGenerationStatus {
  return {
    isGenerating: false,
    chapterNumber: null,
    activeAgents: [],
    agentStatuses: {},
    writingAssistantOutput: '',
    lastCompletedChapter: null,
    lastCompletedAt: null,
    lastFailedChapter: null,
    lastFailedAt: null,
    lastFailureMessage: '',
    metadataUpdatedAt: null,
    ...overrides,
  };
}

async function createTempDataDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'generation-status-'));
  tempDirs.push(dir);
  return dir;
}

function createNovelManagerStub(params: {
  dataDir: string;
  chapters?: Array<{ chapterNumber: number; wordCount: number; title?: string; updatedAt?: string }>;
  chapterRecords?: Map<number, Chapter | null>;
}): NovelManager {
  return {
    getDataDir: () => params.dataDir,
    listChapters: async () => params.chapters ?? [],
    getChapter: async (_novelId: string, chapterNumber: number) => params.chapterRecords?.get(chapterNumber) ?? null,
  } as unknown as NovelManager;
}

async function writeLock(dataDir: string, params: {
  novelId?: string;
  chapterNumber: number;
  heartbeatAt: string;
}): Promise<void> {
  const novelId = params.novelId ?? NOVEL_ID;
  const lockDir = path.join(dataDir, 'locks', 'chapter-generation', novelId);
  await fs.mkdir(lockDir, { recursive: true });
  await fs.writeFile(path.join(lockDir, 'owner.json'), JSON.stringify({
    novelId,
    chapterNumber: params.chapterNumber,
    runId: `test-${params.chapterNumber}`,
    pid: process.pid,
    host: os.hostname(),
    acquiredAt: params.heartbeatAt,
    heartbeatAt: params.heartbeatAt,
  }, null, 2), 'utf8');
}

describe('resolveChapterGenerationStatus', () => {
  it('trusts persisted chapter files over buffered completed chapter numbers', async () => {
    const dataDir = await createTempDataDir();
    const novelManager = createNovelManagerStub({
      dataDir,
      chapters: [
        { chapterNumber: 1, wordCount: 1200, title: '第一章' },
      ],
    });

    const status = await resolveChapterGenerationStatus({
      novelManager,
      novelId: NOVEL_ID,
      bufferedStatus: emptyStatus({
        lastCompletedChapter: 2,
        lastCompletedAt: Date.now(),
      }),
      activeChapterNumbers: [],
    });

    expect(status.lastCompletedChapter).toBe(1);
    expect(status.persistedLastCompletedChapter).toBe(1);
    expect(status.statusWarnings.join('\n')).toContain('状态缓冲报告第 2 章已完成');
  });

  it('reports a fresh orphan lock as still generating', async () => {
    const dataDir = await createTempDataDir();
    await writeLock(dataDir, {
      chapterNumber: 2,
      heartbeatAt: new Date().toISOString(),
    });
    const novelManager = createNovelManagerStub({
      dataDir,
      chapters: [
        { chapterNumber: 1, wordCount: 1200, title: '第一章' },
      ],
    });

    const status = await resolveChapterGenerationStatus({
      novelManager,
      novelId: NOVEL_ID,
      bufferedStatus: emptyStatus(),
      activeChapterNumbers: [],
    });

    expect(status.source).toBe('lock');
    expect(status.isGenerating).toBe(true);
    expect(status.chapterNumber).toBe(2);
    expect(status.lastCompletedChapter).toBe(1);
    expect(status.agentStatuses['writing-assistant']).toBe('active');
  });

  it('reports a stale orphan lock as a retryable failure instead of idle', async () => {
    const dataDir = await createTempDataDir();
    await writeLock(dataDir, {
      chapterNumber: 3,
      heartbeatAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    });
    const novelManager = createNovelManagerStub({
      dataDir,
      chapters: [
        { chapterNumber: 1, wordCount: 1200, title: '第一章' },
        { chapterNumber: 2, wordCount: 1300, title: '第二章' },
      ],
    });

    const status = await resolveChapterGenerationStatus({
      novelManager,
      novelId: NOVEL_ID,
      bufferedStatus: emptyStatus(),
      activeChapterNumbers: [],
    });

    expect(status.source).toBe('lock');
    expect(status.isGenerating).toBe(false);
    expect(status.lastCompletedChapter).toBe(2);
    expect(status.lastFailedChapter).toBe(3);
    expect(status.lastFailureMessage).toContain('失去心跳');
    expect(status.lock?.stale).toBe(true);
  });

  it('recovers failed chapter state from persisted chapter diagnostics after buffer loss', async () => {
    const dataDir = await createTempDataDir();
    const failedAt = new Date().toISOString();
    const failedChapter = {
      novelId: NOVEL_ID,
      chapterNumber: 1,
      title: '',
      content: '',
      wordCount: 0,
      status: 'outlined',
      summary: '',
      agentComments: [],
      revisionCount: 0,
      createdAt: failedAt,
      updatedAt: failedAt,
      diagnostics: {
        generationLifecycle: {
          mode: 'observe',
          phase: 'failed',
          chapterStatus: 'outlined',
          warnings: ['chapter generation failed before final result was saved'],
          errorCode: 'timeout',
          errorMessage: '生成超时',
          retryable: true,
          updatedAt: failedAt,
        },
        updatedAt: failedAt,
      },
    } as Chapter;
    const novelManager = createNovelManagerStub({
      dataDir,
      chapters: [
        { chapterNumber: 1, wordCount: 0, title: '' },
      ],
      chapterRecords: new Map([[1, failedChapter]]),
    });

    const status = await resolveChapterGenerationStatus({
      novelManager,
      novelId: NOVEL_ID,
      bufferedStatus: emptyStatus(),
      activeChapterNumbers: [],
    });

    expect(status.source).toBe('chapter');
    expect(status.isGenerating).toBe(false);
    expect(status.lastFailedChapter).toBe(1);
    expect(status.lastFailureMessage).toBe('生成超时');
  });

  it('recovers failure status from the failure store without creating an empty chapter', async () => {
    const dataDir = await createTempDataDir();
    const novelManager = createNovelManagerStub({ dataDir, chapters: [] });
    await recordChapterGenerationFailure(novelManager, NOVEL_ID, {
      chapterNumber: 3,
      errorCode: 'INSUFFICIENT_BALANCE',
      errorMessage: '余额不足，生成未开始',
      retryable: true,
      updatedAt: new Date().toISOString(),
    });

    const status = await resolveChapterGenerationStatus({
      novelManager,
      novelId: NOVEL_ID,
      bufferedStatus: emptyStatus(),
      activeChapterNumbers: [],
    });

    expect(status.source).toBe('chapter');
    expect(status.lastFailedChapter).toBe(3);
    expect(status.lastFailureMessage).toBe('余额不足，生成未开始');
    expect(await novelManager.listChapters(NOVEL_ID)).toEqual([]);
  });
});
