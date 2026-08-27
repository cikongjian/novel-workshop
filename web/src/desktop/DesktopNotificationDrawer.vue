<script setup lang="ts">
/**
 * 桌面端消息中心抽屉
 * 复用统一消息 API，提供会话列表 + 消息详情的两栏布局
 */
import { ref, computed, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Bell, Check, ChatDotRound, CollectionTag, DocumentChecked, Star, Close } from '@element-plus/icons-vue';
import type { Component } from 'vue';
import {
  fetchConversations,
  fetchConversationMessages,
  markConversationRead,
  markAllRead,
  type ConversationSummary,
  type UnifiedMessage,
  type UnifiedMessageType,
} from '../api/unified-messages';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'unread-changed': [count: number];
}>();

const router = useRouter();

// ===== 状态 =====
const conversations = ref<ConversationSummary[]>([]);
const detailMessages = ref<UnifiedMessage[]>([]);
const activeConversationId = ref<string | null>(null);
const loading = ref(false);
const loadingDetail = ref(false);
const totalUnread = ref(0);

type FilterType = 'all' | UnifiedMessageType;
const activeFilter = ref<FilterType>('all');

// ===== 类型配置 =====
type MessageTypeConfig = {
  icon: Component;
  label: string;
  action: string;
  cssVar: string;
};

const typeConfig: Record<UnifiedMessageType, MessageTypeConfig> = {
  character_letter: { icon: ChatDotRound, label: '角色来信', action: '查看回信', cssVar: '--msg-character-letter-base' },
  character_outreach: { icon: ChatDotRound, label: '角色搭话', action: '查看详情', cssVar: '--msg-character-outreach-base' },
  side_story_recommend: { icon: CollectionTag, label: '番外推荐', action: '阅读番外', cssVar: '--msg-side-story-recommend-base' },
  update_reminder: { icon: DocumentChecked, label: '追更提醒', action: '立即阅读', cssVar: '--msg-update-reminder-base' },
  comic_published: { icon: Star, label: '漫画发布', action: '看漫画', cssVar: '--msg-comic-published-base' },
  system: { icon: Bell, label: '系统', action: '查看详情', cssVar: '--msg-system-base' },
};

const filterTabs: Array<{ key: FilterType; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'character_letter', label: '角色来信' },
  { key: 'character_outreach', label: '角色搭话' },
  { key: 'update_reminder', label: '追更提醒' },
  { key: 'side_story_recommend', label: '番外推荐' },
  { key: 'comic_published', label: '漫画发布' },
  { key: 'system', label: '系统通知' },
];

function getTypeConfig(type: string): MessageTypeConfig {
  return typeConfig[type as UnifiedMessageType] || typeConfig.system;
}

function getTypeColorVar(type: string): string {
  return `var(${getTypeConfig(type).cssVar})`;
}

const filteredConversations = computed(() => {
  if (activeFilter.value === 'all') return conversations.value;
  return conversations.value.filter((c) => c.lastMessage.type === activeFilter.value);
});

const activeConversation = computed(() =>
  conversations.value.find((c) => c.conversationId === activeConversationId.value) || null
);

// ===== 时间格式化 =====
function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400_000);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  if (diffDays === 0) return `${h}:${m}`;
  if (diffDays === 1) return `昨天 ${h}:${m}`;
  if (diffDays < 7) return `${diffDays}天前`;
  return `${d.getMonth() + 1}/${d.getDate()} ${h}:${m}`;
}

// ===== 数据加载 =====
async function loadConversations() {
  loading.value = true;
  try {
    const data = await fetchConversations();
    conversations.value = data.conversations;
    totalUnread.value = data.totalUnread;
    emit('unread-changed', data.totalUnread);

    if (activeConversationId.value) {
      const stillExists = data.conversations.some((c) => c.conversationId === activeConversationId.value);
      if (!stillExists) {
        activeConversationId.value = data.conversations[0]?.conversationId ?? null;
        if (activeConversationId.value) {
          await loadDetail(activeConversationId.value);
        }
      }
    } else if (data.conversations.length > 0) {
      activeConversationId.value = data.conversations[0].conversationId;
      await loadDetail(activeConversationId.value);
    }
  } catch {
    // 静默
  } finally {
    loading.value = false;
  }
}

