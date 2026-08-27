import { Router } from 'express';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { FinalizePipeline } from '../../pipeline/finalize-pipeline.js';
import type { AgentEvent, NovelAgent } from '../../agents/types.js';
import type { ModelClient } from '../../models/types.js';
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import type { MomentsGenerator } from '../../character-moments/moments-generator.js';
import type { NovelMemory } from '../../memory/novel-memory.js';
import type { StoryStateManager } from '../../novel/story-state-manager.js';
import type { AuthDb } from '../../auth/types.js';
import type { WriterStatsService } from '../../services/writer-stats-service.js';
import type { UnifiedMessageService } from '../../services/unified-message-service.js';
import type { CharacterCardService } from '../../services/character-card-service.js';
import type { VoteService } from '../../services/vote-service.js';
import {
  registerCrudRoutes,
  type ChapterCrudDeps,
} from './handlers/chapters/crud-handler.js';
import {
  registerVersionRoutes,
  type ChapterVersionDeps,
} from './handlers/chapters/version-handler.js';
import {
  registerPacingRoutes,
  type ChapterPacingDeps,
} from './handlers/chapters/pacing-handler.js';
import {
  registerQuoteRoutes,
  type ChapterQuoteDeps,
} from './handlers/chapters/quote-handler.js';
import {
  registerDialogueBracketCleanupRoutes,
  type ChapterDialogueBracketCleanupDeps,
} from './handlers/chapters/dialogue-bracket-clean-handler.js';
import {
  registerTitleRoutes,
  type ChapterTitleDeps,
} from './handlers/chapters/title-handler.js';
import {
  registerTitleBatchRoutes,
  type ChapterTitleBatchDeps,
} from './handlers/chapters/title-batch-routes.js';
import {
  registerFinalizeRoutes,
  type ChapterFinalizeDeps,
} from './handlers/chapters/finalize-handler.js';
import {
  registerCollaborationRoutes,
  type ChapterCollaborationDeps,
} from './handlers/chapters/collaboration-handler.js';
import {
  registerGenerationStatusRoutes,
} from './handlers/chapters/generation-status-handler.js';
import type { GetNovelGenerationStatusFn } from '../../services/chapter-generation-status-service.js';
import { canAccessNovel } from '../middleware/novel-ownership.js';

function getSingleParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * 创建章节路由
 * 前缀: /api/novels/:novelId/chapters
 */
export function createChaptersRouter(
  novelManager: NovelManager,
  finalizePipeline?: FinalizePipeline,
  broadcast?: (event: AgentEvent) => void,
  agents?: Map<string, NovelAgent>,
  modelClient?: ModelClient,
  momentsGenerator?: MomentsGenerator,
  bookStoreManager?: BookStoreManager,
  novelMemory?: NovelMemory,
  storyStateManager?: StoryStateManager,
  authDb?: AuthDb,
  getNovelGenerationStatus?: GetNovelGenerationStatusFn,
  writerStatsService?: WriterStatsService,
  unifiedMessageService?: UnifiedMessageService,
  characterCardService?: CharacterCardService,
  voteService?: VoteService,
): Router {
  const router = Router({ mergeParams: true });

  // 权限检查中间件：验证用户是否有权访问该小说
  router.use(async (req, res, next) => {
    const novelId = getSingleParam(req.params.novelId);
    if (!novelId) {
      res.status(400).json({ error: 'novelId is required' });
      return;
    }

    try {
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      if (!canAccessNovel(req.auth, novel)) {
        res.status(403).json({ error: '无权访问此小说的章节' });
        return;
      }

      next();
    } catch (err) {
      res.status(500).json({ error: '验证权限失败' });
    }
  });

  // Build dependencies for all handlers
  const crudDeps: ChapterCrudDeps = { novelManager, bookStoreManager, novelMemory, storyStateManager, writerStatsService, voteService };
  const versionDeps: ChapterVersionDeps = { novelManager };
  const pacingDeps: ChapterPacingDeps = { novelManager };
  const quoteDeps: ChapterQuoteDeps = { novelManager };
  const dialogueBracketCleanupDeps: ChapterDialogueBracketCleanupDeps = { novelManager, modelClient };
  const titleDeps: ChapterTitleDeps = { novelManager, modelClient, agents, authDb };
  const titleBatchDeps: ChapterTitleBatchDeps = { novelManager };
  const finalizeDeps: ChapterFinalizeDeps = { novelManager, finalizePipeline, broadcast, momentsGenerator, agents, modelClient, bookStoreManager, messageService: unifiedMessageService, characterCardService };
  const collaborationDeps: ChapterCollaborationDeps = { novelManager };

  // Register all routes
  // IMPORTANT: Pacing routes must be registered before /:num to avoid conflicts
  // IMPORTANT: Literal routes must be registered before /:num catch-all routes
  registerPacingRoutes(router, pacingDeps);

  // 生成状态轮询端点（移动端替代 WebSocket）
  // 必须在 CRUD /:num 之前注册，防止 'generation-status' 被当作 chapterNumber 解析
  registerGenerationStatusRoutes(router, { novelManager, getNovelGenerationStatus });

  // Quote cleanup routes (POST endpoints)
  registerQuoteRoutes(router, quoteDeps);
  registerDialogueBracketCleanupRoutes(router, dialogueBracketCleanupDeps);

  // Finalize route (POST /:num)
  registerFinalizeRoutes(router, finalizeDeps);

  // Title generation routes
  registerTitleRoutes(router, titleDeps);
  // 批量标题修复（纯算法 dry-run + 写入）
  registerTitleBatchRoutes(router, titleBatchDeps);

  // CRUD routes
  registerCrudRoutes(router, crudDeps);

  // Version history routes
  registerVersionRoutes(router, versionDeps);

  // Collaboration log routes
  registerCollaborationRoutes(router, collaborationDeps);

  return router;
}
