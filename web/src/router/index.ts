import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { finishBrowserPerf, startBrowserPerf, type BrowserPerfToken } from '../utils/performance-metrics';
import { getDeployBase } from '../utils/deploy-path';
import { isChunkLoadError, reloadForFreshChunks } from '../utils/chunk-reload';

const routes: RouteRecordRaw[] = [
  // ===================== 根路径 / 桌面端路径 → 移动端重定向 =====================
  { path: '/', redirect: '/m', meta: { public: true } },
  { path: '/login', redirect: '/m/login', meta: { public: true } },
  { path: '/download', redirect: '/m/download', meta: { public: true } },
  { path: '/app', redirect: '/m/app' },
  { path: '/app/:pathMatch(.*)*', redirect: '/m/app' },
  { path: '/workspace', redirect: '/m/app' },
  { path: '/novels', redirect: '/m/novels' },
  { path: '/dashboard', redirect: '/m/app' },
  { path: '/billing', redirect: '/m/me' },
  { path: '/pricing', redirect: '/m/me' },
  { path: '/settings', redirect: '/m/admin' },
  { path: '/settings/users', redirect: '/m/admin' },
  { path: '/settings/users/:userId', redirect: '/m/admin' },
  { path: '/short-story', redirect: '/m/app' },
  { path: '/short-story/:id', redirect: '/m/app' },
  { path: '/trends', redirect: '/m/trends' },
  { path: '/bookstore', redirect: '/m', meta: { public: true } },
  { path: '/bookstore/:id', redirect: (to) => `/m/bookstore/${to.params.id}`, meta: { public: true } },
  { path: '/bookstore/:id/read', redirect: (to) => `/m/bookstore/${to.params.id}/read`, meta: { public: true } },
  { path: '/bookstore/:id/read/:chapterId', redirect: (to) => `/m/bookstore/${to.params.id}/read/${to.params.chapterId}`, meta: { public: true } },
  { path: '/become-creator', redirect: '/m/login', meta: { public: true } },
  { path: '/apply', redirect: '/m/login', meta: { public: true } },
  { path: '/my-published', redirect: '/m/my-published' },
  { path: '/my-favorites', redirect: '/m/favorites' },
  { path: '/my-comments', redirect: '/m/comments' },
  { path: '/admin/audit', redirect: '/m/app' },
  { path: '/admin/reports', redirect: '/m/app' },
  { path: '/admin/moderation', redirect: '/m/app' },
  { path: '/admin/compliance', redirect: '/m/app' },
  { path: '/admin/bookstore', redirect: '/m/app' },
  { path: '/user-management', redirect: '/m/app' },
  { path: '/novel/:id', redirect: (to) => `/m/novel/${to.params.id}` },
  { path: '/novel/:id/chapters', redirect: (to) => `/m/novel/${to.params.id}/chapters` },
  { path: '/novel/:id/outline', redirect: (to) => `/m/novel/${to.params.id}/outline` },
  { path: '/novel/:id/:pathMatch(.*)*', redirect: (to) => `/m/novel/${to.params.id}/chapters` },

  // ===================== 法律文档（公共） =====================
  {
    path: '/complaints',
    name: 'ComplaintCenter',
    component: () => import('../views/ComplaintCenter.vue'),
    meta: { public: true },
  },
  {
    path: '/privacy',
    name: 'PrivacyPolicy',
    component: () => import('../views/LegalDocumentView.vue'),
    meta: { public: true, documentSlug: 'privacy' },
  },
  {
    path: '/terms',
    name: 'TermsOfService',
    component: () => import('../views/LegalDocumentView.vue'),
    meta: { public: true, documentSlug: 'terms' },
  },

  // ===================== 移动端路由 =====================
  {
    path: '/m',
    name: 'MobileEntry',
    component: () => import('../views/MobileEntry.vue'),
    meta: { public: true },
  },
  {
    path: '/m/download',
    name: 'MobileDownloadPage',
    component: () => import('../views/MobileDownloadPage.vue'),
    meta: { public: true },
  },
  {
    path: '/m/login',
    name: 'Login',
    component: () => import('../views/MobileLogin.vue'),
    meta: { public: true },
  },
  {
    path: '/m/app',
    name: 'MobileApp',
    component: () => import('../views/MobileApp.vue'),
    meta: { scrollUnlocked: true, creatorOnly: true },
  },
  {
    path: '/m/novels',
    name: 'MobileNovels',
    component: () => import('../views/MobileNovels.vue'),
    meta: { scrollUnlocked: true, creatorOnly: true },
  },
  {
    path: '/m/novel/:id',
    name: 'MobileNovelDetail',
    component: () => import('../views/MobileNovelDetail.vue'),
    meta: { scrollUnlocked: true, creatorOnly: true },
  },
  {
    path: '/m/novel/:id/chapters',
    name: 'MobileNovelChapters',
    component: () => import('../views/MobileNovelChapters.vue'),
    meta: { scrollUnlocked: true, creatorOnly: true },
  },
  {
    path: '/m/novel/:id/read',
    name: 'MobileNovelReader',
    component: () => import('../views/MobileNovelReader.vue'),
    meta: { scrollUnlocked: true },
  },
  {
    path: '/m/novel/:id/outline',
    name: 'MobileNovelOutline',
    component: () => import('../views/MobileNovelOutline.vue'),
    meta: { scrollUnlocked: true, creatorOnly: true },
  },
  {
    path: '/m/novel/:id/showcase',
    name: 'MobileNovelShowcase',
    component: () => import('../views/MobileNovelShowcase.vue'),
    meta: { scrollUnlocked: true, creatorOnly: true },
  },
  {
    path: '/m/novel/:id/audio-drama',
    name: 'MobileAudioDrama',
    component: () => import('../views/MobileAudioDrama.vue'),
    meta: { scrollUnlocked: true, creatorOnly: true },
  },
  {
    path: '/m/billing',
    redirect: '/m/me',
  },
  {
    path: '/m/settings',
    name: 'MobileSettings',
    component: () => import('../views/MobileSettingsPage.vue'),
    meta: { scrollUnlocked: true },
  },
  {
    path: '/m/api-settings',
    name: 'MobileApiSettings',
    component: () => import('../views/MobileApiSettings.vue'),
    meta: { scrollUnlocked: true, creatorOnly: true },
  },
  {
    path: '/m/admin',
    name: 'MobileAdminSettings',
    component: () => import('../views/MobileAdminSettings.vue'),
    meta: { scrollUnlocked: true },
  },
  {
    path: '/m/admin/users',
    name: 'MobileAdminUsers',
    component: () => import('../views/MobileAdminUsers.vue'),
    meta: { scrollUnlocked: true },
  },
  {
    path: '/m/admin/trial-accounts',
    name: 'MobileAdminTrialAccounts',
    component: () => import('../views/MobileAdminTrialAccounts.vue'),
    meta: { scrollUnlocked: true },
  },
  {
    path: '/m/admin/billing',
    name: 'MobileAdminBilling',
    component: () => import('../views/MobileAdminBilling.vue'),
    meta: { scrollUnlocked: true },
  },
  {
    path: '/m/admin/dna-illustrations',
    name: 'AdminDnaIllustrations',
    component: () => import('../views/AdminDnaIllustrations.vue'),
    meta: { scrollUnlocked: true, adminOnly: true },
  },
  {
    path: '/m/me',
    name: 'MobileMe',
    component: () => import('../views/MobileMe.vue'),
    meta: { scrollUnlocked: true },
  },
  {
    path: '/m/trends',
    name: 'MobileTrends',
    component: () => import('../views/MobileTrends.vue'),
    meta: { scrollUnlocked: true, creatorOnly: true },
  },
  {
    path: '/m/favorites',
    name: 'MobileFavorites',
    component: () => import('../views/MobileFavorites.vue'),
    meta: { scrollUnlocked: true },
  },
  {
    path: '/m/comments',
    name: 'MobileComments',
    component: () => import('../views/MobileComments.vue'),
    meta: { scrollUnlocked: true },
  },
  {
    path: '/m/my-published',
    name: 'MobileMyPublished',
    component: () => import('../views/MobileMyPublished.vue'),
    meta: { scrollUnlocked: true, creatorOnly: true },
  },
  {
    path: '/m/writer-stats',
    name: 'MobileWriterStats',
    component: () => import('../views/MobileWriterStats.vue'),
    meta: { scrollUnlocked: true, creatorOnly: true },
  },
  {
    path: '/m/character-collection',
    name: 'MobileCharacterCollection',
    component: () => import('../views/MobileCharacterCollection.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  // ===== 趣味玩法 =====
  {
    path: '/m/fate',
    name: 'MobileFateChoice',
    component: () => import('../views/MobileFateChoice.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/fun/character-radar',
    name: 'MobileCharacterRadar',
    component: () => import('../views/MobileCharacterRadar.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/fun/chemistry',
    name: 'MobileChemistryTest',
    component: () => import('../views/MobileChemistryTest.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/fun/quotes',
    name: 'MobileQuotePlaza',
    component: () => import('../views/MobileQuotePlaza.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/fun/dna',
    name: 'MobileShuangwenDnaTest',
    component: () => import('../views/MobileShuangwenDnaTest.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/fun/pangu',
    name: 'MobilePanguKickstart',
    component: () => import('../views/MobilePanguKickstart.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/fun/relation',
    name: 'MobileCharacterRelation',
    component: () => import('../views/MobileCharacterRelation.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/fun/cangjie',
    name: 'MobileCangjieChat',
    component: () => import('../views/MobileCangjieChat.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/fun/cangjie/review',
    name: 'MobileCangjieReview',
    component: () => import('../views/MobileCangjieReview.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/achievements',
    name: 'MobileAchievements',
    component: () => import('../views/MobileAchievements.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/bookstore',
    redirect: '/m',
    meta: { public: true },
  },
  {
    path: '/m/become-creator',
    redirect: '/m/login',
    meta: { public: true },
  },
  {
    path: '/m/apply',
    redirect: '/m/login',
    meta: { public: true },
  },
  {
    path: '/m/bookstore/:id',
    name: 'MobileBookDetail',
    component: () => import('../views/MobileBookDetail.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/bookstore/:id/showcase',
    name: 'MobileBookShowcase',
    component: () => import('../views/MobileNovelShowcase.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/bookstore/:id/read',
    name: 'MobileBookReaderEntry',
    component: () => import('../views/MobileBookReader.vue'),
    meta: { public: true, scrollUnlocked: true },
  },
  {
    path: '/m/bookstore/:id/read/:chapterId',
    name: 'MobileBookReader',
    component: () => import('../views/MobileBookReader.vue'),
    meta: { public: true, scrollUnlocked: true },
  },

  // ===================== 桌面端（全新搭建，与 /m 完全隔离）=====================
  // 仅在显式访问 /desktop 时进入；不影响任何 /m 路由，也不改变 / 的移动端重定向。
  // scrollUnlocked：解除 App.vue 对非公开路由的 body overflow:hidden 锁定，使桌面页可滚动。
  // public：本环境开启认证时，守卫会对非 public 路由重定向到登录；桌面首页/详情均走公开端点，故标 public。
  {
    path: '/desktop',
    component: () => import('../desktop/DesktopApp.vue'),
    meta: { public: true, scrollUnlocked: true },
    children: [
      { path: '', name: 'DesktopHome', component: () => import('../desktop/views/DesktopHome.vue') },
      { path: 'bookstore', name: 'DesktopBookStore', component: () => import('../desktop/views/DesktopBookStore.vue') },
      { path: 'fun', name: 'DesktopFunHub', component: () => import('../desktop/views/DesktopFunHub.vue') },
      { path: 'me', name: 'DesktopMe', component: () => import('../desktop/views/DesktopMe.vue') },
      { path: 'book/:id', name: 'DesktopBookDetail', component: () => import('../desktop/views/DesktopBookDetail.vue') },
      { path: 'book/:id/read/:chapterNumber?', name: 'DesktopBookReader', component: () => import('../desktop/views/DesktopBookReader.vue') },
      { path: 'analytics', name: 'DesktopAnalytics', component: () => import('../desktop/views/DesktopAnalytics.vue') },
      { path: 'novel/:id', name: 'DesktopNovelWorkspace', component: () => import('../desktop/views/DesktopNovelWorkspace.vue') },
      { path: 'novel/:id/audio-drama', name: 'DesktopAudioDrama', component: () => import('../desktop/DesktopAudioDramaEntry.vue') },
      { path: 'writer-stats', name: 'DesktopWriterStats', component: () => import('../desktop/views/DesktopWriterStats.vue') },
      { path: 'my-published', name: 'DesktopMyPublished', component: () => import('../desktop/views/DesktopMyPublished.vue') },
      { path: 'novels', name: 'DesktopMyNovels', component: () => import('../desktop/views/DesktopMyNovels.vue') },
      { path: 'admin', name: 'DesktopAdminSettings', component: () => import('../desktop/views/DesktopAdminSettings.vue') },
      { path: 'admin/users', name: 'DesktopAdminUsers', component: () => import('../desktop/views/DesktopAdminUsers.vue') },
      { path: 'admin/trial-accounts', name: 'DesktopTrialAccounts', component: () => import('../desktop/views/DesktopTrialAccounts.vue') },
      { path: 'admin/bookstore', name: 'DesktopAdminBookstore', component: () => import('../desktop/views/DesktopAdminBookstore.vue') },
      { path: 'admin/audit', name: 'DesktopAdminAudit', component: () => import('../desktop/views/DesktopAdminAudit.vue') },
      { path: 'admin/billing', name: 'DesktopAdminBilling', component: () => import('../desktop/views/DesktopAdminBilling.vue') },
      { path: 'admin/dna', name: 'DesktopAdminDna', component: () => import('../desktop/views/DesktopAdminDna.vue') },
      { path: 'favorites', name: 'DesktopFavorites', component: () => import('../desktop/views/DesktopFavorites.vue') },
      { path: 'characters', name: 'DesktopCharacterCollection', component: () => import('../desktop/views/DesktopCharacterCollection.vue') },
      { path: 'showcase/:id', name: 'DesktopNovelShowcase', component: () => import('../desktop/views/DesktopNovelShowcase.vue') },
      { path: 'settings', name: 'DesktopSettings', component: () => import('../desktop/views/DesktopSettings.vue') },
      { path: 'trends', name: 'DesktopTrends', component: () => import('../desktop/views/DesktopTrends.vue') },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(getDeployBase() || '/'),
  routes,
  scrollBehavior() {
    return { top: 0, left: 0 };
  },
});

// 禁用浏览器自带滚动恢复
if (typeof history !== 'undefined') {
  history.scrollRestoration = 'manual';
}

let pendingRoutePerf: BrowserPerfToken | null = null;

// 导航守卫：认证启用时未登录跳转登录页
router.beforeEach((to, from) => {
  if (pendingRoutePerf) {
    finishBrowserPerf(pendingRoutePerf, {
      from: from.fullPath || 'initial',
      status: 'interrupted',
      to: to.fullPath,
    });
  }

  pendingRoutePerf = startBrowserPerf('route.transition', {
    from: from.fullPath || 'initial',
    to: to.fullPath,
  });

  const authStore = useAuthStore();

  // 未初始化时放行（init 还没完成）
  if (!authStore.initialized) return true;

  // 认证未启用（开发模式），全部放行
  if (!authStore.authEnabled) return true;

  // 公开页面，不需要认证
  if (to.meta.public) return true;

  // 未登录，跳转登录页
  if (!authStore.isAuthenticated) {
    return { name: 'Login', query: { redirect: to.fullPath } };
  }

  if (to.matched.some((record) => record.meta.adminOnly) && !authStore.isAdmin) {
    return { name: 'MobileApp' };
  }

  if (to.matched.some((record) => record.meta.creatorOnly) && !authStore.isCreator) {
    return { name: 'MobileEntry' };
  }

  return true;
});

router.afterEach((to, from, failure) => {
  finishBrowserPerf(pendingRoutePerf, {
    failureType: failure ? failure.type : null,
    from: from.fullPath || 'initial',
    status: failure ? 'failed' : 'completed',
    to: to.fullPath,
  });
  pendingRoutePerf = null;
  // 强制滚回顶部（scrollBehavior 可能被浏览器/异步内容覆盖）
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
  });
});

// 导航过程中按需加载路由组件 chunk 失败（多见于发布新版后旧缓存引用已删除的 chunk）：
// 强制刷新拉取最新版本，避免“点了没反应”。reloadForFreshChunks 自带防循环。
router.onError((error) => {
  if (isChunkLoadError(error)) {
    reloadForFreshChunks();
  }
});

export default router;
