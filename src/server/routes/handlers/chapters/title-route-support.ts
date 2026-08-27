import type { NovelAgent } from '../../../../agents/types.js';
import {
  DEFAULT_TITLE_REWRITE_SCORE,
  evaluateChapterTitle,
  isPlaceholderChapterTitle,
  shouldAdoptGeneratedChapterTitle,
} from '../../../../agents/title-audit.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { createLogger } from '../../../../utils/logger.js';
import type { AuthDb } from '../../../../auth/types.js';
import {
  generateTitleWithRetry,
  getRecentChapterTitles,
} from '../shared/chapter-title-generation.js';
import {
  buildTitleTrace,
  mergeChapterDiagnostics,
} from '../../../../services/chapter-generation-diagnostics.js';

const logger = createLogger('TitleGeneration');

export interface ChapterTitleDeps {
  novelManager: NovelManager;
  modelClient?: ModelClient;
  agents?: Map<string, NovelAgent>;
  authDb?: AuthDb;
}

type ChapterSummaryLike = {
  chapterNumber: number;
  title: string;
  summary?: string;
};

type NovelLike = {
  title: string;
  synopsis: string;
  genre: string;
  tags?: string[];
  constitutionTags?: string[];
  startupPlatformProfile?: 'auto' | 'fanqie' | 'qidian';
};

type ChapterLike = {
  chapterNumber: number;
  title: string;
  summary?: string;
  content: string;
  outline?: { summary?: string };
  updatedAt: string;
};

type TitleGeneratorAgent = NovelAgent;

export function resolveTitleRewriteThreshold(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : undefined;
}

export function buildChapterTitleAuditInput(params: {
  novel: NovelLike;
  chapterNumber: number;
  summary?: string;
  outline?: string;
  content?: string;
  recentTitles: string[];
}): {
  genre: string;
  novelTitle: string;
  novelSynopsis: string;
  novelTags?: string[];
  constitutionTags?: string[];
  chapterNumber: number;
  startupPlatformProfile?: 'auto' | 'fanqie' | 'qidian';
  outline: string;
  summary: string;
  fullContent: string;
  recentTitles: string[];
} {
  return {
    genre: params.novel.genre,
    novelTitle: params.novel.title,
    novelSynopsis: params.novel.synopsis,
    novelTags: params.novel.tags,
    constitutionTags: params.novel.constitutionTags,
    chapterNumber: params.chapterNumber,
    startupPlatformProfile: params.novel.startupPlatformProfile,
    outline: params.outline || params.summary || '',
    summary: params.summary || '',
    fullContent: params.content || '',
    recentTitles: params.recentTitles,
  };
}

export function resolveChapterTitleGenerationOutcome(params: {
  currentTitle?: string;
  generatedTitle: string;
  auditInput: Parameters<typeof shouldAdoptGeneratedChapterTitle>[0]['auditInput'];
  adoptionMode?: 'auto' | 'manual';
}): {
  adopted: boolean;
  forced: boolean;
  title: string;
  message: string;
  decision: ReturnType<typeof shouldAdoptGeneratedChapterTitle>;
} {
  const currentTitle = params.currentTitle?.trim() ?? '';
  const generatedTitle = params.generatedTitle.trim();
  const decision = shouldAdoptGeneratedChapterTitle({
    currentTitle,
    generatedTitle,
    auditInput: params.auditInput,
  });
  const forced = params.adoptionMode === 'manual'
    && generatedTitle.length > 0
    && generatedTitle !== currentTitle;
  const adopted = decision.accept || forced;

  return {
    adopted,
    forced,
    title: adopted ? generatedTitle : currentTitle,
    message: adopted ? '标题已更新' : '生成标题未达到替换门槛，保留原标题',
    decision,
  };
}

