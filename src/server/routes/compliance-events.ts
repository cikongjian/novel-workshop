import express from 'express';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ComplianceEventManager } from '../../compliance/compliance-event-manager.js';
import type { GuestVisitManager } from '../../guest-visits/guest-visit-manager.js';
import type { ReportManager } from '../../bookstore/report-manager.js';
import { requireAdmin } from '../middleware/auth.js';
import { safeErrorMessage } from '../middleware/safe-error-reply.js';

const MIN_BACKUP_COUNT = 1;

async function getBackupStatus(): Promise<{ count: number; latestAt: string | null }> {
  const backupDir = path.resolve(process.env.BACKUP_DIR ?? './backups');
  try {
    const entries = await fs.readdir(backupDir);
    const files = await Promise.all(
      entries
        .filter((f) => f.startsWith('data-backup-') && f.endsWith('.tar.gz'))
        .map(async (f) => {
          const stat = await fs.stat(path.join(backupDir, f));
          return stat.mtime;
        }),
    );
    if (files.length === 0) return { count: 0, latestAt: null };
    files.sort((a, b) => b.getTime() - a.getTime());
    return { count: files.length, latestAt: files[0]!.toISOString() };
  } catch {
    return { count: 0, latestAt: null };
  }
}

const ComplianceEventListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(['auth', 'real_name', 'report', 'moderation', 'publishing', 'interaction', 'creator']).optional(),
  eventType: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['success', 'failure', 'rejected']).optional(),
  actorUserId: z.string().trim().min(1).max(80).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
});

const REQUIRED_CATEGORIES = ['auth', 'real_name', 'report', 'moderation', 'publishing', 'interaction', 'creator'] as const;

type ComplianceEventsRouteDeps = {
  complianceEventManager: ComplianceEventManager;
  guestVisitManager?: GuestVisitManager;
  reportManager?: ReportManager;
  authEnabled?: boolean;
  moderationEnabled?: boolean;
  complaintEntryPath?: string;
};

export function createComplianceEventsRouter({
  complianceEventManager,
  guestVisitManager,
  reportManager,
  authEnabled = false,
  moderationEnabled = false,
  complaintEntryPath = '/complaints',
}: ComplianceEventsRouteDeps) {
  const router = express.Router();

  router.use(requireAdmin());

  router.get('/', async (req, res) => {
    try {
      const parsed = ComplianceEventListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数无效' });
        return;
      }

      const result = await complianceEventManager.list(parsed.data);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: safeErrorMessage(error, '查询合规台账失败'),
      });
    }
  });

  router.get('/stats', async (_req, res) => {
    try {
      const result = await complianceEventManager.getStats();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: safeErrorMessage(error, '加载合规统计失败'),
      });
    }
  });

  router.get('/checks', async (_req, res) => {
    try {
      const [stats, backupStatus] = await Promise.all([
        complianceEventManager.getStats(),
        getBackupStatus(),
      ]);
      const guestSummary = guestVisitManager ? await guestVisitManager.getSummary() : null;
      const pendingReports = reportManager
        ? (await reportManager.listReports({ page: 1, pageSize: 1, status: 'pending' })).total
        : 0;

      const missingCategories = REQUIRED_CATEGORIES.filter((category) => !stats.byCategory[category]);
      const moderationEvidenceCount = [
        stats.byEventType.offline_book ?? 0,
        stats.byEventType.reonline_book ?? 0,
        stats.byEventType.ban_user ?? 0,
        stats.byEventType.unban_user ?? 0,
        stats.byEventType.report_handle ?? 0,
      ].reduce((sum, count) => sum + count, 0);

      const items = [
        {
          key: 'log_retention',
          title: '日志留存',
          status: stats.retentionDays >= 180 ? 'pass' : 'warn',
          detail: `当前保留 ${stats.retentionDays} 天`,
        },
        {
          key: 'real_name',
          title: '实名认证',
          status: authEnabled ? 'pass' : 'warn',
          detail: authEnabled
            ? `已启用，累计 ${stats.byCategory.real_name ?? 0} 条实名留痕`
            : '认证系统未启用',
        },
        {
          key: 'report_channel',
          title: '投诉举报',
          status: reportManager ? 'pass' : 'warn',
          detail: reportManager
            ? `入口 ${complaintEntryPath}，待处理 ${pendingReports} 条`
            : '未接入举报管理',
        },
        {
          key: 'guest_tracking',
          title: '游客访问记录',
          status: guestVisitManager ? 'pass' : 'warn',
          detail: guestVisitManager
            ? guestSummary && guestSummary.totalUniqueVisitors > 0
              ? `已记录 ${guestSummary.totalUniqueVisitors} 位游客`
              : '已开启，暂未记录外部游客'
            : '未开启游客访问记录',
        },
        {
          key: 'content_disposal',
          title: '内容处置',
          status: moderationEnabled ? 'pass' : 'warn',
          detail: moderationEnabled
            ? `下架封禁能力可用，累计 ${moderationEvidenceCount} 条处置留痕`
            : '未接入下架封禁能力',
        },
        {
          key: 'action_coverage',
          title: '动作留痕',
          status: missingCategories.length === 0 ? 'pass' : 'warn',
          detail: missingCategories.length === 0
            ? `已覆盖 ${REQUIRED_CATEGORIES.length} 类关键动作`
            : `缺少留痕分类：${missingCategories.join('、')}`,
        },
        {
          key: 'data_backup',
          title: '数据备份',
          status: backupStatus.count >= MIN_BACKUP_COUNT ? 'pass' : 'warn',
          detail: backupStatus.count >= MIN_BACKUP_COUNT
            ? `已有 ${backupStatus.count} 份备份，最新备份于 ${new Date(backupStatus.latestAt!).toLocaleString('zh-CN')}`
            : '尚无备份文件，请运行 npm run backup:data -- --no-dry-run',
        },
      ] as const;

      const passCount = items.filter((item) => item.status === 'pass').length;
      const warnCount = items.length - passCount;

      res.json({
        checkedAt: new Date().toISOString(),
        passCount,
        warnCount,
        items,
      });
    } catch (error) {
      res.status(500).json({
        error: safeErrorMessage(error, '加载合规检查失败'),
      });
    }
  });

  return router;
}
