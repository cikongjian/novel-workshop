<script setup lang="ts">
import { ref, watch, nextTick, computed, onUnmounted } from 'vue';
import type { PosterResult, PosterHistoryItem, PosterStats } from '../../composables/useSharePoster';
import SharePosterHistory from './SharePosterHistory.vue';
import SharePosterStats from './SharePosterStats.vue';

const props = defineProps<{
  visible: boolean;
  poster: PosterResult | null;
  generating: boolean;
  error: string;
  history: PosterHistoryItem[];
  historyLoading: boolean;
  stats: PosterStats | null;
  statsLoading: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'regenerate'): void;
  (e: 'loadStats'): void;
  (e: 'refreshStats'): void;
  (e: 'selectHistory', item: PosterHistoryItem): void;
  (e: 'disable', posterId: string): void;
  (e: 'enable', posterId: string): void;
  (e: 'delete', posterId: string): void;
}>();

const iframeRef = ref<HTMLIFrameElement | null>(null);
const copied = ref(false);
const copiedChannel = ref('');
const sharing = ref(false);
const activeTab = ref<'preview' | 'stats' | 'history'>('preview');

const currentPosterId = computed(() => props.poster?.posterId ?? null);

const pageUrl = computed(() => {
  if (!props.poster) return '';
  const match = window.location.pathname.match(/^(\/(?:fullstack|apps)\/[^/]+)/);
  const base = match ? match[1] : '';
  return `${window.location.origin}${base}/api${props.poster.pageUrl}`;
});

watch(() => props.visible, async (v) => {
  if (v) {
    copied.value = false;
    copiedChannel.value = '';
    activeTab.value = 'preview';
    await nextTick();
    if (props.poster) emit('loadStats');
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
});

watch(() => props.poster?.posterId, (id) => {
  if (id && props.visible) emit('loadStats');
});

// 切换到统计 Tab 时加载统计
watch(activeTab, (tab) => {
  if (tab === 'stats' && props.poster) emit('refreshStats');
});

// 自动刷新统计（每 10 秒，仅在统计 Tab 时）
let refreshTimer: ReturnType<typeof setInterval> | null = null;
function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    if (props.visible && props.poster && activeTab.value === 'stats') emit('refreshStats');
  }, 10_000);
}
function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}
onUnmounted(stopAutoRefresh);

async function copyLink(channel?: string) {
  if (!pageUrl.value) return;
  const url = channel ? `${pageUrl.value}${pageUrl.value.includes('?') ? '&' : '?'}from=${channel}` : pageUrl.value;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copiedChannel.value = channel || 'default';
    copied.value = true;
    setTimeout(() => { copied.value = false; copiedChannel.value = ''; }, 2000);
  } catch { /* 静默 */ }
}

async function shareLink() {
  if (!pageUrl.value || !props.poster) return;
  sharing.value = true;
  try {
    if (navigator.share) {
      await navigator.share({
        title: props.poster.novelTitle || '推荐一部好小说',
        text: props.poster.tagline || props.poster.headline || '',
        url: pageUrl.value,
      });
    } else {
      await copyLink();
    }
  } catch { /* 用户取消 */ }
  finally { sharing.value = false; }
}

function openInNewTab() {
  if (!pageUrl.value) return;
  window.open(pageUrl.value, '_blank');
}

