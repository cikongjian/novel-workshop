import path from 'node:path';
import { ArcSummaryAgent } from '../agents/arc-summary.js';
import { getConfig, getNovelsDir } from '../config/index.js';
import { NovelMemory } from '../memory/novel-memory.js';
import { createEmbeddingClient, createModelClient } from '../models/provider.js';
import { NovelManager } from '../novel/novel-manager.js';
import { executeBatchArcSummary } from '../services/batch-arc-summary.js';

type CliOptions = {
  novelId: string;
  help?: boolean;
};

export type BatchArcSummaryCliOptions = CliOptions;

function parseBatchArcSummaryArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  let novelId = '';
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--novel' && argv[i + 1]) {
      novelId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--novel=')) {
      novelId = arg.slice('--novel='.length);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
    }
  }

  if (!help && !novelId) {
    throw new Error('缺少 --novel <novelId>');
  }

  return { novelId, help };
}

function formatBatchArcSummaryHelp(invocation = 'nw generate batch-arc-summary'): string {
  return [
    `用法: ${invocation} --novel <novelId>`,
    '',
    '选项:',
    '  --novel <novelId>   必填，目标小说 ID',
    '  -h, --help          显示帮助',
    '',
    '说明:',
    '  仅处理已形成完整 10 章区间的弧线，并写入记忆索引。',
  ].join('\n');
}

function printBatchArcSummaryHelp(invocation?: string): void {
  console.log(formatBatchArcSummaryHelp(invocation));
}

export async function runBatchArcSummaryCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'nw generate batch-arc-summary',
): Promise<number> {
  const options = parseBatchArcSummaryArgs(argv);
  if (options.help) {
    printBatchArcSummaryHelp(invocation);
    return 0;
  }

  const config = getConfig();
  const novelsDir = getNovelsDir();
  const novelManager = new NovelManager(novelsDir);
  const modelClient = createModelClient(config);
  const embeddingClient = createEmbeddingClient(config);
  const novelMemory = new NovelMemory(novelsDir, embeddingClient, {
    hybridSearchEnabled: config.memory.hybridSearchEnabled,
  });
  const arcAgent = new ArcSummaryAgent();

  try {
    console.log(`[batch-arc-summary] novel=${options.novelId}`);
    const summary = await executeBatchArcSummary({
      novelId: options.novelId,
      novelManager,
      novelMemory,
      modelClient,
      arcAgent,
      onFrame: (frame) => {
        if (frame.type !== 'batch-arc-summary:progress') {
          return;
        }
        console.log(
          `[batch-arc-summary] progress ${frame.done}/${frame.total} arc=${frame.arcNumber} novel=${frame.novelId}`,
        );
      },
    });
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 0;
  } finally {
    novelMemory.close(options.novelId);
    novelMemory.close();
  }
}

async function main(): Promise<void> {
  process.exitCode = await runBatchArcSummaryCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('batch-arc-summary');
}

if (isExecutedAsEntry()) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
