/**
 * 离线状态检测 composable
 * - 离线章节缓存仍由 useOfflineChapterCache 负责
 * - 全局关闭离线状态提示，避免 WebView navigator.onLine 误报造成常驻横幅
 */
import { ref } from 'vue';

export function useOfflineIndicator() {
  const isOffline = ref(false);
  const showBanner = ref(false);
  const justRecovered = ref(false);

  function dismiss() {}

  return {
    isOffline,
    showBanner,
    justRecovered,
    dismiss,
  };
}
