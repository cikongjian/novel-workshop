import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRegisterOutlineGenerateRoutes,
  mockRegisterOutlineExtendRoutes,
  mockRegisterOutlineSyncRoutes,
  mockRegisterOutlineAnalyzeRoutes,
} = vi.hoisted(() => ({
  mockRegisterOutlineGenerateRoutes: vi.fn(),
  mockRegisterOutlineExtendRoutes: vi.fn(),
  mockRegisterOutlineSyncRoutes: vi.fn(),
  mockRegisterOutlineAnalyzeRoutes: vi.fn(),
}));

vi.mock('./generate-routes.js', () => ({
  registerOutlineGenerateRoutes: mockRegisterOutlineGenerateRoutes,
}));

vi.mock('./extend-routes.js', () => ({
  registerOutlineExtendRoutes: mockRegisterOutlineExtendRoutes,
}));

vi.mock('./sync-routes.js', () => ({
  registerOutlineSyncRoutes: mockRegisterOutlineSyncRoutes,
}));

vi.mock('./analyze-routes.js', () => ({
  registerOutlineAnalyzeRoutes: mockRegisterOutlineAnalyzeRoutes,
}));

import { registerOutlineAiRoutes } from './ai-routes.js';

describe('outline ai routes facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers generate, extend, sync, and analyze route modules', () => {
    const router = {} as any;
    const deps = {} as any;

    registerOutlineAiRoutes(router, deps);

    expect(mockRegisterOutlineGenerateRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterOutlineExtendRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterOutlineSyncRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterOutlineAnalyzeRoutes).toHaveBeenCalledWith(router, deps);
  });
});