export async function generateAndAdoptChapterTitle(params: {
  deps: ChapterTitleDeps;
  novelId: string;
  chapterNumber: number;
  adoptionMode?: 'auto' | 'manual';
}): Promise<{
  chapterNumber: number;
  title: string;
  adopted: boolean;
  candidateTitle: string;
  candidateScore: number;
  message: string;
  reasons: string[];
}> {
  const { agents, modelClient, novelManager } = params.deps;
  if (!agents || !modelClient) {
    throw new Error('AI 模型未配置，无法生成标题');
  }

  const titleAgent = agents.get('title-generator') as TitleGeneratorAgent | undefined;
  if (!titleAgent) {
    throw new Error('标题生成 Agent 未就绪');
  }

  const novel = await novelManager.getNovel(params.novelId);
  const chapter = await novelManager.getChapter(params.novelId, params.chapterNumber);
  if (!chapter) {
    throw new Error(`章节 ${params.chapterNumber} 不存在`);
  }
  const prevChapter = params.chapterNumber > 1
    ? await novelManager.getChapter(params.novelId, params.chapterNumber - 1)
    : null;
  const recentTitles = await getRecentChapterTitles(novelManager, params.novelId, chapter.chapterNumber);
  const auditInput = buildChapterTitleAuditInput({
    novel,
    chapterNumber: chapter.chapterNumber,
    outline: chapter.outline?.summary,
    summary: chapter.summary,
    content: chapter.content,
    recentTitles,
  });

  // 从大纲中读取 keyEvents
  let titleKeyEvents: string[] | undefined;
  try {
    const outlineData = await novelManager.getOutline(params.novelId);
    const chapterOutline = outlineData?.chapters?.find(
      (ch: { chapterNumber: number }) => ch.chapterNumber === params.chapterNumber
    );
    titleKeyEvents = chapterOutline?.keyEvents?.length
      ? chapterOutline.keyEvents
      : undefined;
  } catch { /* outline 不可用时保持 undefined */ }

  const generatedTitle = await generateTitleWithRetry({
    titleAgent,
    novelId: params.novelId,
    novelTitle: novel.title,
    novelSynopsis: novel.synopsis,
    genre: novel.genre,
    chapterNumber: chapter.chapterNumber,
    previousTitle: prevChapter?.title || '',
    recentTitles,
    fullContent: chapter.content || '',
    modelClient,
  });
  if (!generatedTitle) {
    throw new Error('AI 未能生成有效标题');
  }

  const outcome = resolveChapterTitleGenerationOutcome({
    currentTitle: chapter.title,
    generatedTitle,
    auditInput,
    adoptionMode: params.adoptionMode,
  });
  const { decision } = outcome;

  if (outcome.adopted) {
    const updatedAt = new Date().toISOString();
    chapter.title = generatedTitle;
    chapter.diagnostics = mergeChapterDiagnostics(chapter.diagnostics, {
      titleTrace: buildTitleTrace({
        candidateTitle: generatedTitle,
        adopted: true,
        currentScore: decision.currentScore,
        generatedScore: decision.generatedScore,
        reasons: decision.reasons,
        fullContent: chapter.content || '',
        recentTitles,
        provider: modelClient.provider,
        model: modelClient.model,
        updatedAt,
      }),
    }, updatedAt);
    chapter.updatedAt = updatedAt;
    await novelManager.saveChapter(params.novelId, chapter);
    await novelManager.syncNovelMetadataDebounced(params.novelId);
  }

  return {
    chapterNumber: params.chapterNumber,
    title: outcome.title,
    adopted: outcome.adopted,
    candidateTitle: generatedTitle,
    candidateScore: decision.generatedScore,
    message: outcome.message,
    reasons: decision.reasons,
  };
}

