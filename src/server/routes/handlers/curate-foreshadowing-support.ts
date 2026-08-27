import type { Foreshadowing, OutlineData } from '../../../novel/types.js';
import { analyzeForeshadowing } from '../../../pipeline/foreshadowing-tracker.js';
import {
  parseCurateForeshadowingOutput,
  sanitizeCuratedForeshadowing,
} from '../../../utils/curate-foreshadowing-utils.js';
import { ForeshadowingCuratorAgent } from '../../../agents/foreshadowing-curator.js';
import type { GenerateDeps } from './types.js';
import {
  CurateForeshadowingResult,
  CuratedForeshadowingItem,
} from './world-schemas.js';
import { z } from 'zod';

export const CURATE_FORESHADOWING_AGENT_ROLE = 'foreshadowing-curator' as const;

type CuratedForeshadowingSeed = z.infer<typeof CuratedForeshadowingItem>;

type CurateForeshadowingResponse = {
  applied: boolean;
  summary: string;
  beforeCount: number;
  afterCount: number;
  overdueBefore: number;
  overdueAfter: number;
  foreshadowing: Foreshadowing[];
  degraded?: boolean;
};

export function buildCurateForeshadowingInput(params: {
  limitedForeshadowing: Foreshadowing[];
  totalForeshadowingCount: number;
  resolvedCount: number;
  overdueCount: number;
  recentChapterSnippets: string[];
}): string {
  return [
    '## 梳理任务',
    '- 请统一去重、修正回收状态、优化优先级并输出可落库清单。',
    '',
    '## 当前伏笔池（JSON）',
    JSON.stringify(params.limitedForeshadowing, null, 2),
    '',
    '## 当前统计',
    `- 伏笔总数：${params.totalForeshadowingCount}（本次处理 ${params.limitedForeshadowing.length} 条）`,
    `- 已回收：${params.resolvedCount}`,
    `- 逾期：${params.overdueCount}`,
    '',
    '## 近期章节片段',
    params.recentChapterSnippets.length > 0 ? params.recentChapterSnippets.join('\n\n') : '（暂无章节正文）',
  ].join('\n');
}

export function buildCurateForeshadowingParsedResult(rawContent: string): z.infer<typeof CurateForeshadowingResult> {
  return CurateForeshadowingResult.parse(parseCurateForeshadowingOutput(rawContent));
}

function buildForeshadowingContext(params: {
  outline: OutlineData;
  chapterMetas: Awaited<ReturnType<GenerateDeps['novelManager']['listChapters']>>;
}): {
  currentChapter: number;
  limitedForeshadowing: Foreshadowing[];
  recentChapterNumbers: number[];
  beforeAnalysis: ReturnType<typeof analyzeForeshadowing>;
} {
  const writtenChapters = params.chapterMetas
    .filter(c => c.wordCount > 0 || c.status !== 'outlined')
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
  const chapterBase = writtenChapters.length > 0 ? writtenChapters : params.chapterMetas;
  const currentChapter = chapterBase.length > 0
    ? Math.max(...chapterBase.map(c => c.chapterNumber))
    : 0;

  const beforeAnalysis = analyzeForeshadowing({
    foreshadowing: params.outline.foreshadowing,
    currentChapter,
  });
  const overdueItems = beforeAnalysis.overdue.map(s => s.item);
  const activeItems = beforeAnalysis.active.map(s => s.item);
  const limitedForeshadowing = [
    ...overdueItems,
    ...activeItems.filter(f => !overdueItems.some(o => o.id === f.id)),
    ...beforeAnalysis.resolved,
  ];

  return {
    currentChapter,
    limitedForeshadowing,
    recentChapterNumbers: chapterBase.slice(-6).map(item => item.chapterNumber),
    beforeAnalysis,
  };
}

