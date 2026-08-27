import type { Router } from 'express';
import { ReviseChapterBody } from './types.js';
import type { GenerateDeps } from './types.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import {
  buildRevisionOriginalContext,
  buildRevisionQualityDeltaPayload,
  createRevisionQualityEvaluator,
  finalizeRevisionSuccess,
  rollbackRevisionFreeze,
  runRevisionWithAutoBoost,
} from './chapter-revise-support.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';

export function registerReviseChapterRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager, billingService, authDb } = deps;

  router.post('/revise', async (req, res) => {
    let reviseFreezeId: string | undefined;
    try {
      const parsed = ReviseChapterBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const { novelId, chapterNumber, feedback, enableAiMarkerGuard, aiMarkerGuardThreshold, mode } = parsed.data;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const revisionModelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (revisionModelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: revisionModelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }
      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: `第 ${chapterNumber} 章不存在` });
        return;
      }
      const [outlineData, characters, worldEntries] = await Promise.all([
        novelManager.getOutline(novelId),
        novelManager.getCharacters(novelId),
        novelManager.getWorldEntries(novelId),
      ]);
      const {
        originalContext,
        scenePlan,
      } = buildRevisionOriginalContext({
        novel: {
          id: novelId,
          genre: novel.genre,
          title: novel.title,
          synopsis: novel.synopsis,
        },
        chapterNumber,
        outlineData,
        characters,
        worldEntries,
      });
      const evaluateRevisionQuality = createRevisionQualityEvaluator({
        genre: novel.genre,
        scenePlan,
      });
      const beforeQuality = evaluateRevisionQuality(chapter.content);

      const reviseBillingUserId = req.auth?.id;
      const reviseBypassBilling = revisionModelAccess.billingBypass;
      if (!reviseBypassBilling && billingService && reviseBillingUserId && reviseBillingUserId !== 'dev') {
        const reviseRuleCode = await billingService.getOperationRuleCode('reviseChapter');
        const estimate = await billingService.estimate({ ruleCode: reviseRuleCode, charCount: chapter.content.length });
        const account = await billingService.getAccount(reviseBillingUserId);
        if (account.balancePoints < estimate.estimatedPoints) {
          res.status(402).json({
            error: '积分不足，请先充值',
            code: 'INSUFFICIENT_BALANCE',
            required: estimate.estimatedPoints,
            balance: account.balancePoints,
          });
          return;
        }
        reviseFreezeId = await billingService.freezePoints(
          reviseBillingUserId,
          estimate.estimatedPoints,
          'gen.revise',
          `${novelId}:${chapterNumber}`,
        );
      }

      const revisionModelOverride = revisionModelAccess.client;
      const {
        finalResult,
        finalContent,
        afterQuality,
        autoBoostAttempted,
        autoBoostApplied,
        revisionCostOutputs,
      } = await runRevisionWithAutoBoost({
        deps,
        novelId,
        chapterNumber,
        feedback,
        chapterContent: chapter.content,
        novelGenre: novel.genre,
        originalContext,
        enableAiMarkerGuard,
        aiMarkerGuardThreshold,
        mode,
        modelOverride: revisionModelOverride,
        beforeQuality,
        scenePlan,
      });
      const qualityDeltaPayload = buildRevisionQualityDeltaPayload({
        beforeQuality,
        afterQuality,
        autoBoostAttempted,
        autoBoostApplied,
      });
      const response = await finalizeRevisionSuccess({
        deps,
        novelId,
        chapterNumber,
        chapter,
        finalResult,
        finalContent,
        revisionCostOutputs,
        autoBoostApplied,
        qualityDeltaPayload,
        modelAccessSource: revisionModelAccess.source,
        billingBypassed: reviseBypassBilling,
        freezeId: reviseFreezeId,
        billingUserId: reviseBillingUserId,
      });
      res.json(response);
    } catch (err) {
      await rollbackRevisionFreeze({
        deps,
        freezeId: reviseFreezeId,
        billingUserId: req.auth?.id,
      });
      console.error('[修订章节] 失败:', err);
      const message = safeErrorMessage(err, '修订章节失败');
      res.status(500).json({ error: message });
    }
  });
}
