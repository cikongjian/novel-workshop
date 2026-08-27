import type { Router } from 'express';
import { buildHttpErrorResponse } from '../shared/http-error-response.js';
import { beginAIBilling, settleAIBilling } from '../billing-guard.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import {
  ensureNovelAccess,
  generateCoverImageWithFallback,
  loadCoverGenerationContext,
  persistGeneratedCover,
  resolveGeneratedImageBytes,
  resolveImageMimeType,
  resolveUserImageClient,
  type NovelCoverRouteDeps,
} from './route-support.js';
import {
  composeCoverPromptBlock,
  parseCoverPromptBlock,
  resolveCoverPromptPayload,
} from './prompt-support.js';
import {
  DEFAULT_COVER_SIZE,
  buildDefaultNegativePrompt,
  type CoverPromptSource,
} from './prompt-types.js';
import { normalizeCoverStyleOverrides } from './cover-style-options.js';
import {
  auditPublicTextContent,
  buildPublicTextBlockMessage,
} from '../../../../compliance/public-text-moderation.js';

export function registerNovelCoverGenerationRoutes(
  router: Router,
  deps: NovelCoverRouteDeps,
): void {
  router.post('/generate', async (req, res) => {
    const billingUserId = req.auth?.id;
    let freezeId: string | undefined;
    let frozenPoints = 0;
    try {
      const { novelId } = req.params as { novelId: string };

      const activeImageClient = await resolveUserImageClient({
        authDb: deps.authDb,
        userId: req.auth?.id,
        fallbackClient: deps.imageClient,
      });

      if (!activeImageClient) {
        res.status(503).json({ error: '图像生成服务未配置，请先在设置页面配置 IMAGE_API_KEY / IMAGE_MODEL / IMAGE_BASE_URL，或在"我的 → 文生图API"中配置个人图像模型' });
        return;
      }

      if (!(await ensureNovelAccess(req, res, deps.novelManager, novelId))) {
        return;
      }
      const {
        prompt,
        positivePrompt: rawPositivePrompt,
        negativePrompt: rawNegativePrompt,
        size,
        saveResult,
        generateText,
        authorName,
        styleOverrides,
      } = req.body as {
        prompt?: string;
        positivePrompt?: string;
        negativePrompt?: string;
        size?: string;
        saveResult?: boolean;
        generateText?: boolean;
        authorName?: string;
        styleOverrides?: Record<string, unknown>;
      };

      const { novel, characters, outline } = await loadCoverGenerationContext(deps.novelManager, novelId);

      let positivePrompt = rawPositivePrompt?.trim() ?? '';
      let negativePrompt = rawNegativePrompt?.trim() ?? '';
      let promptSource: CoverPromptSource = 'manual';

      if (!positivePrompt && prompt?.trim()) {
        const parsed = parseCoverPromptBlock(prompt);
        positivePrompt = parsed.positivePrompt.trim();
        negativePrompt = negativePrompt || parsed.negativePrompt.trim();
      }

      if (!positivePrompt) {
        const overrides = normalizeCoverStyleOverrides(styleOverrides);
        const generated = await resolveCoverPromptPayload({
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
        positivePrompt = generated.positivePrompt;
        negativePrompt = generated.negativePrompt;
        promptSource = generated.promptSource;
      }

      if (!positivePrompt) {
        res.status(400).json({ error: '封面提示词为空，请先生成或填写提示词' });
        return;
      }

      if (!negativePrompt) {
        negativePrompt = buildDefaultNegativePrompt(generateText).join(', ');
      }

      // 提示词违规内容拦截
      const promptAuditFull = [positivePrompt, negativePrompt].filter(Boolean).join(' ');
      const promptAuditResult = await auditPublicTextContent({
        content: promptAuditFull,
        contentAuditService: deps.contentAuditService,
        novelId,
        operationKey: 'system.cover-prompt-audit',
        operationLabel: '封面提示词审核',
      });
      if (promptAuditResult.suggestion !== 'pass') {
        res.status(400).json({
          error: buildPublicTextBlockMessage(promptAuditResult, {
            subjectLabel: '封面提示词',
            actionLabel: '生成',
          }),
          code: 'COVER_PROMPT_BLOCKED',
        });
        return;
      }

      const requestedSize = typeof size === 'string' && size.trim() ? size.trim() : DEFAULT_COVER_SIZE;

      // 计费守卫
      const modelAccess = await resolveUserModelAccess({
        authDb: deps.authDb,
        userId: billingUserId,
        headers: req.headers,
        novel,
      });
      const bypassBilling = modelAccess.billingBypass;
      if (!bypassBilling && deps.billingService && billingUserId && billingUserId !== 'dev') {
        try {
          const guard = await beginAIBilling({
            billingService: deps.billingService,
            userId: billingUserId,
            operation: 'coverAiGenerate',
            bizId: `novel:${novelId}`,
          });
          freezeId = guard.freezeId;
          frozenPoints = guard.estimatedPoints;
        } catch (billingErr) {
          const msg = billingErr instanceof Error ? billingErr.message : String(billingErr);
          res.status(402).json({ error: msg, code: 'INSUFFICIENT_BALANCE' });
          return;
        }
      }

      const { generatedImage, usedSize } = await generateCoverImageWithFallback(
        activeImageClient,
        positivePrompt,
        negativePrompt,
        requestedSize,
      );
      const shouldSave = saveResult !== false;

      if (!shouldSave) {
        let imageDataUrl: string | null = null;
        if (generatedImage.b64Data) {
          imageDataUrl = `data:image/png;base64,${generatedImage.b64Data}`;
        } else if (generatedImage.imageUrl) {
          const { bytes, ext } = await resolveGeneratedImageBytes(generatedImage);
          imageDataUrl = `data:${resolveImageMimeType(ext)};base64,${bytes.toString('base64')}`;
        }
        if (freezeId && deps.billingService) {
          await settleAIBilling(deps.billingService, billingUserId!, freezeId, frozenPoints);
        }
        res.json({
          novel,
          persisted: false,
          imagePath: null,
          imageUrl: generatedImage.imageUrl ?? null,
          imageDataUrl,
          requestedSize,
          size: usedSize,
          usedFallbackSize: usedSize !== requestedSize,
          prompt: composeCoverPromptBlock(positivePrompt, negativePrompt),
          positivePrompt,
          negativePrompt,
          promptSource,
        });
        return;
      }

      const { bytes, ext } = await resolveGeneratedImageBytes(generatedImage);
      const updatedNovel = await persistGeneratedCover({
        bookStoreManager: deps.bookStoreManager,
        bytes,
        ext,
        generatedAt: String(Date.now()),
        novel,
        novelId,
        novelManager: deps.novelManager,
      });

      if (freezeId && deps.billingService) {
        await settleAIBilling(deps.billingService, billingUserId!, freezeId, frozenPoints);
      }
      res.json({
        novel: updatedNovel,
        persisted: true,
        imagePath: updatedNovel.coverImage,
        imageUrl: `/novels/cover/${novelId}?v=${encodeURIComponent(updatedNovel.updatedAt)}`,
        imageDataUrl: null,
        requestedSize,
        size: usedSize,
        usedFallbackSize: usedSize !== requestedSize,
        prompt: composeCoverPromptBlock(positivePrompt, negativePrompt),
        positivePrompt,
        negativePrompt,
        promptSource,
      });
    } catch (err) {
      if (freezeId && deps.billingService && billingUserId) {
        settleAIBilling(deps.billingService, billingUserId, freezeId, 0).catch(() => {});
      }
      const { statusCode, payload } = buildHttpErrorResponse(err, '生成封面失败');
      res.status(statusCode).json(payload);
    }
  });
}
