import { Router, Request, Response } from 'express';
import type { AuthDb } from '../../../../auth/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  batchMergeCharacterGroups,
  detectDuplicateCharacterGroups,
  mergeCharacterPair,
} from './merge-support.js';

/**
 * Register character merge routes
 * POST /merge - Merge source character into target character
 * POST /batch-merge - Batch merge characters by AI-detected groups
 * POST /detect-duplicates - AI detect likely duplicate characters
 */
export function registerMergeHandlers(
  router: Router,
  novelManager: NovelManager,
  modelClient?: ModelClient,
  novelMemory?: NovelMemory,
  authDb?: AuthDb,
): void {
  // Merge two characters
  router.post('/merge', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const body = req.body as { sourceCharacterId: string; targetCharacterId: string } | undefined;

      if (!body || !body.sourceCharacterId || !body.targetCharacterId) {
        res.status(400).json({ error: '需要提供 sourceCharacterId 和 targetCharacterId' });
        return;
      }

      const { sourceCharacterId, targetCharacterId } = body;

      if (sourceCharacterId === targetCharacterId) {
        res.status(400).json({ error: '源角色和目标角色不能相同' });
        return;
      }

      const {
        sourceCharacter,
        targetCharacter,
        updatedTarget,
        mergedAliases,
      } = await mergeCharacterPair({
        novelId,
        novelManager,
        novelMemory,
        sourceCharacterId,
        targetCharacterId,
      });

      res.json({
        success: true,
        message: `已成功将角色 "${sourceCharacter.name}" 合并到 "${targetCharacter.name}"`,
        targetCharacter: updatedTarget,
        mergedAliases,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '角色合并失败');
      console.error('[角色合并] 失败:', err);
      res.status(500).json({ error: message });
    }
  });

  // Batch merge characters
  router.post('/batch-merge', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const body = req.body as { groups: { ids: string[]; names: string[] }[] } | undefined;

      if (!body?.groups?.length) {
        res.status(400).json({ error: '需要提供 groups 数组' });
        return;
      }

      const results = await batchMergeCharacterGroups({
        novelId,
        novelManager,
        novelMemory,
        groups: body.groups,
      });

      res.json({
        success: true,
        message: `批量合并完成，共处理 ${results.length} 组`,
        results,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '批量合并失败');
      console.error('[批量角色合并] 失败:', err);
      res.status(500).json({ error: message });
    }
  });

  // AI detect duplicate characters
  router.post('/detect-duplicates', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const novel = await novelManager.getNovel(novelId);
      const modelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }
      const activeModelClient = modelAccess.client ?? modelClient;
      if (!activeModelClient) {
        res.status(503).json({ error: 'AI 模型未配置，无法推断相同角色' });
        return;
      }
      const characters = await novelManager.getCharacters(novelId);

      if (characters.length < 2) {
        res.json({ groups: [] });
        return;
      }
      const groups = await detectDuplicateCharacterGroups({
        modelClient: activeModelClient,
        characters,
      });

      res.json({ groups });
    } catch (err) {
      console.error('[AI推断相同角色] 失败:', err);
      res.status(500).json({ error: safeErrorMessage(err, 'AI 推断失败') });
    }
  });
}
