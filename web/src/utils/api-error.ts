import axios from 'axios';
import type { ReviseChapterResponse } from '../api';

type ApiErrorPayload = {
  error?: string;
  detail?: string;
  message?: string;
};

type ReviseErrorPayload = ApiErrorPayload & {
  qualityDelta?: ReviseChapterResponse['qualityDelta'];
};

function extractApiErrorPayload(err: unknown): ApiErrorPayload | null {
  if (!axios.isAxiosError(err)) return null;
  const payload = err.response?.data;
  if (payload && typeof payload === 'object') {
    return payload as ApiErrorPayload;
  }
  if (typeof payload === 'string' && payload.trim()) {
    return { error: payload };
  }
  return null;
}

export function extractApiErrorMessage(err: unknown, fallback: string): string {
  const payload = extractApiErrorPayload(err);
  if (payload) {
    const message = payload.error || payload.detail || payload.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  if (axios.isAxiosError(err) && typeof err.message === 'string' && err.message.trim()) {
    return err.message;
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

export function isRecoverableLongRunningRequestError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  return status === 502
    || status === 504
    || status === 524
    || err.code === 'ECONNABORTED'
    || err.code === 'ERR_NETWORK';
}

export function buildReviseFailureMessage(err: unknown): string {
  const payload = extractApiErrorPayload(err) as ReviseErrorPayload | null;
  if (payload?.qualityDelta) {
    const delta = payload.qualityDelta;
    const signedDelta = `${delta.deltaOverall >= 0 ? '+' : ''}${delta.deltaOverall}`;
    const base = payload.error?.trim()
      || `修订未达到生效阈值（当前变化 ${signedDelta}）`;
    return `${base}；总分 ${delta.before.overallScore}→${delta.after.overallScore}（${signedDelta}），正文未覆盖保存`;
  }
  return extractApiErrorMessage(err, '章节修订失败');
}
