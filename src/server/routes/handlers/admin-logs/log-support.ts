import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createLogger, getBufferedLogEntries } from '../../../../utils/logger.js';
import { resolveReadableLogDirs } from '../../../../utils/log-paths.js';

export const logger = createLogger('AdminLogs');
export const DEFAULT_QUERY_LIMIT = 50;
export const MAX_QUERY_FILES = 6;
export const MAX_TAG_FILES = 12;
export const MAX_STATS_FILES = 12;
export const LOG_TAIL_INITIAL_BYTES = 256 * 1024;
export const LOG_TAIL_MAX_BYTES = 2 * 1024 * 1024;
export const LOG_TAG_SCAN_ENTRY_LIMIT = 3000;

export interface LogEntry {
  time: string;
  level: string;
  tag?: string;
  msg: string;
  [key: string]: unknown;
}

export const QueryLogsSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  since: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const GetLogFilesSchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
});

export function isFileLoggingEnabled(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.LOG_TO_FILE === 'true';
}

export async function getLogFiles(
  logDirs: string[] = resolveReadableLogDirs(),
): Promise<Array<{ name: string; path: string; size: number; mtime: string }>> {
  const results = await Promise.all(logDirs.map(async (logDir) => {
    try {
      await fs.access(logDir);
    } catch {
      return [];
    }

    try {
      const files = await fs.readdir(logDir);
      return await Promise.all(
        files
          .filter(f => f.startsWith('app-') && f.endsWith('.log'))
          .map(async f => {
            const filePath = path.join(logDir, f);
            const stats = await fs.stat(filePath);
            return {
              name: f,
              path: filePath,
              size: stats.size,
              mtime: stats.mtime.toISOString(),
            };
          }),
      );
    } catch {
      return [];
    }
  }));

  return results.flat().sort((a, b) => b.mtime.localeCompare(a.mtime));
}

export async function readRecentLogFileEntries(
  filePath: string,
  maxEntries: number,
  initialBytes = LOG_TAIL_INITIAL_BYTES,
): Promise<LogEntry[]> {
  try {
    const handle = await fs.open(filePath, 'r');
    try {
      const stats = await handle.stat();
      if (stats.size <= 0) {
        return [];
      }

      let bytesToRead = Math.min(initialBytes, stats.size);
      let content = '';

      while (true) {
        const start = Math.max(0, stats.size - bytesToRead);
        const length = stats.size - start;
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, start);
        content = buffer.toString('utf-8');

        const lines = content.split('\n').filter(Boolean);
        if (start === 0 || lines.length >= maxEntries || bytesToRead >= Math.min(LOG_TAIL_MAX_BYTES, stats.size)) {
          return lines.slice(-maxEntries).map(line => {
            try {
              return JSON.parse(line) as LogEntry;
            } catch {
              return { time: '', level: 'info', msg: line };
            }
          });
        }

        bytesToRead = Math.min(bytesToRead * 2, Math.min(LOG_TAIL_MAX_BYTES, stats.size));
      }
    } finally {
      await handle.close();
    }
  } catch {
    return [];
  }
}

export function selectRecentLogFiles(
  files: Array<{ name: string; path: string; size: number; mtime: string }>,
  maxFiles: number,
): Array<{ name: string; path: string; size: number; mtime: string }> {
  return files.slice(0, Math.max(1, maxFiles));
}

export function getBufferedLogsForQuery(date?: string): LogEntry[] {
  const entries = getBufferedLogEntries();
  if (!date) {
    return entries;
  }

  return entries.filter(entry => typeof entry.time === 'string' && entry.time.startsWith(`${date}T`));
}

export function filterLogs(
  logs: LogEntry[],
  filters: {
    level?: string;
    tag?: string;
    search?: string;
    since?: string;
    limit?: number;
  },
): LogEntry[] {
  let filtered = logs;

  if (filters.level) {
    filtered = filtered.filter(log => log.level === filters.level);
  }

  if (filters.tag) {
    const tag = filters.tag;
    filtered = filtered.filter(log => log.tag?.includes(tag));
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(log => {
      const msg = log.msg.toLowerCase();
      const meta = JSON.stringify(log).toLowerCase();
      return msg.includes(searchLower) || meta.includes(searchLower);
    });
  }

  if (filters.since) {
    const since = new Date(filters.since);
    filtered = filtered.filter(log => new Date(log.time) >= since);
  }

  filtered.sort((a, b) => b.time.localeCompare(a.time));

  if (filters.limit) {
    filtered = filtered.slice(0, filters.limit);
  }

  return filtered;
}

export function summarizeLogs(logs: LogEntry[]): {
  total: number;
  byLevel: Record<string, number>;
  byTag: Record<string, number>;
  timeRange: { earliest: string; latest: string } | null;
} {
  const byLevel: Record<string, number> = {};
  const byTag: Record<string, number> = {};
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const log of logs) {
    byLevel[log.level] = (byLevel[log.level] || 0) + 1;

    if (log.tag) {
      byTag[log.tag] = (byTag[log.tag] || 0) + 1;
    }

    if (log.time) {
      if (!earliest || log.time < earliest) earliest = log.time;
      if (!latest || log.time > latest) latest = log.time;
    }
  }

  return {
    total: logs.length,
    byLevel,
    byTag,
    timeRange: earliest && latest ? { earliest, latest } : null,
  };
}
