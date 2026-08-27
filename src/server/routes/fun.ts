import { Router } from 'express';
import type { ModelClient, ImageGenerationClient } from '../../models/types.js';
import type { AuthDb } from '../../auth/types.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import { registerCangjieChatRoute } from './handlers/fun/cangjie-chat.js';
import { registerCangjieOrganizeRoute } from './handlers/fun/cangjie-organize.js';
import { registerCangjieSeedIdeaRoute } from './handlers/fun/cangjie-seed-idea.js';
import { registerDnaFateProfileRoute } from './handlers/fun/dna-fate-profile.js';
import { registerDnaNovelCreationRoute } from './handlers/fun/dna-novel-creation.js';
import { registerDnaSeedIdeaRoute } from './handlers/fun/dna-seed-idea.js';

export interface FunDeps {
  modelClient: ModelClient;
  novelManager: NovelManager;
  imageClient?: ImageGenerationClient;
  authDb?: AuthDb;
}

export function createFunRouter(deps: FunDeps): Router {
  const router = Router();
  registerCangjieChatRoute(router, deps);
  registerCangjieOrganizeRoute(router, deps);
  registerCangjieSeedIdeaRoute(router, deps);
  registerDnaFateProfileRoute(router, deps);
  registerDnaSeedIdeaRoute(router, deps);
  registerDnaNovelCreationRoute(router, deps);

  router.post('/dna/illustration', async (req, res) => {
    try {
      const { prompt, questionId } = req.body ?? {};
      if (!prompt) {
        res.status(400).json({ error: '缺少 prompt' });
        return;
      }

      // 请求实时生成（向后兼容）
      if (!deps.imageClient) {
        res.status(400).json({ error: '图片服务未配置' });
        return;
      }

      const result = await deps.imageClient.generate(prompt, {
        size: '1024x1024',
      });

      res.json({
        questionId,
        imageUrl: result.imageUrl,
        b64Data: result.b64Data,
        revisedPrompt: result.revisedPrompt,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
