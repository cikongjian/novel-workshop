import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRegisterAuthorNoteBatchDetectRoutes,
  mockRegisterAuthorNoteBatchJobRoutes,
} = vi.hoisted(() => ({
  mockRegisterAuthorNoteBatchDetectRoutes: vi.fn(),
  mockRegisterAuthorNoteBatchJobRoutes: vi.fn(),
}));

vi.mock('./author-note-batch-detect-routes.js', () => ({
  registerAuthorNoteBatchDetectRoutes: mockRegisterAuthorNoteBatchDetectRoutes,
}));

vi.mock('./author-note-batch-job-routes.js', () => ({
  registerAuthorNoteBatchJobRoutes: mockRegisterAuthorNoteBatchJobRoutes,
}));

import { registerAuthorNoteBatchRoutes } from './author-note-batch-handler.js';

describe('author note batch handler facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers detect and job route modules', () => {
    const router = {} as any;
    const deps = {} as any;

    registerAuthorNoteBatchRoutes(router, deps);

    expect(mockRegisterAuthorNoteBatchDetectRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterAuthorNoteBatchJobRoutes).toHaveBeenCalledWith(router, deps);
  });
});
