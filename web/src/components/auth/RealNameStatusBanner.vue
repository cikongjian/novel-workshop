<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import {
  formatRealNameProviderHint,
  formatRealNameRiskHint,
  REAL_NAME_PROVIDER_LABELS,
  REAL_NAME_SCENE_LABELS,
  type RealNameScene,
  useRealNameAccess,
} from '../../composables/useRealNameAccess';

const props = withDefaults(defineProps<{
  scene: RealNameScene;
  isMobile?: boolean;
  compact?: boolean;
}>(), {
  isMobile: false,
  compact: false,
});

const router = useRouter();
const authStore = useAuthStore();
const { policy, loading, realNameEnabled, loadRealNamePolicy, ensureRealNameAction, isSceneRequired } = useRealNameAccess();

const sceneLabel = computed(() => REAL_NAME_SCENE_LABELS[props.scene]);
const providerLabel = computed(() => {
  const provider = policy.value?.provider ?? 'basic_submission';
  return REAL_NAME_PROVIDER_LABELS[provider];
});
const providerHint = computed(() => formatRealNameProviderHint(policy.value));
const riskHint = computed(() => formatRealNameRiskHint(policy.value));

const bannerState = computed(() => {
  if (!isSceneRequired(props.scene)) {
    return {
      type: 'info',
      title: `当前${sceneLabel.value}暂不要求实名`,
      description: `实名认证总开关已开启，但这个场景目前没有被强制拦截。${riskHint.value ? ` ${riskHint.value}。` : ''}`,
      actionLabel: '',
    } as const;
  }

  if (!authStore.isAuthenticated) {
    return {
      type: 'info',
      title: `登录后进行${sceneLabel.value}时会校验实名`,
      description: `当前站点使用${providerLabel.value}。${providerHint.value ? `${providerHint.value}。` : ''}${riskHint.value ? `${riskHint.value}。` : ''}先登录，后续再补实名资料即可继续。`,
      actionLabel: '',
    } as const;
  }

  if (authStore.isAdmin) {
    return {
      type: 'success',
      title: '管理员身份默认放行',
      description: `当前${sceneLabel.value}已开启实名要求，但管理员账号不受限制。`,
      actionLabel: '',
    } as const;
  }

  if (authStore.user?.realNameVerified) {
    return {
      type: 'success',
      title: `已实名，可继续${sceneLabel.value}`,
      description: `当前采用${providerLabel.value}，你的资料已通过当前实名流程。${providerHint.value ? ` ${providerHint.value}。` : ''}`,
      actionLabel: '',
    } as const;
  }

  return {
    type: 'warning',
      title: `当前${sceneLabel.value}前需要先完成实名认证`,
      description: `当前采用${providerLabel.value}，完成实名后即可继续当前操作。${providerHint.value ? ` ${providerHint.value}。` : ''}${riskHint.value ? ` ${riskHint.value}。` : ''}`,
    actionLabel: '去实名认证',
  } as const;
});

const shouldRender = computed(() => realNameEnabled.value);

function handleAction() {
  void ensureRealNameAction(props.scene, {
    router,
    isMobile: props.isMobile,
    redirect: router.currentRoute.value.fullPath,
  });
}

onMounted(() => {
  void loadRealNamePolicy();
});
</script>

<template>
  <el-alert
    v-if="shouldRender"
    v-loading="loading"
    :class="['real-name-status-banner', { 'is-compact': compact }]"
    :type="bannerState.type"
    :closable="false"
    show-icon
  >
    <template #title>
      <div class="real-name-status-banner__title">
        <span>{{ bannerState.title }}</span>
        <el-button
          v-if="bannerState.actionLabel"
          type="warning"
          text
          @click="handleAction"
        >
          {{ bannerState.actionLabel }}
        </el-button>
      </div>
    </template>
    <p>{{ bannerState.description }}</p>
  </el-alert>
</template>

<style scoped>
.real-name-status-banner {
  border-radius: 14px;
}

.real-name-status-banner.is-compact :deep(.el-alert__content) {
  padding-top: 1px;
}

.real-name-status-banner__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.real-name-status-banner p {
  margin: 4px 0 0;
  line-height: 1.65;
}

@media (max-width: 640px) {
  .real-name-status-banner__title {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
