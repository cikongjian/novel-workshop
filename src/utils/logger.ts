/**
 * 统一日志系统
 *
 * 功能：
 * - 开发环境：彩色文本输出（带时间戳和标签）
 * - 生产环境：同时输出到控制台和文件
 * - 通过 LOG_LEVEL 环境变量控制级别（debug/info/warn/error，默认 info）
 * - 通过 LOG_FORMAT 环境变量控制格式（json/text，默认 text）
 * - 自动脱敏：meta 中含 apiKey/key/secret/token/password 等字段自动掩码
 * - 日志持久化：按日期轮转的文件日志
 * - 日志目录：LOG_DIR 环境变量指定，默认 ./logs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { resolvePrimaryLogDir } from './log-paths.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m',  // cyan
  info: '\x1b[32m',   // green
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
};

const TAG_COLOR = '\x1b[35m';  // magenta
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

function resolveLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').trim().toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

function resolveLogFormat(): 'json' | 'text' {
  const raw = (process.env.LOG_FORMAT ?? 'text').trim().toLowerCase();
  return raw === 'json' ? 'json' : 'text';
}

function resolveLogDir(): string {
  return resolvePrimaryLogDir();
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(tag: string): Logger;
}

export interface StructuredLogEntry {
  time: string;
  level: LogLevel;
  tag?: string;
  msg: string;
  [key: string]: unknown;
}

const LOG_BUFFER_LIMIT = 1000;
const logBuffer: StructuredLogEntry[] = [];

function formatTimestamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}.${ms}`;
}

/** 敏感字段名模式（不区分大小写） */
const SENSITIVE_KEYS = /(?:api[_-]?key|secret|token|password|authorization|credential)/i;

/** IP 地址模式（IPv4 和 IPv6） */
const IP_ADDRESS_PATTERNS = [
  // IPv4: xxx.xxx.xxx.xxx
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  // IPv6 简化模式
  /\b([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
];

/** 手机号模式（中国） */
const PHONE_PATTERN = /\b1[3-9]\d{9}\b/g;

/**
 * 对 IP 地址进行脱敏（保留前段，隐藏后段）
 * 例如：192.168.1.100 -> 192.168.1.*
 */
function maskIPAddress(value: string): string {
  // IPv4 脱敏：保留前三个段，最后一个段替换为 *
  const ipv4Match = value.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.)\d{1,3}$/);
  if (ipv4Match) {
    return `${ipv4Match[1]}*`;
  }
  // IPv6 脱敏：保留前半部分，后半部分替换为 *
  const ipv6Match = value.match(/^([0-9a-fA-F]{1,4}:){3,}/);
  if (ipv6Match) {
    const prefixLength = ipv6Match[0].length;
    return value.substring(0, prefixLength) + '*';
  }
  return value;
}

/**
 * 对手机号进行脱敏（保留前 3 位和后 4 位）
 * 例如：13812345678 -> 138****5678
 */
function maskPhoneNumber(value: string): string {
  if (value.length >= 7) {
    return `${value.slice(0, 3)}****${value.slice(-4)}`;
  }
  return value;
}

/**
 * 对字符串中的敏感信息进行脱敏（IP 地址、手机号）
 */
function maskSensitiveValues(value: string): string {
  let result = value;
  // 先脱敏 IP 地址
  for (const pattern of IP_ADDRESS_PATTERNS) {
    result = result.replace(pattern, (match) => maskIPAddress(match));
  }
  // 再脱敏手机号
  result = result.replace(PHONE_PATTERN, (match) => maskPhoneNumber(match));
  return result;
}

/**
 * 对 meta 对象中的敏感字段自动掩码
 */
function sanitizeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.test(key) && typeof value === 'string') {
      result[key] = value.length > 8
        ? `${value.slice(0, 4)}****${value.slice(-4)}`
        : value ? '****' : '';
    } else if (typeof value === 'string') {
      // 对所有字符串值进行 IP 和手机号脱敏
      result[key] = maskSensitiveValues(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = sanitizeMeta(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function pushToLogBuffer(entry: StructuredLogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_LIMIT) {
    logBuffer.splice(0, logBuffer.length - LOG_BUFFER_LIMIT);
  }
}

export function getBufferedLogEntries(): StructuredLogEntry[] {
  return [...logBuffer];
}

/**
 * 日志文件管理器
 * 负责日志文件的创建、写入和轮转
 */
class LogFileManager {
  private logDir: string;
  private currentDate: string;
  private currentLogFile: string | null = null;
  private writeQueue: string[] = [];
  private isWriting: boolean = false;
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(logDir: string) {
    this.logDir = logDir;
    this.currentDate = this.getDateString();
    this.init();
  }

  private getDateString(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${MM}-${dd}`;
  }

  private async init(): Promise<void> {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      this.startFlushTimer();
    } catch (err) {
      // 如果无法创建日志目录，静默失败（不影响主程序）
      console.error('[Logger] Failed to create log directory:', err);
    }
  }

  private getLogFilePath(): string {
    const date = this.getDateString();
    return path.join(this.logDir, `app-${date}.log`);
  }

  private startFlushTimer(): void {
    // 每 5 秒刷新一次缓冲区
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 5000);
    this.flushInterval.unref();
  }

  private async checkRotation(): Promise<void> {
    const newDate = this.getDateString();
    if (newDate !== this.currentDate) {
      // 日期变更，刷新当前缓冲并重置
      await this.flush();
      this.currentDate = newDate;
      this.currentLogFile = null;
    }
  }

  async write(line: string): Promise<void> {
    // 只记录 warn 和 error 级别到文件（避免文件过大）
    if (!line.includes('"warn"') && !line.includes('"error"')) {
      return;
    }

    await this.checkRotation();
    this.writeQueue.push(line);

    // 队列超过 100 条时立即刷新
    if (this.writeQueue.length >= 100) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return;
    }

    this.isWriting = true;
    const linesToWrite = this.writeQueue.splice(0, this.writeQueue.length);

    try {
      const logFile = this.getLogFilePath();
      const content = linesToWrite.join('\n') + '\n';
      await fs.appendFile(logFile, content, 'utf8');
    } catch (err) {
      // 写入失败不影响主程序
      console.error('[Logger] Failed to write log file:', err);
    } finally {
      this.isWriting = false;
    }
  }

  async close(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
  }
}

// 全局单例
let fileManager: LogFileManager | null = null;

function getFileManager(): LogFileManager | null {
  // 只在生产环境或明确启用时才使用文件日志
  if (process.env.NODE_ENV === 'production' || process.env.LOG_TO_FILE === 'true') {
    if (!fileManager) {
      const logDir = resolveLogDir();
      fileManager = new LogFileManager(logDir);
    }
    return fileManager;
  }
  return null;
}

/**
 * 优雅关闭日志系统
 */
/**
 * 关闭日志文件管理器（刷新缓冲并关闭文件）。
 * 由进程主入口的优雅停机流程在收尾阶段调用，避免在此处自注册信号处理器
 * 与主入口的 gracefulShutdown 形成双重 handler 竞争（process.exit 抢断导致清理被截断）。
 */
export async function closeLogger(): Promise<void> {
  if (fileManager) {
    await fileManager.close();
    fileManager = null;
  }
}

// 进程退出时同步刷新剩余日志（兜底，确保未走优雅停机路径时日志不丢）
process.on('exit', () => {
  if (fileManager) {
    // 同步写入剩余日志
    fileManager.flush().catch(() => {});
  }
});

function createLoggerImpl(tag: string): Logger {
  const minLevel = resolveLogLevel();
  const format = resolveLogFormat();
  const minPriority = LEVEL_PRIORITY[minLevel];
  const fileMgr = getFileManager();

  function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= minPriority;
  }

  function logText(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const ts = formatTimestamp();
    const levelColor = LEVEL_COLORS[level];
    const levelLabel = level.toUpperCase().padEnd(5);
    const tagPart = tag ? `${TAG_COLOR}[${tag}]${RESET} ` : '';
    const safeMeta = meta ? sanitizeMeta(meta) : undefined;
    const metaPart = safeMeta ? ` ${DIM}${JSON.stringify(safeMeta)}${RESET}` : '';
    const line = `${DIM}${ts}${RESET} ${levelColor}${levelLabel}${RESET} ${tagPart}${message}${metaPart}`;
    const entry: StructuredLogEntry = {
      time: new Date().toISOString(),
      level,
      ...(tag ? { tag } : {}),
      msg: message,
      ...safeMeta,
    };

    if (level === 'error') {
      console.error(line);
    } else {
      // Keep warnings on stdout so PM2 error logs only contain actual stderr errors.
      console.log(line);
    }

    // 写入文件
    pushToLogBuffer(entry);

    if (fileMgr) {
      const jsonLine = JSON.stringify(entry);
      fileMgr.write(jsonLine);
    }
  }

  function logJson(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const safeMeta = meta ? sanitizeMeta(meta) : undefined;
    const entry: StructuredLogEntry = {
      time: new Date().toISOString(),
      level,
      ...(tag ? { tag } : {}),
      msg: message,
      ...safeMeta,
    };
    const line = JSON.stringify(entry);

    if (level === 'error') {
      console.error(line);
    } else {
      // Keep warnings on stdout so PM2 error logs only contain actual stderr errors.
      console.log(line);
    }

    // 写入文件
    pushToLogBuffer(entry);

    if (fileMgr) {
      fileMgr.write(line);
    }
  }

  const emit = format === 'json' ? logJson : logText;

  return {
    debug(message: string, meta?: Record<string, unknown>) {
      if (shouldLog('debug')) emit('debug', message, meta);
    },
    info(message: string, meta?: Record<string, unknown>) {
      if (shouldLog('info')) emit('info', message, meta);
    },
    warn(message: string, meta?: Record<string, unknown>) {
      if (shouldLog('warn')) emit('warn', message, meta);
    },
    error(message: string, meta?: Record<string, unknown>) {
      if (shouldLog('error')) emit('error', message, meta);
    },
    child(childTag: string): Logger {
      const combined = tag ? `${tag}:${childTag}` : childTag;
      return createLoggerImpl(combined);
    },
  };
}

/** 创建带标签的日志器 */
export function createLogger(tag: string): Logger {
  return createLoggerImpl(tag);
}

/** 默认日志器实例（无标签） */
export const logger: Logger = createLoggerImpl('');
