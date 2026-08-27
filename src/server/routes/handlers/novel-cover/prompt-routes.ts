import type { Router } from 'express';
import { buildHttpErrorResponse } from '../shared/http-error-response.js';
import {
  ensureNovelAccess,
  loadCoverGenerationContext,
  type NovelCoverRouteDeps,
} from './route-support.js';
import { composeCoverPromptBlock } from './prompt-support.js';
import { resolveCoverPromptPayloadWithDiagnostics } from './prompt-ai.js';
import { getCoverStyleOptions, normalizeCoverStyleOverrides } from './cover-style-options.js';

export function registerNovelCoverPromptRoutes(
  router: Router,
  deps: Pick<NovelCoverRouteDeps, 'authDb' | 'modelClient' | 'novelManager'>,
): void {
  router.get('/cover-style-options', (_req, res) => {
    res.json(getCoverStyleOptions());
  });

  router.post('/prompt', async (req, res) => {
    try {
      const { novelId } = req.params as { novelId: string };
      if (!(await ensureNovelAccess(req, res, deps.novelManager, novelId))) {
        return;
      }
      const { novel, characters, outline } = await loadCoverGenerationContext(deps.novelManager, novelId);
      const { generateText, authorName, styleOverrides } = (req.body ?? {}) as {
        generateText?: boolean;
        authorName?: string;
        styleOverrides?: Record<string, unknown>;
      };
      const overrides = normalizeCoverStyleOverrides(styleOverrides);
      const resolution = await resolveCoverPromptPayloadWithDiagnostics({
        authDb: deps.authDb,
        characters,
        modelClient: deps.modelClient,
        novel,
        outline,
        req,
        generateText,
        authorName,
        overrides,
      });
      const { payload } = resolution;
      const includeDiagnostics = req.auth?.role === 'admin' && req.query.diagnostics === '1';

      res.json({
        prompt: composeCoverPromptBlock(payload.positivePrompt, payload.negativePrompt),
        positivePrompt: payload.positivePrompt,
        negativePrompt: payload.negativePrompt,
        promptSource: payload.promptSource,
        contextSummary: payload.contextSummary,
        recommendedSize: payload.recommendedSize,
        ...(includeDiagnostics ? { diagnostics: resolution.diagnostics } : {}),
      });
    } catch (err) {
      const { statusCode, payload } = buildHttpErrorResponse(err, '生成封面提示词失败');
      res.status(statusCode).json(payload);
    }
  });
}
