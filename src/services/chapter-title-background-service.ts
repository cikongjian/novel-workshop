import {
  shouldAdoptGeneratedChapterTitle,
  type ChapterTitleAuditInput,
  type ChapterTitleReplacementDecision,
} from '../agents/title-audit.js';
import {
  inspectGeneratedTitle,
  sanitizeGeneratedTitle,
} from '../agents/title-generation-strategy.js';
import type { NovelAgent } from '../agents/types.js';
import type { ModelClient } from '../models/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { ChapterGenerationResult } from '../pipeline/types.js';
import {
  generateTitleWithRetry,
  getRecentChapterTitles,
} from '../server/routes/handlers/shared/chapter-title-generation.js';
import { createLogger } from '../utils/logger.js';
import { buildChapterFallbackTitle } from '../utils/chapter-title-fallback.js';
import { refreshPersistedChapterDeliveryDiagnostics } from './chapter-delivery-diagnostics.js';
import { buildTitleTrace, mergeChapterDiagnostics } from './chapter-generation-diagnostics.js';

const logger = createLogger('ChapterTitleBackground');

export type EditorTitleCandidate = {
  title: string;
  accepted: boolean;
  reasons: string[];
};

export type ChapterTitleSource = 'editor' | 'title-generator' | 'fallback';

export type ChapterTitleResolution = {
  title: string;
  source: ChapterTitleSource;
  decision: ChapterTitleReplacementDecision;
  attemptedFallback?: string;
};

export function inspectEditorTitleCandidate(
  suggestedTitle: string | undefined,
  recentTitles: string[],
): EditorTitleCandidate {
  const title = sanitizeGeneratedTitle(suggestedTitle ?? '');
  if (!title) return { title: '', accepted: false, reasons: ['编辑未提供标题'] };
  const inspection = inspectGeneratedTitle(title, recentTitles);
  return {
    title,
    accepted: !inspection.mechanical,
    reasons: inspection.reasons,
  };
}

export function resolveAdoptableChapterTitle(params: {
  currentTitle?: string;
  candidateTitle: string;
  candidateSource: Exclude<ChapterTitleSource, 'fallback'>;
  auditInput: ChapterTitleAuditInput;
  outline?: string;
  content: string;
  chapterNumber: number;
}): ChapterTitleResolution {
  const candidateTitle = sanitizeGeneratedTitle(params.candidateTitle);
  const decision = shouldAdoptGeneratedChapterTitle({
    currentTitle: params.currentTitle,
    generatedTitle: candidateTitle,
    auditInput: params.auditInput,
  });
  if (decision.accept) {
    return { title: candidateTitle, source: params.candidateSource, decision };
  }

  const fallbackTitle = sanitizeGeneratedTitle(buildChapterFallbackTitle({
    outline: params.outline,
    content: params.content,
    chapterNumber: params.chapterNumber,
  }));
  if (!fallbackTitle || fallbackTitle === candidateTitle) {
    return { title: candidateTitle, source: params.candidateSource, decision };
  }

  const fallbackDecision = shouldAdoptGeneratedChapterTitle({
    currentTitle: params.currentTitle,
    generatedTitle: fallbackTitle,
    auditInput: params.auditInput,
  });
  if (!fallbackDecision.accept) {
    return {
      title: candidateTitle,
      source: params.candidateSource,
      decision,
      attemptedFallback: fallbackTitle,
    };
  }

  return {
    title: fallbackTitle,
    source: 'fallback',
    decision: fallbackDecision,
    attemptedFallback: fallbackTitle,
  };
}

export async function generateAndPersistChapterTitle(params: {
  novelManager: NovelManager;
  novelId: string;
  chapterNumber: number;
  result: ChapterGenerationResult;
  titleAgent: NovelAgent;
  modelClient: ModelClient;
}): Promise<void> {
  const {
    novelManager,
    novelId,
    chapterNumber,
    result,
    titleAgent,
    modelClient,
  } = params;
  if (!result.chapterContent) return;

  const novel = await novelManager.getNovel(novelId);
  const recentTitles = await getRecentChapterTitles(novelManager, novelId, chapterNumber);
  const editorCandidate = inspectEditorTitleCandidate(result.suggestedTitle, recentTitles);
  let generatedTitle = editorCandidate.title;
  let titleSource: Exclude<ChapterTitleSource, 'fallback'> = 'editor';

  if (!editorCandidate.accepted) {
    if (editorCandidate.title) {
      logger.debug('编辑建议标题未通过质量检查，改用独立标题生成', {
        chapterNumber,
        title: editorCandidate.title,
        reasons: editorCandidate.reasons,
      });
    }
    const previousChapter = chapterNumber > 1
      ? await novelManager.getChapter(novelId, chapterNumber - 1)
      : null;
    generatedTitle = await generateTitleWithRetry({
      titleAgent,
      novelId,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      genre: novel.genre,
      chapterNumber,
      previousTitle: previousChapter?.title || '',
      recentTitles,
      fullContent: result.chapterContent,
      modelClient,
    });
    titleSource = 'title-generator';
  }

  const chapter = await novelManager.getChapter(novelId, chapterNumber);
  if (!chapter) return;
  const auditInput: ChapterTitleAuditInput = {
    genre: novel.genre,
    novelTitle: novel.title,
    novelSynopsis: novel.synopsis,
    novelTags: novel.tags,
    constitutionTags: novel.constitutionTags,
    chapterNumber,
    outline: result.outline || '',
    summary: result.outline || '',
    fullContent: result.chapterContent,
    recentTitles,
  };
  const resolution = resolveAdoptableChapterTitle({
    currentTitle: chapter.title,
    candidateTitle: generatedTitle,
    candidateSource: titleSource,
    auditInput,
    outline: result.outline,
    content: result.chapterContent,
    chapterNumber,
  });

  if (!resolution.decision.accept) {
    logger.debug('章节保留原标题', {
      chapterNumber,
      titleSource: resolution.source,
      candidateTitle: resolution.title,
      attemptedFallback: resolution.attemptedFallback,
      reasons: resolution.decision.reasons,
    });
    return;
  }

  generatedTitle = resolution.title;
  chapter.title = generatedTitle;
  const updatedAt = new Date().toISOString();
  chapter.diagnostics = mergeChapterDiagnostics(chapter.diagnostics, {
    titleTrace: buildTitleTrace({
      candidateTitle: generatedTitle,
      adopted: true,
      currentScore: resolution.decision.currentScore,
      generatedScore: resolution.decision.generatedScore,
      reasons: resolution.decision.reasons,
      fullContent: result.chapterContent,
      recentTitles,
      provider: modelClient.provider,
      model: modelClient.model,
      updatedAt,
      source: resolution.source,
    }),
  }, updatedAt);
  chapter.updatedAt = updatedAt;
  await novelManager.saveChapter(novelId, chapter);
  await refreshPersistedChapterDeliveryDiagnostics(novelManager, novelId, chapterNumber);
}
