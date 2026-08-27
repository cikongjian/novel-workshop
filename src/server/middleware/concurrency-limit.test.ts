import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { concurrencyLimit } from './concurrency-limit.js';

function mockReq(ip = '127.0.0.1', method = 'POST') {
  return { ip, method, headers: {} } as any;
}

function mockRes() {
  const emitter = new EventEmitter();
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    on: vi.fn((event: string, handler: () => void) => {
      emitter.on(event, handler);
      return res;
    }),
    emit: (event: 'finish' | 'close') => {
      emitter.emit(event);
    },
  };
  return res as any;
}

describe('concurrencyLimit', () => {
  it('should block when in-flight requests exceed max', () => {
    const limiter = concurrencyLimit({ max: 1, methods: ['POST'] });
    const next = vi.fn();
    const req = mockReq('1.1.1.1', 'POST');

    const res1 = mockRes();
    limiter(req, res1, next);
    expect(next).toHaveBeenCalledTimes(1);

    const res2 = mockRes();
    limiter(req, res2, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res2.status).toHaveBeenCalledWith(429);
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CONCURRENCY_LIMIT_EXCEEDED' }),
    );
  });

  it('should release slot after response finish', () => {
    const limiter = concurrencyLimit({ max: 1, methods: ['POST'] });
    const next = vi.fn();
    const req = mockReq('2.2.2.2', 'POST');

    const res1 = mockRes();
    limiter(req, res1, next);
    expect(next).toHaveBeenCalledTimes(1);

    res1.emit('finish');

    const res2 = mockRes();
    limiter(req, res2, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res2.status).not.toHaveBeenCalled();
  });

  it('should ignore methods not in allow-list', () => {
    const limiter = concurrencyLimit({ max: 1, methods: ['POST'] });
    const next = vi.fn();

    limiter(mockReq('3.3.3.3', 'GET'), mockRes(), next);
    limiter(mockReq('3.3.3.3', 'GET'), mockRes(), next);

    expect(next).toHaveBeenCalledTimes(2);
  });
});
