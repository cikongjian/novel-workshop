import path from 'node:path';
import { createAdaptationSmokeService } from '../adaptation/smoke-service.js';

type CliOptions = {
  dryRun: boolean;
  keep: number;
  help?: boolean;
};

export type AdaptationSmokeCleanCliOptions = CliOptions;

function parseAdaptationSmokeCleanArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: true,
    keep: 1,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') {
      options.dryRun = false;
      continue;
    }
    if (arg === '--keep' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        options.keep = parsed;
      }
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
  }

  return options;
}

function formatAdaptationSmokeCleanHelp(invocation = 'npm run smoke:adaptation:clean --'): string {
  return [
    `用法: ${invocation} [options]`,
    '',
    '选项:',
    '  --apply             实际删除旧的 smoke 产物，默认仅预览',
    '  --keep <count>      保留最近 N 份结果，默认 1',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation}`,
    `  ${invocation} --apply --keep 3`,
  ].join('\n');
}

function printAdaptationSmokeCleanHelp(invocation?: string): void {
  console.log(formatAdaptationSmokeCleanHelp(invocation));
}

export async function executeAdaptationSmokeClean(options: CliOptions): Promise<Awaited<ReturnType<ReturnType<typeof createAdaptationSmokeService>['cleanup']>>> {
  const smokeService = createAdaptationSmokeService();
  return smokeService.cleanup({
    dryRun: options.dryRun,
    keep: options.keep,
  });
}

export async function runAdaptationSmokeCleanCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run smoke:adaptation:clean --',
): Promise<number> {
  const options = parseAdaptationSmokeCleanArgs(argv);
  if (options.help) {
    printAdaptationSmokeCleanHelp(invocation);
    return 0;
  }

  const summary = await executeAdaptationSmokeClean(options);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runAdaptationSmokeCleanCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('adaptation-smoke-clean');
}

if (isExecutedAsEntry()) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
