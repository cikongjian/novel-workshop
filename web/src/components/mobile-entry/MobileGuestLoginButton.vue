<script setup lang="ts">
import { computed } from 'vue';
import { Lock } from '@element-plus/icons-vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';

const props = withDefaults(defineProps<{
  label?: string;
}>(), {
  label: '登录',
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const visible = computed(() => authStore.authEnabled && !authStore.isAuthenticated);

function openLogin() {
  void router.push({
    name: 'Login',
    query: {
      redirect: route.fullPath,
    },
  });
}
</script>

<template>
  <button
    v-if="visible"
    class="mobile-guest-login-button"
    type="button"
    @click="openLogin"
  >
    <el-icon :size="14"><Lock /></el-icon>
    <span>{{ label }}</span>
  </button>
</template>

<style scoped>
.mobile-guest-login-button {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid rgba(125, 211, 252, 0.16);
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.22);
  color: var(--mobile-focus-on-accent, #fff);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  touch-action: manipulation;
  transform: translateZ(0);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 8px 18px rgba(2, 8, 23, 0.14);
  backdrop-filter: blur(12px);
}

.mobile-guest-login-button:active {
  filter: brightness(1.12);
}
</style>
