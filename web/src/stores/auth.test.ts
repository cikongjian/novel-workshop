import { createPinia, setActivePinia } from 'pinia';
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../api/auth';

/** sessionAccessToken 是被 store 直接复用的 ref，mock 必须给出真 ref */
const mockSessionAccessToken = ref<string | null>(null);
const mockClearSessionAccessToken = vi.fn(() => {
  mockSessionAccessToken.value = null;
});
const mockSetSessionAccessToken = vi.fn((token: string) => {
  mockSessionAccessToken.value = token;
});
const mockHttpGet = vi.fn();

vi.mock('../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    me: vi.fn(),
  },
}));

vi.mock('../api/http', () => ({
  http: { get: mockHttpGet, post: vi.fn() },
  refreshSessionAccessToken: vi.fn(),
  stageLegacyRefreshTokenMigration: vi.fn(),
  discardLegacyRefreshTokenMigration: vi.fn(),
}));

vi.mock('../utils/auth-session', () => ({
  sessionAccessToken: mockSessionAccessToken,
  clearSessionAccessToken: mockClearSessionAccessToken,
  setSessionAccessToken: mockSetSessionAccessToken,
  consumeLegacyPersistedRefreshToken: vi.fn(() => null),
  clearLegacyPersistedAuth: vi.fn(),
}));

vi.mock('../utils/user-api-local', () => ({
  clearLegacyPersistedLocalSecrets: vi.fn(),
}));

const { useAuthStore } = await import('./auth');

function profile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user-1',
    username: 'someone',
    role: 'user',
    creatorStatus: 'none',
    ...overrides,
  } as UserProfile;
}

describe('useAuthStore 授权派生状态', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockSessionAccessToken.value = null;
    vi.clearAllMocks();
  });

  it('无 token 时未认证', () => {
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(false);
  });

  it('有 token 时已认证', () => {
    mockSessionAccessToken.value = 'token-value';
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(true);
  });

  it('isAdmin 只认 admin 角色', () => {
    const store = useAuthStore();
    for (const role of ['user', 'guest', 'Admin', 'ADMIN', ''] as const) {
      store.user = profile({ role: role as UserProfile['role'] });
      expect(store.isAdmin).toBe(false);
    }
    store.user = profile({ role: 'admin' });
    expect(store.isAdmin).toBe(true);
  });

  it('未登录时不是管理员也不是创作者', () => {
    const store = useAuthStore();
    store.user = null;
    expect(store.isAdmin).toBe(false);
    expect(store.isCreator).toBe(false);
  });

  it('admin 直接视为创作者', () => {
    const store = useAuthStore();
    store.user = profile({ role: 'admin', creatorStatus: 'none' });
    expect(store.isCreator).toBe(true);
  });

  it('创作者审核通过后视为创作者', () => {
    const store = useAuthStore();
    store.user = profile({ creatorStatus: 'approved' });
    expect(store.isCreator).toBe(true);
  });

  it('创作者审核未通过的状态不视为创作者', () => {
    const store = useAuthStore();
    for (const status of ['none', 'pending', 'rejected'] as const) {
      store.user = profile({ creatorStatus: status as UserProfile['creatorStatus'] });
      expect(store.isCreator).toBe(false);
    }
  });

  it('canApplyCreator 仅在 none / rejected 时为真', () => {
    const store = useAuthStore();
    store.user = profile({ creatorStatus: 'none' });
    expect(store.canApplyCreator).toBe(true);
    store.user = profile({ creatorStatus: 'rejected' });
    expect(store.canApplyCreator).toBe(true);
  });

  it('待审或已通过时不能重复申请', () => {
    const store = useAuthStore();
    for (const status of ['pending', 'approved'] as const) {
      store.user = profile({ creatorStatus: status as UserProfile['creatorStatus'] });
      expect(store.canApplyCreator).toBe(false);
    }
  });

  it('admin 与未登录都不能申请创作者', () => {
    const store = useAuthStore();
    store.user = profile({ role: 'admin', creatorStatus: 'none' });
    expect(store.canApplyCreator).toBe(false);
    store.user = null;
    expect(store.canApplyCreator).toBe(false);
  });
});

describe('useAuthStore init', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockSessionAccessToken.value = null;
    vi.clearAllMocks();
  });

  it('健康检查失败时按未启用认证处理，并清掉会话 token', async () => {
    mockHttpGet.mockRejectedValueOnce(new Error('network down'));
    const store = useAuthStore();
    await store.init();
    expect(store.authEnabled).toBe(false);
    expect(mockClearSessionAccessToken).toHaveBeenCalled();
    expect(store.initialized).toBe(true);
  });

  it('服务端未启用认证时不尝试刷新会话', async () => {
    mockHttpGet.mockResolvedValueOnce({ data: { authEnabled: false } });
    const store = useAuthStore();
    await store.init();
    expect(store.authEnabled).toBe(false);
    expect(store.initialized).toBe(true);
  });

  it('读取服务端下发的评论开关', async () => {
    mockHttpGet.mockResolvedValueOnce({ data: { authEnabled: false, commentEnabled: true } });
    const store = useAuthStore();
    await store.init();
    expect(store.commentEnabled).toBe(true);
  });

  it('健康检查字段缺失时开关默认关闭', async () => {
    mockHttpGet.mockResolvedValueOnce({ data: {} });
    const store = useAuthStore();
    await store.init();
    expect(store.authEnabled).toBe(false);
    expect(store.commentEnabled).toBe(false);
  });
});
