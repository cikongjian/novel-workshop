/**
 * 竞态安全的异步数据加载 composable
 *
 * 解决审计中反复出现的列表/详情加载竞态：快速切换分类、翻页、切章、消息轮询时，
 * 旧请求晚到会覆盖新结果。本 composable 提供：
 * - 每次 `run` 自动 abort 上一次请求（AbortController），并在 fetcher 中可通过 signal 感知
 * - latest-only 守卫：用请求序号比对，仅当本次为最新时才写入 data/loading/error，
 *   旧请求即使 resolve 也被丢弃
 * - 卸载自动 abort（onScopeDispose），避免写已卸载组件的状态
 *
 * 典型用法：
 * ```ts
 * const { data, loading, error, run } = useAsyncData(
 *   (signal, keyword: string) => api.searchBooks(keyword, { signal }),
 * );
 * watch(keyword, (kw) => run(kw));
 * ```
 */
import { onScopeDispose, ref, type Ref } from 'vue';

export interface UseAsyncDataOptions<T> {
  /** 是否在 setup 时立即执行一次 run()（无参） */
  immediate?: boolean;
  /** data 的初始值（默认 null） */
  initial?: T;
}

export interface UseAsyncDataResult<T, P extends unknown[]> {
  /** 最新成功的结果；未加载或被取消时为 initial ?? null */
  data: Ref<T | null>;
  /** 是否正在加载（仅最新请求在途时为 true） */
  loading: Ref<boolean>;
  /** 最新请求的错误；成功或未加载时为 null */
  error: Ref<unknown>;
  /** 触发一次加载：abort 上一次、latest-only 守卫。resolve 返回结果或 null（被覆盖/失败时） */
  run: (...args: P) => Promise<T | null>;
  /** 主动中止当前在途请求 */
  abort: () => void;
  /** 重置为初始态并中止在途请求 */
  reset: () => void;
}

/**
 * @param fetcher 数据获取函数，接收 AbortSignal（用于感知取消）及 run 透传的参数
 */
export function useAsyncData<T, P extends unknown[] = []>(
  fetcher: (signal: AbortSignal, ...args: P) => Promise<T>,
  options?: UseAsyncDataOptions<T>,
): UseAsyncDataResult<T, P> {
  const initial = options?.initial ?? null;
  const data = ref(initial) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<unknown>(null);

  let controller: AbortController | null = null;
  /** 自增请求序号：每次 run/reset/卸载自增，使旧的在途请求结果失效 */
  let runId = 0;

  function abort(): void {
    if (controller) {
      controller.abort();
      controller = null;
    }
  }

  async function run(...args: P): Promise<T | null> {
    // 取消上一次请求
    abort();
    controller = new AbortController();
    const currentSignal = controller.signal;
    const currentRunId = ++runId;

    loading.value = true;
    error.value = null;

    try {
      const result = await fetcher(currentSignal, ...args);
      // 仅当本次仍为最新时才写入（防旧请求覆盖新结果）
      if (currentRunId !== runId) return result;
      data.value = result;
      return result;
    } catch (err) {
      // 旧请求的错误一律丢弃
      if (currentRunId !== runId) return null;
      error.value = err;
      return null;
    } finally {
      // 仅当本次仍为最新时才结束 loading（否则新请求在管 loading）
      if (currentRunId === runId) {
        loading.value = false;
        controller = null;
      }
    }
  }

  function reset(): void {
    abort();
    runId++; // 让任何在途请求失效
    data.value = initial;
    loading.value = false;
    error.value = null;
  }

  if (options?.immediate) {
    void run(...([] as unknown[] as P));
  }

  // 卸载（组件 unmount 或 effectScope 销毁）时中止在途请求，防止写已卸载组件的状态
  onScopeDispose(() => {
    abort();
    runId++;
  });

  return { data, loading, error, run, abort, reset };
}
