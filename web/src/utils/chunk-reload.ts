/**
 * 懒加载 chunk 失败恢复
 *
 * 背景：SPA 发布新版本后，旧的 index.html / 入口 chunk 仍可能被 WebView 或浏览器缓存，
 * 其引用的按需 chunk（如 MobileLogin-xxxx.js）在服务器上已被新版本替换删除。
 * 此时动态 import 会失败（服务器对不存在文件返回 index.html，MIME 不匹配），
 * 表现为路由跳转无反应、按钮“点不动”。
 *
 * 策略：捕获这类加载失败，强制整页重载一次以拉取最新版本；
 * 用 sessionStorage 标记防止反复刷新形成死循环。
 */

const RELOAD_FLAG_KEY = 'nw-chunk-reload-at';
/** 两次自动刷新的最小间隔，避免真实持续失败时无限刷新 */
const RELOAD_COOLDOWN_MS = 15_000;

/** 判断一个错误是否为按需 chunk 加载失败 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /'text\/html' is not a valid JavaScript MIME type/i.test(message) ||
    /Loading chunk \d+ failed/i.test(message) ||
    /ChunkLoadError/i.test(message)
  );
}

/**
 * 触发一次防循环的整页重载。
 * @returns 是否真正发起了重载（处于冷却期内则跳过，返回 false）
 */
export function reloadForFreshChunks(): boolean {
  if (typeof window === 'undefined') return false;

  const now = Date.now();
  let lastReloadAt = 0;
  try {
    lastReloadAt = Number(window.sessionStorage.getItem(RELOAD_FLAG_KEY) || '0');
  } catch {
    // sessionStorage 不可用时按未刷新处理，仍允许一次刷新
    lastReloadAt = 0;
  }

  if (now - lastReloadAt < RELOAD_COOLDOWN_MS) {
    // 刚刚已因 chunk 失败刷新过，说明刷新无法解决，停止以免死循环
    return false;
  }

  try {
    window.sessionStorage.setItem(RELOAD_FLAG_KEY, String(now));
  } catch {
    // 忽略写入失败，仍尝试刷新
  }
  window.location.reload();
  return true;
}

/**
 * 安装全局兜底：监听 vite 的 preloadError 与未捕获的 chunk 加载错误。
 * 在 main.ts 启动时调用一次。
 */
export function installChunkErrorRecovery(): void {
  if (typeof window === 'undefined') return;

  // Vite 在按需 chunk 预加载失败时派发该事件
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadForFreshChunks();
  });

  // 兜底：未被捕获的动态 import 失败（Promise rejection）
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      reloadForFreshChunks();
    }
  });
}
