import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NovelOrganizationScopeValues,
  type NovelOrganizationScope,
} from '../novel/novel-data-organizer.js';
import { createRemoteNovelDataClient } from './remote-novel-data-client.js';
import { runRemoteNovelDataCommand } from './remote-novel-data-runner.js';

export type RemoteNovelDataOptions = {
  action: 'doctor' | 'list' | 'audit' | 'organize' | 'backups' | 'rollback'
    | 'chapter-check' | 'chapter-repair' | 'memory-check' | 'memory-rebuild' | 'cover-prompt';
  baseUrl: string;
  token?: string;
  tokenFile?: string;
  novelId?: string;
  all: boolean;
  scopes: NovelOrganizationScope[];
  search?: string;
  ownerId?: string;
  limit: number;
  offset: number;
  timeoutMs: number;
  retries: number;
  apply: boolean;
  confirm?: string;
  planToken?: string;
  backupId?: string;
  outputPath?: string;
  json: boolean;
  allowHttp: boolean;
  noAuth: boolean;
  help: boolean;
};

function takeValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} 缺少参数`);
  return value;
}

function parseInteger(value: string, option: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${option} 必须在 ${min}-${max} 之间`);
  }
  return parsed;
}

export function parseRemoteNovelDataOptions(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): RemoteNovelDataOptions {
  const action = argv[0];
  if (action === '--help' || action === '-h' || action === undefined) {
    return {
      action: 'list',
      baseUrl: env.NW_REMOTE_BASE_URL ?? '',
      token: env.NW_REMOTE_TOKEN,
      scopes: [...NovelOrganizationScopeValues],
      all: false,
      limit: 30,
      offset: 0,
      timeoutMs: 20_000,
      retries: 1,
      apply: false,
      json: false,
      allowHttp: false,
      noAuth: false,
      help: true,
    };
  }
  if (![
    'doctor', 'list', 'audit', 'organize', 'backups', 'rollback',
    'chapter-check', 'chapter-repair', 'memory-check', 'memory-rebuild', 'cover-prompt',
  ].includes(action)) {
    throw new Error(`未知操作：${action}`);
  }

  const options: RemoteNovelDataOptions = {
    action: action as RemoteNovelDataOptions['action'],
    baseUrl: env.NW_REMOTE_BASE_URL ?? '',
    token: env.NW_REMOTE_TOKEN,
    scopes: [...NovelOrganizationScopeValues],
    all: false,
    limit: 30,
    offset: 0,
    timeoutMs: action === 'memory-rebuild'
      ? 600_000
      : action === 'cover-prompt'
        ? 180_000
        : 20_000,
    retries: 1,
    apply: false,
    json: false,
    allowHttp: false,
    noAuth: false,
    help: false,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--base-url') { options.baseUrl = takeValue(argv, index, arg); index += 1; continue; }
    if (arg === '--token') { options.token = takeValue(argv, index, arg); index += 1; continue; }
    if (arg === '--token-file') { options.tokenFile = takeValue(argv, index, arg); index += 1; continue; }
    if (arg === '--novel') { options.novelId = takeValue(argv, index, arg); index += 1; continue; }
    if (arg === '--all') { options.all = true; continue; }
    if (arg === '--scope') {
      const values = takeValue(argv, index, arg).split(',').map(value => value.trim()).filter(Boolean);
      const invalid = values.filter(value => !NovelOrganizationScopeValues.includes(value as NovelOrganizationScope));
      if (invalid.length > 0 || values.length === 0) throw new Error(`--scope 无效：${invalid.join(', ')}`);
      options.scopes = values as NovelOrganizationScope[];
      index += 1;
      continue;
    }
    if (arg === '--search') { options.search = takeValue(argv, index, arg); index += 1; continue; }
    if (arg === '--owner') { options.ownerId = takeValue(argv, index, arg); index += 1; continue; }
    if (arg === '--limit') {
      options.limit = parseInteger(takeValue(argv, index, arg), arg, 1, 100);
      index += 1;
      continue;
    }
    if (arg === '--offset') {
      options.offset = parseInteger(takeValue(argv, index, arg), arg, 0, 1_000_000);
      index += 1;
      continue;
    }
    if (arg === '--timeout') {
      options.timeoutMs = parseInteger(takeValue(argv, index, arg), arg, 1_000, 1_800_000);
      index += 1;
      continue;
    }
    if (arg === '--retries') {
      options.retries = parseInteger(takeValue(argv, index, arg), arg, 0, 3);
      index += 1;
      continue;
    }
    if (arg === '--confirm') { options.confirm = takeValue(argv, index, arg); index += 1; continue; }
    if (arg === '--plan-token') { options.planToken = takeValue(argv, index, arg); index += 1; continue; }
    if (arg === '--backup') { options.backupId = takeValue(argv, index, arg); index += 1; continue; }
    if (arg === '--out') { options.outputPath = takeValue(argv, index, arg); index += 1; continue; }
    if (arg === '--apply') { options.apply = true; continue; }
    if (arg === '--json') { options.json = true; continue; }
    if (arg === '--allow-http') { options.allowHttp = true; continue; }
    if (arg === '--no-auth') { options.noAuth = true; continue; }
    throw new Error(`未知参数：${arg}`);
  }

  if (!options.help && !options.baseUrl) throw new Error('缺少 --base-url 或 NW_REMOTE_BASE_URL');
  if (!options.help && action === 'audit' && !options.novelId && !options.all) {
    throw new Error('audit 需要 --novel <id> 或 --all');
  }
  if (options.all && action !== 'audit') throw new Error('--all 只能用于 audit');
  if (options.all && options.novelId) throw new Error('--all 与 --novel 不能同时使用');
  if (!options.help && action === 'organize' && !options.novelId) {
    throw new Error('organize 需要 --novel <id>');
  }
  if (!options.help && (action === 'backups' || action === 'rollback') && !options.novelId) {
    throw new Error(`${action} 需要 --novel <id>`);
  }
  if (!options.help && (action === 'chapter-check' || action === 'chapter-repair') && !options.novelId) {
    throw new Error(`${action} 需要 --novel <id>`);
  }
  if (!options.help && (action === 'memory-check' || action === 'memory-rebuild') && !options.novelId) {
    throw new Error(`${action} 需要 --novel <id>`);
  }
  if (!options.help && action === 'cover-prompt' && !options.novelId) {
    throw new Error('cover-prompt 需要 --novel <id>');
  }
  if (
    options.apply
    && action !== 'organize'
    && action !== 'rollback'
    && action !== 'chapter-repair'
    && action !== 'memory-rebuild'
  ) {
    throw new Error('--apply 只能用于 organize、chapter-repair、memory-rebuild 或 rollback');
  }
  if (action === 'rollback' && !options.apply) throw new Error('rollback 必须显式提供 --apply');
  if (action === 'rollback' && !options.backupId) throw new Error('rollback 需要 --backup <id>');
  if (options.apply && options.confirm !== options.novelId) {
    throw new Error('--apply 必须同时提供与 --novel 完全一致的 --confirm');
  }
  if (options.planToken && (!options.apply || (action !== 'organize' && action !== 'chapter-repair'))) {
    throw new Error('--plan-token 只能与 organize/chapter-repair --apply 一起使用');
  }
  if (options.planToken && !/^[a-f0-9]{64}$/u.test(options.planToken)) {
    throw new Error('--plan-token 必须是 64 位 SHA-256 摘要');
  }
  if (!options.help && !options.noAuth && !options.token && !options.tokenFile) {
    throw new Error('缺少管理员令牌；请设置 NW_REMOTE_TOKEN 或使用 --token-file');
  }
  return options;
}

