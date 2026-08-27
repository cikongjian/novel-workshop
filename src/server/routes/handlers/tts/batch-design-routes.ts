import type { Router } from 'express';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  ensureVoiceDesignerReady,
  executeVoiceDesigner,
  type TTSDesignRouteDeps,
} from './design-route-support.js';
import { logger } from './route-support.js';

export function registerTTSBatchDesignRoutes(
  router: Router,
  { ensureNovelAccess, modelClient, novelManager, requireAdminForServerTTS, voiceDesignerAgent }: TTSDesignRouteDeps,
): void {
  router.post('/design-voices/:novelId', requireAdminForServerTTS, async (req, res) => {
    const readyDeps = { modelClient, voiceDesignerAgent };
    if (!ensureVoiceDesignerReady(res, readyDeps)) {
      return;
    }

    const novelId = String(req.params.novelId);
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }

    try {
      const [novel, characters] = await Promise.all([
        novelManager.getNovel(novelId),
        novelManager.getCharacters(novelId),
      ]);

      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      if (characters.length === 0) {
        res.status(400).json({ error: '该小说暂无角色' });
        return;
      }

      const force = req.query.force === 'true';
      const targets = force ? characters : characters.filter(character => !character.voiceInstruct);

      if (targets.length === 0) {
        res.json({ updated: 0, message: '所有角色已有声音描述' });
        return;
      }

      const designResults = await executeVoiceDesigner({
        novelId,
        novel,
        targets,
        modelClient: readyDeps.modelClient,
        voiceDesignerAgent: readyDeps.voiceDesignerAgent,
      });
      if (!designResults) {
        res.status(500).json({ error: 'AI 音效师返回的数据格式异常，请重试' });
        return;
      }

      const timestamp = new Date().toISOString();
      let updatedCount = 0;

      for (const result of designResults) {
        if (result.characterId === '__narrator__') continue;

        const character = characters.find(item => item.id === result.characterId);
        if (!character || !result.voiceInstruct) continue;

        character.voiceInstruct = result.voiceInstruct;
        if (character.voiceDesignStatus === 'none') {
          character.voiceDesignStatus = 'designed';
        }
        character.updatedAt = timestamp;
        await novelManager.saveCharacter(novelId, character);
        updatedCount++;
      }

      const narratorResult = designResults.find(result => result.characterId === '__narrator__');

      res.json({
        updated: updatedCount,
        narratorInstruct: narratorResult?.voiceInstruct,
        message: `已为 ${updatedCount} 个角色生成声音描述`,
      });
    } catch (err) {
      logger.error('批量声音设计失败', { error: err instanceof Error ? err.message : String(err) });
      res.status(500).json({
        error: '批量声音设计失败',
        detail: safeErrorMessage(err, '批量声音设计失败'),
      });
    }
  });
}
