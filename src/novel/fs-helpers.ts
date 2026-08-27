import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { recordPerf } from '../utils/perf.js';

/**
 * 文件系统工具函数
 * 从 NovelManager 中提取，供所有 repository 模块共享。
 */

export function isNotFoundError(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT';
}

function summarizeFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.slice(-3).join('/');
}

async function measureFsOp<T>(operation: string, filePath: string, action: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await action();
  } finally {
    recordPerf(`fs ${operation}`, Date.now() - startedAt, {
      slowMs: 40,
      meta: {
        file: summarizeFilePath(filePath),
      },
    });
  }
}

export async function pathExists(p: string): Promise<boolean> {
  return measureFsOp('access', p, async () => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  });
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  return measureFsOp('readJson', filePath, async () => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        return fallback;
      }
      throw err;
    }
  });
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await measureFsOp('writeJson', filePath, async () => {
    await atomicWriteUtf8(filePath, JSON.stringify(data, null, 2));
  });
}

export async function readText(filePath: string, fallback: string = ''): Promise<string> {
  return measureFsOp('readText', filePath, async () => {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        return fallback;
      }
      throw err;
    }
  });
}

export async function writeText(filePath: string, text: string): Promise<void> {
  await measureFsOp('writeText', filePath, async () => {
    await atomicWriteUtf8(filePath, text);
  });
}

const RETRYABLE_FS_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);

function isRetryableFsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return typeof code === 'string' && RETRYABLE_FS_CODES.has(code);
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function renameWithRetry(fromPath: string, toPath: string): Promise<void> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rename(fromPath, toPath);
      return;
    } catch (err) {
      if (!isRetryableFsError(err) || attempt === maxAttempts) {
        throw err;
      }
      await sleep(40 * attempt);
    }
  }
}

/**
 * 原子写入（Windows 兼容）：
 * - 先写入同目录临时文件
 * - 如目标存在则先改名为 .bak
 * - 再将临时文件 rename 到目标路径
 * - 最后尽力删除 .bak（失败不影响主流程）
 */
export async function atomicWriteUtf8(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const base = path.basename(filePath);
  const tmpPath = path.join(dir, `.${base}.tmp.${process.pid}.${randomUUID()}`);
  const bakPath = path.join(dir, `.${base}.bak.${Date.now()}`);

  await fs.writeFile(tmpPath, content, 'utf-8');

  try {
    await renameWithRetry(filePath, bakPath);
  } catch (err: unknown) {
    if (!isNotFoundError(err)) {
      // 清理临时文件后再抛错，避免堆积
      await fs.unlink(tmpPath).catch(() => {});
      throw err;
    }
  }

  try {
    await renameWithRetry(tmpPath, filePath);
  } catch (err: unknown) {
    // 回滚：尽力恢复原文件
    await renameWithRetry(bakPath, filePath).catch(() => {});
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }

  await fs.unlink(bakPath).catch(() => {});
}

export async function quarantineCorruptFile(filePath: string): Promise<void> {
  await measureFsOp('quarantine', filePath, async () => {
    if (!(await pathExists(filePath))) return;
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    const quarantined = path.join(dir, `${base}.corrupt.${Date.now()}.json`);
    await fs.rename(filePath, quarantined).catch(() => {});
  });
}

export async function ensureDir(dirPath: string): Promise<void> {
  await measureFsOp('mkdir', dirPath, async () => {
    await fs.mkdir(dirPath, { recursive: true });
  });
}
