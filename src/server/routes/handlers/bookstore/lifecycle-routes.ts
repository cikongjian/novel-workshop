import type { Router, Request, Response } from 'express';
import { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import type { AuditQueueManager } from '../../../../bookstore/audit-queue.js';
import { PublishBookRequestSchema, UpdateBookRequestSchema } from '../../../../bookstore/types.js';
import { getBookstoreActorId, getBookstoreUserScope } from '../../../../bookstore/user-access.js';
import { NovelManager } from '../../../../novel/novel-manager.js';
import type { AuthDb } from '../../../../auth/types.js';
import type { ContentAuditService } from '../../../../bookstore/content-audit-service.js';
import type { ComplianceEventManager } from '../../../../compliance/compliance-event-manager.js';
import { recordComplianceEventFromRequest } from '../../../../compliance/compliance-event-support.js';
import {
  auditPublicTextFields,
  buildPublicTextBlockMessage,
} from '../../../../compliance/public-text-moderation.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { ensureRealNameVerified } from '../../helpers/real-name.js';
import { getRouteParam, requireBookstoreAuth } from './route-support.js';
import type { ForkService } from '../../../../services/fork-service.js';
import { getConfig } from '../../../../config/index.js';
import { getProfile } from '../../../../auth/user-service.js';

type BookstoreLifecycleRouteDeps = {
  bookStoreManager: BookStoreManager;
  auditQueueManager: AuditQueueManager;
  novelManager: NovelManager;
  contentAuditService?: ContentAuditService;
  authDb?: AuthDb;
  complianceEventManager?: ComplianceEventManager;
  forkService?: ForkService;
};

export function registerBookstoreLifecycleRoutes(
  router: Router,
  {
    bookStoreManager,
    auditQueueManager,
    novelManager,
    contentAuditService,
    authDb,
    complianceEventManager,
    forkService,
  }: BookstoreLifecycleRouteDeps,
): void {
  router.post('/publish', async (req: Request, res: Response) => {
    try {
      await ensureRealNameVerified(authDb, req.auth, 'bookPublishing');
      const userId = getBookstoreActorId(req.auth);
      const isAdmin = req.auth?.role === 'admin';
      const request = PublishBookRequestSchema.parse(req.body);

      // 新用户冷静期检查
      const cfg = getConfig();
      if (!isAdmin && cfg.newUserCooldownHours > 0 && authDb && req.auth) {
        const profile = await getProfile(authDb, req.auth.id);
        if (profile) {
          const createdAt = new Date(profile.createdAt).getTime();
          const cooldownMs = cfg.newUserCooldownHours * 3600 * 1000;
          if (Date.now() - createdAt < cooldownMs) {
            const remainingHours = Math.ceil((cooldownMs - (Date.now() - createdAt)) / 3600000);
            return res.status(403).json({
              error: `新注册用户需等待约${remainingHours}小时后才能发布作品到书城`,
              code: 'NEW_USER_COOLDOWN',
              retryAfterHours: remainingHours,
            });
          }
        }
      }

      // 每月发布上限 + 质量解锁检查
      if (!isAdmin) {
        const limits = cfg.publishLimits;
        const userBooks = await bookStoreManager.getUserBooks(userId);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthPublished = userBooks.filter(
          (b) => b.publishTime && new Date(b.publishTime) >= monthStart,
        ).length;

        // 计算已解锁的额外配额：现有已发布书城作品中达到质量门槛的数量
        let unlockedSlots = 0;
        for (const book of userBooks) {
          if (book.publishStatus !== 'approved') continue;
          const bookNovel = await novelManager.getNovel(book.novelId);
          if (!bookNovel) continue;
          const chapterCount = bookNovel.chapterCount ?? 0;
          if (
            (book.viewCount ?? 0) >= limits.unlockReads &&
            (book.likeCount ?? 0) >= limits.unlockLikes &&
            (book.favoriteCount ?? 0) >= limits.unlockFavorites &&
            chapterCount >= limits.unlockChapters
          ) {
            unlockedSlots++;
          }
        }

        const totalAllowed = limits.maxPerMonth + unlockedSlots;
        if (monthPublished >= totalAllowed) {
          const unlockedInfo = unlockedSlots > 0
            ? `（其中${unlockedSlots}个由优质作品解锁）`
            : '';
          return res.status(429).json({
            error: `本月发布作品数已达上限（基础${limits.maxPerMonth}本${unlockedInfo}）。`
              + `单本书达到 ${limits.unlockReads}阅读 / ${limits.unlockLikes}点赞 / ${limits.unlockFavorites}收藏 / ${limits.unlockChapters}章 可解锁额外配额`,
            code: 'PUBLISH_MONTHLY_LIMIT',
            monthlyUsed: monthPublished,
            monthlyLimit: limits.maxPerMonth,
            unlockedSlots,
            totalAllowed,
            thresholds: {
              reads: limits.unlockReads,
              likes: limits.unlockLikes,
              favorites: limits.unlockFavorites,
              chapters: limits.unlockChapters,
            },
          });
        }
      }

      const novel = await novelManager.getNovel(request.novelId);
      if (!novel) {
        return res.status(404).json({ error: '小说不存在' });
      }

      const novelOwnerId = novel.ownerId ?? 'dev';
      if (novelOwnerId !== userId && req.auth?.role !== 'admin') {
        return res.status(403).json({ error: '无权发布他人的小说' });
      }

      if (!novel.coverImage) {
        return res.status(400).json({ error: '请先为作品设置封面，才能发布到书城' });
      }

      // 分叉作品发布闸门：必须原作者审批通过 + 标题/封面已更换
      const forkedFrom = (novel as any).forkedFrom;
      if (forkedFrom && forkService) {
        const approved = forkService.getApprovedPublishRequest(request.novelId);
        if (!approved) {
          return res.status(403).json({
            error: '分叉作品需原作者审批通过后才能发布',
            errorType: 'FORK_APPROVAL_REQUIRED',
          });
        }
        // 二次校验：当前标题/封面必须与审批时一致或仍满足"已更换"条件
        const original = await novelManager.getNovel(forkedFrom.originalNovelId);
        if (original) {
          if (novel.title.trim() === original.title.trim()) {
            return res.status(400).json({ error: '作品标题与原作相同，请先修改标题' });
          }
          if (original.coverImage && novel.coverImage === original.coverImage) {
            return res.status(400).json({ error: '封面与原作相同，请先更换封面' });
          }
        }
      }

      const existing = await bookStoreManager.getBookByNovelId(request.novelId);
      if (existing) {
        return res.status(400).json({ error: '该作品已发布到书城' });
      }
      const blockedField = await auditPublicTextFields({
        fields: [
          { field: 'title', label: '作品标题', value: novel.title },
          { field: 'category', label: '作品分类', value: request.category },
          { field: 'description', label: '作品简介', value: request.description },
          ...request.tags.map((tag, index) => ({
            field: `tags.${index}`,
            label: '作品标签',
            value: tag,
          })),
        ],
        contentAuditService,
        novelId: request.novelId,
        operationKey: 'system.book-publish-audit',
        operationLabel: '书城资料审核',
      });
      if (blockedField) {
        await recordComplianceEventFromRequest(req, complianceEventManager, {
          category: 'publishing',
          eventType: 'book_publish_reject',
          status: 'rejected',
          actorUserId: req.auth?.id ?? userId,
          actorUsername: req.auth?.username ?? null,
          actorRole: req.auth?.role ?? null,
          targetType: 'novel',
          targetId: request.novelId,
          targetLabel: novel.title,
          detail: {
            field: blockedField.field,
            fieldLabel: blockedField.label,
            overallScore: blockedField.result.overallScore,
            violationTypes: blockedField.result.violations.map((item) => item.type),
            contentPreview: blockedField.value.slice(0, 60),
          },
        });
        return res.status(400).json({
          error: buildPublicTextBlockMessage(blockedField.result, {
            subjectLabel: blockedField.label,
          }),
          code: 'BOOK_PUBLIC_TEXT_BLOCKED',
        });
      }

      const coverUrl = `/novels/cover/${request.novelId}`;
      const book = await bookStoreManager.publishBook(
        userId,
        request,
        novel.title,
        coverUrl,
      );
      res.json({
        bookstoreId: book.id,
        auditStatus: book.auditStatus,
      });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '发布作品失败') });
    }
  });

  router.put('/:id/update', async (req: Request, res: Response) => {
    try {
      const request = UpdateBookRequestSchema.parse(req.body);
      const bookId = getRouteParam(req, 'id');
      const existingBook = await bookStoreManager.getBook(bookId);
      const blockedField = await auditPublicTextFields({
        fields: [
          { field: 'title', label: '作品标题', value: request.title },
          { field: 'description', label: '作品简介', value: request.description },
          ...(request.tags ?? []).map((tag, index) => ({
            field: `tags.${index}`,
            label: '作品标签',
            value: tag,
          })),
        ],
        contentAuditService,
        novelId: existingBook?.novelId,
        operationKey: 'system.book-update-audit',
        operationLabel: '书城资料审核',
      });
      if (blockedField) {
        await recordComplianceEventFromRequest(req, complianceEventManager, {
          category: 'publishing',
          eventType: 'book_update_reject',
          status: 'rejected',
          actorUserId: req.auth?.id ?? null,
          actorUsername: req.auth?.username ?? null,
          actorRole: req.auth?.role ?? null,
          targetType: 'book',
          targetId: bookId,
          targetLabel: existingBook?.title ?? bookId,
          detail: {
            novelId: existingBook?.novelId ?? null,
            field: blockedField.field,
            fieldLabel: blockedField.label,
            overallScore: blockedField.result.overallScore,
            violationTypes: blockedField.result.violations.map((item) => item.type),
            contentPreview: blockedField.value.slice(0, 60),
          },
        });
        return res.status(400).json({
          error: buildPublicTextBlockMessage(blockedField.result, {
            subjectLabel: blockedField.label,
          }),
          code: 'BOOK_PUBLIC_TEXT_BLOCKED',
        });
      }
      const book = await bookStoreManager.updateBook(
        bookId,
        getBookstoreUserScope(req.auth),
        request,
      );
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'publishing',
        eventType: 'book_update',
        status: 'success',
        actorUserId: req.auth?.id ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'book',
        targetId: book.id,
        targetLabel: book.title,
        detail: {
          novelId: book.novelId,
          publishStatus: book.publishStatus,
          coverAuditStatus: book.coverAuditStatus,
          tagCount: Array.isArray(book.tags) ? book.tags.length : 0,
        },
      });
      res.json(book);
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '更新作品失败') });
    }
  });

  router.delete('/:id/unpublish', async (req: Request, res: Response) => {
    try {
      const bookId = getRouteParam(req, 'id');
      const existingBook = await bookStoreManager.getBook(bookId);
      await bookStoreManager.unpublishBook(bookId, getBookstoreUserScope(req.auth));
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'publishing',
        eventType: 'book_unpublish',
        status: 'success',
        actorUserId: req.auth?.id ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'book',
        targetId: bookId,
        targetLabel: existingBook?.title ?? bookId,
        detail: {
          novelId: existingBook?.novelId ?? null,
        },
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '下架作品失败') });
    }
  });

  router.post('/:id/cover-audit/approve', async (req: Request, res: Response) => {
    try {
      const auth = requireBookstoreAuth(req);
      if (auth.role !== 'admin') {
        return res.status(403).json({ error: '仅管理员可审核封面' });
      }

      await bookStoreManager.updateCoverAuditStatus(getRouteParam(req, 'id'), 'pass');
      const book = await bookStoreManager.getBook(getRouteParam(req, 'id'));
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'publishing',
        eventType: 'cover_audit_approve',
        status: 'success',
        actorUserId: auth.id,
        actorUsername: auth.username,
        actorRole: auth.role,
        targetType: 'book',
        targetId: getRouteParam(req, 'id'),
        targetLabel: book?.title ?? getRouteParam(req, 'id'),
        detail: {
          novelId: book?.novelId ?? null,
        },
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '封面审核通过操作失败') });
    }
  });

  router.post('/:id/cover-audit/reject', async (req: Request, res: Response) => {
    try {
      const auth = requireBookstoreAuth(req);
      if (auth.role !== 'admin') {
        return res.status(403).json({ error: '仅管理员可审核封面' });
      }

      const reason = req.body?.reason;
      if (!reason) {
        return res.status(400).json({ error: '请提供拒绝原因' });
      }

      await bookStoreManager.updateCoverAuditStatus(getRouteParam(req, 'id'), 'reject', reason);
      const book = await bookStoreManager.getBook(getRouteParam(req, 'id'));
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'publishing',
        eventType: 'cover_audit_reject',
        status: 'rejected',
        actorUserId: auth.id,
        actorUsername: auth.username,
        actorRole: auth.role,
        targetType: 'book',
        targetId: getRouteParam(req, 'id'),
        targetLabel: book?.title ?? getRouteParam(req, 'id'),
        detail: {
          novelId: book?.novelId ?? null,
          reason,
        },
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '封面审核拒绝操作失败') });
    }
  });

  router.post('/:id/unlock-cover', async (req: Request, res: Response) => {
    try {
      const bookId = getRouteParam(req, 'id');
      const book = await bookStoreManager.getBook(bookId);
      await bookStoreManager.unlockCoverAndUnpublish(bookId, getBookstoreUserScope(req.auth));
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'publishing',
        eventType: 'cover_unlock_unpublish',
        status: 'success',
        actorUserId: req.auth?.id ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'book',
        targetId: bookId,
        targetLabel: book?.title ?? bookId,
        detail: {
          novelId: book?.novelId ?? null,
        },
      });
      res.json({ success: true, message: '封面已解锁，作品已下架，请上传新封面后点击"重新提交封面"' });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '解锁封面失败') });
    }
  });

  router.post('/:id/resubmit-cover', async (req: Request, res: Response) => {
    try {
      const bookId = getRouteParam(req, 'id');
      const userId = getBookstoreUserScope(req.auth);
      const book = await bookStoreManager.getBook(bookId);
      if (!book) {
        return res.status(404).json({ error: '作品不存在' });
      }

      const novel = await novelManager.getNovel(book.novelId);
      if (!novel?.coverImage) {
        return res.status(400).json({ error: '请先在创作工作台上传新封面，再提交审核' });
      }

      const coverUrl = `/novels/cover/${book.novelId}?t=${Date.now()}`;
      await bookStoreManager.resubmitCoverForAudit(bookId, userId, coverUrl);
      await recordComplianceEventFromRequest(req, complianceEventManager, {
        category: 'publishing',
        eventType: 'cover_resubmit',
        status: 'success',
        actorUserId: req.auth?.id ?? null,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: 'book',
        targetId: bookId,
        targetLabel: book.title,
        detail: {
          novelId: book.novelId,
          coverUrl,
        },
      });
      res.json({ success: true, message: '封面已重新提交审核，请等待管理员审核' });
    } catch (err) {
      res.status(500).json({ error: safeErrorMessage(err, '重新提交封面审核失败') });
    }
  });

  router.get('/:id/audit-status', async (_req: Request, res: Response) => {
    res.status(410).json({
      error: 'This audit status endpoint has been deprecated. Use /api/bookstore/my/published instead.',
      code: 'BOOKSTORE_AUDIT_STATUS_DEPRECATED',
    });
  });
}
