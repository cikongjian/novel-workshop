<script setup lang="ts">
/**
 * 作品状态选择弹层 —— 作者在作品详情页点击状态 tag 时弹出，选择连载/完结等状态。
 * 采用 el-dialog + mobile-focus 主题类，与 MobilePublishSheet 等移动端弹层风格一致。
 * 状态通过 PUT /api/novels/:id 的 status 字段更新。
 */
import { Check } from '@element-plus/icons-vue';
import { STATUS_LABELS, type NovelStatus } from '../../types';

defineProps<{
  visible: boolean;
  currentStatus: NovelStatus;
}>();

const emit = defineEmits<{
  close: [];
  change: [status: NovelStatus];
}>();

const STATUS_OPTIONS: Array<{ value: NovelStatus; label: string; desc: string }> = [
  { value: 'planning', label: STATUS_LABELS.planning, desc: '还在酝酿大纲与设定' },
  { value: 'writing', label: STATUS_LABELS.writing, desc: '正在持续更新' },
  { value: 'paused', label: STATUS_LABELS.paused, desc: '暂时停更，稍后继续' },
  { value: 'completed', label: STATUS_LABELS.completed, desc: '全文已完结' },
  { value: 'published', label: STATUS_LABELS.published, desc: '已上架书城' },
];

function select(status: NovelStatus): void {
  emit('change', status);
  emit('close');
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="作品状态"
    width="92%"
    class="mobile-novel-status-dialog"
    @update:model-value="(val: boolean) => { if (!val) emit('close'); }"
  >
    <div class="novel-status-options">
      <button
        v-for="opt in STATUS_OPTIONS"
        :key="opt.value"
        type="button"
        class="novel-status-option"
        :class="{ active: opt.value === currentStatus }"
        @click="select(opt.value)"
      >
        <span class="novel-status-option__label">
          <strong>{{ opt.label }}</strong>
          <small>{{ opt.desc }}</small>
        </span>
        <el-icon v-if="opt.value === currentStatus" class="novel-status-option__check">
          <Check />
        </el-icon>
      </button>
    </div>
  </el-dialog>
</template>

<style scoped>
.novel-status-options {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}

.novel-status-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  text-align: left;
  padding: 12px 14px;
  border: 1px solid var(--nw-border);
  border-radius: 14px;
  background: var(--nw-bg-secondary);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.novel-status-option.active {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 55%, var(--nw-border));
  background: color-mix(in srgb, var(--mobile-focus-accent) 8%, var(--nw-bg-secondary));
}

.novel-status-option__label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.novel-status-option__label strong {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.novel-status-option__label small {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.novel-status-option__check {
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  font-size: 18px;
}
</style>
