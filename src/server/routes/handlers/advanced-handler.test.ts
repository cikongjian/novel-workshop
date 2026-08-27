import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRegisterAdvancedPlotRoutes,
  mockRegisterAdvancedCharacterChatRoutes,
  mockRegisterAdvancedDialogueRoutes,
  mockRegisterAdvancedDeprecatedRoutes,
  mockRegisterAdvancedMarketingRoutes,
  mockRegisterAdvancedSuggestionsRoutes,
} = vi.hoisted(() => ({
  mockRegisterAdvancedPlotRoutes: vi.fn(),
  mockRegisterAdvancedCharacterChatRoutes: vi.fn(),
  mockRegisterAdvancedDialogueRoutes: vi.fn(),
  mockRegisterAdvancedDeprecatedRoutes: vi.fn(),
  mockRegisterAdvancedMarketingRoutes: vi.fn(),
  mockRegisterAdvancedSuggestionsRoutes: vi.fn(),
}));

vi.mock('./advanced-plot-routes.js', () => ({
  registerAdvancedPlotRoutes: mockRegisterAdvancedPlotRoutes,
}));

vi.mock('./advanced-character-chat-routes.js', () => ({
  registerAdvancedCharacterChatRoutes: mockRegisterAdvancedCharacterChatRoutes,
}));

vi.mock('./advanced-dialogue-routes.js', () => ({
  registerAdvancedDialogueRoutes: mockRegisterAdvancedDialogueRoutes,
}));

vi.mock('./advanced-deprecated-routes.js', () => ({
  registerAdvancedDeprecatedRoutes: mockRegisterAdvancedDeprecatedRoutes,
}));

vi.mock('./advanced-marketing-routes.js', () => ({
  registerAdvancedMarketingRoutes: mockRegisterAdvancedMarketingRoutes,
}));

vi.mock('./advanced-suggestions-routes.js', () => ({
  registerAdvancedSuggestionsRoutes: mockRegisterAdvancedSuggestionsRoutes,
}));

import { registerAdvancedRoutes } from './advanced-handler.js';

describe('advanced handler facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all advanced route modules', () => {
    const router = {} as any;
    const deps = {} as any;

    registerAdvancedRoutes(router, deps);

    expect(mockRegisterAdvancedPlotRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterAdvancedCharacterChatRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterAdvancedDialogueRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterAdvancedDeprecatedRoutes).toHaveBeenCalledWith(router);
    expect(mockRegisterAdvancedMarketingRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterAdvancedSuggestionsRoutes).toHaveBeenCalledWith(router, deps);
  });
});
