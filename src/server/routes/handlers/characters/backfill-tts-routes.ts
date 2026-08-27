import type { Request, Response, Router } from 'express';
import {
  applyTtsBackfillPatches,
  buildTtsBackfillPrompt,
  parseBackfillJsonArray,
  resolveCharacterBackfillModelClient,
  selectTtsBackfillCandidates,
  type CharacterBackfillDeps,
} from './backfill-route-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

export function registerBackfillTtsRoutes(router: Router, deps: CharacterBackfillDeps): void {
  router.post('/backfill-tts', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const force = req.query.force === 'true';
      const { activeModelClient } = await resolveCharacterBackfillModelClient({
        deps,
        req,
        novelId,
        unavailableMessage: 'AI 模型未配置，无法补全角色信息',
      });
      const characters = await deps.novelManager.getCharacters(novelId);
      const needsBackfill = selectTtsBackfillCandidates(characters, force);

      if (needsBackfill.length === 0) {
        res.json({ updated: 0, message: '所有角色的 TTS 字段已完整，无需补全' });
        return;
      }

      const response = await activeModelClient.chat([
        { role: 'user', content: buildTtsBackfillPrompt(needsBackfill, force) },
      ], { temperature: 0.3, maxTokens: 4096 });

      let backfillData: Array<{ id: string; gender?: string; age?: string; speechStyle?: string }>;
      try {
        backfillData = parseBackfillJsonArray(response.content);
      } catch {
        res.status(500).json({ error: 'AI 返回的数据格式异常，请重试' });
        return;
      }

      const updatedCount = await applyTtsBackfillPatches({
        novelId,
        characters,
        patches: backfillData,
        force,
        deps,
      });
      const modeLabel = force ? '重新推断' : '补全';
      res.json({
        updated: updatedCount,
        message: `已为 ${updatedCount} 个角色${modeLabel} TTS 语音信息`,
      });
    } catch (err) {
      const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((err as { statusCode: number }).statusCode)
        : 500;
      const message = safeErrorMessage(err, '角色信息补全失败');
      const payload = statusCode === 400 && typeof (err as { code?: unknown })?.code === 'string'
        ? { error: message, code: String((err as { code: string }).code) }
        : statusCode === 500
          ? { error: '角色信息补全失败', detail: message }
          : { error: message };
      console.error('[角色补全] 失败:', err);
      res.status(statusCode).json(payload);
    }
  });
}
