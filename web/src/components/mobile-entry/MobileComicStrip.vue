<script setup lang="ts">
import { ArrowDown, ArrowUp, Delete, RefreshRight } from '@element-plus/icons-vue';
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useComicFeature } from '../../composables/useComicFeature';
import { useComicChapter } from '../../composables/useComicChapter';
import { comicPanelUrl, type ComicPanel } from '../../api/comic';
import MobileComicSceneCard from './MobileComicSceneCard.vue';

const props = defineProps<{
  novelId: string;
  chapterNumber: number;
  visible: boolean;
  /** 通知跳转定位：打开时滚动到该格（来自 ?comicPanel=N） */
  focusPanelIndex?: number;
}>();
const emit = defineEmits<{ 'update:visible': [boolean] }>();

const { comicEnabled } = useComicFeature();
const { manifest, panelBlobs, sceneList, loading, generating, regeneratingPanelIndexes, designing, publishing, error, comicStyle, setComicStyle, load, design, generate, generateSelected, regeneratePanel, removePanel, removeScene, reorderPanels, stopManifestPolling, publish } = useComicChapter(
  () => props.novelId,
  () => props.chapterNumber,
);

// 弹层打开时拉取已有漫画（开关关闭时整体不渲染，不会触发）
watch(
  () => props.visible,
  (v) => {
    if (v && comicEnabled.value) void load();
  },
  { immediate: true },
);

