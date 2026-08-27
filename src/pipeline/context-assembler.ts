import type { PipelineNovelManager, PipelineMemory } from './types.js';
import type { ChapterReadCache } from './pipeline-constants.js';
import type { NovelMetadata, CharacterProfile, WorldEntry, CharacterEvent, OutlineData } from '../novel/types.js';
import type { StyleDNA } from '../style/style-types.js';
import { buildPreviousChapterContext } from './context-builders.js';
import { loadPrevChapterSmartGateHints } from './smart-gate-hints.js';
import { getNovelsDir } from '../config/index.js';

export interface ContextAssemblyResult {
  novel: NovelMetadata;
  prevChapterContext: string;
  memoryContext: string;
  styleDna: StyleDNA | null;
  outline: OutlineData;
  characters: CharacterProfile[];
  worldEntries: WorldEntry[];
  events: CharacterEvent[];
  prevSmartGateHints: string | undefined;
}

export async function assembleContext(
  novelId: string,
  chapterNumber: number,
  userDirection: string,
  novelManager: PipelineNovelManager,
  memory: PipelineMemory,
  chapterCache: ChapterReadCache,
  getCharactersCached: (novelId: string) => Promise<CharacterProfile[]>,
): Promise<ContextAssemblyResult> {
  const [
    novel,
    prevChapterContext,
    memoryContext,
    styleDna,
    outline,
    characters,
    worldEntries,
    events,
    prevSmartGateHints,
  ] = await Promise.all([
    novelManager.getNovel(novelId),
    buildPreviousChapterContext(novelManager, chapterCache, novelId, chapterNumber),
    memory.searchChapterContext(novelId, userDirection, chapterNumber),
    novelManager.getStyleDna?.(novelId).catch(() => null) ?? Promise.resolve(null),
    novelManager.getOutline(novelId),
    getCharactersCached(novelId),
    novelManager.getWorldEntries(novelId),
    novelManager.getCharacterEvents(novelId),
    loadPrevChapterSmartGateHints(getNovelsDir(), novelId, chapterNumber).catch(() => undefined),
  ]);

  return {
    novel,
    prevChapterContext,
    memoryContext,
    styleDna,
    outline,
    characters,
    worldEntries,
    events,
    prevSmartGateHints,
  };
}
