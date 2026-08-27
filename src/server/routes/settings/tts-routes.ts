import type { Router } from 'express';
import { z } from 'zod';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { kokoroServiceManager } from '../../../tts/kokoro-service-manager.js';
import { qwen3TTSServiceManager } from '../../../tts/qwen3-service-manager.js';
import { validateServiceUrl } from './service-url.js';

const Qwen3ServiceActionBody = z.object({
  url: z.string().optional(),
});

const KokoroServiceActionBody = z.object({
  url: z.string().optional(),
});

export function registerTtsServiceRoutes(router: Router): void {
  router.use((req, res, next) => {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ error: 'Admin permission required' });
      return;
    }
    next();
  });

  router.post('/test-qwen3-tts', async (req, res) => {
    try {
      const { url } = req.body as { url: string };
      const targetUrl = validateServiceUrl(url, 'http://127.0.0.1:8765');
      if (!targetUrl) {
        res.status(400).json({ success: false, error: '不合法的服务地址，仅允许本地/内网地址' });
        return;
      }

      const startTime = Date.now();
      const resp = await fetch(`${targetUrl}/health`, {
        signal: AbortSignal.timeout(10000),
      });
      const elapsed = Date.now() - startTime;

      if (!resp.ok) {
        res.json({
          success: false,
          error: `HTTP ${resp.status}: ${resp.statusText}`,
          elapsed,
        });
        return;
      }

      const data = await resp.json() as {
        status: string;
        model_06b_loaded: boolean;
        model_17b_loaded: boolean;
        gpu?: { name: string; memory_total_mb: number; memory_allocated_mb: number };
      };

      res.json({
        success: data.status === 'ok',
        model06bLoaded: data.model_06b_loaded,
        model17bLoaded: data.model_17b_loaded,
        gpu: data.gpu,
        elapsed,
      });
    } catch (err) {
      res.status(200).json({ success: false, error: safeErrorMessage(err, 'Qwen3-TTS 连接测试失败') });
    }
  });

  router.get('/qwen3-tts-service', async (req, res) => {
    try {
      const url = typeof req.query.url === 'string' ? validateServiceUrl(req.query.url, 'http://127.0.0.1:8765') : undefined;
      if (req.query.url && !url) {
        res.status(400).json({ error: '不合法的服务地址' });
        return;
      }
      const status = await qwen3TTSServiceManager.getStatus(url ?? undefined);
      res.json(status);
    } catch (err) {
      res.status(500).json({
        error: 'Failed to get Qwen3-TTS service status',
        detail: safeErrorMessage(err, '获取 Qwen3-TTS 服务状态失败'),
      });
    }
  });

  router.post('/qwen3-tts-service/start', async (req, res) => {
    const parsed = Qwen3ServiceActionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const result = await qwen3TTSServiceManager.start(parsed.data.url);
      res.status(result.success ? 200 : 409).json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        changed: false,
        message: '启动 Qwen3-TTS 服务失败',
        detail: safeErrorMessage(err, '启动 Qwen3-TTS 服务失败'),
      });
    }
  });

  router.post('/qwen3-tts-service/restart', async (req, res) => {
    const parsed = Qwen3ServiceActionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const result = await qwen3TTSServiceManager.restart(parsed.data.url);
      res.status(result.success ? 200 : 409).json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        changed: false,
        message: '重启 Qwen3-TTS 服务失败',
        detail: safeErrorMessage(err, '重启 Qwen3-TTS 服务失败'),
      });
    }
  });

  router.post('/qwen3-tts-service/stop', async (req, res) => {
    const parsed = Qwen3ServiceActionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const result = await qwen3TTSServiceManager.stop(parsed.data.url);
      res.status(result.success ? 200 : 409).json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        changed: false,
        message: '停止 Qwen3-TTS 服务失败',
        detail: safeErrorMessage(err, '停止 Qwen3-TTS 服务失败'),
      });
    }
  });

  router.post('/test-kokoro', async (req, res) => {
    const { url } = req.body as { url?: string };
    const baseUrl = validateServiceUrl(url, 'http://127.0.0.1:8767');
    if (!baseUrl) {
      res.status(400).json({ success: false, error: '不合法的服务地址，仅允许本地/内网地址' });
      return;
    }
    try {
      const t0 = Date.now();
      const resp = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
      const elapsed = Date.now() - t0;
      const data = await resp.json() as {
        status: string;
        model?: string;
        device?: string;
        default_voice?: string;
        voices_loaded?: string[];
      };
      res.json({
        success: data.status === 'ok',
        model: data.model,
        device: data.device,
        defaultVoice: data.default_voice,
        voicesLoaded: data.voices_loaded,
        elapsed,
      });
    } catch (err) {
      res.status(200).json({ success: false, error: safeErrorMessage(err, 'Kokoro 连接测试失败') });
    }
  });

  router.get('/kokoro-service', async (req, res) => {
    try {
      const url = typeof req.query.url === 'string' ? validateServiceUrl(req.query.url, 'http://127.0.0.1:8767') : undefined;
      if (req.query.url && !url) {
        res.status(400).json({ error: '不合法的服务地址' });
        return;
      }
      const status = await kokoroServiceManager.getStatus(url ?? undefined);
      res.json(status);
    } catch (err) {
      res.status(500).json({
        error: 'Failed to get Kokoro service status',
        detail: safeErrorMessage(err, '获取 Kokoro 服务状态失败'),
      });
    }
  });

  router.post('/kokoro-service/start', async (req, res) => {
    const parsed = KokoroServiceActionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const result = await kokoroServiceManager.start(parsed.data.url);
      res.status(result.success ? 200 : 409).json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        changed: false,
        message: '启动 Kokoro 服务失败',
        detail: safeErrorMessage(err, '启动 Kokoro 服务失败'),
      });
    }
  });

  router.post('/kokoro-service/restart', async (req, res) => {
    const parsed = KokoroServiceActionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const result = await kokoroServiceManager.restart(parsed.data.url);
      res.status(result.success ? 200 : 409).json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        changed: false,
        message: '重启 Kokoro 服务失败',
        detail: safeErrorMessage(err, '重启 Kokoro 服务失败'),
      });
    }
  });

  router.post('/kokoro-service/stop', async (req, res) => {
    const parsed = KokoroServiceActionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    try {
      const result = await kokoroServiceManager.stop(parsed.data.url);
      res.status(result.success ? 200 : 409).json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        changed: false,
        message: '停止 Kokoro 服务失败',
        detail: safeErrorMessage(err, '停止 Kokoro 服务失败'),
      });
    }
  });
}
