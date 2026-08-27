<script setup lang="ts">
import { Delete } from '@element-plus/icons-vue';
import type { ComicScene } from '../../api/comic';

const props = defineProps<{
  scene: ComicScene;
  selected: boolean;
  locked?: boolean;
  historical?: boolean;
}>();

const emit = defineEmits<{
  toggle: [sceneId: string];
  remove: [sceneId: string];
}>();

const SHOT_LABELS: Record<string, string> = { wide: '远景', medium: '中景', closeup: '特写', insert: '细节' };
const PANEL_ROLE_LABELS: Record<string, string> = {
  establish: '建场',
  action: '动作',
  reaction: '反应',
  detail: '细节',
  conflict: '冲突',
  reveal: '揭示',
  cliffhanger: '钩子',
};
const COMPOSITION_LABELS: Record<string, string> = {
  'rule-of-thirds': '三分法',
  diagonal: '对角',
  center: '居中',
};

function shotTypeLabel(value: string): string {
  return SHOT_LABELS[value] ?? value;
}

function compositionLabel(value: string): string {
  return COMPOSITION_LABELS[value] ?? value;
}

function panelRoleLabel(value?: string): string {
  return value ? PANEL_ROLE_LABELS[value] ?? value : '分格';
}

function onToggle(): void {
  emit('toggle', props.scene.sceneId);
}

function onRemove(): void {
  if (props.locked) return;
  emit('remove', props.scene.sceneId);
}
</script>

<template>
  <label
    class="mobile-comic-scene-card"
    :class="{
      'mobile-comic-scene-card--selected': selected,
      'mobile-comic-scene-card--historical': historical,
    }"
  >
    <input
      type="checkbox"
      :checked="selected"
      @change="onToggle"
    />
    <div class="mobile-comic-scene-card__body">
      <div class="mobile-comic-scene-card__title-row">
        <div class="mobile-comic-scene-card__title">{{ scene.title }}</div>
        <button
          type="button"
          class="mobile-comic-scene-card__delete"
          :disabled="locked"
          :title="locked ? '已生成漫画格，保留用于单格重生' : '删除候选'"
          :aria-label="locked ? '已生成漫画格，保留用于单格重生' : '删除候选'"
          @click.prevent.stop="onRemove"
        >
          <el-icon :size="14"><Delete /></el-icon>
        </button>
      </div>
      <div class="mobile-comic-scene-card__meta">
        <span v-if="scene.pageIndex">第{{ scene.pageIndex }}页-{{ scene.panelIndexInPage || '?' }}格</span>
        <span v-if="scene.panelRole">{{ panelRoleLabel(scene.panelRole) }}</span>
        <span>{{ shotTypeLabel(scene.shotType) }}</span>
        <span>{{ compositionLabel(scene.composition) }}</span>
        <span>情绪：{{ scene.emotion }}</span>
      </div>
      <div class="mobile-comic-scene-card__event">{{ scene.event }}</div>
      <div v-if="scene.dialogue" class="mobile-comic-scene-card__dialogue">「{{ scene.dialogue }}」</div>
      <div class="mobile-comic-scene-card__chars">
        <span v-for="character in scene.characters" :key="character.name">
          {{ character.name }}（{{ character.action }} / {{ character.expression }}）
        </span>
      </div>
      <div class="mobile-comic-scene-card__reason">分镜理由：{{ scene.shotReason }}</div>
    </div>
  </label>
</template>

<style scoped>
.mobile-comic-scene-card {
  display: flex;
  gap: 10px;
  padding: 14px;
  margin-bottom: 12px;
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-border);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.mobile-comic-scene-card--selected {
  border-color: var(--nw-accent);
  background: color-mix(in srgb, var(--nw-accent) 8%, var(--nw-bg-secondary));
}

.mobile-comic-scene-card--historical {
  background: color-mix(in srgb, var(--nw-bg-secondary) 82%, var(--nw-bg-primary, #fff));
}

.mobile-comic-scene-card input[type='checkbox'] {
  margin-top: 3px;
  flex-shrink: 0;
}

.mobile-comic-scene-card__body {
  flex: 1;
  min-width: 0;
}

.mobile-comic-scene-card__title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}

.mobile-comic-scene-card__title {
  flex: 1;
  min-width: 0;
  color: var(--nw-text-primary);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
  word-break: break-word;
}

.mobile-comic-scene-card__delete {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 28px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--nw-danger, #dc2626) 24%, var(--nw-border));
  border-radius: 8px;
  background: var(--nw-bg-primary, #fff);
  color: var(--nw-danger, #dc2626);
  cursor: pointer;
}

.mobile-comic-scene-card__delete:disabled {
  color: var(--nw-text-muted, #94a3b8);
  border-color: var(--nw-border);
  cursor: not-allowed;
  opacity: 0.72;
}

.mobile-comic-scene-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  color: var(--nw-accent);
  font-size: 12px;
}

.mobile-comic-scene-card__event {
  margin-bottom: 6px;
  color: var(--nw-text-primary);
  font-size: 13px;
  line-height: 1.5;
}

.mobile-comic-scene-card__dialogue {
  margin-bottom: 6px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--nw-accent) 10%, transparent);
  border-radius: 8px;
  color: var(--nw-text-primary);
  font-size: 13px;
}

.mobile-comic-scene-card__chars {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
  color: var(--nw-text-secondary);
  font-size: 12px;
}

.mobile-comic-scene-card__reason {
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-style: italic;
  line-height: 1.5;
}
</style>
