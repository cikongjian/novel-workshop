const maintenanceLocks = new Map<string, Promise<void>>();

export async function withNovelMaintenanceLock<T>(
  novelId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = maintenanceLocks.get(novelId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => current, () => current);
  maintenanceLocks.set(novelId, tail);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (maintenanceLocks.get(novelId) === tail) maintenanceLocks.delete(novelId);
  }
}
