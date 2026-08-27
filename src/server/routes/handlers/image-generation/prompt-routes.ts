import type { Router } from 'express';
import { buildHttpErrorResponse } from '../shared/http-error-response.js';
import {
  ensureNovelAccess,
  getPortraitStyleOptions,
  normalizePortraitStyleOverrides,
  resolvePortraitPrompt,
  type ImageGenerationRouteDeps,
} from './route-support.js';

export function registerImageGenerationPromptRoutes(
  router: Router,
  deps: Pick<ImageGenerationRouteDeps, 'authDb' | 'modelClient' | 'novelManager'>,
): void {
  router.get('/portrait-style-options', (_req, res) => {
    res.json(getPortraitStyleOptions());
  });

  router.post('/:charId/portrait-prompt', async (req, res) => {
    try {
      const { novelId, charId } = req.params as { novelId: string; charId: string };
      if (!(await ensureNovelAccess(req, res, deps.novelManager, novelId))) {
        return;
      }
      const { styleOverrides } = req.body as { styleOverrides?: any };
      const normalizedOverrides = normalizePortraitStyleOverrides(styleOverrides);
      const novel = await deps.novelManager.getNovel(novelId);
      const characters = await deps.novelManager.getCharacters(novelId);
      const char = characters.find(character => character.id === charId);
      if (!char) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      const promptResult = await resolvePortraitPrompt({
        authDb: deps.authDb,
        authHeaders: req.headers,
        char,
        modelClient: deps.modelClient,
        novel,
        styleOverrides: normalizedOverrides,
        userId: req.auth?.id,
      });

      res.json({
        prompt: promptResult.usedPrompt,
        positivePrompt: promptResult.positivePrompt,
        negativePrompt: promptResult.negativePrompt,
        styleIndex: promptResult.styleIndex,
      });
    } catch (err) {
      const { statusCode, payload } = buildHttpErrorResponse(err, '生成提示词失败');
      res.status(statusCode).json(payload);
    }
  });
}
