import path from 'node:path';
import { getConfig } from '../config/index.js';
import { UserBanManager } from '../bookstore/user-ban-manager.js';

function formatCleanupExpiredBansHelp(invocation = 'nw moderation cleanup-expired-bans'): string {
  return [
    `用法: ${invocation}`,
    '',
    '清理 user-bans.json 中已过期但仍标记为生效的临时封禁记录。',
  ].join('\n');
}

function printCleanupExpiredBansHelp(invocation?: string): void {
  console.log(formatCleanupExpiredBansHelp(invocation));
}

export async function runCleanupExpiredBansCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'nw moderation cleanup-expired-bans',
): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    printCleanupExpiredBansHelp(invocation);
    return 0;
  }

  const manager = new UserBanManager(getConfig().dataDir);
  const cleanedCount = await manager.cleanupExpiredBans();
  process.stdout.write(`${JSON.stringify({ success: true, cleanedCount }, null, 2)}\n`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runCleanupExpiredBansCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('cleanup-expired-bans');
}

if (isExecutedAsEntry()) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