export async function runCurateForeshadowingWorkflow(params: {
  deps: GenerateDeps;
  novelId: string;
  novel: NonNullable<Awaited<ReturnType<GenerateDeps['novelManager']['getNovel']>>>;
  outline: OutlineData;
  chapterMetas: Awaited<ReturnType<GenerateDeps['novelManager']['listChapters']>>;
  maxItems: number;
  apply: boolean;
  activeModelClient: GenerateDeps['modelClient'];
}): Promise<CurateForeshadowingResponse> {
  const { deps, novelId, novel, outline, chapterMetas, maxItems, apply, activeModelClient } = params;
  const { novelManager, broadcast } = deps;
  const timestamp = new Date().toISOString();
  const foreshadowingCurator = new ForeshadowingCuratorAgent();
  const {
    currentChapter,
    limitedForeshadowing,
    recentChapterNumbers,
    beforeAnalysis,
  } = buildForeshadowingContext({ outline, chapterMetas });

  const recentChapters = await Promise.all(
    recentChapterNumbers.map(num => novelManager.getChapter(novelId, num)),
  );
  const recentChapterSnippets = recentChapters
    .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter))
    .map(chapter => `### 第${chapter.chapterNumber}章\n${chapter.content.slice(0, 400)}`);

  broadcast({
    type: 'agent:start',
    agentRole: CURATE_FORESHADOWING_AGENT_ROLE,
    novelId,
    chapterNumber: currentChapter || undefined,
    data: '',
    timestamp,
  });

  let streamed = '';
  const output = await foreshadowingCurator.execute({
    novelId,
    genre: novel.genre,
    novelTitle: novel.title,
    novelSynopsis: novel.synopsis,
    chapterNumber: currentChapter || undefined,
    inputText: buildCurateForeshadowingInput({
      limitedForeshadowing: limitedForeshadowing.slice(0, maxItems),
      totalForeshadowingCount: outline.foreshadowing.length,
      resolvedCount: beforeAnalysis.resolved.length,
      overdueCount: beforeAnalysis.overdue.length,
      recentChapterSnippets,
    }),
  }, activeModelClient, (chunk) => {
    streamed += chunk;
    broadcast({
      type: 'agent:chunk',
      agentRole: CURATE_FORESHADOWING_AGENT_ROLE,
      novelId,
      chapterNumber: currentChapter || undefined,
      data: chunk,
      timestamp: new Date().toISOString(),
    });
  });

  const rawContent = streamed || output.content;
  broadcast({
    type: 'agent:complete',
    agentRole: CURATE_FORESHADOWING_AGENT_ROLE,
    novelId,
    chapterNumber: currentChapter || undefined,
    data: rawContent,
    timestamp: new Date().toISOString(),
  });

  const curatedParsed = buildCurateForeshadowingParsedResult(rawContent);
  const sanitizedForeshadowing = sanitizeCuratedForeshadowing({
    curated: curatedParsed.foreshadowing,
    existing: outline.foreshadowing,
    plotThreadIds: new Set(outline.plotThreads.map(item => item.id)),
    currentChapter,
    maxItems,
  });
  if (sanitizedForeshadowing.length === 0) {
    if (apply) {
      throw new Error('梳理结果为空，已拒绝覆盖原伏笔数据');
    }
    return {
      applied: false,
      summary: curatedParsed.summary || '梳理器未产出可用结果，已回退为当前伏笔池预览。',
      beforeCount: outline.foreshadowing.length,
      afterCount: outline.foreshadowing.length,
      overdueBefore: beforeAnalysis.overdue.length,
      overdueAfter: beforeAnalysis.overdue.length,
      foreshadowing: outline.foreshadowing,
      degraded: true,
    };
  }

  let applied = false;
  if (apply) {
    await novelManager.saveOutline(novelId, { ...outline, foreshadowing: sanitizedForeshadowing });
    applied = true;
  }

  const afterAnalysis = analyzeForeshadowing({
    foreshadowing: sanitizedForeshadowing,
    currentChapter,
  });
  return {
    applied,
    summary: curatedParsed.summary,
    beforeCount: outline.foreshadowing.length,
    afterCount: sanitizedForeshadowing.length,
    overdueBefore: beforeAnalysis.overdue.length,
    overdueAfter: afterAnalysis.overdue.length,
    foreshadowing: sanitizedForeshadowing,
  };
}

export async function applyCuratedForeshadowingEntries(params: {
  deps: GenerateDeps;
  novelId: string;
  outline: OutlineData;
  chapterMetas: Awaited<ReturnType<GenerateDeps['novelManager']['listChapters']>>;
  foreshadowing: CuratedForeshadowingSeed[];
  maxItems: number;
  summary: string;
}): Promise<{
  applied: true;
  summary: string;
  beforeCount: number;
  afterCount: number;
  overdueBefore: number;
  overdueAfter: number;
  foreshadowing: Foreshadowing[];
}> {
  const { currentChapter, beforeAnalysis } = buildForeshadowingContext({
    outline: params.outline,
    chapterMetas: params.chapterMetas,
  });
  const sanitizedForeshadowing = sanitizeCuratedForeshadowing({
    curated: params.foreshadowing,
    existing: params.outline.foreshadowing,
    plotThreadIds: new Set(params.outline.plotThreads.map(item => item.id)),
    currentChapter,
    maxItems: params.maxItems,
  });
  if (sanitizedForeshadowing.length === 0) {
    throw new Error('梳理结果为空，已拒绝覆盖原伏笔数据');
  }

  await params.deps.novelManager.saveOutline(params.novelId, {
    ...params.outline,
    foreshadowing: sanitizedForeshadowing,
  });
  const afterAnalysis = analyzeForeshadowing({
    foreshadowing: sanitizedForeshadowing,
    currentChapter,
  });

  return {
    applied: true,
    summary: params.summary,
    beforeCount: params.outline.foreshadowing.length,
    afterCount: sanitizedForeshadowing.length,
    overdueBefore: beforeAnalysis.overdue.length,
    overdueAfter: afterAnalysis.overdue.length,
    foreshadowing: sanitizedForeshadowing,
  };
}

export function broadcastCurateForeshadowingError(params: {
  deps: GenerateDeps;
  novelId: string;
  message: string;
}): void {
  params.deps.broadcast({
    type: 'agent:error',
    agentRole: CURATE_FORESHADOWING_AGENT_ROLE,
    novelId: params.novelId,
    chapterNumber: undefined,
    data: params.message,
    timestamp: new Date().toISOString(),
  });
}
