import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRegisterRewritePreviewRoutes,
  mockRegisterRewriteExecutionRoutes,
} = vi.hoisted(() => ({
  mockRegisterRewritePreviewRoutes: vi.fn(),
  mockRegisterRewriteExecutionRoutes: vi.fn(),
}));

vi.mock('./rewrite-preview-routes.js', () => ({
  registerRewritePreviewRoutes: mockRegisterRewritePreviewRoutes,
}));

vi.mock('./rewrite-execution-routes.js', () => ({
  registerRewriteExecutionRoutes: mockRegisterRewriteExecutionRoutes,
}));

import { registerRewriteRoutes } from './rewrite-handler.js';

describe('rewrite handler facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers preview and execution route modules with a shared cache', () => {
    const router = {} as any;
    const deps = {} as any;

    registerRewriteRoutes(router, deps);

    expect(mockRegisterRewritePreviewRoutes).toHaveBeenCalledTimes(1);
    expect(mockRegisterRewriteExecutionRoutes).toHaveBeenCalledTimes(1);
    expect(mockRegisterRewritePreviewRoutes).toHaveBeenCalledWith(
      router,
      deps,
      expect.any(Map),
    );
    expect(mockRegisterRewriteExecutionRoutes).toHaveBeenCalledWith(router, deps);
  });
});
