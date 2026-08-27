import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRegisterTTSCharacterDesignRoutes,
  mockRegisterTTSBatchDesignRoutes,
} = vi.hoisted(() => ({
  mockRegisterTTSCharacterDesignRoutes: vi.fn(),
  mockRegisterTTSBatchDesignRoutes: vi.fn(),
}));

vi.mock('./character-design-routes.js', () => ({
  registerTTSCharacterDesignRoutes: mockRegisterTTSCharacterDesignRoutes,
}));

vi.mock('./batch-design-routes.js', () => ({
  registerTTSBatchDesignRoutes: mockRegisterTTSBatchDesignRoutes,
}));

import { registerTTSDesignRoutes } from './design-routes.js';

describe('tts design routes facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers character and batch design route modules', () => {
    const router = {} as any;
    const deps = {} as any;

    registerTTSDesignRoutes(router, deps);

    expect(mockRegisterTTSCharacterDesignRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterTTSBatchDesignRoutes).toHaveBeenCalledWith(router, deps);
  });
});
