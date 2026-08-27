import { ref } from 'vue';
import { defineStore } from 'pinia';
import { isAppShell } from '../utils/app-shell';

/**
 * 网络状态 Store
 * 监听 navigator.onLine + online/offline 事件，全局暴露网络连通性
 *
 * 注意：鸿蒙/安卓 App 壳（WebView）的 navigator.onLine 不可靠，常误报 false。
 * 壳环境下页面能加载即代表有网，因此初始视为在线，并忽略 offline 误报。
 */
export const useNetworkStatusStore = defineStore('networkStatus', () => {
  const inAppShell = isAppShell();
  const online = ref(inAppShell || (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const swRegistered = ref(false);
  const swUpdateAvailable = ref(false);
  const swOfflineReady = ref(false);

  let swReg: ServiceWorkerRegistration | undefined;

  function setOnline(value: boolean) {
    online.value = value;
  }

  function setSwRegistered(registration: ServiceWorkerRegistration | undefined) {
    swRegistered.value = true;
    swReg = registration;
  }

  function setSwUpdateAvailable() {
    swUpdateAvailable.value = true;
  }

  function setSwOfflineReady() {
    swOfflineReady.value = true;
  }

  async function acceptSwUpdate() {
    if (typeof window !== 'undefined') {
      const updater = (window as Record<string, unknown>).__updateSW as
        | ((reload?: boolean) => Promise<void>)
        | undefined;
      if (updater) {
        await updater(true);
      } else {
        window.location.reload();
      }
    }
    swUpdateAvailable.value = false;
  }

  function init() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => setOnline(true));
    // 壳环境下 navigator 的 offline 事件常为误报，忽略；仅在真实浏览器中响应
    if (!inAppShell) {
      window.addEventListener('offline', () => setOnline(false));
    }

    window.addEventListener('sw:registered', ((e: CustomEvent) => {
      setSwRegistered(e.detail as ServiceWorkerRegistration | undefined);
    }) as EventListener);

    window.addEventListener('sw:update-available', () => {
      setSwUpdateAvailable();
    });

    window.addEventListener('sw:offline-ready', () => {
      setSwOfflineReady();
    });
  }

  return {
    online,
    swRegistered,
    swUpdateAvailable,
    swOfflineReady,
    swReg,
    setOnline,
    setSwRegistered,
    setSwUpdateAvailable,
    setSwOfflineReady,
    acceptSwUpdate,
    init,
  };
});
