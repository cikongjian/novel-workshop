<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { ChapterSummary } from '../types';
import { CHAPTER_STATUS_LABELS } from '../types';

const props = defineProps<{
  chapters: ChapterSummary[];
  currentChapter: number | null;
  focusChapter?: number | null;
  keyboardFocusChapter?: number | null;
  dense?: boolean;
}>();

const emit = defineEmits<{
  select: [chapterNumber: number];
  delete: [chapterNumber: number];
  moveUp: [chapterNumber: number];
  moveDown: [chapterNumber: number];
}>();

const listEl = ref<HTMLElement | null>(null);

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    outlined: '#6b7280',
    drafted: '#6366f1',
    edited: '#3b82f6',
    reviewed: '#10b981',
    finalized: '#f59e0b',
  };
  return map[status] ?? '#6b7280';
}

function getStatusClass(status: string): string {
  return `status-${status}`;
}

function isFirst(chapterNumber: number): boolean {
  return props.chapters.length > 0 && props.chapters[0].chapterNumber === chapterNumber;
}

function isLast(chapterNumber: number): boolean {
  return props.chapters.length > 0
    && props.chapters[props.chapters.length - 1].chapterNumber === chapterNumber;
}

function onDelete(e: Event, chapterNumber: number) {
  e.stopPropagation();
  emit('delete', chapterNumber);
}

function onMoveUp(e: Event, chapterNumber: number) {
  e.stopPropagation();
  emit('moveUp', chapterNumber);
}

function onMoveDown(e: Event, chapterNumber: number) {
  e.stopPropagation();
  emit('moveDown', chapterNumber);
}

