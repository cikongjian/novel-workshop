import type { Router } from 'express';
import type { AgentOutput } from '../../../agents/types.js';
import { ResizeChapterBody } from './types.js';
import type { GenerateDeps } from './types.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import {
  buildResizeOperationContext,
  finalizeResizeSuccess,
  rollbackResizeFreeze,
  runAgentResizeWorkflow,
  runFallbackResizeWorkflow,
  validateResizeTarget,
} from './chapter-resize-support.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';

export function registerResizeChapterRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager, revisionPipeline, modelClient, broadcast, agents, billingService, authDb } = deps;

  router.post('/resize-chapter', async (req, res) => {
    let resizeFreezeId: string | undefined;
    try {
      const parsed = ResizeChapterBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const { novelId, chapterNumber, targetWordCount, mode, preserveNotes } = parsed.data;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const resizeModelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (resizeModelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: resizeModelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }
      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter || !chapter.content.trim()) {
        res.status(404).json({ error: `第 ${chapterNumber} 章不存在或内容为空` });
        return;
      }
      const resizeTargetError = validateResizeTarget({
        mode,
        currentWordCount: chapter.content.length,
        targetWordCount,
      });
      if (resizeTargetError) {
        res.status(400).json({ error: resizeTargetError });
        return;
      }
      const [outlineData, characters, worldEntries] = await Promise.all([
        novelManager.getOutline(novelId),
        novelManager.getCharacters(novelId),
        novelManager.getWorldEntries(novelId),
      ]);
      const {
        currentWordCount,
        modeLabel,
        resizeFeedback,
        originalContext,
      } = buildResizeOperationContext({
        novel,
        chapter,
        chapterNumber,
        targetWordCount,
        mode,
        preserveNotes,
        outlineData,
        characters,
        worldEntries,
      });

      const resizeBillingUserId = req.auth?.id;
      const resizeBypassBilling = resizeModelAccess.billingBypass;
      if (!resizeBypassBilling && billingService && resizeBillingUserId && resizeBillingUserId !== 'dev') {
        const resizeRuleCode = await billingService.getOperationRuleCode('resizeChapter');
        const estimate = await billingService.estimate({ ruleCode: resizeRuleCode, charCount: targetWordCount });
        const account = await billingService.getAccount(resizeBillingUserId);
        if (account.balancePoints < estimate.estimatedPoints) {
          res.status(402).json({
            error: '积分不足，请先充值',
            code: 'INSUFFICIENT_BALANCE',
            required: estimate.estimatedPoints,
            balance: account.balancePoints,
          });
          return;
        }
        resizeFreezeId = await billingService.freezePoints(
          resizeBillingUserId,
          estimate.estimatedPoints,
          'gen.resize',
          `${novelId}:${chapterNumber}`,
        );
      }

      let finalContent: string;
      let allOutputs: AgentOutput[] = [];
      const activeResizeClient = resizeModelAccess.client ?? modelClient;
      const resizerAgent = agents?.get('resizer');

      if (resizerAgent && activeResizeClient) {
        const result = await runAgentResizeWorkflow({
          broadcast,
          novelId,
          chapterNumber,
          originalContext,
          chapterContent: chapter.content,
          resizeFeedback,
          modeLabel,
          preserveNotes,
          client: activeResizeClient,
          resizerAgent,
          editorAgent: agents?.get('editor'),
        });
        finalContent = result.finalContent;
        allOutputs = result.agentOutputs;
      } else {
        const result = await runFallbackResizeWorkflow({
          deps: {
            broadcast,
            revisionPipeline,
          },
          novelId,
          chapterNumber,
          originalContext,
          chapterContent: chapter.content,
          resizeFeedback,
          modeLabel,
          targetWordCount,
          modelOverride: resizeModelAccess.client,
        });
        finalContent = result.finalContent;
        allOutputs = result.agentOutputs;
      }

      const responsePayload = await finalizeResizeSuccess({
        deps,
        novelId,
        chapterNumber,
        chapter,
        finalContent,
        agentOutputs: allOutputs,
        mode,
        currentWordCount,
        modelAccessSource: resizeModelAccess.source,
        billingBypassed: resizeBypassBilling,
        freezeId: resizeFreezeId,
        billingUserId: resizeBillingUserId,
      });
      res.json(responsePayload);
    } catch (err) {
      await rollbackResizeFreeze({
        deps,
        freezeId: resizeFreezeId,
        billingUserId: req.auth?.id,
      });
      console.error('[缩写/扩写章节] 失败:', err);
      const message = safeErrorMessage(err, '缩写/扩写失败');
      res.status(500).json({ error: message });
    }
  });
}
