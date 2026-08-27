<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Reading, RefreshRight } from '@element-plus/icons-vue';
import { fetchChapter } from '../../api/chapters';
import { CHAPTER_STATUS_LABELS, type Chapter, type ChapterSummary } from '../../types';
import { renderSummaryMarkdown } from '../../utils/summary-markdown';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  novelTitle?: string;
  chapterSummary: ChapterSummary | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'open-reader': [chapterNumber: number];
  'rewrite-chapter': [chapterNumber: number];
  'polish-chapter': [chapterNumber: number];
}>();

const loading = ref(false);
const chapterDetail = ref<Chapter | null>(null);
const loadFailed = ref(false);
const loadedKey = ref('');

const chapterNumber = computed(() => props.chapterSummary?.chapterNumber ?? null);
const summaryHtml = computed(() => {
  const summary = props.chapterSummary?.summary?.trim() ?? '';
  if (!summary) return '';
  return renderSummaryMarkdown(normalizeSummaryForPreview(summary));
});
const excerptParagraphs = computed(() => {
  const content = chapterDetail.value?.content?.trim() ?? '';
  return content
    .split(/\r?\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
});
const hasMoreContent = computed(() => {
  const content = chapterDetail.value?.content?.trim() ?? '';
  return excerptParagraphs.value.length > 0 && content.length > excerptParagraphs.value.join('').length;
});

function formatChapterStatus(status?: ChapterSummary['status']): string {
  if (!status) return '--';
  return CHAPTER_STATUS_LABELS[status] ?? status;
}

function normalizeSummaryForPreview(summary: string): string {
  return summary
    .replace(/\s+(#{1,6})\s+/g, '\n\n$1 ')
    .trim();
}

async function loadChapterDetail() {
  if (!props.visible || !props.novelId || chapterNumber.value == null) return;
  const key = `${props.novelId}:${chapterNumber.value}`;
  if (loadedKey.value === key) return;

  loading.value = true;
  loadFailed.value = false;
  try {
    chapterDetail.value = await fetchChapter(props.novelId, chapterNumber.value);
    loadedKey.value = key;
  } catch {
    chapterDetail.value = null;
    loadFailed.value = true;
    loadedKey.value = '';
  } finally {
    loading.value = false;
  }
}

function handleOpenReader() {
  if (chapterNumber.value == null) return;
  emit('open-reader', chapterNumber.value);
  emit('update:visible', false);
}

function handleRewriteChapter() {
  if (chapterNumber.value == null) return;
  emit('rewrite-chapter', chapterNumber.value);
  emit('update:visible', false);
}

function handlePolishChapter() {
  if (chapterNumber.value == null) return;
  emit('polish-chapter', chapterNumber.value);
  emit('update:visible', false);
}

watch(
  () => [props.visible, props.novelId, chapterNumber.value] as const,
  () => {
    void loadChapterDetail();
  },
  { immediate: true },
);

watch(
  () => props.visible,
  (value) => {
    if (!value) {
      chapterDetail.value = null;
      loadFailed.value = false;
      loadedKey.value = '';
    }
  },
);

watch(
  () => props.chapterSummary?.updatedAt,
  () => {
    loadedKey.value = '';
    if (props.visible) {
      void loadChapterDetail();
    }
  },
);
</script>

<template>
  <el-drawer
    class="mobile-chapter-preview-drawer mobile-focus-light-vars"
    :model-value="props.visible"
    size="92%"
    direction="btt"
    @update:model-value="(value: boolean) => emit('update:visible', value)"
  >
    <template #header>
      <div class="mobile-chapter-preview-header">
        <p class="star-brand-kicker">章节预览</p>
        <strong>
          第 {{ props.chapterSummary?.chapterNumber || '--' }} 章 · {{ props.chapterSummary?.title || '章节预览' }}
        </strong>
        <span>{{ props.novelTitle || '当前作品' }}</span>
      </div>
    </template>

    <div class="mobile-chapter-preview-body">
      <div class="mobile-chapter-preview-meta">
        <span>{{ formatChapterStatus(props.chapterSummary?.status) }}</span>
        <span>{{ (props.chapterSummary?.wordCount || 0).toLocaleString() }} 字</span>
        <span v-if="props.chapterSummary?.readerScore">评分 {{ props.chapterSummary.readerScore }}</span>
      </div>

      <section class="mobile-chapter-preview-section mobile-chapter-preview-section--summary">
        <h3>本章看点</h3>
        <div
          v-if="summaryHtml"
          class="mobile-chapter-preview-summary"
          v-html="summaryHtml"
        ></div>
        <p v-else>这一章的核心信息还在沉淀，先从正文开篇进入状态。</p>
      </section>

      <section class="mobile-chapter-preview-section mobile-chapter-preview-section--content">
        <div class="mobile-chapter-preview-section__heading">
          <h3>正文试读</h3>
          <span v-if="loading">加载中</span>
        </div>

        <div v-if="loading" class="mobile-chapter-preview-loading">
          <el-skeleton animated :rows="6" />
        </div>

        <div v-else-if="excerptParagraphs.length" class="mobile-chapter-preview-content">
          <p v-for="(paragraph, index) in excerptParagraphs" :key="`${props.chapterSummary?.chapterNumber}-${index}`">
            {{ paragraph }}
          </p>
          <span v-if="hasMoreContent" class="mobile-chapter-preview-hint">后续正文已准备好。</span>
        </div>

        <div v-else-if="loadFailed" class="mobile-chapter-preview-empty">
          <strong>正文暂时没有载入</strong>
          <p>当前网络状态可能不稳定，稍后回来会更完整。</p>
        </div>

        <div v-else class="mobile-chapter-preview-empty">
          <strong>正文还未就绪</strong>
          <p>章节信息已保留，后续生成完成后会出现在这里。</p>
        </div>
      </section>

      <div class="mobile-chapter-preview-actions">
        <button class="mobile-chapter-preview-secondary" type="button" @click="handlePolishChapter">
          <el-icon :size="16"><RefreshRight /></el-icon>
          润色本章
        </button>
        <button class="mobile-chapter-preview-secondary" type="button" @click="handleRewriteChapter">
          <el-icon :size="16"><RefreshRight /></el-icon>
          重新生成
        </button>
        <button class="mobile-chapter-preview-primary" type="button" @click="handleOpenReader">
          <el-icon :size="16"><Reading /></el-icon>
          进入阅读页
        </button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
:global(.mobile-chapter-preview-drawer) {
  --chapter-preview-ink: var(--nw-text-primary);
  --chapter-preview-muted: var(--nw-text-muted);
  --chapter-preview-soft: color-mix(in srgb, var(--mobile-focus-status-gold) 6%, var(--nw-bg-primary));
  --chapter-preview-paper: color-mix(in srgb, var(--mobile-focus-status-gold) 7%, var(--nw-bg-secondary));
  --chapter-preview-line: color-mix(in srgb, var(--mobile-focus-status-gold) 22%, var(--nw-border));
  --chapter-preview-accent: var(--mobile-focus-status-gold);
  color-scheme: light;
  overflow: hidden;
  border-radius: 24px 24px 0 0;
  background:
    linear-gradient(180deg, var(--nw-bg-secondary), var(--chapter-preview-soft));
  color: var(--chapter-preview-ink);
}

:global(.mobile-chapter-preview-drawer .el-drawer__header) {
  align-items: flex-start;
  margin-bottom: 0;
  padding: 28px 30px 14px;
}

:global(.mobile-chapter-preview-drawer .el-drawer__body) {
  padding: 0 30px 30px;
  overflow-y: auto;
  background: transparent;
}

.mobile-chapter-preview-header,
.mobile-chapter-preview-body,
.mobile-chapter-preview-section {
  display: grid;
  gap: 10px;
}

.mobile-chapter-preview-header {
  width: min(100%, 620px);
}

.mobile-chapter-preview-header strong {
  font-size: 24px;
  line-height: 1.35;
  color: var(--chapter-preview-ink);
}

.mobile-chapter-preview-header span,
.mobile-chapter-preview-meta span,
.mobile-chapter-preview-section__heading span,
.mobile-chapter-preview-hint {
  font-size: 12px;
  color: var(--chapter-preview-muted);
}

.mobile-chapter-preview-body {
  gap: 14px;
}

.mobile-chapter-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.mobile-chapter-preview-meta span {
  padding: 8px 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nw-border) 36%, var(--nw-bg-secondary));
  color: var(--chapter-preview-muted);
  font-weight: 700;
}

.mobile-chapter-preview-section {
  padding: 18px;
  border-radius: 8px;
  border: 1px solid var(--chapter-preview-line);
  background: color-mix(in srgb, var(--nw-bg-secondary) 82%, transparent);
  box-shadow: 0 18px 42px color-mix(in srgb, var(--nw-text-primary) 8%, transparent);
}

.mobile-chapter-preview-section--summary {
  background:
    linear-gradient(180deg, var(--chapter-preview-paper), color-mix(in srgb, var(--chapter-preview-paper) 92%, var(--chapter-preview-soft)));
}

.mobile-chapter-preview-section--content {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--nw-bg-secondary) 96%, var(--chapter-preview-paper)), var(--chapter-preview-paper));
}

