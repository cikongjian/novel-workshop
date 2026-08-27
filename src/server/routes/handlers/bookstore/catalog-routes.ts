import type { Router, Request, Response } from 'express';
import { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { ContentAuditService } from '../../../../bookstore/content-audit-service.js';
import { getBookstoreUserScope } from '../../../../bookstore/user-access.js';
import { NovelManager } from '../../../../novel/novel-manager.js';
import type { AuthDb } from '../../../../auth/types.js';
import { PaginationQuerySchema } from '../../../../bookstore/types.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  buildMyPublishedBookItems,
  resolveBookDetailVisibility,
  resolveBookRequestIp,
  resolveInteractiveFlag,
} from './catalog-support.js';
import { resolveBookAuthorName } from './author-name-resolver.js';
import { handleAdminBookPage } from './admin-book-page.js';
import { handleBookStoreList } from './list-handler.js';
import { enrichBookStoreItems, resolvePublishedChapterStats } from './list-support.js';
import { getRouteParam, requireBookstoreAuth } from './route-support.js';
import type { BookStoreStorefrontConfigManager } from '../../../../bookstore/storefront-config-manager.js';

type BookstoreCatalogRouteDeps = {
  bookStoreManager: BookStoreManager;
  storefrontConfigManager?: BookStoreStorefrontConfigManager;
  novelManager: NovelManager;
  contentAuditService?: ContentAuditService;
  authDb?: AuthDb;
  shouldIncrementView: (ip: string, bookId: string) => boolean;
};

export function registerBookstoreCatalogRoutes(
  router: Router,
  {
    bookStoreManager,
    storefrontConfigManager,
    novelManager,
    contentAuditService,
    authDb,
    shouldIncrementView,
  }: BookstoreCatalogRouteDeps,
): void {
  router.get('/list', async (req: Request, res: Response) => {
    await handleBookStoreList(
      req,
      res,
      bookStoreManager,
      storefrontConfigManager,
      novelManager,
      contentAuditService,
      authDb,
    );
  });

  router.get('/my/published', async (req: Request, res: Response) => {
    try {
      const books = await bookStoreManager.getUserBooks(getBookstoreUserScope(req.auth));
      const enrichedBooks = await enrichBookStoreItems(
        books,
        bookStoreManager,
        novelManager,
        contentAuditService,
        authDb,
      );
      const items = await buildMyPublishedBookItems(enrichedBooks, {
        bookStoreManager,
        novelManager,
      });
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取已发布作品失败') });
    }
  });

  router.get('/my/published-page', async (req: Request, res: Response) => {
    try {
      const query = PaginationQuerySchema.parse(req.query);
      const result = await bookStoreManager.getUserBooksPage(getBookstoreUserScope(req.auth), query);
      const items = await enrichBookStoreItems(
        result.items,
        bookStoreManager,
        novelManager,
        contentAuditService,
        authDb,
      );
      const enrichedItems = await buildMyPublishedBookItems(items, {
        bookStoreManager,
        novelManager,
      });
      res.json({ ...result, items: enrichedItems });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取已发布作品失败') });
    }
  });

  router.get('/admin/books', async (req: Request, res: Response) => {
    try {
      const auth = requireBookstoreAuth(req);
      if (auth.role !== 'admin') {
        res.status(403).json({ error: '仅管理员可访问' });
        return;
      }

      const books = await bookStoreManager.adminListBooks();
      res.json(await enrichBookStoreItems(
        books,
        bookStoreManager,
        novelManager,
        contentAuditService,
        authDb,
      ));
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取书城列表失败') });
    }
  });

  router.get('/admin/books-page', async (req: Request, res: Response) => {
    await handleAdminBookPage(
      req,
      res,
      bookStoreManager,
      novelManager,
      contentAuditService,
      authDb,
    );
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const bookId = getRouteParam(req, 'id');
      const book = await bookStoreManager.getBook(bookId);
      if (!book) {
        return res.status(404).json({ error: '作品不存在' });
      }

      // 演示环境：pending/approved 状态均可公开访问，仅 rejected 需鉴权
      if (book.publishStatus === 'rejected') {
        const isOwner = req.auth?.id && req.auth.id === book.userId;
        const isAdmin = req.auth?.role === 'admin';
        if (!isOwner && !isAdmin) {
          return res.status(404).json({ error: '作品不存在' });
        }
      }

      const ip = resolveBookRequestIp({
        forwardedFor: req.headers['x-forwarded-for'],
        remoteAddress: req.socket.remoteAddress,
      });
      if (shouldIncrementView(ip, bookId)) {
        await bookStoreManager.incrementViewCount(bookId);
      }

      const detailStats = await resolvePublishedChapterStats(
        book,
        bookStoreManager,
        novelManager,
        contentAuditService,
      );

      res.json({
        ...resolveBookDetailVisibility(book, req.auth),
        authorName: await resolveBookAuthorName(book, authDb),
        chapterCount: detailStats.chapterCount,
        wordCount: detailStats.wordCount,
        publishedChapterCount: detailStats.chapterCount,
        publishedWordCount: detailStats.wordCount,
        interactive: await resolveInteractiveFlag(novelManager, book.novelId),
      });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取作品详情失败') });
    }
  });
}