async function loadDetail(conversationId: string) {
  loadingDetail.value = true;
  try {
    const conv = conversations.value.find((c) => c.conversationId === conversationId);
    if (conv && conv.unreadCount > 0) {
      await markConversationRead(conversationId);
      conv.unreadCount = 0;
      totalUnread.value = conversations.value.reduce((s, c) => s + c.unreadCount, 0);
      emit('unread-changed', totalUnread.value);
    }

    const data = await fetchConversationMessages(conversationId);
    detailMessages.value = data.messages;
  } catch {
    // 静默
  } finally {
    loadingDetail.value = false;
  }
}

function selectConversation(conv: ConversationSummary) {
  activeConversationId.value = conv.conversationId;
  void loadDetail(conv.conversationId);
}

function handleMessageClick(msg: UnifiedMessage) {
  if (msg.data?.route) {
    emit('update:visible', false);
    setTimeout(() => {
      router.push(msg.data.route);
    }, 150);
  }
}

async function handleMarkAllRead() {
  try {
    await markAllRead();
    conversations.value.forEach((c) => (c.unreadCount = 0));
    totalUnread.value = 0;
    emit('unread-changed', 0);
  } catch { /* 静默 */ }
}

function close() {
  emit('update:visible', false);
}

// ===== 轮询 =====
let pollTimer: ReturnType<typeof setInterval> | null = null;

watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      void loadConversations();
      if (!pollTimer) {
        pollTimer = setInterval(loadConversations, 60_000);
      }
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="desktop-notif-drawer-fade">
      <div v-if="visible" class="desktop-notif-overlay">
        <div class="desktop-notif-backdrop" @click="close" />
        <div class="desktop-notif-drawer">
          <!-- 头部 -->
          <div class="desktop-notif-header">
            <div class="desktop-notif-header-title">
              <el-icon :size="20"><Bell /></el-icon>
              <span>消息中心</span>
              <span v-if="totalUnread > 0" class="desktop-notif-unread-badge">
                {{ totalUnread > 99 ? '99+' : totalUnread }}
              </span>
            </div>
            <div class="desktop-notif-header-actions">
              <button
                v-if="totalUnread > 0"
                class="desktop-notif-mark-all"
                @click="handleMarkAllRead"
              >
                <el-icon :size="14"><Check /></el-icon>
                全部已读
              </button>
              <button class="desktop-notif-close" @click="close" aria-label="关闭">
                <el-icon :size="18"><Close /></el-icon>
              </button>
            </div>
          </div>

          <!-- 筛选 tab -->
          <div class="desktop-notif-tabs">
            <button
              v-for="tab in filterTabs"
              :key="tab.key"
              class="desktop-notif-tab"
              :class="{ 'is-active': activeFilter === tab.key }"
              @click="activeFilter = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>

          <!-- 主体：两栏布局 -->
          <div class="desktop-notif-body">
            <!-- 会话列表 -->
            <div class="desktop-notif-conv-list">
              <div v-if="loading && conversations.length === 0" class="desktop-notif-loading">
                加载中...
              </div>
              <div v-else-if="filteredConversations.length === 0" class="desktop-notif-empty">
                <el-icon :size="32" class="desktop-notif-empty-icon"><Bell /></el-icon>
                <p>暂无消息</p>
                <span>给角色写信、追更的书更新后，消息会出现在这里。</span>
              </div>
              <template v-else>
                <div
                  v-for="conv in filteredConversations"
                  :key="conv.conversationId"
                  class="desktop-notif-conv-item"
                  :class="{
                    'is-active': activeConversationId === conv.conversationId,
                    'is-unread': conv.unreadCount > 0,
                  }"
                  @click="selectConversation(conv)"
                >
                  <div
                    class="desktop-notif-conv-avatar"
                    :style="{ color: getTypeColorVar(conv.lastMessage.type) }"
                  >
                    <el-icon :size="18">
                      <component :is="getTypeConfig(conv.lastMessage.type).icon" />
                    </el-icon>
                  </div>
                  <div class="desktop-notif-conv-content">
                    <div class="desktop-notif-conv-top">
                      <span class="desktop-notif-conv-name">{{ conv.conversationName }}</span>
                      <span class="desktop-notif-conv-time">{{ formatTime(conv.lastTime) }}</span>
                    </div>
                    <p class="desktop-notif-conv-preview">{{ conv.lastMessage.title }}</p>
                  </div>
                  <span v-if="conv.unreadCount > 0" class="desktop-notif-conv-badge">
                    {{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}
                  </span>
                </div>
              </template>
            </div>

            <!-- 消息详情 -->
            <div class="desktop-notif-detail">
              <div v-if="loadingDetail" class="desktop-notif-loading">
                加载中...
              </div>
              <div v-else-if="!activeConversation" class="desktop-notif-empty">
                <el-icon :size="32" class="desktop-notif-empty-icon"><Bell /></el-icon>
                <p>选择一个会话查看消息</p>
              </div>
              <template v-else>
                <div class="desktop-notif-detail-header">
                  <div class="desktop-notif-detail-title">
                    {{ activeConversation.conversationName }}
                  </div>
                  <span class="desktop-notif-detail-type" :style="{ color: getTypeColorVar(activeConversation.lastMessage.type) }">
                    {{ getTypeConfig(activeConversation.lastMessage.type).label }}
                  </span>
                </div>
                <div class="desktop-notif-detail-messages">
                  <div
                    v-for="msg in detailMessages"
                    :key="msg.id"
                    class="desktop-notif-msg"
                    :class="{ 'is-unread': !msg.read }"
                    :style="{ '--mc-type-color': getTypeColorVar(msg.type) }"
                    @click="handleMessageClick(msg)"
                  >
                    <div class="desktop-notif-msg-bubble">
                      <div class="desktop-notif-msg-header">
                        <span class="desktop-notif-msg-type" :style="{ color: getTypeColorVar(msg.type) }">
                          {{ getTypeConfig(msg.type).label }}
                        </span>
                        <span class="desktop-notif-msg-time">{{ formatTime(msg.createdAt) }}</span>
                      </div>
                      <p class="desktop-notif-msg-title">{{ msg.title }}</p>
                      <p class="desktop-notif-msg-body">{{ msg.body }}</p>
                      <span v-if="msg.data?.actionLabel" class="desktop-notif-msg-action">
                        {{ msg.data.actionLabel }} →
                      </span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.desktop-notif-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
}

