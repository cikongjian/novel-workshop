import { Router } from 'express';
import type { AuthDb } from '../../auth/types.js';
import type { BillingService } from '../../billing/billing-service.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { ModelClient } from '../../models/types.js';
import type { NovelMemory } from '../../memory/novel-memory.js';
import {
  registerCharacterCRUDHandlers,
  registerPendingCharacterHandlers,
  registerBackfillHandlers,
  registerMergeHandlers,
} from './handlers/characters/index.js';
import { registerPolishIntroRoutes } from './handlers/characters/polish-intro-routes.js';
import { registerCharacterGrowthRoutes } from './handlers/characters/character-growth-routes.js';
import { canAccessNovel } from '../middleware/novel-ownership.js';

function getSingleParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * 创建角色路由
 * 前缀: /api/novels/:novelId/characters
 */
export function createCharactersRouter(
  novelManager: NovelManager,
  modelClient?: ModelClient,
  novelMemory?: NovelMemory,
  authDb?: AuthDb,
  billingService?: BillingService,
): Router {
  const router = Router({ mergeParams: true });

  // 权限检查中间件：验证用户是否有权访问该小说
  router.use(async (req, res, next) => {
    // 所有 GET 请求（只读）为公开访问，跳过权限检查
    if (req.method === 'GET') {
      next();
      return;
    }

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
        res.status(403).json({ error: '无权访问此小说的角色' });
        return;
      }

      next();
    } catch (err) {
      res.status(500).json({ error: '验证权限失败' });
    }
  });

  // Register all character route handlers
  registerPendingCharacterHandlers(router, novelManager, novelMemory);
  registerCharacterCRUDHandlers(router, novelManager, novelMemory);
  registerBackfillHandlers(router, novelManager, modelClient, novelMemory, authDb);
  registerMergeHandlers(router, novelManager, modelClient, novelMemory, authDb);
  registerPolishIntroRoutes(router, { novelManager, modelClient, novelMemory, authDb, billingService });

  // 角色成长数据（逐章状态快照 + 事件记忆链），GET 自动公开，读者可见
  registerCharacterGrowthRoutes(router, novelManager);

  // 角色卡牌进化开关（作者/管理员可切换自动/手动模式）
  router.post('/:characterId/auto-evolve', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const characterId = getSingleParam(req.params.characterId);
      if (!novelId || !characterId) {
        res.status(400).json({ error: '参数缺失' });
        return;
      }
      const { enabled } = req.body ?? {};
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled 必须是布尔值' });
        return;
      }

      const characters = await novelManager.getCharacters(novelId);
      const character = characters.find((c) => c.id === characterId);
      if (!character) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      character.autoEvolve = enabled;
      character.updatedAt = new Date().toISOString();
      await novelManager.saveCharacter(novelId, character);
      res.json({ autoEvolve: enabled });
    } catch (err) {
      res.status(500).json({ error: '操作失败' });
    }
  });

  return router;
}
