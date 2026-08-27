import { Router } from 'express';
import type { Request } from 'express';
import { rateLimit } from '../middleware/rate-limit.js';
import { concurrencyLimit } from '../middleware/concurrency-limit.js';
import { checkNovelAccess } from '../middleware/novel-access.js';

// Re-export GenerateDeps from handlers/types so app.ts import stays unchanged
export type { GenerateDeps } from './handlers/types.js';

import type { GenerateDeps } from './handlers/types.js';
import { registerChapterRoutes } from './handlers/chapter-handler.js';
import { registerChatRoutes } from './handlers/chat-handler.js';
import { registerCurateForeshadowingRoutes } from './handlers/curate-foreshadowing-handler.js';
import { registerCurateCultureRoutes } from './handlers/curate-culture-handler.js';
import { registerCurateHistoryRoutes } from './handlers/curate-history-handler.js';
import { registerCuratePowerRoutes } from './handlers/curate-power-handler.js';
import { registerCurateFactionRoutes } from './handlers/curate-faction-handler.js';
import { registerWorldBibleRoutes } from './handlers/world-bible-routes.js';
import { registerInlineRoutes } from './handlers/inline-handler.js';
import { registerBatchRoutes } from './handlers/batch-handler.js';
import { registerAdvancedRoutes } from './handlers/advanced-handler.js';
import { registerDigestRoutes } from './handlers/digest-handler.js';
import { registerRebirthRoutes } from './handlers/rebirth-handler.js';
import { registerRewriteRoutes } from './handlers/rewrite-handler.js';
import { registerTitleRecommendRoutes } from './handlers/title-recommend-handler.js';
import { registerAuthorNoteRoutes } from './handlers/author-note-handler.js';
import { registerAuthorNoteBatchRoutes } from './handlers/author-note-batch-handler.js';
import { registerSynopsisGeneratorRoutes } from './handlers/synopsis-generator-handler.js';

/**
 * 创建 AI 生成路由
 * 前缀: /api/generate
 */
export function createGenerateRouter(deps: GenerateDeps): Router {
    const router = Router();
    const clientKeyFn = (req: Request) => resolveGenerateClientKey(req);

    router.param('novelId', async (req, res, next, novelId) => {
      const access = await checkNovelAccess(req, deps.novelManager, novelId);
      if (!access.allowed) {
        res.status(access.status).json({ error: access.error });
        return;
      }
      next();
    });

    router.use(
      rateLimit({
        windowMs: readPositiveIntEnv('GENERATE_RATE_LIMIT_WINDOW_MS', 60_000),
        max: readPositiveIntEnv('GENERATE_RATE_LIMIT_MAX', 30),
        keyFn: clientKeyFn,
      }),
    );
    router.use(
      concurrencyLimit({
        max: readPositiveIntEnv('GENERATE_MAX_CONCURRENT', 2),
        methods: ['POST'],
        keyFn: clientKeyFn,
        skipPaths: ['/suggestions'],
      }),
    );
    router.use(async (req, res, next) => {
      const bodyNovelId = readNovelIdFromValue(req.body);
      const queryNovelId = readNovelIdFromValue(req.query);
      const novelId = bodyNovelId ?? queryNovelId;
      if (!novelId) {
        next();
        return;
      }
      const access = await checkNovelAccess(req, deps.novelManager, novelId);
      if (!access.allowed) {
        res.status(access.status).json({ error: access.error });
        return;
      }
      next();
    });

    // 章节生成 / 修订 / 缩写
    registerChapterRoutes(router, deps);

    // 聊天 / 灵感扩写
    registerChatRoutes(router, deps);

    // 伏笔智能梳理
    registerCurateForeshadowingRoutes(router, deps);

    // 世界观梳理（文化 / 历史 / 力量 / 势力）
    registerCurateCultureRoutes(router, deps);
    registerCurateHistoryRoutes(router, deps);
    registerCuratePowerRoutes(router, deps);
    registerCurateFactionRoutes(router, deps);
    registerWorldBibleRoutes(router, deps);

    // 内联 AI / 说话人补全
    registerInlineRoutes(router, deps);

    // 批量生成 / 批量修订
    registerBatchRoutes(router, deps);

    // 章节重写 / 批量重写
    registerRewriteRoutes(router, deps);

    // 高级功能（审计 / 探索 / 角色对话 / 对话润色 / 营销 / 建议 / 并行对比）
    registerAdvancedRoutes(router, deps);

    // 批量摘要 / 大纲同步 / 弧线摘要
    registerDigestRoutes(router, deps);

    // 整本重生 / 章节干预指令
    registerRebirthRoutes(router, deps);

    // 书名 & 简介推荐
    registerTitleRecommendRoutes(router, deps);

    // 作品介绍生成（起点/番茄风格）
    registerSynopsisGeneratorRoutes(router, deps);

    // 作者有话说（单章 + 智能批量）
    registerAuthorNoteRoutes(router, deps);
    registerAuthorNoteBatchRoutes(router, deps);

    return router;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function resolveGenerateClientKey(req: Request): string {
  const normalized = req.auth?.id?.trim() ?? '';
  if (normalized) return `uid:${normalized}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

function readNovelIdFromValue(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const novelId = (value as Record<string, unknown>).novelId;
  if (typeof novelId === 'string' && novelId.trim()) {
    return novelId.trim();
  }
  if (Array.isArray(novelId) && typeof novelId[0] === 'string' && novelId[0].trim()) {
    return novelId[0].trim();
  }
  return null;
}
