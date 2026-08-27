<script setup lang="ts">
import { CloseBold } from '@element-plus/icons-vue';
import { ref } from 'vue';

defineProps<{
  visible: boolean;
  selectedText: string;
}>();
const emit = defineEmits<{
  confirm: [note: string];
  cancel: [];
}>();

const noteText = ref('');

function handleConfirm() {
  emit('confirm', noteText.value);
  noteText.value = '';
}

function handleCancel() {
  emit('cancel');
  noteText.value = '';
}
</script>

<template>
  <transition name="mobile-note-input-overlay">
    <div v-if="visible" class="mobile-note-input-overlay" @click.self="handleCancel">
      <div class="mobile-note-input-dialog">
        <header class="mobile-note-input-dialog__header">
          <strong>写想法</strong>
          <button class="mobile-note-input-dialog__close" type="button" aria-label="关闭" @click="handleCancel">
            <el-icon :size="16"><CloseBold /></el-icon>
          </button>
        </header>

        <div class="mobile-note-input-dialog__context">
          <span class="mobile-note-input-dialog__label">选中的文字</span>
          <p>{{ selectedText }}</p>
        </div>

        <textarea
          v-model="noteText"
          class="mobile-note-input-dialog__textarea"
          placeholder="写下你的想法..."
          rows="3"
          maxlength="500"
        />

        <footer class="mobile-note-input-dialog__footer">
          <span class="mobile-note-input-dialog__count">{{ noteText.length }}/500</span>
          <div class="mobile-note-input-dialog__actions">
            <button
              class="mobile-note-input-dialog__btn mobile-note-input-dialog__btn--ghost"
              type="button"
              @click="handleCancel"
            >
              取消
            </button>
            <button
              class="mobile-note-input-dialog__btn mobile-note-input-dialog__btn--primary"
              type="button"
              @click="handleConfirm"
            >
              完成
            </button>
          </div>
        </footer>
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* 与 MobileAnnotationPanel 一致的底部弹出风格 */
.mobile-note-input-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

.mobile-note-input-dialog {
  width: 100%;
  max-width: 480px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--nw-bg-secondary);
  border-radius: 16px 16px 0 0;
  overflow: hidden;
}

.mobile-note-input-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border-bottom: 1px solid var(--nw-border);
}

.mobile-note-input-dialog__header strong {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.mobile-note-input-dialog__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--nw-text-muted);
  cursor: pointer;
}

.mobile-note-input-dialog__context {
  padding: 12px 14px;
  background: color-mix(in srgb, var(--mobile-focus-accent, var(--star-brand-sky)) 7%, var(--nw-bg-secondary));
  border-left: 3px solid var(--mobile-focus-accent, var(--star-brand-sky));
  margin: 4px 14px;
  border-radius: 0 6px 6px 0;
}

.mobile-note-input-dialog__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--nw-text-muted);
  letter-spacing: 0.04em;
}

.mobile-note-input-dialog__context p {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--nw-text-primary);
}

.mobile-note-input-dialog__textarea {
  width: calc(100% - 28px);
  min-height: 80px;
  margin: 12px 14px 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-card);
  color: var(--nw-text-primary);
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
  font-family: inherit;
}

.mobile-note-input-dialog__textarea:focus {
  border-color: var(--mobile-focus-accent, var(--star-brand-sky));
}

.mobile-note-input-dialog__textarea::placeholder {
  color: var(--nw-text-muted);
}

.mobile-note-input-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  margin-top: 8px;
  border-top: 1px solid var(--nw-border);
}

.mobile-note-input-dialog__count {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.mobile-note-input-dialog__actions {
  display: flex;
  gap: 8px;
}

.mobile-note-input-dialog__btn {
  min-width: 72px;
  height: 36px;
  border-radius: 8px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.mobile-note-input-dialog__btn--ghost {
  background: var(--mobile-focus-surface-muted, var(--nw-bg-hover));
  color: var(--nw-text-secondary);
}

.mobile-note-input-dialog__btn--primary {
  background: linear-gradient(135deg, var(--mobile-focus-accent, var(--star-brand-sky)), var(--mobile-focus-accent-strong, var(--star-brand-teal)));
  color: var(--mobile-focus-on-accent, var(--nw-bg-secondary));
}

/* transition - 与 annotation panel 一致的上滑动画 */
.mobile-note-input-overlay-enter-active,
.mobile-note-input-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.mobile-note-input-overlay-enter-active .mobile-note-input-dialog,
.mobile-note-input-overlay-leave-active .mobile-note-input-dialog {
  transition: transform 0.2s ease;
}
.mobile-note-input-overlay-enter-from,
.mobile-note-input-overlay-leave-to {
  opacity: 0;
}
.mobile-note-input-overlay-enter-from .mobile-note-input-dialog,
.mobile-note-input-overlay-leave-to .mobile-note-input-dialog {
  transform: translateY(100%);
}
</style>
