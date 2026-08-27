import { z } from 'zod';
import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { BatchDigestBody } from './types.js';
import {
  runBatchDigestWorkflow,
  syncOutlineSummaries,
} from './digest-support.js';

export function registerDigestRoutes(router: Router, deps: GenerateDeps): void {
    // === 批量生成章节摘要（为已有章节补充 digest）===
    router.post('/batch-digest', async (req, res) => {
        const parsed = BatchDigestBody.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
            return;
        }

        const { novelId, chapterNumbers: requestedChapters, force } = parsed.data;
        try {
            const result = await runBatchDigestWorkflow({
                deps,
                novelId,
                requestedChapters,
                force,
            });
            res.json(result);
        } catch (err: unknown) {
            const message = safeErrorMessage(err, '内部错误');
            const status = message.includes('未就绪') ? 503 : message.includes('小说不存在') ? 404 : 500;
            res.status(status).json({ error: '批量摘要生成失败', detail: message });
        }
    });

    // === 批量同步大纲（轻量，不调 LLM）：将已有 chapter.summary 回写到大纲条目 ===
    router.post('/sync-outline', async (req, res) => {
        const parsed = z.object({ novelId: z.string().uuid() }).safeParse(req.body);
        if (!parsed.success) { res.status(400).json({ error: '参数错误' }); return; }

        const { novelId } = parsed.data;
        try {
            const result = await syncOutlineSummaries({
                deps,
                novelId,
            });
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: safeErrorMessage(err, '同步失败') });
        }
    });

    // === 批量弧线摘要 ===
    router.post('/batch-arc-summary', async (req, res) => {
        void req;
        res.status(410).json({
            error: 'This batch arc summary endpoint has been deprecated. Use "nw generate batch-arc-summary" instead.',
            code: 'BATCH_ARC_SUMMARY_DEPRECATED',
        });
    });
}
