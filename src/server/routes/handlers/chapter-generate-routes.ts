import type { Router } from 'express';
import { GenerateChapterBody } from './types.js';
import type { GenerateDeps } from './types.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import { rollbackChapterGenerationFreeze } from './chapter-generate-support.js';
import {
  buildChapterGenerationAcceptedResponse,
  isChapterGenerationTaskActive,
  startChapterGenerationTask,
} from './chapter-generate-background.js';

export function registerGenerateChapterRoutes(router: Router, deps: GenerateDeps): void {
  const {
    novelManager,
    modelClient,
    billingService,
    authDb,
  } = deps;

  router.post('/chapter', async (req, res) => {
    let reqNovelId = '';
    let reqChapterNumber = 0;
    let freezeId: string | undefined;

    try {
      const parsed = GenerateChapterBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const {
        novelId,
        chapterNumber,
        userDirection: rawUserDirection,
        maxWordCount: rawMaxWordCount,
        stylePreset,
        styleNotes: rawStyleNotes,
        startupPlatformProfile,
      } = parsed.data;
      reqNovelId = novelId;
      reqChapterNumber = chapterNumber;
      let novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const modelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }
      const bypassBilling = modelAccess.billingBypass;
      const modelOverride = modelAccess.client;
      const activeModelClient = modelAccess.client ?? modelClient;
      if (!activeModelClient) {
        res.status(503).json({
          error: 'AI 功能尚未就绪：缺少可用模型配置',
          code: 'MODEL_UNAVAILABLE',
        });
        return;
      }
      if (isChapterGenerationTaskActive(novelId, chapterNumber)) {
        res.status(202).json(buildChapterGenerationAcceptedResponse({ novelId, chapterNumber }));
        return;
      }
      let trialMode = false;

      const billingUserId = req.auth?.id;
      if (!bypassBilling && billingService && billingUserId && billingUserId !== 'dev') {
        const estimatedChars = rawMaxWordCount ?? 3000;
        // 检查试用额度，失败时安全降级为积分计费
        let trialQuotaRemaining = 0;
        let trialQuotaTotal = 0;
        try {
          const trialQuota = await billingService.checkTrialQuota(billingUserId);
          trialQuotaRemaining = trialQuota.remaining;
          trialQuotaTotal = trialQuota.total;
        } catch (trialCheckErr) {
          // 试用检查失败不影响主流程，降级为积分模式
          console.warn('[chapter-generate] 试用额度检查失败，降级为积分模式:', trialCheckErr instanceof Error ? trialCheckErr.message : String(trialCheckErr));
        }
        if (trialQuotaRemaining >= estimatedChars && trialQuotaTotal > 0) {
          trialMode = true;
        } else {
          const trialCheck = await billingService.checkFreeTrialQuota(billingUserId, estimatedChars);
          if (!trialCheck.allowed) {
            res.status(403).json({ error: trialCheck.reason, code: 'FREE_TRIAL_EXCEEDED' });
            return;
          }
          const generationRuleCode = await billingService.getOperationRuleCode('generateChapter');
          const estimate = await billingService.estimate({ ruleCode: generationRuleCode, charCount: estimatedChars });
          const account = await billingService.getAccount(billingUserId);
          if (account.balancePoints < estimate.estimatedPoints) {
            res.status(402).json({
              error: '积分不足，请先充值',
              code: 'INSUFFICIENT_BALANCE',
              required: estimate.estimatedPoints,
              balance: account.balancePoints,
            });
            return;
          }
          freezeId = await billingService.freezePoints(
            billingUserId,
            estimate.estimatedPoints,
            'gen.chapter',
            `${novelId}:${chapterNumber}`,
          );
        }
      }

      const started = startChapterGenerationTask({
        deps,
        novel,
        novelId,
        chapterNumber,
        rawUserDirection,
        rawMaxWordCount,
        stylePreset,
        rawStyleNotes,
        startupPlatformProfile,
        modelOverride,
        backgroundModelClient: activeModelClient,
        modelAccessSource: modelAccess.source,
        billingBypassed: bypassBilling,
        trialMode,
        freezeId,
        billingUserId,
      });
      if (!started) {
        await rollbackChapterGenerationFreeze({
          deps,
          freezeId,
          billingUserId,
          novelId,
        });
        freezeId = undefined;
      }
      res.status(202).json(buildChapterGenerationAcceptedResponse({ novelId, chapterNumber }));
      freezeId = undefined;
    } catch (err) {
      await rollbackChapterGenerationFreeze({
        deps,
        freezeId,
        billingUserId: req.auth?.id,
        novelId: reqNovelId,
      });
      console.error(`[chapter-generate] failed novel=${reqNovelId || 'unknown'} chapter=${reqChapterNumber || 'unknown'}`, err);
      res.status(500).json({
        error: err instanceof Error ? err.message : '章节生成任务提交失败',
        code: 'CHAPTER_GENERATION_SUBMIT_FAILED',
        retryable: true,
      });
    }
  });
}
