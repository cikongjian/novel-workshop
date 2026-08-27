<script setup lang="ts">
import { watch } from 'vue';
import type { PosterHistoryItem } from '../../composables/useSharePoster';

const props = defineProps<{
  visible: boolean;
  history: PosterHistoryItem[];
  loading: boolean;
  generating: boolean;
  novelTitle: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'generate'): void;
  (e: 'select', item: PosterHistoryItem): void;
  (e: 'loadHistory'): void;
  (e: 'disable', posterId: string): void;
  (e: 'enable', posterId: string): void;
  (e: 'delete', posterId: string): void;
}>();

watch(() => props.visible, (v) => {
  if (v) emit('loadHistory');
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  const diff = Date.now() - ts;
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
  <transition name="list-fade">
    <div v-if="visible" class="poster-list-overlay" @click.self="emit('close')">
      <div class="poster-list">
        <header class="poster-list__header">
          <button class="poster-list__close" type="button" @click="emit('close')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <span class="poster-list__title">分享海报</span>
          <span class="poster-list__subtitle">{{ novelTitle }}</span>
        </header>

        <div class="poster-list__body">
          <!-- 加载中 -->
          <div v-if="loading && !history.length" class="poster-list__state">
            <div class="poster-list__spinner" />
            <p>加载中...</p>
          </div>

          <!-- 空状态 -->
          <div v-else-if="!history.length" class="poster-list__empty">
            <div class="poster-list__empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            <strong>还没有分享海报</strong>
            <p>让 AI 分析剧情，生成一张可分享的推广海报页面，发到朋友圈吸引读者。</p>
            <button
              class="poster-list__generate-btn"
              type="button"
              :disabled="generating"
              @click="emit('generate')"
            >
              {{ generating ? 'AI 生成中...' : '马上生成' }}
            </button>
          </div>

          <!-- 列表 -->
          <template v-else>
            <button
              class="poster-list__generate-btn poster-list__generate-btn--inline"
              type="button"
              :disabled="generating"
              @click="emit('generate')"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {{ generating ? '生成中...' : '生成新海报' }}
            </button>

            <ul class="poster-list__items">
              <li
                v-for="item in history"
                :key="item.posterId"
                class="poster-list__item"
                :class="{ 'poster-list__item--disabled': item.status === 'disabled' }"
                @click="emit('select', item)"
              >
                <div class="poster-list__item-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>

                <div class="poster-list__item-main">
                  <strong class="poster-list__item-title">{{ item.headline || item.novelTitle }}</strong>
                  <div class="poster-list__item-meta">
                    <span class="poster-list__item-time">{{ formatTime(item.createdAt) }}</span>
                    <span
                      v-if="item.status === 'disabled'"
                      class="poster-list__item-badge"
                    >已禁用</span>
                    <span
                      v-else
                      class="poster-list__item-badge poster-list__item-badge--active"
                    >可用</span>
                  </div>
                </div>

                <svg class="poster-list__item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </li>
            </ul>

            <p class="poster-list__tip">点击海报查看预览、复制链接或分享到微信</p>
          </template>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* 全部固定色值 */
.poster-list-overlay {
  position: fixed;
  inset: 0;
  z-index: 205;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.poster-list {
  background: #ffffff;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  animation: list-up 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes list-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.poster-list__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 16px 12px;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.poster-list__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.06);
  color: #475569;
  cursor: pointer;
}

.poster-list__title {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.poster-list__subtitle {
  flex: 1;
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.poster-list__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
}

/* 加载/空状态 */
.poster-list__state,
.poster-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 24px;
  text-align: center;
}

.poster-list__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.poster-list__state p {
  font-size: 13px;
  color: #64748b;
}

.poster-list__empty-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
}

.poster-list__empty strong {
  font-size: 16px;
  color: #0f172a;
}

.poster-list__empty p {
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
  max-width: 280px;
}

.poster-list__generate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  min-height: 48px;
  transition: opacity 0.2s;
  margin-top: 8px;
}

.poster-list__generate-btn--inline {
  margin-top: 0;
  margin-bottom: 14px;
}

.poster-list__generate-btn:disabled {
  opacity: 0.6;
}

/* 列表项 */
.poster-list__items {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.poster-list__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #f8fafc;
  cursor: pointer;
  transition: all 0.15s;
}

.poster-list__item:hover {
  border-color: #c7d2fe;
  background: rgba(99, 102, 241, 0.04);
}

.poster-list__item--disabled {
  opacity: 0.6;
}

.poster-list__item-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.poster-list__item-main {
  flex: 1;
  min-width: 0;
}

.poster-list__item-title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.poster-list__item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.poster-list__item-time {
  font-size: 11px;
  color: #94a3b8;
}

.poster-list__item-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #64748b;
}

.poster-list__item-badge--active {
  background: #dcfce7;
  color: #16a34a;
}

.poster-list__item-arrow {
  flex-shrink: 0;
  color: #cbd5e1;
}

.poster-list__tip {
  margin-top: 14px;
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
}

.list-fade-enter-active,
.list-fade-leave-active {
  transition: opacity 0.25s;
}
.list-fade-enter-from,
.list-fade-leave-to {
  opacity: 0;
}
</style>
