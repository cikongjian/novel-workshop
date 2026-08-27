import type { Router } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  clearChapterCache,
  clearChapterCacheFile,
  synthesizeChapterStream,
} from '../../../../tts/tts-service.js';
import type { EnsureNovelAccess, RequireAdminForServerTTS } from './route-support.js';
import { logger } from './route-support.js';

type TTSSynthesisRouteDeps = {
  ensureNovelAccess: EnsureNovelAccess;
  novelManager: NovelManager;
  requireAdminForServerTTS: RequireAdminForServerTTS;
};

export function registerTTSSynthesisRoutes(
  router: Router,
  { novelManager, requireAdminForServerTTS }: TTSSynthesisRouteDeps,
): void {
  router.get('/:novelId/:chapterNumber', requireAdminForServerTTS, async (req, res) => {
    const novelId = String(req.params.novelId);
    const chapterStr = String(req.params.chapterNumber);
    const chapterNumber = parseInt(chapterStr, 10);

    if (isNaN(chapterNumber)) {
      res.status(400).json({ error: '无效的章节号' });
      return;
    }

    try {
      const [novel, chapter, characters] = await Promise.all([
        novelManager.getNovel(novelId),
        novelManager.getChapter(novelId, chapterNumber),
        novelManager.getCharacters(novelId),
      ]);

      if (!chapter) {
        res.status(404).json({ error: `第 ${chapterNumber} 章不存在` });
        return;
      }

      if (!chapter.content.trim()) {
        res.status(400).json({ error: '章节内容为空，无法合成语音' });
        return;
      }

      let rate: string | undefined;
      if (typeof req.query.rate === 'string') {
        rate = req.query.rate;
      } else if (Array.isArray(req.query.rate)) {
        const firstRate = req.query.rate[0];
        rate = typeof firstRate === 'string' ? firstRate : undefined;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      logger.info('开始流式合成', { novelId, chapterNumber, contentLength: chapter.content.length });

      const charRefs = characters.map(character => ({
        id: character.id,
        name: character.name,
        aliases: character.aliases,
        gender: character.gender,
        age: character.age,
        speechStyle: character.speechStyle,
        appearance: character.appearance,
        personality: character.personality,
        backstory: character.backstory,
        ttsVoice: character.ttsVoice,
        voiceClonePromptData: character.voiceClonePromptData,
        voiceInstruct: character.voiceInstruct,
      }));

      let aborted = false;
      req.on('close', () => { aborted = true; });

      for await (const event of synthesizeChapterStream(
        chapter.content,
        charRefs,
        rate,
        {
          narratorVoice: novel.edgeNarratorVoice,
          novelId,
          chapterNumber,
        },
      )) {
        if (aborted) {
          logger.info('客户端已断开，停止合成');
          break;
        }
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      if (!aborted) {
        logger.info('流式合成完成');
      }
      res.end();
    } catch (err) {
      logger.error('合成失败', { error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) {
        res.status(500).json({
          error: '语音合成失败',
          detail: safeErrorMessage(err, '语音合成失败'),
        });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: safeErrorMessage(err, '语音合成失败') })}\n\n`);
        res.end();
      }
    }
  });

  router.delete('/:novelId/:chapterNumber', requireAdminForServerTTS, async (req, res) => {
    const novelId = String(req.params.novelId);
    const chapterStr = String(req.params.chapterNumber);
    const chapterNumber = parseInt(chapterStr, 10);

    if (isNaN(chapterNumber)) {
      res.status(400).json({ error: '无效的章节号' });
      return;
    }

    try {
      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: `第 ${chapterNumber} 章不存在` });
        return;
      }

      const memoryCleared = clearChapterCache(chapter.content);
      const fileCleared = await clearChapterCacheFile(novelId, chapterNumber);

      const totalCleared = memoryCleared + fileCleared;
      logger.info('清除缓存', { novelId, chapterNumber, memoryCleared, fileCleared });
      res.json({
        cleared: totalCleared,
        message: totalCleared > 0 ? '语音缓存已清除，下次播报将重新合成' : '该章节无缓存',
      });
    } catch (err) {
      res.status(500).json({
        error: '清除缓存失败',
        detail: safeErrorMessage(err, '清除缓存失败'),
      });
    }
  });
}
