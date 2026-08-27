import type { Request, Response } from 'express';
import { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { AuditQueueManager } from '../../../../bookstore/audit-queue.js';
import { NovelManager } from '../../../../novel/novel-manager.js';
import type { AuthDb } from '../../../../auth/types.js';
import type { ComplianceEventManager } from '../../../../compliance/compliance-event-manager.js';
import { getBookstoreUserScope } from '../../../../bookstore/user-access.js';
import { getRouteParam } from './route-support.js';

export type BookstoreChapterRouteDeps = {
  bookStoreManager: BookStoreManager;
  auditQueueManager: AuditQueueManager;
  novelManager: NovelManager;
  authDb?: AuthDb;
  complianceEventManager?: ComplianceEventManager;
};

export function normalizeChapterNumbers(chapterNumbers: number[]): number[] {
  return [...new Set(chapterNumbers)]
    .filter((chapterNumber) => Number.isInteger(chapterNumber) && chapterNumber > 0)
    .sort((left, right) => left - right);
}

export async function loadOwnedBook(
  req: Request,
  res: Response,
  bookStoreManager: BookStoreManager,
  options?: { requireApproved?: boolean },
) {
  const bookId = getRouteParam(req, 'id');
  const book = await bookStoreManager.getBook(bookId);
  if (!book) {
    res.status(404).json({ error: '作品不存在' });
    return null;
  }

  if (!getBookstoreUserScope(req.auth).includes(book.userId)) {
    res.status(403).json({ error: '无权管理此作品' });
    return null;
  }

  if (options?.requireApproved && book.publishStatus !== 'approved') {
    res.status(400).json({ error: '书城作品尚未通过初审，无法发布章节' });
    return null;
  }

  return { bookId, book };
}
