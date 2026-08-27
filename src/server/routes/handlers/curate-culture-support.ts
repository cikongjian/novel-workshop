import { z } from 'zod';
import { CultureCuratorAgent } from '../../../agents/culture-curator.js';
import type { WorldEntry } from '../../../novel/types.js';
import {
  parseCurateCultureOutput,
  replaceCultureEntries,
  sanitizeCuratedCultureEntries,
} from '../../../utils/curate-culture-utils.js';
import { chunkArray } from '../../../utils/curate-shared.js';
import type { GenerateDeps } from './types.js';
import {
  CurateCultureResult,
  CuratedCultureItem,
} from './world-schemas.js';

export const CURATE_CULTURE_AGENT_ROLE = 'culture-curator' as const;

type CuratedCultureSeed = z.infer<typeof CuratedCultureItem>;

type CurateCultureResponse = {
  applied: boolean;
  summary: string;
  beforeCount: number;
  afterCount: number;
  entries: WorldEntry[];
  degraded?: boolean;
};

export function buildCurateCultureInput(params: {
  chunkIndex: number;
  chunkCount: number;
  cultureChunk: unknown[];
  indexChunk: Array<{ id: string; name: string; category: string }>;
  totalCultureEntries: number;
  recentChapterSnippets: string[];
}): string {
  return [
    '## 梳理任务',
    '- 只处理 culture 条目，去重、补全、清洗低质量描述。',
    '- 每个条目必须尽量形成"触发 -> 约束 -> 后果"的可执行结构，服务剧情冲突与抉择。',
    '',
    '## 输出质量约束',
    '- 优先为每条产出至少 1 条 constraints 与 1 条 consequences。',
    '- details 推荐键：trigger/ritual/taboo/cost/impact/sceneHook。',
    '- 不要输出百科式解释，避免纯背景介绍。',
    '- 不要编造 relatedEntries，必须引用输入索引中已有 id。',
    '',
    '## 当前分片进度',
    `- 分片：${params.chunkIndex + 1}/${params.chunkCount}`,
    `- 分片文化条目数：${params.cultureChunk.length}`,
    `- 参考索引数：${params.indexChunk.length}`,
    '',
    '## 当前文化条目分片（JSON）',
    JSON.stringify(params.cultureChunk, null, 2),
    '',
    '## 世界观参考索引分片（JSON）',
    JSON.stringify(params.indexChunk, null, 2),
    '',
    '## 当前统计',
    `- 文化条目总数：${params.totalCultureEntries}`,
    '',
    '## 近期章节片段',
    params.recentChapterSnippets.length > 0 ? params.recentChapterSnippets.join('\n\n') : '（暂无章节正文）',
  ].join('\n');
}

export function buildCurateCultureParsedResult(params: {
  summaryParts: string[];
  mergedCuratedEntries: CuratedCultureSeed[];
}): z.infer<typeof CurateCultureResult> {
  return CurateCultureResult.parse({
    summary: params.summaryParts.join('；').slice(0, 800),
    entries: params.mergedCuratedEntries,
  });
}

