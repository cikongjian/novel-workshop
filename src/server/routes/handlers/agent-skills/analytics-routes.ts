import type { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AGENT_NAMES, type AgentRole } from '../../../../agents/types.js';
import type { AgentSkillService } from '../../../../agent-skills/service.js';

const KNOWN_ROLES = Object.keys(AGENT_NAMES);

type EnsureAdmin = (req: Request, res: Response) => boolean;

type AgentSkillAnalyticsRouteDeps = {
  service: AgentSkillService;
  ensureAdmin: EnsureAdmin;
};

function parseDays(value: unknown): number | undefined {
  return typeof value === 'string' ? Number.parseInt(value, 10) : undefined;
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function validateAnalyticsFilters(
  res: Response,
  {
    novelId,
    role,
    days,
  }: {
    novelId?: string;
    role?: string;
    days?: number;
  },
): boolean {
  if (novelId && !z.string().uuid().safeParse(novelId).success) {
    res.status(400).json({ error: 'novelId 格式不合法' });
    return false;
  }
  if (role && !KNOWN_ROLES.includes(role)) {
    res.status(400).json({ error: `role 不合法，可选：${KNOWN_ROLES.join(', ')}` });
    return false;
  }
  if (days != null && (!Number.isFinite(days) || days <= 0)) {
    res.status(400).json({ error: 'days 必须是正整数' });
    return false;
  }
  return true;
}

export function registerAgentSkillAnalyticsRoutes(
  router: Router,
  { service, ensureAdmin }: AgentSkillAnalyticsRouteDeps,
): void {
  router.get('/effects/summary', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const days = parseDays(req.query.days);
    const novelId = parseOptionalString(req.query.novelId);
    const role = parseOptionalString(req.query.role);
    if (!validateAnalyticsFilters(res, { novelId, role, days })) {
      return;
    }

    try {
      const summary = await service.getEffectsSummary({
        novelId,
        role: role as AgentRole | undefined,
        days,
      });
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: '读取技能效果统计失败', detail: String(err) });
    }
  });

  router.get('/effects/trend', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const days = parseDays(req.query.days);
    const novelId = parseOptionalString(req.query.novelId);
    const role = parseOptionalString(req.query.role);
    if (!validateAnalyticsFilters(res, { novelId, role, days })) {
      return;
    }

    try {
      const trend = await service.getEffectsTrend({
        novelId,
        role: role as AgentRole | undefined,
        days,
      });
      res.json(trend);
    } catch (err) {
      res.status(500).json({ error: '读取技能效果趋势失败', detail: String(err) });
    }
  });

  router.get('/effects/compare', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const skillAId = parseOptionalString(req.query.skillAId);
    const skillBId = parseOptionalString(req.query.skillBId);
    const days = parseDays(req.query.days);
    const novelId = parseOptionalString(req.query.novelId);
    const role = parseOptionalString(req.query.role);

    if (!skillAId || !z.string().uuid().safeParse(skillAId).success) {
      res.status(400).json({ error: 'skillAId 必须是有效的 UUID' });
      return;
    }
    if (!skillBId || !z.string().uuid().safeParse(skillBId).success) {
      res.status(400).json({ error: 'skillBId 必须是有效的 UUID' });
      return;
    }
    if (!validateAnalyticsFilters(res, { novelId, role, days })) {
      return;
    }

    try {
      const comparison = await service.compareSkills({
        skillAId,
        skillBId,
        novelId,
        role: role as AgentRole | undefined,
        days,
      });
      res.json(comparison);
    } catch (err) {
      res.status(500).json({ error: '技能对比分析失败', detail: String(err) });
    }
  });

  router.get('/effects/quality-correlation', async (req, res) => {
    if (!ensureAdmin(req, res)) {
      return;
    }

    const days = parseDays(req.query.days);
    const novelId = parseOptionalString(req.query.novelId);
    const role = parseOptionalString(req.query.role);
    if (!validateAnalyticsFilters(res, { novelId, role, days })) {
      return;
    }

    try {
      const correlation = await service.getQualityCorrelation({
        novelId,
        role: role as AgentRole | undefined,
        days,
      });
      res.json(correlation);
    } catch (err) {
      res.status(500).json({ error: '读取质量关联数据失败', detail: String(err) });
    }
  });
}
