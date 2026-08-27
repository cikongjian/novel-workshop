import type { Router } from 'express';
import { buildComplianceRequestContext } from '../../../../compliance/compliance-event-manager.js';
import {
  auditChapterGenerationIntegrity,
  ChapterGenerationRepairActiveError,
  ChapterGenerationRepairPlanConflictError,
  repairChapterGenerationIntegrity,
} from '../../../../novel/chapter-generation-integrity.js';
import { createLogger } from '../../../../utils/logger.js';
import type { AdminNovelDebugDeps } from '../../admin-novel-debug.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  ChapterIntegrityRepairBody,
  firstZodMessage,
  NovelDebugParams,
} from './route-support.js';

const log = createLogger('AdminNovelChapterIntegrity');

export function registerAdminNovelChapterIntegrityRoutes(
  router: Router,
  { novelManager, backupManager, complianceEventManager }: AdminNovelDebugDeps,
): void {
  router.get('/novels/:novelId/chapter-integrity', async (req, res) => {
    const parsed = NovelDebugParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: firstZodMessage(parsed.error) });
      return;
    }
    try {
      res.json(await auditChapterGenerationIntegrity(novelManager, parsed.data.novelId));
    } catch (error) {
      const message = safeErrorMessage(error, '检查章节生成数据失败');
      res.status(message.includes('不存在') ? 404 : 500).json({ error: message });
    }
  });

  router.post('/novels/:novelId/chapter-integrity/repair', async (req, res) => {
    const parsedParams = NovelDebugParams.safeParse(req.params);
    const parsedBody = ChapterIntegrityRepairBody.safeParse(req.body);
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
      res.status(409).json({ error: '确认的小说 ID 与目标不一致，已拒绝修复' });
      return;
    }

    try {
      const result = await repairChapterGenerationIntegrity({
        novelManager,
        novelId,
        apply: parsedBody.data.apply,
        expectedPlanToken: parsedBody.data.expectedPlanToken,
        backupManager,
      });
      if (result.mode === 'apply' && complianceEventManager) {
        await complianceEventManager.record({
          category: 'creator',
          eventType: 'admin_chapter_generation_integrity_repaired',
          status: 'success',
          actorUserId: req.auth?.id ?? null,
          actorUsername: req.auth?.username ?? null,
          actorRole: req.auth?.role ?? null,
          targetType: 'novel',
          targetId: novelId,
          targetLabel: result.reportBefore.novel.title,
          request: buildComplianceRequestContext(req),
          detail: {
            deletedChapterNumbers: result.deletedChapterNumbers,
            backupId: result.backup?.id ?? null,
          },
        }).catch(error => {
          log.warn('空章修复成功，但合规事件记录失败', {
            novelId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
      res.json(result);
    } catch (error) {
      if (error instanceof ChapterGenerationRepairPlanConflictError) {
        res.status(409).json({ error: error.message, code: 'CHAPTER_REPAIR_PLAN_STALE' });
        return;
      }
      if (error instanceof ChapterGenerationRepairActiveError) {
        res.status(409).json({ error: error.message, code: 'CHAPTER_GENERATION_ACTIVE' });
        return;
      }
      const message = safeErrorMessage(error, '修复章节生成数据失败');
      res.status(message.includes('不存在') ? 404 : 500).json({ error: message });
    }
  });
}
