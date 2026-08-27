import type { Router } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { DEFAULT_VOICES } from '../../../../tts/voice-mapper.js';
import { clearChapterCache, clearAllChapterCacheFiles } from '../../../../tts/tts-service.js';
import { getNarrationEngine, getNarrationEngineType } from '../../../../tts/engine-factory.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  getNarrationVoiceNames,
  NarratorPreviewBody,
  NarratorVoiceBody,
  type EnsureNovelAccess,
  type RequireAdminForServerTTS,
} from './route-support.js';
import { AudiobookCatalogQuery, listAudiobookCatalog } from './audiobook-catalog.js';

type TTSCatalogRouteDeps = {
  ensureNovelAccess: EnsureNovelAccess;
  novelManager: NovelManager;
  requireAdminForServerTTS: RequireAdminForServerTTS;
};

export function registerTTSCatalogRoutes(
  router: Router,
  { ensureNovelAccess, novelManager, requireAdminForServerTTS }: TTSCatalogRouteDeps,
): void {
  router.get('/audiobook/:novelId', async (req, res) => {
    const novelId = String(req.params.novelId);
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }
    try {
      const query = AudiobookCatalogQuery.safeParse(req.query);
      if (!query.success) {
        res.status(400).json({ error: query.error.issues[0].message });
        return;
      }
      const catalog = await listAudiobookCatalog(novelId, query.data);
      res.json({
        novelId,
        ...catalog,
      });
    } catch (err) {
      res.status(500).json({
        error: '获取有声读物列表失败',
        detail: safeErrorMessage(err, '获取有声读物列表失败'),
      });
    }
  });

  router.get('/narrator-voice/:novelId', async (req, res) => {
    const { novelId } = req.params;
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }
    try {
      const narrationEngineType = getNarrationEngineType();
      const [novel, voices] = await Promise.all([
        novelManager.getNovel(novelId),
        getNarrationEngine().getVoices(),
      ]);
      const voiceNames = new Set(voices.map(voice => voice.name));
      const storedVoice = novel.edgeNarratorVoice;
      const defaultVoice = voices.length > 0 ? voices[0].name : DEFAULT_VOICES.narrator;
      const resolvedVoice = storedVoice && voiceNames.has(storedVoice)
        ? storedVoice
        : defaultVoice;

      if (resolvedVoice !== storedVoice) {
        await novelManager.updateNovel(novelId, { edgeNarratorVoice: resolvedVoice });
      }

      res.json({
        novelId,
        voice: resolvedVoice,
        defaultVoice,
        voices,
        engine: narrationEngineType,
      });
    } catch (err) {
      res.status(500).json({
        error: '获取小说旁白音色配置失败',
        detail: safeErrorMessage(err, '获取小说旁白音色配置失败'),
      });
    }
  });

  router.put('/narrator-voice/:novelId', async (req, res) => {
    const parsed = NarratorVoiceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { novelId } = req.params;
    const { voice } = parsed.data;
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }

    try {
      await novelManager.getNovel(novelId);
      const voiceNames = await getNarrationVoiceNames();
      if (!voiceNames.has(voice)) {
        res.status(400).json({ error: `无效的旁白音色: ${voice}` });
        return;
      }

      await novelManager.updateNovel(novelId, { edgeNarratorVoice: voice });
      const cleared = clearChapterCache();

      res.json({
        novelId,
        voice,
        cleared,
        message: '旁白音色已更新，TTS 缓存已清空',
      });
    } catch (err) {
      res.status(500).json({
        error: '保存小说旁白音色失败',
        detail: safeErrorMessage(err, '保存小说旁白音色失败'),
      });
    }
  });

  router.post('/narrator-voice/:novelId/preview', requireAdminForServerTTS, async (req, res) => {
    const parsed = NarratorPreviewBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const novelId = String(req.params.novelId);
    const { voice, rate } = parsed.data;
    const text = (parsed.data.text ?? '').trim() || '这是旁白试听文本，用于确认当前小说的叙事音色。';
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }

    try {
      await novelManager.getNovel(novelId);
      const voiceNames = await getNarrationVoiceNames();
      if (!voiceNames.has(voice)) {
        res.status(400).json({ error: `无效的旁白音色: ${voice}` });
        return;
      }

      const result = await getNarrationEngine().preview({ voice, text, rate });
      res.json({
        voice,
        audio: result.buffer.toString('base64'),
        duration: result.duration,
      });
    } catch (err) {
      res.status(500).json({
        error: '旁白音色试听失败',
        detail: safeErrorMessage(err, '旁白音色试听失败'),
      });
    }
  });

  router.delete('/audiobook/:novelId', async (req, res) => {
    const { novelId } = req.params;
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }
    try {
      const count = await clearAllChapterCacheFiles(novelId);
      clearChapterCache();
      res.json({
        novelId,
        cleared: count,
        message: `已清空 ${count} 章的 TTS 缓存`,
      });
    } catch (err) {
      res.status(500).json({
        error: '清空 TTS 缓存失败',
        detail: safeErrorMessage(err, '清空 TTS 缓存失败'),
      });
    }
  });
}
