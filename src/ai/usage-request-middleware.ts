import type { Request, Response, NextFunction } from 'express';
import { resolveHttpAiUsageOperation } from './usage-operation-registry.js';
import { runWithAiUsageContext } from './usage-context.js';

function normalizePath(req: Request): string {
  return req.originalUrl.split('?')[0] || req.path;
}

function extractNovelId(req: Request): string | undefined {
  const bodyNovelId = typeof req.body?.novelId === 'string' ? req.body.novelId.trim() : '';
  if (bodyNovelId) return bodyNovelId;

  const queryNovelId = typeof req.query?.novelId === 'string' ? req.query.novelId.trim() : '';
  if (queryNovelId) return queryNovelId;

  const pathMatch = normalizePath(req).match(/\/api\/novels\/([^/]+)/);
  const pathNovelId = pathMatch?.[1]?.trim();
  if (pathNovelId && pathNovelId !== '_') return pathNovelId;

  return undefined;
}

function extractChapterNumber(req: Request): number | undefined {
  const candidates = [
    req.body?.chapterNumber,
    req.query?.chapterNumber,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const pathMatch = normalizePath(req).match(/\/chapter\/(\d+)|\/chapters\/(\d+)/);
  const matched = pathMatch?.[1] ?? pathMatch?.[2];
  const parsed = Number(matched);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function createAiUsageRequestMiddleware() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const requestPath = normalizePath(req);
    const operation = resolveHttpAiUsageOperation(req.method, requestPath);

    runWithAiUsageContext({
      scope: 'http',
      operationKey: operation?.key ?? 'http.unregistered',
      operationLabel: operation?.label ?? 'Unregistered HTTP AI call',
      operationRegistered: Boolean(operation),
      userId: req.auth?.id,
      username: req.auth?.username,
      userRole: req.auth?.role,
      novelId: extractNovelId(req),
      chapterNumber: extractChapterNumber(req),
      requestPath,
      requestMethod: req.method.toUpperCase(),
    }, () => next());
  };
}
