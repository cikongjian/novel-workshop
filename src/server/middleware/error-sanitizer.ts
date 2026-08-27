import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('error-sanitizer');

/**
 * 错误响应脱敏中间件
 * 生产环境移除可能包含敏感信息的 details 字段
 */
export function errorSanitizer() {
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      const body: Record<string, unknown> = {
        error: err.message,
        code: err.code,
      };

      // 仅在开发环境返回 details
      if (process.env.NODE_ENV !== 'production' && err.details) {
        body.details = err.details;
      }

      res.status(err.statusCode).json(body);

      // 5xx 错误记录完整信息到日志
      if (err.statusCode >= 500) {
        log.error('服务端错误', {
          code: err.code,
          error: err.message,
          stack: err.stack,
          path: req.path,
          method: req.method,
        });
      }
    } else {
      // Express 5 默认 404（路由未匹配时产生）
      const httpStatus = 'status' in err ? (err as { status: number }).status : 0;
      if (httpStatus === 404) {
        res.status(404).json({ error: 'Not Found', code: 'NOT_FOUND' });
        return;
      }
      // 未知错误：不暴露内部信息
      log.error('未处理的请求错误', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
      });
      res.status(500).json({
        error: '服务器内部错误',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}
