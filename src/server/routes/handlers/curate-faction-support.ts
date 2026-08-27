import { z } from 'zod';
import type { GenerateDeps } from './types.js';
import { chunkArray } from '../../../utils/curate-shared.js';
import {
  parseCurateFactionOutput,
  worldEntryToCuratedFactionSeed,
} from '../../../utils/curate-faction-utils.js';
import {
  CurateFactionResult,
  CuratedFactionItem,
} from './world-schemas.js';
import type { WorldEntry } from '../../../novel/types.js';
import {
  buildFactionCuratedSummary,
  buildFactionFinalSummary,
  buildFactionForeshadowingHints,
  buildFactionOutlineWindow,
  buildFactionPlotThreadHints,
  buildFactionStageInput,
  createCurateFactionStages,
  type FactionStageReport,
} from './curate-faction-stage-support.js';
import { sanitizeFactionEntriesWithFallback } from './curate-faction-apply-support.js';

export async function runFactionCuration(params: {
  deps: GenerateDeps;
  novelId: string;
  novel: NonNullable<Awaited<ReturnType<GenerateDeps['novelManager']['getNovel']>>>;
  activeModelClient: GenerateDeps['modelClient'];
  maxItems: number;
  timestamp: string;
}): Promise<{
  factionEntries: WorldEntry[];
  worldEntries: WorldEntry[];
  sanitizedEntries: WorldEntry[];
  stageReports: FactionStageReport[];
  finalSummary: string;
}> {
  const { deps, novelId, novel, activeModelClient, maxItems, timestamp } = params;
  const { novelManager, broadcast } = deps;

  const [worldEntries, chapterMetas, outline] = await Promise.all([
    novelManager.getWorldEntries(novelId),
    novelManager.listChapters(novelId),
    novelManager.getOutline(novelId),
  ]);

  const factionEntries = worldEntries.filter(item => item.category === 'faction');
  const nonFactionEntries = worldEntries.filter(item => item.category !== 'faction');
  const writtenChapters = chapterMetas
    .filter(c => c.wordCount > 0 || c.status !== 'outlined')
    .sort((a, b) => a.chapterNumber - b.chapterNumber);
  const chapterBase = writtenChapters.length > 0 ? writtenChapters : chapterMetas;
  const currentChapter = chapterBase.length > 0
    ? Math.max(...chapterBase.map(c => c.chapterNumber))
    : 0;
  const recentNumbers = chapterBase.slice(-8).map(item => item.chapterNumber);
  const recentChapters = await Promise.all(
    recentNumbers.map(num => novelManager.getChapter(novelId, num)),
  );
  const recentChapterSnippets = recentChapters
    .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter))
    .map(chapter => `### 第${chapter.chapterNumber}章\n${chapter.content.slice(0, 700)}`);
  const outlineWindow = buildFactionOutlineWindow(outline, currentChapter);
  const plotThreadHints = buildFactionPlotThreadHints(outline);
  const unresolvedForeshadowingHints = buildFactionForeshadowingHints(outline);

  const indexChunks = chunkArray(nonFactionEntries.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
  })), 120);
  const runIndexChunks = indexChunks.length > 0 ? indexChunks : [[]];

  let stageInputEntries = factionEntries.map(worldEntryToCuratedFactionSeed);
  const stageReports: FactionStageReport[] = [];
  const stages = createCurateFactionStages();

  for (const stage of stages) {
    broadcast({
      type: 'agent:start',
      agentRole: stage.role,
      novelId,
      chapterNumber: currentChapter || undefined,
      data: '',
      timestamp,
    });

    const stageChunks = chunkArray(stageInputEntries, 20);
    const runStageChunks = stageChunks.length > 0 ? stageChunks : [[]];
    const mergedCuratedEntries: Array<z.infer<typeof CuratedFactionItem>> = [];
    const summaryParts: string[] = [];
    const rawOutputs: string[] = [];

    for (let idx = 0; idx < runStageChunks.length; idx += 1) {
      const factionChunk = runStageChunks[idx];
      const indexChunk = runIndexChunks[idx % runIndexChunks.length];
      let streamed = '';
      const output = await stage.agent.execute({
        novelId,
        genre: novel.genre,
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis,
        chapterNumber: currentChapter || undefined,
        inputText: buildFactionStageInput({
          stageTask: stage.task,
          chunkIndex: idx,
          chunkCount: runStageChunks.length,
          factionChunk,
          indexChunk,
          totalFactionEntries: factionEntries.length,
          outlineWindow,
          plotThreadHints,
          unresolvedForeshadowingHints,
          recentChapterSnippets,
        }),
      }, activeModelClient, (chunk) => {
        streamed += chunk;
        broadcast({
          type: 'agent:chunk',
          agentRole: stage.role,
          novelId,
          chapterNumber: currentChapter || undefined,
          data: chunk,
          timestamp: new Date().toISOString(),
        });
      });
      const rawContent = streamed || output.content;
      rawOutputs.push(rawContent);

      const parsedChunk = CurateFactionResult.safeParse(parseCurateFactionOutput(rawContent));
      if (parsedChunk.success) {
        mergedCuratedEntries.push(...parsedChunk.data.entries);
        if (parsedChunk.data.summary.trim()) {
          summaryParts.push(parsedChunk.data.summary.trim());
        }
      }
    }

    const rawContent = rawOutputs.join('\n\n---\n\n');
    broadcast({
      type: 'agent:complete',
      agentRole: stage.role,
      novelId,
      chapterNumber: currentChapter || undefined,
      data: rawContent,
      timestamp,
    });

    const stageParsed = CurateFactionResult.parse({
      summary: summaryParts.join('；').slice(0, 800),
      entries: mergedCuratedEntries,
    });
    const previousCount = stageInputEntries.length;
    const stageOutputCount = stageParsed.entries.length;
    const minKeep = previousCount <= 4
      ? 1
      : Math.max(4, Math.ceil(previousCount * 0.6));
    const accepted = stageOutputCount > 0 && stageOutputCount >= minKeep;
    const nextStageEntries = accepted ? stageParsed.entries : stageInputEntries;
    stageReports.push({
      role: stage.role,
      summary: accepted
        ? stageParsed.summary
        : `${stageParsed.summary || '阶段输出偏少'}；产出 ${stageOutputCount}/${previousCount}，低于阈值 ${minKeep}，已保留上一阶段结果`,
      producedCount: nextStageEntries.length,
    });
    stageInputEntries = nextStageEntries;
  }

  const curatedParsed = CurateFactionResult.parse({
    summary: buildFactionCuratedSummary(stageReports),
    entries: stageInputEntries,
  });

  const {
    sanitizedEntries,
    fallbackApplied,
  } = sanitizeFactionEntriesWithFallback({
    curated: curatedParsed.entries,
    factionEntries,
    worldEntries,
    maxItems,
  });

  return {
    factionEntries,
    worldEntries,
    sanitizedEntries,
    stageReports,
    finalSummary: buildFactionFinalSummary({
      factionEntries,
      sanitizedEntries,
      stageReports,
      curatedSummary: curatedParsed.summary,
      fallbackApplied,
    }),
  };
}