function onCopyHistory(item: PosterHistoryItem) {
  const match = window.location.pathname.match(/^(\/(?:fullstack|apps)\/[^/]+)/);
  const base = match ? match[1] : '';
  const url = `${window.location.origin}${base}/api${item.pageUrl}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).catch(() => {});
  }
}
</script>

<template>
  <transition name="preview-fade">
    <div v-if="visible" class="poster-preview-overlay" @click.self="emit('close')">
      <div class="poster-preview">
        <header class="poster-preview__header">
          <button class="poster-preview__close" type="button" @click="emit('close')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <span class="poster-preview__title">分享海报</span>
          <button
            v-if="poster && !generating"
            class="poster-preview__regen"
            type="button"
            @click="emit('regenerate')"
          >重新生成</button>
        </header>

        <!-- 生成中 -->
        <div v-if="generating" class="poster-preview__center">
          <div class="poster-preview__spinner" />
          <p>AI 正在分析剧情并生成推广文案...</p>
          <small>通常需要 10-20 秒</small>
        </div>

        <!-- 错误 -->
        <div v-else-if="error" class="poster-preview__center poster-preview__center--error">
          <strong>生成失败</strong>
          <p>{{ error }}</p>
          <button class="poster-preview__retry" type="button" @click="emit('regenerate')">重试</button>
        </div>

        <!-- 空状态 -->
        <div v-else-if="!poster" class="poster-preview__center">
          <p>点击「重新生成」创建海报</p>
        </div>

        <!-- 正常预览 -->
        <template v-else>
          <!-- Tab 切换 -->
          <nav class="poster-preview__tabs">
            <button
              class="poster-preview__tab"
              :class="{ 'poster-preview__tab--active': activeTab === 'preview' }"
              type="button"
              @click="activeTab = 'preview'"
            >预览</button>
            <button
              class="poster-preview__tab"
              :class="{ 'poster-preview__tab--active': activeTab === 'stats' }"
              type="button"
              @click="activeTab = 'stats'"
            >数据</button>
            <button
              class="poster-preview__tab"
              :class="{ 'poster-preview__tab--active': activeTab === 'history' }"
              type="button"
              @click="activeTab = 'history'"
            >历史</button>
          </nav>

          <!-- 主内容区（flex:1 占满） -->
          <div class="poster-preview__main">
            <!-- 预览 Tab -->
            <div v-show="activeTab === 'preview'" class="poster-preview__preview-pane">
              <div class="poster-preview__iframe-wrap">
                <iframe
                  ref="iframeRef"
                  :src="pageUrl"
                  class="poster-preview__iframe"
                  title="海报预览"
                  sandbox="allow-same-origin allow-scripts allow-popups"
                />
              </div>
            </div>

            <!-- 数据 Tab -->
            <div v-show="activeTab === 'stats'" class="poster-preview__stats-pane">
              <SharePosterStats
                :stats="stats"
                :loading="statsLoading"
                @refresh="emit('refreshStats')"
              />
            </div>

            <!-- 历史 Tab -->
            <div v-show="activeTab === 'history'" class="poster-preview__history-pane">
              <SharePosterHistory
                :history="history"
                :loading="historyLoading"
                :current-poster-id="currentPosterId"
                @select="emit('selectHistory', $event)"
                @disable="emit('disable', $event)"
                @enable="emit('enable', $event)"
                @delete="emit('delete', $event)"
                @copy="onCopyHistory"
              />
            </div>
          </div>

          <!-- 底部操作栏（固定在底部） -->
          <footer class="poster-preview__footer">
            <div class="poster-preview__actions">
              <button class="poster-preview__action poster-preview__action--copy" type="button" @click="copyLink()">
                {{ copied && copiedChannel === 'default' ? '已复制' : '复制链接' }}
              </button>
              <button class="poster-preview__action" type="button" @click="openInNewTab">新窗口</button>
              <button
                class="poster-preview__action poster-preview__action--share"
                type="button"
                :disabled="sharing"
                @click="shareLink"
              >{{ sharing ? '分享中' : '分享' }}</button>
            </div>
            <div class="poster-preview__channels">
              <button
                class="poster-preview__channel"
                :class="{ 'poster-preview__channel--active': copiedChannel === 'wechat' }"
                type="button"
                @click="copyLink('wechat')"
              >{{ copiedChannel === 'wechat' ? '已复制' : '微信' }}</button>
              <button
                class="poster-preview__channel"
                :class="{ 'poster-preview__channel--active': copiedChannel === 'moments' }"
                type="button"
                @click="copyLink('moments')"
              >{{ copiedChannel === 'moments' ? '已复制' : '朋友圈' }}</button>
              <button
                class="poster-preview__channel"
                :class="{ 'poster-preview__channel--active': copiedChannel === 'qq' }"
                type="button"
                @click="copyLink('qq')"
              >{{ copiedChannel === 'qq' ? '已复制' : 'QQ' }}</button>
              <button
                class="poster-preview__channel"
                :class="{ 'poster-preview__channel--active': copiedChannel === 'qrcode' }"
                type="button"
                @click="copyLink('qrcode')"
              >{{ copiedChannel === 'qrcode' ? '已复制' : '二维码' }}</button>
            </div>
          </footer>
        </template>
      </div>
    </div>
  </transition>
</template>

<style scoped>
/* 全部固定色值 */
.poster-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 210;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: stretch;
  justify-content: center;
}

.poster-preview {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  height: 100vh;
  height: 100dvh;
  background: #ffffff;
  overflow: hidden;
}

/* Header */
.poster-preview__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
}

.poster-preview__close {
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

.poster-preview__title {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
}

.poster-preview__regen {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #ffffff;
  color: #6366f1;
  font-size: 12px;
  padding: 6px 10px;
  cursor: pointer;
}

/* 居中状态（加载/错误/空） */
.poster-preview__center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 50px 24px;
  color: #475569;
  text-align: center;
}

.poster-preview__center--error strong {
  font-size: 15px;
  color: #dc2626;
}

.poster-preview__center--error p {
  font-size: 13px;
  color: #64748b;
}

.poster-preview__spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e2e8f0;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.poster-preview__center p {
  font-size: 14px;
  color: #0f172a;
  font-weight: 500;
}

.poster-preview__center small {
  font-size: 12px;
  color: #94a3b8;
}

.poster-preview__retry {
  margin-top: 8px;
  padding: 8px 20px;
  border: none;
  border-radius: 10px;
  background: #6366f1;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

/* Tab 导航 */
.poster-preview__tabs {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.poster-preview__tab {
  flex: 1;
  padding: 10px 4px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.poster-preview__tab--active {
  color: #6366f1;
  border-bottom-color: #6366f1;
}

/* 主内容区 — flex:1 占满剩余空间 */
.poster-preview__main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 预览 Tab */
.poster-preview__preview-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.poster-preview__iframe-wrap {
  flex: 1;
  min-height: 0;
  background: #0b1020;
  overflow: hidden;
}

.poster-preview__iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

/* 数据 Tab */
.poster-preview__stats-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 历史 Tab */
.poster-preview__history-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 底部操作栏 */
.poster-preview__footer {
  flex-shrink: 0;
  border-top: 1px solid #e2e8f0;
  padding: 10px 16px;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  background: #ffffff;
}

.poster-preview__actions {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.poster-preview__action {
  flex: 1;
  padding: 10px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  min-height: 40px;
  transition: all 0.2s;
}

.poster-preview__action--copy {
  color: #6366f1;
  border-color: #c7d2fe;
}

.poster-preview__action--share {
  background: linear-gradient(135deg, #6366f1, #a855f7);
  color: #fff;
  border: none;
}

.poster-preview__action:disabled {
  opacity: 0.6;
}

/* 渠道快捷按钮 */
.poster-preview__channels {
  display: flex;
  gap: 6px;
}

.poster-preview__channel {
  flex: 1;
  padding: 7px 4px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
  color: #475569;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  min-height: 32px;
}

.poster-preview__channel:active {
  transform: scale(0.96);
}

.poster-preview__channel--active {
  background: #6366f1;
  color: #fff;
  border-color: #6366f1;
}

.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.25s;
}
.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}
</style>
