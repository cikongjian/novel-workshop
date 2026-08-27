import type { Router } from 'express';
import type { ShuangwenDeps } from './types.js';
import { GenerateChapterBody } from './types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { getAiUsageContext } from '../../../../ai/usage-context.js';
import {
  requireReady,
  loadAccessibleNovel,
  resolveShuangwenModelClient,
} from './shared-helpers.js';
import {
  buildShuangwenGenerateChapterAcceptedResponse,
  isShuangwenGenerateChapterTaskActive,
  startShuangwenGenerateChapterTask,
} from './generate-chapter-background.js';

export function registerGenerateChapterRoutes(router: Router, deps: ShuangwenDeps): void {
  // /generate-chapter：独立生成爽文章节（不依赖 ChapterPipeline）
  router.post('/generate-chapter', async (req, res) => {
    const parsed = GenerateChapterBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      return;
    }
    const ready = requireReady(res, deps);
    if (!ready) return;

    try {
      const body = parsed.data;

      // 验证小说存在、可访问且有爽文蓝图
      const novel = await loadAccessibleNovel({
        req,
        res,
        deps,
        novelId: body.novelId,
      });
      if (!novel) return;
      if (!novel.shuangwenBlueprint) {
        res.status(400).json({
          error: '该小说没有爽文蓝图（shuangwenBlueprint），请先通过 /api/shuangwen/create-async 创建或对现有小说执行 /api/shuangwen/apply',
        });
        return;
      }
      const modelState = await resolveShuangwenModelClient({
        req,
        res,
        deps,
        novel,
      });
      if (!modelState) return;

      if (!isShuangwenGenerateChapterTaskActive(body.novelId, body.chapterNumber)) {
        startShuangwenGenerateChapterTask({
          deps,
          agents: ready.agents,
          novel,
          body,
          modelClient: modelState.modelClient,
          modelAccessSource: modelState.modelAccess.source,
          billingBypassed: modelState.modelAccess.billingBypass,
          usageContext: getAiUsageContext(),
        });
      }

      res.status(202).json({
        ...buildShuangwenGenerateChapterAcceptedResponse({
          novelId: body.novelId,
          chapterNumber: body.chapterNumber,
        }),
        billingBypassed: modelState.modelAccess.billingBypass,
        modelAccessSource: modelState.modelAccess.source,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '爽文章节生成失败');
      res.status(500).json({ error: message });
    }
  });
}
