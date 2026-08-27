import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { NovelManager } from '../novel/novel-manager.js';
import { DEFAULT_GENERATION_LOCK_STALE_MS } from '../pipeline/novel-generation-lock.js';
import { listChapterGenerationFailures } from './chapter-generation-failure-store.js';

export type GenerationAgentStatus = 'active' | 'done' | 'error';

export type BufferedGenerationStatus = {
  isGenerating: boolean;
  chapterNumber: number | null;
  activeAgents: string[];
  agentStatuses: Record<string, GenerationAgentStatus>;
  writingAssistantOutput: string;
  lastCompletedChapter: number | null;
  lastCompletedAt: number | null;
  lastFailedChapter: number | null;
  lastFailedAt: number | null;
  lastFailureMessage: string;
  metadataUpdatedAt: number | null;
};

export type GetNovelGenerationStatusFn = (novelId: string) => BufferedGenerationStatus;

export type GenerationLockSnapshot = {
  novelId: string;
  chapterNumber: number;
  runId: string;
  pid: number;
  host: string;
  acquiredAt: string;
  heartbeatAt: string;
  ageMs: number;
  stale: boolean;
  ownerAlive: boolean | null;
};

export type ResolvedGenerationStatus = BufferedGenerationStatus & {
  source: 'active-task' | 'buffer' | 'lock' | 'chapter' | 'idle';
  lock: GenerationLockSnapshot | null;
  activeChapterNumbers: number[];
  persistedLastCompletedChapter: number | null;
  statusWarnings: string[];
};

type LockMetadata = {
  novelId: string;
  chapterNumber: number;
  runId: string;
  pid: number;
  host: string;
  acquiredAt: string;
  heartbeatAt: string;
};

export async function resolveChapterGenerationStatus(params: {
  novelManager: NovelManager;
  novelId: string;
  bufferedStatus: BufferedGenerationStatus;
  activeChapterNumbers: number[];
  staleMs?: number;
}): Promise<ResolvedGenerationStatus> {
  const {
    novelManager,
    novelId,
    bufferedStatus,
    activeChapterNumbers,
    staleMs = DEFAULT_GENERATION_LOCK_STALE_MS,
  } = params;
  const persistedLastCompletedChapter = await resolvePersistedLastCompletedChapter(novelManager, novelId);
  const lock = await readGenerationLockSnapshot(novelManager.getDataDir(), novelId, staleMs);
  const statusWarnings: string[] = [];
  const base = normalizeBufferedStatus(bufferedStatus);
  const sortedActive = [...new Set(activeChapterNumbers)]
    .filter(item => Number.isInteger(item) && item > 0)
    .sort((a, b) => a - b);

  if (base.lastCompletedChapter != null && base.lastCompletedChapter > (persistedLastCompletedChapter ?? 0)) {
    const persistedLabel = persistedLastCompletedChapter == null
      ? '没有可读章节'
      : `仅确认到第 ${persistedLastCompletedChapter} 章`;
    statusWarnings.push(`状态缓冲报告第 ${base.lastCompletedChapter} 章已完成，但章节文件${persistedLabel}。`);
    base.lastCompletedChapter = persistedLastCompletedChapter;
    base.lastCompletedAt = null;
  }

  if (sortedActive.length > 0) {
    const chapterNumber = base.isGenerating && base.chapterNumber ? base.chapterNumber : sortedActive[0];
    return {
      ...base,
      isGenerating: true,
      chapterNumber,
      activeAgents: normalizeActiveAgents(base.activeAgents),
      agentStatuses: normalizeAgentStatuses(base.agentStatuses),
      writingAssistantOutput: base.writingAssistantOutput || '章节生成任务已进入后台队列，正在推进。',
      lastCompletedChapter: persistedLastCompletedChapter,
      source: 'active-task',
      lock,
      activeChapterNumbers: sortedActive,
      persistedLastCompletedChapter,
      statusWarnings,
    };
  }

  if (base.isGenerating) {
    return {
      ...base,
      lastCompletedChapter: persistedLastCompletedChapter,
      source: 'buffer',
      lock,
      activeChapterNumbers: sortedActive,
      persistedLastCompletedChapter,
      statusWarnings,
    };
  }

  if (lock && !lock.stale) {
    statusWarnings.push(`检测到第 ${lock.chapterNumber} 章仍持有生成锁，但内存任务表未记录活跃任务。`);
    return {
      ...base,
      isGenerating: true,
      chapterNumber: lock.chapterNumber,
      activeAgents: normalizeActiveAgents(base.activeAgents),
      agentStatuses: normalizeAgentStatuses(base.agentStatuses),
      writingAssistantOutput: base.writingAssistantOutput || '章节生成锁仍在，正在等待后台任务收尾或超时恢复。',
      lastCompletedChapter: persistedLastCompletedChapter,
      source: 'lock',
      lock,
      activeChapterNumbers: sortedActive,
      persistedLastCompletedChapter,
      statusWarnings,
    };
  }

  if (lock?.stale) {
    statusWarnings.push(`第 ${lock.chapterNumber} 章生成锁已陈旧，状态接口不应再报告为空闲成功。`);
    return {
      ...base,
      isGenerating: false,
      chapterNumber: null,
      lastCompletedChapter: persistedLastCompletedChapter,
      lastCompletedAt: null,
      lastFailedChapter: lock.chapterNumber,
      lastFailedAt: Date.parse(lock.heartbeatAt) || null,
      lastFailureMessage: `生成任务已失去心跳，锁陈旧 ${Math.round(lock.ageMs / 1000)} 秒，可重试。`,
      source: 'lock',
      lock,
      activeChapterNumbers: sortedActive,
      persistedLastCompletedChapter,
      statusWarnings,
    };
  }

  const failedChapter = await resolveLatestFailedChapter(novelManager, novelId, base, persistedLastCompletedChapter);
  if (failedChapter) {
    return {
      ...base,
      isGenerating: false,
      chapterNumber: null,
      lastCompletedChapter: persistedLastCompletedChapter,
      lastFailedChapter: failedChapter.chapterNumber,
      lastFailedAt: failedChapter.updatedAt,
      lastFailureMessage: failedChapter.message,
      source: 'chapter',
      lock,
      activeChapterNumbers: sortedActive,
      persistedLastCompletedChapter,
      statusWarnings,
    };
  }

  return {
    ...base,
    lastCompletedChapter: persistedLastCompletedChapter,
    source: persistedLastCompletedChapter != null ? 'chapter' : 'idle',
    lock,
    activeChapterNumbers: sortedActive,
    persistedLastCompletedChapter,
    statusWarnings,
  };
}

