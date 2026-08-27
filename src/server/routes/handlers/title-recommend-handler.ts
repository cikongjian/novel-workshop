import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { randomUUID } from 'node:crypto';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import {
  buildTitleRecommendationContext,
  buildTitleRecommendationRecord,
  normalizeRecommendationPlatform,
  parseTitleRecommendationPayload,
  removeTitleRecommendation,
} from './title-recommend-support.js';

export function registerTitleRecommendRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager, modelClient, broadcast, agents, authDb } = deps;

  // POST /api/generate/recommend-book-title — AI 书名 & 简介推荐
  router.post('/recommend-book-title', async (req, res) => {
    try {
      const { novelId, userDirection } = req.body;
      const platform = normalizeRecommendationPlatform(req.body.platform);
      if (!novelId) { res.status(400).json({ error: '缺少 novelId' }); return; }

      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
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
      const characters = await novelManager.getCharacters(novelId);
      const worldEntries = await novelManager.getWorldEntries(novelId);
      const outline = await novelManager.getOutline(novelId);
      const chapters = await novelManager.listChapters(novelId);

      const agent = agents?.get('book-title-recommender');
      if (!agent) { res.status(500).json({ error: 'book-title-recommender Agent 未注册' }); return; }

      const context = buildTitleRecommendationContext({
        novel,
        platform,
        userDirection,
        characters,
        worldEntries,
        outline,
        chapters,
      });

      const output = await agent.execute(context, modelAccess.client ?? modelClient, (chunk) => {
        broadcast({
          type: 'agent:chunk',
          agentRole: 'book-title-recommender',
          novelId,
          data: chunk,
          timestamp: new Date().toISOString(),
        } as import('../../../agents/types.js').AgentEvent);
      });

      const rec = buildTitleRecommendationRecord({
        id: randomUUID(),
        platform,
        parsed: parseTitleRecommendationPayload(output.content),
        createdAt: new Date().toISOString(),
      });

      const currentRecs = novel.titleRecommendations ?? [];
      await novelManager.updateNovel(novelId, {
        titleRecommendations: [...currentRecs, rec],
      } as Record<string, unknown>);

      res.json({ recommendation: rec });
    } catch (err: unknown) {
      res.status(500).json({ error: safeErrorMessage(err, '书名推荐生成失败') });
    }
  });

  // DELETE /api/generate/recommend-book-title/:novelId/:recId — 删除推荐记录
  router.delete('/recommend-book-title/:novelId/:recId', async (req, res) => {
    try {
      const { novelId, recId } = req.params;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const recs = removeTitleRecommendation(novel.titleRecommendations, recId);
      await novelManager.updateNovel(novelId, {
        titleRecommendations: recs,
      } as Record<string, unknown>);
      res.json({ success: true });
    } catch (err: unknown) {
      res.status(500).json({ error: safeErrorMessage(err, '删除推荐失败') });
    }
  });
}
