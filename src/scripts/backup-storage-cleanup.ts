import path from 'node:path';
import { getNovelsDir } from '../config/index.js';
import { StorageCleanupScheduler } from '../backup/storage-cleanup.js';

type CliOptions = {
  apply: boolean;
  help?: boolean;
};

export type BackupStorageCleanupCliOptions = CliOptions;

function parseBackupStorageCleanupArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function formatBackupStorageCleanupHelp(invocation = 'nw backup storage-cleanup'): string {
  return [
    `用法: ${invocation} [options]`,
    '',
    '选项:',
    '  --apply             实际执行存储清理；默认仅预览',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation}`,
    `  ${invocation} --apply`,
  ].join('\n');
}

function printBackupStorageCleanupHelp(invocation?: string): void {
  console.log(formatBackupStorageCleanupHelp(invocation));
}

export async function executeBackupStorageCleanup(options: CliOptions) {
  const scheduler = new StorageCleanupScheduler(getNovelsDir());
  const result = options.apply ? await scheduler.runNow() : await scheduler.preview();
  return {
    ...result,
    mode: options.apply ? 'apply' : 'preview',
    freedMB: Number((result.freedBytes / 1024 / 1024).toFixed(1)),
  };
}

export async function runBackupStorageCleanupCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'nw backup storage-cleanup',
): Promise<number> {
  const options = parseBackupStorageCleanupArgs(argv);
  if (options.help) {
    printBackupStorageCleanupHelp(invocation);
    return 0;
  }

  const result = await executeBackupStorageCleanup(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runBackupStorageCleanupCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('backup-storage-cleanup');
}

if (isExecutedAsEntry()) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
