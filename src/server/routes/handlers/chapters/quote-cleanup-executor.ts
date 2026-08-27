import type { ChapterQuoteDeps, CleanQuoteUsageInput } from './quote-cleanup-types.js';
import {
  buildQuoteCleanupSummary,
  buildSelectedEditMap,
  cleanNonDialogueQuotes,
  normalizeQuoteTextForFeedback,
  resolveQuoteCleanupTargets,
  type QuoteCleanupResult,
} from './quote-cleanup-heuristics.js';

export async function executeQuoteCleanup(params: {
  deps: ChapterQuoteDeps;
  novelId: string;
  body: CleanQuoteUsageInput;
  apply: boolean;
}) {
  const { deps, novelId, body, apply } = params;
  const { novelManager } = deps;
  const chapterMetas = await novelManager.listChapters(novelId);
  const targetNumbers = resolveQuoteCleanupTargets(chapterMetas.map(meta => meta.chapterNumber), body);
  const selectedEditMap = buildSelectedEditMap(body.selectedEdits);
  const feedback = await novelManager.getQuoteCleanupFeedback(novelId);
  const ignoredQuoteSet = new Set(
    feedback.ignoredQuoteTexts
      .map(item => normalizeQuoteTextForFeedback(item))
      .filter(Boolean),
  );

  let totalScanned = 0;
  let totalReplacements = 0;
  const changes: Array<{
    chapterNumber: number;
    title: string;
    replacements: number;
    beforeSample: string;
    afterSample: string;
    examples: Array<{ id: string; before: string; after: string; quoteText: string; recommended: boolean }>;
  }> = [];

  const READ_BATCH = 50;
  type CleanupCandidate = {
    chapterNumber: number;
    title: string;
    cleaned: QuoteCleanupResult;
    originalChapter: NonNullable<Awaited<ReturnType<typeof novelManager.getChapter>>>;
  };
  const candidates: CleanupCandidate[] = [];

  for (let i = 0; i < targetNumbers.length; i += READ_BATCH) {
    const batch = targetNumbers.slice(i, i + READ_BATCH);
    const results = await Promise.all(
      batch.map(num => novelManager.getChapter(novelId, num)),
    );
    for (let j = 0; j < results.length; j += 1) {
      const chapter = results[j];
      if (!chapter || !chapter.content.trim()) continue;
      totalScanned += 1;

      const selectedIds = apply ? selectedEditMap.get(chapter.chapterNumber) : undefined;
      const cleaned = cleanNonDialogueQuotes(chapter.content, selectedIds, ignoredQuoteSet);
      if (cleaned.replacements <= 0 || cleaned.content === chapter.content) continue;

      candidates.push({
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        cleaned,
        originalChapter: chapter,
      });
    }
  }

  for (const item of candidates) {
    totalReplacements += item.cleaned.replacements;
    changes.push({
      chapterNumber: item.chapterNumber,
      title: item.title,
      replacements: item.cleaned.replacements,
      beforeSample: item.cleaned.beforeSample,
      afterSample: item.cleaned.afterSample,
      examples: item.cleaned.examples,
    });

    if (apply) {
      await novelManager.archiveChapterVersion(novelId, item.chapterNumber, 'manual-save');
      item.originalChapter.content = item.cleaned.content;
      item.originalChapter.wordCount = item.cleaned.content.length;
      item.originalChapter.updatedAt = new Date().toISOString();
      await novelManager.saveChapter(novelId, item.originalChapter);
    }
  }

  if (apply && changes.length > 0) {
    await novelManager.syncNovelMetadataByChapters(novelId);
  }

  const maxPreview = body.maxPreview ?? 30;
  const previewItems = changes.slice(0, maxPreview);

  return {
    novelId,
    applied: apply,
    targetCount: targetNumbers.length,
    totalScanned,
    affectedChapters: changes.length,
    totalReplacements,
    truncated: changes.length > previewItems.length,
    summary: buildQuoteCleanupSummary({
      applied: apply,
      totalScanned,
      affected: changes.length,
      replacements: totalReplacements,
    }),
    items: previewItems,
  };
}
