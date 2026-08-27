<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import axios from 'axios';
import { ElMessage } from 'element-plus';
import type { RealNamePolicy, UserProfile } from '../../api/auth';
import { authApi } from '../../api/auth';
import {
  formatRealNameProviderHint,
  formatRealNameRiskHint,
  REAL_NAME_PROVIDER_LABELS,
} from '../../composables/useRealNameAccess';

const props = withDefaults(defineProps<{
  profile: UserProfile | null;
  compact?: boolean;
}>(), {
  compact: false,
});

const emit = defineEmits<{
  (event: 'verified', profile: UserProfile): void;
}>();

const loading = ref(false);
const submitting = ref(false);
const policy = ref<RealNamePolicy | null>(null);
const form = ref({
  realName: '',
  idNumber: '',
  phoneNumber: '',
});
const submitFeedback = ref<{
  type: 'warning' | 'error';
  title: string;
  description: string;
  retryAfterMinutes: number | null;
} | null>(null);
const cooldownRemainingSeconds = ref(0);
let cooldownTimer: ReturnType<typeof window.setInterval> | null = null;
const shouldRenderPanel = computed(() => policy.value?.enabled === true);

const requiredScenes = computed(() => {
  if (!policy.value?.enabled) {
    return [];
  }

  const scenes: string[] = [];
  if (policy.value.requiredForComment) scenes.push('评论');
  if (policy.value.requiredForCreatorApplication) scenes.push('申请作家');
  if (policy.value.requiredForBookPublishing) scenes.push('发布作品');
  if (policy.value.requiredForBilling) scenes.push('充值计费');
  return scenes;
});

const maskedEntries = computed(() => {
  if (!props.profile?.realNameVerified) {
    return [];
  }

  return [
    { label: '真实姓名', value: props.profile.realNameMasked || '已提交' },
    { label: '身份证号', value: props.profile.realNameIdNumberMasked || '已提交' },
    { label: '手机号', value: props.profile.realNamePhoneMasked || '已提交' },
  ];
});

const providerLabel = computed(() => {
  const provider = policy.value?.provider ?? 'basic_submission';
  return REAL_NAME_PROVIDER_LABELS[provider];
});
const providerHint = computed(() => formatRealNameProviderHint(policy.value));
const riskHint = computed(() => formatRealNameRiskHint(policy.value));
const submitButtonLabel = computed(() => (
  cooldownRemainingSeconds.value > 0
    ? `请等待 ${formatDuration(cooldownRemainingSeconds.value)}`
    : '提交实名认证'
));

function stopCooldownTimer() {
  if (cooldownTimer !== null) {
    window.clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
}

function startCooldownTimer(minutes: number) {
  stopCooldownTimer();
  cooldownRemainingSeconds.value = Math.max(0, Math.ceil(minutes * 60));
  if (cooldownRemainingSeconds.value <= 0) {
    return;
  }

  cooldownTimer = window.setInterval(() => {
    if (cooldownRemainingSeconds.value <= 1) {
      stopCooldownTimer();
      cooldownRemainingSeconds.value = 0;
      return;
    }
    cooldownRemainingSeconds.value -= 1;
  }, 1000);
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds} 秒`;
  }
  return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`;
}

