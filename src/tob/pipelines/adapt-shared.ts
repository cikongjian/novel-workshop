import path from 'node:path';
import type { CharacterProfile, SceneCard } from '../../novel/types.js';
import { syncSourceNovelToTarget } from './source-novel-sync.js';
import type { TobPipelineRunContext } from './types.js';

export type AdaptationMode = 'short-drama' | 'comic';

export function resolveChapterRange(params: {
  available: number[];
  start?: number;
  end?: number;
}): { start: number; end: number } {
  const sorted = params.available.slice().sort((a, b) => a - b);
  if (sorted.length === 0) {
    throw new Error('SOURCE_NOVEL_HAS_NO_CHAPTERS');
  }
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const start = Math.max(min, params.start ?? min);
  const end = Math.min(max, params.end ?? max);
  if (start > end) {
    throw new Error('INVALID_CHAPTER_RANGE');
  }
  return { start, end };
}

export async function prepareAdaptationContext(params: {
  context: TobPipelineRunContext;
  sourceNovelId: string;
  sourceChapterStart?: number;
  sourceChapterEnd?: number;
}): Promise<{
  sourceNovelId: string;
  targetNovelId: string;
  range: { start: number; end: number };
  characters: CharacterProfile[];
  sceneCardsByChapter: Record<number, SceneCard[]>;
}> {
  const { context } = params;
  const syncResult = await syncSourceNovelToTarget({
    sourceManager: context.runtime.sourceNovelManager,
    targetManager: context.runtime.novelManager,
    sourceNovelId: params.sourceNovelId,
    targetNovelId: context.project.pipelineNovelId,
    targetTitleHint: context.project.name,
  });

  if (context.project.pipelineNovelId !== syncResult.targetNovelId) {
    await context.repository.setProjectPipelineNovel(context.project.id, syncResult.targetNovelId);
  }
  if (context.project.sourceNovelId !== params.sourceNovelId) {
    await context.repository.setProjectSourceNovel(context.project.id, params.sourceNovelId);
  }

  const chapters = await context.runtime.novelManager.listChapters(syncResult.targetNovelId);
  const chapterNumbers = chapters.map((chapter) => chapter.chapterNumber);
  const range = resolveChapterRange({
    available: chapterNumbers,
    start: params.sourceChapterStart,
    end: params.sourceChapterEnd,
  });

  const characters = await context.runtime.novelManager.getCharacters(syncResult.targetNovelId);
  const sceneCardsByChapter: Record<number, SceneCard[]> = {};

  for (let chapterNumber = range.start; chapterNumber <= range.end; chapterNumber += 1) {
    const chapter = await context.runtime.novelManager.getChapter(syncResult.targetNovelId, chapterNumber);
    if (!chapter?.content?.trim()) {
      continue;
    }
    const cards = context.runtime.sceneCardExtractor.extract({
      chapterNumber,
      chapterTitle: chapter.title,
      chapterContent: chapter.content,
      characters: characters.map((character) => ({ id: character.id, name: character.name })),
    });
    await context.runtime.adaptationManager.saveSceneCards(syncResult.targetNovelId, chapterNumber, cards);
    sceneCardsByChapter[chapterNumber] = cards;
  }

  return {
    sourceNovelId: params.sourceNovelId,
    targetNovelId: syncResult.targetNovelId,
    range,
    characters,
    sceneCardsByChapter,
  };
}

export function createAdaptationOutputDir(params: {
  mode: AdaptationMode;
  range: { start: number; end: number };
  runLabel: string;
}): string {
  const runId = `${params.range.start}-${params.range.end}-${Date.now()}`;
  return path
    .join('adaptations', params.mode, `${params.runLabel}-${runId}`)
    .split(path.sep)
    .join('/');
}
