import express from 'express';
import type { Request, Response } from 'express';
import { ReportManager } from '../../bookstore/report-manager.js';
import { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import { UserBanManager } from '../../bookstore/user-ban-manager.js';
import type { ComplianceEventManager } from '../../compliance/compliance-event-manager.js';
import { buildComplianceRequestContext } from '../../compliance/compliance-event-manager.js';
import {
  SubmitReportRequestSchema,
  HandleReportRequestSchema,
  ReportListQuerySchema,
} from '../../bookstore/types.js';
import { requireAdmin } from '../middleware/auth.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

export interface ReportsRouteDeps {
  reportManager: ReportManager;
  bookStoreManager: BookStoreManager;
  userBanManager: UserBanManager;
  complianceEventManager?: ComplianceEventManager;
  contentAuditService?: any;
  broadcastJson?: any;
  verifySliderCaptcha?: (challengeId: string, position: number, durationMs: number) => Promise<boolean>;
}

export function createReportsRoutes(deps: ReportsRouteDeps) {
  const router = express.Router();
  const { reportManager, bookStoreManager, userBanManager, complianceEventManager, verifySliderCaptcha } = deps;

  router.use('/admin', requireAdmin());

  function sendDeprecated(res: Response, code: string) {
    const messageByCode: Record<string, string> = {
      REPORTS_MY_DEPRECATED: '该用户举报历史接口已下线。',
      REPORT_DETAIL_DEPRECATED: '该举报详情接口已下线，请改用当前举报列表接口。',
      REPORTS_ADMIN_STATS_DEPRECATED: '该举报管理统计接口已下线，请改用当前举报列表接口。',
      REPORTS_ADMIN_REJECT_DEPRECATED: '该举报驳回快捷接口已下线，请改用当前举报处理接口并传入 reject 动作。',
    };
    return res.status(410).json({
      error: messageByCode[code] ?? '该举报接口已下线。',
      code,
    });
  }

  router.post('/submit', async (req: Request, res: Response) => {
    try {
      const reporterId = req.auth?.id;
      if (!reporterId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const request = SubmitReportRequestSchema.parse(req.body);

      // 验证滑动验证码
      if (verifySliderCaptcha && request.sliderCaptcha) {
        const isValid = await verifySliderCaptcha(
          request.sliderCaptcha.challengeId,
          request.sliderCaptcha.position,
          request.sliderCaptcha.duration,
        );
        if (!isValid) {
          return res.status(400).json({ error: '验证码错误或已过期，请重试' });
        }
      } else if (verifySliderCaptcha) {
        return res.status(400).json({ error: '请先完成滑动验证' });
      }

      const report = await reportManager.submitReport(reporterId, request);
      await complianceEventManager?.record({
        category: 'report',
        eventType: 'report_submit',
        status: 'success',
        actorUserId: reporterId,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: request.chapterId ? 'chapter' : 'novel',
        targetId: request.chapterId ?? request.novelId,
        targetLabel: request.reportType,
        request: buildComplianceRequestContext(req),
        detail: {
          novelId: request.novelId,
          chapterId: request.chapterId ?? null,
          reportType: request.reportType,
        },
      });

      res.json({ reportId: report.id });
    } catch (error) {
      if (error instanceof Error && error.message.includes('举报次数已达上限')) {
        return res.status(429).json({ error: error.message });
      }
      res.status(500).json({ error: safeErrorMessage(error, '提交举报失败') });
    }
  });

  router.get('/my', async (req: Request, res: Response) => {
    if (!req.auth?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return sendDeprecated(res, 'REPORTS_MY_DEPRECATED');
  });

  router.get('/:id', async (req: Request, res: Response) => {
    if (!req.auth?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return sendDeprecated(res, 'REPORT_DETAIL_DEPRECATED');
  });

  router.get('/admin/list', async (req: Request, res: Response) => {
    try {
      const query = ReportListQuerySchema.parse(req.query);
      const result = await reportManager.listReports(query);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '获取举报列表失败') });
    }
  });

  router.post('/admin/:id/handle', async (req: Request, res: Response) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const handlerId = req.auth!.id;
      const rawAction = typeof req.body?.action === 'string' ? req.body.action : undefined;
      if (rawAction === 'offline_chapter') {
        return res.status(501).json({
          error: '章节级下架尚未实现，请改用全书下架、警告作者或封禁用户',
        });
      }

      const parsed = HandleReportRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数无效' });
      }

      const request = parsed.data;

      const report = await reportManager.getReport(id);
      if (!report) {
        return res.status(404).json({ error: '举报记录不存在' });
      }

      switch (request.action) {
        case 'offline_book':
          await bookStoreManager.offlineBook(report.novelId, request.reason);
          await reportManager.handleReport(id, handlerId, `已下架全书: ${request.reason}`, 'resolved');
          break;

        case 'ban_user': {
          const book = await bookStoreManager.getBookByNovelId(report.novelId);
          if (book) {
            await userBanManager.banUser(handlerId, {
              userId: book.userId,
              banType: request.banDuration ? 'temp_ban' : 'permanent_ban',
              reason: request.reason,
              duration: request.banDuration,
              relatedNovelId: report.novelId,
              relatedReportId: report.id,
            });
          }
          await reportManager.handleReport(id, handlerId, `已封禁用户: ${request.reason}`, 'resolved');
          break;
        }

        case 'warning': {
          const book = await bookStoreManager.getBookByNovelId(report.novelId);
          if (book) {
            await userBanManager.banUser(handlerId, {
              userId: book.userId,
              banType: 'warning',
              reason: request.reason,
              relatedNovelId: report.novelId,
              relatedReportId: report.id,
            });
          }
          await reportManager.handleReport(id, handlerId, `已警告作者: ${request.reason}`, 'resolved');
          break;
        }

        case 'reject':
          await reportManager.handleReport(id, handlerId, `举报驳回: ${request.reason}`, 'rejected');
          break;
      }

      await complianceEventManager?.record({
        category: 'report',
        eventType: 'report_handle',
        status: request.action === 'reject' ? 'rejected' : 'success',
        actorUserId: handlerId,
        actorUsername: req.auth?.username ?? null,
        actorRole: req.auth?.role ?? null,
        targetType: report.chapterId ? 'chapter' : 'novel',
        targetId: report.chapterId ?? report.novelId,
        targetLabel: request.action,
        request: buildComplianceRequestContext(req),
        detail: {
          reportId: report.id,
          action: request.action,
          reason: request.reason,
          banDuration: request.banDuration ?? null,
        },
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: safeErrorMessage(error, '处理举报失败') });
    }
  });

  router.post('/admin/:id/reject', (_req: Request, res: Response) =>
    sendDeprecated(res, 'REPORTS_ADMIN_REJECT_DEPRECATED'));

  router.get('/admin/stats/:novelId', (_req: Request, res: Response) =>
    sendDeprecated(res, 'REPORTS_ADMIN_STATS_DEPRECATED'));

  return router;
}
