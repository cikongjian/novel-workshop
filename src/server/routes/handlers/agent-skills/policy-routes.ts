import type { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { AgentSkillService } from '../../../../agent-skills/service.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

const PolicyScopeBody = z.object({
  enabledSkillIds: z.array(z.string().uuid()).optional(),
  disabledSkillIds: z.array(z.string().uuid()).optional(),
  roleEnabledSkillIds: z.record(z.string(), z.array(z.string().uuid())).optional(),
  roleDisabledSkillIds: z.record(z.string(), z.array(z.string().uuid())).optional(),
});

type EnsureAdmin = (req: Request, res: Response) => boolean;
type EnsureNovelAccess = (req: Request, res: Response, novelId: string) => Promise<boolean>;

type AgentSkillPolicyRouteDeps = {
  service: AgentSkillService;
  ensureAdmin: EnsureAdmin;
  ensureNovelAccess: EnsureNovelAccess;
};

function validateNovelId(res: Response, novelId: string): boolean {
  if (!z.string().uuid().safeParse(novelId).success) {
    res.status(400).json({ error: 'novelId 格式不合法' });
    return false;
  }
  return true;
}

export function registerAgentSkillPolicyRoutes(
  router: Router,
  { service, ensureAdmin, ensureNovelAccess }: AgentSkillPolicyRouteDeps,
): void {
  router.get('/policy/global', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const policy = await service.getGlobalPolicy();
      res.json({ policy });
    } catch (err) {
      res.status(500).json({ error: '读取全局策略失败', detail: String(err) });
    }
  });

  router.put('/policy/global', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    const parsed = PolicyScopeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数不合法' });
      return;
    }

    try {
      const policy = await service.updateGlobalPolicy(parsed.data);
      res.json({ message: '全局策略已更新', policy });
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, '更新策略失败') });
    }
  });

  router.get('/policy/novels/:novelId', async (req, res) => {
    const novelId = req.params.novelId;
    if (!validateNovelId(res, novelId)) {
      return;
    }
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }

    try {
      const policy = await service.getNovelPolicy(novelId);
      res.json({ novelId, policy });
    } catch (err) {
      res.status(500).json({ error: '读取小说策略失败', detail: String(err) });
    }
  });

  router.put('/policy/novels/:novelId', async (req, res) => {
    const novelId = req.params.novelId;
    if (!validateNovelId(res, novelId)) {
      return;
    }
    if (!(await ensureNovelAccess(req, res, novelId))) {
      return;
    }

    const parsed = PolicyScopeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数不合法' });
      return;
    }

    try {
      const policy = await service.updateNovelPolicy(novelId, parsed.data);
      res.json({ message: '小说策略已更新', novelId, policy });
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, '更新策略失败') });
    }
  });
}