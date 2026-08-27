/**
 * 简易并发池：限制同时执行的 Promise 数量，支持通过 AbortSignal 取消。
 *
 * 不引入外部库；适用于批量请求节流、翻页取消等场景。
 *
 * @param items 待处理元素列表
 * @param fn 单个元素的处理函数（应自行 try/catch；抛出的异常不会中断其他任务）
 * @param limit 最大并发数，默认 3
 * @param signal 可选取消信号；触发 abort 后立即停止派发新任务
 */
export async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  limit = 3,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  const effectiveLimit = Math.max(1, Math.min(limit, items.length || 1));
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    if (signal?.aborted) return;
    const item = items[i];
    // 单个任务失败不阻塞其他任务；调用方应在 fn 内部处理错误
    const p = fn(item, i).then(
      () => { executing.delete(p); },
      () => { executing.delete(p); },
    );
    executing.add(p);
    if (executing.size >= effectiveLimit) {
      await Promise.race(executing);
      if (signal?.aborted) return;
    }
  }

  if (signal?.aborted) return;
  await Promise.all(executing);
}
