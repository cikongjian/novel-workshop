import type { Router } from 'express';
import { buildComplianceRequestContext } from '../../../../compliance/compliance-event-manager.js';
import {
  NovelOrganizationPlanConflictError,
  organizeNovelData,
} from '../../../../novel/novel-data-organizer.js';
import { createLogger } from '../../../../utils/logger.js';
import type { AdminNovelDebugDeps } from '../../admin-novel-debug.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  firstZodMessage,
  NovelDebugParams,
  NovelOrganizeBody,
} from './route-support.js';

const log = createLogger('AdminNovelDebug');

export function registerAdminNovelDebugMutationRoutes(
  router: Router,
  { novelManager, novelMemory, backupManager, complianceEventManager }: AdminNovelDebugDeps,
): void {
  router.post('/novels/:novelId/organize', async (req, res) => {
    const parsedParams = NovelDebugParams.safeParse(req.params);
    const parsedBody = NovelOrganizeBody.safeParse(req.body);
    if (!parsedParams.success) {
      res.status(400).json({ error: firstZodMessage(parsedParams.error) });
      return;
    }
    if (!parsedBody.success) {
      res.status(400).json({ error: firstZodMessage(parsedBody.error) });
      return;
    }

    const { novelId } = parsedParams.data;
    if (parsedBody.data.apply && parsedBody.data.confirmNovelId !== novelId) {
      res.status(409).json({ error: '确认的小说 ID 与目标不一致，已拒绝执行' });
      return;
    }

    try {
      const result = await organizeNovelData({
        novelManager,
        novelMemory,
        novelId,
        scopes: parsedBody.data.scopes,
        apply: parsedBody.data.apply,
        expectedPlanToken: parsedBody.data.expectedPlanToken,
        backupManager,
      });

      if (result.mode === 'apply' && complianceEventManager) {
        await complianceEventManager.record({
          category: 'creator',
          eventType: 'admin_novel_data_organized',
          status: 'success',
          actorUserId: req.auth?.id ?? null,
          actorUsername: req.auth?.username ?? null,
          actorRole: req.auth?.role ?? null,
          targetType: 'novel',
          targetId: novelId,
          targetLabel: result.reportBefore.novel.title,
          request: buildComplianceRequestContext(req),
          detail: {
            scopes: parsedBody.data.scopes ?? [
              'characters', 'metadata', 'outline', 'threads', 'finalization', 'facts',
            ],
            backupId: result.backup?.id ?? null,
            changes: result.changes.filter(change => change.changed).map(change => change.scope),
          },
        }).catch(error => {
          log.warn('小说数据整理成功，但合规事件记录失败', {
            novelId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      res.json(result);
    } catch (error) {
      if (error instanceof NovelOrganizationPlanConflictError) {
        res.status(409).json({
          error: error.message,
          code: 'NOVEL_ORGANIZATION_PLAN_STALE',
        });
        return;
      }
      const message = safeErrorMessage(error, '整理小说数据失败');
      res.status(message.includes('不存在') ? 404 : 500).json({ error: message });
    }
  });
}
