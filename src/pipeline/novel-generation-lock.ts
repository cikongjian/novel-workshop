import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createLogger } from '../utils/logger.js';

const lockLog = createLogger('novel-generation-lock');

type LockOptions = {
  heartbeatMs?: number;
  staleMs?: number;
  retryMs?: number;
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

const DEFAULT_HEARTBEAT_MS = 15_000;
export const DEFAULT_GENERATION_LOCK_STALE_MS = 20 * 60 * 1000;
const DEFAULT_RETRY_MS = 1_000;

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err != null && typeof err === 'object' && 'code' in err;
}

function createAbortError(): Error {
  const error = new Error('generation lock wait aborted');
  error.name = 'AbortError';
  return error;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw createAbortError();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(createAbortError());
    };

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
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

export class NovelGenerationLock {
  private readonly baseDir: string;
  private readonly heartbeatMs: number;
  private readonly staleMs: number;
  private readonly retryMs: number;

  constructor(dataDir: string, options: LockOptions = {}) {
    this.baseDir = path.join(path.resolve(dataDir), 'locks', 'chapter-generation');
    this.heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
    this.staleMs = options.staleMs ?? DEFAULT_GENERATION_LOCK_STALE_MS;
    this.retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  }

  async acquire(params: {
    novelId: string;
    chapterNumber: number;
    runId: string;
    signal?: AbortSignal;
  }): Promise<() => Promise<void>> {
    const { novelId, chapterNumber, runId, signal } = params;
    const lockDir = path.join(this.baseDir, novelId);
    const metadataPath = path.join(lockDir, 'owner.json');
    const startedAt = Date.now();
    let warned = false;

    await fs.mkdir(this.baseDir, { recursive: true });

    for (;;) {
      if (signal?.aborted) throw createAbortError();
      try {
        await fs.mkdir(lockDir);
        const writeMetadata = async () => {
          const nowIso = new Date().toISOString();
          const metadata: LockMetadata = {
            novelId,
            chapterNumber,
            runId,
            pid: process.pid,
            host: os.hostname(),
            acquiredAt: nowIso,
            heartbeatAt: nowIso,
          };
          await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
        };

        await writeMetadata();
        const heartbeat = setInterval(() => {
          void writeMetadata().catch((err) => {
            lockLog.warn('generation lock heartbeat failed', {
              novelId,
              runId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }, this.heartbeatMs);
        heartbeat.unref?.();

        const waitedMs = Date.now() - startedAt;
        if (waitedMs > 50) {
          lockLog.warn('generation lock acquired after wait', {
            novelId,
            chapterNumber,
            runId,
            waitedMs,
          });
        }

        return async () => {
          clearInterval(heartbeat);
          await fs.rm(lockDir, { recursive: true, force: true }).catch(() => {});
        };
      } catch (err) {
        if (!isNodeError(err) || err.code !== 'EEXIST') {
          throw err;
        }

        const owner = await this.readLockMetadata(metadataPath);
        if (owner && owner.host === os.hostname() && !isProcessAlive(owner.pid)) {
          lockLog.warn('removing dead-owner generation lock', {
            novelId,
            chapterNumber,
            runId,
            ownerRunId: owner.runId,
            ownerPid: owner.pid,
            ownerHeartbeatAt: owner.heartbeatAt,
          });
          await fs.rm(lockDir, { recursive: true, force: true }).catch(() => {});
          continue;
        }

        const heartbeatTime = this.resolveHeartbeatTime(owner)
          ?? await this.readHeartbeatTime(lockDir, metadataPath);
        const ageMs = Date.now() - heartbeatTime;
        if (ageMs > this.staleMs) {
          lockLog.warn('removing stale generation lock', {
            novelId,
            chapterNumber,
            runId,
            ageMs,
            ownerRunId: owner?.runId,
            ownerPid: owner?.pid,
            ownerHeartbeatAt: owner?.heartbeatAt,
          });
          await fs.rm(lockDir, { recursive: true, force: true }).catch(() => {});
          continue;
        }

        const waitedMs = Date.now() - startedAt;
        if (!warned && waitedMs >= 5_000) {
          warned = true;
          lockLog.warn('waiting for generation lock', {
            novelId,
            chapterNumber,
            runId,
            waitedMs,
            ownerRunId: owner?.runId,
            ownerPid: owner?.pid,
            ownerHeartbeatAt: owner?.heartbeatAt,
          });
        }
        await sleep(this.retryMs, signal);
      }
    }
  }

  private async readLockMetadata(metadataPath: string): Promise<LockMetadata | null> {
    try {
      const raw = await fs.readFile(metadataPath, 'utf8');
      return JSON.parse(raw) as LockMetadata;
    } catch {
      return null;
    }
  }

  private resolveHeartbeatTime(metadata: LockMetadata | null): number | null {
    if (!metadata?.heartbeatAt) return null;
    const heartbeatAt = Date.parse(metadata.heartbeatAt);
    return Number.isFinite(heartbeatAt) ? heartbeatAt : null;
  }

  private async readHeartbeatTime(lockDir: string, metadataPath: string): Promise<number> {
    const heartbeatAt = this.resolveHeartbeatTime(await this.readLockMetadata(metadataPath));
    if (heartbeatAt != null) {
      return heartbeatAt;
    }

    try {
      const stat = await fs.stat(lockDir);
      return stat.mtimeMs;
    } catch {
      return 0;
    }
  }
}
