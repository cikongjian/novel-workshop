#!/usr/bin/env tsx
/**
 * 日志清理工具
 *
 * 清理过期的日志文件，支持按天数保留。
 *
 * 合规要求：根据《网络安全法》等法规，日志需保留至少 6 个月（180 天）。
 * 重要日志（举报、违规、封禁等）应保留 1 年以上，请勿清理。
 *
 * 用法：
 *   npm run log:cleanup                    # 清理 180 天前的普通日志
 *   npm run log:cleanup -- --days 365      # 清理 1 年前的日志
 *   npm run log:cleanup -- --dry-run       # 预览将要删除的文件
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_LOG_DIR = path.join(__dirname, '../../logs');
// 合规要求：日志保留至少 6 个月（180 天）
const DEFAULT_RETENTION_DAYS = 180;

function resolveLogDir(): string {
  return process.env.LOG_DIR || DEFAULT_LOG_DIR;
}

async function getLogFiles(logDir: string): Promise<Array<{ name: string; path: string; date: Date }>> {
  try {
    const files = await fs.readdir(logDir);
    const logFiles = await Promise.all(
      files
        .filter(f => f.startsWith('app-') && f.endsWith('.log'))
        .map(async f => {
          const filePath = path.join(logDir, f);
          const stats = await fs.stat(filePath);
          return {
            name: f,
            path: filePath,
            date: stats.mtime,
          };
        })
    );
    return logFiles.sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch {
    return [];
  }
}

function shouldDelete(fileDate: Date, retentionDays: number): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  return fileDate < cutoff;
}

type CleanupOptions = {
  days: number;
  dryRun: boolean;
};

function parseLogCleanupArgs(argv: string[]): CleanupOptions | null {
  const options: CleanupOptions = {
    days: DEFAULT_RETENTION_DAYS,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--days':
      case '-d':
        options.days = parseInt(argv[i + 1] ?? '', 10);
        i += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--no-dry-run':
        options.dryRun = false;
        break;
      case '--help':
      case '-h':
        return null;
      default:
        break;
    }
  }

  if (!argv.includes('--dry-run') && !argv.includes('--no-dry-run')) {
    options.dryRun = true;
  }

  return options;
}

function formatLogCleanupHelp(invocation = 'npm run log:cleanup --'): string {
  return `
日志清理工具

合规要求：根据《网络安全法》，日志需保留至少 6 个月（180 天）。
重要日志（举报/违规/封禁）应保留 1 年以上。

用法：
  ${invocation} [选项]

选项：
  -d, --days <number>     保留最近 N 天的日志 (默认: 180)
  --dry-run               预览将要删除的文件，不实际删除
  --no-dry-run            实际执行清理
  -h, --help              显示帮助信息

示例：
  ${invocation}                      # 预览 180 天前的日志
  ${invocation} --days 365           # 只保留最近 1 年
  ${invocation} --no-dry-run         # 执行清理
`.trim();
}

export async function runLogCleanupCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run log:cleanup --',
): Promise<number> {
  const options = parseLogCleanupArgs(argv);
  if (options === null) {
    console.log(formatLogCleanupHelp(invocation));
    return 0;
  }

  await cleanupLogs(options);
  return 0;
}

async function cleanupLogs(options: CleanupOptions): Promise<void> {
  const logDir = resolveLogDir();

  // 检查日志目录是否存在
  try {
    await fs.access(logDir);
  } catch {
    console.log('日志目录不存在，无需清理');
    return;
  }

  const logFiles = await getLogFiles(logDir);

  if (logFiles.length === 0) {
    console.log('没有找到日志文件');
    return;
  }

  const toDelete = logFiles.filter(f => shouldDelete(f.date, options.days));
  const toKeep = logFiles.filter(f => !shouldDelete(f.date, options.days));

  console.log(`\n日志目录: ${logDir}`);
  console.log(`保留天数: ${options.days} 天`);
  console.log(`总文件数: ${logFiles.length}`);
  console.log(`将保留: ${toKeep.length} 个文件`);
  console.log(`将删除: ${toDelete.length} 个文件\n`);

  if (toDelete.length > 0) {
    if (options.dryRun) {
      console.log('预览将要删除的文件：');
      for (const file of toDelete) {
        const dateStr = file.date.toISOString().slice(0, 10);
        console.log(`  ${file.name} (${dateStr})`);
      }
      console.log('\n[预览模式] 未实际删除文件。使用 --no-dry-run 执行清理。');
    } else {
      console.log('正在删除旧日志文件...');
      for (const file of toDelete) {
        try {
          await fs.unlink(file.path);
          console.log(`  ✓ 删除: ${file.name}`);
        } catch (err) {
          console.error(`  ✗ 失败: ${file.name} - ${err}`);
        }
      }
      console.log('\n清理完成！');
    }
  } else {
    console.log('没有需要清理的文件');
  }

  // 统计日志大小
  const allStats = await Promise.all(
    toKeep.map(async f => {
      try {
        const stats = await fs.stat(f.path);
        return stats.size;
      } catch {
        return 0;
      }
    })
  );
  const totalSize = allStats.reduce((a, b) => a + b, 0);
  const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
  console.log(`\n当前日志总大小: ${sizeMB} MB`);
}

async function main(): Promise<void> {
  process.exitCode = await runLogCleanupCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('log-cleanup');
}

if (isExecutedAsEntry()) {
  void main().catch(err => {
    console.error('清理失败:', err);
    process.exit(1);
  });
}
