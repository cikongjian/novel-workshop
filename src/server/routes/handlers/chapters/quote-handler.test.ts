import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRegisterQuoteCleanupRoutes,
} = vi.hoisted(() => ({
  mockRegisterQuoteCleanupRoutes: vi.fn(),
}));

vi.mock('./quote-cleanup-routes.js', () => ({
  registerQuoteCleanupRoutes: mockRegisterQuoteCleanupRoutes,
}));

import { registerQuoteRoutes } from './quote-handler.js';

describe('quote handler facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers quote cleanup routes', () => {
    const router = {} as any;
    const deps = { novelManager: {} } as any;

    registerQuoteRoutes(router, deps);

    expect(mockRegisterQuoteCleanupRoutes).toHaveBeenCalledWith(router, deps);
  });
});
