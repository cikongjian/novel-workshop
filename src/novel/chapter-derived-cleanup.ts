import fs from 'node:fs/promises';
import path from 'node:path';
import type { NovelPaths } from './novel-paths.js';
import { readJson, writeJson } from './fs-helpers.js';
import { FactGraph } from './fact-graph-types.js';
import { getCostData, saveCostData } from './derived-data-repository.js';
import type {
  ChapterPacing,
  CharacterEvent,
  CharacterStateSnapshot,
  OutlineDeviation,
  PlotThreadSnapshot,
} from './types.js';
import { OutlineData } from './types.js';
import type { CollaborationEntry } from '../pipeline/collaboration-log.js';
import type { PendingCharacterCandidate } from './character-repository.js';

async function removeFileIfExists(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}

async function removeTruthFilesDir(novelDir: string): Promise<void> {
  const truthDir = path.join(novelDir, 'truth-files');
  await fs.rm(truthDir, { recursive: true, force: true });
}

async function removeComicChapterDir(novelDir: string, chapterNumber: number): Promise<void> {
  const comicDir = path.join(novelDir, 'comics', `chapter-${chapterNumber}`);
  await fs.rm(comicDir, { recursive: true, force: true });
}

function pruneChapterEntries<T extends { chapterNumber: number }>(
  items: T[],
  chapterNumber: number,
): T[] {
  return items.filter(item => item.chapterNumber !== chapterNumber);
}

export async function cleanupDeletedChapterArtifacts(
  paths: NovelPaths,
  novelId: string,
  chapterNumber: number,
): Promise<void> {
  await Promise.all([
    removeFileIfExists(paths.chapterFactFilePath(novelId, chapterNumber)),
    removeFileIfExists(paths.characterEventsFilePath(novelId, chapterNumber)),
    removeTruthFilesDir(paths.novelDir(novelId)),
    removeComicChapterDir(paths.novelDir(novelId), chapterNumber),
  ]);

  // 清理成本记录：过滤掉该章节并重算 totals
  try {
    const costData = await getCostData(paths, novelId);
    const nextChapters = costData.chapters.filter(c => c.chapterNumber !== chapterNumber);
    if (nextChapters.length !== costData.chapters.length) {
      costData.chapters = nextChapters;
      costData.totalCost = nextChapters.reduce((sum, c) => sum + c.totalCost, 0);
      costData.totalInputTokens = nextChapters.reduce((sum, c) => sum + c.totalInputTokens, 0);
      costData.totalOutputTokens = nextChapters.reduce((sum, c) => sum + c.totalOutputTokens, 0);
      costData.lastUpdated = new Date().toISOString();
      await saveCostData(paths, novelId, costData);
    }
  } catch {
    // cost-data.json 不存在或读取失败，忽略
  }

  const [
    pacing,
    plotSnapshots,
    outlineDeviations,
    collaborationLogs,
    characterStates,
    pendingCharacters,
    factGraphRaw,
    outlineRaw,
  ] = await Promise.all([
    readJson<ChapterPacing[]>(paths.pacingPath(novelId), []),
    readJson<PlotThreadSnapshot[]>(paths.plotThreadSnapshotsPath(novelId), []),
    readJson<OutlineDeviation[]>(paths.outlineDeviationsPath(novelId), []),
    readJson<Record<number, CollaborationEntry[]>>(paths.collaborationLogPath(novelId), {}),
    readJson<CharacterStateSnapshot[]>(paths.characterStatesPath(novelId), []),
    readJson<PendingCharacterCandidate[]>(paths.pendingCharactersPath(novelId), []),
    readJson<Record<string, unknown> | null>(paths.factGraphPath(novelId), null),
    readJson<Record<string, unknown> | null>(paths.outlinePath(novelId), null),
  ]);

  const nextPacing = pruneChapterEntries(pacing, chapterNumber);
  if (nextPacing.length !== pacing.length) {
    await writeJson(paths.pacingPath(novelId), nextPacing);
  }

  const nextPlotSnapshots = pruneChapterEntries(plotSnapshots, chapterNumber);
  if (nextPlotSnapshots.length !== plotSnapshots.length) {
    await writeJson(paths.plotThreadSnapshotsPath(novelId), nextPlotSnapshots);
  }

  const nextOutlineDeviations = pruneChapterEntries(outlineDeviations, chapterNumber);
  if (nextOutlineDeviations.length !== outlineDeviations.length) {
    await writeJson(paths.outlineDeviationsPath(novelId), nextOutlineDeviations);
  }

  // 清理 outline.json 中对应章节的条目
  if (outlineRaw) {
    try {
      const outline = OutlineData.parse(outlineRaw);
      const nextChapters = outline.chapters.filter(ch => ch.chapterNumber !== chapterNumber);
      if (nextChapters.length !== outline.chapters.length) {
        await writeJson(paths.outlinePath(novelId), {
          ...outline,
          chapters: nextChapters,
        });
      }
    } catch {
      // outline.json 格式异常时跳过
    }
  }

  if (Object.prototype.hasOwnProperty.call(collaborationLogs, chapterNumber)) {
    delete collaborationLogs[chapterNumber];
    await writeJson(paths.collaborationLogPath(novelId), collaborationLogs);
  }

  const nextCharacterStates = pruneChapterEntries(characterStates, chapterNumber);
  if (nextCharacterStates.length !== characterStates.length) {
    await writeJson(paths.characterStatesPath(novelId), nextCharacterStates);
  }

  const nextPendingCharacters = pendingCharacters
    .map(candidate => {
      if (candidate.firstDetectedIn === chapterNumber && candidate.lastDetectedIn === chapterNumber) {
        return null;
      }
      if (candidate.firstDetectedIn === chapterNumber) {
        return null;
      }
      if (candidate.lastDetectedIn === chapterNumber) {
        return {
          ...candidate,
          lastDetectedIn: candidate.firstDetectedIn,
        };
      }
      return candidate;
    })
    .filter((candidate): candidate is PendingCharacterCandidate => candidate !== null);
  if (nextPendingCharacters.length !== pendingCharacters.length) {
    await writeJson(paths.pendingCharactersPath(novelId), nextPendingCharacters);
  }

  if (factGraphRaw) {
    const factGraph = FactGraph.parse(factGraphRaw);
    const nextFactGraph = {
      ...factGraph,
      lastUpdatedChapter: factGraph.lastUpdatedChapter === chapterNumber
        ? Math.max(0, chapterNumber - 1)
        : factGraph.lastUpdatedChapter,
      characterAppearances: pruneChapterEntries(factGraph.characterAppearances, chapterNumber),
      itemTimeline: pruneChapterEntries(factGraph.itemTimeline, chapterNumber),
      locationVisits: pruneChapterEntries(factGraph.locationVisits, chapterNumber),
      timelineEvents: pruneChapterEntries(factGraph.timelineEvents, chapterNumber),
      relationshipChanges: pruneChapterEntries(factGraph.relationshipChanges, chapterNumber),
      characterStateChanges: pruneChapterEntries(factGraph.characterStateChanges, chapterNumber),
      factEvents: pruneChapterEntries(factGraph.factEvents ?? [], chapterNumber),
    };
    await writeJson(paths.factGraphPath(novelId), nextFactGraph);
  }
}
