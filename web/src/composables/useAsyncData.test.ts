import { describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { useAsyncData } from './useAsyncData';

/** 受控 promise：可在外部手动 resolve/reject */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 永不 resolve 的 promise（用于测试在途请求被 abort） */
const never = <T>(): Promise<T> => new Promise<T>(() => {});

describe('useAsyncData', () => {
  it('基本加载：loading → data → loading 结束', async () => {
    const fetcher = vi.fn(async (_s: AbortSignal, q: string) => `result:${q}`);
    const scope = effectScope();
    const api = scope.run(() => useAsyncData<string, [string]>(fetcher))!;

    expect(api.data.value).toBeNull();
    expect(api.loading.value).toBe(false);

    const p = api.run('a');
    expect(api.loading.value).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(expect.any(AbortSignal), 'a');

    await p;
    expect(api.data.value).toBe('result:a');
    expect(api.loading.value).toBe(false);
    expect(api.error.value).toBeNull();

    scope.stop();
  });

  it('latest-only：连发两次 run，慢的旧请求结果不覆盖新的', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    let calls = 0;
    const fetcher = (_s: AbortSignal) => {
      calls++;
      return calls === 1 ? slow.promise : fast.promise;
    };
    const scope = effectScope();
    const api = scope.run(() => useAsyncData<string, []>(fetcher))!;

    api.run(); // run#1 → slow
    const p2 = api.run(); // run#2 → fast，并 abort run#1（runId 自增到 2）
    expect(api.loading.value).toBe(true);

    fast.resolve('fast');
    await p2;
    expect(api.data.value).toBe('fast');

    // 旧的 slow 请求晚到，结果必须被丢弃
    slow.resolve('slow');
    await nextTick();
    expect(api.data.value).toBe('fast');
    expect(api.loading.value).toBe(false);

    scope.stop();
  });

  it('abort：再次 run 时上一次请求的 signal 被置为 aborted', async () => {
    const signals: AbortSignal[] = [];
    const fetcher = (signal: AbortSignal) => {
      signals.push(signal);
      return never<string>();
    };
    const scope = effectScope();
    const api = scope.run(() => useAsyncData<string, []>(fetcher))!;

    api.run();
    expect(signals[0].aborted).toBe(false);

    api.run(); // 触发上一次 abort
    expect(signals[0].aborted).toBe(true); // 第一次的 signal 已 abort
    expect(signals[1].aborted).toBe(false); // 第二次的 signal 仍活跃

    scope.stop();
  });

  it('错误：失败写入 error，loading 结束', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('boom');
    });
    const scope = effectScope();
    const api = scope.run(() => useAsyncData<string, []>(fetcher))!;

    const result = await api.run();
    expect(result).toBeNull();
    expect(api.error.value).toBeInstanceOf(Error);
    expect((api.error.value as Error).message).toBe('boom');
    expect(api.data.value).toBeNull();
    expect(api.loading.value).toBe(false);

    scope.stop();
  });

  it('latest-only：旧请求的错误也不会写入 error', async () => {
    const slow = deferred<string>();
    const fast = deferred<string>();
    let calls = 0;
    const fetcher = (_s: AbortSignal) => {
      calls++;
      return calls === 1 ? slow.promise : fast.promise;
    };
    const scope = effectScope();
    const api = scope.run(() => useAsyncData<string, []>(fetcher))!;

    api.run(); // run#1 → slow
    const p2 = api.run(); // run#2 → fast
    fast.resolve('fast');
    await p2;
    expect(api.data.value).toBe('fast');
    expect(api.error.value).toBeNull();

    // 旧的 slow 请求失败，错误必须被丢弃
    slow.reject(new Error('old boom'));
    await nextTick();
    expect(api.data.value).toBe('fast'); // 仍为新的结果
    expect(api.error.value).toBeNull(); // 旧错误未污染

    scope.stop();
  });

  it('immediate：setup 时立即执行一次', async () => {
    const fetcher = vi.fn(async () => 'imm');
    const scope = effectScope();
    scope.run(() => useAsyncData<string, []>(fetcher, { immediate: true }))!;
    expect(fetcher).toHaveBeenCalledTimes(1);
    await nextTick();
    scope.stop();
  });

  it('reset：重置状态并中止在途请求', async () => {
    const signals: AbortSignal[] = [];
    const fetcher = (signal: AbortSignal) => {
      signals.push(signal);
      return never<string>();
    };
    const scope = effectScope();
    const api = scope.run(() => useAsyncData<string, []>(fetcher, { initial: 'init' }))!;

    expect(api.data.value).toBe('init');
    api.run();
    expect(api.loading.value).toBe(true);
    expect(signals[0].aborted).toBe(false);

    api.reset();
    expect(api.data.value).toBe('init');
    expect(api.loading.value).toBe(false);
    expect(api.error.value).toBeNull();
    expect(signals[0].aborted).toBe(true); // reset 中止在途请求

    scope.stop();
  });

  it('卸载（scope.stop）时中止在途请求', async () => {
    const signals: AbortSignal[] = [];
    const fetcher = (signal: AbortSignal) => {
      signals.push(signal);
      return never<string>();
    };
    const scope = effectScope();
    const api = scope.run(() => useAsyncData<string, []>(fetcher))!;

    api.run();
    expect(signals[0].aborted).toBe(false);

    scope.stop(); // 触发 onScopeDispose → abort
    expect(signals[0].aborted).toBe(true);
  });

  it('手动 abort：中止当前在途请求', async () => {
    const signals: AbortSignal[] = [];
    const fetcher = (signal: AbortSignal) => {
      signals.push(signal);
      return never<string>();
    };
    const scope = effectScope();
    const api = scope.run(() => useAsyncData<string, []>(fetcher))!;

    api.run();
    expect(signals[0].aborted).toBe(false);
    api.abort();
    expect(signals[0].aborted).toBe(true);

    scope.stop();
  });
});
