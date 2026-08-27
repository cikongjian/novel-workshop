import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';

import App from './App.vue';
import router from './router';
import { vRipple } from './directives';
import { useAuthStore } from './stores/auth';
import { useNetworkStatusStore } from './stores/networkStatus';
import { loadComicFeature } from './composables/useComicFeature';
import { registerServiceWorker } from './utils/registerSW';
import { finishBrowserPerf, startBrowserPerf } from './utils/performance-metrics';
import { applyColorMixPolyfill } from './utils/color-mix-polyfill';
import { installChunkErrorRecovery } from './utils/chunk-reload';
import { clearLegacyPrivateApiCache } from './utils/legacy-api-cache';
import './styles/global.css';
import './styles/mobile-focus.css';
import './styles/mobile-device-frame.css';
import './styles/modern-workspace.css';
import './styles/brand-star.css';
import './styles/dashboard-brand-content.css';

const bootstrapPerf = startBrowserPerf('app.bootstrap');
const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(ElementPlus, { locale: zhCn });

app.directive('ripple', vRipple);

// 初始化认证状态（检测服务端是否启用认证 + 恢复 HttpOnly Cookie 会话）
const authStore = useAuthStore();
const networkStore = useNetworkStatusStore();
networkStore.init();

// 拉取章节漫画功能开关（公开端点，无需登录；不阻塞 mount，失败默认关闭=无痕）
void loadComicFeature();

// 注册 Service Worker (PWA)
void clearLegacyPrivateApiCache();
registerServiceWorker();

// 安装按需 chunk 加载失败的全局恢复（发布新版后旧缓存引用失效时自动刷新）
installChunkErrorRecovery();

// 先挂载应用，再后台初始化认证。
// 不能让 app.mount 等待 authStore.init()：WebView 中 /health 等请求可能挂起，
// 阻塞挂载会导致整页长时间“什么都点不了”。路由守卫已对未初始化状态放行
// （beforeEach 中 !initialized 时 return true），init 完成后再自然生效。
applyColorMixPolyfill();

const mountPerf = startBrowserPerf('app.mount');
app.mount('#app');
finishBrowserPerf(mountPerf, {
  route: router.currentRoute.value.fullPath,
});
finishBrowserPerf(bootstrapPerf, {
  authEnabled: authStore.authEnabled,
  route: router.currentRoute.value.fullPath,
});

const authInitPerf = startBrowserPerf('auth.init');
authStore.init().finally(() => {
  finishBrowserPerf(authInitPerf, {
    authEnabled: authStore.authEnabled,
    initialized: authStore.initialized,
    isAuthenticated: authStore.isAuthenticated,
  });
});
