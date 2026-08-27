/**
 * Zod 请求验证中间件
 *
 * 用法：
 *   router.post('/foo', validate({ body: FooSchema }), handler);
 *   router.get('/foo/:id', validate({ params: z.object({ id: z.string().uuid() }) }), handler);
 */

import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors.js';

export interface ValidateSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

/**
 * 将 ZodError 转为可读的字段级错误列表
 */
function formatZodError(err: ZodError): Array<{ path: string; message: string }> {
  return err.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * 创建验证中间件
 */
export function validate(schemas: ValidateSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          throw new ValidationError('路径参数校验失败', formatZodError(result.error));
        }
        // 将解析后的值回写（Zod 可能做了类型转换）
        Object.assign(req.params, result.data);
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          throw new ValidationError('查询参数校验失败', formatZodError(result.error));
        }
        (req as unknown as Record<string, unknown>).validatedQuery = result.data;
      }

      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          throw new ValidationError('请求体校验失败', formatZodError(result.error));
        }
        req.body = result.data;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
