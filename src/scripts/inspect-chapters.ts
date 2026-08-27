import path from 'node:path';
import { getNovelsDir } from '../config/index.js';
import { NovelManager } from '../novel/novel-manager.js';
import { StoryStateManager } from '../novel/story-state-manager.js';
import type { ChapterSummary } from '../novel/chapter-repository.js';

type InspectOptions = {
  novelId?: string;
  json: boolean;
  help: boolean;
};

type BlankChapter = {
  chapterNumber: number;
  title: string;
  status: string;
  phase?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
};

type NovelInspection = {
  novelId: string;
  novelTitle: string;
  totalChapters: number;
  maxChapterNumber: number;
  totalWords: number;
  gaps: number[];
  blankChapters: BlankChapter[];
  statusCounts: Record<string, number>;
  storyStateSnapshots: number;
  storyStateLatestChapter: number;
  /** 有正文（wordCount>0）但没有 story-state 快照的章节号 */
  chaptersWithoutSnapshot: number[];
};

function parseArgs(argv: string[] = process.argv.slice(2)): InspectOptions {
  const options: InspectOptions = { json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    const novelMatch = arg.startsWith('--novel=')
      ? arg.slice('--novel='.length)
      : arg === '--novel' && argv[i + 1]
        ? (i += 1, argv[i])
        : null;
    if (novelMatch) {
      options.novelId = novelMatch;
    }
  }
  return options;
}

function formatHelp(invocation = 'npm run cli -- data inspect-chapters'): string {
  return [
    `用法: ${invocation} --novel <novelId> [--json]`,
    '',
    '检查单本小说的章节完整性，定位「空白章节 / 章节缺口 / story-state 快照缺失」等问题。',
    '批量生成失败、删章后无法续写等场景，可用本命令快速排查。',
    '',
    '选项:',
    '  --novel <novelId>   必填，目标小说 ID',
    '  --json              以 JSON 输出完整结果，便于脚本处理',
  ].join('\n');
}

function sortChapters(chapters: ChapterSummary[]): ChapterSummary[] {
  return [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
}

async function inspectNovel(
  novelManager: NovelManager,
  storyStateManager: StoryStateManager,
  novelId: string,
): Promise<NovelInspection> {
  const novel = await novelManager.getNovel(novelId);
  if (!novel) {
    throw new Error(`未找到小说：${novelId}`);
  }

  const sorted = sortChapters(await novelManager.listChapters(novelId));
  const maxChapterNumber = sorted.length > 0 ? sorted[sorted.length - 1].chapterNumber : 0;
  const present = new Set(sorted.map((c) => c.chapterNumber));

  // 章节缺口：1..max 中缺失的章节号（删章后会留下缺口）
  const gaps: number[] = [];
  for (let i = 1; i <= maxChapterNumber; i += 1) {
    if (!present.has(i)) gaps.push(i);
  }

  // 空白章节：wordCount===0，读取完整元数据提取生成失败原因
  const blankChapters: BlankChapter[] = [];
  for (const summary of sorted) {
    if (summary.wordCount > 0) continue;
    const full = await novelManager.getChapter(novelId, summary.chapterNumber);
    const lifecycle = full?.diagnostics?.generationLifecycle;
    blankChapters.push({
      chapterNumber: summary.chapterNumber,
      title: summary.title,
      status: summary.status,
      phase: lifecycle?.phase,
      errorCode: lifecycle?.errorCode,
      errorMessage: lifecycle?.errorMessage,
      retryable: lifecycle?.retryable,
    });
  }

  const statusCounts: Record<string, number> = {};
  let totalWords = 0;
  for (const c of sorted) {
    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
    totalWords += c.wordCount;
  }

  // story-state 快照覆盖：有正文但缺快照的章节（续写上下文可能不完整）
  const state = await storyStateManager.getState(novelId);
  const snapshotChapters = new Set(state.snapshots.map((s) => s.chapterNumber));
  const chaptersWithoutSnapshot = sorted
    .filter((c) => c.wordCount > 0 && !snapshotChapters.has(c.chapterNumber))
    .map((c) => c.chapterNumber);

  return {
    novelId,
    novelTitle: novel.title,
    totalChapters: sorted.length,
    maxChapterNumber,
    totalWords,
    gaps,
    blankChapters,
    statusCounts,
    storyStateSnapshots: state.snapshots.length,
    storyStateLatestChapter: state.latestChapter,
    chaptersWithoutSnapshot,
  };
}

function renderHumanReport(result: NovelInspection): string {
  const lines: string[] = [];
  lines.push(`小说《${result.novelTitle}》(${result.novelId})`);
  lines.push(
    `章节文件：${result.totalChapters} 个，最大章节号 ${result.maxChapterNumber}，合计 ${result.totalWords} 字`,
  );

  lines.push('');
  if (result.blankChapters.length > 0) {
    lines.push(`❌ 空白章节 (${result.blankChapters.length}):`);
    for (const b of result.blankChapters) {
      const head = `  - 第${b.chapterNumber}章 [status=${b.status}${b.phase ? ` phase=${b.phase}` : ''}]`;
      lines.push(head);
      if (b.errorMessage) {
        lines.push(`    原因：${b.errorMessage}`);
      }
      if (b.errorCode) {
        lines.push(`    错误码：${b.errorCode}${b.retryable === false ? '（不可重试）' : b.retryable ? '（可重试）' : ''}`);
      }
    }
  } else {
    lines.push('✅ 未发现空白章节');
  }

  lines.push('');
  if (result.gaps.length > 0) {
    lines.push(`⚠️ 章节缺口 (${result.gaps.length}): 缺少第 ${result.gaps.join('、')} 章`);
  } else {
    lines.push('✅ 章节号连续无缺口');
  }

  lines.push('');
  const statusLine = Object.entries(result.statusCounts)
    .map(([status, count]) => `${status}=${count}`)
    .join('，');
  lines.push(`状态分布：${statusLine || '无'}`);

  lines.push('');
  lines.push(
    `故事状态快照：${result.storyStateSnapshots} 条，最新覆盖到第 ${result.storyStateLatestChapter} 章`,
  );
  if (result.chaptersWithoutSnapshot.length > 0) {
    lines.push(
      `⚠️ 有正文但缺快照的章节 (${result.chaptersWithoutSnapshot.length}): 第 ${result.chaptersWithoutSnapshot.join('、')} 章`,
    );
  }

  return lines.join('\n');
}

export async function runInspectChaptersCli(
  argv: string[] = process.argv.slice(2),
  invocation = 'npm run cli -- data inspect-chapters',
): Promise<number> {
  const options = parseArgs(argv);
  if (options.help || !options.novelId) {
    console.log(formatHelp(invocation));
    return options.novelId ? 0 : 1;
  }

  const novelsDir = getNovelsDir();
  const novelManager = new NovelManager(novelsDir);
  const storyStateManager = new StoryStateManager(novelsDir);

  try {
    const result = await inspectNovel(novelManager, storyStateManager, options.novelId);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderHumanReport(result));
    }
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runInspectChaptersCli();
}

function isExecutedAsEntry(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.basename(argv1).includes('inspect-chapters');
}

if (isExecutedAsEntry()) {
  void main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
