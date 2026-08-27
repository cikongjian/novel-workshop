import path from 'node:path';
import { createAdaptationSmokeService } from '../adaptation/smoke-service.js';

type CliOptions = {
  inputPath: string;
  outputPath: string;
  help?: boolean;
};

export type AdaptationSmokeReportCliOptions = CliOptions;

export type AdaptationSmokeReportResult = {
  outputPath: string;
};

function parseAdaptationSmokeReportArgs(argv: string[]): CliOptions {
  if (argv.includes('--help') || argv.includes('-h')) {
    return {
      inputPath: '',
      outputPath: '',
      help: true,
    };
  }

  const inputPath = argv[0];
  if (!inputPath) {
    throw new Error('缺少输入文件。示例：npm run smoke:adaptation:report -- docs/adaptation-smoke-latest.json');
  }
  const outputPath = argv[1] ?? inputPath.replace(/\.json$/i, '.md');
  return { inputPath, outputPath, help: false };
}

function formatAdaptationSmokeReportHelp(invocation = 'npm run smoke:adaptation:report --'): string {
  return [
    `用法: ${invocation} <inputPath> [outputPath]`,
    '',
    '参数:',
    '  inputPath           Adaptation smoke JSON 输出文件',
    '  outputPath          Markdown 报告输出路径，默认和输入同名 .md',
    '',
    '示例:',
    `  ${invocation} docs/adaptation-smoke-latest.json`,
    `  ${invocation} docs/adaptation-smoke-latest.json docs/adaptation-smoke-latest.md`,
  ].join('\n');
}

function printAdaptationSmokeReportHelp(invocation?: string): void {
  console.log(formatAdaptationSmokeReportHelp(invocation));
}

export async function executeAdaptationSmokeReport(options: CliOptions): Promise<AdaptationSmokeReportResult> {
  const smokeService = createAdaptationSmokeService();
  const result = await smokeService.generateMarkdownReportFromJson(options.inputPath, options.outputPath);
  return {
    outputPath: result.outputPath,
  };
}

export async function runAdaptationSmokeReportCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run smoke:adaptation:report --',
): Promise<number> {
  const options = parseAdaptationSmokeReportArgs(argv);
  if (options.help) {
    printAdaptationSmokeReportHelp(invocation);
    return 0;
  }

  const result = await executeAdaptationSmokeReport(options);
  console.log(`报告已生成：${result.outputPath}`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runAdaptationSmokeReportCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('adaptation-smoke-report');
}

if (isExecutedAsEntry()) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
