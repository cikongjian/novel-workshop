import type { Router } from 'express';
import { ShortStoryOutlineAgent, ShortStoryWriterAgent, ShortStoryEditorAgent } from '../../../../agents/short-story-agents.js';
import { ShortStoryPipeline } from '../../../../pipeline/short-story-pipeline.js';
import type { ShortStoryBlueprint } from '../../../../novel/short-story-types.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  BatchGenerateShortStorySchema,
  CreateShortStorySchema,
  GenerateShortChapterSchema,
  beginShortStoryBilling,
  buildNoopMemory,
  calculateTargetWordCount,
  getCurrentUserId,
  isBillingEnabledUser,
  logger,
  normalizeBlueprint,
  resolveBlueprintPayload,
  resolveShortStoryContext,
  settleShortStoryBilling,
  type ShortStoryBillingSession,
  type ShortStoryRouterDeps,
  loadAccessibleShortStoryNovel,
} from './route-support.js';

function createShortStoryPipeline(
  novelId: string,
  novelManager: NovelManager,
  modelClient: ModelClient,
  blueprint: ShortStoryBlueprint,
) {
  const outlineAgent = new ShortStoryOutlineAgent();
  const writerAgent = new ShortStoryWriterAgent();
  const editorAgent = new ShortStoryEditorAgent();

  return new ShortStoryPipeline(
    novelId,
    novelManager,
    buildNoopMemory(),
    modelClient,
    (event) => {
      logger.debug(`短篇事件: ${event.type}`, {
        novelId: event.novelId,
        chapterNumber: event.chapterNumber,
      });
    },
    blueprint,
    {
      outline: outlineAgent,
      writer: writerAgent,
      editor: editorAgent,
    },
  );
}

