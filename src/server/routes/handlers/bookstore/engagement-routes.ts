import type { Router, Request, Response } from 'express';
import { getProfile } from '../../../../auth/user-service.js';
import type { AuthDb } from '../../../../auth/types.js';
import { CreateBookCommentRequestSchema, PaginationQuerySchema } from '../../../../bookstore/types.js';
import { getBookstoreActorId, getBookstoreUserScope } from '../../../../bookstore/user-access.js';
import { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { ContentAuditService } from '../../../../bookstore/content-audit-service.js';
import { auditCommentContent, buildCommentBlockMessage } from '../../../../bookstore/comment-moderation.js';
import type { ComplianceEventManager } from '../../../../compliance/compliance-event-manager.js';
import { recordComplianceEventFromRequest } from '../../../../compliance/compliance-event-support.js';
import { safeErrorMessage, safeErrorReply } from '../../../middleware/safe-error-reply.js';
import { ensureRealNameVerified } from '../../helpers/real-name.js';
import { getRouteParam, requireBookstoreAuth } from './route-support.js';
import { getConfig } from '../../../../config/index.js';

type BookstoreEngagementRouteDeps = {
  bookStoreManager: BookStoreManager;
  contentAuditService?: ContentAuditService;
  authDb?: AuthDb;
  complianceEventManager?: ComplianceEventManager;
};

export function registerBookstoreEngagementRoutes(
  router: Router,
  { bookStoreManager, contentAuditService, authDb, complianceEventManager }: BookstoreEngagementRouteDeps,
): void {
  router.get('/my/favorites', async (req: Request, res: Response) => {
    try {
      const auth = requireBookstoreAuth(req);
      const books = await bookStoreManager.getUserFavoriteBooks(auth.id);
      res.json(books);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取收藏列表失败') });
    }
  });

  router.get('/my/favorites-page', async (req: Request, res: Response) => {
    try {
      const auth = requireBookstoreAuth(req);
      const query = PaginationQuerySchema.parse(req.query);
      const result = await bookStoreManager.getUserFavoriteBooksPage(auth.id, query);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取收藏列表失败') });
    }
  });

  router.get('/my/comments', async (req: Request, res: Response) => {
    try {
      const comments = await bookStoreManager.getUserComments(getBookstoreUserScope(req.auth));
      res.json(comments);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取我的评论失败') });
    }
  });

  router.get('/my/comments-page', async (req: Request, res: Response) => {
    try {
      const query = PaginationQuerySchema.parse(req.query);
      const result = await bookStoreManager.getUserCommentsPage(getBookstoreUserScope(req.auth), query);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取我的评论失败') });
    }
  });

  router.get('/:id/comments', async (req: Request, res: Response) => {
    try {
      const comments = await bookStoreManager.getComments(getRouteParam(req, 'id'));
      res.json(comments);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取评论列表失败') });
    }
  });

  router.get('/:id/comments-page', async (req: Request, res: Response) => {
    try {
      const query = PaginationQuerySchema.parse(req.query);
      const result = await bookStoreManager.getCommentsPage(getRouteParam(req, 'id'), query);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取评论列表失败') });
    }
  });

  router.post('/:id/like', async (req: Request, res: Response) => {
    try {
      const result = await bookStoreManager.toggleLike(getRouteParam(req, 'id'), requireBookstoreAuth(req).id);
      res.json({ success: true, ...result });
    } catch (err) {
      safeErrorReply(res, err, '点赞操作失败');
    }
  });

  router.get('/:id/like-status', async (req: Request, res: Response) => {
    try {
      if (!req.auth?.id) {
        return res.json({ liked: false });
      }

      const liked = await bookStoreManager.hasLiked(getRouteParam(req, 'id'), getBookstoreActorId(req.auth));
      res.json({ liked });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取点赞状态失败') });
    }
  });

  router.post('/:id/favorite', async (req: Request, res: Response) => {
    try {
      const result = await bookStoreManager.toggleFavorite(getRouteParam(req, 'id'), requireBookstoreAuth(req).id);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '收藏操作失败') });
    }
  });

  router.get('/:id/favorite-status', async (req: Request, res: Response) => {
    try {
      if (!req.auth?.id) {
        return res.json({ favorited: false });
      }

      const favorited = await bookStoreManager.hasFavorited(getRouteParam(req, 'id'), req.auth.id);
      res.json({ favorited });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '获取收藏状态失败') });
    }
  });

  router.post('/:id/comments', async (req: Request, res: Response) => {
    try {
      if (!getConfig().commentEnabled) {
        return res.status(403).json({ error: '评论功能当前已关闭', code: 'COMMENT_DISABLED' });
      }
      const bookId = getRouteParam(req, 'id');
      const auth = requireBookstoreAuth(req);
      await ensureRealNameVerified(authDb, auth, 'comment');
      const request = CreateBookCommentRequestSchema.parse(req.body);
      const book = await bookStoreManager.getBook(bookId);
      const auditResult = await auditCommentContent({
        content: request.content,
        contentAuditService,
        novelId: book?.novelId,
      });
      if (auditResult.suggestion !== 'pass') {
        await recordComplianceEventFromRequest(req, complianceEventManager, {
          category: 'interaction',
          eventType: 'comment_reject',
          status: 'rejected',
          actorUserId: auth.id,
          actorUsername: auth.username,
          actorRole: auth.role,
          targetType: 'book',
          targetId: bookId,
          targetLabel: book?.title ?? bookId,
          detail: {
            novelId: book?.novelId ?? null,
            overallScore: auditResult.overallScore,
            violationTypes: auditResult.violations.map((item) => item.type),
            commentPreview: request.content.slice(0, 60),
          },
        });
        return res.status(400).json({
          error: buildCommentBlockMessage(auditResult),
          code: 'COMMENT_CONTENT_BLOCKED',
        });
      }
      const profile = authDb ? await getProfile(authDb, auth.id) : null;
      const comment = await bookStoreManager.addComment(bookId, request, {
        userId: auth.id,
        username: auth.username,
        authorName: profile?.penName?.trim() || auth.username,
        avatarUrl: profile?.avatarUrl ?? null,
      });
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'interaction',
        eventType: 'comment_create',
        status: 'success',
        actorUserId: auth.id,
        actorUsername: auth.username,
        actorRole: auth.role,
        targetType: 'comment',
        targetId: comment.id,
        targetLabel: book?.title ?? bookId,
        detail: {
          bookId,
          novelId: book?.novelId ?? null,
          commentLength: comment.content.length,
        },
      });
      res.json({ success: true, comment });
    } catch (err) {
      safeErrorReply(res, err, '发表评论失败');
    }
  });

  router.delete('/:id/comments/:commentId', async (req: Request, res: Response) => {
    try {
      const auth = requireBookstoreAuth(req);
      const bookId = getRouteParam(req, 'id');
      const commentId = getRouteParam(req, 'commentId');
      const book = await bookStoreManager.getBook(bookId);
      const result = await bookStoreManager.removeComment(
        bookId,
        commentId,
        auth.id,
        auth.role === 'admin',
      );
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'interaction',
        eventType: 'comment_delete',
        status: 'success',
        actorUserId: auth.id,
        actorUsername: auth.username,
        actorRole: auth.role,
        targetType: 'comment',
        targetId: commentId,
        targetLabel: book?.title ?? bookId,
        detail: {
          bookId,
          novelId: book?.novelId ?? null,
          isAdminAction: auth.role === 'admin',
          commentCount: result.commentCount,
        },
      });
      res.json({ success: true, ...result });
    } catch (err) {
      safeErrorReply(res, err, '删除评论失败');
    }
  });
}
