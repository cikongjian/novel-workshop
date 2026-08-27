import fs from 'node:fs/promises';
import type { Router, Request, Response } from 'express';
import { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { ContentAuditService } from '../../../../bookstore/content-audit-service.js';
import { getBookstoreUserScope } from '../../../../bookstore/user-access.js';
import { NovelManager } from '../../../../novel/novel-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { buildBookStoreManageChapterPage } from './chapter-management-data.js';
import {
  getPublicReaderChapterContent,
  listPublicReaderChapterPage,
  listPublicReaderChapters,
} from './public-reader-data.js';
import {
  readPublishedComicManifest,
  resolvePublishedComicPanelFile,
} from './public-comic-data.js';
import { getRouteParam, parsePositiveIntegerParam } from './route-support.js';

type BookstoreChapterAccessRouteDeps = {
  bookStoreManager: BookStoreManager;
  novelManager: NovelManager;
  contentAuditService?: ContentAuditService;
};

async function loadOwnedBook(
  req: Request,
  res: Response,
  bookStoreManager: BookStoreManager,
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

  return { bookId, book };
}

export function registerBookstoreChapterAccessRoutes(
  router: Router,
  {
    bookStoreManager,
    novelManager,
    contentAuditService,
  }: BookstoreChapterAccessRouteDeps,
): void {
  router.get('/:id/manage/chapters', async (req: Request, res: Response) => {
    try {
      const ownedBook = await loadOwnedBook(req, res, bookStoreManager);
      if (!ownedBook) return;

      const { bookId, book } = ownedBook;
      const page = Number.parseInt(String(req.query.page ?? '1'), 10);
      const pageSize = Number.parseInt(String(req.query.pageSize ?? '100'), 10);
      res.json(await buildBookStoreManageChapterPage(
        bookId,
        book,
        {
          bookStoreManager,
          novelManager,
        },
        { page, pageSize },
      ));
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取章节管理列表失败') });
    }
  });

  router.get('/:id/chapters', async (_req: Request, res: Response) => {
    res.status(410).json({
      error: '该章节发布状态接口已废弃，请改用 /api/bookstore/:id/manage/chapters 或公开阅读接口。',
      code: 'BOOKSTORE_CHAPTERS_DEPRECATED',
    });
  });

  router.get('/:id/reader/chapters', async (req: Request, res: Response) => {
    try {
      const bookId = getRouteParam(req, 'id');
      const book = await bookStoreManager.getBook(bookId);
      if (!book || book.publishStatus !== 'approved') {
        return res.status(404).json({ error: '作品不存在' });
      }

      const visibleChapters = await listPublicReaderChapters({
        bookId,
        novelId: book.novelId,
        bookStoreManager,
        novelManager,
        contentAuditService,
      });

      res.json(visibleChapters.map(({ content: _content, source: _source, ...chapter }) => chapter));
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取公开章节列表失败') });
    }
  });

  router.get('/:id/reader/chapter-page', async (req: Request, res: Response) => {
    try {
      const bookId = getRouteParam(req, 'id');
      const book = await bookStoreManager.getBook(bookId);
      if (!book || book.publishStatus !== 'approved') {
        return res.status(404).json({ error: '作品不存在' });
      }

      const page = Number.parseInt(String(req.query.page ?? '1'), 10);
      const pageSize = Number.parseInt(String(req.query.pageSize ?? '80'), 10);
      const order = req.query.order === 'desc' ? 'desc' : 'asc';
      const result = await listPublicReaderChapterPage({
        bookId,
        novelId: book.novelId,
        bookStoreManager,
        novelManager,
        contentAuditService,
        page,
        pageSize,
        order,
      });

      res.json({
        ...result,
        items: result.items.map(({ content: _content, source: _source, ...chapter }) => chapter),
      });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取公开章节分页失败') });
    }
  });

  router.get('/:id/reader/comics/:chapterNumber', async (req: Request, res: Response) => {
    try {
      const bookId = getRouteParam(req, 'id');
      const chapterNumber = parsePositiveIntegerParam(req, 'chapterNumber');
      if (!chapterNumber) {
        return res.status(400).json({ error: '章节号无效' });
      }

      const book = await bookStoreManager.getBook(bookId);
      if (!book || book.publishStatus !== 'approved') {
        return res.status(404).json({ error: '作品不存在' });
      }

      const manifest = await readPublishedComicManifest({
        bookId,
        novelId: book.novelId,
        chapterNumber,
        bookStoreManager,
      });
      if (!manifest) {
        return res.status(404).json({ error: '本章暂无公开漫画' });
      }

      res.json(manifest);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取公开漫画失败') });
    }
  });

  router.get('/:id/reader/comics/:chapterNumber/panels/:file', async (req: Request, res: Response) => {
    try {
      const bookId = getRouteParam(req, 'id');
      const chapterNumber = parsePositiveIntegerParam(req, 'chapterNumber');
      const file = String(req.params.file ?? '');
      if (!chapterNumber) {
        return res.status(400).json({ error: '章节号无效' });
      }

      const book = await bookStoreManager.getBook(bookId);
      if (!book || book.publishStatus !== 'approved') {
        return res.status(404).json({ error: '作品不存在' });
      }

      const panelFile = await resolvePublishedComicPanelFile({
        bookId,
        novelId: book.novelId,
        chapterNumber,
        bookStoreManager,
        file,
      });
      if (!panelFile) {
        return res.status(404).json({ error: '漫画图片不存在' });
      }

      const bytes = await fs.readFile(panelFile.filePath);
      res.setHeader('Content-Type', panelFile.mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.end(bytes);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '读取公开漫画图片失败') });
    }
  });

  router.get('/:id/reader/chapters/:chapterNumber', async (req: Request, res: Response) => {
    try {
      const bookId = getRouteParam(req, 'id');
      const chapterNumber = parsePositiveIntegerParam(req, 'chapterNumber');
      if (!chapterNumber) {
        return res.status(400).json({ error: '章节号无效' });
      }

      const book = await bookStoreManager.getBook(bookId);
      if (!book || book.publishStatus !== 'approved') {
        return res.status(404).json({ error: '作品不存在' });
      }

      const publishedEntries = await bookStoreManager.getPublishedChapters(bookId);
      const hasAnyPublished = publishedEntries.some((entry) => entry.status === 'published');
      const isPublished = publishedEntries.some(
        (entry) => entry.chapterNumber === chapterNumber && entry.status === 'published',
      );
      if (hasAnyPublished && !isPublished) {
        return res.status(403).json({ error: '此章节尚未发布' });
      }

      const chapter = await getPublicReaderChapterContent({
        bookId,
        novelId: book.novelId,
        chapterNumber,
        bookStoreManager,
        novelManager,
        contentAuditService,
      });
      if (!chapter) {
        return res.status(404).json({ error: `第 ${chapterNumber} 章不存在` });
      }

      res.json({
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        content: chapter.content ?? '',
        wordCount: chapter.wordCount ?? 0,
        updatedAt: chapter.updatedAt,
        source: chapter.source,
      });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取章节内容失败') });
    }
  });
}
