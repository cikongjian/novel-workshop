import fs from 'node:fs/promises';
import path from 'node:path';
import type { NovelManager } from '../novel/novel-manager.js';
import { DEFAULT_GENERATION_LOCK_STALE_MS } from '../pipeline/novel-generation-lock.js';
import { markChapterGenerationFailed } from './generation-result-service.js';
import {
  readGenerationLockSnapshot,
  type GenerationLockSnapshot,
} from './chapter-generation-status-service.js';

export type StaleGenerationLockRecoveryResult = {
  recovered: boolean;
  reason: 'no_lock' | 'active_task' | 'fresh_lock' | 'stale_lock_recovered';
  message: string;
  lock: GenerationLockSnapshot | null;
};

export async function recoverStaleChapterGenerationLock(params: {
  novelManager: NovelManager;
  novelId: string;
  activeChapterNumbers: number[];
  staleMs?: number;
}): Promise<StaleGenerationLockRecoveryResult> {
  const {
    novelManager,
    novelId,
    activeChapterNumbers,
    staleMs = DEFAULT_GENERATION_LOCK_STALE_MS,
  } = params;
  const lock = await readGenerationLockSnapshot(novelManager.getDataDir(), novelId, staleMs);
  if (!lock) {
    return {
      recovered: false,
      reason: 'no_lock',
      message: '没有生成锁需要恢复。',
      lock: null,
    };
  }

  const activeSet = new Set(
    activeChapterNumbers.filter(item => Number.isInteger(item) && item > 0),
  );
  if (activeSet.has(lock.chapterNumber)) {
    return {
      recovered: false,
      reason: 'active_task',
      message: `第 ${lock.chapterNumber} 章仍有活跃后台任务，未清理生成锁。`,
      lock,
    };
  }

  if (!lock.stale) {
    return {
      recovered: false,
      reason: 'fresh_lock',
      message: `第 ${lock.chapterNumber} 章生成锁仍在心跳窗口内，未清理。`,
      lock,
    };
  }

  await fs.rm(resolveGenerationLockDir(novelManager.getDataDir(), novelId), {
    recursive: true,
    force: true,
  });
  await markChapterGenerationFailed({
    novelManager,
    novelId,
    chapterNumber: lock.chapterNumber,
    errorCode: 'CHAPTER_STALE_GENERATION_LOCK',
    errorMessage: `章节生成任务已失去心跳，已清理陈旧锁。最后心跳：${lock.heartbeatAt}`,
    retryable: true,
  });

  return {
    recovered: true,
    reason: 'stale_lock_recovered',
    message: `第 ${lock.chapterNumber} 章陈旧生成锁已清理，可重新生成。`,
    lock,
  };
}

function resolveGenerationLockDir(dataDir: string, novelId: string): string {
  return path.join(path.resolve(dataDir), 'locks', 'chapter-generation', novelId);
}