export function formatRemoteNovelDataHelp(invocation = 'nw remote novel-data'): string {
  return [
    '远程小说数据维护 CLI',
    '',
    `用法：${invocation} <doctor|list|audit|organize|chapter-check|chapter-repair|memory-check|memory-rebuild|cover-prompt|backups|rollback> [参数]`,
    '',
    '通用参数：',
    '  --base-url <url>       平台地址，也可用 NW_REMOTE_BASE_URL',
    '  --token-file <path>    管理员 JWT 文件；推荐使用 NW_REMOTE_TOKEN 环境变量',
    '  --timeout <ms>         请求超时，默认 20000；记忆重建默认 600000',
    '  --retries <0-3>        只读请求重试次数，默认 1；写操作永不自动重试',
    '  --json                 输出完整 JSON',
    '  --out <path>           原子写入可留档的 JSON 报告（不写入管理员令牌）',
    '  --allow-http           允许远程明文 HTTP（生产环境不建议）',
    '',
    '操作：',
    '  doctor                 检查网络、管理员认证、协议版本和备份能力',
    '  list [--search <text>] [--owner <id>] [--limit 30] [--offset 0]',
    '  audit --novel <id>',
    '  audit --all [--limit 30] [--offset 0]  批量只读审计当前页',
    '  organize --novel <id> [--scope characters,metadata,outline,threads,finalization,facts]',
    '  organize --novel <id> --apply --confirm <id>',
    '             [--plan-token <sha256>]  使用已审阅计划；省略时执行前自动重新预览',
    '  chapter-check --novel <id>          检查失败空章和可疑空章',
    '  chapter-repair --novel <id>         默认只预览可安全清理的失败占位章',
    '  chapter-repair --novel <id> --apply --confirm <id> [--plan-token <sha256>]',
    '  memory-check --novel <id>           检查源数据与向量记忆覆盖度',
    '  memory-rebuild --novel <id>         只预检，不改动远程索引',
    '  memory-rebuild --novel <id> --apply --confirm <id>  增量补齐记忆索引',
    '  cover-prompt --novel <id>           诊断封面提示词模型、耗时与模板回退原因',
    '  backups --novel <id>',
    '  rollback --novel <id> --backup <backupId> --apply --confirm <id>',
    '',
    'organize 默认只预览。执行写入前服务端会自动创建单书备份。',
  ].join('\n');
}

async function resolveToken(options: RemoteNovelDataOptions): Promise<string | undefined> {
  if (options.token) return options.token.trim();
  if (!options.tokenFile) return undefined;
  return (await fs.readFile(path.resolve(options.tokenFile), 'utf8')).trim();
}

export async function runRemoteNovelDataCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'nw remote novel-data',
): Promise<number> {
  const options = parseRemoteNovelDataOptions(argv);
  if (options.help) {
    console.log(formatRemoteNovelDataHelp(invocation));
    return 0;
  }
  const token = await resolveToken(options);
  if (!options.noAuth && !token) throw new Error('管理员令牌文件为空');
  const client = createRemoteNovelDataClient({
    baseUrl: options.baseUrl,
    token,
    allowHttp: options.allowHttp,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
  });
  return runRemoteNovelDataCommand(options, client);
}

function isDirectExecution(): boolean {
  const argv1 = process.argv[1];
  return Boolean(argv1 && fileURLToPath(import.meta.url) === path.resolve(argv1));
}

if (isDirectExecution()) {
  runRemoteNovelDataCli().then(code => { process.exitCode = code; }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
