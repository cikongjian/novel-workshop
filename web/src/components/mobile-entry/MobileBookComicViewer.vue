<script setup lang="ts">
import { computed } from 'vue';
import { CloseBold } from '@element-plus/icons-vue';
import {
  bookStorePublicComicPanelUrl,
  type BookStorePublicComicManifest,
  type BookStorePublicComicPanel,
} from '../../api/bookstore';

const props = defineProps<{
  visible: boolean;
  bookId: string;
  manifest: BookStorePublicComicManifest | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

type ComicPageView = {
  pageIndex: number;
  layoutTemplate: string;
  panels: BookStorePublicComicPanel[];
};

const comicPages = computed<ComicPageView[]>(() => {
  const panels = props.manifest?.panels ?? [];
  const sorted = [...panels].sort((a, b) => {
    const ap = a.pageIndex ?? Math.ceil(a.panelIndex / 3);
    const bp = b.pageIndex ?? Math.ceil(b.panelIndex / 3);
    if (ap !== bp) return ap - bp;
    const ai = a.panelIndexInPage ?? (((a.panelIndex - 1) % 3) + 1);
    const bi = b.panelIndexInPage ?? (((b.panelIndex - 1) % 3) + 1);
    if (ai !== bi) return ai - bi;
    return a.panelIndex - b.panelIndex;
  });
  const groups = new Map<number, BookStorePublicComicPanel[]>();
  for (const panel of sorted) {
    const pageIndex = panel.pageIndex ?? Math.ceil(panel.panelIndex / 3);
    const list = groups.get(pageIndex) ?? [];
    list.push(panel);
    groups.set(pageIndex, list);
  }
  return [...groups.entries()].map(([pageIndex, pagePanels]) => ({
    pageIndex,
    layoutTemplate: pagePanels.find((panel) => panel.layoutTemplate)?.layoutTemplate ?? inferLayoutTemplate(pagePanels, pageIndex),
    panels: pagePanels,
  }));
});

function close(): void {
  emit('update:visible', false);
}

function panelUrl(panel: BookStorePublicComicPanel): string {
  return bookStorePublicComicPanelUrl(props.bookId, props.manifest?.chapterNumber ?? 0, panel.imagePath);
}

function shouldOverlayPanelText(panel: BookStorePublicComicPanel): boolean {
  return panel.textRenderMode !== 'embedded';
}

function bubblePlacementClass(placement?: string): string {
  return placement ? `mobile-book-comic-viewer__bubble--${placement}` : 'mobile-book-comic-viewer__bubble--bottom-right';
}

function inferLayoutTemplate(panels: BookStorePublicComicPanel[], pageIndex: number): string {
  if (panels.length <= 2) return 'mobile-3';
  if (pageIndex === 1) return 'hero-plus-2';
  return panels.some((panel) => panel.panelRole === 'reaction' || panel.panelRole === 'reveal')
    ? 'reaction-strip'
    : 'mobile-3';
}
</script>

<template>
  <div v-if="visible && manifest" class="mobile-book-comic-viewer">
    <div class="mobile-book-comic-viewer__backdrop" @click="close" />
    <section class="mobile-book-comic-viewer__sheet">
      <header class="mobile-book-comic-viewer__bar">
        <div>
          <span>第 {{ manifest.chapterNumber }} 章漫画版</span>
          <small>{{ manifest.panels.length }} 格</small>
        </div>
        <button type="button" class="mobile-book-comic-viewer__close" aria-label="关闭漫画版" @click="close">
          <el-icon :size="16"><CloseBold /></el-icon>
        </button>
      </header>

      <div class="mobile-book-comic-viewer__body">
        <section
          v-for="page in comicPages"
          :key="page.pageIndex"
          class="mobile-book-comic-viewer__page"
          :class="`mobile-book-comic-viewer__page--${page.layoutTemplate}`"
        >
          <div class="mobile-book-comic-viewer__page-head">
            <span>第 {{ page.pageIndex }} 页</span>
          </div>
          <div class="mobile-book-comic-viewer__page-grid">
            <figure
              v-for="panel in page.panels"
              :key="panel.panelIndex"
              class="mobile-book-comic-viewer__cell"
              :class="{ 'mobile-book-comic-viewer__cell--hero': panel.panelIndexInPage === 1 && page.layoutTemplate === 'hero-plus-2' }"
            >
              <div class="mobile-book-comic-viewer__image">
                <img :src="panelUrl(panel)" :alt="`第 ${panel.panelIndex} 格`" loading="lazy" />
                <span v-if="shouldOverlayPanelText(panel) && panel.sfx" class="mobile-book-comic-viewer__sfx">{{ panel.sfx }}</span>
                <div
                  v-if="shouldOverlayPanelText(panel) && panel.dialogue"
                  class="mobile-book-comic-viewer__bubble"
                  :class="bubblePlacementClass(panel.bubblePlacement)"
                >
                  {{ panel.dialogue }}
                </div>
              </div>
              <figcaption v-if="panel.narration" class="mobile-book-comic-viewer__narration">
                {{ panel.narration }}
              </figcaption>
            </figure>
          </div>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.mobile-book-comic-viewer {
  position: fixed;
  inset: 0;
  z-index: 46;
}

.mobile-book-comic-viewer__backdrop {
  position: fixed;
  inset: 0;
  background: var(--reader-overlay-bg, rgba(6, 14, 28, 0.54));
}

.mobile-book-comic-viewer__sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 94dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--reader-line-color);
  border-radius: var(--nw-radius-xl) var(--nw-radius-xl) 0 0;
  background: var(--reader-paper-background);
  color: var(--reader-text-color);
  box-shadow: 0 -20px 48px rgba(15, 23, 42, 0.22);
}

