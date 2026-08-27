import type { Request, Response, Router } from 'express';
import {
  applyPositionBackfillPatches,
  buildPositionBackfillPrompt,
  parseBackfillJsonArray,
  resolveCharacterBackfillModelClient,
  selectPositionBackfillCandidates,
  type CharacterBackfillDeps,
} from './backfill-route-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

export function registerBackfillPositionRoutes(router: Router, deps: CharacterBackfillDeps): void {
  router.post('/backfill-position', async (req: Request, res: Response): Promise<void> => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const force = req.query.force === 'true';
      const body = req.body as { characterIds?: string[] } | undefined;
      const characters = await deps.novelManager.getCharacters(novelId);
      const { activeModelClient, novel } = await resolveCharacterBackfillModelClient({
        deps,
        req,
        novelId,
        unavailableMessage: 'AI 模型未配置，无法推断职位',
      });

      const needsBackfill = selectPositionBackfillCandidates(characters, force, body?.characterIds);
      if (needsBackfill.length === 0) {
        res.json({ updated: 0, message: '所有角色已有职位信息，无需补全' });
        return;
      }

      const response = await activeModelClient.chat([
        {
          role: 'user',
          content: buildPositionBackfillPrompt({
            novel,
            characters: needsBackfill,
            force,
          }),
        },
      ], { temperature: 0.3, maxTokens: 4096 });

      let backfillData: Array<{ id: string; position?: string }>;
      try {
        backfillData = parseBackfillJsonArray(response.content);
      } catch {
        res.status(500).json({ error: 'AI 返回的数据格式异常，请重试' });
        return;
      }

      const updatedCount = await applyPositionBackfillPatches({
        novelId,
        characters,
        patches: backfillData,
        force,
        deps,
      });
      const modeLabel = force ? '重新推断' : '补全';
      res.json({
        updated: updatedCount,
        message: `已为 ${updatedCount} 个角色${modeLabel}职位信息`,
      });
    } catch (err) {
      const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
        ? Number((err as { statusCode: number }).statusCode)
        : 500;
      const message = safeErrorMessage(err, '角色职位补全失败');
      const payload = statusCode === 400 && typeof (err as { code?: unknown })?.code === 'string'
        ? { error: message, code: String((err as { code: string }).code) }
        : statusCode === 500
          ? { error: '角色职位补全失败', detail: message }
          : { error: message };
      console.error('[角色职位补全] 失败:', err);
      res.status(statusCode).json(payload);
    }
  });
}