export async function runCurateCultureWorkflow(params: {
  deps: GenerateDeps;
  novelId: string;
  novel: NonNullable<Awaited<ReturnType<GenerateDeps['novelManager']['getNovel']>>>;
  activeModelClient: GenerateDeps['modelClient'];
  maxItems: number;
  apply: boolean;
}): Promise<CurateCultureResponse> {
  const { deps, novelId, novel, activeModelClient, maxItems, apply } = params;
  const { novelManager, novelMemory, broadcast } = deps;
  const timestamp = new Date().toISOString();
  const cultureCurator = new CultureCuratorAgent();

  const [worldEntries, chapterMetas] = await Promise.all([
    novelManager.getWorldEntries(novelId),
    novelManager.listChapters(novelId),
  ]);

  const cultureEntries = worldEntries.filter(item => item.category === 'culture');
  const nonCultureEntries = worldEntries.filter(item => item.category !== 'culture');
  const writtenChapters = chapterMetas
    .filter(c => c.wordCount > 0 || c.status !== 'outlined')
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
  const chapterBase = writtenChapters.length > 0 ? writtenChapters : chapterMetas;
  const currentChapter = chapterBase.length > 0
    ? Math.max(...chapterBase.map(c => c.chapterNumber))
    : 0;

  const recentNumbers = chapterBase
    .slice(-6)
    .map(item => item.chapterNumber);
  const recentChapters = await Promise.all(
    recentNumbers.map(num => novelManager.getChapter(novelId, num)),
  );
  const recentChapterSnippets = recentChapters
    .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter))
    .map(chapter => `### 第${chapter.chapterNumber}章\n${chapter.content.slice(0, 600)}`);

  broadcast({
    type: 'agent:start',
    agentRole: CURATE_CULTURE_AGENT_ROLE,
    novelId,
    chapterNumber: currentChapter || undefined,
    data: '',
    timestamp,
  });

  const cultureChunks = chunkArray(cultureEntries, 24);
  const runCultureChunks = cultureChunks.length > 0 ? cultureChunks : [[]];
  const indexChunks = chunkArray(nonCultureEntries.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
  })), 120);
  const runIndexChunks = indexChunks.length > 0 ? indexChunks : [[]];

  const mergedCuratedEntries: CuratedCultureSeed[] = [];
  const summaryParts: string[] = [];
  const rawOutputs: string[] = [];

  for (let idx = 0; idx < runCultureChunks.length; idx += 1) {
    const cultureChunk = runCultureChunks[idx];
    const indexChunk = runIndexChunks[idx % runIndexChunks.length];

    let streamed = '';
    const output = await cultureCurator.execute({
      novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      chapterNumber: currentChapter || undefined,
      inputText: buildCurateCultureInput({
        chunkIndex: idx,
        chunkCount: runCultureChunks.length,
        cultureChunk,
        indexChunk,
        totalCultureEntries: cultureEntries.length,
        recentChapterSnippets,
      }),
    }, activeModelClient, (chunk) => {
      streamed += chunk;
      broadcast({
        type: 'agent:chunk',
        agentRole: CURATE_CULTURE_AGENT_ROLE,
        novelId,
        chapterNumber: currentChapter || undefined,
        data: chunk,
        timestamp: new Date().toISOString(),
      });
    });
    const rawContent = streamed || output.content;
    rawOutputs.push(rawContent);

    const parsedChunk = CurateCultureResult.safeParse(parseCurateCultureOutput(rawContent));
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
    agentRole: CURATE_CULTURE_AGENT_ROLE,
    novelId,
    chapterNumber: currentChapter || undefined,
    data: rawOutputs.join('\n\n---\n\n'),
    timestamp: new Date().toISOString(),
  });

  const curatedParsed = buildCurateCultureParsedResult({
    summaryParts,
    mergedCuratedEntries,
  });
  const sanitizedEntries = sanitizeCuratedCultureEntries({
    curated: curatedParsed.entries,
    existingCulture: cultureEntries,
    allEntries: worldEntries,
    maxItems,
  });
  if (sanitizedEntries.length === 0) {
    if (apply) {
      throw new Error('文化梳理结果为空，已拒绝覆盖原数据');
    }
    return {
      applied: false,
      summary: curatedParsed.summary || '梳理器未产出可用结果，已回退为当前文化条目预览。',
      beforeCount: cultureEntries.length,
      afterCount: cultureEntries.length,
      entries: cultureEntries,
      degraded: true,
    };
  }

  if (apply) {
    await replaceCultureEntries({
      novelId,
      novelManager,
      nextCultureEntries: sanitizedEntries,
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
    beforeCount: cultureEntries.length,
    afterCount: sanitizedEntries.length,
    entries: sanitizedEntries,
  };
}

export async function applyCuratedCultureEntries(params: {
  novelId: string;
  deps: GenerateDeps;
  worldEntries: WorldEntry[];
  entries: CuratedCultureSeed[];
  maxItems: number;
  summary: string;
}): Promise<{
  applied: true;
  summary: string;
  beforeCount: number;
  afterCount: number;
  entries: WorldEntry[];
}> {
  const cultureEntries = params.worldEntries.filter(item => item.category === 'culture');
  const sanitizedEntries = sanitizeCuratedCultureEntries({
    curated: params.entries,
    existingCulture: cultureEntries,
    allEntries: params.worldEntries,
    maxItems: params.maxItems,
  });
  if (sanitizedEntries.length === 0) {
    throw new Error('文化梳理结果为空，已拒绝覆盖原数据');
  }

  await replaceCultureEntries({
    novelId: params.novelId,
    novelManager: params.deps.novelManager,
    nextCultureEntries: sanitizedEntries,
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
    beforeCount: cultureEntries.length,
    afterCount: sanitizedEntries.length,
    entries: sanitizedEntries,
  };
}

export function broadcastCurateCultureError(params: {
  deps: GenerateDeps;
  novelId: string;
  message: string;
}): void {
  params.deps.broadcast({
    type: 'agent:error',
    agentRole: CURATE_CULTURE_AGENT_ROLE,
    novelId: params.novelId,
    chapterNumber: undefined,
    data: params.message,
    timestamp: new Date().toISOString(),
  });
}