export function registerShortStoryGenerationRoutes(
  router: Router,
  deps: ShortStoryRouterDeps,
): void {
  router.post('/create', async (req, res) => {
    try {
      const body = CreateShortStorySchema.parse(req.body);
      const userId = getCurrentUserId(req);

      logger.info(`用户 ${userId} 创建短篇小说: ${body.title}`);

      const blueprint = resolveBlueprintPayload(body);
      const createdNovel = await deps.novelManager.createNovel({
        title: body.title,
        genre: 'custom',
        synopsis: `${blueprint.protagonist.startState} → ${blueprint.protagonist.endState}`,
        description: `${body.template} 风格短篇爽文，${body.targetWordCount}字，${body.targetChapters}章`,
        ownerId: userId,
      });

      const updatedNovel = await deps.novelManager.updateNovel(createdNovel.id, {
        shortStoryBlueprint: blueprint,
        targetChapters: blueprint.targetChapters,
      });

      logger.info(`短篇小说创建成功: ${updatedNovel.id}`);

      res.json({
        success: true,
        novelId: updatedNovel.id,
        blueprint: updatedNovel.shortStoryBlueprint ?? blueprint,
      });
    } catch (error) {
      logger.error('创建短篇小说失败', {
        reason: error instanceof Error ? error.message : String(error),
      });
      res.status(error instanceof Error && error.message.includes('customConfig') ? 400 : 500).json({
        error: safeErrorMessage(error, '创建失败'),
      });
    }
  });

  router.post('/generate-chapter', async (req, res) => {
    let billingSession: ShortStoryBillingSession | null = null;
    let actualChars = 0;
    try {
      const body = GenerateShortChapterSchema.parse(req.body);
      const userId = getCurrentUserId(req);

      logger.info(`用户 ${userId} 生成短篇第 ${body.chapterNumber} 章`);

      const novel = await loadAccessibleShortStoryNovel(req, res, deps, body.novelId);
      if (!novel) return;
      if (!novel.shortStoryBlueprint) {
        res.status(400).json({ error: '该小说不是短篇模式' });
        return;
      }

      const blueprint = normalizeBlueprint(novel.shortStoryBlueprint);
      const generationContext = await resolveShortStoryContext(req, novel, deps);
      const estimatedChars = calculateTargetWordCount(blueprint);
      const billing = await beginShortStoryBilling(
        req,
        res,
        deps.billingService,
        generationContext.billingBypass,
        estimatedChars,
        `${body.novelId}:${body.chapterNumber}:short-story`,
      );
      if (billing.blocked) return;
      billingSession = billing.session;

      const pipeline = createShortStoryPipeline(
        body.novelId,
        deps.novelManager,
        generationContext.modelClient,
        blueprint,
      );

      const result = await pipeline.generateChapter(body.chapterNumber, body.direction);
      actualChars = result.chapterContent.length;
      await settleShortStoryBilling(deps.billingService, billingSession, actualChars);

      if (deps.referralService && isBillingEnabledUser(userId)) {
        void deps.referralService.onUserActivityCompleted(userId);
      }

      logger.info(`短篇第 ${body.chapterNumber} 章生成完成`);

      res.json({
        success: true,
        result,
        billingBypassed: generationContext.billingBypass,
      });
    } catch (error) {
      try {
        await settleShortStoryBilling(deps.billingService, billingSession, actualChars);
      } catch (billingError) {
        logger.warn('短篇单章计费结算失败', {
          reason: billingError instanceof Error ? billingError.message : String(billingError),
          actualChars,
        });
      }

      logger.error('生成短篇章节失败', {
        reason: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: safeErrorMessage(error, '生成失败'),
      });
    }
  });

  router.post('/batch-generate', async (req, res) => {
    let billingSession: ShortStoryBillingSession | null = null;
    let actualChars = 0;
    try {
      const body = BatchGenerateShortStorySchema.parse(req.body);
      const userId = getCurrentUserId(req);

      logger.info(`用户 ${userId} 批量生成短篇小说: ${body.novelId}`);

      const novel = await loadAccessibleShortStoryNovel(req, res, deps, body.novelId);
      if (!novel) return;
      if (!novel.shortStoryBlueprint) {
        res.status(400).json({ error: '该小说不是短篇模式' });
        return;
      }

      const blueprint = normalizeBlueprint(novel.shortStoryBlueprint);
      const endChapter = body.endChapter || blueprint.targetChapters;
      const generationContext = await resolveShortStoryContext(req, novel, deps);
      const estimatedChars = calculateTargetWordCount(blueprint) * Math.max(0, endChapter - body.startChapter + 1);
      const billing = await beginShortStoryBilling(
        req,
        res,
        deps.billingService,
        generationContext.billingBypass,
        estimatedChars,
        `${body.novelId}:${body.startChapter}-${endChapter}:short-story-batch`,
      );
      if (billing.blocked) return;
      billingSession = billing.session;

      const pipeline = createShortStoryPipeline(
        body.novelId,
        deps.novelManager,
        generationContext.modelClient,
        blueprint,
      );

      const results = [];
      for (let i = body.startChapter; i <= endChapter; i++) {
        logger.info(`生成第 ${i}/${endChapter} 章...`);
        const result = await pipeline.generateChapter(i);
        actualChars += result.chapterContent.length;
        results.push({
          chapterNumber: i,
          success: true,
          wordCount: result.chapterContent.length,
          score: result.readerFeedback,
        });
      }

      await settleShortStoryBilling(deps.billingService, billingSession, actualChars);

      if (deps.referralService && isBillingEnabledUser(userId)) {
        void deps.referralService.onUserActivityCompleted(userId);
      }

      logger.info(`短篇小说批量生成完成，共 ${results.length} 章`);

      res.json({
        success: true,
        totalChapters: results.length,
        results,
        billingBypassed: generationContext.billingBypass,
      });
    } catch (error) {
      try {
        await settleShortStoryBilling(deps.billingService, billingSession, actualChars);
      } catch (billingError) {
        logger.warn('短篇批量计费结算失败', {
          reason: billingError instanceof Error ? billingError.message : String(billingError),
          actualChars,
        });
      }

      logger.error('批量生成短篇失败', {
        reason: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: safeErrorMessage(error, '生成失败'),
      });
    }
  });
}
