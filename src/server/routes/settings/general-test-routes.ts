import type { Router } from 'express';
import { getConfig } from '../../../config/index.js';
import { createEmailService } from '../../../email/email-service.js';
import { AnthropicClient } from '../../../models/anthropic.js';
import { OpenAICompatibleEmbeddingClient } from '../../../models/embedding.js';
import { OpenAICompatibleImageClient } from '../../../models/image-client.js';
import { OpenAICompatibleClient } from '../../../models/openai.js';
import { normalizeProviderBaseUrl } from '../../../models/provider-url.js';
import { getProviderPreset, type ModelProvider } from '../../../models/types.js';
import { resolveCompatibleApiKey } from './api-key.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { assertSafeUrl } from '../../../utils/url-safety.js';
import {
  ensureAdmin,
  ensureSettingsTestAccess,
  isApiKeyMasked,
  resolveNovelStoredApiKey,
  type GeneralSettingsRouteDeps,
} from './general-support.js';

export function registerGeneralSettingsTestRoutes(
  router: Router,
  deps: GeneralSettingsRouteDeps,
): void {
  router.post('/test-model', async (req, res) => {
    try {
      const { provider, apiKey, model, baseUrl, keyIndex, novelId } = req.body as {
        provider: ModelProvider;
        apiKey: string;
        model: string;
        baseUrl: string;
        keyIndex?: number;
        novelId?: string;
      };

      const access = await ensureSettingsTestAccess(req, res, deps.novelManager, novelId);
      if (!access.allowed) {
        return;
      }

      const cfg = getConfig();
      const savedKeys = cfg.model.apiKeys.length > 0 ? cfg.model.apiKeys : [cfg.model.apiKey];
      let incomingApiKey = apiKey;
      if (isApiKeyMasked(apiKey)) {
        if (novelId) {
          incomingApiKey = await resolveNovelStoredApiKey(novelId, 'model') || '';
        }
        if ((!incomingApiKey || isApiKeyMasked(incomingApiKey)) && access.allowGlobalFallback) {
          incomingApiKey = savedKeys[keyIndex ?? 0] ?? cfg.model.apiKey;
        }
      }

      const realApiKey = resolveCompatibleApiKey({ provider, apiKey: incomingApiKey, baseUrl });
      if (!realApiKey) {
        res.status(400).json({ success: false, error: 'API Key is empty' });
        return;
      }

      if (baseUrl) {
        try {
          assertSafeUrl(baseUrl);
        } catch {
          res.status(400).json({ success: false, error: '不允许的 baseUrl 地址' });
          return;
        }
      }

      const preset = getProviderPreset(provider);
      const resolvedBaseUrl = normalizeProviderBaseUrl(provider, baseUrl || preset?.baseUrl);
      const client = provider === 'anthropic'
        ? new AnthropicClient(realApiKey, model)
        : new OpenAICompatibleClient(provider, realApiKey, model, resolvedBaseUrl);

      const startTime = Date.now();
      const result = await client.chat(
        [{ role: 'user', content: 'Hello, please introduce yourself in one sentence.' }],
        { maxTokens: 100 },
      );
      const elapsed = Date.now() - startTime;

      res.json({
        success: true,
        reply: result.content,
        model: result.model,
        usage: result.usage,
        elapsed,
      });
    } catch (err) {
      res.status(200).json({ success: false, error: safeErrorMessage(err, '模型测试失败') });
    }
  });

  router.post('/test-embedding', async (req, res) => {
    try {
      const { provider, apiKey, model, baseUrl, keyIndex, novelId } = req.body as {
        provider: string;
        apiKey: string;
        model: string;
        baseUrl: string;
        keyIndex?: number;
        novelId?: string;
      };

      const access = await ensureSettingsTestAccess(req, res, deps.novelManager, novelId);
      if (!access.allowed) {
        return;
      }

      const cfg = getConfig();
      const savedKeys = cfg.embedding.apiKeys.length > 0 ? cfg.embedding.apiKeys : [cfg.embedding.apiKey];
      let incomingApiKey = apiKey;
      if (isApiKeyMasked(apiKey)) {
        if (novelId) {
          incomingApiKey = await resolveNovelStoredApiKey(novelId, 'embedding') || '';
        }
        if ((!incomingApiKey || isApiKeyMasked(incomingApiKey)) && access.allowGlobalFallback) {
          incomingApiKey = savedKeys[keyIndex ?? 0] ?? cfg.embedding.apiKey;
        }
      }

      const realApiKey = resolveCompatibleApiKey({ provider, apiKey: incomingApiKey, baseUrl });
      if (!realApiKey) {
        res.status(400).json({ success: false, error: 'Embedding API Key is empty' });
        return;
      }

      if (baseUrl) {
        try {
          assertSafeUrl(baseUrl);
        } catch {
          res.status(400).json({ success: false, error: '不允许的 baseUrl 地址' });
          return;
        }
      }

      const preset = getProviderPreset(provider as ModelProvider);
      const resolvedBaseUrl = normalizeProviderBaseUrl(
        provider,
        baseUrl || preset?.embeddingBaseUrl || preset?.baseUrl,
      );
      const client = new OpenAICompatibleEmbeddingClient(realApiKey, model, resolvedBaseUrl || undefined);

      const startTime = Date.now();
      const vector = await client.embedQuery(
        'This is a test string for validating embedding service connectivity.',
      );
      const elapsed = Date.now() - startTime;

      res.json({
        success: true,
        dimensions: vector.length,
        elapsed,
      });
    } catch (err) {
      res.status(200).json({ success: false, error: safeErrorMessage(err, 'Embedding 测试失败') });
    }
  });

  router.post('/test-image', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const { apiKey, model, baseUrl } = req.body as {
        apiKey: string;
        model: string;
        baseUrl: string;
      };

      if (!model?.trim()) {
        res.status(400).json({ success: false, error: 'Image model is empty' });
        return;
      }

      const cfg = getConfig();
      const incomingApiKey = apiKey.includes('****') ? cfg.image.apiKey : apiKey;
      const realApiKey = incomingApiKey.trim();
      if (!realApiKey) {
        res.status(400).json({ success: false, error: 'Image API Key is empty' });
        return;
      }

      if (baseUrl?.trim()) {
        try {
          assertSafeUrl(baseUrl.trim());
        } catch {
          res.status(400).json({ success: false, error: '不允许的 baseUrl 地址' });
          return;
        }
      }

      const client = new OpenAICompatibleImageClient(
        realApiKey,
        model.trim(),
        baseUrl?.trim() || undefined,
      );

      const startTime = Date.now();
      const result = await client.generate(
        'single character portrait, cinematic light, plain background, test shot',
        { size: '1024x1024', quality: 'low' },
      );
      const elapsed = Date.now() - startTime;

      res.json({
        success: true,
        model: model.trim(),
        elapsed,
        hasImageUrl: Boolean(result.imageUrl),
        hasBase64: Boolean(result.b64Data),
      });
    } catch (err) {
      res.status(200).json({ success: false, error: safeErrorMessage(err, '图片模型测试失败') });
    }
  });

  router.post('/test-smtp', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const { host, port, secure, user, pass, from } = req.body as {
        host: string;
        port: number;
        secure: boolean;
        user: string;
        pass: string;
        from: string;
      };

      if (!host?.trim() || !user?.trim()) {
        res.status(400).json({ success: false, error: 'SMTP 服务器和用户名不能为空' });
        return;
      }

      const realPass = (pass ?? '').includes('****') ? (process.env.SMTP_PASS || '') : pass;
      if (!realPass.trim()) {
        res.status(400).json({ success: false, error: 'SMTP 授权码不能为空' });
        return;
      }

      const emailService = createEmailService({
        host: host.trim(),
        port: Number(port) || 465,
        secure: secure !== false,
        user: user.trim(),
        pass: realPass.trim(),
        from: from?.trim() || user.trim(),
      });

      if (!emailService) {
        res.json({ success: false, error: 'SMTP 配置不完整' });
        return;
      }

      const startTime = Date.now();
      const ok = await emailService.testConnection();
      const elapsed = Date.now() - startTime;

      res.json({ success: ok, elapsed, ...(ok ? {} : { error: 'SMTP 连接验证失败，请检查配置' }) });
    } catch (err) {
      res.status(200).json({ success: false, error: safeErrorMessage(err, 'SMTP 连接测试失败') });
    }
  });

  router.post('/test-smtp-send', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const { to } = req.body as { to: string };
      if (!to?.trim()) {
        res.status(400).json({ success: false, error: '收件人邮箱不能为空' });
        return;
      }

      const host = process.env.SMTP_HOST || '';
      const user = process.env.SMTP_USER || '';
      const pass = process.env.SMTP_PASS || '';
      if (!host || !user || !pass) {
        res.json({ success: false, error: 'SMTP 尚未配置，请先保存邮件服务设置' });
        return;
      }

      const emailService = createEmailService({
        host,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (process.env.SMTP_SECURE ?? 'true') === 'true',
        user,
        pass,
        from: process.env.SMTP_FROM || user,
      });

      if (!emailService) {
        res.json({ success: false, error: 'SMTP 配置不完整' });
        return;
      }

      const startTime = Date.now();
      await emailService.sendTestEmail(to.trim());
      const elapsed = Date.now() - startTime;

      res.json({ success: true, elapsed });
    } catch (err) {
      res.status(200).json({ success: false, error: safeErrorMessage(err, '邮件发送测试失败') });
    }
  });

  // 拉取模型列表（调用服务商 /v1/models 接口）
  router.post('/list-models', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const { apiKey, baseUrl, provider } = req.body as {
        apiKey: string;
        baseUrl?: string;
        provider?: string;
      };

      let resolvedApiKey = apiKey?.trim();
      // 如果前端传的是 masked key，从全局配置获取
      if (!resolvedApiKey || resolvedApiKey.includes('****')) {
        const cfg = getConfig();
        resolvedApiKey = cfg.model.apiKey;
      }
      if (!resolvedApiKey) {
        res.status(400).json({ success: false, error: 'API Key 不能为空' });
        return;
      }

      const preset = getProviderPreset((provider as ModelProvider) ?? 'openai');
      const resolvedBaseUrl = normalizeProviderBaseUrl(
        provider ?? 'openai',
        baseUrl?.trim() || preset?.baseUrl,
      );

      if (resolvedBaseUrl) {
        try { assertSafeUrl(resolvedBaseUrl); } catch {
          res.status(400).json({ success: false, error: '不允许的 baseUrl 地址' });
          return;
        }
      }

      // 调用 /v1/models 接口
      const base = resolvedBaseUrl.replace(/\/+$/, '');
      const modelsUrl = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
      };

      let httpResponse: Response;
      try {
        httpResponse = await globalThis.fetch(modelsUrl, { method: 'GET', headers });
      } catch {
        res.json({ success: false, error: '当前 Node 版本不支持 fetch，请升级到 Node 18+' });
        return;
      }

      if (!httpResponse.ok) {
        const errText = await httpResponse.text().catch(() => '');
        res.json({ success: false, error: `服务商返回 ${httpResponse.status}: ${errText.slice(0, 200)}` });
        return;
      }

      const json = await httpResponse.json() as { data?: Array<{ id: string }> };
      const models = (json.data ?? []).map((m) => m.id).sort();

      res.json({ success: true, models });
    } catch (err) {
      res.status(200).json({ success: false, error: safeErrorMessage(err, '拉取模型列表失败') });
    }
  });
}
