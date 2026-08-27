import { z } from 'zod';
import { HistoryCuratorAgent } from '../../../agents/history-curator.js';
import type { WorldEntry } from '../../../novel/types.js';
import {
  parseCurateHistoryOutput,
  replaceHistoryEntries,
  sanitizeCuratedHistoryEntries,
} from '../../../utils/curate-history-utils.js';
import { chunkArray } from '../../../utils/curate-shared.js';
import type { GenerateDeps } from './types.js';
import {
  CurateHistoryResult,
  CuratedHistoryItem,
} from './world-schemas.js';

export const CURATE_HISTORY_AGENT_ROLE = 'history-curator' as const;

type CuratedHistorySeed = z.infer<typeof CuratedHistoryItem>;

type CurateHistoryResponse = {
  applied: boolean;
  summary: string;
  beforeCount: number;
  afterCount: number;
  entries: WorldEntry[];
  degraded?: boolean;
};

export function buildCurateHistoryInput(params: {
  chunkIndex: number;
  chunkCount: number;
  historyChunk: unknown[];
  indexChunk: Array<{ id: string; name: string; category: string }>;
  totalHistoryEntries: number;
  recentChapterSnippets: string[];
}): string {
  return [
    '## 梳理任务',
    '- 只处理 history 条目，按时间线去重和重排，尽量补齐纪年信息。',
    '',
    '## 时间线强约束',
    '- 事件必须具备可排序的时间字段（优先 details.year）。',
    '- 若能判断所属纪元/朝代，请写入 details.era。',
    '- 同年事件若能判断先后，写入 details.sequence（非负整数）。',
    '- 若无法确定具体年份，保留空值但不要伪造。',
    '',
    '## 当前分片进度',
    `- 分片：${params.chunkIndex + 1}/${params.chunkCount}`,
    `- 分片历史条目数：${params.historyChunk.length}`,
    `- 参考索引数：${params.indexChunk.length}`,
    '',
    '## 当前历史条目分片（JSON）',
    JSON.stringify(params.historyChunk, null, 2),
    '',
    '## 世界观参考索引分片（JSON）',
    JSON.stringify(params.indexChunk, null, 2),
    '',
    '## 当前统计',
    `- 历史条目总数：${params.totalHistoryEntries}`,
    '',
    '## 近期章节片段',
    params.recentChapterSnippets.length > 0 ? params.recentChapterSnippets.join('\n\n') : '（暂无章节正文）',
  ].join('\n');
}

export function buildCurateHistoryParsedResult(params: {
  summaryParts: string[];
  mergedCuratedEntries: CuratedHistorySeed[];
}): z.infer<typeof CurateHistoryResult> {
  return CurateHistoryResult.parse({
    summary: params.summaryParts.join('；').slice(0, 800),
    entries: params.mergedCuratedEntries,
  });
}

