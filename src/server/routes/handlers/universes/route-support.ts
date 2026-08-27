import { z } from 'zod';
import type { Request, Response } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { SeriesManager } from '../../../../novel/series-manager.js';
import type { UniverseManager } from '../../../../novel/universe-manager.js';
import { NovelGenre } from '../../../../novel/types.js';
import type { UniverseMetadata } from '../../../../novel/universe-types.js';
import { UniverseRelationType } from '../../../../novel/universe-types.js';
import { checkNovelAccess } from '../../../middleware/novel-access.js';

export type UniverseRouterDeps = {
  universeManager: UniverseManager;
  novelManager: NovelManager;
  seriesManager?: SeriesManager;
};

export const UniverseBody = z.object({
  title: z.string().trim().min(1, '宇宙名称不能为空'),
  description: z.string().optional(),
  corePremise: z.string().optional(),
  sharedWorldRules: z.string().optional(),
  timelineBaseline: z.string().optional(),
});

export const UniverseNovelBody = z.object({
  novelId: z.string().uuid('缺少合法 novelId'),
  notes: z.string().optional(),
});

export const UniverseRelationBody = z.object({
  fromNovelId: z.string().uuid('缺少合法 fromNovelId'),
  toNovelId: z.string().uuid('缺少合法 toNovelId'),
  type: UniverseRelationType,
  anchorChapterNumber: z.number().int().positive().optional(),
  timelineSpan: z.string().optional(),
  spoilerCeiling: z.string().optional(),
  inheritWorld: z.boolean().optional(),
  inheritCharacters: z.boolean().optional(),
  inheritForeshadowing: z.boolean().optional(),
  notes: z.string().optional(),
});

export const UniverseRelationUpdateBody = UniverseRelationBody.partial().omit({
  fromNovelId: true,
  toNovelId: true,
});

export const CreateRelatedWorkBody = z.object({
  title: z.string().trim().min(1, '作品标题不能为空'),
  genre: NovelGenre,
  synopsis: z.string().optional(),
  description: z.string().optional(),
  constitutionTags: z.array(z.string()).optional(),
  sourceNovelId: z.string().uuid('缺少合法 sourceNovelId'),
  relationType: UniverseRelationType,
  anchorChapterNumber: z.number().int().positive().optional(),
  timelineSpan: z.string().optional(),
  spoilerCeiling: z.string().optional(),
  inheritWorld: z.boolean().optional(),
  inheritCharacters: z.boolean().optional(),
  inheritForeshadowing: z.boolean().optional(),
  relationNotes: z.string().optional(),
});

export type EnsureNovelAccess = (
  req: Request,
  res: Response,
  novelId: string,
) => Promise<boolean>;

export type EnsureUniverseAccess = (
  req: Request,
  res: Response,
  universeId: string,
) => Promise<UniverseMetadata | null>;

export function createUniverseAccessGuards(
  deps: Pick<UniverseRouterDeps, 'universeManager' | 'novelManager'>,
): {
  ensureNovelAccess: EnsureNovelAccess;
  ensureUniverseAccess: EnsureUniverseAccess;
} {
  const { universeManager, novelManager } = deps;

  async function ensureNovelAccess(req: Request, res: Response, novelId: string): Promise<boolean> {
    const access = await checkNovelAccess(req, novelManager, novelId);
    if (!access.allowed) {
      res.status(access.status).json({ error: access.error });
      return false;
    }
    return true;
  }

  async function ensureUniverseAccess(
    req: Request,
    res: Response,
    universeId: string,
  ): Promise<UniverseMetadata | null> {
    const universe = await universeManager.getUniverse(universeId);
    if (!universe) {
      res.status(404).json({ error: '宇宙不存在' });
      return null;
    }

    if (req.auth?.role === 'admin') {
      return universe;
    }

    const userId = req.auth?.id ?? 'dev';
    if (universe.ownerId && universe.ownerId === userId) {
      return universe;
    }

    for (const novelRef of universe.novels) {
      const access = await checkNovelAccess(req, novelManager, novelRef.novelId);
      if (!access.allowed) {
        res.status(access.status).json({ error: access.error });
        return null;
      }
    }

    return universe;
  }

  return {
    ensureNovelAccess,
    ensureUniverseAccess,
  };
}
