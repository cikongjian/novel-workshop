import type { NovelManager, ChapterSummary, PendingCharacterCandidate } from './novel-manager.js';
import { NovelPaths } from './novel-paths.js';
import { readJson, readText } from './fs-helpers.js';
import {
  CharacterEvent,
  CharacterProfile,
  CharacterStateSnapshot,
  OutlineData,
  PlotThreadSnapshot,
  type NovelMetadata,
  type WorldEntry,
} from './types.js';

export type InvalidNovelDataEntry = {
  index: number;
  message: string;
};

export type NovelMaintenanceSnapshot = {
  novel: NovelMetadata;
  persistedMetadataStats: {
    chapterCount?: number;
    finalizedChapterCount?: number;
    wordCount?: number;
  };
  chapters: ChapterSummary[];
  rawCharacters: unknown[];
  charactersSource: string;
  charactersFileError?: string;
  characters: CharacterProfile[];
  invalidCharacters: InvalidNovelDataEntry[];
  pendingCharacters: PendingCharacterCandidate[];
  pendingCharactersSource: string;
  outline: OutlineData | null;
  outlineSource: string;
  outlineError?: string;
  characterStates: CharacterStateSnapshot[];
  invalidCharacterStates: InvalidNovelDataEntry[];
  characterEvents: CharacterEvent[];
  worldEntries: WorldEntry[];
  plotThreadSnapshots: PlotThreadSnapshot[];
  invalidPlotThreadSnapshots: InvalidNovelDataEntry[];
};

function issueMessage(error: unknown): string {
  if (!(error instanceof Error)) return '数据格式无效';
  return error.message.slice(0, 240);
}

function parseEntries<T>(
  raw: unknown[],
  parse: (value: unknown) => T,
): { valid: T[]; invalid: InvalidNovelDataEntry[] } {
  const valid: T[] = [];
  const invalid: InvalidNovelDataEntry[] = [];
  raw.forEach((entry, index) => {
    try {
      valid.push(parse(entry));
    } catch (error) {
      invalid.push({ index, message: issueMessage(error) });
    }
  });
  return { valid, invalid };
}

function parseJsonArraySource(source: string): { values: unknown[]; error?: string } {
  if (!source.trim()) return { values: [] };
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!Array.isArray(parsed)) return { values: [], error: '文件根节点不是数组' };
    return { values: parsed };
  } catch (error) {
    return { values: [], error: issueMessage(error) };
  }
}

export async function loadNovelMaintenanceSnapshot(
  novelManager: NovelManager,
  novelId: string,
): Promise<NovelMaintenanceSnapshot> {
  const paths = new NovelPaths(novelManager.getDataDir());
  const [novel, chapters, rawMetadata, charactersSource, pendingCharactersSource, pendingCharacters, statesSource, outlineSource, plotThreadSnapshotsSource, characterEvents, worldEntries] = await Promise.all([
    novelManager.getNovel(novelId),
    novelManager.listChapters(novelId),
    readJson<Record<string, unknown>>(paths.novelMetaPath(novelId), {}),
    readText(paths.charactersPath(novelId)),
    readText(paths.pendingCharactersPath(novelId)),
    novelManager.getPendingCharacterCandidates(novelId).catch(() => []),
    readText(paths.characterStatesPath(novelId)),
    readText(paths.outlinePath(novelId)),
    readText(paths.plotThreadSnapshotsPath(novelId)),
    novelManager.getCharacterEvents(novelId).catch(() => []),
    novelManager.getWorldEntries(novelId).catch(() => []),
  ]);

  const characterSourceResult = parseJsonArraySource(charactersSource);
  const stateSourceResult = parseJsonArraySource(statesSource);
  const rawCharacters = characterSourceResult.values;
  const rawStates = stateSourceResult.values;
  const plotThreadSnapshotSourceResult = parseJsonArraySource(plotThreadSnapshotsSource);

  const parsedCharacters = parseEntries(rawCharacters, value => CharacterProfile.parse(value));
  const parsedStates = parseEntries(rawStates, value => CharacterStateSnapshot.parse(value));
  const parsedEvents = parseEntries(characterEvents, value => CharacterEvent.parse(value));
  const parsedPlotThreadSnapshots = parseEntries(
    plotThreadSnapshotSourceResult.values,
    value => PlotThreadSnapshot.parse(value),
  );

  let outline: OutlineData | null = null;
  let outlineError: string | undefined;
  try {
    if (outlineSource.trim()) {
      outline = OutlineData.parse(JSON.parse(outlineSource) as unknown);
    }
  } catch (error) {
    outlineError = issueMessage(error);
  }

  return {
    novel,
    persistedMetadataStats: {
      chapterCount: typeof rawMetadata.chapterCount === 'number' ? rawMetadata.chapterCount : undefined,
      finalizedChapterCount: typeof rawMetadata.finalizedChapterCount === 'number'
        ? rawMetadata.finalizedChapterCount
        : undefined,
      wordCount: typeof rawMetadata.wordCount === 'number' ? rawMetadata.wordCount : undefined,
    },
    chapters,
    rawCharacters,
    charactersSource,
    charactersFileError: characterSourceResult.error,
    characters: parsedCharacters.valid,
    invalidCharacters: parsedCharacters.invalid,
    pendingCharacters,
    pendingCharactersSource,
    outline,
    outlineSource,
    outlineError,
    characterStates: parsedStates.valid,
    invalidCharacterStates: stateSourceResult.error
      ? [{ index: -1, message: stateSourceResult.error }]
      : parsedStates.invalid,
    characterEvents: parsedEvents.valid,
    worldEntries,
    plotThreadSnapshots: parsedPlotThreadSnapshots.valid,
    invalidPlotThreadSnapshots: plotThreadSnapshotSourceResult.error
      ? [{ index: -1, message: plotThreadSnapshotSourceResult.error }]
      : parsedPlotThreadSnapshots.invalid,
  };
}
