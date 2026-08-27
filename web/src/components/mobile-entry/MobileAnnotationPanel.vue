<script setup lang="ts">
import { ref, computed } from 'vue';
import { CloseBold, Star } from '@element-plus/icons-vue';
import type { Annotation } from '../../composables/useTextAnnotation';

const props = defineProps<{
  visible: boolean;
  annotations: Annotation[];
  selectedText?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'like', id: string): void;
  (e: 'delete', id: string): void;
}>();

const showNoteInput = ref(false);
const noteText = ref('');

const sorted = computed(() =>
  [...props.annotations].sort((a, b) => b.likeCount - a.likeCount),
);

function handleLike(id: string) {
  emit('like', id);
}

function handleDelete(id: string) {
  emit('delete', id);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  return d.toLocaleDateString('zh-CN');
}
</script>

<template>
  <Transition name="panel-slide-up">
    <div v-if="visible" class="annotation-panel mobile-focus-light-vars" @click.self="emit('close')">
      <div class="annotation-panel__sheet">
        <div class="annotation-panel__header">
          <h3 class="annotation-panel__title">
            划线与想法
            <span class="annotation-panel__count">{{ annotations.length }} 条</span>
          </h3>
          <button class="annotation-panel__close" @click="emit('close')">
            <el-icon :size="20"><CloseBold /></el-icon>
          </button>
        </div>

        <div v-if="selectedText" class="annotation-panel__quote">
          <p>「{{ selectedText }}」</p>
        </div>

        <div v-if="annotations.length === 0" class="annotation-panel__empty">
          暂无划线和想法
        </div>

        <div v-else class="annotation-panel__list">
          <div
            v-for="item in sorted"
            :key="item.id"
            class="annotation-item"
          >
            <div class="annotation-item__header">
              <span :class="['annotation-item__type', `annotation-item__type--${item.type}`]">
                {{ item.type === 'note' ? '想法' : '划线' }}
              </span>
              <span class="annotation-item__time">{{ formatTime(item.createdAt) }}</span>
            </div>

            <p v-if="item.note" class="annotation-item__note">{{ item.note }}</p>

            <div class="annotation-item__actions">
              <button class="annotation-item__like" @click="handleLike(item.id)">
                <el-icon><Star /></el-icon>
                <span>{{ item.likeCount }}</span>
              </button>
              <button class="annotation-item__delete" @click="handleDelete(item.id)">
                删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.annotation-panel {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: color-mix(in srgb, var(--nw-text-primary) 40%, transparent);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.annotation-panel__sheet {
  width: 100%;
  max-width: 480px;
  max-height: 60vh;
  background: var(--nw-bg-secondary);
  border-radius: 16px 16px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.annotation-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
}

.annotation-panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--nw-text-primary);
}

.annotation-panel__count {
  font-size: 12px;
  color: var(--nw-text-muted);
  font-weight: 400;
}

.annotation-panel__close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--nw-text-muted);
  padding: 4px;
}

.annotation-panel__quote {
  padding: 12px 14px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 6%, var(--nw-bg-secondary));
  border-left: 3px solid var(--mobile-focus-accent);
  margin: 4px 14px;
  border-radius: 0 6px 6px 0;
}

.annotation-panel__quote p {
  margin: 0;
  font-size: 14px;
  color: var(--nw-text-secondary);
  line-height: 1.5;
}

.annotation-panel__empty {
  padding: 40px 14px;
  text-align: center;
  color: var(--nw-text-muted);
  font-size: 14px;
}

.annotation-panel__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.annotation-item {
  padding: 12px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 36%, transparent);
}

.annotation-item__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.annotation-item__type {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.annotation-item__type--highlight {
  background: color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
}

.annotation-item__type--note {
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 10%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 88%, var(--nw-text-primary));
}

.annotation-item__time {
  font-size: 11px;
  color: var(--nw-text-muted);
}

.annotation-item__note {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--nw-text-secondary);
  line-height: 1.5;
}

.annotation-item__actions {
  display: flex;
  gap: 12px;
}

.annotation-item__like,
.annotation-item__delete {
  background: none;
  border: none;
  font-size: 12px;
  cursor: pointer;
  color: var(--nw-text-muted);
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.annotation-item__like:hover {
  color: var(--mobile-focus-status-danger);
}

.annotation-item__delete:hover {
  color: var(--mobile-focus-status-danger);
}

.panel-slide-up-enter-active,
.panel-slide-up-leave-active {
  transition: opacity 0.2s ease;
}

.panel-slide-up-enter-active .annotation-panel__sheet,
.panel-slide-up-leave-active .annotation-panel__sheet {
  transition: transform 0.2s ease;
}

.panel-slide-up-enter-from,
.panel-slide-up-leave-to {
  opacity: 0;
}

.panel-slide-up-enter-from .annotation-panel__sheet,
.panel-slide-up-leave-to .annotation-panel__sheet {
  transform: translateY(100%);
}
</style>
