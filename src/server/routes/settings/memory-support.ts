import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export type ReindexProgressSnapshot = {
  novelId: string;
  novelIndex: number;
  totalNovels: number;
  phase: string;
  current: number;
  total: number;
  error?: string;
};

export type MemoryRouteDeps = {
  broadcastJson?: (frame: Record<string, unknown>) => void;
};

export const ReindexMemoryBody = z.object({
  scope: z.enum(['all', 'selected']),
  novelIds: z.array(z.string().min(1)).optional(),
  clearBeforeRebuild: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  embeddingProvider: z.string().optional(),
  embeddingApiKey: z.string().optional(),
  embeddingModel: z.string().optional(),
  embeddingBaseUrl: z.string().optional(),
});

export const MemoryHealthBody = z.object({
  scope: z.enum(['all', 'selected']),
  novelIds: z.array(z.string().min(1)).optional(),
});

let reindexRunning = false;
let lastReindexProgress: ReindexProgressSnapshot | null = null;

export function ensureMemoryAdminAccess(req: Request, res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'admin') {
    res.status(403).json({ error: 'Admin permission required' });
    return;
  }
  next();
}

export function resolveSelectedNovelIds(
  scope: 'all' | 'selected',
  novelIds?: string[],
): string[] | undefined {
  if (scope !== 'selected') {
    return undefined;
  }

  return [...new Set((novelIds ?? []).map(id => id.trim()).filter(Boolean))];
}

export function isSelectedScopeMissingNovelIds(
  scope: 'all' | 'selected',
  novelIds?: string[],
): boolean {
  return scope === 'selected' && (!novelIds || novelIds.length === 0);
}

export function isReindexRunning(): boolean {
  return reindexRunning;
}

export function startReindexTask(): void {
  reindexRunning = true;
}

export function finishReindexTask(): void {
  reindexRunning = false;
  lastReindexProgress = null;
}

export function updateReindexProgress(progress: ReindexProgressSnapshot): void {
  lastReindexProgress = progress;
}

export function getReindexStatusSnapshot(): {
  running: boolean;
  progress: ReindexProgressSnapshot | null;
} {
  return {
    running: reindexRunning,
    progress: lastReindexProgress,
  };
}
