/**
 * Zod 验证中间件测试
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validate } from './validate.js';
import { ValidationError } from '../errors.js';

function mockReq(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as any;
}

function mockRes() {
  return {} as any;
}

describe('validate middleware', () => {
  it('should pass when body matches schema', () => {
    const schema = z.object({ name: z.string() });
    const req = mockReq({ body: { name: 'test' } });
    const next = vi.fn();

    validate({ body: schema })(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'test' });
  });

  it('should call next with ValidationError when body is invalid', () => {
    const schema = z.object({ name: z.string() });
    const req = mockReq({ body: { name: 123 } });
    const next = vi.fn();

    validate({ body: schema })(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
  });

  it('should validate params', () => {
    const schema = z.object({ id: z.string().min(1) });
    const req = mockReq({ params: { id: '' } });
    const next = vi.fn();

    validate({ params: schema })(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toContain('路径参数');
  });

  it('should validate query', () => {
    const schema = z.object({ page: z.coerce.number().int().positive() });
    const req = mockReq({ query: { page: 'abc' } });
    const next = vi.fn();

    validate({ query: schema })(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('should strip unknown fields from body', () => {
    const schema = z.object({ name: z.string() }).strict();
    const req = mockReq({ body: { name: 'test', extra: true } });
    const next = vi.fn();

    validate({ body: schema })(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
  });
});
