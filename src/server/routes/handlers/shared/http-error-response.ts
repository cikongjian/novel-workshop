import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

type ErrorPayload = {
  error: string;
  code?: string;
};

function readNumericStatus(value: unknown): number | undefined {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined;
}

export function resolveHttpErrorStatus(error: unknown, fallbackStatus = 500): number {
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  return readNumericStatus(candidate?.statusCode)
    ?? readNumericStatus(candidate?.status)
    ?? readNumericStatus(candidate?.response?.status)
    ?? fallbackStatus;
}

function readErrorCode(error: unknown): string | undefined {
  const candidate = error as {
    code?: unknown;
    error?: { code?: unknown };
    response?: { data?: { code?: unknown; error?: { code?: unknown } } };
  };
  const raw = candidate?.code
    ?? candidate?.error?.code
    ?? candidate?.response?.data?.code
    ?? candidate?.response?.data?.error?.code;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

function withStatusHint(statusCode: number, fallbackMessage: string): string {
  switch (statusCode) {
    case 400:
    case 422:
      return `${fallbackMessage}：上游 AI 服务不接受当前请求参数，请检查模型、尺寸或代理兼容性`;
    case 401:
    case 403:
      return `${fallbackMessage}：上游 AI 服务鉴权失败，请检查 API Key 与代理地址`;
    case 404:
      return `${fallbackMessage}：上游 AI 服务未找到模型或接口，请检查模型名与 /v1 地址`;
    case 408:
    case 504:
      return `${fallbackMessage}：上游 AI 服务响应超时，请稍后重试`;
    case 429:
      return `${fallbackMessage}：上游 AI 服务限流或额度不足`;
    case 502:
    case 503:
      return `${fallbackMessage}：上游 AI 服务暂不可用`;
    default:
      return fallbackMessage;
  }
}

export function buildHttpErrorResponse(
  error: unknown,
  fallbackMessage: string,
): { statusCode: number; payload: ErrorPayload } {
  const statusCode = resolveHttpErrorStatus(error);
  const safeMessage = safeErrorMessage(error, fallbackMessage);
  const message = safeMessage === fallbackMessage
    ? withStatusHint(statusCode, fallbackMessage)
    : safeMessage;
  const code = readErrorCode(error);

  return {
    statusCode,
    payload: {
      error: message,
      ...(code ? { code } : {}),
    },
  };
}
