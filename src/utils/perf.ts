import { createLogger } from './logger.js';

type PerfMetaValue = string | number | boolean | null | undefined;

export type PerfMeta = Record<string, PerfMetaValue>;

type PerfSummaryState = {
  metric: string;
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  lastAt: string;
  slowCount: number;
};

export type PerfSummary = PerfSummaryState & {
  avgMs: number;
};

export type PerfEvent = {
  metric: string;
  durationMs: number;
  recordedAt: string;
  meta?: PerfMeta;
};

const perfLogger = createLogger('perf');
const perfSummaries = new Map<string, PerfSummaryState>();
const recentSlowEvents: PerfEvent[] = [];

const DEFAULT_SLOW_MS = 250;
const MAX_RECENT_SLOW_EVENTS = 50;

function isPerfLoggingEnabled(): boolean {
  return process.env.PERF_LOGGING !== 'false';
}

function isPerfVerboseEnabled(): boolean {
  return process.env.PERF_VERBOSE === 'true';
}

function resolveThreshold(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 0) {
    return override;
  }

  const parsed = Number.parseInt(process.env.PERF_SLOW_MS ?? `${DEFAULT_SLOW_MS}`, 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  return DEFAULT_SLOW_MS;
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * 100) / 100;
}

function pushSlowEvent(event: PerfEvent): void {
  recentSlowEvents.push(event);
  if (recentSlowEvents.length > MAX_RECENT_SLOW_EVENTS) {
    recentSlowEvents.splice(0, recentSlowEvents.length - MAX_RECENT_SLOW_EVENTS);
  }
}

function updateSummary(metric: string, durationMs: number, recordedAt: string, isSlow: boolean): void {
  const summary = perfSummaries.get(metric) ?? {
    metric,
    count: 0,
    totalMs: 0,
    maxMs: 0,
    lastMs: 0,
    lastAt: recordedAt,
    slowCount: 0,
  };

  summary.count += 1;
  summary.totalMs += durationMs;
  summary.maxMs = Math.max(summary.maxMs, durationMs);
  summary.lastMs = durationMs;
  summary.lastAt = recordedAt;
  if (isSlow) {
    summary.slowCount += 1;
  }

  perfSummaries.set(metric, summary);
}

export function recordPerf(
  metric: string,
  durationMs: number,
  options?: {
    slowMs?: number;
    meta?: PerfMeta;
  },
): void {
  if (!isPerfLoggingEnabled()) {
    return;
  }

  const roundedMs = roundDuration(durationMs);
  const thresholdMs = resolveThreshold(options?.slowMs);
  const recordedAt = new Date().toISOString();
  const isSlow = roundedMs >= thresholdMs;

  updateSummary(metric, roundedMs, recordedAt, isSlow);

  if (isSlow) {
    pushSlowEvent({
      metric,
      durationMs: roundedMs,
      recordedAt,
      meta: options?.meta,
    });
    perfLogger.warn(`slow ${metric}`, {
      durationMs: roundedMs,
      slowMs: thresholdMs,
      ...options?.meta,
    });
    return;
  }

  if (isPerfVerboseEnabled()) {
    perfLogger.debug(metric, {
      durationMs: roundedMs,
      ...options?.meta,
    });
  }
}

export async function measurePerf<T>(
  metric: string,
  action: () => Promise<T> | T,
  options?: {
    slowMs?: number;
    meta?: PerfMeta;
  },
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await action();
  } finally {
    recordPerf(metric, Date.now() - startedAt, options);
  }
}

export function getPerfSnapshot(options?: {
  limit?: number;
  recentSlowLimit?: number;
}): {
  metrics: PerfSummary[];
  recentSlow: PerfEvent[];
} {
  const limit = options?.limit ?? 20;
  const recentSlowLimit = options?.recentSlowLimit ?? 10;

  const metrics = [...perfSummaries.values()]
    .map((summary) => ({
      ...summary,
      avgMs: roundDuration(summary.totalMs / Math.max(summary.count, 1)),
      totalMs: roundDuration(summary.totalMs),
      maxMs: roundDuration(summary.maxMs),
      lastMs: roundDuration(summary.lastMs),
    }))
    .sort((a, b) => b.totalMs - a.totalMs || b.maxMs - a.maxMs)
    .slice(0, limit);

  const recentSlow = recentSlowEvents.slice(-recentSlowLimit);

  return { metrics, recentSlow };
}