function formatWordCount(wordCount: number): string {
  const safe = Number.isFinite(wordCount) ? Math.max(0, Math.round(wordCount)) : 0;
  if (safe >= 10000) {
    const value = safe / 10000;
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} 万字`;
  }
  return `${safe} 字`;
}

function formatOpeningScore(score: number | undefined): string {
  if (!Number.isFinite(score ?? NaN)) return '--';
  return Number(score).toFixed(score! >= 100 ? 0 : 1);
}

function getOpeningTagType(chapter: ChapterSummary): 'success' | 'warning' | 'danger' | 'info' {
  const opening = chapter.diagnostics?.startupOpening;
  if (!opening) return 'info';
  if (opening.passed && opening.overallScore >= 75) return 'success';
  if (opening.passed) return 'warning';
  return 'danger';
}

function getOpeningTagLabel(chapter: ChapterSummary): string {
  const opening = chapter.diagnostics?.startupOpening;
  if (!opening) return '';
  return `开篇 ${formatOpeningScore(opening.overallScore)}`;
}

function getOpeningTagTitle(chapter: ChapterSummary): string {
  const opening = chapter.diagnostics?.startupOpening;
  if (!opening) return '';
  const findings = opening.findingsCount > 0 ? `，命中 ${opening.findingsCount} 项` : '';
  return `平台 ${opening.platformProfile}，开篇分 ${formatOpeningScore(opening.overallScore)}${findings}`;
}

function getLengthGuardTagType(chapter: ChapterSummary): 'success' | 'warning' {
  return chapter.diagnostics?.lengthGuard?.usedFallbackTrim ? 'warning' : 'success';
}

function getLengthGuardTagLabel(chapter: ChapterSummary): string {
  const guard = chapter.diagnostics?.lengthGuard;
  if (!guard?.triggered) return '';
  return guard.usedFallbackTrim ? '兜底截断' : '已纠偏';
}

function getLengthGuardTagTitle(chapter: ChapterSummary): string {
  const guard = chapter.diagnostics?.lengthGuard;
  if (!guard?.triggered) return '';
  return `字数纠偏后 ${formatWordCount(guard.finalWordCount)}${guard.usedFallbackTrim ? '，含兜底截断' : ''}`;
}

async function scrollChapterIntoView(chapterNumber: number | null | undefined) {
  if (!chapterNumber || !listEl.value) return;
  await nextTick();
  const selector = `.chapter-item[data-chapter-number="${chapterNumber}"]`;
  const target = listEl.value.querySelector<HTMLElement>(selector);
  target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

watch(() => props.focusChapter, (chapterNumber) => {
  void scrollChapterIntoView(chapterNumber);
});

watch(() => props.keyboardFocusChapter, (chapterNumber) => {
  void scrollChapterIntoView(chapterNumber);
});
</script>

<template>
  <div ref="listEl" class="chapter-list" :class="{ dense: props.dense }">
    <div v-if="chapters.length === 0" class="empty-list">
      暂无章节
    </div>
    <div
      v-for="ch in chapters"
      :key="ch.chapterNumber"
      class="chapter-item"
      :class="{
        active: currentChapter === ch.chapterNumber,
        'trend-focused': focusChapter === ch.chapterNumber,
        'keyboard-focused': keyboardFocusChapter === ch.chapterNumber,
      }"
      :data-chapter-number="ch.chapterNumber"
      @click="emit('select', ch.chapterNumber)"
    >
      <div class="chapter-row">
        <span class="status-indicator" :style="{ background: getStatusColor(ch.status) }" />
        <span class="chapter-label">第 {{ ch.chapterNumber }} 章</span>
        <span
          v-if="keyboardFocusChapter === ch.chapterNumber && currentChapter !== ch.chapterNumber"
          class="keyboard-marker"
        >
          预选
        </span>
        <span class="chapter-row-status" :class="getStatusClass(ch.status)">{{ CHAPTER_STATUS_LABELS[ch.status] }}</span>
        <!-- STAR active mark hidden: too redundant -->
        <!-- <span v-if="currentChapter === ch.chapterNumber" class="chapter-active-mark">STAR</span> -->
        <span v-if="currentChapter === ch.chapterNumber" class="chapter-actions">
          <button
            class="action-btn"
            title="上移章节"
            :aria-label="`上移第 ${ch.chapterNumber} 章`"
            :disabled="isFirst(ch.chapterNumber)"
            @click="onMoveUp($event, ch.chapterNumber)"
          >&#9650;</button>
          <button
            class="action-btn"
            title="下移章节"
            :aria-label="`下移第 ${ch.chapterNumber} 章`"
            :disabled="isLast(ch.chapterNumber)"
            @click="onMoveDown($event, ch.chapterNumber)"
          >&#9660;</button>
          <button
            class="action-btn action-delete"
            title="删除章节"
            :aria-label="`删除第 ${ch.chapterNumber} 章`"
            @click="onDelete($event, ch.chapterNumber)"
          >&#10005;</button>
        </span>
      </div>
      <div class="chapter-meta">
        <div class="chapter-meta-top">
          <span v-if="ch.title" class="chapter-sub-title">{{ ch.title }}</span>
          <span v-else class="chapter-sub-title muted">（未命名）</span>
          <span class="chapter-words">{{ formatWordCount(ch.wordCount) }}</span>
        </div>
        <!-- diagnostics chips hidden: not actionable, gives negative impression -->
        <!--
        <div
          v-if="ch.diagnostics?.startupOpening || ch.diagnostics?.lengthGuard?.triggered"
          class="chapter-health-row"
        >
          <span
            v-if="ch.diagnostics?.startupOpening"
            class="chapter-health-chip"
            :class="`is-${getOpeningTagType(ch)}`"
            :title="getOpeningTagTitle(ch)"
          >
            {{ getOpeningTagLabel(ch) }}
          </span>
          <span
            v-if="ch.diagnostics?.lengthGuard?.triggered"
            class="chapter-health-chip"
            :class="`is-${getLengthGuardTagType(ch)}`"
            :title="getLengthGuardTagTitle(ch)"
          >
            {{ getLengthGuardTagLabel(ch) }}
          </span>
        </div>
        -->
      </div>
    </div>
  </div>
</template>

<style scoped>
.chapter-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

.empty-list {
  padding: var(--nw-space-5);
  text-align: center;
  font-size: var(--nw-text-sm);
  color: var(--nw-text-muted);
}

.chapter-item {
  padding: var(--nw-space-3) var(--nw-space-4);
  cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--star-brand-sky) 18%, var(--nw-border));
  border-left: 3px solid transparent;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--star-brand-sky) 3%, transparent),
    transparent
  );
  transition: all var(--nw-duration-normal) var(--nw-ease-out);
}

.chapter-item:hover {
  background: color-mix(in srgb, var(--star-brand-sky) 11%, var(--nw-bg-hover));
  border-left-color: color-mix(in srgb, var(--star-brand-sky) 50%, transparent);
}

.chapter-item.active {
  background: color-mix(in srgb, var(--star-brand-sky) 13%, var(--nw-bg-card));
  border-left-color: color-mix(in srgb, var(--star-brand-sky) 92%, var(--nw-accent-start));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--star-brand-sky) 48%, transparent);
}

.chapter-item.keyboard-focused:not(.active) {
  background: rgba(59, 130, 246, 0.06);
  border-left-color: rgba(59, 130, 246, 0.7);
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.22);
}

.chapter-item.trend-focused {
  animation: chapter-focus-pulse 1.6s ease-out;
}

@keyframes chapter-focus-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.45);
    background: rgba(59, 130, 246, 0.12);
  }
  100% {
    box-shadow: 0 0 0 14px rgba(59, 130, 246, 0);
  }
}

.chapter-row {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2);
  min-height: 22px;
}

.status-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 8px color-mix(in srgb, var(--star-brand-sky) 30%, transparent);
}

.chapter-label {
  font-size: var(--nw-text-sm);
  font-weight: var(--nw-font-medium);
  color: var(--nw-text-primary);
}

.keyboard-marker {
  font-size: 10px;
  line-height: 1;
  color: #1d4ed8;
  background: rgba(59, 130, 246, 0.16);
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 999px;
  padding: 2px 6px;
}

.chapter-row-status {
  font-size: 10px;
  color: var(--nw-text-muted);
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 20%, var(--nw-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--star-brand-sky) 6%, var(--nw-bg-card));
  padding: 1px 7px;
  line-height: 1.2;
  white-space: nowrap;
}

.chapter-row-status.status-outlined {
  color: var(--nw-text-muted);
}

.chapter-row-status.status-drafted {
  color: color-mix(in srgb, var(--star-brand-sky) 70%, var(--nw-text-primary));
  border-color: color-mix(in srgb, var(--star-brand-sky) 34%, var(--nw-border));
}

.chapter-row-status.status-edited {
  color: #0284c7;
  border-color: rgba(14, 165, 233, 0.34);
  background: rgba(14, 165, 233, 0.1);
}

.chapter-row-status.status-reviewed {
  color: #059669;
  border-color: rgba(16, 185, 129, 0.34);
  background: rgba(16, 185, 129, 0.1);
}

.chapter-row-status.status-finalized {
  color: #f8fafc;
  border-color: transparent;
  background: var(--star-brand-gradient);
}

.chapter-active-mark {
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--star-brand-sky) 84%, var(--nw-text-primary));
  background: color-mix(in srgb, var(--star-brand-sky) 12%, var(--nw-bg-card));
  border: 1px solid color-mix(in srgb, var(--star-brand-sky) 34%, var(--nw-border));
  border-radius: 999px;
  padding: 2px 7px;
}

.chapter-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.action-btn {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--nw-glass);
  color: var(--nw-text-secondary);
  border-radius: var(--nw-radius-sm);
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
  padding: 0;
  transition: all var(--nw-duration-fast) ease;
}

.action-btn:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.3);
  color: var(--nw-text-primary);
}

.action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.action-delete:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
  color: var(--nw-danger);
}

.chapter-meta {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  margin-top: 4px;
  padding-left: calc(var(--nw-space-2) + 8px);
  transition: all var(--nw-duration-fast) ease;
}

.chapter-meta-top {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2);
  min-width: 0;
}

html.dark .chapter-row-status.status-finalized {
  color: #e2e8f0;
}

.chapter-sub-title {
  flex: 1 1 auto;
  font-size: var(--nw-text-xs);
  color: var(--nw-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.chapter-sub-title.muted {
  color: var(--nw-text-muted);
}

.chapter-words {
  margin-left: auto;
  flex: 0 0 auto;
  font-size: var(--nw-text-xs);
  color: var(--nw-text-muted);
  white-space: nowrap;
}

.chapter-health-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chapter-health-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 1px 6px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.5;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.chapter-health-chip.is-success {
  color: color-mix(in srgb, var(--nw-success) 84%, var(--nw-text-primary));
  border-color: color-mix(in srgb, var(--nw-success) 30%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-success) 10%, var(--nw-bg-card));
}

.chapter-health-chip.is-warning {
  color: color-mix(in srgb, var(--nw-warning) 86%, var(--nw-text-primary));
  border-color: color-mix(in srgb, var(--nw-warning) 30%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-warning) 10%, var(--nw-bg-card));
}

.chapter-health-chip.is-danger {
  color: color-mix(in srgb, var(--nw-danger) 84%, var(--nw-text-primary));
  border-color: color-mix(in srgb, var(--nw-danger) 30%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-danger) 10%, var(--nw-bg-card));
}

.chapter-health-chip.is-info {
  color: color-mix(in srgb, var(--nw-info) 84%, var(--nw-text-primary));
  border-color: color-mix(in srgb, var(--nw-info) 28%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-info) 10%, var(--nw-bg-card));
}

.chapter-list.dense .chapter-item {
  padding: 8px 10px;
}

.chapter-list.dense .chapter-label {
  font-size: 12px;
}

.chapter-list.dense .chapter-row-status {
  padding: 1px 5px;
}

.chapter-list.dense .chapter-meta {
  margin-top: 0;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}

.chapter-list.dense .chapter-item:hover .chapter-meta,
.chapter-list.dense .chapter-item.active .chapter-meta,
.chapter-list.dense .chapter-item.keyboard-focused .chapter-meta {
  margin-top: 3px;
  max-height: 56px;
  opacity: 1;
  pointer-events: auto;
}

.chapter-list.dense .chapter-sub-title {
  max-width: 104px;
}

.chapter-list.dense .chapter-health-row {
  gap: 4px;
}

.chapter-list.dense .chapter-health-chip {
  padding: 1px 5px;
  font-size: 9px;
}
</style>
