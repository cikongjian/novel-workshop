<script setup lang="ts">
/**
 * 全局错误边界组件
 *
 * 捕获子组件树中的渲染错误，显示友好提示而非白屏。
 * 用法：包裹在 App.vue 或 router-view 外层。
 */
import { ref, onErrorCaptured } from 'vue';

const hasError = ref(false);
const errorMessage = ref('');

onErrorCaptured((err: Error) => {
  hasError.value = true;
  errorMessage.value = err.message || '未知错误';
  console.error('[ErrorBoundary]', err);
  // 返回 false 阻止错误继续向上传播
  return false;
});

function handleRetry() {
  hasError.value = false;
  errorMessage.value = '';
}
</script>

<template>
  <div v-if="hasError" class="error-boundary">
    <div class="error-boundary__content">
      <div class="error-boundary__icon">⚠</div>
      <h3>页面出现异常</h3>
      <p class="error-boundary__msg">{{ errorMessage }}</p>
      <el-button type="primary" @click="handleRetry">重试</el-button>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  padding: 40px;
}

.error-boundary__content {
  text-align: center;
  max-width: 400px;
}

.error-boundary__icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.error-boundary__msg {
  color: var(--el-text-color-secondary);
  margin: 12px 0 24px;
  word-break: break-word;
}
</style>
