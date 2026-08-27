import type { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  DEFAULT_QUERY_LIMIT,
  LOG_TAG_SCAN_ENTRY_LIMIT,
  MAX_QUERY_FILES,
  MAX_STATS_FILES,
  MAX_TAG_FILES,
  QueryLogsSchema,
  filterLogs,
  getBufferedLogsForQuery,
  getLogFiles,
  isFileLoggingEnabled,
  logger,
  readRecentLogFileEntries,
  selectRecentLogFiles,
  summarizeLogs,
} from './log-support.js';
import { resolveReadableLogDirs } from '../../../../utils/log-paths.js';

export function registerAdminLogInsightRoutes(router: Router): void {
  router.get('/query', async (req, res) => {
    try {
      const query = QueryLogsSchema.safeParse(req.query);
      if (!query.success) {
        res.status(400).json({ error: query.error.issues[0]?.message ?? '参数错误' });
        return;
      }

      let logFiles: string[];
      const readableLogDirs = resolveReadableLogDirs();

      if (query.data.date) {
        const dateCandidates = readableLogDirs.map(logDir => path.join(logDir, `app-${query.data.date}.log`));
        const existingDatePaths: string[] = [];

        for (const datePath of dateCandidates) {
          try {
            await fs.access(datePath);
            existingDatePaths.push(datePath);
          } catch {
            // ignore missing paths
          }
        }

        if (existingDatePaths.length === 0) {
          const bufferedLogs = getBufferedLogsForQuery(query.data.date);
          const filteredBufferedLogs = filterLogs(bufferedLogs, {
            ...query.data,
            limit: query.data.limit ?? DEFAULT_QUERY_LIMIT,
          });
          res.json({
            logs: filteredBufferedLogs,
            summary: summarizeLogs(bufferedLogs),
            source: 'buffer',
            persistenceEnabled: isFileLoggingEnabled(),
          });
          return;
        }
        logFiles = existingDatePaths;
      } else {
        const files = await getLogFiles(readableLogDirs);
        if (files.length === 0) {
          const bufferedLogs = getBufferedLogsForQuery();
          const filteredBufferedLogs = filterLogs(bufferedLogs, {
            ...query.data,
            limit: query.data.limit ?? DEFAULT_QUERY_LIMIT,
          });
          res.json({
            logs: filteredBufferedLogs,
            summary: summarizeLogs(bufferedLogs),
            source: 'buffer',
            persistenceEnabled: isFileLoggingEnabled(),
          });
          return;
        }
        logFiles = selectRecentLogFiles(files, MAX_QUERY_FILES).map(file => file.path);
      }

      const requestedLimit = query.data.limit ?? DEFAULT_QUERY_LIMIT;
      const entriesPerFile = Math.max(requestedLimit * 4, 400);

      const allLogs = [];
      for (const file of logFiles) {
        const logs = await readRecentLogFileEntries(file, entriesPerFile);
        allLogs.push(...logs);
      }

      res.json({
        logs: filterLogs(allLogs, {
          ...query.data,
          limit: requestedLimit,
        }),
        summary: summarizeLogs(allLogs),
        source: 'files',
        persistenceEnabled: isFileLoggingEnabled(),
      });
    } catch (err) {
      logger.error('查询日志失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: '查询日志失败' });
    }
  });

  router.get('/stats', async (_req, res) => {
    try {
      const files = await getLogFiles();
      if (files.length === 0) {
        const bufferedLogs = getBufferedLogsForQuery();
        res.json({
          summary: summarizeLogs(bufferedLogs),
          files: {
            count: 0,
            totalSize: 0,
          },
          source: 'buffer',
          persistenceEnabled: isFileLoggingEnabled(),
        });
        return;
      }

      const selectedFiles = selectRecentLogFiles(files, MAX_STATS_FILES);
      const allLogs = [];
      for (const file of selectedFiles.map(item => item.path)) {
        const logs = await readRecentLogFileEntries(file, 1000);
        allLogs.push(...logs);
      }

      res.json({
        summary: summarizeLogs(allLogs),
        files: {
          count: files.length,
          totalSize: files.reduce((sum, file) => sum + file.size, 0),
        },
        source: 'files',
        persistenceEnabled: isFileLoggingEnabled(),
      });
    } catch (err) {
      logger.error('获取日志统计失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: '获取日志统计失败' });
    }
  });

  router.get('/levels', (_req, res) => {
    res.json({
      levels: ['debug', 'info', 'warn', 'error'],
    });
  });

  router.get('/tags', async (_req, res) => {
    try {
      const files = await getLogFiles();
      if (files.length === 0) {
        const tags = new Set<string>();
        for (const log of getBufferedLogsForQuery()) {
          if (log.tag) {
            tags.add(log.tag);
          }
        }
        res.json({
          tags: Array.from(tags).sort(),
        });
        return;
      }

      const selectedFiles = selectRecentLogFiles(files, MAX_TAG_FILES);
      const tags = new Set<string>();
      for (const file of selectedFiles.map(item => item.path)) {
        const logs = await readRecentLogFileEntries(file, LOG_TAG_SCAN_ENTRY_LIMIT);
        for (const log of logs) {
          if (log.tag) {
            tags.add(log.tag);
          }
        }
      }

      res.json({
        tags: Array.from(tags).sort(),
      });
    } catch (err) {
      logger.error('获取日志标签失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: '获取日志标签失败' });
    }
  });
}
