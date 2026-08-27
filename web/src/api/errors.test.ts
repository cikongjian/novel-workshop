import { describe, expect, it } from 'vitest';
import type { AxiosError } from 'axios';
import { extractApiErrorMessage, isAbortError, type ApiErrorBody } from './errors';

/** 构造一个带响应体的 axios 错误 */
function axiosError(data: ApiErrorBody | undefined, status = 500): AxiosError<ApiErrorBody> {
  return {
    name: 'AxiosError',
    message: 'axios boom',
    isAxiosError: true,
    config: {} as never,
    response: data === undefined ? undefined : { data, status, statusText: '', headers: {}, config: {} as never },
  } as unknown as AxiosError<ApiErrorBody>;
}

describe('extractApiErrorMessage', () => {
  it('优先取后端标准字段 data.error', () => {
    expect(extractApiErrorMessage(axiosError({ error: '参数不合法' }))).toBe('参数不合法');
  });

  it('data.error 为空时回退到 data.message', () => {
    expect(extractApiErrorMessage(axiosError({ error: '  ', message: '旧字段文案' }))).toBe('旧字段文案');
  });

  it('data.error / data.message 都缺失时回退到 Error.message', () => {
    expect(extractApiErrorMessage(new Error('网络炸了'))).toBe('网络炸了');
  });

  it('无 response 的 axios 错误回退到兜底文案', () => {
    expect(extractApiErrorMessage(axiosError(undefined))).toBe('操作失败，请稍后重试');
  });

  it('非错误对象回退到自定义 fallback', () => {
    expect(extractApiErrorMessage(null, '出了点问题')).toBe('出了点问题');
    expect(extractApiErrorMessage(undefined, '出了点问题')).toBe('出了点问题');
    expect(extractApiErrorMessage({ random: 1 }, '出了点问题')).toBe('出了点问题');
  });

  it('data.error 去除首尾空白', () => {
    expect(extractApiErrorMessage(axiosError({ error: '  有空格  ' }))).toBe('有空格');
  });

  it('兼容 axios 错误同时携带 error 与 message（error 优先）', () => {
    expect(extractApiErrorMessage(axiosError({ error: 'A', message: 'B' }))).toBe('A');
  });
});

describe('isAbortError', () => {
  it('识别 name 为 AbortError 的异常（兼容 DOMException / Error 两种形态）', () => {
    class FakeAbort extends Error {
      name = 'AbortError';
    }
    expect(isAbortError(new FakeAbort())).toBe(true);
    expect(isAbortError({ name: 'AbortError' })).toBe(true);
  });

  it('普通错误返回 false', () => {
    expect(isAbortError(new Error('普通错误'))).toBe(false);
    expect(isAbortError({ name: 'TypeError' })).toBe(false);
  });

  it('null / 非对象返回 false（不抛错）', () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });
});

describe('extractApiErrorMessage 与 isAbortError 配合', () => {
  it('取消异常也能提取信息但不必然弹窗（由调用方用 isAbortError 判断）', () => {
    const abortErr: Error & { name: string } = Object.assign(new Error('canceled'), { name: 'AbortError' });
    expect(isAbortError(abortErr)).toBe(true);
    // 即使是取消异常，提取器也能给出可读信息
    expect(extractApiErrorMessage(abortErr)).toBe('canceled');
  });
});
