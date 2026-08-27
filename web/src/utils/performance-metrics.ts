type PerfEvent = {
  name: string;
  durationMs: number;
  recordedAt: string;
  meta?: Record<string, unknown>;
};

type PerfStore = {
  events: PerfEvent[];
};

export type BrowserPerfToken = {
  name: string;
  startedAt: number;
  meta?: Record<string, unknown>;
};

declare global {
  interface Window {
    __NW_PERF_METRICS__?: PerfStore;
  }
}

const PERF_STORAGE_KEY = 'nw:perf:debug';
const MAX_EVENTS = 50;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof performance !== 'undefined';
}

function isPerfDebugEnabled(): boolean {
  if (!isBrowser()) {
    return false;
  }

  if (import.meta.env.DEV) {
    return true;
  }

  try {
    if (window.localStorage.getItem(PERF_STORAGE_KEY) === '1') {
      return true;
    }
  } catch {
    return false;
  }

  return new URLSearchParams(window.location.search).has('perf');
}

function getPerfStore(): PerfStore | null {
  if (!isBrowser()) {
    return null;
  }

  if (!window.__NW_PERF_METRICS__) {
    window.__NW_PERF_METRICS__ = { events: [] };
  }

  return window.__NW_PERF_METRICS__;
}

function recordBrowserPerf(name: string, durationMs: number, meta?: Record<string, unknown>): void {
  const store = getPerfStore();
  if (!store) {
    return;
  }

  const event: PerfEvent = {
    name,
    durationMs: Math.round(durationMs * 100) / 100,
    recordedAt: new Date().toISOString(),
    meta,
  };

  store.events.push(event);
  if (store.events.length > MAX_EVENTS) {
    store.events.splice(0, store.events.length - MAX_EVENTS);
  }

  if (isPerfDebugEnabled()) {
    console.info(`[perf] ${name}`, event);
  }
}

export function startBrowserPerf(name: string, meta?: Record<string, unknown>): BrowserPerfToken | null {
  if (!isBrowser()) {
    return null;
  }

  return {
    name,
    startedAt: performance.now(),
    meta,
  };
}

export function finishBrowserPerf(
  token: BrowserPerfToken | null,
  meta?: Record<string, unknown>,
): number | null {
  if (!token || !isBrowser()) {
    return null;
  }

  const durationMs = performance.now() - token.startedAt;
  recordBrowserPerf(token.name, durationMs, {
    ...token.meta,
    ...meta,
  });
  return durationMs;
}
