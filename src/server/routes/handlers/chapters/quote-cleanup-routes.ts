import type { Router } from 'express';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  CleanQuoteUsageBody,
  type ChapterQuoteDeps,
  executeQuoteCleanup,
} from './quote-route-support.js';

export function registerQuoteCleanupRoutes(router: Router, deps: ChapterQuoteDeps): void {
  router.post('/clean-quote-usage-preview', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsed = CleanQuoteUsageBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }

      const result = await executeQuoteCleanup({
        deps,
        novelId,
        body: parsed.data,
        apply: false,
      });
      res.json(result);
    } catch (err) {
      const message = safeErrorMessage(err, '清洗预览失败');
      res.status(500).json({ error: message });
    }
  });

  router.post('/apply-clean-quote-usage', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsed = CleanQuoteUsageBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }

      const result = await executeQuoteCleanup({
        deps,
        novelId,
        body: parsed.data,
        apply: true,
      });
      if (parsed.data.rejectedQuoteTexts && parsed.data.rejectedQuoteTexts.length > 0) {
        await deps.novelManager.addIgnoredQuoteTexts(novelId, parsed.data.rejectedQuoteTexts);
      }
      res.json(result);
    } catch (err) {
      const message = safeErrorMessage(err, '应用清洗失败');
      res.status(500).json({ error: message });
    }
  });
}
