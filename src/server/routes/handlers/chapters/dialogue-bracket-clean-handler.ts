import type { Router } from 'express';
import { z } from 'zod';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { ModelClient } from '../../../../models/types.js';
import type { AuthDb } from '../../../../auth/types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import {
  buildDialogueBracketCleanupSummary,
  cleanDialogueBracketTags,
  rewriteDialogueBracketTagsWithAI,
  type DialogueBracketTransformMode,
  type DialogueBracketCleanupResult,
} from './dialogue-bracket-cleaner.js';

const CleanDialogueBracketBody = z.object({
  fromChapter: z.number().int().positive().optional(),
  toChapter: z.number().int().positive().optional(),
  chapterNumbers: z.array(z.number().int().positive()).max(300).optional(),
  selectedEdits: z.array(
    z.object({
      chapterNumber: z.number().int().positive(),
      editIds: z.array(z.string().min(1)).max(4000),
    }),
  ).max(300).optional(),
  maxPreview: z.number().int().positive().max(200).default(80),
  transformMode: z.enum(['clean', 'rewrite', 'ai-rewrite']).default('clean'),
}).superRefine((value, ctx) => {
  if (
    value.fromChapter !== undefined
    && value.toChapter !== undefined
    && value.fromChapter > value.toChapter
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fromChapter 不能大于 toChapter',
      path: ['fromChapter'],
    });
  }
});

export interface ChapterDialogueBracketCleanupDeps {
  novelManager: NovelManager;
  modelClient?: ModelClient;
  authDb?: AuthDb;
}

