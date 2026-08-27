<script setup lang="ts">
import { computed } from 'vue';
import { EditPen, ChatLineSquare, Share, Delete } from '@element-plus/icons-vue';

const props = defineProps<{
  visible: boolean;
  x: number;
  y: number;
  type: 'select' | 'highlight'; // select=选中文字操作, highlight=已有划线操作
  annotationCount?: number;
}>();

const emit = defineEmits<{
  (e: 'highlight'): void;
  (e: 'note'): void;
  (e: 'share'): void;
  (e: 'delete'): void;
  (e: 'close'): void;
}>();

const style = computed(() => ({
  left: `${Math.min(props.x, window.innerWidth - 180)}px`,
  top: `${Math.max(props.y - 50, 10)}px`,
}));
</script>

<template>
  <Transition name="action-bar-fade">
    <div v-if="visible" class="text-action-bar" :style="style" @click.stop>
      <template v-if="type === 'select'">
        <button class="text-action-bar__btn" @click="emit('highlight')">
          <el-icon :size="16"><EditPen /></el-icon>
          <span>划线</span>
        </button>
        <button class="text-action-bar__btn" @click="emit('note')">
          <el-icon :size="16"><ChatLineSquare /></el-icon>
          <span>写想法</span>
        </button>
        <button class="text-action-bar__btn" @click="emit('share')">
          <el-icon :size="16"><Share /></el-icon>
          <span>分享</span>
        </button>
      </template>
      <template v-else>
        <span class="text-action-bar__count" v-if="annotationCount">
          {{ annotationCount }} 条划线
        </span>
        <button class="text-action-bar__btn" @click="emit('delete')">
          <el-icon :size="16"><Delete /></el-icon>
          <span>删除</span>
        </button>
      </template>
      <button class="text-action-bar__dismiss" @click="emit('close')">✕</button>
    </div>
  </Transition>
</template>

<style scoped>
.text-action-bar {
  position: fixed;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(30, 30, 40, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-radius: 10px;
  padding: 4px 6px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
}

.text-action-bar__btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: none;
  border: none;
  color: #e2e8f0;
  font-size: 11px;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  min-width: 44px;
  transition: background 0.15s;
}

.text-action-bar__btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.text-action-bar__count {
  color: #94a3b8;
  font-size: 12px;
  padding: 0 8px;
}

.text-action-bar__dismiss {
  background: none;
  border: none;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.text-action-bar__dismiss:hover {
  color: #e2e8f0;
}

.action-bar-fade-enter-active,
.action-bar-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.action-bar-fade-enter-from,
.action-bar-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
