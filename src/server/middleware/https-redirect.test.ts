import { describe, expect, it, vi } from 'vitest';
import { createHttpsRedirect } from './https-redirect.js';

function createResponse() {
  return { redirect: vi.fn() } as any;
}

describe('createHttpsRedirect', () => {
  it('leaves the container health endpoint on HTTP', () => {
    const middleware = createHttpsRedirect('example.com');
    const response = createResponse();
    const next = vi.fn();

    middleware({ path: '/api/health', secure: false, headers: {}, url: '/api/health' } as any, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.redirect).not.toHaveBeenCalled();
  });

  it('redirects ordinary HTTP requests to the configured host', () => {
    const middleware = createHttpsRedirect('example.com');
    const response = createResponse();
    const next = vi.fn();

    middleware({ path: '/m', secure: false, headers: {}, url: '/m?from=test' } as any, response, next);

    expect(response.redirect).toHaveBeenCalledWith(301, 'https://example.com/m?from=test');
    expect(next).not.toHaveBeenCalled();
  });
});
