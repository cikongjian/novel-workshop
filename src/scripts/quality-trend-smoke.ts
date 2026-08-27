import path from 'node:path';
import { z } from 'zod';

const TrendItem = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string(),
  status: z.string(),
  wordCount: z.number().int().nonnegative(),
  stylePreset: z.string(),
  overallScore: z.number(),
  structureScore: z.number(),
  styleScore: z.number(),
  emotionScore: z.number(),
  findingsCount: z.number().int().nonnegative(),
  passed: z.boolean(),
  summary: z.string(),
});

const TrendResponse = z.object({
  novelId: z.string().min(1),
  items: z.array(TrendItem),
  summary: z.object({
    count: z.number().int().nonnegative(),
    passCount: z.number().int().nonnegative(),
    avgOverall: z.number(),
    avgStructure: z.number(),
    avgStyle: z.number(),
    avgEmotion: z.number(),
  }),
  generatedAt: z.string().datetime(),
});

export type QualityTrendSmokeOptions = {
  baseUrl: string;
  novelId: string;
  from?: number;
  to?: number;
  limit?: number;
  failedOnly?: boolean;
};

export type QualityTrendSmokeSummary = {
  novelId: string;
  count: number;
  passCount: number;
  maxChapter: number | 'N/A';
  avgOverall: number;
  avgStructure: number;
  avgStyle: number;
  avgEmotion: number;
};

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function parseQualityTrendSmokeEnv(env: NodeJS.ProcessEnv = process.env): QualityTrendSmokeOptions {
  const baseUrl = env.QUALITY_TREND_SMOKE_BASE_URL ?? 'http://localhost:3000/api';
  const novelId = env.QUALITY_TREND_SMOKE_NOVEL_ID;
  if (!novelId) {
    throw new Error('缺少 QUALITY_TREND_SMOKE_NOVEL_ID');
  }

  return {
    baseUrl,
    novelId,
    from: parsePositiveInt(env.QUALITY_TREND_SMOKE_FROM),
    to: parsePositiveInt(env.QUALITY_TREND_SMOKE_TO),
    limit: parsePositiveInt(env.QUALITY_TREND_SMOKE_LIMIT),
    failedOnly: parseOptionalBoolean(env.QUALITY_TREND_SMOKE_FAILED_ONLY),
  };
}

function formatQualityTrendSmokeHelp(invocation = 'npm run check:quality-trend'): string {
  return [
    `用法: QUALITY_TREND_SMOKE_NOVEL_ID=<novelId> ${invocation}`,
    '',
    '环境变量:',
    '  QUALITY_TREND_SMOKE_BASE_URL    默认 http://localhost:3000/api',
    '  QUALITY_TREND_SMOKE_NOVEL_ID    必填，目标小说 ID',
    '  QUALITY_TREND_SMOKE_FROM        可选，起始章节号',
    '  QUALITY_TREND_SMOKE_TO          可选，结束章节号',
    '  QUALITY_TREND_SMOKE_LIMIT       可选，最大采样数量',
    '  QUALITY_TREND_SMOKE_FAILED_ONLY 可选，是否仅查看失败项，取值 true/false',
  ].join('\n');
}

function printQualityTrendSmokeHelp(invocation?: string): void {
  console.log(formatQualityTrendSmokeHelp(invocation));
}

export async function executeQualityTrendSmoke(options: QualityTrendSmokeOptions): Promise<QualityTrendSmokeSummary> {
  const params = new URLSearchParams();
  if (options.from) params.set('from', String(options.from));
  if (options.to) params.set('to', String(options.to));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.failedOnly !== undefined) params.set('failedOnly', String(options.failedOnly));

  const query = params.toString();
  const url = `${options.baseUrl}/novels/${options.novelId}/chapters/quality-trend${query ? `?${query}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`请求失败 ${response.status}: ${text}`);
  }

  const payload = await response.json();
  const parsed = TrendResponse.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`返回结构不符合预期: ${parsed.error.issues[0].message}`);
  }

  const data = parsed.data;
  const chapterNumbers = data.items.map(item => item.chapterNumber);
  const sorted = [...chapterNumbers].sort((a, b) => a - b);
  const ordered = chapterNumbers.every((value, idx) => value === sorted[idx]);
  if (!ordered) {
    throw new Error('章节序号未按升序返回，趋势序列可能异常');
  }

  return {
    novelId: data.novelId,
    count: data.summary.count,
    passCount: data.summary.passCount,
    maxChapter: chapterNumbers.length > 0 ? chapterNumbers[chapterNumbers.length - 1] : 'N/A',
    avgOverall: data.summary.avgOverall,
    avgStructure: data.summary.avgStructure,
    avgStyle: data.summary.avgStyle,
    avgEmotion: data.summary.avgEmotion,
  };
}

export async function runQualityTrendSmokeCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run check:quality-trend',
): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    printQualityTrendSmokeHelp(invocation);
    return 0;
  }

  const options = parseQualityTrendSmokeEnv();
  const summary = await executeQualityTrendSmoke(options);
  console.log('质量趋势接口检查通过');
  console.log(`novelId=${summary.novelId}`);
  console.log(`样本=${summary.count}, 达标=${summary.passCount}, 最新章=${summary.maxChapter}`);
  console.log(`均分: 总分=${summary.avgOverall}, 结构=${summary.avgStructure}, 文风=${summary.avgStyle}, 情绪=${summary.avgEmotion}`);
  return 0;
}

async function main(): Promise<void> {
  process.exitCode = await runQualityTrendSmokeCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('quality-trend-smoke');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
