<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { authApi, type UserProfile } from '../../api/auth';
import { useAuthStore } from '../../stores/auth';

const props = withDefaults(defineProps<{
  compact?: boolean;
}>(), {
  compact: false,
});

const emit = defineEmits<{
  redeemed: [profile: UserProfile];
}>();

const authStore = useAuthStore();
const inviteCode = ref('');
const submitting = ref(false);

const canRedeem = computed(() => {
  const user = authStore.user;
  if (!user || user.role === 'admin') return false;
  return user.creatorStatus !== 'approved' && user.creatorStatus !== 'suspended';
});

const helperText = computed(() => {
  const status = authStore.user?.creatorStatus;
  if (status === 'pending') {
    return '如果你已经拿到邀请码，可以直接兑换，无需继续等待审核。';
  }
  if (status === 'rejected') {
    return '拿到邀请码后可以直接重新开通作家资格，不必再走申请审核。';
  }
  return '拿到邀请码后可立即开通作家资格，直接进入创作台。';
});

async function redeemInviteCode() {
  const code = inviteCode.value.trim();
  if (!code) {
    ElMessage.warning('请输入邀请码');
    return;
  }

  submitting.value = true;
  try {
    const updated = await authApi.redeemCreatorInviteCode({ inviteCode: code });
    inviteCode.value = '';
    await authStore.refreshProfile();
    emit('redeemed', updated);
    ElMessage.success('邀请码兑换成功，已升级为作家');
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '邀请码兑换失败');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section
    v-if="canRedeem"
    :class="['creator-invite-panel', { 'creator-invite-panel--compact': compact }]"
  >
    <div class="creator-invite-panel__copy">
      <strong>已有邀请码？</strong>
      <p>{{ helperText }}</p>
    </div>
    <div class="creator-invite-panel__form">
      <el-input
        v-model="inviteCode"
        maxlength="32"
        clearable
        placeholder="输入作家邀请码"
        @keyup.enter="redeemInviteCode"
      />
      <el-button
        type="success"
        plain
        :loading="submitting"
        @click="redeemInviteCode"
      >
        立即升级为作家
      </el-button>
    </div>
  </section>
</template>

<style scoped>
.creator-invite-panel {
  display: grid;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(16, 185, 129, 0.18);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(14, 165, 233, 0.08));
}

.creator-invite-panel--compact {
  padding: 14px 16px;
}

.creator-invite-panel__copy {
  display: grid;
  gap: 6px;
}

.creator-invite-panel__copy strong {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.creator-invite-panel__copy p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

.creator-invite-panel__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

@media (max-width: 640px) {
  .creator-invite-panel__form {
    grid-template-columns: 1fr;
  }
}
</style>