.mobile-chapter-preview-section h3,
.mobile-chapter-preview-empty strong {
  margin: 0;
  font-size: 16px;
  color: var(--chapter-preview-ink);
}

.mobile-chapter-preview-section p,
.mobile-chapter-preview-empty p {
  margin: 0;
  color: var(--nw-text-secondary);
  font-size: 14px;
  line-height: 1.8;
}

.mobile-chapter-preview-section__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mobile-chapter-preview-content {
  display: grid;
  gap: 16px;
  padding: 8px 2px 0;
}

.mobile-chapter-preview-content p {
  font-family: "Noto Serif SC", "Songti SC", "SimSun", serif;
  font-size: 17px;
  line-height: 2;
  color: var(--nw-text-primary);
  text-align: justify;
}

.mobile-chapter-preview-summary {
  display: grid;
  gap: 10px;
  max-height: 300px;
  overflow: auto;
  padding-right: 4px;
}

.mobile-chapter-preview-summary :deep(h1),
.mobile-chapter-preview-summary :deep(h2),
.mobile-chapter-preview-summary :deep(h3),
.mobile-chapter-preview-summary :deep(h4),
.mobile-chapter-preview-summary :deep(h5),
.mobile-chapter-preview-summary :deep(h6) {
  margin: 8px 0 2px;
  color: var(--nw-text-primary);
  font-size: 15px;
  line-height: 1.5;
}

