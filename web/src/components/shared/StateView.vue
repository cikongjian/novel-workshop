<script setup lang="ts">
/**
 * StateView —— 跨设备共享的「加载 / 错误 / 空 / 数据」四态容器
 *
 * 每个异步页面都要处理这四种状态，目前各页面手写 v-if 链导致大量重复与不一致。
 * 本组件统一收口：
 * - loading：旋转指示（或通过 #loading 插槽自定义骨架）
 * - error：错误标题 + 信息 + 重试按钮（emit retry）
 * - empty：通过 #empty 插槽自定义空态内容
 * - 默认插槽：数据就绪内容
 *
 * 桌面端与移动端共用同一组件，避免两套状态 UI 产生割裂。
 */
import '../../styles/shared.css';

withDefaults(
  defineProps<{
    /** 是否加载中（优先级最高） */
    loading?: boolean;
    /** 错误对象（truthy 即展示错误态；建议传入已排除 abort 的错误） */
    error?: unknown;
    /** 数据已加载但为空 */
    empty?: boolean;
    /** 错误态展示的信息（已由调用方用 extractApiErrorMessage 提取） */
    errorMessage?: string;
    /** 错误态标题，默认「加载失败」 */
    errorTitle?: string;
    /** 加载态文案，默认「加载中…」 */
    loadingText?: string;
  }>(),
  {
    loading: false,
    error: null,
    empty: false,
    errorMessage: '',
    errorTitle: '加载失败',
    loadingText: '加载中…',
  },
);

defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="loading" class="nw-state nw-state--loading">
    <slot name="loading">
      <span class="nw-state__spinner" />
      <span class="nw-state__desc">{{ loadingText }}</span>
    </slot>
  </div>

  <div v-else-if="error" class="nw-state nw-state--error">
    <p class="nw-state__title">{{ errorTitle }}</p>
    <p v-if="errorMessage" class="nw-state__desc">{{ errorMessage }}</p>
    <button class="nw-state__retry" @click="$emit('retry')">重试</button>
  </div>

  <div v-else-if="empty" class="nw-state nw-state--empty">
    <slot name="empty">
      <p class="nw-state__title">暂无内容</p>
    </slot>
  </div>

  <slot v-else />
</template>
