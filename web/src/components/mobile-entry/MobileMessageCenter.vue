<script setup lang="ts">
/**
 * 统一消息中心 — 气泡式消息列表（沿袭 MobileMessageAssistant 设计风格）
 * 
 * 四种消息类型汇聚：角色来信、角色搭话、番外推荐、追更提醒
 * 旧通知数据也以 "STAR 消息助手" 会话展示。
 */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Bell, Check, ChatDotRound, CollectionTag, DocumentChecked, Star, Timer, Delete, Close } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { Component } from 'vue';
import {
  fetchConversations,
  fetchConversationMessages,
  markRead,
  markConversationRead,
  markAllRead,
  deleteMessage,
  batchDeleteMessages,
  type ConversationSummary,
  type UnifiedMessage,
  type UnifiedMessageType,
} from '../../api/unified-messages';
import { extractApiErrorMessage } from '../../utils/api-error';

const router = useRouter();

const emit = defineEmits<{
  'unread-changed': [count: number];
  close: [];
}>();

// ===== 状态 =====

type ViewMode = 'conversations' | 'detail';

type FilterType = 'all' | UnifiedMessageType;

const mode = ref<ViewMode>('conversations');
const conversations = ref<ConversationSummary[]>([]);
const detailMessages = ref<UnifiedMessage[]>([]);
const detailConversation = ref<ConversationSummary | null>(null);
const loading = ref(false);
const totalUnread = ref(0);
const scrollBody = ref<HTMLElement | null>(null);
const activeFilter = ref<FilterType>('all');

// 管理模式
const manageMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());
const deleting = ref(false);

// ===== 类型配置（沿用旧设计） =====

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

function getTypeConfig(type: string): MessageTypeConfig {
  return typeConfig[type] || typeConfig.system;
}

function getTypeColorVar(type: string): string {
  return `var(${getTypeConfig(type).cssVar})`;
}

// ===== 筛选 tab =====

const filterTabs: Array<{ key: FilterType; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'character_letter', label: '角色来信' },
  { key: 'character_outreach', label: '角色搭话' },
  { key: 'update_reminder', label: '追更提醒' },
  { key: 'side_story_recommend', label: '番外推荐' },
  { key: 'comic_published', label: '漫画发布' },
  { key: 'system', label: '系统通知' },
];

const filteredConversations = computed(() => {
  if (activeFilter.value === 'all') return conversations.value;
  return conversations.value.filter((c) => c.lastMessage.type === activeFilter.value);
});

const filteredUnread = computed(() => {
  if (activeFilter.value === 'all') return totalUnread.value;
  return conversations.value
    .filter((c) => c.lastMessage.type === activeFilter.value)
    .reduce((sum, c) => sum + c.unreadCount, 0);
});

