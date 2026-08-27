import type { ChapterSummary, NovelManager } from './novel-manager.js';
import { NovelPaths } from './novel-paths.js';
import { readText } from './fs-helpers.js';
import { PlotThreadSnapshot, type Chapter, type OutlineData } from './types.js';
import { ensureChapterPlotThreadSnapshots } from '../services/plot-thread-snapshot-service.js';
import { extractChapterFacts } from './chapter-fact-extractor.js';
import { extractFactsFromChapter, mergeFactsIntoGraph } from './fact-graph-builder.js';
import type { FactGraph } from './fact-graph-types.js';
import { collectFactGraphChapterNumbers } from './fact-graph-coverage.js';

export type ChapterFinalizationEvidence = {
  chapterNumber: number;
  status: string;
  wordCount: number;
  contentPresent: boolean;
  lifecyclePhase?: string;
  anchorWarnings: string[];
};

export type StructuralOrganizationPlan = {
  plotThreadSnapshotsSource: string;
  plotThreadSourceError?: string;
  threadAffectedChapterNumbers: number[];
  finalizationEvidence: ChapterFinalizationEvidence[];
  finalizationCandidates: Chapter[];
  factEvidence: {
    existingChapterNumbers: number[];
    candidateChapterNumbers: number[];
  };
  factCandidates: Chapter[];
};

function hasCorruptDirectionWarning(chapter: Chapter): boolean {
  return chapter.diagnostics?.userDirectionAnchorAudit?.warnings.some(warning => (
    warning.includes('mojibake') || warning.includes('question-mark corrupted')
  )) === true;
}

function canSafelyFinalize(chapter: Chapter): boolean {
  return chapter.status === 'reviewed'
    && chapter.content.trim().length > 0
    && chapter.wordCount > 0
    && chapter.diagnostics?.generationLifecycle?.phase === 'final'
    && !hasCorruptDirectionWarning(chapter);
}

function canSafelyBackfillFact(chapter: Chapter): boolean {
  return chapter.content.trim().length > 0
    && chapter.wordCount > 0
    && (
      chapter.status === 'finalized'
      || chapter.diagnostics?.generationLifecycle?.phase === 'final'
    );
}

function removeChapterFromFactGraph(graph: FactGraph, chapterNumber: number): FactGraph {
  return {
    ...graph,
    characterAppearances: graph.characterAppearances.filter(entry => entry.chapterNumber !== chapterNumber),
    itemTimeline: graph.itemTimeline.filter(entry => entry.chapterNumber !== chapterNumber),
    locationVisits: graph.locationVisits.filter(entry => entry.chapterNumber !== chapterNumber),
    timelineEvents: graph.timelineEvents.filter(entry => entry.chapterNumber !== chapterNumber),
    relationshipChanges: graph.relationshipChanges.filter(entry => entry.chapterNumber !== chapterNumber),
    characterStateChanges: graph.characterStateChanges.filter(entry => entry.chapterNumber !== chapterNumber),
    factEvents: (graph.factEvents ?? []).filter(entry => entry.chapterNumber !== chapterNumber),
  };
}

function parsePlotThreadSnapshotSource(source: string): {
  snapshots: Array<{ chapterNumber: number }>;
  error?: string;
} {
  if (!source.trim()) return { snapshots: [] };
  try {
    const raw = JSON.parse(source) as unknown;
    if (!Array.isArray(raw)) return { snapshots: [], error: '剧情线快照文件根节点不是数组' };
    const snapshots = raw.map(entry => PlotThreadSnapshot.parse(entry));
    return { snapshots };
  } catch (error) {
    return {
      snapshots: [],
      error: error instanceof Error ? error.message.slice(0, 240) : '剧情线快照文件损坏',
    };
  }
}