export async function collectBackfillTitleTargets(params: {
  novelManager: NovelManager;
  novelId: string;
  novel: NovelLike;
  chapterList: ChapterSummaryLike[];
  force: boolean;
  fromChapter?: number;
  toChapter?: number;
  rewriteBelowScore?: number;
}): Promise<Array<{
  chapterNumber: number;
  reason: 'missing-or-placeholder' | 'forced' | 'low-score';
  score: number | null;
  issues: string[];
}>> {
  const { chapterList, force, fromChapter, novel, novelId, novelManager, rewriteBelowScore, toChapter } = params;
  const rangedChapters = chapterList.filter(chapter => {
    if (fromChapter && chapter.chapterNumber < fromChapter) return false;
    if (toChapter && chapter.chapterNumber > toChapter) return false;
    return true;
  });

  const auditedChapters = await Promise.all(
    rangedChapters.map(async chapterSummary => {
      const trimmedTitle = chapterSummary.title.trim();
      if (force || !trimmedTitle || isPlaceholderChapterTitle(trimmedTitle)) {
        return {
          chapterNumber: chapterSummary.chapterNumber,
          reason: !trimmedTitle || isPlaceholderChapterTitle(trimmedTitle) ? 'missing-or-placeholder' as const : 'forced' as const,
          score: null,
          issues: [] as string[],
        };
      }

      if (rewriteBelowScore == null) {
        return null;
      }

      const evaluation = evaluateChapterTitle(trimmedTitle, {
        genre: novel.genre,
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis,
        novelTags: novel.tags,
        constitutionTags: novel.constitutionTags,
        chapterNumber: chapterSummary.chapterNumber,
        startupPlatformProfile: novel.startupPlatformProfile,
        outline: chapterSummary.summary || '',
        summary: chapterSummary.summary || '',
        recentTitles: await getRecentChapterTitles(novelManager, novelId, chapterSummary.chapterNumber),
      });

      if (evaluation.score >= rewriteBelowScore) {
        return null;
      }

      return {
        chapterNumber: chapterSummary.chapterNumber,
        reason: 'low-score' as const,
        score: evaluation.score,
        issues: evaluation.issues,
      };
    }),
  );

  return auditedChapters.filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function backfillChapterTitles(params: {
  deps: ChapterTitleDeps;
  novelId: string;
  novel: NovelLike;
  targetChapterNumbers: number[];
}): Promise<{
  updated: number;
  results: Array<{ chapterNumber: number; title: string; success: boolean }>;
}> {
  const { agents, modelClient, novelManager } = params.deps;
  if (!agents || !modelClient) {
    throw new Error('AI 模型未配置，无法生成标题');
  }

  const titleAgent = agents.get('title-generator') as TitleGeneratorAgent | undefined;
  if (!titleAgent) {
    throw new Error('标题生成 Agent 未就绪');
  }

  logger.info('开始批量补全标题', { chapterCount: params.targetChapterNumbers.length });

  let updated = 0;
  const results: Array<{ chapterNumber: number; title: string; success: boolean }> = [];
  const CONCURRENCY = 3;

  for (let i = 0; i < params.targetChapterNumbers.length; i += CONCURRENCY) {
    const batch = params.targetChapterNumbers.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (chapterNumber, batchIndex) => {
        try {
          const chapter = await novelManager.getChapter(params.novelId, chapterNumber);
          if (!chapter) {
            return { chapterNumber, title: '', success: false };
          }

          const previousChapterNumber = i + batchIndex > 0
            ? params.targetChapterNumbers[i + batchIndex - 1]
            : chapterNumber - 1;
          const previousChapter = previousChapterNumber > 0
            ? await novelManager.getChapter(params.novelId, previousChapterNumber)
            : null;
          const recentTitles = await getRecentChapterTitles(novelManager, params.novelId, chapter.chapterNumber);
          const auditInput = buildChapterTitleAuditInput({
            novel: params.novel,
            chapterNumber: chapter.chapterNumber,
            outline: chapter.outline?.summary,
            summary: chapter.summary,
            content: chapter.content,
            recentTitles,
          });

          const generatedTitle = await generateTitleWithRetry({
            titleAgent,
            novelId: params.novelId,
            novelTitle: params.novel.title,
            novelSynopsis: params.novel.synopsis,
            genre: params.novel.genre,
            chapterNumber: chapter.chapterNumber,
            previousTitle: previousChapter?.title || '',
            recentTitles,
            fullContent: chapter.content || '',
            modelClient,
          });
          logger.debug('章节标题生成', { chapterNumber: chapter.chapterNumber, title: generatedTitle });

          if (!generatedTitle) {
            return { chapterNumber: chapter.chapterNumber, title: '', success: false };
          }

          const decision = shouldAdoptGeneratedChapterTitle({
            currentTitle: chapter.title,
            generatedTitle,
            auditInput,
          });

          if (!decision.accept) {
            logger.debug('章节标题未替换', { chapterNumber: chapter.chapterNumber, reasons: decision.reasons });
            return { chapterNumber: chapter.chapterNumber, title: chapter.title, success: false };
          }

          chapter.title = generatedTitle;
          const updatedAt = new Date().toISOString();
          chapter.diagnostics = mergeChapterDiagnostics(chapter.diagnostics, {
            titleTrace: buildTitleTrace({
              candidateTitle: generatedTitle,
              adopted: true,
              currentScore: decision.currentScore,
              generatedScore: decision.generatedScore,
              reasons: decision.reasons,
              fullContent: chapter.content || '',
              recentTitles,
              provider: modelClient.provider,
              model: modelClient.model,
              updatedAt,
            }),
          }, updatedAt);
          chapter.updatedAt = updatedAt;
          await novelManager.saveChapter(params.novelId, chapter);
          return { chapterNumber: chapter.chapterNumber, title: generatedTitle, success: true };
        } catch (err) {
          console.warn(`[批量补全标题] 第 ${chapterNumber} 章失败:`, err instanceof Error ? err.message : err);
          return { chapterNumber, title: '', success: false };
        }
      }),
    );

    results.push(...batchResults);
    updated += batchResults.filter(item => item.success).length;
  }

  await novelManager.syncNovelMetadataByChapters(params.novelId);
  return { updated, results };
}

export function buildBackfillEmptyResponse(params: {
  rewriteBelowScore?: number;
}): {
  updated: number;
  message: string;
  threshold: number;
} {
  return {
    updated: 0,
    message: params.rewriteBelowScore == null
      ? '所有章节已有标题'
      : `没有标题低于阈值 ${params.rewriteBelowScore} 的章节`,
    threshold: params.rewriteBelowScore ?? DEFAULT_TITLE_REWRITE_SCORE,
  };
}
