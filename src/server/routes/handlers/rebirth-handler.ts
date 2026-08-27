import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { getConfig } from '../../../config/index.js';
import { RebirthBody } from './types.js';
import {
  buildRebirthResponse,
  createRebirthPipeline,
  getRebirthBatchQueue,
  sendRebirthChapterDirectionDeprecated,
  startRebirthAutoGeneration,
} from './rebirth-support.js';

export function registerRebirthRoutes(router: Router, deps: GenerateDeps): void {
    const { novelManager, broadcastJson, agents } = deps;

    // POST /api/generate/rebirth — 整本重生
    router.post('/rebirth', async (req, res) => {
        try {
            // Access batchQueue from batch-handler (exposed on router)
            const batchQueue = getRebirthBatchQueue(router);
            if (!batchQueue) {
                res.status(503).json({ error: '批量任务服务未就绪' });
                return;
            }

            // 检查是否有任何批量任务正在执行
            if (batchQueue.isRunning()) {
                res.status(409).json({
                    error: `已有 ${batchQueue.getRunningJobsCount()} 个批量任务正在执行，请等待完成后再重生`
                });
                return;
            }
            const parsed = RebirthBody.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ error: parsed.error.issues[0].message });
                return;
            }
            const { novelId, userDirection, autoGenerate, autoFinalize: autoFinalizeParam, maxWordCount } = parsed.data;
            // 若前端未显式指定，则以全局配置 autoFinalize.enabled 为准
            const autoFinalize = req.body?.autoFinalize === undefined
                ? getConfig().autoFinalize.enabled
                : autoFinalizeParam;

            const novel = await novelManager.getNovel(novelId);
            if (!novel) {
                res.status(404).json({ error: '原小说不存在' });
                return;
            }

            if (!agents) {
                res.status(503).json({ error: 'AI 模型未配置，无法执行重生' });
                return;
            }

            const rebirthPipeline = createRebirthPipeline(deps);

            // Phase 1: 提取蓝本（同步等待，通常 30-60s）
            broadcastJson?.({ type: 'rebirth', event: 'rebirth:extracting', payload: { novelId } });

            const blueprint = await rebirthPipeline.extractBlueprint({
                novelId,
                userDirection,
                onEvent: (event) => { deps.broadcast(event); },
            });

            // Phase 2: 创建新小说并写入蓝本数据
            const result = await rebirthPipeline.createNovelFromBlueprint({
                blueprint,
                sourceNovelId: novelId,
                genre: novel.genre,
                onEvent: (event) => { deps.broadcast(event); },
            });

            // 立即返回新小说信息
            res.json(buildRebirthResponse({ result, blueprint, autoGenerate }));

            // Phase 3: 自动启动批量生成（后台异步）
            if (autoGenerate && result.totalChapters > 0) {
                startRebirthAutoGeneration({
                    deps,
                    req,
                    sourceNovelId: novelId,
                    sourceNovel: novel,
                    newNovelId: result.newNovelId,
                    totalChapters: result.totalChapters,
                    autoFinalize,
                    userDirection,
                    maxWordCount,
                    rewriteDirection: blueprint.rewriteDirection,
                    batchQueue,
                });
            }
        } catch (err) {
            const message = safeErrorMessage(err, '重生失败');
            console.error('[重生] 失败:', err);
            res.status(500).json({ error: message });
        }
    });

    // ====== 已弃用的章节级干预公开接口 ======
    router.post('/rebirth/chapter-direction', (_req, res) => sendRebirthChapterDirectionDeprecated(res));
    router.get('/rebirth/chapter-direction/:novelId', (_req, res) => sendRebirthChapterDirectionDeprecated(res));
    router.delete('/rebirth/chapter-direction/:novelId/:chapterNumber', (_req, res) => sendRebirthChapterDirectionDeprecated(res));
}
