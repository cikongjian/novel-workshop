import type { NextFunction, Request, Response } from 'express';
import { recordPerf } from '../../utils/perf.js';

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const LONG_HEX_SEGMENT_PATTERN = /\/[0-9a-f]{24,}(?=\/|$)/gi;
const NUMERIC_SEGMENT_PATTERN = /\/\d+(?=\/|$)/g;

function normalizePath(pathname: string): string {
  return pathname
    .split('?')[0]
    .replace(UUID_PATTERN, ':id')
    .replace(LONG_HEX_SEGMENT_PATTERN, '/:id')
    .replace(NUMERIC_SEGMENT_PATTERN, '/:id');
}

function resolveRequestMetric(req: Request): string {
  const normalizedPath = normalizePath(req.originalUrl || req.url || '');
  return `http ${req.method.toUpperCase()} ${normalizedPath || '/'}`;
}

function resolveHttpSlowThreshold(): number {
  const parsed = Number.parseInt(process.env.PERF_HTTP_SLOW_MS ?? '500', 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return 500;
}

export function createRequestPerformanceMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = Date.now();

    res.on('finish', () => {
      recordPerf(resolveRequestMetric(req), Date.now() - startedAt, {
        slowMs: resolveHttpSlowThreshold(),
        meta: {
          statusCode: res.statusCode,
        },
      });
    });

    next();
  };
}
