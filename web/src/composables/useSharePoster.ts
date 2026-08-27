/**
 * 分享海报 composable — HTML 页面方案
 *
 * 后端生成自包含的 HTML 海报页面，前端负责：
 * 1. 调用 POST /posters/promote 触发 AI 文案 + HTML 生成
 * 2. 拼接可访问的页面 URL（带 deploy base，适配 DMP 子路径）
 * 3. 提供 iframe 预览 + 复制链接 + Web Share 分享
 */
import { ref } from 'vue';
import { http } from '../api/http';
import { getApiBase } from '../utils/deploy-path';

export interface PosterResult {
  posterId: string;
  pageUrl: string; // 相对路径，如 /posters/page/xxx
  headline: string;
  tagline: string;
  hooks: string[];
  novelTitle: string;
  authorName: string;
  chapterCount: number;
  wordCount: number;
  category: string;
}

export interface PosterHistoryItem {
  posterId: string;
  novelId: string;
  novelTitle: string;
  headline: string;
  tagline: string;
  status: 'active' | 'disabled';
  createdAt: number;
  pageUrl: string;
}

export interface PosterStats {
  posterId: string;
  totalViews: number;
  uniqueVisitors: number;
  totalReads: number;
  channelStats: Record<string, number>;
  deviceStats: Record<string, number>;
  dailyStats: Record<string, number>;
  firstViewAt: number;
  lastViewAt: number;
  recentViews: { ts: number; channel: string; device: string; visitorId: string }[];
}

/** 渠道标识 → 中文名 */
export const CHANNEL_LABELS: Record<string, string> = {
  wechat: '微信',
  moments: '朋友圈',
  qq: 'QQ',
  weibo: '微博',
  copy: '复制链接',
  qrcode: '二维码',
  direct: '直接访问',
};

export function useSharePoster() {
  const generating = ref(false);
  const result = ref<PosterResult | null>(null);
  const error = ref<string>('');
  const history = ref<PosterHistoryItem[]>([]);
  const historyLoading = ref(false);
  const stats = ref<PosterStats | null>(null);
  const statsLoading = ref(false);

  /** 调用后端生成 HTML 海报页面 */
  async function generate(novelId: string): Promise<PosterResult | null> {
    generating.value = true;
    error.value = '';
    try {
      const { data } = await http.post<PosterResult>('/posters/promote', { novelId });
      result.value = data;
      // 生成后刷新历史列表
      void loadHistory(novelId);
      return data;
    } catch (e: any) {
      error.value = e?.response?.data?.error || e?.message || '生成失败';
      result.value = null;
      return null;
    } finally {
      generating.value = false;
    }
  }

  /** 加载某小说的海报历史列表 */
  async function loadHistory(novelId: string): Promise<void> {
    historyLoading.value = true;
    try {
      const { data } = await http.get<{ pages: PosterHistoryItem[] }>('/posters/list', { params: { novelId } });
      history.value = data.pages ?? [];
    } catch {
      history.value = [];
    } finally {
      historyLoading.value = false;
    }
  }

  /** 禁用海报 */
  async function disable(posterId: string): Promise<boolean> {
    try {
      await http.patch(`/posters/${posterId}/disable`);
      const item = history.value.find((p) => p.posterId === posterId);
      if (item) item.status = 'disabled';
      return true;
    } catch { return false; }
  }

  /** 启用海报 */
  async function enable(posterId: string): Promise<boolean> {
    try {
      await http.patch(`/posters/${posterId}/enable`);
      const item = history.value.find((p) => p.posterId === posterId);
      if (item) item.status = 'active';
      return true;
    } catch { return false; }
  }

  /** 永久删除海报 */
  async function remove(posterId: string): Promise<boolean> {
    try {
      await http.delete(`/posters/${posterId}`);
      history.value = history.value.filter((p) => p.posterId !== posterId);
      if (result.value?.posterId === posterId) result.value = null;
      return true;
    } catch { return false; }
  }

  /** 加载海报统计数据 */
  async function loadStats(posterId: string): Promise<void> {
    statsLoading.value = true;
    try {
      const { data } = await http.get<{ stats: PosterStats }>(`/posters/${posterId}/stats`);
      stats.value = data.stats;
    } catch {
      stats.value = null;
    } finally {
      statsLoading.value = false;
    }
  }

  /**
   * 生成带渠道参数的分享链接
   * @param poster 海报结果
   * @param channel 渠道标识（wechat/moments/qq/copy/qrcode）
   */
  function resolveChannelUrl(poster: PosterResult, channel: string): string {
    const base = resolveAbsoluteUrl(poster);
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}from=${channel}`;
  }

  /**
   * 拼接海报页面的完整可访问 URL（带 deploy base）
   * 用于 iframe 预览、复制链接、Web Share
   */
  function resolvePageUrl(poster: PosterResult): string {
    // pageUrl 形如 /posters/page/xxx，需要加上 /api 前缀和 deploy base
    const apiBase = getApiBase(); // 如 /fullstack/abc/api 或 /api
    return `${apiBase}${poster.pageUrl}`;
  }

  /** 拼接海报页面的绝对 URL（用于复制到微信） */
  function resolveAbsoluteUrl(poster: PosterResult): string {
    const path = resolvePageUrl(poster);
    return `${window.location.origin}${path}`;
  }

  /** 复制链接到剪贴板 */
  async function copyLink(poster: PosterResult): Promise<boolean> {
    const url = resolveAbsoluteUrl(poster);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      }
      // 降级方案
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  /** 调用 Web Share API 分享链接 */
  async function shareLink(poster: PosterResult): Promise<boolean> {
    const url = resolveAbsoluteUrl(poster);
    try {
      if (navigator.share) {
        await navigator.share({
          title: poster.novelTitle || '推荐一部好小说',
          text: poster.tagline || poster.headline || '',
          url,
        });
        return true;
      }
      // 不支持 Web Share 时降级为复制
      return copyLink(poster);
    } catch {
      return false;
    }
  }

  function reset() {
    result.value = null;
    error.value = '';
    stats.value = null;
  }

  return {
    generating,
    result,
    error,
    history,
    historyLoading,
    stats,
    statsLoading,
    generate,
    loadHistory,
    disable,
    enable,
    remove,
    loadStats,
    resolveChannelUrl,
    resolvePageUrl,
    resolveAbsoluteUrl,
    copyLink,
    shareLink,
    reset,
  };
}
