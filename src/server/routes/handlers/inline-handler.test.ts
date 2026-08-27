import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRegisterInlineTextRoutes,
  mockRegisterSpeakerBackfillRoutes,
} = vi.hoisted(() => ({
  mockRegisterInlineTextRoutes: vi.fn(),
  mockRegisterSpeakerBackfillRoutes: vi.fn(),
}));

vi.mock('./inline-text-routes.js', () => ({
  registerInlineTextRoutes: mockRegisterInlineTextRoutes,
}));

vi.mock('./speaker-backfill-routes.js', () => ({
  registerSpeakerBackfillRoutes: mockRegisterSpeakerBackfillRoutes,
}));

import { registerInlineRoutes } from './inline-handler.js';

describe('inline handler facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers inline text and speaker backfill routes', () => {
    const router = {} as any;
    const deps = {} as any;

    registerInlineRoutes(router, deps);

    expect(mockRegisterInlineTextRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterSpeakerBackfillRoutes).toHaveBeenCalledWith(router, deps);
  });
});
