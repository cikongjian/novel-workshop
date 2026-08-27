import { ref, onMounted, markRaw } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Monitor,
  Iphone,
  Apple,
  ChromeFilled,
} from '@element-plus/icons-vue';
import { fetchDownloadList, type DownloadConfig, type DownloadItem } from '../api/downloads';
import { openInAndroidShellExternalBrowser } from '../utils/app-shell';

type DownloadActionItem = Pick<DownloadItem, 'name' | 'directUrl' | 'baiduPanUrl' | 'baiduPanCode'>;

const platformIcons: Record<string, unknown> = {
  windows: markRaw(Monitor),
  macos: markRaw(Apple),
  android: markRaw(ChromeFilled),
  ios: markRaw(Iphone),
  linux: markRaw(Monitor),
};

function openExternalUrl(url: string) {
  if (openInAndroidShellExternalBrowser(url)) {
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function useDownloadPage() {
  const config = ref<DownloadConfig>({ items: [], notice: '' });
  const loading = ref(true);
  const error = ref('');

  function getPlatformIcon(platform: string) {
    return platformIcons[platform] || Monitor;
  }

  function hasPrimaryAction(item: Pick<DownloadItem, 'directUrl' | 'baiduPanUrl'>) {
    return Boolean(item.directUrl || item.baiduPanUrl);
  }

  function handleDirectDownload(url: string) {
    openExternalUrl(url);
  }

  async function handleBaiduPan(item: DownloadActionItem) {
    const copied = await copyToClipboard(item.baiduPanCode);
    if (copied) {
      ElMessage.success(`提取码已复制: ${item.baiduPanCode}`);
    }

    openExternalUrl(item.baiduPanUrl);
  }

  function handlePrimaryAction(item: DownloadActionItem) {
    if (item.directUrl) {
      handleDirectDownload(item.directUrl);
      return;
    }

    if (item.baiduPanUrl) {
      void handleBaiduPan(item);
    }
  }

  onMounted(async () => {
    try {
      config.value = await fetchDownloadList();
    } catch (err: any) {
      error.value = err.message || '加载失败';
    } finally {
      loading.value = false;
    }
  });

  return {
    config,
    loading,
    error,
    getPlatformIcon,
    hasPrimaryAction,
    handleDirectDownload,
    handleBaiduPan,
    handlePrimaryAction,
  };
}
