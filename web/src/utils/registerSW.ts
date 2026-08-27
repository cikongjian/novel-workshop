/**
 * Service Worker 注册工具
 * - VITE_ENABLE_PWA=true 构建时，vite-plugin-pwa 生成 sw.js，此处注册并激活
 * - 普通构建未生成 sw.js 时，注册静默失败，不影响应用运行
 * - 离线章节缓存由 IndexedDB（useOfflineChapterCache）独立运作，不依赖 SW
 *
 * manifest.json 始终生效，支持移动端"添加到主屏幕"和主题色
 */

export interface SWRegistrationState {
  /** SW 注册成功且已激活 */
  registered: boolean;
  /** 有更新版本的 SW 等待激活 */
  updateAvailable: boolean;
  /** SW 首次缓存完成，应用可离线运行 */
  offlineReady: boolean;
  /** 注册/激活过程中的错误信息 */
  error: string | null;
  /** 当前的 ServiceWorkerRegistration 实例 */
  registration: ServiceWorkerRegistration | null;
}

/** 全局 SW 状态（模块级单例，供 usePushNotification 等消费者读取） */
export const swState: SWRegistrationState = {
  registered: false,
  updateAvailable: false,
  offlineReady: false,
  error: null,
  registration: null,
};

/** SW 状态变更回调列表 */
type SWStateListener = (state: SWRegistrationState) => void;
const stateListeners = new Set<SWStateListener>();

export function onSWStateChange(listener: SWStateListener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function notifyListeners(): void {
  const snapshot = { ...swState };
  stateListeners.forEach((fn) => fn(snapshot));
}

/**
 * 注册 Service Worker。
 * 调用时机：应用启动时（main.ts），应在 DOM 就绪后调用。
 * 只在支持 SW 的浏览器中尝试注册，不支持时静默跳过。
 * VITE_ENABLE_PWA 为 false/未设置时直接跳过，避免非 PWA 构建下
 * 浏览器请求 /sw.js 命中 SPA fallback 返回 text/html 而产生 MIME 报错。
 */
export async function registerServiceWorker(): Promise<void> {
  // 非 PWA 构建 → 直接跳过，不发起 /sw.js 请求
  if (!import.meta.env.VITE_ENABLE_PWA) {
    return;
  }

  // 浏览器不支持 SW → 直接退出
  if (!('serviceWorker' in navigator)) {
    swState.error = '浏览器不支持 Service Worker';
    notifyListeners();
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    swState.registration = reg;
    swState.registered = true;
    swState.error = null;
    notifyListeners();

    // 监听更新
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;

      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          // 新 SW 已安装但尚未激活（有旧版在运行）
          swState.updateAvailable = true;
          notifyListeners();
        }
      });
    });

    // 如果 SW 已处于 waiting 状态（首次访问或上次未激活）
    if (reg.waiting) {
      swState.updateAvailable = true;
      notifyListeners();
    }

    // 检查 SW 是否已激活（首次安装或已缓存完成）
    if (reg.active) {
      // 已激活状态下，通过 controller 判断是否已接管页面
      if (navigator.serviceWorker.controller) {
        swState.offlineReady = true;
        notifyListeners();
      }
    }

    // 监听 controllerchange：SW 接管页面时触发
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      swState.offlineReady = true;
      swState.updateAvailable = false;
      notifyListeners();
    });
  } catch (err) {
    // sw.js 不存在（非 PWA 构建）或注册失败 → 静默处理
    const message = err instanceof Error ? err.message : String(err);
    swState.error = message;
    swState.registered = false;
    notifyListeners();
    console.info('[SW] 注册静默跳过（可能非 PWA 构建）:', message);
  }
}

/**
 * 手动触发 SW 更新检查。
 * 在关键页面进入时（例如阅读器）调用，确保有最新缓存。
 */
export async function checkSWUpdate(): Promise<void> {
  if (!swState.registration) return;
  try {
    await swState.registration.update();
  } catch {
    // 静默
  }
}

/**
 * 激活等待中的新 SW（skipWaiting → 刷新页面）。
 * 通常在用户点击"有新版本"提示后调用。
 */
export async function activateNewSW(): Promise<void> {
  const reg = swState.registration;
  if (!reg?.waiting) return;

  reg.waiting.addEventListener('statechange', () => {
    if (reg.waiting?.state === 'activated') {
      window.location.reload();
    }
  });

  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}
