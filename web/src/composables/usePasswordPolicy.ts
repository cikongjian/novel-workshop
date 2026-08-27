import { computed, ref } from 'vue';
import { authApi, type PasswordPolicy } from '../api/auth';
import { DEFAULT_PASSWORD_POLICY, formatPasswordPolicy } from '../utils/password-policy';

const policy = ref<PasswordPolicy>(DEFAULT_PASSWORD_POLICY);
const loaded = ref(false);
const loading = ref(false);

export function usePasswordPolicy() {
  async function loadPasswordPolicy(force = false) {
    if (loading.value) return;
    if (loaded.value && !force) return;
    loading.value = true;
    try {
      policy.value = await authApi.getPasswordPolicy();
      loaded.value = true;
    } catch {
      policy.value = DEFAULT_PASSWORD_POLICY;
    } finally {
      loading.value = false;
    }
  }

  const passwordPolicyHint = computed(() => formatPasswordPolicy(policy.value));

  return {
    passwordPolicy: policy,
    passwordPolicyHint,
    passwordPolicyLoaded: loaded,
    loadPasswordPolicy,
  };
}
