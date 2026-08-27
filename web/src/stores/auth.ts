import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi, type UserProfile } from '../api/auth';
import {
  discardLegacyRefreshTokenMigration,
  http,
  refreshSessionAccessToken,
  stageLegacyRefreshTokenMigration,
} from '../api/http';
import {
  clearLegacyPersistedAuth,
  clearSessionAccessToken,
  consumeLegacyPersistedRefreshToken,
  sessionAccessToken,
  setSessionAccessToken,
} from '../utils/auth-session';
import { clearLegacyPersistedLocalSecrets } from '../utils/user-api-local';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserProfile | null>(null);
  const accessToken = sessionAccessToken;
  /** 服务端是否启用了认证（从 /api/health 获取） */
  const authEnabled = ref(false);
  /** 服务端是否开放评论功能（从 /api/health 获取） */
  const commentEnabled = ref(false);
  const initialized = ref(false);

  const isAuthenticated = computed(() => !!accessToken.value);
  const isAdmin = computed(() => user.value?.role === 'admin');
  const isCreator = computed(() => user.value?.role === 'admin' || user.value?.creatorStatus === 'approved');
  const canApplyCreator = computed(() => {
    if (!user.value || user.value.role === 'admin') return false;
    return user.value.creatorStatus === 'none' || user.value.creatorStatus === 'rejected';
  });

  /** 初始化：检测认证状态，并通过 HttpOnly cookie 恢复会话。 */
  async function init() {
    const legacyRefreshToken = consumeLegacyPersistedRefreshToken();
    stageLegacyRefreshTokenMigration(legacyRefreshToken);
    clearLegacyPersistedLocalSecrets();
    try {
      const health = await http.get<{ authEnabled?: boolean; commentEnabled?: boolean }>('/health');
      authEnabled.value = health.data.authEnabled ?? false;
      commentEnabled.value = health.data.commentEnabled ?? false;
    } catch {
      authEnabled.value = false;
      commentEnabled.value = false;
    }

    if (!authEnabled.value) {
      discardLegacyRefreshTokenMigration();
      clearSessionAccessToken();
      initialized.value = true;
      return;
    }

    try {
      await refreshAccessToken();
    } catch {
      clearTokens();
    }
    initialized.value = true;
  }

  async function login(
    username: string,
    password: string,
    sliderChallengeId: string,
    sliderPosition: number,
    sliderDuration: number,
  ) {
    const res = await authApi.login({ username, password, sliderChallengeId, sliderPosition, sliderDuration });
    setSessionAccessToken(res.accessToken);
    user.value = res.user;
  }

  async function register(
    username: string,
    password: string,
    phone: string,
    inviteCode: string | undefined,
    sliderChallengeId: string,
    sliderPosition: number,
    sliderDuration: number,
    referralCode?: string,
  ) {
    const res = await authApi.register({
      username, password, phone, inviteCode, referralCode,
      sliderChallengeId, sliderPosition, sliderDuration,
    });
    setSessionAccessToken(res.accessToken);
    user.value = res.user;
  }

  async function refreshAccessToken() {
    await refreshSessionAccessToken();
    user.value = await authApi.getProfile();
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // 本地会话仍需清理，服务端 cookie 会在下次失效或过期。
    }
    clearTokens();
    user.value = null;
  }

  async function refreshProfile() {
    if (!accessToken.value) return;
    try {
      user.value = await authApi.getProfile();
    } catch {
      // 静默失败，不影响其他操作
    }
  }

  function clearTokens() {
    discardLegacyRefreshTokenMigration();
    clearSessionAccessToken();
    clearLegacyPersistedAuth();
  }

  return {
    user,
    accessToken,
    authEnabled,
    commentEnabled,
    initialized,
    isAuthenticated,
    isAdmin,
    isCreator,
    canApplyCreator,
    init,
    login,
    register,
    refreshAccessToken,
    refreshProfile,
    logout,
    clearTokens,
  };
});