// 通知跳转定位：弹层打开 + manifest 有内容时，滚动到 focusPanelIndex 对应的格
watch(
  () => [manifest.value, props.focusPanelIndex, props.visible] as const,
  ([m, focus, visible]) => {
    if (visible && m && m.panels.length && focus != null) {
      void nextTick(() => {
        document.getElementById(`comic-panel-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  },
);

// 组件卸载时停止 manifest 轮询，避免内存泄漏
onUnmounted(() => stopManifestPolling());

function close(): void {
  emit('update:visible', false);
}

function panelUrl(imagePath: string): string {
  return comicPanelUrl(props.novelId, props.chapterNumber, imagePath);
}

type ComicPageView = {
  pageIndex: number;
  layoutTemplate: string;
  panels: ComicPanel[];
};

const comicPages = computed<ComicPageView[]>(() => {
  const panels = manifest.value?.panels ?? [];
  const sorted = [...panels].sort((a, b) => {
    const ap = a.pageIndex ?? Math.ceil(a.panelIndex / 3);
    const bp = b.pageIndex ?? Math.ceil(b.panelIndex / 3);
    if (ap !== bp) return ap - bp;
    const ai = a.panelIndexInPage ?? (((a.panelIndex - 1) % 3) + 1);
    const bi = b.panelIndexInPage ?? (((b.panelIndex - 1) % 3) + 1);
    if (ai !== bi) return ai - bi;
    return a.panelIndex - b.panelIndex;
  });
  const groups = new Map<number, ComicPanel[]>();
  for (const panel of sorted) {
    const pageIndex = panel.pageIndex ?? Math.ceil(panel.panelIndex / 3);
    const list = groups.get(pageIndex) ?? [];
    list.push(panel);
    groups.set(pageIndex, list);
  }
  return [...groups.entries()].map(([pageIndex, pagePanels]) => ({
    pageIndex,
    layoutTemplate: pagePanels.find((p) => p.layoutTemplate)?.layoutTemplate ?? inferLayoutTemplate(pagePanels, pageIndex),
    panels: pagePanels,
  }));
});

/** 作者勾选的场景 id（持久化到 localStorage，刷新不丢） */
const selectedStorageKey = `comic-selected:${props.novelId}:${props.chapterNumber}`;
const selectedSceneIds = ref<string[]>(loadSelectedFromStorage());
const historicalScenesExpanded = ref(false);
const latestSceneIds = ref<string[]>([]);
const lastSceneCount = ref(0);
function loadSelectedFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(selectedStorageKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch (err) {
    console.warn('[comic] 读取勾选缓存失败', err);
    return [];
  }
}
function toggleScene(id: string): void {
  const idx = selectedSceneIds.value.indexOf(id);
  if (idx >= 0) selectedSceneIds.value.splice(idx, 1);
  else selectedSceneIds.value.push(id);
  try {
    localStorage.setItem(selectedStorageKey, JSON.stringify(selectedSceneIds.value));
  } catch (err) {
    console.warn('[comic] 保存勾选缓存失败', err);
  }
}

/** 生成选中场景：切到条漫视图（看漫画逐格生成）+ 触发异步生成 */
function onGenerateSelected(): void {
  viewMode.value = 'auto';
  generateSelected(selectedSceneIds.value);
}

function onRemoveScene(sceneId: string): void {
  selectedSceneIds.value = selectedSceneIds.value.filter((id) => id !== sceneId);
  try {
    localStorage.setItem(selectedStorageKey, JSON.stringify(selectedSceneIds.value));
  } catch (err) {
    console.warn('[comic] 保存勾选缓存失败', err);
  }
  void removeScene(sceneId);
}

/** 上移一格 */
function movePanelUp(panelIndex: number): void {
  if (!manifest.value) return;
  const indices = manifest.value.panels.map((p) => p.panelIndex);
  const i = indices.indexOf(panelIndex);
  if (i <= 0) return;
  [indices[i - 1], indices[i]] = [indices[i], indices[i - 1]];
  void reorderPanels(indices);
}

/** 下移一格 */
function movePanelDown(panelIndex: number): void {
  if (!manifest.value) return;
  const indices = manifest.value.panels.map((p) => p.panelIndex);
  const i = indices.indexOf(panelIndex);
  if (i < 0 || i >= indices.length - 1) return;
  [indices[i + 1], indices[i]] = [indices[i], indices[i + 1]];
  void reorderPanels(indices);
}

/** 视图模式：auto=按数据自动判断；scenes=强制场景列表（从条漫返回重选场景用） */
const viewMode = ref<'auto' | 'scenes'>('auto');

// 场景列表有内容时默认显示候选（load/设计后优先看候选，不被旧 manifest 遮住），生成时手动切 auto 看漫画
watch(() => sceneList.value, (sl) => {
  if (!sl || !sl.scenes.length) {
    latestSceneIds.value = [];
    lastSceneCount.value = 0;
    return;
  }

  viewMode.value = 'scenes';
  const sceneIds = new Set(sl.scenes.map((scene) => scene.sceneId));
  const grew = sl.scenes.length > lastSceneCount.value;
  const hasNoLatest = latestSceneIds.value.length === 0;
  if (grew || hasNoLatest) {
    latestSceneIds.value = sl.scenes.slice(Math.max(0, sl.scenes.length - 6)).map((scene) => scene.sceneId);
    historicalScenesExpanded.value = false;
  } else {
    latestSceneIds.value = latestSceneIds.value.filter((id) => sceneIds.has(id));
  }
  lastSceneCount.value = sl.scenes.length;
});

const latestScenes = computed(() => {
  const scenes = sceneList.value?.scenes ?? [];
  const latestIds = new Set(latestSceneIds.value);
  return scenes.filter((scene) => latestIds.has(scene.sceneId));
});
const historicalScenes = computed(() => {
  const scenes = sceneList.value?.scenes ?? [];
  const latestIds = new Set(latestSceneIds.value);
  return scenes.filter((scene) => !latestIds.has(scene.sceneId));
});

const STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '默认' },
  { value: 'cinematic', label: '写实电影' },
  { value: 'anime', label: '二次元' },
  { value: 'manga-bw', label: '黑白漫画' },
  { value: 'ink-wash', label: '水墨' },
  { value: 'oil', label: '厚涂油画' },
  { value: 'watercolor', label: '水彩' },
];
function shouldOverlayPanelText(panel: ComicPanel): boolean {
  return panel.textRenderMode !== 'embedded';
}
function bubblePlacementClass(placement?: string): string {
  return placement ? `mobile-comic-strip__bubble--${placement}` : 'mobile-comic-strip__bubble--bottom-right';
}
function inferLayoutTemplate(panels: ComicPanel[], pageIndex: number): string {
  if (panels.length <= 2) return 'mobile-3';
  if (pageIndex === 1) return 'hero-plus-2';
  return panels.some((p) => p.panelRole === 'reaction' || p.panelRole === 'reveal')
    ? 'reaction-strip'
    : 'mobile-3';
}

function isGeneratedScene(sceneId: string): boolean {
  return Boolean(manifest.value?.panels.some((panel) => panel.sceneId === sceneId));
}
</script>

<template>
  <div v-if="visible && comicEnabled" class="mobile-comic-strip">
      <div class="mobile-comic-strip__backdrop" @click="close" />
      <div class="mobile-comic-strip__panel">
      <header class="mobile-comic-strip__bar">
        <button type="button" class="mobile-comic-strip__back" @click="close">关闭</button>
        <span class="mobile-comic-strip__title">第 {{ chapterNumber }} 章 · 漫画版</span>
        <span class="mobile-comic-strip__spacer" />
      </header>

      <div class="mobile-comic-strip__body">
        <div v-if="loading || designing" class="mobile-comic-strip__state">
          {{ designing ? 'AI 设计漫画场景中（分析章节 + 专业分镜，约 1-2 分钟）…' : '加载中…' }}
        </div>
        <div v-else-if="error" class="mobile-comic-strip__state mobile-comic-strip__state--error">
          {{ error }}
        </div>

        <template v-else-if="viewMode === 'auto' && manifest && manifest.panels.length">
          <div class="mobile-comic-strip__pages">
            <section
              v-for="page in comicPages"
              :key="page.pageIndex"
              class="mobile-comic-strip__page"
              :class="`mobile-comic-strip__page--${page.layoutTemplate}`"
            >
              <div class="mobile-comic-strip__page-head">
                <span>第 {{ page.pageIndex }} 页</span>
                <small>{{ page.layoutTemplate }}</small>
              </div>
              <div class="mobile-comic-strip__page-grid">
                <figure
                  v-for="panel in page.panels"
                  :id="`comic-panel-${panel.panelIndex}`"
                  :key="panel.panelIndex"
                  class="mobile-comic-strip__cell"
                  :class="[
                    `mobile-comic-strip__cell--role-${panel.panelRole || 'panel'}`,
                    { 'mobile-comic-strip__cell--hero': panel.panelIndexInPage === 1 && page.layoutTemplate === 'hero-plus-2' },
                  ]"
                >
                  <div class="mobile-comic-strip__cell-image">
                    <img
                      v-if="panel.imagePath"
                      :src="panelBlobs[panel.panelIndex] || panelUrl(panel.imagePath)"
                      :alt="`第 ${panel.panelIndex} 格`"
                      loading="lazy"
                    />
                    <figcaption v-else class="mobile-comic-strip__failed">
                      <strong>生成失败</strong>
                      <span>{{ panel.failed || '图像服务没有返回有效图片' }}</span>
                      <button
                        type="button"
                        class="mobile-comic-strip__retry-mini"
                        :disabled="regeneratingPanelIndexes.has(panel.panelIndex)"
                        :title="regeneratingPanelIndexes.has(panel.panelIndex) ? '重试中' : '再试一次'"
                        :aria-label="regeneratingPanelIndexes.has(panel.panelIndex) ? '重试中' : '再试一次'"
                        @click.stop="regeneratePanel(panel.panelIndex)"
                      >
                        <el-icon :size="14" :class="{ 'is-loading': regeneratingPanelIndexes.has(panel.panelIndex) }">
                          <RefreshRight />
                        </el-icon>
                        <span>{{ regeneratingPanelIndexes.has(panel.panelIndex) ? '重试中' : '再试一次' }}</span>
                      </button>
                    </figcaption>
                    <span v-if="panel.imagePath && shouldOverlayPanelText(panel) && panel.sfx" class="mobile-comic-strip__sfx">{{ panel.sfx }}</span>
                    <div
                      v-if="panel.imagePath && shouldOverlayPanelText(panel) && panel.dialogue"
                      class="mobile-comic-strip__bubble"
                      :class="bubblePlacementClass(panel.bubblePlacement)"
                    >
                      {{ panel.dialogue }}
                    </div>
                  </div>
                  <figcaption v-if="panel.narration" class="mobile-comic-strip__narration">{{ panel.narration }}</figcaption>
                  <div class="mobile-comic-strip__cell-actions">
                    <button
                      type="button"
                      class="mobile-comic-strip__icon-action"
                      :disabled="regeneratingPanelIndexes.has(panel.panelIndex)"
                      title="上移"
                      aria-label="上移"
                      @click="movePanelUp(panel.panelIndex)"
                    >
                      <el-icon :size="15"><ArrowUp /></el-icon>
                    </button>
                    <button
                      type="button"
                      class="mobile-comic-strip__icon-action"
                      :disabled="regeneratingPanelIndexes.has(panel.panelIndex)"
                      title="下移"
                      aria-label="下移"
                      @click="movePanelDown(panel.panelIndex)"
                    >
                      <el-icon :size="15"><ArrowDown /></el-icon>
                    </button>
                    <button
                      type="button"
                      class="mobile-comic-strip__icon-action"
                      :disabled="regeneratingPanelIndexes.has(panel.panelIndex)"
                      :title="panel.failed ? '再试一次' : '重生本格'"
                      :aria-label="panel.failed ? '再试一次' : '重生本格'"
                      @click="regeneratePanel(panel.panelIndex)"
                    >
                      <el-icon :size="15" :class="{ 'is-loading': regeneratingPanelIndexes.has(panel.panelIndex) }">
                        <RefreshRight />
                      </el-icon>
                    </button>
                    <button
                      type="button"
                      class="mobile-comic-strip__icon-action mobile-comic-strip__icon-action--danger"
                      title="删除"
                      aria-label="删除"
                      @click="removePanel(panel.panelIndex)"
                    >
                      <el-icon :size="15"><Delete /></el-icon>
                    </button>
                  </div>
                </figure>
              </div>
            </section>
          </div>
          <button
            v-if="sceneList && sceneList.scenes.length"
            type="button"
            class="mobile-comic-strip__action"
            @click="viewMode = 'scenes'"
          >
            重新选场景
          </button>
          <button
            type="button"
            class="mobile-comic-strip__action"
            :disabled="generating"
            @click="generate"
          >
            {{ generating ? '重新生成中（约 1-2 分钟）…' : '重新生成漫画' }}
          </button>
          <button
            v-if="manifest.status !== 'published'"
            type="button"
            class="mobile-comic-strip__action mobile-comic-strip__action--primary"
            :disabled="publishing"
            @click="publish"
          >
            {{ publishing ? '发布中…' : '发布（保留到书城）' }}
          </button>
          <p v-else class="mobile-comic-strip__published">✓ 已发布 · 书城读者可见，不会被定期清理</p>
        </template>

        <div v-else-if="sceneList && sceneList.scenes.length && (viewMode === 'scenes' || !manifest || !manifest.panels.length)" class="mobile-comic-strip__scenes">
          <div class="mobile-comic-strip__style-bar">
            <span class="mobile-comic-strip__style-label">画风</span>
            <button
              v-for="opt in STYLE_OPTIONS"
              :key="opt.value"
              type="button"
              class="mobile-comic-strip__style-chip"
              :class="{ 'mobile-comic-strip__style-chip--active': comicStyle === opt.value }"
              @click="setComicStyle(opt.value)"
            >{{ opt.label }}</button>
          </div>
          <p class="mobile-comic-strip__scenes-hint">
            最新候选 {{ latestScenes.length }} 个，历史候选 {{ historicalScenes.length }} 个。勾选满意的场景生成漫画。
          </p>

          <div class="mobile-comic-strip__scene-group">
            <div class="mobile-comic-strip__scene-group-title">最新一组</div>
            <MobileComicSceneCard
              v-for="scene in latestScenes"
              :key="scene.sceneId"
              :scene="scene"
              :selected="selectedSceneIds.includes(scene.sceneId)"
              :locked="isGeneratedScene(scene.sceneId)"
              @toggle="toggleScene"
              @remove="onRemoveScene"
            />
          </div>

          <div v-if="historicalScenes.length" class="mobile-comic-strip__scene-group">
            <button
              type="button"
              class="mobile-comic-strip__history-toggle"
              @click="historicalScenesExpanded = !historicalScenesExpanded"
            >
              {{ historicalScenesExpanded ? '收起历史候选' : `展开历史候选（${historicalScenes.length}）` }}
            </button>
            <template v-if="historicalScenesExpanded">
              <MobileComicSceneCard
                v-for="scene in historicalScenes"
                :key="scene.sceneId"
                :scene="scene"
                :selected="selectedSceneIds.includes(scene.sceneId)"
                :locked="isGeneratedScene(scene.sceneId)"
                historical
                @toggle="toggleScene"
                @remove="onRemoveScene"
              />
            </template>
          </div>
          <button
            type="button"
            class="mobile-comic-strip__action mobile-comic-strip__action--primary"
            :disabled="generating || selectedSceneIds.length === 0"
            @click="onGenerateSelected"
          >
            {{ generating ? '生成中（出图约 1-3 分钟）…' : `生成选中场景（${selectedSceneIds.length}）` }}
          </button>
          <button
            type="button"
            class="mobile-comic-strip__action"
            :disabled="designing"
            @click="design('append')"
          >
            {{ designing ? '生成更多候选中…' : '再来一组候选' }}
          </button>
          <button
            v-if="manifest && manifest.panels.length"
            type="button"
            class="mobile-comic-strip__action"
            @click="viewMode = 'auto'"
          >
            查看已生成漫画
          </button>
        </div>

        <div v-else class="mobile-comic-strip__empty">
          <p class="mobile-comic-strip__empty-title">本章还没有漫画场景</p>
          <p class="mobile-comic-strip__empty-desc">
            点击下方按钮，AI 漫画分镜师将分析章节、用专业分镜知识设计候选场景供你勾选。
          </p>
          <button
            type="button"
            class="mobile-comic-strip__action mobile-comic-strip__action--primary"
            :disabled="designing"
            @click="design()"
          >
            {{ designing ? '设计中（AI 分析章节，约 1-2 分钟）…' : '设计漫画场景' }}
          </button>
        </div>
      </div>
      </div>
    </div>
</template>

<style scoped>
.mobile-comic-strip {
  position: fixed;
  inset: 0;
  z-index: 2000;
}

.mobile-comic-strip__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
}

.mobile-comic-strip__panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 92dvh;
  background: var(--nw-bg-secondary);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.12);
  --nw-accent: var(--mobile-focus-accent, #3b82f6);
}

.mobile-comic-strip__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--nw-border);
  flex-shrink: 0;
}
.mobile-comic-strip__back {
  border: none;
  background: transparent;
  color: var(--nw-accent);
  font-size: 14px;
  padding: 6px 4px;
  cursor: pointer;
}
.mobile-comic-strip__title {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
}
.mobile-comic-strip__spacer {
  flex: 1;
}

.mobile-comic-strip__body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px 16px 32px;
}

.mobile-comic-strip__state {
  text-align: center;
  color: var(--nw-text-secondary);
  padding: 48px 16px;
}
.mobile-comic-strip__state--error {
  color: var(--nw-danger);
}

.mobile-comic-strip__pages {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 560px;
  margin: 0 auto;
}
.mobile-comic-strip__page {
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-border);
  border-radius: 14px;
  padding: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}
.mobile-comic-strip__page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 10px;
  color: var(--nw-text-secondary);
  font-size: 12px;
}
.mobile-comic-strip__page-head span {
  color: var(--nw-text-primary);
  font-weight: 700;
}
.mobile-comic-strip__page-head small {
  color: var(--nw-text-secondary);
  font-size: 11px;
}
.mobile-comic-strip__page-grid {
  display: grid;
  gap: 8px;
}
.mobile-comic-strip__page--hero-plus-2 .mobile-comic-strip__page-grid {
  grid-template-columns: 1fr 1fr;
}
.mobile-comic-strip__page--hero-plus-2 .mobile-comic-strip__cell--hero {
  grid-column: 1 / -1;
}
.mobile-comic-strip__page--reaction-strip .mobile-comic-strip__page-grid,
.mobile-comic-strip__page--mobile-3 .mobile-comic-strip__page-grid {
  grid-template-columns: 1fr;
}
.mobile-comic-strip__page--cinematic-wide .mobile-comic-strip__page-grid {
  grid-template-columns: 1fr 1fr;
}
.mobile-comic-strip__page--cinematic-wide .mobile-comic-strip__cell:first-child {
  grid-column: 1 / -1;
}
.mobile-comic-strip__cell {
  margin: 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--nw-bg-secondary);
  border: 2px solid var(--nw-text-primary);
  position: relative;
}
.mobile-comic-strip__cell-image {
  position: relative;
  min-height: 160px;
  background: color-mix(in srgb, var(--nw-text-primary) 10%, var(--nw-bg-secondary));
}
.mobile-comic-strip__cell img {
  display: block;
  width: 100%;
  height: auto;
}
.mobile-comic-strip__page--hero-plus-2 .mobile-comic-strip__cell--hero img {
  aspect-ratio: 16 / 10;
  object-fit: cover;
}
.mobile-comic-strip__page--hero-plus-2 .mobile-comic-strip__cell:not(.mobile-comic-strip__cell--hero) img {
  aspect-ratio: 1 / 1;
  object-fit: cover;
}
.mobile-comic-strip__page--reaction-strip .mobile-comic-strip__cell img,
.mobile-comic-strip__page--mobile-3 .mobile-comic-strip__cell img {
  aspect-ratio: 16 / 9;
  object-fit: cover;
}
.mobile-comic-strip__page--cinematic-wide .mobile-comic-strip__cell img {
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.mobile-comic-strip__page--cinematic-wide .mobile-comic-strip__cell:first-child img {
  aspect-ratio: 18 / 9;
}
.mobile-comic-strip__sfx {
  position: absolute;
  right: 12px;
  top: 14px;
  color: #ffffff;
  font-size: 30px;
  font-weight: 900;
  text-shadow: 0 3px 0 var(--nw-text-primary), 0 5px 16px rgba(0, 0, 0, 0.4);
  transform: rotate(-10deg);
  pointer-events: none;
}
.mobile-comic-strip__cell-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--nw-text-primary) 5%, var(--nw-bg-secondary));
  border-top: 1px solid var(--nw-border);
}
.mobile-comic-strip__cell-actions button {
  padding: 0;
  border: 1px solid var(--nw-border);
  border-radius: 6px;
  background: var(--nw-bg-secondary);
  color: var(--nw-text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.mobile-comic-strip__icon-action {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 34px;
}
.mobile-comic-strip__icon-action--danger {
  color: var(--nw-danger);
  border-color: color-mix(in srgb, var(--nw-danger) 40%, var(--nw-border));
}
.mobile-comic-strip__cell-actions button:hover {
  background: color-mix(in srgb, var(--nw-text-primary) 6%, var(--nw-bg-secondary));
}
.mobile-comic-strip__cell-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.mobile-comic-strip__failed {
  min-height: 188px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 18px;
  text-align: left;
  color: var(--nw-danger);
  font-size: 13px;
  line-height: 1.5;
}
.mobile-comic-strip__failed strong {
  color: var(--nw-danger);
  font-size: 15px;
}
.mobile-comic-strip__failed span {
  width: 100%;
  max-width: 320px;
  color: var(--nw-danger);
  opacity: 0.85;
  text-align: center;
  word-break: break-word;
}
.mobile-comic-strip__failed button {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--nw-danger) 40%, var(--nw-border));
  border-radius: 8px;
  background: var(--nw-bg-secondary);
  color: var(--nw-danger);
  font-size: 13px;
  cursor: pointer;
}
.mobile-comic-strip__failed button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.mobile-comic-strip__retry-mini span {
  font-size: 12px;
  line-height: 1;
}
.mobile-comic-strip .is-loading {
  animation: mobile-comic-spin 1s linear infinite;
}
@keyframes mobile-comic-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.mobile-comic-strip__degraded {
  padding: 8px 14px;
  text-align: center;
  color: var(--nw-text-secondary);
  background: color-mix(in srgb, var(--nw-warning, #e6a23c) 12%, transparent);
  font-size: 12px;
  border-top: 1px solid var(--nw-border);
}
.mobile-comic-strip__bubble {
  position: absolute;
  max-width: min(72%, 260px);
  padding: 8px 12px;
  background: var(--nw-bg-secondary);
  border: 2px solid var(--nw-text-primary);
  border-radius: 16px;
  color: var(--nw-text-primary);
  font-size: 14px;
  line-height: 1.55;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}
.mobile-comic-strip__bubble::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 22px;
  width: 14px;
  height: 14px;
  background: var(--nw-bg-secondary);
  border-right: 2px solid var(--nw-text-primary);
  border-bottom: 2px solid var(--nw-text-primary);
  transform: rotate(45deg);
}
.mobile-comic-strip__bubble--top-left {
  left: 12px;
  top: 12px;
}
.mobile-comic-strip__bubble--top-right {
  right: 12px;
  top: 12px;
}
.mobile-comic-strip__bubble--middle-left {
  left: 12px;
  top: 42%;
}
.mobile-comic-strip__bubble--middle-right {
  right: 12px;
  top: 42%;
}
.mobile-comic-strip__bubble--bottom-left {
  left: 12px;
  bottom: 12px;
}
.mobile-comic-strip__bubble--bottom-right {
  right: 12px;
  bottom: 12px;
}
.mobile-comic-strip__narration {
  padding: 7px 10px;
  color: var(--nw-text-primary);
  background: var(--nw-bg-secondary);
  border-top: 1px solid var(--nw-text-primary);
  font-size: 12px;
  line-height: 1.5;
  font-weight: 600;
}

.mobile-comic-strip__empty {
  text-align: center;
  padding: 48px 20px;
  max-width: 420px;
  margin: 0 auto;
}
.mobile-comic-strip__empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin: 0 0 8px;
}
.mobile-comic-strip__empty-desc {
  font-size: 13px;
  color: var(--nw-text-secondary);
  line-height: 1.6;
  margin: 0 0 20px;
}

.mobile-comic-strip__action {
  display: block;
  width: 100%;
  max-width: 320px;
  margin: 16px auto 0;
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-secondary);
  color: var(--nw-text-primary);
  font-size: 14px;
  cursor: pointer;
}
.mobile-comic-strip__action--primary {
  background: var(--nw-accent);
  border-color: var(--nw-accent);
  color: #fff;
}
.mobile-comic-strip__action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.mobile-comic-strip__published {
  text-align: center;
  color: var(--nw-success, #67c23a);
  font-size: 13px;
  margin-top: 10px;
}
.mobile-comic-strip__style-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--nw-text-primary) 5%, var(--nw-bg-secondary));
  border-radius: 12px;
}
.mobile-comic-strip__style-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-secondary);
  margin-right: 4px;
}
.mobile-comic-strip__style-chip {
  padding: 5px 12px;
  border: 1px solid var(--nw-border);
  border-radius: 20px;
  background: var(--nw-bg-secondary);
  color: var(--nw-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.mobile-comic-strip__style-chip--active {
  background: var(--nw-accent);
  border-color: var(--nw-accent);
  color: #ffffff;
}
.mobile-comic-strip__scenes-hint {
  font-size: 13px;
  color: var(--nw-text-secondary);
  text-align: center;
  margin: 0 0 16px;
}

.mobile-comic-strip__scene-group {
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
}

.mobile-comic-strip__scene-group-title {
  margin: 0 0 8px;
  color: var(--nw-text-primary);
  font-size: 13px;
  font-weight: 700;
}

.mobile-comic-strip__history-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 38px;
  font-size: 12px;
  font-weight: 600;
  color: var(--nw-text-secondary);
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-border);
  border-radius: 10px;
  cursor: pointer;
  margin-bottom: 12px;
}
</style>
