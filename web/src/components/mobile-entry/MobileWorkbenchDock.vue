<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Bell, House, Reading, ShoppingCart, User, CollectionTag, ChatDotRound, Close, UploadFilled } from '@element-plus/icons-vue';
import { useAuthStore } from '../../stores/auth';
import { http } from '../../api/http';
import MobileMessageCenter from './MobileMessageCenter.vue';

type DockItem = {
  id: string;
  label: string;
  route: string;
  icon: unknown;
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const items = computed<DockItem[]>(() => (
  authStore.isCreator
    ? [
        { id: 'home', label: '工作台', route: '/m/app', icon: House },
        { id: 'novels', label: '作品', route: '/m/novels', icon: Reading },
        { id: 'bookstore', label: '书城', route: '/m', icon: ShoppingCart },
        { id: 'publish', label: '发布', route: '/m/my-published', icon: UploadFilled },
        { id: 'me', label: '我的', route: '/m/me', icon: User },
      ]
    : [
        { id: 'bookstore', label: '书城', route: '/m', icon: ShoppingCart },
        { id: 'favorites', label: '收藏', route: '/m/favorites', icon: CollectionTag },
        { id: 'comments', label: '评论', route: '/m/comments', icon: ChatDotRound },
        { id: 'me', label: '我的', route: '/m/me', icon: User },
      ]
));

const currentPath = computed(() => route.path);
const visible = computed(() => !authStore.authEnabled || authStore.isAuthenticated);

function isActive(target: string): boolean {
  if (target === '/m/novels') {
    return currentPath.value === target || currentPath.value.startsWith('/m/novel/');
  }
  if (target === '/m') {
    return currentPath.value === '/m' || currentPath.value.startsWith('/m/bookstore/');
  }
  return currentPath.value === target;
}

// 通知未读数 + 通知中心弹层
const unreadCount = ref(0);
const showNotificationCenter = ref(false);
let unreadTimer: ReturnType<typeof setInterval> | null = null;

async function fetchUnread() {
  if (!visible.value) {
    unreadCount.value = 0;
    return;
  }

  try {
    const { data } = await http.get('/unified-messages/unread-count');
    unreadCount.value = (data.count as number) ?? 0;
  } catch { /* 静默 */ }
}

function startUnreadPolling() {
  if (unreadTimer) return;
  void fetchUnread();
  unreadTimer = setInterval(fetchUnread, 60_000);
}

function stopUnreadPolling() {
  if (unreadTimer) {
    clearInterval(unreadTimer);
    unreadTimer = null;
  }
  unreadCount.value = 0;
}

function onNotificationsChanged(newCount: number) {
  unreadCount.value = newCount;
}

function navigate(target: string) {
  if (currentPath.value === target) return;
  void router.push(target);
}

watch(
  visible,
  (canFetch) => {
    if (canFetch) {
      startUnreadPolling();
    } else {
      stopUnreadPolling();
    }
  },
  { immediate: true },
);

function handleVisibilityChange() {
  if (document.hidden) {
    if (unreadTimer) {
      clearInterval(unreadTimer);
      unreadTimer = null;
    }
  } else if (visible.value && !unreadTimer) {
    void fetchUnread();
    unreadTimer = setInterval(fetchUnread, 60_000);
  }
}

onMounted(() => {
  if (visible.value) startUnreadPolling();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});
onUnmounted(() => {
  stopUnreadPolling();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});

</script>

<template>
  <nav
    v-if="visible"
    class="mobile-workbench-dock"
    :class="{ 'mobile-workbench-dock--wide': items.length > 4 }"
    aria-label="底部导航"
  >
    <button
      v-for="item in items"
      :key="item.id"
      class="mobile-workbench-dock__item"
      :class="{ active: isActive(item.route) }"
      type="button"
      @click="navigate(item.route)"
    >
      <el-icon :size="18">
        <component :is="item.icon" />
      </el-icon>
      <span>{{ item.label }}</span>
    </button>
  </nav>

  <!-- 浮动消息按钮 -->
  <button
    v-if="visible"
    class="mobile-msg-fab"
    type="button"
    aria-label="消息助手"
    @click="showNotificationCenter = true"
  >
    <el-icon class="mobile-msg-fab__icon" :size="24"><Bell /></el-icon>
    <span v-if="unreadCount > 0" class="mobile-msg-fab__badge">
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </span>
  </button>

  <!-- 通知中心弹层 -->
  <Teleport to="body">
    <transition name="notif-center-fade">
      <div v-if="showNotificationCenter" class="mobile-workbench-notif-overlay">
        <button class="mobile-workbench-notif-backdrop" type="button" @click="showNotificationCenter = false" />
        <div class="mobile-workbench-notif-sheet">
          <MobileMessageCenter @unread-changed="onNotificationsChanged" @close="showNotificationCenter = false" />
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.mobile-workbench-dock {
  position: fixed;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
  z-index: 24;
  transform: translateX(-50%) translateZ(0);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  width: min(calc(100% - 22px), 392px);
  padding: 7px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--nw-text-primary) 14%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-bg-secondary) 94%, transparent);
  backdrop-filter: blur(16px) saturate(140%);
  box-shadow: 0 16px 34px color-mix(in srgb, var(--nw-text-primary) 10%, transparent);
  will-change: transform;
  color: var(--nw-text-muted);
}