.mobile-book-comic-viewer__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--reader-line-color);
}

.mobile-book-comic-viewer__bar div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.mobile-book-comic-viewer__bar span {
  color: var(--reader-text-color);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.25;
}

.mobile-book-comic-viewer__bar small,
.mobile-book-comic-viewer__page-head {
  color: var(--reader-muted-color);
  font-size: 11px;
}

.mobile-book-comic-viewer__close {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  border: 0;
  border-radius: var(--nw-radius-md);
  background: color-mix(in srgb, var(--reader-text-color) 8%, transparent);
  color: var(--reader-text-color);
}

.mobile-book-comic-viewer__body {
  flex: 1;
  overflow: auto;
  display: grid;
  gap: 18px;
  padding: 14px 12px calc(env(safe-area-inset-bottom, 0px) + 18px);
}

.mobile-book-comic-viewer__page {
  width: min(100%, 560px);
  margin: 0 auto;
  padding: 10px;
  border: 1px solid var(--reader-line-color);
  border-radius: var(--nw-radius-lg);
  background: color-mix(in srgb, var(--reader-paper-background) 92%, var(--reader-text-color) 8%);
}

.mobile-book-comic-viewer__page-head {
  display: flex;
  justify-content: space-between;
  padding: 0 2px 10px;
}

.mobile-book-comic-viewer__page-grid {
  display: grid;
  gap: 8px;
}

.mobile-book-comic-viewer__page--hero-plus-2 .mobile-book-comic-viewer__page-grid,
.mobile-book-comic-viewer__page--cinematic-wide .mobile-book-comic-viewer__page-grid {
  grid-template-columns: 1fr 1fr;
}

.mobile-book-comic-viewer__page--hero-plus-2 .mobile-book-comic-viewer__cell--hero,
.mobile-book-comic-viewer__page--cinematic-wide .mobile-book-comic-viewer__cell:first-child {
  grid-column: 1 / -1;
}

.mobile-book-comic-viewer__page--reaction-strip .mobile-book-comic-viewer__page-grid,
.mobile-book-comic-viewer__page--mobile-3 .mobile-book-comic-viewer__page-grid {
  grid-template-columns: 1fr;
}

.mobile-book-comic-viewer__cell {
  margin: 0;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, var(--reader-text-color) 86%, transparent);
  border-radius: var(--nw-radius-sm);
  background: color-mix(in srgb, var(--reader-text-color) 8%, transparent);
}

.mobile-book-comic-viewer__image {
  position: relative;
  min-height: 160px;
}

.mobile-book-comic-viewer__image img {
  display: block;
  width: 100%;
  height: auto;
}

.mobile-book-comic-viewer__page--hero-plus-2 .mobile-book-comic-viewer__cell--hero img {
  aspect-ratio: 16 / 10;
  object-fit: cover;
}

.mobile-book-comic-viewer__page--hero-plus-2 .mobile-book-comic-viewer__cell:not(.mobile-book-comic-viewer__cell--hero) img {
  aspect-ratio: 1 / 1;
  object-fit: cover;
}

.mobile-book-comic-viewer__page--reaction-strip .mobile-book-comic-viewer__cell img,
.mobile-book-comic-viewer__page--mobile-3 .mobile-book-comic-viewer__cell img {
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.mobile-book-comic-viewer__page--cinematic-wide .mobile-book-comic-viewer__cell img {
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.mobile-book-comic-viewer__page--cinematic-wide .mobile-book-comic-viewer__cell:first-child img {
  aspect-ratio: 18 / 9;
}

.mobile-book-comic-viewer__narration {
  padding: 7px 10px;
  border-top: 1px solid color-mix(in srgb, var(--reader-text-color) 70%, transparent);
  background: var(--reader-paper-background);
  color: var(--reader-text-color);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
}

.mobile-book-comic-viewer__sfx {
  position: absolute;
  top: 14px;
  right: 12px;
  color: var(--mobile-focus-on-accent);
  font-size: 28px;
  font-weight: 900;
  text-shadow:
    0 3px 0 color-mix(in srgb, var(--reader-text-color) 90%, transparent),
    0 5px 16px rgba(0, 0, 0, 0.36);
  transform: rotate(-10deg);
  pointer-events: none;
}

.mobile-book-comic-viewer__bubble {
  position: absolute;
  max-width: min(72%, 260px);
  padding: 8px 12px;
  border: 2px solid color-mix(in srgb, var(--reader-text-color) 86%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--reader-paper-background) 96%, white 4%);
  color: var(--reader-text-color);
  font-size: 14px;
  line-height: 1.55;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.mobile-book-comic-viewer__bubble::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 22px;
  width: 14px;
  height: 14px;
  border-right: 2px solid color-mix(in srgb, var(--reader-text-color) 86%, transparent);
  border-bottom: 2px solid color-mix(in srgb, var(--reader-text-color) 86%, transparent);
  background: color-mix(in srgb, var(--reader-paper-background) 96%, white 4%);
  transform: rotate(45deg);
}

.mobile-book-comic-viewer__bubble--top-left {
  left: 12px;
  top: 12px;
}

.mobile-book-comic-viewer__bubble--top-right {
  right: 12px;
  top: 12px;
}

.mobile-book-comic-viewer__bubble--middle-left {
  left: 12px;
  top: 42%;
}

.mobile-book-comic-viewer__bubble--middle-right {
  right: 12px;
  top: 42%;
}

.mobile-book-comic-viewer__bubble--bottom-left {
  left: 12px;
  bottom: 12px;
}

.mobile-book-comic-viewer__bubble--bottom-right {
  right: 12px;
  bottom: 12px;
}
</style>
