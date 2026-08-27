import type { NovelManager } from '../novel/novel-manager.js';
import type { Chapter } from '../novel/types.js';
import { auditGenreDrift } from '../pipeline/genre-drift-audit.js';
import { buildNovelPromiseContract } from '../pipeline/novel-promise-contract.js';
import {
  auditChapterReadability,
  mergeReadabilityAuditIntoDiagnostics,
} from '../pipeline/readability-audit.js';
import {
  auditReaderDelivery,
  mergeReaderDeliveryAuditIntoDiagnostics,
} from '../pipeline/reader-delivery-audit.js';

export function buildChapterDeliveryDiagnostics(params: {
  chapter: Chapter;
  novel: Awaited<ReturnType<NovelManager['getNovel']>>;
  previousChapter?: Chapter | null;
}): Chapter['diagnostics'] {
  const { chapter, novel, previousChapter } = params;
  if (!novel) return chapter.diagnostics;
  const promiseContract = buildNovelPromiseContract(novel);
  const genreDrift = auditGenreDrift({
    chapterContent: chapter.content,
    title: novel.title,
    synopsis: novel.synopsis,
    genre: novel.genre,
    tags: novel.tags,
    constitutionTags: novel.constitutionTags,
    promiseContract,
  });
  const readabilityAudit = auditChapterReadability({
    chapterContent: chapter.content,
    readerScore: chapter.readerScore,
    previousReaderScore: previousChapter?.readerScore,
    qualityGate: chapter.diagnostics?.qualityGate,
    genreDrift,
  });
  const withReadability = {
    ...chapter,
    diagnostics: mergeReadabilityAuditIntoDiagnostics(chapter, readabilityAudit),
  };
  const readerDeliveryAudit = auditReaderDelivery({
    chapter: withReadability,
    previousChapter,
  });
  return mergeReaderDeliveryAuditIntoDiagnostics(withReadability, readerDeliveryAudit);
}

export function reconcileDeliveryDiagnostics(
  diagnostics: Chapter['diagnostics'],
): Chapter['diagnostics'] {
  if (!diagnostics) return diagnostics;
  const readerDeliveryAudit = diagnostics.readerDeliveryAudit;
  const anchorAudit = diagnostics.userDirectionAnchorAudit;
  const autoRevision = diagnostics.autoRevision;
  let next = diagnostics;

  if (autoRevision && readerDeliveryAudit) {
    const anchorPassed = !anchorAudit?.shouldRepair;
    const accepted = readerDeliveryAudit.passed && anchorPassed;
    const reason = !anchorPassed
      ? [
          autoRevision.reason,
          `final-save-direction-anchors-missing:${anchorAudit?.coverage ?? 0}`,
        ].filter(Boolean).join('; ')
      : readerDeliveryAudit.passed
        ? (autoRevision.reason?.startsWith('reader-delivery-still-failed')
            ? `${autoRevision.reason}; final-save-reader-delivery-passed`
            : autoRevision.reason)
        : (autoRevision.reason?.startsWith('reader-delivery-passed')
            ? `${autoRevision.reason}; final-save-reader-delivery-failed`
            : autoRevision.reason);
    next = {
      ...next,
      autoRevision: {
        ...autoRevision,
        accepted,
        readerDeliveryFinalScore: readerDeliveryAudit.score,
        readerDeliveryPassed: readerDeliveryAudit.passed,
        reason,
      },
    };
  }

  const lifecycle = next.generationLifecycle;
  if (!lifecycle) return next;
  const warnings = new Set(
    (lifecycle.warnings ?? []).filter(warning => !warning.startsWith('reader-delivery-failed:')),
  );
  if (readerDeliveryAudit && !readerDeliveryAudit.passed) {
    warnings.add(`reader-delivery-failed:${readerDeliveryAudit.score}`);
  }
  if (next.qualityGate?.passed === false) {
    warnings.add(`quality-gate-failed:${next.qualityGate.overallScore ?? 'unknown'}`);
  }
  if (next.worldGate?.hasViolations) {
    warnings.add(`world-gate-findings:${next.worldGate.findings.length}`);
  }
  if (next.worldGate?.repairAttempted && !next.worldGate.repairApplied) {
    warnings.add('world-gate-repair-not-applied');
  }
  if (next.readabilityAudit && !next.readabilityAudit.qualityFloorPassed) {
    warnings.add(`readability-failed:wordCount=${next.readabilityAudit.wordCount}`);
  }
  return {
    ...next,
    generationLifecycle: {
      ...lifecycle,
      warnings: [...warnings],
    },
  };
}

export async function refreshPersistedChapterDeliveryDiagnostics(
  novelManager: NovelManager,
  novelId: string,
  chapterNumber: number,
): Promise<Chapter | null> {
  const chapter = await novelManager.getChapter(novelId, chapterNumber);
  if (!chapter) return null;
  const [novel, previousChapter] = await Promise.all([
    novelManager.getNovel(novelId),
    chapterNumber > 1
      ? novelManager.getChapter(novelId, chapterNumber - 1).catch(() => null)
      : Promise.resolve(null),
  ]);
  chapter.diagnostics = reconcileDeliveryDiagnostics(buildChapterDeliveryDiagnostics({
    chapter,
    novel,
    previousChapter,
  }));
  chapter.updatedAt = new Date().toISOString();
  await novelManager.saveChapter(novelId, chapter);
  return chapter;
}
