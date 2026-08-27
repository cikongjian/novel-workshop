<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue';

const props = defineProps<{
  visible: boolean;
  content: string;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  replace: [start: number, end: number, newText: string];
  highlight: [start: number, end: number];
  'matches-change': [matches: { start: number; end: number }[], currentIndex: number];
}>();

const searchText = ref('');
const replaceText = ref('');
const caseSensitive = ref(false);
const currentMatchIndex = ref(0);
const searchInputRef = ref<HTMLInputElement | null>(null);

interface MatchResult {
  start: number;
  end: number;
}

const matches = computed<MatchResult[]>(() => {
  if (!searchText.value) return [];
  const content = props.content;
  const query = caseSensitive.value ? searchText.value : searchText.value.toLowerCase();
  const source = caseSensitive.value ? content : content.toLowerCase();
  const results: MatchResult[] = [];
  let idx = 0;
  while (idx < source.length) {
    const found = source.indexOf(query, idx);
    if (found === -1) break;
    results.push({ start: found, end: found + searchText.value.length });
    idx = found + 1;
  }
  return results;
});

const matchCountText = computed(() => {
  if (!searchText.value) return '';
  if (matches.value.length === 0) return '无匹配';
  return `${currentMatchIndex.value + 1} / ${matches.value.length}`;
});

function resolveActiveMatchIndex() {
  if (matches.value.length === 0) return -1;
  return Math.min(currentMatchIndex.value, matches.value.length - 1);
}

watch(() => props.visible, (v) => {
  if (v) {
    nextTick(() => searchInputRef.value?.focus());
    emitHighlight();
  }
});

watch(searchText, () => {
  currentMatchIndex.value = 0;
  emitHighlight();
});

watch(caseSensitive, () => {
  currentMatchIndex.value = 0;
  emitHighlight();
});

watch(() => props.content, () => {
  if (!searchText.value) {
    emitHighlight();
    return;
  }
  if (matches.value.length === 0) {
    currentMatchIndex.value = 0;
    emitHighlight();
    return;
  }
  if (currentMatchIndex.value >= matches.value.length) currentMatchIndex.value = 0;
  emitHighlight();
});

function emitHighlight() {
  const activeIndex = resolveActiveMatchIndex();
  const m = activeIndex >= 0 ? matches.value[activeIndex] : undefined;
  if (m) {
    emit('highlight', m.start, m.end);
  }
  emit('matches-change', matches.value, activeIndex);
}

function goNext() {
  if (matches.value.length === 0) return;
  currentMatchIndex.value = (currentMatchIndex.value + 1) % matches.value.length;
  emitHighlight();
}

function goPrev() {
  if (matches.value.length === 0) return;
  currentMatchIndex.value =
    (currentMatchIndex.value - 1 + matches.value.length) % matches.value.length;
  emitHighlight();
}

function replaceCurrent() {
  const m = matches.value[currentMatchIndex.value];
  if (!m) return;
  emit('replace', m.start, m.end, replaceText.value);
}

function replaceAll() {
  if (matches.value.length === 0) return;
  // 从后往前替换以保持索引正确性
  const reversed = [...matches.value].reverse();
  for (const m of reversed) {
    emit('replace', m.start, m.end, replaceText.value);
  }
}

function close() {
  emit('update:visible', false);
  emit('matches-change', [], -1);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close();
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    goNext();
  }
}
</script>

<template>
  <Transition name="find-slide">
    <div v-if="visible" class="find-replace-panel" @keydown="onKeyDown">
      <div class="find-row">
        <input
          ref="searchInputRef"
          v-model="searchText"
          class="find-input"
          placeholder="查找..."
          spellcheck="false"
        />
        <span class="match-count">{{ matchCountText }}</span>
        <button class="find-nav-btn" title="上一个" :disabled="matches.length === 0" @click="goPrev">&#9650;</button>
        <button class="find-nav-btn" title="下一个" :disabled="matches.length === 0" @click="goNext">&#9660;</button>
        <button
          class="find-option-btn"
          :class="{ active: caseSensitive }"
          title="区分大小写"
          @click="caseSensitive = !caseSensitive"
        >Aa</button>
        <button class="find-close-btn" title="关闭 (Esc)" @click="close">&#10005;</button>
      </div>
      <div class="replace-row">
        <input
          v-model="replaceText"
          class="find-input"
          placeholder="替换为..."
          spellcheck="false"
        />
        <button class="find-action-btn" :disabled="matches.length === 0" @click="replaceCurrent">替换</button>
        <button class="find-action-btn" :disabled="matches.length === 0" @click="replaceAll">全部</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.find-replace-panel {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--nw-space-2) var(--nw-space-3);
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--star-brand-sky) 10%, var(--nw-bg-secondary)),
      color-mix(in srgb, var(--star-brand-teal) 8%, var(--nw-bg-secondary))
    );
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 26%, var(--nw-glass-border));
  border-radius: 0 0 0 var(--nw-radius-md);
  box-shadow:
    0 14px 30px color-mix(in srgb, var(--star-brand-sky) 16%, rgba(15, 23, 42, 0.3)),
    inset 0 1px 0 color-mix(in srgb, #ffffff 20%, transparent);
  backdrop-filter: blur(16px);
}

.find-row,
.replace-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.find-input {
  width: 180px;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 24%, var(--nw-glass-border));
  border-radius: var(--nw-radius-sm);
  background: color-mix(in srgb, var(--star-brand-sky) 8%, var(--nw-bg-card));
  color: var(--nw-text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--nw-duration-fast) ease;
}

.find-input:focus {
  border-color: color-mix(in srgb, var(--star-brand-sky) 58%, var(--nw-accent-start));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--star-brand-sky) 16%, transparent);
}

.match-count {
  font-size: 11px;
  color: var(--nw-text-muted);
  min-width: 50px;
  text-align: center;
}

.find-nav-btn,
.find-option-btn,
.find-close-btn,
.find-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 6px;
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 26%, var(--nw-glass-border));
  border-radius: var(--nw-radius-sm);
  background: color-mix(in srgb, var(--star-brand-sky) 8%, var(--nw-bg-card));
  color: var(--nw-text-secondary);
  cursor: pointer;
  font-size: 11px;
  transition: all var(--nw-duration-fast) ease;
  min-height: 24px;
}

.find-nav-btn:hover:not(:disabled),
.find-action-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--star-brand-sky) 18%, var(--nw-bg-card));
  color: var(--nw-text-primary);
}

.find-nav-btn:disabled,
.find-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.find-option-btn.active {
  background: color-mix(in srgb, var(--star-brand-sky) 24%, var(--nw-bg-card));
  color: color-mix(in srgb, var(--star-brand-sky) 86%, var(--nw-accent-start));
  border-color: color-mix(in srgb, var(--star-brand-sky) 52%, var(--nw-accent-start));
}

.find-close-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--nw-danger);
}

html.dark .find-replace-panel {
  background:
    linear-gradient(145deg, rgba(6, 16, 32, 0.95), rgba(6, 18, 34, 0.9));
  box-shadow:
    0 18px 34px rgba(2, 9, 21, 0.5),
    inset 0 1px 0 rgba(191, 219, 254, 0.12);
}

/* ===== 动画 ===== */
.find-slide-enter-active,
.find-slide-leave-active {
  transition: all 0.2s var(--nw-ease-out);
}

.find-slide-enter-from,
.find-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
