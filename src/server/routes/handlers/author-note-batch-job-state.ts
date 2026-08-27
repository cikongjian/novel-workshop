const runningJobs = new Map<string, AbortController>();

export function registerAuthorNoteBatch(novelId: string, controller: AbortController): void {
  runningJobs.set(novelId, controller);
}

export function clearAuthorNoteBatch(novelId: string): void {
  runningJobs.delete(novelId);
}

export function hasRunningAuthorNoteBatch(novelId: string): boolean {
  return runningJobs.has(novelId);
}

export function cancelAuthorNoteBatch(novelId: string): boolean {
  const controller = runningJobs.get(novelId);
  if (!controller) {
    return false;
  }
  controller.abort();
  runningJobs.delete(novelId);
  return true;
}
