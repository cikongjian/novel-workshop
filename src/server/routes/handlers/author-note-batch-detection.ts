import {
  scoreChapterImportance,
  KEY_CHAPTER_THRESHOLD,
} from '../../../pipeline/key-chapter-scorer.js';
import type { GenerateDeps } from './types.js';
import type { AuthorNoteBatchTarget, KeyChapterInfo } from './author-note-batch-types.js';

async function loadOutlineSummary(
  deps: GenerateDeps,
  novelId: string,
): Promise<{
  chapters: Array<{ chapterNumber: number; tensionTarget?: number; keyEvents?: string[]; summary?: string }>;
  plotThreads?: Array<{ id: string; status: string }>;
}> {
  try {
    return await deps.novelManager.getOutline(novelId) as {
      chapters: Array<{ chapterNumber: number; tensionTarget?: number; keyEvents?: string[]; summary?: string }>;
      plotThreads?: Array<{ id: string; status: string }>;
    };
  } catch {
    return { chapters: [] };
  }
}

async function loadPlotSnapshots(
  deps: GenerateDeps,
  novelId: string,
): Promise<Array<{ threadId: string; chapterNumber: number; status: string }>> {
  try {
    return await deps.novelManager.getPlotThreadSnapshots(novelId);
  } catch {
    return [];
  }
}

export async function detectKeyChapters(
  deps: GenerateDeps,
  novelId: string,
  threshold?: number,
  skipExisting = true,
): Promise<{
  keyChapters: KeyChapterInfo[];
  toGenerate: KeyChapterInfo[];
  totalChapters: number;
  skippedWithExisting: number;
}> {
  const { novelManager } = deps;
  const chapters = await novelManager.listChapters(novelId);
  if (chapters.length === 0) {
    return { keyChapters: [], toGenerate: [], totalChapters: 0, skippedWithExisting: 0 };
  }

  const [outline, plotSnapshots] = await Promise.all([
    loadOutlineSummary(deps, novelId),
    loadPlotSnapshots(deps, novelId),
  ]);

  const climaxThreadIds = new Set(
    (outline.plotThreads ?? []).filter(thread => thread.status === 'climax').map(thread => thread.id),
  );

  const totalWords = chapters.reduce((sum, chapter) => sum + (chapter.wordCount ?? 0), 0);
  const avgWordCount = chapters.length > 0 ? totalWords / chapters.length : 0;
  const scoreThreshold = typeof threshold === 'number' ? threshold : KEY_CHAPTER_THRESHOLD;
  const allResults: KeyChapterInfo[] = [];

  for (const chapter of chapters) {
    const chapterOutline = outline.chapters.find(item => item.chapterNumber === chapter.chapterNumber);
    const chapterSnapshots = plotSnapshots.filter(item => item.chapterNumber === chapter.chapterNumber);
    const hasClimaxThread = chapterSnapshots.some(
      item => climaxThreadIds.has(item.threadId) && (item.status === 'advanced' || item.status === 'new'),
    );

    const importance = scoreChapterImportance({
      tensionTarget: chapterOutline?.tensionTarget,
      keyEvents: chapterOutline?.keyEvents,
      readerScore: chapter.readerScore,
      snapshotStatuses: chapterSnapshots.map(item => item.status),
      hasClimaxThread,
      chapterNumber: chapter.chapterNumber,
      totalChapters: chapters.length,
      wordCount: chapter.wordCount,
      avgWordCount,
    });

    let hasExisting = false;
    if (skipExisting) {
      try {
        const fullChapter = await novelManager.getChapter(novelId, chapter.chapterNumber);
        hasExisting = (fullChapter?.authorNotes?.length ?? 0) > 0;
      } catch {
        // ignore
      }
    }

    if (importance.score >= scoreThreshold) {
      allResults.push({
        chapterNumber: chapter.chapterNumber,
        score: importance.score,
        keyType: importance.keyType,
        signals: importance.signals,
        hasExistingNotes: hasExisting,
      });
    }
  }

  const toGenerate = skipExisting
    ? allResults.filter(result => !result.hasExistingNotes)
    : allResults;

  return {
    keyChapters: allResults,
    toGenerate,
    totalChapters: chapters.length,
    skippedWithExisting: allResults.length - toGenerate.length,
  };
}

export async function resolveAuthorNoteBatchTargetChapters(
  deps: GenerateDeps,
  params: {
    novelId: string;
    chapterNumbers?: number[];
    threshold?: number;
    skipExisting?: boolean;
  },
): Promise<AuthorNoteBatchTarget[]> {
  const { novelManager } = deps;
  const { novelId, chapterNumbers, threshold, skipExisting = true } = params;
  const chapters = await novelManager.listChapters(novelId);
  if (chapters.length === 0) {
    return [];
  }

  if (Array.isArray(chapterNumbers) && chapterNumbers.length > 0) {
    const validChapterNums = new Set(chapters.map(chapter => chapter.chapterNumber));
    const invalid = chapterNumbers.filter(chapterNumber => !validChapterNums.has(chapterNumber));
    if (invalid.length > 0) {
      throw new Error(`以下章节不存在：${invalid.join('、')}`);
    }

    const filtered: AuthorNoteBatchTarget[] = [];
    for (const chapterNumber of chapterNumbers) {
      if (skipExisting) {
        try {
          const chapter = await novelManager.getChapter(novelId, chapterNumber);
          if ((chapter?.authorNotes?.length ?? 0) > 0) continue;
        } catch {
          // ignore
        }
      }
      filtered.push({ chapterNumber, keyType: 'normal' });
    }
    return filtered;
  }

  const detected = await detectKeyChapters(deps, novelId, threshold, skipExisting);
  return detected.toGenerate.map(result => ({
    chapterNumber: result.chapterNumber,
    keyType: result.keyType,
  }));
}
