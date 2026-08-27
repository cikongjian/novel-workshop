/**
 * 统一错误类体系
 *
 * 所有业务错误继承 AppError，全局错误中间件根据 statusCode 返回对应 HTTP 状态码。
 * 生产环境不暴露 stack，仅返回 message + code。
 */

export enum ErrorCode {
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFLICT = 'CONFLICT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMITED = 'RATE_LIMITED',
  TIMEOUT = 'TIMEOUT',
  GATE_FAILED = 'GATE_FAILED',
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  PRECONDITION_FAILED = 'PRECONDITION_FAILED',
  PORTRAIT_PATH_INVALID = 'PORTRAIT_PATH_INVALID',
  PORTRAIT_FILE_MISSING = 'PORTRAIT_FILE_MISSING',
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  requestId?: string;

  constructor(message: string, statusCode = 500, code: string = ErrorCode.INTERNAL_ERROR, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  withRequestId(requestId: string): this {
    this.requestId = requestId;
    return this;
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
    };
    if (this.details) result.details = this.details;
    if (this.requestId) result.requestId = this.requestId;
    return result;
  }
}

/** 资源不存在 (404) */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const msg = id ? `${resource} '${id}' 不存在` : `${resource} 不存在`;
    super(msg, 404, ErrorCode.NOT_FOUND);
    this.name = 'NotFoundError';
  }
}

/** 请求参数校验失败 (400) */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details);
    this.name = 'ValidationError';
  }
}

/** 资源冲突 (409) */
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, ErrorCode.CONFLICT, details);
    this.name = 'ConflictError';
  }
}

/** 服务不可用 (503) */
export class ServiceUnavailableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 503, ErrorCode.SERVICE_UNAVAILABLE, details);
    this.name = 'ServiceUnavailableError';
  }
}

/** 未认证 (401) */
export class UnauthorizedError extends AppError {
  constructor(message = '请先登录', details?: unknown) {
    super(message, 401, ErrorCode.UNAUTHORIZED, details);
    this.name = 'UnauthorizedError';
  }
}

/** 权限不足 (403) */
export class ForbiddenError extends AppError {
  constructor(message = '权限不足', details?: unknown) {
    super(message, 403, ErrorCode.FORBIDDEN, details);
    this.name = 'ForbiddenError';
  }
}

/** 限流 (429) */
export class RateLimitError extends AppError {
  readonly retryAfter?: number;

  constructor(message = '请求过于频繁，请稍后再试', retryAfter?: number) {
    super(message, 429, ErrorCode.RATE_LIMITED);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }

  toJSON(): Record<string, unknown> {
    const result = super.toJSON();
    if (this.retryAfter !== undefined) result.retryAfter = this.retryAfter;
    return result;
  }
}

/** 超时 (408) */
export class TimeoutError extends AppError {
  constructor(message = '请求超时', details?: unknown) {
    super(message, 408, ErrorCode.TIMEOUT, details);
    this.name = 'TimeoutError';
  }
}

/** 门禁未通过 (400) */
export class GateFailedError extends AppError {
  readonly gateName: string;

  constructor(gateName: string, message: string, details?: unknown) {
    super(message, 400, ErrorCode.GATE_FAILED, details);
    this.name = 'GateFailedError';
    this.gateName = gateName;
  }

  toJSON(): Record<string, unknown> {
    const result = super.toJSON();
    result.gateName = this.gateName;
    return result;
  }
}

/** 支付失败/余额不足 (402) */
export class PaymentRequiredError extends AppError {
  constructor(message = '余额不足，请充值后重试', details?: unknown) {
    super(message, 402, ErrorCode.PAYMENT_REQUIRED, details);
    this.name = 'PaymentRequiredError';
  }
}

/** 前置条件失败 (412) */
export class PreconditionFailedError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 412, ErrorCode.PRECONDITION_FAILED, details);
    this.name = 'PreconditionFailedError';
  }
}
