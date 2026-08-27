import type { Router } from 'express';
import { createLogger } from '../../../../utils/logger.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { buildHttpErrorResponse, resolveHttpErrorStatus } from '../shared/http-error-response.js';
import { beginAIBilling, settleAIBilling } from '../billing-guard.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import { generateAndSaveDNA } from '../../../../comic/comic-dna-generator.js';
import {
  buildPortraitFromRequest,
  buildPortraitNegativePrompt,
  buildPortraitStyleIndex,
  composePortraitPromptBlock,
  deletePortraitFile,
  enrichPortraitPromptWithCharacterConsistency,
  ensureNovelAccess,
  normalizePortraitStyleOverrides,
  resolveGeneratedImageBytes,
  savePortraitFile,
  streamPortraitImage,
  type ImageGenerationRouteDeps,
} from './route-support.js';

const log = createLogger('portrait-image');

export function registerImageGenerationPortraitRoutes(
  router: Router,
  deps: ImageGenerationRouteDeps,
): void {
  router.post('/:charId/portrait', async (req, res) => {
    const billingUserId = req.auth?.id;
    let freezeId: string | undefined;
    let frozenPoints = 0;
    try {
      if (!deps.imageClient) {
        res.status(503).json({ error: '图像生成服务未配置，请在设置页面配置 IMAGE_API_KEY 和 IMAGE_BASE_URL' });
        return;
      }
      const { novelId, charId } = req.params as { novelId: string; charId: string };
      if (!(await ensureNovelAccess(req, res, deps.novelManager, novelId))) {
        return;
      }
      const { prompt, size, styleOverrides } = req.body as {
        prompt?: string;
        size?: string;
        styleOverrides?: any;
      };
      const normalizedOverrides = normalizePortraitStyleOverrides(styleOverrides);

      const novel = await deps.novelManager.getNovel(novelId);
      const characters = await deps.novelManager.getCharacters(novelId);
      const char = characters.find(character => character.id === charId);
      if (!char) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      const { positivePrompt, negativePrompt } = await buildPortraitFromRequest({
        authDb: deps.authDb,
        authHeaders: req.headers,
        char,
        explicitPrompt: prompt,
        modelClient: deps.modelClient,
        novel,
        styleOverrides: normalizedOverrides,
        userId: req.auth?.id,
      });

      if (!positivePrompt) {
        res.status(400).json({ error: '提示词为空，请先填写或生成提示词' });
        return;
      }

      // 计费守卫
      const modelAccess = await resolveUserModelAccess({
        authDb: deps.authDb,
        userId: billingUserId,
        headers: req.headers,
        novel,
      });
      const isAdmin = req.auth?.role === 'admin';
      // admin 免计费（自部署场景 admin 自用不扣自己积分），与 BYOK 同等 bypass
      const bypassBilling = modelAccess.billingBypass || isAdmin;
      if (!bypassBilling && deps.billingService && billingUserId && billingUserId !== 'dev') {
        try {
          const guard = await beginAIBilling({
            billingService: deps.billingService,
            userId: billingUserId,
            operation: 'characterPortrait',
            bizId: `char:${novelId}:${charId}`,
          });
          freezeId = guard.freezeId;
          frozenPoints = guard.estimatedPoints;
        } catch (billingErr) {
          const msg = billingErr instanceof Error ? billingErr.message : String(billingErr);
          res.status(402).json({ error: msg, code: 'INSUFFICIENT_BALANCE' });
          return;
        }
      }

      const generated = await deps.imageClient.generate(positivePrompt, {
        size: size || '1024x1024',
        negativePrompt: negativePrompt || undefined,
      });
      const { bytes, ext } = await resolveGeneratedImageBytes(generated);
      const revisedPositivePrompt = enrichPortraitPromptWithCharacterConsistency(
        generated.revisedPrompt || positivePrompt,
        char,
        normalizedOverrides,
      );
      const usedPrompt = composePortraitPromptBlock(
        revisedPositivePrompt,
        negativePrompt || buildPortraitNegativePrompt(char, normalizedOverrides),
      );
      const styleIndex = buildPortraitStyleIndex(char, normalizedOverrides);

      const saved = await savePortraitFile({
        bytes,
        char,
        charId,
        ext,
        novelId,
        novelManager: deps.novelManager,
        prompt: usedPrompt,
      });

      if (freezeId && deps.billingService) {
        await settleAIBilling(deps.billingService, billingUserId!, freezeId, frozenPoints);
      }

      // 立绘生成成功后异步触发 DNA 生成（不阻塞立绘响应）
      const dnaModel = modelAccess.client ?? deps.modelClient;
      if (dnaModel) {
        generateAndSaveDNA({ char, model: dnaModel, novel }).catch((dnaErr) => {
          log.warn('立绘后角色DNA生成失败（不影响立绘结果）', {
            charId,
            charName: char.name,
            error: dnaErr instanceof Error ? dnaErr.message : String(dnaErr),
          });
        });
      }

      res.json({
        imagePath: saved.imagePath,
        imageUrl: saved.imageUrl,
        prompt: usedPrompt,
        styleIndex,
      });
    } catch (err) {
      if (freezeId && deps.billingService && billingUserId) {
        settleAIBilling(deps.billingService, billingUserId, freezeId, 0).catch(() => {});
      }
      const { statusCode, payload } = buildHttpErrorResponse(err, '生成立绘失败');
      res.status(statusCode).json(payload);
    }
  });

  router.get('/:charId/portrait', async (req, res) => {
    try {
      const { novelId, charId } = req.params as { novelId: string; charId: string };
      // 立绘 GET 为公开访问（auth 中间件已白名单），跳过权限检查
      const characters = await deps.novelManager.getCharacters(novelId);
      const char = characters.find(character => character.id === charId);
      if (!char?.portraitImagePath) {
        res.status(404).json({ error: '该角色暂无立绘' });
        return;
      }

      await streamPortraitImage({
        char,
        novelId,
        req,
        res,
      });
    } catch (err) {
      const statusCode = resolveHttpErrorStatus(err);
      const fallbackMessage = statusCode === 404
        ? '立绘文件不存在，请重新生成立绘'
        : statusCode === 400
          ? '立绘文件路径无效'
          : '获取立绘失败';
      const message = safeErrorMessage(err, fallbackMessage);
      const code = typeof (err as { code?: unknown })?.code === 'string'
        ? String((err as { code: string }).code)
        : undefined;
      if (statusCode >= 500) {
        const routeParams = req.params as { novelId?: string; charId?: string };
        log.error('获取立绘失败', {
          novelId: routeParams.novelId,
          charId: routeParams.charId,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
      res.status(statusCode).json({
        error: message,
        ...(code ? { code } : {}),
      });
    }
  });

  router.delete('/:charId/portrait', async (req, res) => {
    try {
      const { novelId, charId } = req.params as { novelId: string; charId: string };
      if (!(await ensureNovelAccess(req, res, deps.novelManager, novelId))) {
        return;
      }
      const characters = await deps.novelManager.getCharacters(novelId);
      const char = characters.find(character => character.id === charId);
      if (!char) {
        res.status(404).json({ error: '角色不存在' });
        return;
      }

      await deletePortraitFile({
        char,
        novelId,
        novelManager: deps.novelManager,
      });
      res.json({ success: true });
    } catch (err) {
      const message = safeErrorMessage(err, '删除立绘失败');
      res.status(500).json({ error: message });
    }
  });
}
