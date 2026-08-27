/**
 * SEO 推送日志存储
 *
 * 使用 JSONL 文件追加写入模式记录每次百度推送操作的详情。
 * 存放路径：{DATA_DIR}/seo-push-log.jsonl
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('seo-push-log');

const SEO_PUSH_LOG_FILE = 'seo-push-log.jsonl';
const MAX_LOG_ENTRIES = 200;

export type SeoPushTrigger = 'manual' | 'auto_book_approved';

export type SeoPushLogEntry = {
  id: string;
  /** ISO 8601 时间戳 */
  timestamp: string;
  /** 触发方式 */
  trigger: SeoPushTrigger;
  /** 推送的 URL 列表 */
  urls: string[];
  /** 推送 URL 总数 */
  urlCount: number;
  /** 百度返回的成功数 */
  success: number;
  /** 百度返回的剩余配额 */
  remain: number;
  /** 错误信息（如有） */
  error?: string;
};

function getLogPath(dataDir: string): string {
  return path.join(dataDir, SEO_PUSH_LOG_FILE);
}

/**
 * 追加一条推送日志记录。
 */
export async function appendSeoPushLog(
  dataDir: string,
  entry: Omit<SeoPushLogEntry, 'id' | 'timestamp'>,
): Promise<void> {
  const logPath = getLogPath(dataDir);
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  const fullEntry: SeoPushLogEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };

  await fs.appendFile(logPath, `${JSON.stringify(fullEntry)}\n`, 'utf-8');

  // 异步清理旧记录，不阻塞推送流程
  void trimSeoPushLogs(dataDir).catch((err) => {
    log.warn('清理推送日志失败', { error: err instanceof Error ? err.message : String(err) });
  });
}

/**
 * 读取最近 N 条推送日志（倒序返回，最新在前）。
 */
export async function readSeoPushLogs(
  dataDir: string,
  limit = 50,
): Promise<SeoPushLogEntry[]> {
  const logPath = getLogPath(dataDir);
  const raw = await fs.readFile(logPath, 'utf-8').catch(() => '');
  if (!raw.trim()) return [];

  const entries: SeoPushLogEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as SeoPushLogEntry);
    } catch {
      // 跳过格式错误的行
    }
  }

  return entries.reverse().slice(0, limit);
}

/**
 * 日志超过上限时清理旧记录。
 */
async function trimSeoPushLogs(dataDir: string): Promise<void> {
  const logPath = getLogPath(dataDir);
  const raw = await fs.readFile(logPath, 'utf-8').catch(() => '');
  if (!raw.trim()) return;

  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length <= MAX_LOG_ENTRIES) return;

  const kept = lines.slice(lines.length - MAX_LOG_ENTRIES);
  await fs.writeFile(logPath, `${kept.join('\n')}\n`, 'utf-8');
  log.info(`推送日志已清理，保留最近 ${MAX_LOG_ENTRIES} 条`);
}