export function registerDialogueBracketCleanupRoutes(router: Router, deps: ChapterDialogueBracketCleanupDeps): void {
  const { novelManager, modelClient, authDb } = deps;

  const executeDialogueBracketCleanup = async (
    novelId: string,
    body: z.infer<typeof CleanDialogueBracketBody>,
    apply: boolean,
    requestContext: {
      userId?: string;
      headers: Record<string, string | string[] | undefined>;
    },
  ) => {
    const transformMode: DialogueBracketTransformMode = body.transformMode ?? 'clean';
    const novel = await novelManager.getNovel(novelId);
    const modelAccess = novel
      ? await resolveUserModelAccess({
          authDb,
          userId: requestContext.userId,
          headers: requestContext.headers,
          novel,
        })
      : { client: modelClient, error: undefined };
    if (modelAccess.error && novel?.modelConfig?.source === 'user-profile') {
      throw new Error(modelAccess.error);
    }
    const activeModel = modelAccess.client ?? modelClient;
    if (transformMode === 'ai-rewrite' && !activeModel) {
      throw new Error('AI 模型未配置，无法执行 AI 改写');
    }
    const chapterMetas = await novelManager.listChapters(novelId);
    const targetNumbers = resolveCleanupTargets(chapterMetas.map(meta => meta.chapterNumber), body);
    const selectedEditMap = buildSelectedEditMap(body.selectedEdits);

    let totalScanned = 0;
    let totalReplacements = 0;
    const changes: Array<{
      chapterNumber: number;
      title: string;
      replacements: number;
      beforeSample: string;
      afterSample: string;
      examples: DialogueBracketCleanupResult['examples'];
    }> = [];

    const READ_BATCH = 50;
    type CandidateChapter = {
      chapterNumber: number;
      title: string;
      cleaned: DialogueBracketCleanupResult;
      originalChapter: NonNullable<Awaited<ReturnType<typeof novelManager.getChapter>>>;
    };
    const candidateChapters: CandidateChapter[] = [];
    const aiCache = transformMode === 'ai-rewrite' ? new Map<string, string>() : undefined;

    for (let i = 0; i < targetNumbers.length; i += READ_BATCH) {
      const batch = targetNumbers.slice(i, i + READ_BATCH);
      const results = await Promise.all(batch.map(num => novelManager.getChapter(novelId, num)));
      for (const chapter of results) {
        if (!chapter || !chapter.content.trim()) continue;
        totalScanned += 1;

        const selectedIds = apply ? selectedEditMap.get(chapter.chapterNumber) : undefined;
        // 预览阶段：只用规则匹配（快速），AI 改写仅在应用阶段执行
        const useAI = transformMode === 'ai-rewrite' && activeModel && apply;
        const cleaned = useAI
          ? await rewriteDialogueBracketTagsWithAI(chapter.content, activeModel, selectedIds, apply, aiCache)
          : cleanDialogueBracketTags(
            chapter.content,
            selectedIds,
            apply,
            transformMode === 'ai-rewrite' ? 'rewrite' : transformMode,
          );
        if (cleaned.replacements <= 0 || cleaned.content === chapter.content) continue;

        candidateChapters.push({
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          cleaned,
          originalChapter: chapter,
        });
      }
    }

    for (const item of candidateChapters) {
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

    const maxPreview = body.maxPreview ?? 80;
    const previewItems = changes.slice(0, maxPreview);

    return {
      novelId,
      applied: apply,
      targetCount: targetNumbers.length,
      totalScanned,
      affectedChapters: changes.length,
      totalReplacements,
      truncated: changes.length > previewItems.length,
      summary: buildDialogueBracketCleanupSummary({
        applied: apply,
        totalScanned,
        affected: changes.length,
        replacements: totalReplacements,
        mode: transformMode,
      }),
      transformMode,
      items: previewItems,
    };
  };

  router.post('/clean-dialogue-bracket-preview', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsed = CleanDialogueBracketBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }

      const result = await executeDialogueBracketCleanup(novelId, parsed.data, false, {
        userId: req.auth?.id,
        headers: req.headers,
      });
      res.json(result);
    } catch (err) {
      const message = safeErrorMessage(err, '清洗预览失败');
      const statusCode = message.includes('AI 模型未配置') ? 503 : 500;
      res.status(statusCode).json({ error: message });
    }
  });

  router.post('/apply-clean-dialogue-bracket', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsed = CleanDialogueBracketBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }
      if (!parsed.data.selectedEdits || parsed.data.selectedEdits.length === 0) {
        res.status(400).json({ error: '必须先预览并提交已确认的 selectedEdits，才可应用清洗' });
        return;
      }

      const result = await executeDialogueBracketCleanup(novelId, parsed.data, true, {
        userId: req.auth?.id,
        headers: req.headers,
      });
      res.json(result);
    } catch (err) {
      const message = safeErrorMessage(err, '应用清洗失败');
      const statusCode = message.includes('AI 模型未配置') ? 503 : 500;
      res.status(statusCode).json({ error: message });
    }
  });
}

function resolveCleanupTargets(
  chapterNumbers: number[],
  body: z.infer<typeof CleanDialogueBracketBody>,
): number[] {
  const sortedAll = [...chapterNumbers].sort((a, b) => a - b);
  const existingSet = new Set(sortedAll);

  let targets: number[];
  if (body.chapterNumbers && body.chapterNumbers.length > 0) {
    targets = Array.from(new Set(body.chapterNumbers)).sort((a, b) => a - b);
  } else {
    targets = sortedAll;
    if (body.fromChapter !== undefined) {
      targets = targets.filter(num => num >= body.fromChapter!);
    }
    if (body.toChapter !== undefined) {
      targets = targets.filter(num => num <= body.toChapter!);
    }
  }

  return targets.filter(num => existingSet.has(num));
}

function buildSelectedEditMap(
  selectedEdits?: Array<{ chapterNumber: number; editIds: string[] }>,
): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  if (!selectedEdits || selectedEdits.length === 0) return map;
  for (const item of selectedEdits) {
    if (item.chapterNumber > 0 && item.editIds?.length > 0) {
      map.set(item.chapterNumber, new Set(item.editIds));
    }
  }
  return map;
}
