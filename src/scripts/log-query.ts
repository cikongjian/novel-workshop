#!/usr/bin/env tsx
/**
 * 日志查询工具
 *
 * 用法：
 *   npm run log:query -- --level error          # 查询所有 error 级别日志
 *   npm run log:query -- --tag TTS             # 查询 TTS 标签日志
 *   npm run log:query -- --today               # 查询今天的日志
 *   npm run log:query -- --tail 50             # 查看最近 50 条
 *   npm run log:query -- --search "用户123"    # 搜索包含特定内容的日志
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_LOG_DIR = path.join(__dirname, '../../logs');

interface LogEntry {
  time: string;
  level: string;
  tag?: string;
  msg: string;
  [key: string]: unknown;
}

function resolveLogDir(): string {
  return process.env.LOG_DIR || DEFAULT_LOG_DIR;
}

function getTodayLogPath(logDir: string): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return path.join(logDir, `app-${yyyy}-${MM}-${dd}.log`);
}

async function getLogFiles(logDir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(logDir);
    return files
      .filter(f => f.startsWith('app-') && f.endsWith('.log'))
      .map(f => path.join(logDir, f))
      .sort((a, b) => b.localeCompare(a)); // 降序，最新的在前
  } catch {
    return [];
  }
}

async function readLogFile(filePath: string): Promise<LogEntry[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.map(line => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        return { time: '', level: 'info', msg: line };
      }
    });
  } catch {
    return [];
  }
}

function filterLogs(logs: LogEntry[], options: QueryOptions): LogEntry[] {
  let filtered = logs;

  if (options.level) {
    filtered = filtered.filter(log => log.level === options.level);
  }

  if (options.tag) {
    filtered = filtered.filter(log => log.tag?.includes(options.tag!));
  }

  if (options.search) {
    const searchLower = options.search.toLowerCase();
    filtered = filtered.filter(log => {
      const msg = log.msg.toLowerCase();
      const meta = JSON.stringify(log).toLowerCase();
      return msg.includes(searchLower) || meta.includes(searchLower);
    });
  }

  if (options.since) {
    const since = new Date(options.since);
    filtered = filtered.filter(log => new Date(log.time) >= since);
  }

  return filtered;
}

interface QueryOptions {
  level?: string;
  tag?: string;
  search?: string;
  since?: string;
  today?: boolean;
  tail?: number;
}

function parseLogQueryArgs(argv: string[]): QueryOptions | null {
  const options: QueryOptions = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--level':
      case '-l':
        options.level = argv[i + 1];
        i += 1;
        break;
      case '--tag':
      case '-t':
        options.tag = argv[i + 1];
        i += 1;
        break;
      case '--search':
      case '-s':
        options.search = argv[i + 1];
        i += 1;
        break;
      case '--since':
        options.since = argv[i + 1];
        i += 1;
        break;
      case '--today':
        options.today = true;
        break;
      case '--tail':
      case '-n':
        options.tail = parseInt(argv[i + 1] ?? '', 10);
        i += 1;
        break;
      case '--help':
      case '-h':
        return null;
      default:
        break;
    }
  }

  return options;
}

function formatLogQueryHelp(invocation = 'npm run log:query --'): string {
  return `
日志查询工具

用法：
  ${invocation} [选项]

选项：
  -l, --level <level>     按级别过滤 (debug|info|warn|error)
  -t, --tag <tag>         按标签过滤 (如 TTS, AUDIT, batch)
  -s, --search <text>     搜索日志内容
  --since <time>          查看指定时间之后的日志
  --today                 只查看今天的日志
  -n, --tail <number>     只显示最近 N 条
  -h, --help              显示帮助信息

示例：
  ${invocation} --level error
  ${invocation} --tag TTS --tail 20
  ${invocation} --search "用户123" --today
`.trim();
}

export async function runLogQueryCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run log:query --',
): Promise<number> {
  const options = parseLogQueryArgs(argv);
  if (options === null) {
    console.log(formatLogQueryHelp(invocation));
    return 0;
  }

  await queryLogs(options);
  return 0;
}

async function queryLogs(options: QueryOptions): Promise<void> {
  const logDir = resolveLogDir();

  let logFiles: string[];
  if (options.today) {
    const todayPath = getTodayLogPath(logDir);
    try {
      await fs.access(todayPath);
      logFiles = [todayPath];
    } catch {
      console.log('今天还没有日志文件');
      return;
    }
  } else {
    logFiles = await getLogFiles(logDir);
  }

  if (logFiles.length === 0) {
    console.log('没有找到日志文件');
    return;
  }

  // 读取所有日志
  const allLogs: LogEntry[] = [];
  for (const file of logFiles) {
    const logs = await readLogFile(file);
    allLogs.push(...logs);
  }

  // 过滤
  const filtered = filterLogs(allLogs, options);

  // 排序（最新的在前）
  filtered.sort((a, b) => b.time.localeCompare(a.time));

  // 限制数量
  const result = options.tail ? filtered.slice(0, options.tail) : filtered;

  // 输出
  if (result.length === 0) {
    console.log('没有匹配的日志');
    return;
  }

  console.log(`找到 ${result.length} 条日志：\n`);

  for (const log of result) {
    const levelColor = {
      error: '\x1b[31m',
      warn: '\x1b[33m',
      info: '\x1b[32m',
      debug: '\x1b[36m',
    }[log.level] || '';
    const reset = '\x1b[0m';
    const tag = log.tag ? `[${log.tag}] ` : '';
    const time = log.time ? log.time.split('T')[1]?.slice(0, 12) || log.time.slice(11, 23) : '';
    const meta = Object.entries(log)
      .filter(([k]) => !['time', 'level', 'tag', 'msg'].includes(k))
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');

    console.log(
      `${levelColor}${log.level.padEnd(5)}${reset} ${time} ${tag}${log.msg}${meta ? ' ' + meta : ''}`
    );
  }
}

async function main(): Promise<void> {
  process.exitCode = await runLogQueryCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('log-query');
}

if (isExecutedAsEntry()) {
  void main().catch(err => {
    console.error('查询失败:', err);
    process.exit(1);
  });
}
