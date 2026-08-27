import type { Router } from 'express';
import {
  getQwen3TTSUrl,
  getTTSEngine,
  getTTSEngineType,
} from '../../../../tts/engine-factory.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { PreviewBody, type RequireAdminForServerTTS } from './route-support.js';

type TTSEngineRouteDeps = {
  requireAdminForServerTTS: RequireAdminForServerTTS;
};

export function registerTTSEngineRoutes(
  router: Router,
  { requireAdminForServerTTS }: TTSEngineRouteDeps,
): void {
  router.get('/voices', async (_req, res) => {
    try {
      const engine = getTTSEngine();
      const voices = await engine.getVoices();
      res.json(voices);
    } catch (err) {
      res.status(500).json({
        error: '获取声音列表失败',
        detail: safeErrorMessage(err, '获取声音列表失败'),
      });
    }
  });

  router.post('/preview', requireAdminForServerTTS, async (req, res) => {
    const parsed = PreviewBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { voice, text, rate } = parsed.data;

    try {
      const engine = getTTSEngine();
      const result = await engine.preview({ voice, text, rate });

      res.json({
        audio: result.buffer.toString('base64'),
        duration: result.duration,
      });
    } catch (err) {
      res.status(500).json({
        error: '声音预览失败',
        detail: safeErrorMessage(err, '声音预览失败'),
      });
    }
  });

  router.get('/engine-status', async (_req, res) => {
    try {
      const engineType = getTTSEngineType();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      let available = engineType === 'edge-tts';

      if (engineType !== 'edge-tts') {
        try {
          const engine = getTTSEngine();
          available = await engine.isAvailable();
        } catch {
          // no-op
        }
      }

      res.json({
        engine: engineType,
        available,
        qwen3Url: engineType === 'qwen3-tts' ? getQwen3TTSUrl() : undefined,
      });
    } catch (err) {
      res.status(500).json({
        error: '获取引擎状态失败',
        detail: safeErrorMessage(err, '获取引擎状态失败'),
      });
    }
  });
}
