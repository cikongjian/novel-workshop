import type { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  AgentSkillActivationSchema,
  AgentSkillStatusSchema,
  AgentSkillTriggerConditionSchema,
} from '../../../../agent-skills/types.js';
import type { AgentSkillService } from '../../../../agent-skills/service.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

const SeedCommercialPackModeSchema = z.enum(['classic', 'genre-layered']);

const SkillCreateBody = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  instruction: z.string().min(1).max(12000),
  targetRoles: z.array(z.string().min(1)).min(1),
  targetGenres: z.array(z.string().min(1)).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  status: AgentSkillStatusSchema.optional(),
  activation: AgentSkillActivationSchema.optional(),
  triggerCondition: AgentSkillTriggerConditionSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
  createdBy: z.string().max(80).optional(),
});

const SkillUpdateBody = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  instruction: z.string().min(1).max(12000).optional(),
  targetRoles: z.array(z.string().min(1)).min(1).optional(),
  targetGenres: z.array(z.string().min(1)).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  status: AgentSkillStatusSchema.optional(),
  activation: AgentSkillActivationSchema.optional(),
  triggerCondition: AgentSkillTriggerConditionSchema.optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
  updatedBy: z.string().max(80).optional(),
}).refine(value => Object.keys(value).length > 0, {
  message: '至少提供一个可更新字段',
});

const SeedCommercialPackBody = z.object({
  enableByDefault: z.boolean().optional(),
  refreshExisting: z.boolean().optional(),
  mode: SeedCommercialPackModeSchema.optional(),
  createdBy: z.string().max(80).optional(),
});

type EnsureAdmin = (req: Request, res: Response) => boolean;

type AgentSkillManagementRouteDeps = {
  service: AgentSkillService;
  ensureAdmin: EnsureAdmin;
};

function mapNotFoundAwareStatus(message: string, fallbackStatus = 400): number {
  return message.includes('不存在') ? 404 : fallbackStatus;
}

export function registerAgentSkillManagementRoutes(
  router: Router,
  { service, ensureAdmin }: AgentSkillManagementRouteDeps,
): void {
  router.get('/', async (_req, res) => {
    try {
      const skills = await service.listSkills();
      res.json({ skills });
    } catch (err) {
      res.status(500).json({ error: '读取技能列表失败', detail: String(err) });
    }
  });

  router.post('/', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    const parsed = SkillCreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' });
      return;
    }

    try {
      const skill = await service.createSkill(parsed.data);
      res.status(201).json({ message: '技能创建成功', skill });
    } catch (err) {
      res.status(400).json({ error: safeErrorMessage(err, '技能创建失败') });
    }
  });

  router.post('/seed-commercial-pack', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    const parsed = SeedCommercialPackBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数不合法' });
      return;
    }

    try {
      const result = await service.seedCommercialPack(parsed.data);
      res.json({
        message: '商业技能包初始化完成',
        mode: parsed.data.mode ?? 'genre-layered',
        createdCount: result.created.length,
        updatedCount: result.updated.length,
        reusedCount: result.reused.length,
        enabledSkillIds: result.enabledSkillIds,
        created: result.created,
        updated: result.updated,
        reused: result.reused,
      });
    } catch (err) {
      res.status(500).json({ error: '初始化商业技能包失败', detail: String(err) });
    }
  });

  router.put('/:id', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    const parsed = SkillUpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? '请求参数不合法' });
      return;
    }

    try {
      const skill = await service.updateSkill(req.params.id, parsed.data);
      res.json({ message: '技能更新成功', skill });
    } catch (err) {
      const message = safeErrorMessage(err, '技能更新失败');
      res.status(mapNotFoundAwareStatus(message)).json({ error: message });
    }
  });

  router.delete('/:id', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const deleted = await service.deleteSkill(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: '技能不存在' });
        return;
      }
      res.json({ message: '技能已删除' });
    } catch (err) {
      res.status(500).json({ error: '删除技能失败', detail: String(err) });
    }
  });

  router.post('/:id/publish', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const skill = await service.setSkillStatus(req.params.id, 'active');
      res.json({ message: '技能已发布', skill });
    } catch (err) {
      const message = safeErrorMessage(err, '技能发布失败');
      res.status(mapNotFoundAwareStatus(message)).json({ error: message });
    }
  });

  router.post('/:id/archive', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }
    try {
      const skill = await service.setSkillStatus(req.params.id, 'archived');
      res.json({ message: '技能已归档', skill });
    } catch (err) {
      const message = safeErrorMessage(err, '技能归档失败');
      res.status(mapNotFoundAwareStatus(message)).json({ error: message });
    }
  });
}
