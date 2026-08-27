import type { Request, Response, Router } from 'express';
import {
  BatchPublishChaptersRequestSchema,
} from '../../../../bookstore/types.js';
import { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import { recordComplianceEventFromRequest } from '../../../../compliance/compliance-event-support.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { ensureRealNameVerified } from '../../helpers/real-name.js';
import { parsePositiveIntegerParam } from './route-support.js';
import {
  loadOwnedBook,
  normalizeChapterNumbers,
  type BookstoreChapterRouteDeps,
} from './chapter-route-support.js';

export function registerBookstoreChapterPublishRoutes(
  router: Router,
  {
    bookStoreManager,
    auditQueueManager,
    novelManager,
    authDb,
    complianceEventManager,
  }: BookstoreChapterRouteDeps,
): void {
  router.post('/:id/chapters/:chapterNumber/publish', async (req: Request, res: Response) => {
    try {
      await ensureRealNameVerified(authDb, req.auth, 'bookPublishing');
      const chapterNumber = parsePositiveIntegerParam(req, 'chapterNumber');
      if (!chapterNumber) {
        return res.status(400).json({ error: '章节号无效' });
      }

      const ownedBook = await loadOwnedBook(req, res, bookStoreManager, { requireApproved: true });
      if (!ownedBook) return;

      const { bookId, book } = ownedBook;
      const existingEntry = (await bookStoreManager.getPublishedChapters(bookId)).find(
        (entry) => entry.chapterNumber === chapterNumber,
      );
      if (existingEntry?.status === 'published' || existingEntry?.status === 'pending_audit') {
        return res.status(400).json({ error: '当前章节已在发布流程中，无需重复发布' });
      }

      const chapter = await novelManager.getChapter(book.novelId, chapterNumber);
      if (!chapter) {
        return res.status(404).json({ error: `第 ${chapterNumber} 章不存在` });
      }

      const contentHash = BookStoreManager.hashContent(chapter.content ?? '');
      await bookStoreManager.submitChapterForAudit(bookId, chapterNumber, contentHash, {
        wordCount: chapter.wordCount,
        title: chapter.title,
      });
      // 演示模式：跳过审计，直接标记为已发布
      await bookStoreManager.markChapterPublished(bookId, chapterNumber);

      res.json({
        chapterNumber,
        status: 'published',
      });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '发布章节失败') });
    }
  });

  router.post('/:id/chapters/publish-batch', async (req: Request, res: Response) => {
    try {
      await ensureRealNameVerified(authDb, req.auth, 'bookPublishing');
      const ownedBook = await loadOwnedBook(req, res, bookStoreManager, { requireApproved: true });
      if (!ownedBook) return;

      const { bookId, book } = ownedBook;
      const request = BatchPublishChaptersRequestSchema.parse(req.body);
      const chapterNumbers = normalizeChapterNumbers(request.chapterNumbers);
      const existingEntries = await bookStoreManager.getPublishedChapters(bookId);
      const existingByChapterNumber = new Map(existingEntries.map((entry) => [entry.chapterNumber, entry]));

      const results: Array<{
        chapterNumber: number;
        success: boolean;
        error?: string;
      }> = [];
      const validItems: Array<{ chapterNumber: number; contentHash: string }> = [];

      for (const chapterNumber of chapterNumbers) {
        const existingEntry = existingByChapterNumber.get(chapterNumber);
        if (existingEntry?.status === 'published' || existingEntry?.status === 'pending_audit') {
          results.push({
            chapterNumber,
            success: false,
            error: '当前章节已发布或正在审核中',
          });
          continue;
        }

        const chapter = await novelManager.getChapter(book.novelId, chapterNumber);
        if (!chapter) {
          results.push({
            chapterNumber,
            success: false,
            error: `第 ${chapterNumber} 章不存在`,
          });
          continue;
        }

        validItems.push({
          chapterNumber,
          contentHash: BookStoreManager.hashContent(chapter.content ?? ''),
        });
      }

      if (validItems.length > 0) {
        await bookStoreManager.submitChaptersForAuditBatch(bookId, validItems);
        // 演示模式：跳过审计，直接标记为已发布
        for (const item of validItems) {
          await bookStoreManager.markChapterPublished(bookId, item.chapterNumber);
          results.push({
            chapterNumber: item.chapterNumber,
            success: true,
          });
        }
      }

      const successCount = results.filter((item) => item.success).length;
      res.json({
        successCount,
        failureCount: results.length - successCount,
        results,
      });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '批量发布章节失败') });
    }
  });
}
