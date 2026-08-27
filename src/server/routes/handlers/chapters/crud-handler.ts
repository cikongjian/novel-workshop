import type { Router } from 'express';
import { z } from 'zod';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { StoryStateManager } from '../../../../novel/story-state-manager.js';
import { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { WriterStatsService } from '../../../../services/writer-stats-service.js';
import type { VoteService } from '../../../../services/vote-service.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  isNotFoundLikeError,
  parseChapterNumberParam,
  prepareChapterForSave,
  removeDeletedChapterArtifacts,
  syncPublishedChapterVisibility,
  triggerMissingSpeakerIndexing,
} from './crud-support.js';

/** 更新章节请求体 schema */
export const UpdateChapterBody = z.object({
  content: z.string().optional(),
  title: z.string().optional(),
  status: z.enum(['outlined', 'drafted', 'edited', 'reviewed', 'finalized']).optional(),
});

/** 交换章节顺序请求体 schema */
export const SwapChaptersBody = z.object({
  chapterA: z.number().int().positive(),
  chapterB: z.number().int().positive(),
});

const ChapterListQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export interface ChapterCrudDeps {
  novelManager: NovelManager;
  /** 可选：用于章节保存时自动隐藏已发布但内容已变更的章节 */
  bookStoreManager?: BookStoreManager;
  novelMemory?: NovelMemory;
  storyStateManager?: StoryStateManager;
  writerStatsService?: WriterStatsService;
  voteService?: VoteService;
}

export function registerCrudRoutes(router: Router, deps: ChapterCrudDeps): void {
  const { novelManager, bookStoreManager, novelMemory, storyStateManager, writerStatsService, voteService } = deps;

  // 获取章节列表
  router.get('/', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const query = ChapterListQuery.safeParse(req.query);
      if (!query.success) {
        res.status(400).json({ error: query.error.issues[0].message });
        return;
      }
      if (query.data.page || query.data.pageSize) {
        const page = query.data.page ?? 1;
        const pageSize = query.data.pageSize ?? 50;
        const chapters = await novelManager.listChapterPage(novelId, {
          page,
          pageSize,
          order: query.data.order ?? 'asc',
        });
        res.json(chapters);
        return;
      }
      const chapters = await novelManager.listChapters(novelId);
      res.json(chapters);
    } catch (err) {
      const message = safeErrorMessage(err, '获取章节列表失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  // 获取单个章节
  router.get('/:num', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsedChapterNumber = parseChapterNumberParam(req.params.num);
      if (parsedChapterNumber.error || parsedChapterNumber.chapterNumber == null) {
        res.status(400).json({ error: parsedChapterNumber.error });
        return;
      }
      const chapter = await novelManager.getChapter(novelId, parsedChapterNumber.chapterNumber);
      if (!chapter) {
        res.status(404).json({ error: `第 ${parsedChapterNumber.chapterNumber} 章不存在` });
        return;
      }
      res.json(chapter);
    } catch (err) {
      const message = safeErrorMessage(err, '获取章节失败');
      if (isNotFoundLikeError(message)) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  // 更新章节（用户手动保存内容时自动设为草稿状态）
  router.put('/:num', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsedChapterNumber = parseChapterNumberParam(req.params.num);
      if (parsedChapterNumber.error || parsedChapterNumber.chapterNumber == null) {
        res.status(400).json({ error: parsedChapterNumber.error });
        return;
      }

      const parsed = UpdateChapterBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      const existingChapter = await novelManager.getChapter(novelId, parsedChapterNumber.chapterNumber);
      const oldWordCount = existingChapter?.wordCount ?? 0;

      const {
        chapter,
        contentChanged,
        titleChanged,
      } = await prepareChapterForSave({
        novelManager,
        novelId,
        chapterNumber: parsedChapterNumber.chapterNumber,
        data: parsed.data,
      });

      await novelManager.saveChapter(novelId, chapter);
      await novelManager.syncNovelMetadataDebounced(novelId);

      triggerMissingSpeakerIndexing({
        novelManager,
        novelId,
        chapterNumber: parsedChapterNumber.chapterNumber,
        chapterContent: chapter.content,
      });
      await syncPublishedChapterVisibility({
        bookStoreManager,
        novelId,
        chapterNumber: parsedChapterNumber.chapterNumber,
        chapterContent: chapter.content,
        contentChanged,
        titleChanged,
        hashContent: BookStoreManager.hashContent,
      });

      if (contentChanged && writerStatsService) {
        const userId = (req as { auth?: { id?: string } }).auth?.id;
        if (userId) {
          const addedWords = chapter.wordCount - oldWordCount;
          if (addedWords > 0) {
            writerStatsService.recordWords(userId, addedWords, 1);
          }
        }
      }

      res.json(chapter);
    } catch (err) {
      const message = safeErrorMessage(err, '更新章节失败');
      if (isNotFoundLikeError(message)) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  // 删除章节
  router.delete('/:num', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsedChapterNumber = parseChapterNumberParam(req.params.num);
      if (parsedChapterNumber.error || parsedChapterNumber.chapterNumber == null) {
        res.status(400).json({ error: parsedChapterNumber.error });
        return;
      }

      await novelManager.deleteChapter(novelId, parsedChapterNumber.chapterNumber);
      await removeDeletedChapterArtifacts({
        novelManager,
        storyStateManager,
        novelMemory,
        voteService,
        novelId,
        chapterNumber: parsedChapterNumber.chapterNumber,
      });
      await novelManager.syncNovelMetadataDebounced(novelId);
      res.json({ success: true });
    } catch (err) {
      const message = safeErrorMessage(err, '删除章节失败');
      if (isNotFoundLikeError(message)) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });

  // 交换两个章节的顺序
  router.post('/swap', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const parsed = SwapChaptersBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }

      await novelManager.swapChapters(novelId, parsed.data.chapterA, parsed.data.chapterB);
      await novelManager.syncNovelMetadataDebounced(novelId);
      const chapters = await novelManager.listChapters(novelId);
      res.json(chapters);
    } catch (err) {
      const message = safeErrorMessage(err, '交换章节顺序失败');
      if (isNotFoundLikeError(message)) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });
}
