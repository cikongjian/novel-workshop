import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRegisterGenerateChapterRoutes,
  mockRegisterReviseChapterRoutes,
  mockRegisterResizeChapterRoutes,
} = vi.hoisted(() => ({
  mockRegisterGenerateChapterRoutes: vi.fn(),
  mockRegisterReviseChapterRoutes: vi.fn(),
  mockRegisterResizeChapterRoutes: vi.fn(),
}));

vi.mock('./chapter-generate-routes.js', () => ({
  registerGenerateChapterRoutes: mockRegisterGenerateChapterRoutes,
}));

vi.mock('./chapter-revise-routes.js', () => ({
  registerReviseChapterRoutes: mockRegisterReviseChapterRoutes,
}));

vi.mock('./chapter-resize-routes.js', () => ({
  registerResizeChapterRoutes: mockRegisterResizeChapterRoutes,
}));

import { registerChapterRoutes } from './chapter-handler.js';

describe('chapter handler facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers generate, revise, and resize route modules', () => {
    const router = {} as any;
    const deps = {} as any;

    registerChapterRoutes(router, deps);

    expect(mockRegisterGenerateChapterRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterReviseChapterRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterResizeChapterRoutes).toHaveBeenCalledWith(router, deps);
  });
});
