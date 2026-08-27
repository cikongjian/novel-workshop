import type { Router, Request, Response } from 'express';
import type { AgentSkillService } from '../../../../agent-skills/service.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

type EnsureAdmin = (req: Request, res: Response) => boolean;

type AgentSkillVersionRouteDeps = {
  service: AgentSkillService;
  ensureAdmin: EnsureAdmin;
};

export function registerAgentSkillVersionRoutes(
  router: Router,
  { service, ensureAdmin }: AgentSkillVersionRouteDeps,
): void {
  router.get('/:id/versions', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }

    try {
      const history = await service.getSkillVersionHistory(req.params.id);
      res.json(history);
    } catch (err) {
      const message = safeErrorMessage(err, '读取版本历史失败');
      const status = message.includes('不存在') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.get('/versions/:versionAId/compare/:versionBId', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }

    try {
      const diff = await service.compareSkillVersions(req.params.versionAId, req.params.versionBId);
      res.json(diff);
    } catch (err) {
      const message = safeErrorMessage(err, '版本对比失败');
      const status = message.includes('不存在') ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  router.post('/:id/rollback/:versionId', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const updatedBy = typeof req.body?.updatedBy === 'string' ? req.body.updatedBy : undefined;
    try {
      const skill = await service.rollbackToVersion(req.params.id, req.params.versionId, updatedBy);
      res.json({ message: '已回滚到指定版本', skill });
    } catch (err) {
      const message = safeErrorMessage(err, '版本回滚失败');
      const status = message.includes('不存在') ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });
}