.mobile-chapter-preview-summary :deep(p),
.mobile-chapter-preview-summary :deep(li),
.mobile-chapter-preview-summary :deep(blockquote) {
  color: var(--nw-text-secondary);
  font-size: 14px;
  line-height: 1.85;
}

.mobile-chapter-preview-summary :deep(p) {
  margin: 0;
}

.mobile-chapter-preview-summary :deep(ul),
.mobile-chapter-preview-summary :deep(ol) {
  margin: 0;
  padding-left: 18px;
}

.mobile-chapter-preview-summary :deep(li + li) {
  margin-top: 6px;
}

.mobile-chapter-preview-summary :deep(strong) {
  color: var(--nw-text-primary);
}

.mobile-chapter-preview-summary :deep(blockquote) {
  margin: 0;
  padding: 10px 12px;
  border-left: 3px solid var(--chapter-preview-accent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--chapter-preview-accent) 10%, var(--nw-bg-secondary));
}

.mobile-chapter-preview-summary :deep(code) {
  padding: 1px 5px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--nw-text-primary) 7%, var(--nw-bg-secondary));
  color: var(--nw-text-primary);
}

.mobile-chapter-preview-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  position: sticky;
  bottom: -30px;
  z-index: 2;
  padding: 12px 0 0;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--chapter-preview-soft) 98%, transparent) 28%);
}

.mobile-chapter-preview-primary,
.mobile-chapter-preview-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.mobile-chapter-preview-primary {
  border: none;
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent);
}

.mobile-chapter-preview-secondary {
  border: 1px solid var(--chapter-preview-line);
  background: color-mix(in srgb, var(--nw-bg-secondary) 90%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 76%, var(--nw-text-primary));
}

@media (max-width: 520px) {
  :global(.mobile-chapter-preview-drawer .el-drawer__header) {
    padding: 26px 24px 12px;
  }

  :global(.mobile-chapter-preview-drawer .el-drawer__body) {
    padding: 0 24px 24px;
  }

  .mobile-chapter-preview-header strong {
    font-size: 22px;
  }

  .mobile-chapter-preview-actions {
    grid-template-columns: 1fr;
    bottom: -24px;
  }
}
</style>
