import { ref } from 'vue';
import { comicPanelUrl, deleteComicScene, deletePanel as deletePanelApi, designScenes, generateComic, generateSelectedComic, getComic, getScenes, publishComic, regeneratePanel as regeneratePanelApi, reorderPanels as reorderPanelsApi, type ComicManifest, type ComicSceneList } from '../api/comic';
import { getCachedComic, setCachedComic, deleteCachedComic } from './useComicCache';

/**
 * 单章漫画的拉取/生成逻辑（与 MobileComicStrip 组件解耦）。
 * novelId / chapterNumber 以 getter 形式传入，便于绑定响应式 props。
 */
export function useComicChapter(
  novelId: () => string | null | undefined,
  chapterNumber: () => number | null | undefined,
) {
  const manifest = ref<ComicManifest | null>(null);
  /** panelIndex → 本地缓存的 data URL（base64）；无则用服务器 URL */
  const panelBlobs = ref<Record<number, string>>({});
  /** 场景列表（设计漫画场景产物，作者勾选用） */
  const sceneList = ref<ComicSceneList | null>(null);
  const loading = ref(false);
  const generating = ref(false);
  const regeneratingPanelIndexes = ref<Set<number>>(new Set());
  const designing = ref(false);
  const error = ref('');
  /** 漫画风格预设 key（存 localStorage，注入所有出图 prompt 保证全章风格统一） */
  const comicStyle = ref<string>(localStorage.getItem('comic-style') || '');
  function setComicStyle(style: string): void {
    comicStyle.value = style;
    try { localStorage.setItem('comic-style', style); } catch (err) {
      console.warn('[comic] 保存风格失败', err);
    }
  }

  async function load(): Promise<void> {
    const nid = novelId();
    const cn = chapterNumber();
    if (!nid || cn == null) return;
    loading.value = true;
    error.value = '';
    try {
      // 场景列表总是读（后端 scene-list.json 持久化，刷新不丢，独立于 manifest）
      sceneList.value = await getScenes(nid, cn);
      // 优先从服务端拉 manifest（保证最新），失败时降级到本地缓存
      let m = await getComic(nid, cn);
      if (m) {
        manifest.value = m;
        panelBlobs.value = {};
        // 后台更新缓存，不与旧缓存合并
        void cachePanelsToLocal(nid, cn, m);
      } else {
        const cached = await getCachedComic(nid, cn);
        if (cached) {
          manifest.value = cached.manifest;
          panelBlobs.value = cached.panelBlobs;
        } else {
          manifest.value = null;
          panelBlobs.value = {};
        }
      }
    } catch (err) {
      error.value = extractApiError(err, '加载漫画失败');
    } finally {
      loading.value = false;
    }
  }

  async function generate(): Promise<void> {
    const nid = novelId();
    const cn = chapterNumber();
    if (!nid || cn == null) return;
    generating.value = true;
    error.value = '';
    try {
      const m = await generateComic(nid, cn);
      manifest.value = m;
      panelBlobs.value = {};
      // 生成成功后，后台把图片缓存到 IndexedDB（下次离线可看、历史不丢）
      void cachePanelsToLocal(nid, cn, m);
    } catch (err) {
      error.value = extractApiError(err, '生成漫画失败');
    } finally {
      generating.value = false;
    }
  }

  /** 把每格图片 fetch 成 base64 存 IndexedDB；增量更新 panelBlobs（缓存一张显示一张） */
  async function cachePanelsToLocal(nid: string, cn: number, m: ComicManifest): Promise<void> {
    const blobs: Record<number, string> = {};
    for (const panel of m.panels) {
      if (!panel.imagePath) continue;
      try {
        const resp = await fetch(comicPanelUrl(nid, cn, panel.imagePath));
        if (!resp.ok) continue;
        const dataUrl = await blobToDataURL(await resp.blob());
        blobs[panel.panelIndex] = dataUrl;
        panelBlobs.value = { ...blobs };
      } catch (err) {
        console.warn('[comic] 单格本地缓存失败', panel.panelIndex, err);
      }
    }
    await setCachedComic({
      key: `${nid}:${cn}`,
      novelId: nid,
      chapter: cn,
      manifest: m,
      panelBlobs: blobs,
      cachedAt: Date.now(),
    });
  }

  /** 设计漫画场景（①剧情挖掘 + ②分镜设计，AI 产出场景列表）。mode=append 追加更多候选 */
  async function design(mode: 'replace' | 'append' = 'replace'): Promise<void> {
    const nid = novelId();
    const cn = chapterNumber();
    if (!nid || cn == null) return;
    designing.value = true;
    error.value = '';
    try {
      sceneList.value = await designScenes(nid, cn, mode);
    } catch (err) {
      error.value = extractApiError(err, '设计漫画场景失败');
    } finally {
      designing.value = false;
    }
  }

  /** 生成选中场景的漫画（③prompt工程师 + 出图，异步：立即返回 + 轮询增量） */
  async function generateSelected(sceneIds: string[]): Promise<void> {
    const nid = novelId();
    const cn = chapterNumber();
    if (!nid || cn == null || sceneIds.length === 0) return;
    generating.value = true;
    error.value = '';
    try {
      const { total } = await generateSelectedComic(nid, cn, sceneIds, comicStyle.value || undefined);
      // 异步出图：立即返回后启动轮询，逐格拿增量 manifest
      startManifestPolling(nid, cn, total);
    } catch (err) {
      error.value = extractApiError(err, '生成漫画失败');
      generating.value = false;
    }
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  /** 轮询 manifest（每 5 秒），增量显示，全部完成（panel 数 >= total）停止 */
  function startManifestPolling(nid: string, cn: number, total: number): void {
    stopManifestPolling();
    generating.value = true;
    // 累积场景：记录已有 panel 数，完成条件 = 已有 + 本次新增 total
    const initialPanelCount = manifest.value?.panels.length ?? 0;
    const targetCount = initialPanelCount + total;
    let ticks = 0;
    const MAX_TICKS = 120;
    const tick = async (): Promise<void> => {
      ticks += 1;
      try {
        const m = await getComic(nid, cn);
        if (m) {
          manifest.value = m;
          if (m.panels.length >= targetCount) {
            stopManifestPolling();
            void cachePanelsToLocal(nid, cn, m);
            return;
          }
        }
      } catch (err) {
        console.warn('[comic] 轮询 manifest 失败', err);
      }
      if (ticks >= MAX_TICKS) {
        stopManifestPolling();
        error.value = '生成超时，请稍后查看已生成的部分或重试';
      }
    };
    void tick();
    pollTimer = setInterval(() => { void tick(); }, 5000);
  }
  /** 停止轮询（完成或组件卸载时调用） */
  function stopManifestPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    generating.value = false;
  }

  /** 删除单格漫画 */
  async function removePanel(panelIndex: number): Promise<void> {
    const nid = novelId();
    const cn = chapterNumber();
    if (!nid || cn == null) return;
    try {
      const m = await deletePanelApi(nid, cn, panelIndex);
      manifest.value = m;
      // 同步清除本地缓存，避免下次打开读到旧数据
      void deleteCachedComic(nid, cn);
    } catch (err) {
      error.value = extractApiError(err, '删除失败');
    }
  }

  /** 排序漫画格（传新顺序的 panelIndex 数组） */
  async function reorderPanels(panelIndices: number[]): Promise<void> {
    const nid = novelId();
    const cn = chapterNumber();
    if (!nid || cn == null) return;
    try {
      manifest.value = await reorderPanelsApi(nid, cn, panelIndices);
    } catch (err) {
      error.value = extractApiError(err, '排序失败');
    }
  }

  async function regeneratePanel(panelIndex: number): Promise<void> {
    const nid = novelId();
    const cn = chapterNumber();
    if (!nid || cn == null) return;
    regeneratingPanelIndexes.value = new Set(regeneratingPanelIndexes.value).add(panelIndex);
    error.value = '';
    try {
      const m = await regeneratePanelApi(nid, cn, panelIndex, comicStyle.value || undefined);
      manifest.value = m;
      panelBlobs.value = {};
      void deleteCachedComic(nid, cn);
      void cachePanelsToLocal(nid, cn, m);
    } catch (err) {
      error.value = extractApiError(err, '重新生成该格失败');
    } finally {
      const next = new Set(regeneratingPanelIndexes.value);
      next.delete(panelIndex);
      regeneratingPanelIndexes.value = next;
    }
  }

  async function removeScene(sceneId: string): Promise<void> {
    const nid = novelId();
    const cn = chapterNumber();
    if (!nid || cn == null) return;
    error.value = '';
    try {
      sceneList.value = await deleteComicScene(nid, cn, sceneId);
    } catch (err) {
      error.value = extractApiError(err, '删除候选场景失败');
    }
  }

  const publishing = ref(false);

  /** 发布本章漫画到服务器（draft → published，供书城读者，不被定期清理） */
  async function publish(): Promise<void> {
    const nid = novelId();
    const cn = chapterNumber();
    if (!nid || cn == null || !manifest.value) return;
    publishing.value = true;
    error.value = '';
    try {
      const m = await publishComic(nid, cn);
      manifest.value = m;
      // 同步本地缓存的 status，避免下次 load 读到旧的 draft
      const cached = await getCachedComic(nid, cn);
      if (cached) {
        await setCachedComic({ ...cached, manifest: m });
      }
    } catch (err) {
      error.value = extractApiError(err, '发布失败');
    } finally {
      publishing.value = false;
    }
  }

  return { manifest, panelBlobs, sceneList, loading, generating, regeneratingPanelIndexes, designing, publishing, error, comicStyle, setComicStyle, load, generate, design, generateSelected, regeneratePanel, removePanel, removeScene, reorderPanels, stopManifestPolling, publish };
}

function extractApiError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || fallback;
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
