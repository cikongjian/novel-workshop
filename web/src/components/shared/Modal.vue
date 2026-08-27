<script setup lang="ts">
/**
 * Modal —— 跨设备共享的弹窗外壳
 * Teleport 到 body，带遮罩 + 过渡动画 + 头部（标题/关闭）+ 内容/底部插槽。
 * 桌面端与移动端共用，避免各自实现弹窗样板。
 */
import '../../styles/shared.css';
import Icon from './Icon.vue';

defineProps<{ modelValue: boolean; title?: string; width?: string }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

function close(): void {
  emit('update:modelValue', false);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="nw-modal">
      <div v-if="modelValue" class="nw-modal-overlay" @click.self="close">
        <div class="nw-modal-panel" :style="{ maxWidth: width || '480px' }">
          <div class="nw-modal-head">
            <h3 class="nw-modal-title">{{ title }}</h3>
            <button class="nw-modal-close" aria-label="关闭" @click="close">
              <Icon name="close" :size="18" />
            </button>
          </div>
          <div class="nw-modal-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="nw-modal-foot">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