export async function loadStructuralOrganizationPlan(params: {
  novelManager: NovelManager;
  novelId: string;
  outline: OutlineData | null;
  chapterSummaries: ChapterSummary[];
  includeThreads: boolean;
  includeFinalization: boolean;
  includeFacts: boolean;
}): Promise<StructuralOrganizationPlan> {
  const {
    novelManager,
    novelId,
    outline,
    chapterSummaries,
    includeThreads,
    includeFinalization,
    includeFacts,
  } = params;
  const paths = new NovelPaths(novelManager.getDataDir());
  const plotThreadSnapshotsSource = includeThreads
    ? await readText(paths.plotThreadSnapshotsPath(novelId))
    : '';
  const parsedSnapshots = parsePlotThreadSnapshotSource(plotThreadSnapshotsSource);
  const snapshotChapters = new Set(parsedSnapshots.snapshots.map(snapshot => snapshot.chapterNumber));
  const nonEmptyChapterNumbers = chapterSummaries
    .filter(chapter => chapter.wordCount > 0)
    .map(chapter => chapter.chapterNumber);
  const outlineChapterByNumber = new Map(
    (outline?.chapters ?? []).map(chapter => [chapter.chapterNumber, chapter]),
  );
  const threadAffectedChapterNumbers = includeThreads && !parsedSnapshots.error
    ? nonEmptyChapterNumbers.filter(chapterNumber => (
        (outline?.plotThreads.length ?? 0) === 0
        || !snapshotChapters.has(chapterNumber)
        || (outlineChapterByNumber.get(chapterNumber)?.plotThreadsAdvanced.length ?? 0) === 0
      ))
    : [];

  const loadedChapters = includeFinalization || includeFacts
    ? await Promise.all(chapterSummaries.map(summary => (
        novelManager.getChapter(novelId, summary.chapterNumber).catch(() => null)
      )))
    : [];
  const chapters = loadedChapters.filter((chapter): chapter is Chapter => chapter !== null);
  const finalizationEvidence = chapters.map((chapter): ChapterFinalizationEvidence => ({
    chapterNumber: chapter.chapterNumber,
    status: chapter.status,
    wordCount: chapter.wordCount,
    contentPresent: chapter.content.trim().length > 0,
    lifecyclePhase: chapter.diagnostics?.generationLifecycle?.phase,
    anchorWarnings: chapter.diagnostics?.userDirectionAnchorAudit?.warnings ?? [],
  }));
  const factGraph = includeFacts ? await novelManager.getFactGraph(novelId) : null;
  const existingFactChapterNumbers = factGraph ? collectFactGraphChapterNumbers(factGraph) : [];
  const existingFactChapters = new Set(existingFactChapterNumbers);
  const factCandidates = chapters.filter(chapter => (
    canSafelyBackfillFact(chapter) && !existingFactChapters.has(chapter.chapterNumber)
  ));

  return {
    plotThreadSnapshotsSource,
    plotThreadSourceError: parsedSnapshots.error,
    threadAffectedChapterNumbers,
    finalizationEvidence,
    finalizationCandidates: chapters.filter(canSafelyFinalize),
    factEvidence: {
      existingChapterNumbers: existingFactChapterNumbers,
      candidateChapterNumbers: factCandidates.map(chapter => chapter.chapterNumber),
    },
    factCandidates,
  };
}

export async function applyFactOrganizationRepair(params: {
  novelManager: NovelManager;
  novelId: string;
  chapters: Chapter[];
}): Promise<void> {
  if (params.chapters.length === 0) return;
  const [characters, worldEntries] = await Promise.all([
    params.novelManager.getCharacters(params.novelId),
    params.novelManager.getWorldEntries(params.novelId),
  ]);
  const characterNames = characters.flatMap(character => [character.name, ...character.aliases]);
  let factGraph = await params.novelManager.getFactGraph(params.novelId);
  for (const chapter of params.chapters) {
    const extractedFacts = extractFactsFromChapter({
      chapterContent: chapter.content,
      chapterNumber: chapter.chapterNumber,
      characterNames,
    });
    factGraph = mergeFactsIntoGraph(
      removeChapterFromFactGraph(factGraph, chapter.chapterNumber),
      extractedFacts,
      chapter.chapterNumber,
    );
    await params.novelManager.saveChapterFact(
      params.novelId,
      chapter.chapterNumber,
      extractChapterFacts({
        chapterContent: chapter.content,
        characters,
        worldEntries,
      }),
    );
  }
  await params.novelManager.saveFactGraph(params.novelId, factGraph);
}

export async function applyThreadOrganizationRepair(params: {
  novelManager: NovelManager;
  novelId: string;
  chapterNumbers: number[];
}): Promise<void> {
  for (const chapterNumber of params.chapterNumbers) {
    await ensureChapterPlotThreadSnapshots({
      novelManager: params.novelManager,
      novelId: params.novelId,
      chapterNumber,
    });
  }
}

export async function applyFinalizationOrganizationRepair(params: {
  novelManager: NovelManager;
  novelId: string;
  chapters: Chapter[];
}): Promise<void> {
  const updatedAt = new Date().toISOString();
  for (const chapter of params.chapters) {
    chapter.status = 'finalized';
    chapter.updatedAt = updatedAt;
    if (chapter.diagnostics?.generationLifecycle) {
      chapter.diagnostics.generationLifecycle.chapterStatus = 'finalized';
      chapter.diagnostics.generationLifecycle.updatedAt = updatedAt;
    }
    await params.novelManager.saveChapter(params.novelId, chapter);
  }
  if (params.chapters.length > 0) {
    await params.novelManager.syncNovelMetadataByChapters(params.novelId);
  }
}
