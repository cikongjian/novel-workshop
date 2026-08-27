import path from 'node:path';
import { getConfig } from '../config/index.js';
import { createRedisClient, testRedisConnection } from '../auth/redis.js';
import { createIpBlacklistService } from '../server/middleware/ip-blacklist.js';

const DEFAULT_MANUAL_BLOCK_MINUTES = 24 * 60;

type IpBlacklistAction = 'list' | 'block' | 'unblock';

type CliOptions =
  | { help: true }
  | { help: false; action: 'list' }
  | { help: false; action: 'block'; ip: string; minutes: number }
  | { help: false; action: 'unblock'; ip: string };

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`参数 ${flag} 缺少值`);
  }
  return value;
}

function parsePositiveInt(raw: string, flag: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`参数 ${flag} 必须是正整数`);
  }
  return value;
}

function parseIpBlacklistArgs(argv: string[]): CliOptions {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }

  const action = argv[0];
  if (action !== 'list' && action !== 'block' && action !== 'unblock') {
    throw new Error(`未知命令: ${action}`);
  }

  if (action === 'list') {
    if (argv.length > 1) {
      throw new Error('list 命令不接受额外参数');
    }
    return { help: false, action };
  }

  let ip = '';
  let minutes = DEFAULT_MANUAL_BLOCK_MINUTES;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--ip') {
      ip = readFlagValue(argv, index, '--ip');
      index += 1;
      continue;
    }
    if (arg === '--minutes') {
      minutes = parsePositiveInt(readFlagValue(argv, index, '--minutes'), '--minutes');
      index += 1;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  if (!ip.trim()) {
    throw new Error('必须通过 --ip 指定目标 IP');
  }

  if (action === 'block') {
    return { help: false, action, ip: ip.trim(), minutes };
  }

  return { help: false, action, ip: ip.trim() };
}

function formatIpBlacklistHelp(invocation = 'nw auth ip-blacklist'): string {
  return [
    `用法: ${invocation} <list|block|unblock> [options]`,
    '',
    '命令:',
    '  list                         列出当前已封禁 IP',
    '  block --ip <ip> [--minutes]  手动封禁 IP，默认 1440 分钟',
    '  unblock --ip <ip>            手动解封 IP',
    '',
    '选项:',
    '  --ip <ip>                    目标 IP 地址',
    '  --minutes <n>                封禁时长（分钟，仅 block 可用）',
    '  -h, --help                   显示帮助',
    '',
    '说明:',
    '  该命令依赖 AUTH_ENABLED=true 且 Redis 可连接。',
    '',
    '示例:',
    `  ${invocation} list`,
    `  ${invocation} block --ip 203.0.113.10 --minutes 60`,
    `  ${invocation} unblock --ip 203.0.113.10`,
  ].join('\n');
}

function printIpBlacklistHelp(invocation?: string): void {
  console.log(formatIpBlacklistHelp(invocation));
}

async function withIpBlacklistService<T>(runner: (
  service: ReturnType<typeof createIpBlacklistService>,
) => Promise<T>): Promise<T> {
  const config = getConfig();
  if (!config.auth.enabled) {
    throw new Error('AUTH_ENABLED=false，当前环境未启用认证与 IP 黑名单。');
  }

  const redis = createRedisClient({
    host: config.auth.redisHost,
    port: config.auth.redisPort,
    password: config.auth.redisPassword,
    db: config.auth.redisDb,
  });

  const redisOk = await testRedisConnection(redis);
  if (!redisOk) {
    redis.disconnect();
    throw new Error('Redis 连接失败，无法管理 IP 黑名单。');
  }

  const service = createIpBlacklistService({
    redis,
    failureThreshold: Number.parseInt(process.env.IP_BLACKLIST_FAILURE_THRESHOLD ?? '5', 10),
    failureWindowMs: Number.parseInt(process.env.IP_BLACKLIST_FAILURE_WINDOW_MIN ?? '10', 10) * 60_000,
    blockDurationMs: Number.parseInt(process.env.IP_BLACKLIST_BLOCK_DURATION_MIN ?? '60', 10) * 60_000,
  });

  try {
    return await runner(service);
  } finally {
    await redis.quit().catch(() => {
      redis.disconnect();
    });
  }
}

export async function runIpBlacklistCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'nw auth ip-blacklist',
): Promise<number> {
  let options: CliOptions;
  try {
    options = parseIpBlacklistArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    printIpBlacklistHelp(invocation);
    return 1;
  }

  if (options.help) {
    printIpBlacklistHelp(invocation);
    return 0;
  }

  const result = await withIpBlacklistService(async (service) => {
    if (options.action === 'list') {
      const items = await service.listBlocked();
      items.sort((left, right) => left.unblocksAt - right.unblocksAt);
      return { items, total: items.length };
    }

    if (options.action === 'block') {
      const durationMs = options.minutes * 60_000;
      await service.manualBlock(options.ip, durationMs);
      return {
        ok: true,
        action: options.action,
        ip: options.ip,
        durationMinutes: options.minutes,
        blockedUntil: Date.now() + durationMs,
      };
    }

    await service.manualUnblock(options.ip);
    return {
      ok: true,
      action: options.action,
      ip: options.ip,
    };
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runIpBlacklistCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('ip-blacklist');
}

if (isExecutedAsEntry()) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
