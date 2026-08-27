<script setup lang="ts">
/**
 * 桌面端外壳（设备特定层）
 * 侧栏导航 + 顶栏（搜索）。主内容区由子路由 /desktop/* 渲染。
 * 内容组件一律走共享层（components/shared）+ 共享内核。
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import './desktop.css';
import './desktop-polish.css';
import './desktop-content-polish.css';
import './desktop-feature-polish.css';
import './desktop-reader-polish.css';
import BrandEmblem from '../components/brand/BrandEmblem.vue';
import Icon from '../components/shared/Icon.vue';
import { useDesktopSearch } from '../composables/useDesktopSearch';
import { useTheme } from '../composables/useTheme';
import { useDesktopCreate } from '../composables/useDesktopCreate';
import { useAuthStore } from '../stores/auth';
import { ElMessageBox } from 'element-plus';
import DesktopCreateNovelDialog from './DesktopCreateNovelDialog.vue';
import DesktopDnaDialog from './DesktopDnaDialog.vue';
import DesktopCangjieDialog from './DesktopCangjieDialog.vue';
import DesktopNotificationDrawer from './DesktopNotificationDrawer.vue';
import { fetchUnreadCount } from '../api/unified-messages';
import { brand } from '../config/brand';

const route = useRoute();
const router = useRouter();
const { query } = useDesktopSearch();
const { isDark, toggleTheme } = useTheme();
const { createDialogVisible, openCreate, dnaDialogVisible, cangjieDialogVisible } = useDesktopCreate();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.isAdmin);

type DesktopNavItem = {
  label: string;
  to: string;
  icon: string;
};

type DesktopNavGroup = {
  id: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  items: DesktopNavItem[];
};

const NAV_GROUPS: DesktopNavGroup[] = [
  {
    id: 'workspace',
    label: '工作台',
    icon: 'layers',
    items: [
      { label: '首页', to: '/desktop', icon: 'home' },
      { label: '作品', to: '/desktop/novels', icon: 'book' },
      { label: '书城', to: '/desktop/bookstore', icon: 'store' },
      { label: '写作分析', to: '/desktop/writer-stats', icon: 'barChart' },
      { label: '数据分析', to: '/desktop/analytics', icon: 'layers' },
      { label: '热点报告', to: '/desktop/trends', icon: 'pieChart' },
      { label: '趣味', to: '/desktop/fun', icon: 'sparkles' },
    ],
  },
  {
    id: 'mine',
    label: '我的',
    icon: 'user',
    items: [
      { label: '个人中心', to: '/desktop/me', icon: 'user' },
      { label: '我的发布', to: '/desktop/my-published', icon: 'store' },
      { label: '设置', to: '/desktop/settings', icon: 'settings' },
      { label: '收藏', to: '/desktop/favorites', icon: 'book' },
      { label: '角色图鉴', to: '/desktop/characters', icon: 'star' },
    ],
  },
  {
    id: 'admin',
    label: '管理',
    icon: 'settings',
    adminOnly: true,
    items: [
      { label: '系统设置', to: '/desktop/admin', icon: 'settings' },
      { label: '书城管理', to: '/desktop/admin/bookstore', icon: 'store' },
      { label: '审核管理', to: '/desktop/admin/audit', icon: 'checkCircle' },
      { label: '计费管理', to: '/desktop/admin/billing', icon: 'dollarSign' },
      { label: 'DNA 插画', to: '/desktop/admin/dna', icon: 'image' },
      { label: '用户管理', to: '/desktop/admin/users', icon: 'user' },
      { label: '试用账号', to: '/desktop/admin/trial-accounts', icon: 'user' },
    ],
  },
];

const visibleNavGroups = computed(() => NAV_GROUPS.filter((group) => !group.adminOnly || isAdmin.value));
const openNavGroupId = ref('workspace');

// 消息中心
const notificationDrawerVisible = ref(false);
const notificationUnreadCount = ref(0);
let unreadPollTimer: ReturnType<typeof setInterval> | null = null;

async function loadNotificationUnread() {
  if (!authStore.isAuthenticated) {
    notificationUnreadCount.value = 0;
    return;
  }
  try {
    notificationUnreadCount.value = await fetchUnreadCount();
  } catch {
    // 静默
  }
}

function startNotificationPolling() {
  if (unreadPollTimer) return;
  void loadNotificationUnread();
  unreadPollTimer = setInterval(loadNotificationUnread, 60_000);
}

function stopNotificationPolling() {
  if (unreadPollTimer) {
    clearInterval(unreadPollTimer);
    unreadPollTimer = null;
  }
}

function onNotificationUnreadChanged(count: number) {
  notificationUnreadCount.value = count;
}

function isGroupActive(group: DesktopNavGroup): boolean {
  // 精确匹配：路径必须等于导航项路径，或以导航项路径 + '/' 开头
  // 避免 '/desktop' 匹配 '/desktop/me'（因为 '/desktop/me'.startsWith('/desktop') 为 true）
  return group.items.some((item) => {
    // 精确匹配
    if (route.path === item.to) return true;
    // 子路径匹配：必须以 item.to + '/' 开头
    if (route.path.startsWith(item.to + '/')) return true;
    return false;
  });
}

function getActiveGroup(): DesktopNavGroup | undefined {
  // 优先选择路径匹配更精确的组（避免 /desktop 匹配 /desktop/me 的问题）
  const activeGroups = visibleNavGroups.value.filter(isGroupActive);
  if (activeGroups.length === 0) return undefined;
  if (activeGroups.length === 1) return activeGroups[0];

  // 多个组匹配时，选择匹配路径最长的组
  let bestGroup: DesktopNavGroup | undefined;
  let bestMatchLength = 0;

  for (const group of activeGroups) {
    const matchingItem = group.items.find((item) => route.path === item.to || route.path.startsWith(`${item.to}/`));
    if (matchingItem && matchingItem.to.length > bestMatchLength) {
      bestMatchLength = matchingItem.to.length;
      bestGroup = group;
    }
  }

  return bestGroup;
}

function isGroupOpen(groupId: string): boolean {
  const activeGroup = getActiveGroup();
  if (activeGroup && activeGroup.id === groupId) return true;
  return openNavGroupId.value === groupId;
}

function getNavPanelHeight(group: DesktopNavGroup): string {
  return isGroupOpen(group.id) ? `${group.items.length * 37 + 2}px` : '0px';
}

function toggleNavGroup(groupId: string): void {
  openNavGroupId.value = openNavGroupId.value === groupId ? '' : groupId;
}

watch(
  () => route.path,
  (newPath) => {
    const activeGroup = getActiveGroup();
    if (activeGroup) {
      openNavGroupId.value = activeGroup.id;
    }
  },
  { immediate: true, flush: 'sync' },
);

function onNovelCreated(novelId: string): void {
  // 创建后进入桌面端作品工作台
  router.push(`/desktop/novel/${novelId}`);
}

const ROUTE_META: Record<string, { title: string; icon: string }> = {
  '/desktop': { title: '首页', icon: 'home' },
  '/desktop/bookstore': { title: '书城', icon: 'store' },
  '/desktop/fun': { title: '趣味中心', icon: 'sparkles' },
  '/desktop/me': { title: '我的', icon: 'user' },
  '/desktop/my-published': { title: '我的发布', icon: 'store' },
  '/desktop/novels': { title: '我的作品', icon: 'book' },
  '/desktop/analytics': { title: '数据分析', icon: 'layers' },
  '/desktop/writer-stats': { title: '写作分析', icon: 'barChart' },
  '/desktop/book': { title: '作品详情', icon: 'book' },
  '/desktop/novel': { title: '作品工作台', icon: 'book' },
  '/desktop/admin': { title: '管理设置', icon: 'settings' },
  '/desktop/admin/users': { title: '用户管理', icon: 'user' },
  '/desktop/admin/trial-accounts': { title: '试用账号', icon: 'user' },
  '/desktop/admin/bookstore': { title: '书城管理', icon: 'store' },
  '/desktop/admin/audit': { title: '审核管理', icon: 'checkCircle' },
  '/desktop/admin/billing': { title: '计费管理', icon: 'dollarSign' },
  '/desktop/admin/dna': { title: 'DNA 插画', icon: 'image' },
  '/desktop/favorites': { title: '我的收藏', icon: 'book' },
  '/desktop/characters': { title: '角色图鉴', icon: 'star' },
  '/desktop/settings': { title: '设置', icon: 'settings' },
  '/desktop/showcase': { title: '作品展示', icon: 'sparkles' },
  '/desktop/trends': { title: '热点报告', icon: 'pieChart' },
};

const current = computed(() => {
  const path = route.path;
  if (path.startsWith('/desktop/bookstore')) return ROUTE_META['/desktop/bookstore'];
  if (path.startsWith('/desktop/book/')) return ROUTE_META['/desktop/book'];
  if (path.startsWith('/desktop/novel') && path.includes('/audio-drama')) return { title: 'AI 广播剧', icon: 'headset' };
  if (path.startsWith('/desktop/novel')) return ROUTE_META['/desktop/novel'];
  if (path.startsWith('/desktop/admin')) return ROUTE_META['/desktop/admin'];
  if (path.startsWith('/desktop/analytics')) return ROUTE_META['/desktop/analytics'];
  return ROUTE_META[path] ?? ROUTE_META['/desktop'] ?? { title: '工作台', icon: 'layers' };
});

async function handleLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定退出登录？', '退出', { type: 'warning', confirmButtonText: '退出' });
  } catch {
    return;
  }
  await authStore.logout();
  router.push({ name: 'Login' });
}
</script>

<template>
  <div class="desktop-app">
    <aside class="desktop-sidebar">
      <div class="desktop-brand">
        <BrandEmblem class="desktop-brand-mark" :size="44" />
        <span class="desktop-brand-text">
          <span class="desktop-brand-name">{{ brand.displayName }}</span>
          <span class="desktop-brand-tag">桌面工作台</span>
        </span>
      </div>

      <button type="button" class="desktop-nav-cta" @click="openCreate">
        <Icon name="plus" :size="18" /> 新建作品
      </button>

      <nav class="desktop-nav" aria-label="桌面导航">
        <section
          v-for="group in visibleNavGroups"
          :key="group.id"
          class="desktop-nav-group"
          :class="{ 'is-open': isGroupOpen(group.id), 'is-active': isGroupActive(group) }"
        >
          <button
            type="button"
            class="desktop-nav-group-trigger"
            :aria-expanded="isGroupOpen(group.id)"
            @click="toggleNavGroup(group.id)"
          >
            <span class="desktop-nav-group-title">
              <Icon :name="group.icon" :size="16" />
              {{ group.label }}
            </span>
            <Icon name="chevronRight" :size="14" class="desktop-nav-group-chevron" />
          </button>

          <div
            class="desktop-nav-group-panel"
            :style="{ maxHeight: getNavPanelHeight(group) }"
            :aria-hidden="!isGroupOpen(group.id)"
          >
            <RouterLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="desktop-nav-item"
              :tabindex="isGroupOpen(group.id) ? 0 : -1"
            >
              <Icon :name="item.icon" :size="17" />
              <span>{{ item.label }}</span>
            </RouterLink>
          </div>
        </section>
      </nav>

      <div class="desktop-sidebar-foot">
        <div v-if="authStore.isAuthenticated" class="sidebar-user-card">
          <RouterLink to="/desktop/me" class="sidebar-user-main">
            <div class="sidebar-user-avatar">{{ (authStore.user?.penName || authStore.user?.username || '?').slice(0, 1) }}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">{{ authStore.user?.penName || authStore.user?.username || '未登录' }}</div>
              <div class="sidebar-user-role">{{ isAdmin ? '管理员' : '创作者' }}</div>
            </div>
          </RouterLink>
          <button
            type="button"
            class="sidebar-logout-btn"
            title="退出登录"
            aria-label="退出登录"
            @click="handleLogout"
          >
            <Icon name="logOut" :size="18" />
          </button>
        </div>
        <a class="desktop-back-mobile" href="/m">
          <Icon name="arrowLeft" :size="16" /> 返回移动端
        </a>
      </div>
    </aside>

    <main class="desktop-main">
      <header class="desktop-topbar">
        <div class="desktop-topbar-title">
          <Icon :name="current.icon" :size="18" /> {{ current.title }}
        </div>
        <div class="desktop-topbar-search">
          <Icon name="search" :size="16" />
          <input v-model="query" placeholder="搜索作品、作者…" />
        </div>
        <button
          v-if="authStore.isAuthenticated"
          class="desktop-icon-btn desktop-notif-btn"
          title="消息中心"
          aria-label="消息中心"
          @click="notificationDrawerVisible = true"
        >
          <Icon name="bell" :size="18" />
          <span v-if="notificationUnreadCount > 0" class="desktop-notif-btn-badge">
            {{ notificationUnreadCount > 99 ? '99+' : notificationUnreadCount }}
          </span>
        </button>
        <button
          class="desktop-icon-btn"
          :title="isDark ? '切换浅色' : '切换深色'"
          :aria-label="isDark ? '切换浅色' : '切换深色'"
          @click="toggleTheme"
        >
          <Icon :name="isDark ? 'sun' : 'moon'" :size="18" />
        </button>
      </header>

      <div class="desktop-content">
        <router-view />
      </div>
    </main>

    <DesktopCreateNovelDialog v-model="createDialogVisible" @created="onNovelCreated" />
    <DesktopDnaDialog v-model="dnaDialogVisible" @created="onNovelCreated" />
    <DesktopCangjieDialog v-model="cangjieDialogVisible" @created="onNovelCreated" />
    <DesktopNotificationDrawer
      v-model:visible="notificationDrawerVisible"
      @unread-changed="onNotificationUnreadChanged"
    />
  </div>
</template>
