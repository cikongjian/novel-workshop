/**
 * 统一的 API 错误归一化工具
 *
 * 后端错误响应标准形状为 `{ error, code }`（见 src/api/http.ts 响应拦截器读取的
 * `error.response.data.error`）。但历史组件普遍读取 `data.message`，导致拿不到真实
 * 错误信息、退回兜底文案。本工具集中处理：优先取 `data.error`，兼容 `data.message`，
 * 再退回 Error.message，最后兜底。
 *
 * 配合 `catch (err: unknown)` 使用，可消除 `catch (error: any)` 的类型逃逸，并修复
 * 错误字段不一致问题。
 */
import type { AxiosError } from 'axios';

/** 后端错误响应体形状 */
export interface ApiErrorBody {
  error?: string;
  message?: string;
  code?: string;
}

/** 兜底文案 */
const DEFAULT_FALLBACK = '操作失败，请稍后重试';

/**
 * 从任意 catch 到的异常中提取可展示给用户的错误信息。
 *
 * 解析顺序：
 * 1. axios 响应体 `data.error`（后端标准字段）
 * 2. axios 响应体 `data.message`（兼容旧字段）
 * 3. `Error.message`
 * 4. 兜底文案
 */
export function extractApiErrorMessage(err: unknown, fallback: string = DEFAULT_FALLBACK): string {
  const body = (err as AxiosError<ApiErrorBody> | null)?.response?.data;
  if (body) {
    if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * 判断异常是否为 AbortController 主动取消。
 * 调用方通常应静默忽略此类异常（用户主动发起新请求或组件卸载导致），不应弹错误提示。
 *
 * 注意：abort 异常在浏览器中是 DOMException、在 Node/axios 中可能是普通 Error，
 * 且 DOMException 在部分环境并非全局对象，故统一按 `name === 'AbortError'` 判定，
 * 避免直接引用 DOMException 导致 ReferenceError。
 */
export function isAbortError(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false;
  return (err as { name?: unknown }).name === 'AbortError';
}
