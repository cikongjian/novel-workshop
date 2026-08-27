import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { Scene } from '../../novel/types.js';
import { checkNovelAccess } from '../middleware/novel-access.js';

export function createScenesRouter(novelManager: NovelManager): Router {
  const router = Router({ mergeParams: true });

  function getParams(req: { params: Record<string, string> }) {
    const novelId = req.params.novelId;
    const chapterNumber = parseInt(req.params.chapterNumber, 10);
    return { novelId, chapterNumber };
  }

  router.use(async (req, res, next) => {
    const { novelId } = getParams(req as { params: Record<string, string> });
    const access = await checkNovelAccess(req, novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return;
    }
    next();
  });

  // GET / - list scenes for a chapter
  router.get('/', async (req, res, next) => {
    try {
      const { novelId, chapterNumber } = getParams(req);
      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: '章节不存在' });
        return;
      }
      res.json(chapter.scenes ?? []);
    } catch (err) {
      next(err);
    }
  });

  // GET /:sceneNumber - get single scene
  router.get('/:sceneNumber', async (req, res, next) => {
    try {
      const { novelId, chapterNumber } = getParams(req);
      const sceneNumber = parseInt(req.params.sceneNumber, 10);
      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: '章节不存在' });
        return;
      }
      const scene = (chapter.scenes ?? []).find((s) => s.sceneNumber === sceneNumber);
      if (!scene) {
        res.status(404).json({ error: '场景不存在' });
        return;
      }
      res.json(scene);
    } catch (err) {
      next(err);
    }
  });

  // PUT /:sceneNumber - update scene content/metadata
  router.put('/:sceneNumber', async (req, res, next) => {
    try {
      const { novelId, chapterNumber } = getParams(req);
      const sceneNumber = parseInt(req.params.sceneNumber, 10);
      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: '章节不存在' });
        return;
      }
      const scenes = chapter.scenes ?? [];
      const idx = scenes.findIndex((s) => s.sceneNumber === sceneNumber);
      if (idx === -1) {
        res.status(404).json({ error: '场景不存在' });
        return;
      }
      const now = new Date().toISOString();
      const { content, summary, title, notes, status, wordTarget, characters, location, tension } = req.body;
      const updated: Scene = {
        ...scenes[idx],
        ...(content !== undefined && { content }),
        ...(summary !== undefined && { summary }),
        ...(title !== undefined && { title }),
        ...(notes !== undefined && { notes }),
        ...(status !== undefined && { status }),
        ...(wordTarget !== undefined && { wordTarget }),
        ...(characters !== undefined && { characters }),
        ...(location !== undefined && { location }),
        ...(tension !== undefined && { tension }),
        updatedAt: now,
      };
      scenes[idx] = updated;
      await novelManager.saveChapter(novelId, { ...chapter, scenes, updatedAt: now });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /:sceneNumber - delete a scene
  router.delete('/:sceneNumber', async (req, res, next) => {
    try {
      const { novelId, chapterNumber } = getParams(req);
      const sceneNumber = parseInt(req.params.sceneNumber, 10);
      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: '章节不存在' });
        return;
      }
      const scenes = (chapter.scenes ?? []).filter((s) => s.sceneNumber !== sceneNumber);
      // Re-number remaining scenes
      scenes.forEach((s, i) => { s.sceneNumber = i + 1; });
      const now = new Date().toISOString();
      await novelManager.saveChapter(novelId, { ...chapter, scenes, updatedAt: now });
      res.json({ success: true, remaining: scenes.length });
    } catch (err) {
      next(err);
    }
  });

  // POST /init-from-outline - initialize scenes from chapter outline beats/keyEvents
  router.post('/init-from-outline', async (req, res, next) => {
    try {
      const { novelId, chapterNumber } = getParams(req);
      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: '章节不存在' });
        return;
      }

      const outline = await novelManager.getOutline(novelId);
      const chapterOutline = outline.chapters.find(
        (c) => c.chapterNumber === chapterNumber,
      );
      if (!chapterOutline) {
        res.status(404).json({ error: '该章节无大纲数据' });
        return;
      }

      const now = new Date().toISOString();
      const scenes: Scene[] = [];

      if (chapterOutline.beats && chapterOutline.beats.length > 0) {
        // Create one Scene per beat
        for (let i = 0; i < chapterOutline.beats.length; i++) {
          const beat = chapterOutline.beats[i];
          scenes.push({
            id: randomUUID(),
            sceneNumber: i + 1,
            title: '',
            summary: beat.summary,
            characters: beat.characters ?? [],
            location: beat.location ?? '',
            tension: beat.tension ?? 5,
            wordTarget: 0,
            wordCount: 0,
            content: '',
            status: 'planned',
            notes: beat.notes ?? '',
            createdAt: now,
            updatedAt: now,
          });
        }
      } else if (chapterOutline.keyEvents && chapterOutline.keyEvents.length > 0) {
        // Create one Scene per keyEvent
        for (let i = 0; i < chapterOutline.keyEvents.length; i++) {
          scenes.push({
            id: randomUUID(),
            sceneNumber: i + 1,
            title: '',
            summary: chapterOutline.keyEvents[i],
            characters: [],
            location: '',
            tension: 5,
            wordTarget: 0,
            wordCount: 0,
            content: '',
            status: 'planned',
            notes: '',
            createdAt: now,
            updatedAt: now,
          });
        }
      } else {
        res.status(400).json({ error: '大纲中无 beats 或 keyEvents 可用于初始化场景' });
        return;
      }

      await novelManager.saveChapter(novelId, {
        ...chapter,
        scenes,
        sceneMode: true,
        updatedAt: now,
      });

      res.json({ success: true, scenes });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
