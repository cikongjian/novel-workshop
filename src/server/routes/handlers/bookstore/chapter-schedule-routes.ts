import type { Request, Response, Router } from 'express';
import {
  BatchPublishChaptersRequestSchema,
  BatchScheduleChaptersRequestSchema,
  ScheduleChapterPublishRequestSchema,
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

export function registerBookstoreChapterScheduleRoutes(
  router: Router,
  {
    bookStoreManager,
    novelManager,
    authDb,
    complianceEventManager,
  }: BookstoreChapterRouteDeps,
): void {
  router.post('/:id/chapters/:chapterNumber/schedule', async (req: Request, res: Response) => {
    try {
      await ensureRealNameVerified(authDb, req.auth, 'bookPublishing');
      const chapterNumber = parsePositiveIntegerParam(req, 'chapterNumber');
      if (!chapterNumber) {
        return res.status(400).json({ error: '章节号无效' });
      }

      const request = ScheduleChapterPublishRequestSchema.parse(req.body);
      const scheduledAt = new Date(request.scheduledAt);
      if (scheduledAt.getTime() <= Date.now()) {
        return res.status(400).json({ error: '定时发布时间必须晚于当前时间' });
      }

      const ownedBook = await loadOwnedBook(req, res, bookStoreManager, { requireApproved: true });
      if (!ownedBook) return;

      const { bookId, book } = ownedBook;
      const existingEntry = (await bookStoreManager.getPublishedChapters(bookId)).find(
        (entry) => entry.chapterNumber === chapterNumber,
      );
      if (existingEntry?.status === 'published' || existingEntry?.status === 'pending_audit') {
        return res.status(400).json({ error: '当前章节已在发布流程中，无需重复定时' });
      }

      const chapter = await novelManager.getChapter(book.novelId, chapterNumber);
      if (!chapter) {
        return res.status(404).json({ error: `第 ${chapterNumber} 章不存在` });
      }

      const contentHash = BookStoreManager.hashContent(chapter.content ?? '');
      await bookStoreManager.scheduleChapterPublication(bookId, chapterNumber, contentHash, scheduledAt);
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'publishing',
        eventType: 'chapter_schedule',
        status: 'success',
        actorUserId: req.auth?.id ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'chapter',
        targetId: `${book.novelId}:${chapterNumber}`,
        targetLabel: chapter.title || `第${chapterNumber}章`,
        detail: {
          bookId,
          novelId: book.novelId,
          chapterNumber,
          scheduledAt: scheduledAt.toISOString(),
          contentHash,
        },
      });
      res.json({
        chapterNumber,
        status: 'scheduled',
        scheduledAt: scheduledAt.toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '定时发布章节失败') });
    }
  });

  router.post('/:id/chapters/schedule-batch', async (req: Request, res: Response) => {
    try {
      await ensureRealNameVerified(authDb, req.auth, 'bookPublishing');
      const ownedBook = await loadOwnedBook(req, res, bookStoreManager, { requireApproved: true });
      if (!ownedBook) return;

      const { bookId, book } = ownedBook;
      const request = BatchScheduleChaptersRequestSchema.parse(req.body);
      const items = request.items
        .map((item) => ({
          chapterNumber: item.chapterNumber,
          scheduledAt: new Date(item.scheduledAt),
        }))
        .sort((left, right) => left.chapterNumber - right.chapterNumber);
      const existingEntries = await bookStoreManager.getPublishedChapters(bookId);
      const existingByChapterNumber = new Map(existingEntries.map((entry) => [entry.chapterNumber, entry]));

      const results: Array<{
        chapterNumber: number;
        success: boolean;
        status?: 'scheduled';
        scheduledAt?: string;
        error?: string;
      }> = [];
      const validItems: Array<{ chapterNumber: number; contentHash: string; scheduledAt: Date }> = [];

      for (const item of items) {
        if (Number.isNaN(item.scheduledAt.getTime()) || item.scheduledAt.getTime() <= Date.now()) {
          results.push({
            chapterNumber: item.chapterNumber,
            success: false,
            error: '定时发布时间必须晚于当前时间',
          });
          continue;
        }

        const existingEntry = existingByChapterNumber.get(item.chapterNumber);
        if (existingEntry?.status === 'published' || existingEntry?.status === 'pending_audit') {
          results.push({
            chapterNumber: item.chapterNumber,
            success: false,
            error: '当前章节已发布或正在审核中',
          });
          continue;
        }

        const chapter = await novelManager.getChapter(book.novelId, item.chapterNumber);
        if (!chapter) {
          results.push({
            chapterNumber: item.chapterNumber,
            success: false,
            error: `第 ${item.chapterNumber} 章不存在`,
          });
          continue;
        }

        validItems.push({
          chapterNumber: item.chapterNumber,
          contentHash: BookStoreManager.hashContent(chapter.content ?? ''),
          scheduledAt: item.scheduledAt,
        });
      }

      if (validItems.length > 0) {
        await bookStoreManager.scheduleChaptersPublicationBatch(bookId, validItems);
        await recordComplianceEventFromRequest(req, complianceEventManager, {
          category: 'publishing',
          eventType: 'chapter_schedule_batch',
          status: 'success',
          actorUserId: req.auth?.id ?? null,
          actorUsername: req.auth?.username ?? null,
          actorRole: req.auth?.role ?? null,
          targetType: 'novel',
          targetId: book.novelId,
          targetLabel: book.title,
          detail: {
            bookId,
            items: validItems.map((item) => ({
              chapterNumber: item.chapterNumber,
              scheduledAt: item.scheduledAt.toISOString(),
            })),
            successCount: validItems.length,
            failureCount: results.filter((item) => !item.success).length,
          },
        });
        for (const item of validItems) {
          results.push({
            chapterNumber: item.chapterNumber,
            success: true,
            status: 'scheduled',
            scheduledAt: item.scheduledAt.toISOString(),
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
      res.status(500).json({ error: safeErrorMessage(err, '批量定时发布失败') });
    }
  });

  router.post('/:id/chapters/cancel-schedule-batch', async (req: Request, res: Response) => {
    try {
      const ownedBook = await loadOwnedBook(req, res, bookStoreManager);
      if (!ownedBook) return;

      const { bookId, book } = ownedBook;
      const request = BatchPublishChaptersRequestSchema.parse(req.body);
      const chapterNumbers = normalizeChapterNumbers(request.chapterNumbers);
      const existingEntries = await bookStoreManager.getPublishedChapters(bookId);
      const existingByChapterNumber = new Map(existingEntries.map((entry) => [entry.chapterNumber, entry]));

      const results: Array<{
        chapterNumber: number;
        success: boolean;
        status?: 'hidden';
        error?: string;
      }> = [];
      const validChapterNumbers: number[] = [];

      for (const chapterNumber of chapterNumbers) {
        const existingEntry = existingByChapterNumber.get(chapterNumber);
        if (!existingEntry || existingEntry.status !== 'scheduled') {
          results.push({
            chapterNumber,
            success: false,
            error: '当前章节不在定时状态中',
          });
          continue;
        }
        validChapterNumbers.push(chapterNumber);
      }

      if (validChapterNumbers.length > 0) {
        await bookStoreManager.cancelScheduledChaptersBatch(bookId, validChapterNumbers);
        await recordComplianceEventFromRequest(req, complianceEventManager, {
          category: 'publishing',
          eventType: 'chapter_schedule_cancel_batch',
          status: 'success',
          actorUserId: req.auth?.id ?? null,
          actorUsername: req.auth?.username ?? null,
          actorRole: req.auth?.role ?? null,
          targetType: 'book',
          targetId: bookId,
          targetLabel: book.title,
          detail: {
            novelId: book.novelId,
            chapterNumbers: validChapterNumbers,
          },
        });
        for (const chapterNumber of validChapterNumbers) {
          results.push({
            chapterNumber,
            success: true,
            status: 'hidden',
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
      res.status(500).json({ error: safeErrorMessage(err, '批量取消定时发布失败') });
    }
  });

  router.delete('/:id/chapters/:chapterNumber/schedule', async (req: Request, res: Response) => {
    try {
      const chapterNumber = parsePositiveIntegerParam(req, 'chapterNumber');
      if (!chapterNumber) {
        return res.status(400).json({ error: '章节号无效' });
      }

      const ownedBook = await loadOwnedBook(req, res, bookStoreManager);
      if (!ownedBook) return;

      await bookStoreManager.cancelScheduledChapter(ownedBook.bookId, chapterNumber);
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'publishing',
        eventType: 'chapter_schedule_cancel',
        status: 'success',
        actorUserId: req.auth?.id ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'chapter',
        targetId: `${ownedBook.book.novelId}:${chapterNumber}`,
        targetLabel: `第${chapterNumber}章`,
        detail: {
          bookId: ownedBook.bookId,
          novelId: ownedBook.book.novelId,
          chapterNumber,
        },
      });
      res.json({ success: true, chapterNumber, status: 'hidden' });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '取消定时发布失败') });
    }
  });
}