export async function runCurateHistoryWorkflow(params: {
  deps: GenerateDeps;
  novelId: string;
  novel: NonNullable<Awaited<ReturnType<GenerateDeps['novelManager']['getNovel']>>>;
  activeModelClient: GenerateDeps['modelClient'];
  maxItems: number;
  apply: boolean;
}): Promise<CurateHistoryResponse> {
  const { deps, novelId, novel, activeModelClient, maxItems, apply } = params;
  const { novelManager, novelMemory, broadcast } = deps;
  const timestamp = new Date().toISOString();
  const historyCurator = new HistoryCuratorAgent();

  const [worldEntries, chapterMetas] = await Promise.all([
    novelManager.getWorldEntries(novelId),
    novelManager.listChapters(novelId),
  ]);

  const historyEntries = worldEntries.filter(item => item.category === 'history');
  const nonHistoryEntries = worldEntries.filter(item => item.category !== 'history');
  const writtenChapters = chapterMetas
    .filter(c => c.wordCount > 0 || c.status !== 'outlined')
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
  const chapterBase = writtenChapters.length > 0 ? writtenChapters : chapterMetas;
  const currentChapter = chapterBase.length > 0
    ? Math.max(...chapterBase.map(c => c.chapterNumber))
    : 0;

  const recentNumbers = chapterBase
    .slice(-8)
    .map(item => item.chapterNumber);
  const recentChapters = await Promise.all(
    recentNumbers.map(num => novelManager.getChapter(novelId, num)),
  );
  const recentChapterSnippets = recentChapters
    .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter))
    .map(chapter => `### 第${chapter.chapterNumber}章\n${chapter.content.slice(0, 700)}`);

  broadcast({
    type: 'agent:start',
    agentRole: CURATE_HISTORY_AGENT_ROLE,
    novelId,
    chapterNumber: currentChapter || undefined,
    data: '',
    timestamp,
  });

  const historyChunks = chunkArray(historyEntries, 24);
  const runHistoryChunks = historyChunks.length > 0 ? historyChunks : [[]];
  const indexChunks = chunkArray(nonHistoryEntries.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
  })), 120);
  const runIndexChunks = indexChunks.length > 0 ? indexChunks : [[]];

  const mergedCuratedEntries: CuratedHistorySeed[] = [];
  const summaryParts: string[] = [];
  const rawOutputs: string[] = [];

  for (let idx = 0; idx < runHistoryChunks.length; idx += 1) {
    const historyChunk = runHistoryChunks[idx];
    const indexChunk = runIndexChunks[idx % runIndexChunks.length];

    let streamed = '';
    const output = await historyCurator.execute({
      novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      chapterNumber: currentChapter || undefined,
      inputText: buildCurateHistoryInput({
        chunkIndex: idx,
        chunkCount: runHistoryChunks.length,
        historyChunk,
        indexChunk,
        totalHistoryEntries: historyEntries.length,
        recentChapterSnippets,
      }),
    }, activeModelClient, (chunk) => {
      streamed += chunk;
      broadcast({
        type: 'agent:chunk',
        agentRole: CURATE_HISTORY_AGENT_ROLE,
        novelId,
        chapterNumber: currentChapter || undefined,
        data: chunk,
        timestamp: new Date().toISOString(),
      });
    });
    const rawContent = streamed || output.content;
    rawOutputs.push(rawContent);

    const parsedChunk = CurateHistoryResult.safeParse(parseCurateHistoryOutput(rawContent));
    if (!parsedChunk.success) {
      continue;
    }

    mergedCuratedEntries.push(...parsedChunk.data.entries);
    if (parsedChunk.data.summary.trim()) {
      summaryParts.push(parsedChunk.data.summary.trim());
    }
  }

  broadcast({
    type: 'agent:complete',
    agentRole: CURATE_HISTORY_AGENT_ROLE,
    novelId,
    chapterNumber: currentChapter || undefined,
    data: rawOutputs.join('\n\n---\n\n'),
    timestamp: new Date().toISOString(),
  });

  const curatedParsed = buildCurateHistoryParsedResult({
    summaryParts,
    mergedCuratedEntries,
  });
  const sanitizedEntries = sanitizeCuratedHistoryEntries({
    curated: curatedParsed.entries,
    existingHistory: historyEntries,
    allEntries: worldEntries,
    maxItems,
  });
  if (sanitizedEntries.length === 0) {
    if (apply) {
      throw new Error('历史梳理结果为空，已拒绝覆盖原数据');
    }
    return {
      applied: false,
      summary: curatedParsed.summary || '梳理器未产出可用结果，已回退为当前历史条目预览。',
      beforeCount: historyEntries.length,
      afterCount: historyEntries.length,
      entries: historyEntries,
      degraded: true,
    };
  }

  if (apply) {
    await replaceHistoryEntries({
      novelId,
      novelManager,
      nextHistoryEntries: sanitizedEntries,
      existingWorldEntries: worldEntries,
    });
    if (novelMemory) {
      await Promise.all(sanitizedEntries.map(item =>
        novelMemory.indexWorldEntry(novelId, item).catch(() => {}),
      ));
    }
  }

  return {
    applied: apply,
    summary: curatedParsed.summary,
    beforeCount: historyEntries.length,
    afterCount: sanitizedEntries.length,
    entries: sanitizedEntries,
  };
}

export async function applyCuratedHistoryEntries(params: {
  novelId: string;
  deps: GenerateDeps;
  worldEntries: WorldEntry[];
  entries: CuratedHistorySeed[];
  maxItems: number;
  summary: string;
}): Promise<{
  applied: true;
  summary: string;
  beforeCount: number;
  afterCount: number;
  entries: WorldEntry[];
}> {
  const historyEntries = params.worldEntries.filter(item => item.category === 'history');
  const sanitizedEntries = sanitizeCuratedHistoryEntries({
    curated: params.entries,
    existingHistory: historyEntries,
    allEntries: params.worldEntries,
    maxItems: params.maxItems,
  });
  if (sanitizedEntries.length === 0) {
    throw new Error('历史梳理结果为空，已拒绝覆盖原数据');
  }

  await replaceHistoryEntries({
    novelId: params.novelId,
    novelManager: params.deps.novelManager,
    nextHistoryEntries: sanitizedEntries,
    existingWorldEntries: params.worldEntries,
  });
  if (params.deps.novelMemory) {
    await Promise.all(sanitizedEntries.map(item =>
      params.deps.novelMemory!.indexWorldEntry(params.novelId, item).catch(() => {}),
    ));
  }

  return {
    applied: true,
    summary: params.summary,
    beforeCount: historyEntries.length,
    afterCount: sanitizedEntries.length,
    entries: sanitizedEntries,
  };
}

export function broadcastCurateHistoryError(params: {
  deps: GenerateDeps;
  novelId: string;
  message: string;
}): void {
  params.deps.broadcast({
    type: 'agent:error',
    agentRole: CURATE_HISTORY_AGENT_ROLE,
    novelId: params.novelId,
    chapterNumber: undefined,
    data: params.message,
    timestamp: new Date().toISOString(),
  });
}
