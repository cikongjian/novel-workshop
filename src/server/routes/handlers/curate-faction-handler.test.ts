import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRegisterCurateFactionWorldRoutes,
  mockRegisterApplyCuratedFactionWorldRoutes,
} = vi.hoisted(() => ({
  mockRegisterCurateFactionWorldRoutes: vi.fn(),
  mockRegisterApplyCuratedFactionWorldRoutes: vi.fn(),
}));

vi.mock('./curate-faction-routes.js', () => ({
  registerCurateFactionWorldRoutes: mockRegisterCurateFactionWorldRoutes,
}));

vi.mock('./curate-faction-apply-routes.js', () => ({
  registerApplyCuratedFactionWorldRoutes: mockRegisterApplyCuratedFactionWorldRoutes,
}));

import { registerCurateFactionRoutes } from './curate-faction-handler.js';

describe('curate faction handler facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers curate and apply route modules', () => {
    const router = {} as any;
    const deps = {} as any;

    registerCurateFactionRoutes(router, deps);

    expect(mockRegisterCurateFactionWorldRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterApplyCuratedFactionWorldRoutes).toHaveBeenCalledWith(router, deps);
  });
});
