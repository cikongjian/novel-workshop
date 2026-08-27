import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockService = {
  listSkills: vi.fn(),
  createSkill: vi.fn(),
  seedCommercialPack: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
  setSkillStatus: vi.fn(),
  getEffectsSummary: vi.fn(),
  getEffectsTrend: vi.fn(),
  compareSkills: vi.fn(),
  getQualityCorrelation: vi.fn(),
  getGlobalPolicy: vi.fn(),
  updateGlobalPolicy: vi.fn(),
  getNovelPolicy: vi.fn(),
  updateNovelPolicy: vi.fn(),
  getSkillVersionHistory: vi.fn(),
  compareSkillVersions: vi.fn(),
  rollbackToVersion: vi.fn(),
};

const mockTracker = {
  updateUserFeedback: vi.fn(),
  getChapterEffects: vi.fn(),
};

vi.mock('../../agent-skills/service.js', () => ({
  getAgentSkillService: () => mockService,
}));

vi.mock('../../agent-skills/skill-effects-tracker.js', () => ({
  SkillEffectsTracker: vi.fn(function MockSkillEffectsTracker() {
    return mockTracker;
  }),
}));

import { createAgentSkillsRouter } from './agent-skills.js';

function getRouteHandler(router: any, method: 'get' | 'post' | 'put' | 'delete', path: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === path && entry.route.methods?.[method]);
  if (!layer) {
    throw new Error(`route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[0].handle;
}

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    body: {},
    query: {},
    headers: {},
    ...overrides,
  } as Request;
}

function mockResponse(): Response & { statusCode: number; body?: unknown } {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return response as Response & { statusCode: number; body?: unknown };
}

describe('agent skills routes', () => {
  beforeEach(() => {
    for (const fn of Object.values(mockService)) {
      fn.mockReset();
    }
    for (const fn of Object.values(mockTracker)) {
      fn.mockReset();
    }
  });

  it('requires admin access for effects summary', async () => {
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'get', '/effects/summary');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'user', username: 'user-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(mockService.getEffectsSummary).not.toHaveBeenCalled();
  });

  it('lists skills for read access without admin privileges', async () => {
    mockService.listSkills.mockResolvedValue([{ id: 'skill-1' }]);
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'get', '/');
    const res = mockResponse();

    await handler(mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(mockService.listSkills).toHaveBeenCalled();
    expect(res.body).toEqual({ skills: [{ id: 'skill-1' }] });
  });

  it('creates skills for admins with validated payloads', async () => {
    mockService.createSkill.mockResolvedValue({ id: 'skill-1', name: 'Skill A' });
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'post', '/');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
        body: {
          name: 'Skill A',
          instruction: 'x'.repeat(20),
          targetRoles: ['writer'],
        },
      }),
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(mockService.createSkill).toHaveBeenCalledWith({
      name: 'Skill A',
      instruction: 'x'.repeat(20),
      targetRoles: ['writer'],
    });
    expect(res.body).toEqual({
      message: '技能创建成功',
      skill: { id: 'skill-1', name: 'Skill A' },
    });
  });

  it('summarizes seed-commercial-pack results', async () => {
    mockService.seedCommercialPack.mockResolvedValue({
      created: [{ id: 'created-1' }],
      updated: [{ id: 'updated-1' }],
      reused: [{ id: 'reused-1' }],
      enabledSkillIds: ['enabled-1'],
    });
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'post', '/seed-commercial-pack');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
        body: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(mockService.seedCommercialPack).toHaveBeenCalledWith({});
    expect(res.body).toEqual({
      message: '商业技能包初始化完成',
      mode: 'genre-layered',
      createdCount: 1,
      updatedCount: 1,
      reusedCount: 1,
      enabledSkillIds: ['enabled-1'],
      created: [{ id: 'created-1' }],
      updated: [{ id: 'updated-1' }],
      reused: [{ id: 'reused-1' }],
    });
  });

  it('requires admin access for commercial ab-test', async () => {
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'post', '/ab-test');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'user', username: 'user-1' } as any,
        body: {},
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
  });

  it('validates commercial ab-test payloads before execution', async () => {
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'post', '/ab-test');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
        body: { sampleCount: 6 },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: 'Number must be less than or equal to 5',
    });
  });

  it('validates compare route skill ids before calling the service', async () => {
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'get', '/effects/compare');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
        query: { skillAId: 'bad-id', skillBId: 'a9e3903c-00b0-4ff0-af43-6c48b3575fef' },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(mockService.compareSkills).not.toHaveBeenCalled();
  });

  it('returns version history for admins', async () => {
    mockService.getSkillVersionHistory.mockResolvedValue({
      skillId: 'skill-1',
      versions: [{ versionId: 'v1' }],
    });
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'get', '/:id/versions');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
        params: { id: 'skill-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(mockService.getSkillVersionHistory).toHaveBeenCalledWith('skill-1');
    expect(res.body).toEqual({
      skillId: 'skill-1',
      versions: [{ versionId: 'v1' }],
    });
  });

  it('maps missing rollback targets to 404', async () => {
    mockService.rollbackToVersion.mockRejectedValue(new Error('版本不存在'));
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'post', '/:id/rollback/:versionId');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
        params: { id: 'skill-1', versionId: 'version-1' },
        body: { updatedBy: 'admin-1' },
      }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(mockService.rollbackToVersion).toHaveBeenCalledWith('skill-1', 'version-1', 'admin-1');
  });

  it('maps missing skills to 404 when deleting', async () => {
    mockService.deleteSkill.mockResolvedValue(false);
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'delete', '/:id');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
        params: { id: 'missing-skill' },
      }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(mockService.deleteSkill).toHaveBeenCalledWith('missing-skill');
    expect(res.body).toEqual({ error: '技能不存在' });
  });

  it('maps publish errors for missing skills to 404', async () => {
    mockService.setSkillStatus.mockRejectedValue(new Error('技能不存在'));
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'post', '/:id/publish');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
        params: { id: 'missing-skill' },
      }),
      res,
    );

    expect(res.statusCode).toBe(404);
    expect(mockService.setSkillStatus).toHaveBeenCalledWith('missing-skill', 'active');
    expect(res.body).toEqual({ error: '技能不存在' });
  });

  it('passes validated analytics filters through to quality correlation', async () => {
    mockService.getQualityCorrelation.mockResolvedValue({ correlation: { overall: 0.5 } });
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'get', '/effects/quality-correlation');
    const res = mockResponse();
    const novelId = 'a9e3903c-00b0-4ff0-af43-6c48b3575fef';

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
        query: { days: '7', novelId, role: 'writer' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(mockService.getQualityCorrelation).toHaveBeenCalledWith({
      days: 7,
      novelId,
      role: 'writer',
    });
    expect(res.body).toEqual({ correlation: { overall: 0.5 } });
  });

  it('requires admin access for global policy reads', async () => {
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'get', '/policy/global');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'user-1', role: 'user', username: 'user-1' } as any,
      }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(mockService.getGlobalPolicy).not.toHaveBeenCalled();
  });

  it('updates novel policy after validating access and payload', async () => {
    mockService.updateNovelPolicy.mockResolvedValue({ enabledSkillIds: ['skill-1'] });
    const novelId = 'a9e3903c-00b0-4ff0-af43-6c48b3575fef';
    const router = createAgentSkillsRouter({
      novelManager: {
        getNovel: vi.fn().mockResolvedValue({ id: novelId, ownerId: 'owner-1' }),
      } as any,
    });
    const handler = getRouteHandler(router, 'put', '/policy/novels/:novelId');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user', username: 'owner' } as any,
        params: { novelId },
        body: { enabledSkillIds: ['c2d3ba1f-4d05-4877-b1b8-a1ff15df3df7'] },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(mockService.updateNovelPolicy).toHaveBeenCalledWith(novelId, {
      enabledSkillIds: ['c2d3ba1f-4d05-4877-b1b8-a1ff15df3df7'],
    });
    expect(res.body).toEqual({
      message: '小说策略已更新',
      novelId,
      policy: { enabledSkillIds: ['skill-1'] },
    });
  });

  it('rejects invalid skill feedback chapter numbers before writing feedback', async () => {
    const novelId = 'a9e3903c-00b0-4ff0-af43-6c48b3575fef';
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'post', '/novels/:novelId/chapters/:chapterNumber/skill-feedback');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'admin-1', role: 'admin', username: 'admin' } as any,
        params: { novelId, chapterNumber: '0' },
        body: { feedback: 'helpful' },
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(mockTracker.updateUserFeedback).not.toHaveBeenCalled();
  });

  it('reads chapter skill effects for accessible novels', async () => {
    mockTracker.getChapterEffects.mockResolvedValue([{ skillId: 'skill-1' }]);
    const novelId = 'a9e3903c-00b0-4ff0-af43-6c48b3575fef';
    const router = createAgentSkillsRouter({
      novelManager: {
        getNovel: vi.fn().mockResolvedValue({ id: novelId, ownerId: 'owner-1' }),
      } as any,
    });
    const handler = getRouteHandler(router, 'get', '/novels/:novelId/chapters/:chapterNumber/skill-effects');
    const res = mockResponse();

    await handler(
      mockRequest({
        auth: { id: 'owner-1', role: 'user', username: 'owner' } as any,
        params: { novelId, chapterNumber: '3' },
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(mockTracker.getChapterEffects).toHaveBeenCalledWith(novelId, 3);
    expect(res.body).toEqual({
      effects: [{ skillId: 'skill-1' }],
    });
  });

  it('keeps deprecated skill-effects stats endpoint disabled', async () => {
    const router = createAgentSkillsRouter();
    const handler = getRouteHandler(router, 'get', '/novels/:novelId/skill-effects/stats');
    const res = mockResponse();

    await handler(
      mockRequest({
        params: { novelId: 'a9e3903c-00b0-4ff0-af43-6c48b3575fef' },
      }),
      res,
    );

    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({
      error: 'This skill-effects stats endpoint has been deprecated.',
      code: 'AGENT_SKILL_EFFECTS_STATS_DEPRECATED',
    });
  });
});
