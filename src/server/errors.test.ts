/**
 * 自定义错误类测试
 */
import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  ServiceUnavailableError,
} from './errors.js';

describe('AppError', () => {
  it('should have correct defaults', () => {
    const err = new AppError('test');
    expect(err.message).toBe('test');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('should accept custom statusCode and code', () => {
    const err = new AppError('custom', 418, 'TEAPOT');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
  });
});

describe('NotFoundError', () => {
  it('should produce 404 with resource name', () => {
    const err = new NotFoundError('小说');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('小说 不存在');
  });

  it('should include id when provided', () => {
    const err = new NotFoundError('章节', '42');
    expect(err.message).toBe("章节 '42' 不存在");
  });
});

describe('ValidationError', () => {
  it('should produce 400 with details', () => {
    const details = [{ path: 'name', message: '不能为空' }];
    const err = new ValidationError('校验失败', details);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual(details);
  });
});

describe('ConflictError', () => {
  it('should produce 409', () => {
    const err = new ConflictError('已存在');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });
});

describe('ServiceUnavailableError', () => {
  it('should produce 503', () => {
    const err = new ServiceUnavailableError('服务不可用');
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
  });
});
