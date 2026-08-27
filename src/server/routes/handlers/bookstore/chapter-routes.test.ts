import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRegisterBookstoreChapterPublishRoutes,
  mockRegisterBookstoreChapterScheduleRoutes,
} = vi.hoisted(() => ({
  mockRegisterBookstoreChapterPublishRoutes: vi.fn(),
  mockRegisterBookstoreChapterScheduleRoutes: vi.fn(),
}));

vi.mock('./chapter-publish-routes.js', () => ({
  registerBookstoreChapterPublishRoutes: mockRegisterBookstoreChapterPublishRoutes,
}));

vi.mock('./chapter-schedule-routes.js', () => ({
  registerBookstoreChapterScheduleRoutes: mockRegisterBookstoreChapterScheduleRoutes,
}));

import { registerBookstoreChapterRoutes } from './chapter-routes.js';

describe('bookstore chapter routes facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers publish and schedule route modules', () => {
    const router = {} as any;
    const deps = {} as any;

    registerBookstoreChapterRoutes(router, deps);

    expect(mockRegisterBookstoreChapterPublishRoutes).toHaveBeenCalledWith(router, deps);
    expect(mockRegisterBookstoreChapterScheduleRoutes).toHaveBeenCalledWith(router, deps);
  });
});