function parseCountFromMessage(message: string, pattern: RegExp): number | null {
  const matched = message.match(pattern);
  if (!matched?.[1]) {
    return null;
  }
  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveSubmitFeedback(error: unknown) {
  const fallbackMessage = '实名认证提交失败，请稍后重试';
  if (!axios.isAxiosError(error)) {
    return {
      type: 'error' as const,
      title: '实名认证提交失败',
      description: fallbackMessage,
      retryAfterMinutes: null,
    };
  }

  const payload = typeof error.response?.data === 'object' && error.response?.data
    ? error.response.data as {
      error?: string;
      details?: {
        retryAfterMinutes?: number;
        remainingAttempts?: number;
        maxFailedAttempts?: number;
        cooldownMinutes?: number;
      };
    }
    : null;
  const message = payload?.error || fallbackMessage;
  const retryAfterMinutes = payload?.details?.retryAfterMinutes
    ?? parseCountFromMessage(message, /请在\s*(\d+)\s*分钟后再试/);
  const remainingAttempts = payload?.details?.remainingAttempts
    ?? parseCountFromMessage(message, /还可重试\s*(\d+)\s*次/);

  if (retryAfterMinutes && retryAfterMinutes > 0) {
    return {
      type: 'warning' as const,
      title: '实名认证已进入冷却',
      description: `${message}。冷却结束前会暂时禁止再次提交。`,
      retryAfterMinutes,
    };
  }

  if (typeof remainingAttempts === 'number') {
    return {
      type: 'warning' as const,
      title: '实名认证未通过',
      description: `${message}。当前窗口内还可重试 ${remainingAttempts} 次。`,
      retryAfterMinutes: null,
    };
  }

  return {
    type: 'error' as const,
    title: '实名认证提交失败',
    description: message,
    retryAfterMinutes: null,
  };
}

async function loadPolicy() {
  loading.value = true;
  try {
    policy.value = await authApi.getRealNamePolicy();
  } catch {
    policy.value = null;
  } finally {
    loading.value = false;
  }
}

async function submitVerification() {
  submitting.value = true;
  try {
    const updated = await authApi.verifyRealName({
      realName: form.value.realName,
      idNumber: form.value.idNumber,
      phoneNumber: form.value.phoneNumber,
    });
    form.value = {
      realName: '',
      idNumber: '',
      phoneNumber: '',
    };
    submitFeedback.value = null;
    stopCooldownTimer();
    cooldownRemainingSeconds.value = 0;
    emit('verified', updated);
    ElMessage.success('实名认证资料已提交');
  } catch (error) {
    const feedback = resolveSubmitFeedback(error);
    submitFeedback.value = feedback;
    if (feedback.retryAfterMinutes) {
      startCooldownTimer(feedback.retryAfterMinutes);
    }
    ElMessage[feedback.type === 'warning' ? 'warning' : 'error'](feedback.description);
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void loadPolicy();
});

onBeforeUnmount(() => {
  stopCooldownTimer();
});
</script>

<template>
  <section
    v-if="shouldRenderPanel"
    class="real-name-panel"
    :class="{ 'is-compact': compact }"
    v-loading="loading"
  >
    <div class="real-name-panel__header">
      <div>
        <h3>实名认证</h3>
        <p>
          当前接入 {{ providerLabel }}，
          {{ providerHint || '后续可继续扩展身份证 + 短信或三要素核验。' }}
          <template v-if="riskHint">；{{ riskHint }}</template>
        </p>
      </div>
      <el-tag :type="profile?.realNameVerified ? 'success' : 'info'" round>
        {{ profile?.realNameVerified ? '已实名' : '未实名' }}
      </el-tag>
    </div>

    <el-alert
      v-if="requiredScenes.length"
      type="warning"
      :closable="false"
      show-icon
      :title="`当前会在 ${requiredScenes.join('、')} 等场景校验实名。${riskHint ? ` ${riskHint}。` : ''}`"
    />

    <el-alert
      v-if="submitFeedback"
      :type="submitFeedback.type"
      :closable="false"
      show-icon
      :title="cooldownRemainingSeconds > 0 ? `${submitFeedback.title}，剩余 ${formatDuration(cooldownRemainingSeconds)}` : submitFeedback.title"
      :description="submitFeedback.description"
    />

    <div v-if="profile?.realNameVerified" class="real-name-panel__summary">
      <div v-for="entry in maskedEntries" :key="entry.label" class="real-name-panel__item">
        <span>{{ entry.label }}</span>
        <strong>{{ entry.value }}</strong>
      </div>
    </div>

    <el-form
      v-else
      label-position="top"
      class="real-name-panel__form"
      @submit.prevent="submitVerification"
    >
      <div class="real-name-panel__tips">
        <span>当前规则：{{ providerHint }}</span>
        <span>资料会按脱敏方式保存，仅用于实名状态校验。</span>
      </div>

      <el-form-item label="真实姓名">
        <el-input
          v-model="form.realName"
          maxlength="50"
          placeholder="请输入真实姓名"
        />
      </el-form-item>

      <el-form-item label="身份证号">
        <el-input
          v-model="form.idNumber"
          maxlength="18"
          placeholder="请输入身份证号"
        />
      </el-form-item>

      <el-form-item label="手机号">
        <el-input
          v-model="form.phoneNumber"
          maxlength="11"
          placeholder="请输入实名手机号"
        />
      </el-form-item>

      <el-button
        type="primary"
        :loading="submitting"
        :disabled="cooldownRemainingSeconds > 0 || !form.realName.trim() || !form.idNumber.trim() || !form.phoneNumber.trim()"
        @click="submitVerification"
      >
        {{ submitButtonLabel }}
      </el-button>
    </el-form>
  </section>
</template>

<style scoped>
.real-name-panel {
  --real-name-surface: var(--el-fill-color-lighter);
  --real-name-border: var(--el-border-color-lighter);
  --real-name-item-bg: var(--el-bg-color);
  --real-name-item-border: var(--el-border-color-light);
  --real-name-text-primary: var(--el-text-color-primary);
  --real-name-text-secondary: var(--el-text-color-secondary);
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--real-name-border);
  border-radius: 14px;
  background: var(--real-name-surface);
}

.real-name-panel.is-compact {
  padding: 14px;
}

.real-name-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.real-name-panel__header h3 {
  margin: 0 0 6px;
  color: var(--real-name-text-primary);
  font-size: 16px;
}

.real-name-panel__header p {
  margin: 0;
  color: var(--real-name-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.real-name-panel__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.real-name-panel__tips {
  display: grid;
  gap: 6px;
  margin-bottom: 4px;
}

.real-name-panel__item {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: var(--real-name-item-bg);
  border: 1px solid var(--real-name-item-border);
}

.real-name-panel__item span {
  color: var(--real-name-text-secondary);
  font-size: 12px;
}

.real-name-panel__tips span {
  color: var(--real-name-text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.real-name-panel__item strong {
  color: var(--real-name-text-primary);
  font-size: 14px;
}

.real-name-panel__form :deep(.el-button) {
  width: fit-content;
}

@media (max-width: 720px) {
  .real-name-panel__header,
  .real-name-panel__summary {
    grid-template-columns: 1fr;
  }

  .real-name-panel__header {
    display: grid;
  }

  .real-name-panel__form :deep(.el-button) {
    width: 100%;
  }
}
</style>