function normalizeBufferedStatus(status: BufferedGenerationStatus): BufferedGenerationStatus {
  return {
    isGenerating: Boolean(status.isGenerating),
    chapterNumber: Number.isInteger(status.chapterNumber) ? status.chapterNumber : null,
    activeAgents: Array.isArray(status.activeAgents) ? status.activeAgents : [],
    agentStatuses: status.agentStatuses ?? {},
    writingAssistantOutput: status.writingAssistantOutput ?? '',
    lastCompletedChapter: Number.isInteger(status.lastCompletedChapter) ? status.lastCompletedChapter : null,
    lastCompletedAt: Number.isFinite(status.lastCompletedAt) ? status.lastCompletedAt : null,
    lastFailedChapter: Number.isInteger(status.lastFailedChapter) ? status.lastFailedChapter : null,
    lastFailedAt: Number.isFinite(status.lastFailedAt) ? status.lastFailedAt : null,
    lastFailureMessage: status.lastFailureMessage ?? '',
    metadataUpdatedAt: Number.isFinite(status.metadataUpdatedAt) ? status.metadataUpdatedAt : null,
  };
}

function normalizeActiveAgents(activeAgents: string[]): string[] {
  return activeAgents.length > 0 ? activeAgents : ['writing-assistant'];
}

function normalizeAgentStatuses(agentStatuses: Record<string, GenerationAgentStatus>): Record<string, GenerationAgentStatus> {
  return Object.keys(agentStatuses).length > 0 ? agentStatuses : { 'writing-assistant': 'active' };
}

async function resolvePersistedLastCompletedChapter(
  novelManager: NovelManager,
  novelId: string,
): Promise<number | null> {
  const chapters = await novelManager.listChapters(novelId);
  const readable = chapters
    .filter(item => item.wordCount > 0)
    .sort((a, b) => b.chapterNumber - a.chapterNumber);
  return readable[0]?.chapterNumber ?? null;
}

export async function readGenerationLockSnapshot(
  dataDir: string,
  novelId: string,
  staleMs: number,
): Promise<GenerationLockSnapshot | null> {
  const metadataPath = path.join(path.resolve(dataDir), 'locks', 'chapter-generation', novelId, 'owner.json');
  return readLockMetadata(metadataPath, staleMs);
}

async function readLockMetadata(metadataPath: string, staleMs: number): Promise<GenerationLockSnapshot | null> {
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    const parsed = JSON.parse(raw) as LockMetadata;
    const heartbeatTime = Date.parse(parsed.heartbeatAt);
    const ageMs = Number.isFinite(heartbeatTime) ? Date.now() - heartbeatTime : staleMs + 1;
    return {
      ...parsed,
      ageMs,
      stale: ageMs > staleMs,
      ownerAlive: parsed.host === os.hostname() ? isProcessAlive(parsed.pid) : null,
    };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function resolveLatestFailedChapter(
  novelManager: NovelManager,
  novelId: string,
  status: BufferedGenerationStatus,
  persistedLastCompletedChapter: number | null,
): Promise<{ chapterNumber: number; updatedAt: number | null; message: string } | null> {
  const persistedFailures = await listChapterGenerationFailures(novelManager, novelId).catch(() => []);
  if (persistedFailures.length > 0) {
    const latest = persistedFailures[0];
    return {
      chapterNumber: latest.chapterNumber,
      updatedAt: Date.parse(latest.updatedAt) || null,
      message: latest.errorMessage || '章节生成失败，可重试。',
    };
  }
  const summaries = await novelManager.listChapters(novelId).catch(() => []);
  const candidateNumbers = [
    status.lastFailedChapter,
    status.chapterNumber,
    persistedLastCompletedChapter != null ? persistedLastCompletedChapter + 1 : null,
    ...summaries
      .sort((a, b) => b.chapterNumber - a.chapterNumber)
      .slice(0, 5)
      .map(item => item.chapterNumber),
  ].filter((item): item is number => typeof item === 'number' && Number.isInteger(item) && item > 0);

  for (const chapterNumber of [...new Set(candidateNumbers)]) {
    const chapter = await novelManager.getChapter(novelId, chapterNumber);
    const lifecycle = chapter?.diagnostics?.generationLifecycle;
    if (lifecycle?.phase === 'failed') {
      return {
        chapterNumber,
        updatedAt: Date.parse(lifecycle.updatedAt) || (chapter ? Date.parse(chapter.updatedAt) : 0) || null,
        message: lifecycle.errorMessage ?? '章节生成失败，可重试。',
      };
    }
  }
  return null;
}
