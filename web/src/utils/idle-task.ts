type IdleWindow = Window & typeof globalThis & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function scheduleIdleTask(task: () => void, timeout = 1200): () => void {
  if (typeof window === 'undefined') {
    task();
    return () => undefined;
  }

  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(() => task(), { timeout });
    return () => {
      if (typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(handle);
      }
    };
  }

  const timer = window.setTimeout(task, Math.min(timeout, 800));
  return () => {
    window.clearTimeout(timer);
  };
}
