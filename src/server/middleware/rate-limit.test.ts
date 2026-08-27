/**
 * 速率限制中间件测试
 */
import { describe, it, expect, vi } from 'vitest';
import { rateLimit } from './rate-limit.js';

function mockReq(ip = '127.0.0.1') {
  return { ip } as any;
}

function mockRes() {
  const headers: Record<string, string | number> = {};
  const res = {
    setHeader: vi.fn((key: string, val: string | number) => { headers[key] = val; }),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    _headers: headers,
  };
  return res as any;
}

describe('rateLimit', () => {
  it('should allow requests within limit', () => {
    const limiter = rateLimit({ max: 3, windowMs: 60_000 });
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    limiter(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 2);
  });

  it('should block requests exceeding limit', () => {
    const limiter = rateLimit({ max: 2, windowMs: 60_000 });
    const req = mockReq();
    const next = vi.fn();

    // 第 1、2 次通过
    limiter(req, mockRes(), next);
    limiter(req, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);

    // 第 3 次被拒
    const res3 = mockRes();
    limiter(req, res3, next);
    expect(next).toHaveBeenCalledTimes(2); // 没有增加
    expect(res3.status).toHaveBeenCalledWith(429);
    expect(res3.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RATE_LIMIT_EXCEEDED' }),
    );
  });

  it('should track different IPs separately', () => {
    const limiter = rateLimit({ max: 1, windowMs: 60_000 });
    const next = vi.fn();

    limiter(mockReq('1.1.1.1'), mockRes(), next);
    limiter(mockReq('2.2.2.2'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
