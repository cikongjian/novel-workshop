import type { Router } from 'express';
import type { GenerateDeps } from './types.js';
import { resolveUserModelAccess } from '../helpers/user-api-model-resolver.js';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import {
  buildAuthorNoteContext,
  generateAuthorNote,
  persistAuthorNote,
  persistAuthorNoteDeletion,
  resolveAuthorNoteDeletion,
} from './author-note-support.js';

export function registerAuthorNoteRoutes(router: Router, deps: GenerateDeps): void {
  const { novelManager, modelClient, broadcast, agents, authDb } = deps;

  // POST /api/generate/author-note — 为指定章节生成"作者有话说"
  router.post('/author-note', async (req, res) => {
    try {
      const { novelId, chapterNumber, userDirection } = req.body;
      if (!novelId || !chapterNumber) {
        res.status(400).json({ error: '缺少 novelId 或 chapterNumber' });
        return;
      }

      const agent = agents?.get('author-note-writer');
      if (!agent) {
        res.status(500).json({ error: 'author-note-writer Agent 未注册' });
        return;
      }

      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const modelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }
      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter?.content) {
        res.status(404).json({ error: `第 ${chapterNumber} 章不存在或无内容` });
        return;
      }

      let nextChapterHint = '';
      try {
        const outline = await novelManager.getOutline(novelId);
        const nextOl = outline.chapters?.find(
          (ch: { chapterNumber: number }) => ch.chapterNumber === chapterNumber + 1,
        );
        if (nextOl?.summary) {
          nextChapterHint = nextOl.summary;
        }
      } catch { /* 无下章提示不影响生成 */ }

      const context = buildAuthorNoteContext({
        novel,
        chapter,
        chapterNumber,
        nextOutlineSummary: nextChapterHint,
        userDirection,
      });
      const authorNote = await generateAuthorNote({
        agent,
        client: modelAccess.client ?? modelClient,
        context,
        novelId,
        chapterNumber,
        broadcast,
      });
      const updatedNotes = await persistAuthorNote({ novelManager, novelId, chapter, authorNote });

      res.json({ authorNote, authorNotes: updatedNotes, chapterNumber });
    } catch (err: unknown) {
      const message = safeErrorMessage(err, '作者有话说生成失败');
      res.status(500).json({ error: message });
    }
  });

  // DELETE /api/generate/author-note/:novelId/:chapterNumber — 删除作者有话说
  // query: ?index=N 删除第 N 条；不传 index 则清空全部
  router.delete('/author-note/:novelId/:chapterNumber', async (req, res) => {
    try {
      const { novelId } = req.params;
      const chapterNumber = Number(req.params.chapterNumber);
      if (!novelId || Number.isNaN(chapterNumber)) {
        res.status(400).json({ error: '参数错误' });
        return;
      }

      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: `第 ${chapterNumber} 章不存在` });
        return;
      }

      const indexParam = req.query.index;
      const deletion = resolveAuthorNoteDeletion({
        existingNotes: chapter.authorNotes,
        index: indexParam != null ? Number(indexParam) : undefined,
      });
      if (deletion.error) {
        res.status(400).json({ error: deletion.error });
        return;
      }
      await persistAuthorNoteDeletion({
        novelManager,
        novelId,
        chapter,
        updatedNotes: deletion.updatedNotes,
      });

      res.json({ success: true, authorNotes: deletion.updatedNotes });
    } catch (err: unknown) {
      const message = safeErrorMessage(err, '删除作者有话说失败');
      res.status(500).json({ error: message });
    }
  });
}