.desktop-notif-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
}

.desktop-notif-drawer {
  position: absolute;
  top: 0;
  right: 0;
  width: 680px;
  height: 100vh;
  background: var(--nw-bg-primary, #fff);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
}

/* 头部 */
.desktop-notif-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--nw-border, #e5e7eb);
}

.desktop-notif-header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--nw-text-primary, #111827);
}

.desktop-notif-unread-badge {
  background: var(--role-antagonist-base, #ef4444);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  min-width: 20px;
  height: 20px;
  line-height: 20px;
  border-radius: 10px;
  text-align: center;
  padding: 0 6px;
}

.desktop-notif-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.desktop-notif-mark-all {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--star-brand-teal, #0f766e);
  border-radius: 8px;
  background: transparent;
  color: var(--star-brand-teal, #0f766e);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.desktop-notif-mark-all:hover {
  background: color-mix(in srgb, var(--star-brand-teal, #0f766e) 8%, transparent);
}

.desktop-notif-close {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: var(--nw-bg-secondary, #f3f4f6);
  color: var(--nw-text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.15s;
}

.desktop-notif-close:hover {
  background: var(--nw-border, #e5e7eb);
  color: var(--nw-text-primary, #111827);
}

/* 筛选 tab */
.desktop-notif-tabs {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--nw-border, #e5e7eb);
  overflow-x: auto;
}

.desktop-notif-tab {
  flex-shrink: 0;
  padding: 6px 14px;
  border: none;
  border-radius: 16px;
  background: var(--nw-bg-secondary, #f3f4f6);
  color: var(--nw-text-secondary, #6b7280);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.desktop-notif-tab:hover {
  background: var(--nw-border, #e5e7eb);
}

.desktop-notif-tab.is-active {
  background: var(--star-brand-teal, #0f766e);
  color: #fff;
}

/* 主体 */
.desktop-notif-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* 会话列表 */
.desktop-notif-conv-list {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid var(--nw-border, #e5e7eb);
  overflow-y: auto;
}

.desktop-notif-conv-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--nw-border, #e5e7eb);
  position: relative;
  transition: background-color 0.15s;
}

.desktop-notif-conv-item:hover {
  background: var(--nw-bg-secondary, #f9fafb);
}

.desktop-notif-conv-item.is-active {
  background: color-mix(in srgb, var(--star-brand-teal, #0f766e) 8%, transparent);
}

.desktop-notif-conv-item.is-unread {
  background: color-mix(in srgb, var(--star-brand-teal, #0f766e) 4%, transparent);
}

.desktop-notif-conv-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--nw-border, #e5e7eb);
  background: var(--nw-bg-card, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.desktop-notif-conv-content {
  flex: 1;
  min-width: 0;
}

.desktop-notif-conv-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.desktop-notif-conv-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-notif-conv-time {
  font-size: 11px;
  color: var(--nw-text-muted, #9ca3af);
  flex-shrink: 0;
}

.desktop-notif-conv-preview {
  margin: 0;
  font-size: 12px;
  color: var(--nw-text-secondary, #6b7280);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.desktop-notif-conv-badge {
  position: absolute;
  top: 12px;
  right: 16px;
  background: var(--role-antagonist-base, #ef4444);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  line-height: 18px;
  border-radius: 9px;
  text-align: center;
  padding: 0 5px;
}

/* 消息详情 */
.desktop-notif-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.desktop-notif-detail-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--nw-border, #e5e7eb);
}

.desktop-notif-detail-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--nw-text-primary, #111827);
}

.desktop-notif-detail-type {
  font-size: 11px;
  font-weight: 700;
}

.desktop-notif-detail-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.desktop-notif-msg {
  cursor: pointer;
}

.desktop-notif-msg-bubble {
  position: relative;
  padding: 14px 16px;
  background: var(--nw-bg-card, #fff);
  border: 1px solid var(--nw-border, #e5e7eb);
  border-left: 3px solid var(--mc-type-color, #cbd5e1);
  border-radius: 12px;
  transition: all 0.15s;
}

.desktop-notif-msg:hover .desktop-notif-msg-bubble {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  transform: translateY(-1px);
}

.desktop-notif-msg.is-unread .desktop-notif-msg-bubble {
  background: color-mix(in srgb, var(--mc-type-color, #0f766e) 5%, var(--nw-bg-card));
}

.desktop-notif-msg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.desktop-notif-msg-type {
  font-size: 11px;
  font-weight: 700;
}

.desktop-notif-msg-time {
  font-size: 11px;
  color: var(--nw-text-muted, #9ca3af);
}

.desktop-notif-msg-title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary, #111827);
  line-height: 1.4;
}

.desktop-notif-msg-body {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--nw-text-secondary, #6b7280);
  line-height: 1.6;
  white-space: pre-wrap;
}

.desktop-notif-msg-action {
  display: block;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: var(--mc-type-color, #0f766e);
}

/* 加载和空状态 */
.desktop-notif-loading,
.desktop-notif-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--nw-text-muted, #9ca3af);
  font-size: 13px;
}

.desktop-notif-empty-icon {
  margin-bottom: 12px;
  color: var(--nw-border, #d1d5db);
}

.desktop-notif-empty p {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-secondary, #6b7280);
}

.desktop-notif-empty span {
  font-size: 12px;
  color: var(--nw-text-muted, #9ca3af);
  line-height: 1.6;
  max-width: 240px;
}

/* 动画 */
.desktop-notif-drawer-fade-enter-active,
.desktop-notif-drawer-fade-leave-active {
  transition: opacity 0.25s;
}

.desktop-notif-drawer-fade-enter-active .desktop-notif-drawer,
.desktop-notif-drawer-fade-leave-active .desktop-notif-drawer {
  transition: transform 0.25s ease;
}

.desktop-notif-drawer-fade-enter-from,
.desktop-notif-drawer-fade-leave-to {
  opacity: 0;
}

.desktop-notif-drawer-fade-enter-from .desktop-notif-drawer,
.desktop-notif-drawer-fade-leave-to .desktop-notif-drawer {
  transform: translateX(100%);
}
</style>
