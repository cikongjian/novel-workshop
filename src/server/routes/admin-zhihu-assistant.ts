import { Router } from 'express';
import { z } from 'zod';
import type { ModelClient } from '../../models/types.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import {
  type ZhihuAssistantOutputMode,
  ZhihuPostAssistantService,
} from '../../publishing/zhihu-post-assistant-service.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const HistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(12_000),
});

const OutputModeSchema = z.enum(['topics', 'outline', 'answer', 'polish']) satisfies z.ZodType<ZhihuAssistantOutputMode>;

const ChatBodySchema = z.object({
  message: z.string().trim().min(1).max(12_000),
  history: z.array(HistoryMessageSchema).max(12).optional(),
  outputMode: OutputModeSchema.optional(),
  selectedFeatureIds: z.array(z.string().trim().min(1)).max(12).optional(),
  selectedNovelIds: z.array(z.string().trim().min(1)).max(12).optional(),
  selectedBookIds: z.array(z.string().trim().min(1)).max(12).optional(),
});

export interface AdminZhihuAssistantDeps {
  novelManager: Pick<NovelManager, 'listNovels'>;
  bookStoreManager?: Pick<BookStoreManager, 'adminListBooks'>;
  modelClient: ModelClient;
}

export function createAdminZhihuAssistantRouter(deps: AdminZhihuAssistantDeps): Router {
  const router = Router();
  const service = new ZhihuPostAssistantService(deps);

  router.use(requireAdmin());

  router.get('/context', async (_req, res, next) => {
    try {
      const snapshot = await service.getKnowledgeSnapshot();
      res.json({ snapshot });
    } catch (err) {
      next(err);
    }
  });

  router.post('/chat', validate({ body: ChatBodySchema }), async (req, res, next) => {
    try {
      const result = await service.chat(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
