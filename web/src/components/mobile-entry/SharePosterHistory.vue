<script setup lang="ts">
import type { PosterHistoryItem } from '../../composables/useSharePoster';

const props = defineProps<{
  history: PosterHistoryItem[];
  loading: boolean;
  currentPosterId: string | null;
}>();

const emit = defineEmits<{
  (e: 'select', item: PosterHistoryItem): void;
  (e: 'disable', posterId: string): void;
  (e: 'enable', posterId: string): void;
  (e: 'delete', posterId: string): void;
  (e: 'copy', item: PosterHistoryItem): void;
}>();

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' 分钟前';
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + ' 小时前';
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}月${day}日 ${hh}:${mm}`;
}
</script>

<template>
  <div class="poster-history">
    <div class="poster-history__header">
      <span class="poster-history__title">历史海报</span>
      <span v-if="history.length" class="poster-history__count">{{ history.length }} 条</span>
    </div>

    <div v-if="loading" class="poster-history__empty">加载中...</div>
    <div v-else-if="!history.length" class="poster-history__empty">暂无历史海报</div>

    <ul v-else class="poster-history__list">
      <li
        v-for="item in history"
        :key="item.posterId"
        class="poster-history__item"
        :class="{
          'poster-history__item--active': item.posterId === currentPosterId,
          'poster-history__item--disabled': item.status === 'disabled',
        }"
        @click="emit('select', item)"
      >
        <div class="poster-history__item-main">
          <strong class="poster-history__item-title">{{ item.headline || item.novelTitle }}</strong>
          <span class="poster-history__item-time">{{ formatTime(item.createdAt) }}</span>
          <span
            v-if="item.status === 'disabled'"
            class="poster-history__item-badge poster-history__item-badge--off"
          >已禁用</span>
        </div>

        <div class="poster-history__item-actions" @click.stop>
          <button
            class="poster-history__btn poster-history__btn--copy"
            type="button"
            title="复制链接"
            @click="emit('copy', item)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
          <button
            v-if="item.status === 'active'"
            class="poster-history__btn poster-history__btn--off"
            type="button"
            title="禁用"
            @click="emit('disable', item.posterId)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </button>
          <button
            v-else
            class="poster-history__btn poster-history__btn--on"
            type="button"
            title="启用"
            @click="emit('enable', item.posterId)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
            </svg>
          </button>
          <button
            class="poster-history__btn poster-history__btn--del"
            type="button"
            title="永久删除"
            @click="emit('delete', item.posterId)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* 全部固定色值 */
.poster-history {
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  max-height: 220px;
  display: flex;
  flex-direction: column;
}

.poster-history__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 6px;
}

.poster-history__title {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  letter-spacing: 1px;
}

.poster-history__count {
  font-size: 11px;
  color: #94a3b8;
}

.poster-history__empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
}

.poster-history__list {
  list-style: none;
  overflow-y: auto;
  flex: 1;
  padding: 0 8px 8px;
}

.poster-history__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.poster-history__item:hover {
  background: rgba(99, 102, 241, 0.06);
}

.poster-history__item--active {
  background: rgba(99, 102, 241, 0.1);
}

.poster-history__item--disabled {
  opacity: 0.55;
}

.poster-history__item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.poster-history__item-title {
  font-size: 13px;
  font-weight: 500;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}

.poster-history__item-time {
  font-size: 11px;
  color: #94a3b8;
  flex-shrink: 0;
}

.poster-history__item-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.poster-history__item-badge--off {
  background: #fee2e2;
  color: #dc2626;
}

.poster-history__item-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.poster-history__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #ffffff;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}

.poster-history__btn:hover {
  border-color: #cbd5e1;
}

.poster-history__btn--copy:hover { color: #6366f1; border-color: #c7d2fe; }
.poster-history__btn--off:hover { color: #d97706; border-color: #fde68a; }
.poster-history__btn--on:hover { color: #16a34a; border-color: #bbf7d0; }
.poster-history__btn--del:hover { color: #dc2626; border-color: #fecaca; }
</style>
