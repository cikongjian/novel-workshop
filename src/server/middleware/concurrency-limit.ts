import type { Request, Response, NextFunction } from 'express';

export interface ConcurrencyLimitOptions {
  /** Max in-flight requests per key */
  max?: number;
  /** Restrict limiter to specific methods (upper-case), default: all */
  methods?: string[];
  /** Build key from request, default: req.ip */
  keyFn?: (req: Request) => string;
  /** Paths to skip (exact match on req.path), e.g. ['/suggestions'] */
  skipPaths?: string[];
}

export function concurrencyLimit(options: ConcurrencyLimitOptions = {}) {
  const max = normalizePositiveInt(options.max, 2);
  const allowedMethods = normalizeMethodSet(options.methods);
  const keyFn = options.keyFn ?? ((req: Request) => req.ip ?? 'unknown');
  const skipSet = options.skipPaths?.length ? new Set(options.skipPaths) : null;
  const inFlight = new Map<string, number>();

  return (req: Request, res: Response, next: NextFunction) => {
    if (allowedMethods && !allowedMethods.has(req.method.toUpperCase())) {
      next();
      return;
    }

    if (skipSet?.has(req.path)) {
      next();
      return;
    }

    const key = keyFn(req) || 'unknown';
    const current = inFlight.get(key) ?? 0;
    if (current >= max) {
      res.status(429).json({
        error: '并发请求过多，请稍后重试',
        code: 'CONCURRENCY_LIMIT_EXCEEDED',
        limit: max,
      });
      return;
    }

    inFlight.set(key, current + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(guardTimer);
      const latest = inFlight.get(key) ?? 0;
      if (latest <= 1) inFlight.delete(key);
      else inFlight.set(key, latest - 1);
    };

    // 守护定时器：防止 handler 挂起或网络异常导致槽位永久占用（10 分钟上限）
    const SLOT_MAX_HOLD_MS = 10 * 60 * 1000;
    const guardTimer = setTimeout(release, SLOT_MAX_HOLD_MS);

    res.on('finish', release);
    res.on('close', release);
    next();
  };
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const next = Math.floor(Number(value));
  if (next <= 0) return fallback;
  return next;
}

function normalizeMethodSet(methods: string[] | undefined): Set<string> | null {
  if (!Array.isArray(methods) || methods.length === 0) return null;
  const normalized = methods
    .map((m) => (typeof m === 'string' ? m.trim().toUpperCase() : ''))
    .filter(Boolean);
  if (normalized.length === 0) return null;
  return new Set(normalized);
}
