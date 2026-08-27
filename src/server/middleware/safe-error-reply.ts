/**
 * 安全错误响应工具函数
 *
 * 统一路由 handler 中 catch 块的错误响应行为：
 * - AppError（含子类）：保留 statusCode 和 message（这些是开发者预设的用户友好消息）
 * - 其他 Error：仅返回 fallback 消息，不暴露 err.message
 * - 生产环境：一律不暴露 error.stack / error.message（除非 AppError）
 * - 开发环境：对非 AppError 也暴露 err.message（便于调试）
 */

import type { Response } from 'express';
import { AppError, ErrorCode } from '../errors.js';

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * 安全地回复错误响应。
 * 在路由 handler 的 catch 块中使用，替代 `res.status(500).json({ error: err.message })`。
 *
 * @param res Express Response 对象
 * @param err 捕获的错误
 * @param fallbackMessage 默认错误消息（非 AppError 时使用）
 */
export function safeErrorReply(res: Response, err: unknown, fallbackMessage: string): void {
  if (err instanceof AppError) {
    const body = err.toJSON();
    if (!IS_DEV) {
      delete body.details;
    }
    res.status(err.statusCode).json(body);
    return;
  }

  if (IS_DEV && err instanceof Error) {
    res.status(500).json({
      error: err.message,
      code: ErrorCode.INTERNAL_ERROR,
      statusCode: 500,
    });
    return;
  }

  res.status(500).json({
    error: fallbackMessage,
    code: ErrorCode.INTERNAL_ERROR,
    statusCode: 500,
  });
}

/**
 * 安全地获取错误消息。
 * 用于需要将错误消息嵌入 JSON 的场景（如 `{ error: getMessage(err, 'xxx失败') }`）。
 * 非开发环境下对非 AppError 只返回 fallback。
 */
export function safeErrorMessage(err: unknown, fallbackMessage: string): string {
  if (err instanceof AppError) return err.message;
  if (IS_DEV && err instanceof Error) return err.message;
  return fallbackMessage;
}

/**
 * 将任意错误转换为 AppError。
 * 如果已经是 AppError 则直接返回，否则包装为 INTERNAL_ERROR。
 */
export function toAppError(err: unknown, fallbackMessage = '服务器内部错误'): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) {
    return new AppError(IS_DEV ? err.message : fallbackMessage, 500, ErrorCode.INTERNAL_ERROR);
  }
  return new AppError(fallbackMessage, 500, ErrorCode.INTERNAL_ERROR);
}

/**
 * 检查是否是已知的错误类型。
 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/**
 * 创建标准化的错误响应对象。
 */
export function createErrorResponse(err: unknown, fallbackMessage: string): {
  error: string;
  code: string;
  statusCode: number;
  details?: unknown;
  requestId?: string;
} {
  if (err instanceof AppError) {
    const body = err.toJSON();
    if (!IS_DEV) {
      delete body.details;
    }
    return body as {
      error: string;
      code: string;
      statusCode: number;
      details?: unknown;
      requestId?: string;
    };
  }

  if (IS_DEV && err instanceof Error) {
    return {
      error: err.message,
      code: ErrorCode.INTERNAL_ERROR,
      statusCode: 500,
    };
  }

  return {
    error: fallbackMessage,
    code: ErrorCode.INTERNAL_ERROR,
    statusCode: 500,
  };
}
