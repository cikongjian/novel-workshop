/**
 * 番外生成权限检查
 * - 未登录：不能生成
 * - 已登录但未配置 AI Key：不能生成
 * - 已登录且配置了 AI Key：可以生成
 */
import { ref, computed } from 'vue';
import { useAuthStore } from '../stores/auth';
import { userApiApi, type UserApiProfile } from '../api/user-api';

export function useSideStoryPermission() {
  const auth = useAuthStore();
  const profiles = ref<UserApiProfile[]>([]);
  const loading = ref(false);
  const checked = ref(false);

  const needsLogin = computed(() => !auth.isAuthenticated);
  const hasApiKey = computed(() =>
    profiles.value.some((p) => p.enabled && p.scope === 'model'),
  );
  const canGenerate = computed(() => auth.isAuthenticated && hasApiKey.value);

  async function checkPermission() {
    if (!auth.isAuthenticated) {
      checked.value = true;
      return;
    }
    loading.value = true;
    try {
      profiles.value = await userApiApi.listProfiles();
    } catch {
      profiles.value = [];
    } finally {
      loading.value = false;
      checked.value = true;
    }
  }

  return {
    needsLogin,
    hasApiKey,
    canGenerate,
    loading,
    checked,
    checkPermission,
  };
}
