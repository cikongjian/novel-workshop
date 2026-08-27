import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import axios from 'axios';
import type { Router } from 'vue-router';
import { authApi, type RealNamePolicy } from '../api/auth';
import { useProfileDrawer } from './useProfileDrawer';
import { useAuthStore } from '../stores/auth';

export type RealNameScene = 'comment' | 'creatorApplication' | 'bookPublishing' | 'billing';

type EnsureRealNameOptions = {
  router: Router;
  isMobile: boolean;
  redirect?: string;
  message?: string;
};

const policy = ref<RealNamePolicy | null>(null);
const loading = ref(false);
const loaded = ref(false);

export const REAL_NAME_SCENE_LABELS: Record<RealNameScene, string> = {
  comment: '评论',
  creatorApplication: '申请作家',
  bookPublishing: '发布作品',
  billing: '充值与兑换',
};

export const REAL_NAME_PROVIDER_LABELS: Record<NonNullable<RealNamePolicy['provider']>, string> = {
  basic_submission: '基础资料提交模式',
  mock_identity: '模拟实名校验模式',
  http_bridge: 'HTTP 外部实名桥接',
};

export function formatRealNameProviderHint(target: RealNamePolicy | null): string {
  if (!target) return '';
  if (target.provider === 'http_bridge') {
    return '当前会把实名资料提交给外部 HTTP 服务，由第三方返回是否通过';
  }
  if (target.provider === 'mock_identity') {
    return '联调模式下，身份证后四位与手机号后四位一致即可通过';
  }
  return '当前模式以资料提交和脱敏存储为主，适合先完成业务流程联调';
}

export function formatRealNameRiskHint(target: RealNamePolicy | null): string {
  if (!target) return '';
  return `连续失败 ${target.maxFailedAttempts} 次后会进入 ${target.cooldownMinutes} 分钟冷却`;
}

function isSceneRequiredByPolicy(target: RealNamePolicy | null, scene: RealNameScene): boolean {
  if (!target?.enabled) return false;
  if (scene === 'comment') return target.requiredForComment;
  if (scene === 'creatorApplication') return target.requiredForCreatorApplication;
  if (scene === 'bookPublishing') return target.requiredForBookPublishing;
  return target.requiredForBilling;
}

function resolveBlockedMessage(scene: RealNameScene, message?: string): string {
  if (message?.trim()) return message;
  return `当前${REAL_NAME_SCENE_LABELS[scene]}前需要先完成实名认证`;
}

function openRealNameEntry(router: Router, isMobile: boolean, redirect?: string) {
  if (isMobile) {
    void router.push({
      path: '/m/me',
      query: {
        ...(redirect ? { redirect } : {}),
        realName: '1',
      },
    });
    return;
  }

  useProfileDrawer().open();
}

function extractResponseMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return '';
  const payload = error.response?.data;
  if (payload && typeof payload === 'object') {
    const data = payload as { error?: string; detail?: string; message?: string };
    return data.error || data.detail || data.message || '';
  }
  return typeof payload === 'string' ? payload : '';
}

export function useRealNameAccess() {
  const authStore = useAuthStore();

  async function loadRealNamePolicy(force = false): Promise<RealNamePolicy | null> {
    if (policy.value && loaded.value && !force) {
      return policy.value;
    }
    if (loading.value) {
      return policy.value;
    }

    loading.value = true;
    try {
      policy.value = await authApi.getRealNamePolicy();
      loaded.value = true;
      return policy.value;
    } catch {
      if (!loaded.value) {
        policy.value = null;
      }
      return policy.value;
    } finally {
      loading.value = false;
    }
  }

  function isSceneRequired(scene: RealNameScene): boolean {
    return isSceneRequiredByPolicy(policy.value, scene);
  }

  async function ensureRealNameAction(
    scene: RealNameScene,
    options: EnsureRealNameOptions,
  ): Promise<boolean> {
    if (!authStore.authEnabled) {
      return true;
    }
    if (!authStore.isAuthenticated) {
      ElMessage.warning('请先登录后再继续');
      void options.router.push({
        name: options.isMobile ? 'Login' : 'Login',
        query: options.redirect ? { redirect: options.redirect } : undefined,
      });
      return false;
    }
    if (authStore.isAdmin || authStore.user?.realNameVerified) {
      return true;
    }

    const currentPolicy = await loadRealNamePolicy();
    if (!isSceneRequiredByPolicy(currentPolicy, scene)) {
      return true;
    }

    ElMessage.warning(resolveBlockedMessage(scene, options.message));
    openRealNameEntry(options.router, options.isMobile, options.redirect);
    return false;
  }

  function handleRealNameBlockedError(
    error: unknown,
    options: EnsureRealNameOptions & { scene: RealNameScene },
  ): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const message = extractResponseMessage(error);
    const status = error.response?.status ?? 0;
    const isBlocked = (status === 403 || status === 400) && message.includes('实名认证');
    if (!isBlocked) {
      return false;
    }

    ElMessage.warning(message || resolveBlockedMessage(options.scene, options.message));
    openRealNameEntry(options.router, options.isMobile, options.redirect);
    return true;
  }

  return {
    policy: computed(() => policy.value),
    loading: computed(() => loading.value),
    realNameEnabled: computed(() => policy.value?.enabled === true),
    loadRealNamePolicy,
    isSceneRequired,
    ensureRealNameAction,
    handleRealNameBlockedError,
  };
}
