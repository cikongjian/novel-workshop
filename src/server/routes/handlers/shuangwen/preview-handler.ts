import type { Router } from 'express';
import type { ShuangwenDeps } from './types.js';
import { PreviewBody } from './types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  requireReady,
  generateArtifacts,
  loadAccessibleNovel,
  resolveShuangwenModelClient,
} from './shared-helpers.js';

export function registerPreviewRoutes(router: Router, deps: ShuangwenDeps): void {
  // /preview：只跑"男频/女频爽文"逻辑，不写入 data（不影响正常小说）
  router.post('/preview', async (req, res) => {
    const parsed = PreviewBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      return;
    }
    const ready = requireReady(res, deps);
    if (!ready) return;

    try {
      const body = parsed.data;

      const existingNovel = body.novelId
        ? await loadAccessibleNovel({
          req,
          res,
          deps,
          novelId: body.novelId,
        })
        : null;
      if (body.novelId && !existingNovel) return;
      const modelState = await resolveShuangwenModelClient({
        req,
        res,
        deps,
        novel: existingNovel,
      });
      if (!modelState) return;
      const { genreUsed, audienceUsed, runResult } = await generateArtifacts({
        modelClient: modelState.modelClient,
        agents: ready.agents,
        inputGenre: body.genre,
        inputAudience: body.audience,
        seedIdea: body.seedIdea,
        titleHint: body.titleHint || existingNovel?.title,
        synopsisHint: body.synopsisHint || existingNovel?.synopsis || existingNovel?.description,
        outlineChapters: body.outlineChapters,
        targetChapters: body.targetChapters,
        includeMarketing: body.includeMarketing,
        sampleChapter: body.sampleChapter,
        maxWordCount: body.maxWordCount,
        temperatureOverride: body.temperatureOverride,
        existingNovel,
      });

      res.json({
        mode: 'preview',
        resolved: { genre: genreUsed, audience: audienceUsed },
        persisted: false,
        persistDetails: {},
        ...runResult,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '爽文管线预览失败');
      res.status(500).json({ error: message });
    }
  });
}
