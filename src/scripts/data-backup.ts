#!/usr/bin/env tsx
/**
 * 数据备份工具
 *
 * 将 DATA_DIR 下的数据目录打包为 .tar.gz 备份文件，支持按份数保留。
 *
 * 合规要求：根据《网络安全法》及公安备案承诺，用户数据需定期备份，
 * 备份文件保留不少于 7 份（约 1 周），确保数据可恢复。
 *
 * 用法：
 *   npm run backup:data                         # 预览（dry-run）
 *   npm run backup:data -- --no-dry-run         # 执行备份
 *   npm run backup:data -- --keep 14            # 保留 14 份
 *   npm run backup:data -- --output /path/to    # 指定备份目录
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream, existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = path.join(__dirname, '../../data');
const DEFAULT_BACKUP_DIR = path.join(__dirname, '../../backups');
const DEFAULT_KEEP_COUNT = 7;

function resolveDataDir(): string {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : DEFAULT_DATA_DIR;
}

function resolveBackupDir(override?: string): string {
  return override ?? (process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : DEFAULT_BACKUP_DIR);
}

function buildBackupFilename(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `data-backup-${ts}.tar.gz`;
}

async function listBackups(backupDir: string): Promise<Array<{ name: string; fullPath: string; mtime: Date }>> {
  try {
    const entries = await fs.readdir(backupDir);
    const backups = await Promise.all(
      entries
        .filter((f) => f.startsWith('data-backup-') && f.endsWith('.tar.gz'))
        .map(async (f) => {
          const fullPath = path.join(backupDir, f);
          const stat = await fs.stat(fullPath);
          return { name: f, fullPath, mtime: stat.mtime };
        }),
    );
    return backups.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
  } catch {
    return [];
  }
}

type BackupOptions = {
  dryRun: boolean;
  keep: number;
  outputDir?: string;
};

function parseDataBackupArgs(argv: string[]): BackupOptions | null {
  const options: BackupOptions = { dryRun: true, keep: DEFAULT_KEEP_COUNT };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--keep':
      case '-k': {
        const val = parseInt(argv[i + 1] ?? '', 10);
        if (!isNaN(val) && val > 0) options.keep = val;
        i += 1;
        break;
      }
      case '--output':
      case '-o':
        options.outputDir = argv[i + 1];
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

  return options;
}

function formatHelp(invocation = 'npm run backup:data --'): string {
  return `
数据备份工具

合规要求：用户数据需定期备份，备份文件保留不少于 ${DEFAULT_KEEP_COUNT} 份。

用法：
  ${invocation} [选项]

选项：
  -k, --keep <number>     保留最近 N 份备份 (默认: ${DEFAULT_KEEP_COUNT})
  -o, --output <path>     备份输出目录 (默认: ./backups，或 BACKUP_DIR 环境变量)
  --dry-run               预览将执行的操作，不实际写入
  --no-dry-run            实际执行备份
  -h, --help              显示帮助信息

示例：
  ${invocation}                        # 预览备份
  ${invocation} --no-dry-run           # 执行备份，保留 ${DEFAULT_KEEP_COUNT} 份
  ${invocation} --no-dry-run --keep 14 # 执行备份，保留 14 份
`.trim();
}

async function runBackup(options: BackupOptions): Promise<void> {
  const dataDir = resolveDataDir();
  const backupDir = resolveBackupDir(options.outputDir);

  if (!existsSync(dataDir)) {
    console.error(`数据目录不存在: ${dataDir}`);
    return;
  }

  const filename = buildBackupFilename();
  const destPath = path.join(backupDir, filename);

  console.log(`\n数据备份`);
  console.log(`  数据目录: ${dataDir}`);
  console.log(`  备份目录: ${backupDir}`);
  console.log(`  备份文件: ${filename}`);
  console.log(`  保留份数: ${options.keep}`);
  if (options.dryRun) {
    console.log('\n[预览模式] 不会实际写入文件，加 --no-dry-run 执行备份');
  }

  if (!options.dryRun) {
    await fs.mkdir(backupDir, { recursive: true });
    // 使用 tar 打包（Windows 10 1903+ 和所有 Linux/macOS 均自带 tar）
    const cmd = `tar -czf "${destPath}" -C "${path.dirname(dataDir)}" "${path.basename(dataDir)}"`;
    console.log(`\n执行: ${cmd}`);
    try {
      await execAsync(cmd);
      const stat = await fs.stat(destPath);
      const sizeMb = (stat.size / 1024 / 1024).toFixed(2);
      console.log(`备份完成: ${filename} (${sizeMb} MB)`);
    } catch (err) {
      console.error('备份失败:', err instanceof Error ? err.message : String(err));
      return;
    }
  }

  // 清理旧备份
  const existing = await listBackups(backupDir);
  const toDelete = existing.slice(0, Math.max(0, existing.length - options.keep + (options.dryRun ? 0 : 1)));

  if (toDelete.length > 0) {
    console.log(`\n清理旧备份（保留最新 ${options.keep} 份）:`);
    for (const backup of toDelete) {
      console.log(`  ${options.dryRun ? '[预览]' : '[删除]'} ${backup.name}`);
      if (!options.dryRun) {
        await fs.unlink(backup.fullPath);
      }
    }
  } else {
    console.log(`\n无需清理旧备份（当前共 ${existing.length} 份）`);
  }
}

export async function runDataBackupCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run backup:data --',
): Promise<number> {
  const options = parseDataBackupArgs(argv);
  if (options === null) {
    console.log(formatHelp(invocation));
    return 0;
  }
  await runBackup(options);
  return 0;
}

function isExecutedAsEntry(): boolean {
  return process.argv[1]?.includes('data-backup') ?? false;
}

if (isExecutedAsEntry()) {
  void runDataBackupCli().then((code) => process.exit(code));
}