// ===== 时间格式化 =====

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400_000);
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${formatDateLabel(iso)} ${h}:${m}`;
}

// ===== 数据加载 =====

async function loadConversations() {
  loading.value = true;
  try {
    const data = await fetchConversations();
    conversations.value = data.conversations;
    totalUnread.value = data.totalUnread;
    emit('unread-changed', totalUnread.value);
  } catch (err) {
    if (conversations.value.length === 0) {
      ElMessage.error(extractApiErrorMessage(err, '消息加载失败，请稍后重试'));
    }
  } finally {
    loading.value = false;
  }
}

function getAvatarChar(conv: ConversationSummary): string {
  return conv.conversationName.charAt(0);
}

function getAvatarBg(conv: ConversationSummary): string {
  const seed = conv.conversationId.split('_').pop() || 'a';
  const hash = seed.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const hues = ['#2563eb', '#0891b2', '#b45309', '#7c3aed', '#be123c', '#0f766e', '#d97706'];
  return hues[hash % hues.length];
}

async function openConversation(conv: ConversationSummary) {
  if (conv.unreadCount > 0) {
    try {
      await markConversationRead(conv.conversationId);
      conv.unreadCount = 0;
      totalUnread.value = conversations.value.reduce((s, c) => s + c.unreadCount, 0);
      emit('unread-changed', totalUnread.value);
    } catch { /* 静默 */ }
  }

  try {
    const data = await fetchConversationMessages(conv.conversationId);
    detailMessages.value = [...data.messages].reverse();
    detailConversation.value = conv;
    mode.value = 'detail';
    await nextTick();
    scrollToBottom();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '消息详情加载失败'));
  }
}

function scrollToBottom() {
  if (scrollBody.value) {
    scrollBody.value.scrollTop = scrollBody.value.scrollHeight;
  }
}

async function handleConversationTap(conv: ConversationSummary) {
  if (conv.unreadCount > 0) {
    try {
      await markConversationRead(conv.conversationId);
      conv.unreadCount = 0;
      totalUnread.value = conversations.value.reduce((s, c) => s + c.unreadCount, 0);
      emit('unread-changed', totalUnread.value);
    } catch { /* 静默 */ }
  }

  const lastMsg = conv.lastMessage;
  if (lastMsg.data?.route) {
    emit('close');
    setTimeout(() => {
      router.push(lastMsg.data.route);
    }, 150);
    return;
  }

  await openConversation(conv);
}

async function handleDetailMessage(msg: UnifiedMessage) {
  if (msg.data?.route) {
    emit('close');
    setTimeout(() => {
      router.push(msg.data.route);
    }, 150);
  }
}

function goBack() {
  mode.value = 'conversations';
  detailMessages.value = [];
  detailConversation.value = null;
}

async function handleMarkAllRead() {
  try {
    await markAllRead();
    conversations.value.forEach((c) => (c.unreadCount = 0));
    totalUnread.value = 0;
    emit('unread-changed', 0);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '全部已读操作失败'));
  }
}

// ===== 管理模式 =====

const allDetailIds = computed(() => detailMessages.value.map((m) => m.id));
const selectedCount = computed(() => selectedIds.value.size);
const allSelected = computed(() => allDetailIds.value.length > 0 && allDetailIds.value.every((id) => selectedIds.value.has(id)));

function toggleManageMode() {
  manageMode.value = !manageMode.value;
  if (!manageMode.value) {
    selectedIds.value = new Set();
  }
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(allDetailIds.value);
  }
}

async function handleDeleteSingle(msgId: string) {
  try {
    await deleteMessage(msgId);
    detailMessages.value = detailMessages.value.filter((m) => m.id !== msgId);
    selectedIds.value = new Set([...selectedIds.value].filter((id) => id !== msgId));
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  }
}

async function handleBatchDelete() {
  if (selectedCount.value === 0) return;
  deleting.value = true;
  try {
    const ids = [...selectedIds.value];
    await batchDeleteMessages(ids);
    detailMessages.value = detailMessages.value.filter((m) => !selectedIds.value.has(m.id));
    selectedIds.value = new Set();
    manageMode.value = false;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '批量删除失败'));
  }
  finally {
    deleting.value = false;
  }
}

function exitManageAndGoBack() {
  manageMode.value = false;
  selectedIds.value = new Set();
  goBack();
}

// ===== 轮询 =====

let pollTimer: ReturnType<typeof setInterval> | null = null;

function handleVisibilityChange() {
  if (document.hidden) {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  } else {
    if (!pollTimer) {
      void loadConversations();
      pollTimer = setInterval(loadConversations, 30_000);
    }
  }
}

onMounted(() => {
  loadConversations();
  pollTimer = setInterval(loadConversations, 30_000);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<template>
  <div class="msg-center">
    <!-- 顶部：消息中心信息 + 操作（沿用旧设计风格） -->
    <div class="msg-center__header">
      <div v-if="mode === 'detail'" class="msg-center__header-left">
        <button class="msg-center__back-btn" @click="manageMode ? exitManageAndGoBack() : goBack()">←</button>
        <div class="msg-center__bot-info">
          <div class="msg-center__avatar" :style="{ backgroundColor: detailConversation ? getAvatarBg(detailConversation) : '#475569' }">
            <span class="msg-center__avatar-text">{{ detailConversation ? getAvatarChar(detailConversation) : '?' }}</span>
          </div>
          <div class="msg-center__bot-meta">
            <h3 class="msg-center__bot-name">
              {{ manageMode ? `已选 ${selectedCount} 条` : (detailConversation?.conversationName) }}
            </h3>
          </div>
        </div>
      </div>
      <div v-else class="msg-center__bot-info">
        <div class="msg-center__avatar">
          <el-icon class="msg-center__avatar-icon" :size="22"><Bell /></el-icon>
        </div>
        <div class="msg-center__bot-meta">
          <h3 class="msg-center__bot-name">消息中心</h3>
          <span class="msg-center__bot-status">
            {{ totalUnread > 0 ? `${totalUnread} 条未读消息` : '所有消息已读' }}
          </span>
        </div>
      </div>
      <div class="msg-center__actions">
        <template v-if="mode === 'detail' && !manageMode">
          <button class="msg-center__read-all" @click="toggleManageMode">
            管理
          </button>
        </template>
        <template v-else-if="mode === 'detail' && manageMode">
          <button class="msg-center__read-all" @click="toggleSelectAll">
            {{ allSelected ? '取消全选' : '全选' }}
          </button>
        </template>
        <button
          v-if="mode === 'conversations' && totalUnread > 0"
          class="msg-center__read-all"
          @click="handleMarkAllRead"
        >
          <el-icon><Check /></el-icon>
          已读
        </button>
        <button class="msg-center__close-btn" @click="emit('close')">✕</button>
      </div>
    </div>

    <!-- 类型筛选 tab（会话列表模式） -->
    <div v-if="mode === 'conversations'" class="msg-center__tabs">
      <div class="msg-center__tabs-scroll">
        <button
          v-for="tab in filterTabs"
          :key="tab.key"
          class="msg-center__tab"
          :class="{ 'msg-center__tab--active': activeFilter === tab.key }"
          @click="activeFilter = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- 会话列表 -->
    <div v-if="mode === 'conversations'" ref="scrollBody" class="msg-center__body">
      <!-- 加载中 -->
      <div v-if="loading && conversations.length === 0" class="msg-center__loading">
        <div class="msg-center__loading-dots">
          <span></span><span></span><span></span>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="filteredConversations.length === 0" class="msg-center__welcome">
        <div class="msg-center__welcome-bubble">
          <p class="msg-center__welcome-text">暂无消息</p>
          <p class="msg-center__welcome-subtext">
            给角色写信、追更的书更新后，消息会出现在这里。
          </p>
        </div>
      </div>

      <!-- 会话列表（气泡式） -->
      <template v-else>
        <template v-for="conv in filteredConversations" :key="conv.conversationId">
          <div
            class="msg-center__msg"
            :class="{ 'msg-center__msg--unread': conv.unreadCount > 0 }"
            :style="{ '--mc-type-color': getTypeColorVar(conv.lastMessage.type) }"
            @click="handleConversationTap(conv)"
          >
            <div
              class="msg-center__msg-avatar"
              :style="{ color: getTypeColorVar(conv.lastMessage.type) }"
            >
              <el-icon :size="18">
                <component :is="getTypeConfig(conv.lastMessage.type).icon" />
              </el-icon>
            </div>
            <div class="msg-center__bubble">
              <div class="msg-center__bubble-header">
                <span class="msg-center__bubble-type" :style="{ color: getTypeColorVar(conv.lastMessage.type) }">
                  {{ getTypeConfig(conv.lastMessage.type).label }}
                </span>
                <span class="msg-center__bubble-time">{{ formatTime(conv.lastMessage.createdAt) }}</span>
              </div>
              <p class="msg-center__bubble-name">{{ conv.conversationName }}</p>
              <p class="msg-center__bubble-preview">{{ conv.lastMessage.title }}</p>
              <div class="msg-center__bubble-action">
                <span class="msg-center__action-text">
                  {{ getTypeConfig(conv.lastMessage.type).action }} →
                </span>
              </div>
              <span v-if="conv.unreadCount > 0" class="msg-center__badge">
                {{ conv.unreadCount > 99 ? '99+' : conv.unreadCount }}
              </span>
            </div>
          </div>
        </template>
      </template>
    </div>

    <!-- 会话详情 -->
    <div v-else ref="scrollBody" class="msg-center__body">
      <template v-for="msg in detailMessages" :key="msg.id">
        <div
          class="msg-center__msg"
          :class="{
            'msg-center__msg--unread': !msg.read,
            'msg-center__msg--manage': manageMode,
            'msg-center__msg--selected': manageMode && selectedIds.has(msg.id),
          }"
          :style="{ '--mc-type-color': getTypeColorVar(msg.type) }"
          @click="manageMode ? toggleSelect(msg.id) : handleDetailMessage(msg)"
        >
          <!-- 管理模式：复选框 -->
          <div v-if="manageMode" class="msg-center__check">
            <span v-if="selectedIds.has(msg.id)" class="msg-center__check--on">
              <el-icon :size="14"><Check /></el-icon>
            </span>
            <span v-else class="msg-center__check--off" />
          </div>
          <div v-else class="msg-center__msg-avatar" :style="{ color: getTypeColorVar(msg.type) }">
            <el-icon :size="18">
              <component :is="getTypeConfig(msg.type).icon" />
            </el-icon>
          </div>
          <div class="msg-center__bubble">
            <div class="msg-center__bubble-header">
              <span class="msg-center__bubble-type" :style="{ color: getTypeColorVar(msg.type) }">
                {{ getTypeConfig(msg.type).label }}
              </span>
              <span class="msg-center__bubble-time">{{ formatTime(msg.createdAt) }}</span>
            </div>
            <p class="msg-center__bubble-title">{{ msg.title }}</p>
            <p class="msg-center__bubble-body">{{ msg.body }}</p>
            <span v-if="!msg.read" class="msg-center__unread-dot" />
            <!-- 单条删除按钮（非管理模式） -->
            <button
              v-if="!manageMode"
              class="msg-center__delete-btn"
              @click.stop="handleDeleteSingle(msg.id)"
              title="删除"
            >
              <el-icon :size="14"><Close /></el-icon>
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- 底部提示 / 批量删除栏 -->
    <div v-if="manageMode && mode === 'detail'" class="msg-center__manage-bar">
      <button class="msg-center__manage-bar__cancel" @click="toggleManageMode">取消</button>
      <span class="msg-center__manage-bar__info">已选 {{ selectedCount }} 条</span>
      <button
        class="msg-center__manage-bar__delete"
        :disabled="selectedCount === 0 || deleting"
        @click="handleBatchDelete"
      >
        {{ deleting ? '删除中...' : `删除(${selectedCount})` }}
      </button>
    </div>
    <div v-else-if="filteredConversations.length > 0 && mode === 'conversations'" class="msg-center__footer">
      <span class="msg-center__footer-hint">点击会话查看消息详情</span>
    </div>
  </div>
</template>

<style scoped>
.msg-center {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--mobile-focus-surface);
}

/* 顶部（沿用旧设计） */
.msg-center__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 14px 12px;
  background: #fff;
  border-bottom: 1px solid #f1f5f9;
}

/* 类型筛选 tab */
.msg-center__tabs {
  flex-shrink: 0;
  background: var(--nw-bg-card, #fff);
  border-bottom: 1px solid var(--nw-border, #f1f5f9);
}

.msg-center__tabs-scroll {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.msg-center__tabs-scroll::-webkit-scrollbar {
  display: none;
}

.msg-center__tab {
  flex-shrink: 0;
  padding: 6px 14px;
  border: none;
  border-radius: 16px;
  background: var(--nw-bg-secondary, #f1f5f9);
  color: var(--nw-text-secondary, #64748b);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.msg-center__tab--active {
  background: var(--star-brand-teal, #0f766e);
  color: #fff;
}

.msg-center__header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.msg-center__back-btn {
  background: none;
  border: none;
  font-size: 18px;
  color: #0f766e;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  flex-shrink: 0;
}

.msg-center__bot-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.msg-center__avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid rgba(15, 118, 110, 0.14);
  background: #e8f4f2;
  color: #0f766e;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
  font-weight: 700;
}

.msg-center__avatar-icon {
  color: currentColor;
}

.msg-center__avatar-text {
  color: #fff;
}

.msg-center__bot-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.msg-center__bot-name {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #1a1a1a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg-center__bot-status {
  font-size: 12px;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg-center__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.msg-center__read-all {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid rgba(15, 118, 110, 0.24);
  border-radius: 8px;
  background: rgba(15, 118, 110, 0.08);
  color: #0f766e;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.msg-center__close-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.06);
  color: #334155;
  font-size: 16px;
  cursor: pointer;
}

/* 聊天区域 */
.msg-center__body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  -webkit-overflow-scrolling: touch;
}

/* 加载中 */
.msg-center__loading {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
}

.msg-center__loading-dots {
  display: flex;
  gap: 6px;
}

.msg-center__loading-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9ca3af;
  animation: msg-center-bounce 1.4s infinite ease-in-out both;
}

.msg-center__loading-dots span:nth-child(1) { animation-delay: -0.32s; }
.msg-center__loading-dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes msg-center-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* 欢迎/空状态 */
.msg-center__welcome {
  display: flex;
  justify-content: flex-start;
  margin-top: auto;
  margin-bottom: auto;
}

.msg-center__welcome-bubble {
  max-width: 80%;
  padding: 16px;
  background: #fff;
  border: none;
  border-left: 3px solid color-mix(in srgb, #0f766e 50%, transparent);
  border-radius: 14px;
  box-shadow: none;
}

.msg-center__welcome-text {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
}

.msg-center__welcome-subtext {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #6b7280;
}

/* 消息项 */
.msg-center__msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 0;
  cursor: pointer;
}

.msg-center__msg-avatar {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: none;
}

/* 卡片（对齐移动端内容卡：扁平 + 左侧类型色边，无阴影） */
.msg-center__bubble {
  position: relative;
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  background: #fff;
  border: none;
  border-left: 3px solid var(--mc-type-color, #cbd5e1);
  border-radius: 14px;
  box-shadow: none;
  transition: background-color 0.15s, transform 0.12s;
}

.msg-center__msg:active .msg-center__bubble {
  transform: scale(0.985);
}

.msg-center__msg--unread .msg-center__bubble {
  background: color-mix(in srgb, var(--mc-type-color, #0f766e) 6%, #ffffff);
}

.msg-center__bubble-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.msg-center__bubble-type {
  font-size: 11px;
  font-weight: 700;
}

.msg-center__bubble-time {
  font-size: 11px;
  color: #9ca3af;
}

.msg-center__bubble-name {
  margin: 0 0 4px;
  font-size: 12px;
  color: #6b7280;
}

.msg-center__bubble-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.4;
}

.msg-center__bubble-preview {
  margin: 0 0 8px;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.5;
}

.msg-center__bubble-body {
  margin: 0 0 8px;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 240px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.msg-center__bubble-action {
  display: flex;
  justify-content: flex-end;
}

.msg-center__action-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--mc-type-color, #0f766e);
}

.msg-center__badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  min-width: 20px;
  height: 20px;
  line-height: 20px;
  border-radius: 10px;
  text-align: center;
  padding: 0 6px;
  box-shadow: none;
}

.msg-center__unread-dot {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 0 2px #fff;
}

/* 底部 */
.msg-center__footer {
  flex-shrink: 0;
  padding: 8px 16px 12px;
  text-align: center;
  background: #f8fafc;
}

.msg-center__footer-hint {
  font-size: 11px;
  color: #9ca3af;
}

/* 管理模式 */
.msg-center__check {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 10px;
}

.msg-center__check--on {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #0f766e;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.msg-center__check--off {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid #d1d5db;
  background: #fff;
}

.msg-center__msg--selected .msg-center__bubble {
  background: color-mix(in srgb, var(--mc-type-color, #0f766e) 8%, #ffffff);
}

.msg-center__delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.msg-center__msg:hover .msg-center__delete-btn,
.msg-center__msg:active .msg-center__delete-btn {
  opacity: 1;
}

/* 批量删除栏 */
.msg-center__manage-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px 14px;
  background: #fff;
  border-top: 1px solid #f1f5f9;
}

.msg-center__manage-bar__cancel {
  background: none;
  border: none;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
}

.msg-center__manage-bar__info {
  font-size: 13px;
  color: #374151;
  font-weight: 600;
}

.msg-center__manage-bar__delete {
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: #ef4444;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.msg-center__manage-bar__delete:disabled {
  background: #fca5a5;
  cursor: not-allowed;
}
</style>

<style>
html.dark .msg-center {
  background: var(--nw-bg-secondary);
}

html.dark .msg-center__header {
  background: var(--nw-bg-card);
  border-bottom-color: var(--nw-border);
}

html.dark .msg-center__back-btn {
  color: var(--star-brand-teal, #14b8a6);
}

html.dark .msg-center__avatar {
  border-color: color-mix(in srgb, var(--star-brand-teal, #14b8a6) 24%, var(--nw-border));
  background: color-mix(in srgb, var(--star-brand-teal, #14b8a6) 14%, var(--nw-bg-secondary));
  color: var(--star-brand-teal, #5eead4);
}

html.dark .msg-center__bot-name {
  color: var(--nw-text-primary);
}

html.dark .msg-center__bot-status {
  color: var(--nw-text-secondary);
}

html.dark .msg-center__read-all {
  border-color: color-mix(in srgb, var(--star-brand-teal, #0f766e) 32%, var(--nw-border));
  background: color-mix(in srgb, var(--star-brand-teal, #0f766e) 14%, var(--nw-bg-secondary));
  color: var(--star-brand-teal, #5eead4);
}

html.dark .msg-center__close-btn {
  background: color-mix(in srgb, var(--nw-text-primary) 8%, var(--nw-bg-secondary));
  color: var(--nw-text-secondary);
}

html.dark .msg-center__loading-dots span {
  background: var(--nw-text-muted);
}

html.dark .msg-center__welcome-bubble {
  background: var(--nw-bg-card);
  border-left-color: color-mix(in srgb, var(--star-brand-teal, #0f766e) 50%, transparent);
}

html.dark .msg-center__welcome-text {
  color: var(--nw-text-primary);
}

html.dark .msg-center__welcome-subtext {
  color: var(--nw-text-secondary);
}

html.dark .msg-center__msg-avatar {
  border-color: var(--nw-border);
  background: var(--nw-bg-card);
}

html.dark .msg-center__bubble {
  background: var(--nw-bg-card);
  border-left-color: var(--mc-type-color, #64748b);
}

html.dark .msg-center__msg--unread .msg-center__bubble {
  background: color-mix(in srgb, var(--mc-type-color, #14b8a6) 8%, var(--nw-bg-card));
}

html.dark .msg-center__bubble-time {
  color: var(--nw-text-muted);
}

html.dark .msg-center__bubble-name {
  color: var(--nw-text-secondary);
}

html.dark .msg-center__bubble-title {
  color: var(--nw-text-primary);
}

html.dark .msg-center__bubble-preview,
html.dark .msg-center__bubble-body {
  color: var(--nw-text-secondary);
}

html.dark .msg-center__action-text {
  color: var(--mc-type-color, #5eead4);
}

html.dark .msg-center__unread-dot {
  box-shadow: 0 0 0 2px var(--nw-bg-card);
}

html.dark .msg-center__footer {
  background: var(--nw-bg-secondary);
}

html.dark .msg-center__footer-hint {
  color: var(--nw-text-muted);
}

html.dark .msg-center__check--on {
  background: var(--star-brand-teal, #14b8a6);
}

html.dark .msg-center__check--off {
  border-color: var(--nw-border);
  background: var(--nw-bg-secondary);
}

html.dark .msg-center__msg--selected .msg-center__bubble {
  background: color-mix(in srgb, var(--mc-type-color, #14b8a6) 10%, var(--nw-bg-card));
}

html.dark .msg-center__manage-bar {
  background: var(--nw-bg-card);
  border-top-color: var(--nw-border);
}

html.dark.warm-night .msg-center {
  --mc-type-color: #f59e0b;
}

html.dark.warm-night .msg-center__back-btn {
  color: var(--mobile-focus-accent, #f59e0b);
}

html.dark.warm-night .msg-center__avatar {
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(245, 158, 11, 0.14);
  color: #fde68a;
}

html.dark.warm-night .msg-center__read-all {
  border-color: rgba(245, 158, 11, 0.32);
  background: rgba(245, 158, 11, 0.14);
  color: #fde68a;
}

html.dark.warm-night .msg-center__action-text {
  color: #fde68a;
}

html.dark.warm-night .msg-center__check--on {
  background: #d97706;
}
</style>
