import type { Request, Response } from 'express';
import type { NovelAgent } from '../../../../agents/types.js';
import type { ModelClient } from '../../../../models/types.js';
import type { SeriesManager } from '../../../../novel/series-manager.js';
import type { StoryStateManager } from '../../../../novel/story-state-manager.js';

export type SeriesNovelManager = {
  getNovel(id: string): Promise<any>;
  getCharacters(id: string): Promise<any[]>;
  listChapters(id: string): Promise<any[]>;
  getChapter(id: string, n: number): Promise<any>;
};

export type SeriesRouterDeps = {
  seriesManager: SeriesManager;
  storyStateManager: StoryStateManager;
  novelManager?: SeriesNovelManager;
  modelClient?: ModelClient;
  agents?: Map<string, NovelAgent>;
  broadcastJson?: (frame: Record<string, unknown>) => void;
};

export type EnsureNovelAccess = (
  req: Request,
  res: Response,
  novelId: string,
) => Promise<boolean>;

export type EnsureSeriesAccess = (
  req: Request,
  res: Response,
  seriesId: string,
) => Promise<any | null>;

export function getCurrentUserId(req: Request): string {
  return req.auth?.id ?? 'dev';
}

export function isAdmin(req: Request): boolean {
  return req.auth?.role === 'admin';
}

export function createSeriesAccessGuards(
  deps: Pick<SeriesRouterDeps, 'seriesManager' | 'novelManager'>,
): {
  ensureNovelAccess: EnsureNovelAccess;
  ensureSeriesAccess: EnsureSeriesAccess;
} {
  const { seriesManager, novelManager } = deps;

  async function ensureNovelAccess(req: Request, res: Response, novelId: string): Promise<boolean> {
    if (!novelManager) {
      res.status(503).json({ error: '小说服务未就绪' });
      return false;
    }
    try {
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return false;
      }
      const userId = getCurrentUserId(req);
      const novelOwnerId = novel.ownerId ?? 'dev';
      if (isAdmin(req) || novelOwnerId === userId) {
        return true;
      }
      res.status(403).json({ error: '无权访问此小说' });
      return false;
    } catch {
      res.status(500).json({ error: '验证权限失败' });
      return false;
    }
  }

  async function ensureSeriesAccess(req: Request, res: Response, seriesId: string) {
    const series = await seriesManager.getSeries(seriesId);
    if (!series) {
      res.status(404).json({ error: '系列不存在' });
      return null;
    }

    if (isAdmin(req)) {
      return series;
    }

    const userId = getCurrentUserId(req);
    if (series.ownerId && series.ownerId === userId) {
      return series;
    }

    if (!novelManager || series.novels.length === 0) {
      res.status(403).json({ error: '无权访问该系列' });
      return null;
    }

    for (const novelRef of series.novels) {
      const novel = await novelManager.getNovel(novelRef.novelId).catch(() => null);
      if (!novel || (novel.ownerId ?? 'dev') !== userId) {
        res.status(403).json({ error: '无权访问该系列' });
        return null;
      }
    }

    return series;
  }

  return {
    ensureNovelAccess,
    ensureSeriesAccess,
  };
}

export async function filterVisibleSeries(
  req: Request,
  deps: Pick<SeriesRouterDeps, 'novelManager'>,
  list: any[],
): Promise<any[]> {
  if (isAdmin(req)) {
    return list;
  }

  const visible = [];
  const userId = getCurrentUserId(req);
  for (const series of list) {
    if (series.ownerId && series.ownerId === userId) {
      visible.push(series);
      continue;
    }
    if (!deps.novelManager || series.novels.length === 0) {
      continue;
    }
    let allowed = true;
    for (const novelRef of series.novels) {
      const novel = await deps.novelManager.getNovel(novelRef.novelId).catch(() => null);
      if (!novel || (novel.ownerId ?? 'dev') !== userId) {
        allowed = false;
        break;
      }
    }
    if (allowed) {
      visible.push(series);
    }
  }
  return visible;
}
