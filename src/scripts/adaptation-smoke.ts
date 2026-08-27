import path from 'node:path';
import { createAdaptationSmokeService } from '../adaptation/smoke-service.js';

type CliOptions = {
  novelId?: string;
  samples: number;
  outPath?: string;
  help?: boolean;
};

export type AdaptationSmokeCliOptions = CliOptions;

export type AdaptationSmokeResult = {
  report: unknown;
  outputPath?: string;
};

function parsePositiveInt(input: string | undefined): number | undefined {
  if (!input) {
    return undefined;
  }

  const parsed = Number.parseInt(input, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10) {
    return undefined;
  }

  return parsed;
}

function parseAdaptationSmokeArgs(argv: string[]): CliOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    return {
      samples: 3,
      help: true,
    };
  }

  const options: CliOptions = { samples: 3, help: false };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    if (arg === '--novel' && argv[i + 1]) {
      options.novelId = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--novel=')) {
      options.novelId = arg.slice('--novel='.length);
      continue;
    }

    if (arg === '--samples' && argv[i + 1]) {
      const parsed = parsePositiveInt(argv[i + 1]);
      if (parsed) {
        options.samples = parsed;
      }
      i += 1;
      continue;
    }

    if (arg.startsWith('--samples=')) {
      const parsed = parsePositiveInt(arg.slice('--samples='.length));
      if (parsed) {
        options.samples = parsed;
      }
      continue;
    }

    if (arg === '--out' && argv[i + 1]) {
      options.outPath = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--out=')) {
      options.outPath = arg.slice('--out='.length);
    }
  }

  const positionalSamples = parsePositiveInt(positionals[0]);
  if (positionalSamples) {
    options.samples = positionalSamples;
  }

  if (positionals[1]) {
    options.outPath = positionals[1];
  }

  return options;
}

function formatAdaptationSmokeHelp(invocation = 'npm run smoke:adaptation --'): string {
  return [
    `用法: ${invocation} [samples] [outputPath] [options]`,
    '',
    '选项:',
    '  --novel <id>        指定小说 ID',
    '  --samples <count>   抽样数量，1-10，默认 3',
    '  --out <path>        JSON 输出路径',
    '  -h, --help          显示帮助',
    '',
    '示例:',
    `  ${invocation}`,
    `  ${invocation} 5 docs/adaptation-smoke-latest.json`,
    `  ${invocation} --novel <novelId> --samples 2 --out docs/adaptation-smoke-latest.json`,
  ].join('\n');
}

function printAdaptationSmokeHelp(invocation?: string): void {
  console.log(formatAdaptationSmokeHelp(invocation));
}

export async function executeAdaptationSmoke(options: CliOptions): Promise<AdaptationSmokeResult> {
  const smokeService = createAdaptationSmokeService();
  const report = await smokeService.run({
    samples: options.samples,
    novelId: options.novelId,
  });

  if (options.outPath) {
    await smokeService.writeJsonReport(report, options.outPath);
  }

  return {
    report,
    outputPath: options.outPath,
  };
}

export async function runAdaptationSmokeCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run smoke:adaptation --',
): Promise<number> {
  const options = parseAdaptationSmokeArgs(argv);
  if (options.help) {
    printAdaptationSmokeHelp(invocation);
    return 0;
  }

  const result = await executeAdaptationSmoke(options);
  if (result.outputPath) {
    console.log(`JSON 报告已写入: ${result.outputPath}`);
  }
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runAdaptationSmokeCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }

  return path.basename(argv1).includes('adaptation-smoke');
}

if (isExecutedAsEntry()) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
