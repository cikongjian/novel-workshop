import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateBatchQueue,
  mockRegisterBatchGenerateRoutes,
  mockRegisterBatchControlRoutes,
  mockRegisterBatchReviseRoutes,
} = vi.hoisted(() => ({
  mockCreateBatchQueue: vi.fn(() => ({ id: 'queue' })),
  mockRegisterBatchGenerateRoutes: vi.fn(),
  mockRegisterBatchControlRoutes: vi.fn(),
  mockRegisterBatchReviseRoutes: vi.fn(),
}));

vi.mock('./batch-route-support.js', () => ({
  createBatchQueue: mockCreateBatchQueue,
  batchLogger: { debug: vi.fn(), info: vi.fn() },
  emitBatchChapterFailure: vi.fn(),
}));

vi.mock('./batch-generate-routes.js', () => ({
  registerBatchGenerateRoutes: mockRegisterBatchGenerateRoutes,
}));

vi.mock('./batch-control-routes.js', () => ({
  registerBatchControlRoutes: mockRegisterBatchControlRoutes,
}));

vi.mock('./batch-revise-routes.js', () => ({
  registerBatchReviseRoutes: mockRegisterBatchReviseRoutes,
}));

import { registerBatchRoutes } from './batch-handler.js';

describe('batch handler facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates one batch queue and shares it across submodules', () => {
    const router = {} as any;
    const deps = {} as any;

    registerBatchRoutes(router, deps);

    expect(mockCreateBatchQueue).toHaveBeenCalledWith(router);
    const batchQueue = mockCreateBatchQueue.mock.results[0]?.value;
    expect(mockRegisterBatchGenerateRoutes).toHaveBeenCalledWith(router, deps, batchQueue);
    expect(mockRegisterBatchControlRoutes).toHaveBeenCalledWith(router, batchQueue);
    expect(mockRegisterBatchReviseRoutes).toHaveBeenCalledWith(router, deps);
  });
});