.mobile-workbench-dock--wide {
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  width: min(calc(100% - 18px), 440px);
  padding: 6px;
}

.mobile-workbench-dock__item {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 4px;
  min-height: 50px;
  padding: 7px 6px;
  border: none;
  border-radius: 16px;
  background: transparent;
  color: var(--nw-text-muted);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
  transform: translateZ(0);
  transition:
    background-color 160ms ease,
    color 160ms ease,
    filter 160ms ease;
}

.mobile-workbench-dock--wide .mobile-workbench-dock__item {
  min-height: 48px;
  padding: 7px 4px;
  font-size: 10.5px;
}

.mobile-workbench-dock__item.active {
  background: color-mix(in srgb, var(--mobile-focus-accent, var(--star-brand-sky)) 14%, transparent);
  color: var(--nw-text-primary);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--nw-bg-secondary) 38%, transparent),
    0 4px 10px color-mix(in srgb, var(--mobile-focus-accent, var(--star-brand-sky)) 8%, transparent);
}

.mobile-workbench-dock__badge {
  position: absolute;
  top: 1px;
  right: 50%;
  transform: translateX(22px);
  background: var(--role-antagonist-base, #ef4444);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  border-radius: 8px;
  text-align: center;
  padding: 0 4px;
  pointer-events: none;
}

/* 浮动消息按钮 */
.mobile-msg-fab {
  position: fixed;
  right: 16px;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 84px);
  z-index: 23;
  width: 52px;
  height: 52px;
  border: none;
  border-radius: 50%;
  background: var(--star-brand-teal, #0f766e);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--star-brand-teal, #0f766e) 30%, transparent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s, box-shadow 0.15s;
}

.mobile-msg-fab:active {
  filter: brightness(1.08);
  box-shadow: 0 3px 12px color-mix(in srgb, var(--star-brand-teal, #0f766e) 28%, transparent);
}

.mobile-msg-fab__icon {
  display: inline-flex;
  color: #fff;
}

.mobile-msg-fab__badge {
  position: absolute;
  top: -2px;
  right: -2px;
  background: var(--role-antagonist-base, #ef4444);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  min-width: 20px;
  height: 20px;
  line-height: 20px;
  border-radius: 10px;
  text-align: center;
  padding: 0 5px;
  border: 2px solid var(--nw-bg-primary, #fff);
  pointer-events: none;
}
</style>

<style>
/* 通知中心弹层（Teleport 到 body，不能 scoped） */
.mobile-workbench-notif-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  width: 100vw;
  overflow: hidden;
}
.mobile-workbench-notif-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
}
.mobile-workbench-notif-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 56px;
  width: 100vw;
  box-sizing: border-box;
  border-radius: 22px 22px 0 0;
  background: var(--nw-bg-secondary, #f6f7fb);
  overflow: hidden;
}
.mobile-workbench-notif-close {
  position: absolute;
  top: 12px;
  right: 14px;
  z-index: 3;
  width: 36px;
  height: 36px;
  margin: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  background: color-mix(in srgb, var(--nw-text-primary) 6%, transparent);
  color: var(--nw-text-secondary, #334155);
  cursor: pointer;
}
.notif-center-fade-enter-active,
.notif-center-fade-leave-active {
  transition: opacity 0.25s;
}
.notif-center-fade-enter-active .mobile-workbench-notif-sheet,
.notif-center-fade-leave-active .mobile-workbench-notif-sheet {
  transition: transform 0.25s;
}
.notif-center-fade-enter-from,
.notif-center-fade-leave-to {
  opacity: 0;
}
.notif-center-fade-enter-from .mobile-workbench-notif-sheet,
.notif-center-fade-leave-to .mobile-workbench-notif-sheet {
  transform: translateY(40%);
}
</style>
