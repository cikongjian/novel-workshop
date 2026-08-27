<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  favoriteBook,
  getBookFavoriteStatus,
  getBookLikeStatus,
  getBookStoreDetail,
  getBookComments,
  getBookStorePublicChapterContent,
  getBookStorePublicChapters,
  getBookStorePublicComic,
  bookStorePublicComicPanelUrl,
  likeBook,
  createBookComment,
  type BookStorePublicChapter,
  type BookStorePublicChapterContent,
  type BookStorePublicComicManifest,
} from '../../api/bookstore';
import { checkFork, createFork } from '../../api/forks';
import { streamTTSSynthesize, type TTSStreamSegment } from '../../api/tts';
import type { BookStore, BookStoreComment } from '../../api/types';
import { extractApiErrorMessage } from '../../api/errors';
import { resolveCoverSrc } from '../../utils/deploy-path';
import Icon from '../../components/shared/Icon.vue';
import Modal from '../../components/shared/Modal.vue';
import StateView from '../../components/shared/StateView.vue';
import DesktopSideStoryPlaza from '../components/DesktopSideStoryPlaza.vue';
import DesktopPlotVotePanel from '../components/DesktopPlotVotePanel.vue';

interface ReaderPayload {
  detail: BookStore;
  chapters: BookStorePublicChapter[];
}

type ReaderTheme = 'dark' | 'light' | 'paper';
type TtsStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'done' | 'error';

const DESKTOP_READER_PROGRESS_KEY = 'desktop_reader_progress_v1';

const route = useRoute();
const router = useRouter();
const bookId = computed(() => String(route.params.id || ''));
const routeChapterNumber = computed(() => Number(route.params.chapterNumber || 1));

const loading = ref(true);
const chapterLoading = ref(false);
const error = ref<unknown>(null);
const detail = ref<BookStore | null>(null);
const chapters = ref<BookStorePublicChapter[]>([]);
const content = ref<BookStorePublicChapterContent | null>(null);
const currentChapterNumber = ref(1);
const liked = ref(false);
const favorited = ref(false);
const likeCount = ref(0);
const favoriteCount = ref(0);
const readerTheme = ref<ReaderTheme>('dark');
const fontSize = ref(18);
const lineHeight = ref(2);
const sidebarOpen = ref(true);
const comicVisible = ref(false);
const commentsVisible = ref(false);
const sideStoriesVisible = ref(false);
const plotVotesVisible = ref(false);
const commentsLoading = ref(false);
const comments = ref<BookStoreComment[]>([]);
const newComment = ref('');
const postingComment = ref(false);
const forking = ref(false);
const ttsStatus = ref<TtsStatus>('idle');
const ttsMessage = ref('未开始听书');
const ttsSegments = ref<TTSStreamSegment[]>([]);
const ttsCurrentIndex = ref(-1);
const ttsRate = ref('0%');
const resumeHint = ref<number | null>(null);
const comicLoading = ref(false);
const comicManifest = ref<BookStorePublicComicManifest | null>(null);
const comicPanelIndex = ref(0);
let ttsAbort: (() => void) | null = null;
let ttsAudio: HTMLAudioElement | null = null;

const cover = computed(() => resolveCoverSrc(detail.value?.cover || detail.value?.coverUrl));
const currentIndex = computed(() => chapters.value.findIndex((item) => item.chapterNumber === currentChapterNumber.value));
const currentChapter = computed(() => chapters.value[currentIndex.value] ?? null);
const hasPrev = computed(() => currentIndex.value > 0);
const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < chapters.value.length - 1);
const errorMessage = computed(() => (error.value ? extractApiErrorMessage(error.value, '阅读内容加载失败') : ''));
const ttsProgress = computed(() => (ttsSegments.value.length ? Math.round(((ttsCurrentIndex.value + 1) / ttsSegments.value.length) * 100) : 0));
const readingProgress = ref(0);

function fmt(n?: number): string {
  const value = Number(n || 0);
  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : String(value);
}

function fmtDate(s?: string | Date): string {
  const d = typeof s === 'string' ? new Date(s) : s;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('zh-CN') : '—';
}

function readProgressMap(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(DESKTOP_READER_PROGRESS_KEY) || '{}') as Record<string, number>;
  } catch { return {}; }
}

function saveProgress(chapterNumber: number): void {
  if (!bookId.value || !chapterNumber) return;
  const map = readProgressMap();
  map[bookId.value] = chapterNumber;
  window.localStorage.setItem(DESKTOP_READER_PROGRESS_KEY, JSON.stringify(map));
}

function loadSavedProgress(): number | null {
  const saved = readProgressMap()[bookId.value];
  return Number.isFinite(saved) && saved > 0 ? saved : null;
}

function resolveChapterNumber(num: number): number {
  if (!chapters.value.length) return Number.isFinite(num) && num > 0 ? num : 1;
  if (chapters.value.some((item) => item.chapterNumber === num)) return num;
  return chapters.value[0]?.chapterNumber ?? 1;
}

async function loadReader(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const payload: ReaderPayload = {
      detail: await getBookStoreDetail(bookId.value),
      chapters: await getBookStorePublicChapters(bookId.value),
    };
    detail.value = payload.detail;
    chapters.value = payload.chapters;
    likeCount.value = payload.detail.likeCount || 0;
    favoriteCount.value = payload.detail.favoriteCount || 0;
    const saved = loadSavedProgress();
    resumeHint.value = saved;
    currentChapterNumber.value = resolveChapterNumber(route.params.chapterNumber ? routeChapterNumber.value : saved || routeChapterNumber.value);
    await Promise.all([loadChapter(currentChapterNumber.value, false), loadInteractStatus()]);
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function loadChapter(chapterNumber: number, syncRoute = true): Promise<void> {
  if (!bookId.value) return;
  chapterLoading.value = true;
  error.value = null;
  try {
    const nextNumber = resolveChapterNumber(chapterNumber);
    stopTts();
    content.value = await getBookStorePublicChapterContent(bookId.value, nextNumber);
    currentChapterNumber.value = nextNumber;
    saveProgress(nextNumber);
    if (syncRoute && routeChapterNumber.value !== nextNumber) {
      await router.replace(`/desktop/book/${bookId.value}/read/${nextNumber}`);
    }
  } catch (err) {
    error.value = err;
    ElMessage.error(extractApiErrorMessage(err, '章节加载失败'));
  } finally {
    chapterLoading.value = false;
  }
}

async function loadInteractStatus(): Promise<void> {
  if (!detail.value) return;
  try {
    const [likeStatus, favoriteStatus] = await Promise.all([
      getBookLikeStatus(detail.value.id),
      getBookFavoriteStatus(detail.value.id),
    ]);
    liked.value = likeStatus.liked;
    favorited.value = favoriteStatus.favorited;
  } catch {
    liked.value = false;
    favorited.value = false;
  }
}

async function toggleLike(): Promise<void> {
  if (!detail.value) return;
  try {
    const res = await likeBook(detail.value.id);
    liked.value = res.liked;
    likeCount.value = res.likeCount;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '操作失败'));
  }
}

async function toggleFavorite(): Promise<void> {
  if (!detail.value) return;
  try {
    const res = await favoriteBook(detail.value.id);
    favorited.value = res.favorited;
    favoriteCount.value = res.favoriteCount;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '操作失败'));
  }
}

async function loadComments(): Promise<void> {
  if (!detail.value) return;
  commentsLoading.value = true;
  try {
    comments.value = await getBookComments(detail.value.id);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '评论加载失败'));
  } finally {
    commentsLoading.value = false;
  }
}

async function openComments(): Promise<void> {
  commentsVisible.value = true;
  await loadComments();
}

async function postComment(): Promise<void> {
  if (!detail.value || !newComment.value.trim()) return;
  postingComment.value = true;
  try {
    await createBookComment(detail.value.id, newComment.value.trim());
    newComment.value = '';
    ElMessage.success('评论成功');
    await loadComments();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '评论失败'));
  } finally {
    postingComment.value = false;
  }
}

function stopTts(): void {
  if (ttsAbort) {
    ttsAbort();
    ttsAbort = null;
  }
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.src = '';
    ttsAudio = null;
  }
  ttsStatus.value = 'idle';
  ttsMessage.value = '未开始听书';
  ttsSegments.value = [];
  ttsCurrentIndex.value = -1;
}

function playTtsSegment(index: number): void {
  const item = ttsSegments.value[index];
  if (!item) {
    if (ttsStatus.value === 'playing') {
      ttsStatus.value = 'done';
      ttsMessage.value = '本章播放完成';
    }
    return;
  }
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.src = '';
  }
  ttsCurrentIndex.value = index;
  ttsMessage.value = item.segment.speaker ? `${item.segment.speaker} · ${item.segment.text.slice(0, 24)}` : item.segment.text.slice(0, 28);
  ttsAudio = new Audio(`data:audio/mpeg;base64,${item.audio}`);
  ttsAudio.onended = () => playTtsSegment(index + 1);
  ttsAudio.onerror = () => {
    ttsStatus.value = 'error';
    ttsMessage.value = '音频播放失败';
  };
  ttsAudio.play().then(() => {
    ttsStatus.value = 'playing';
  }).catch(() => {
    ttsStatus.value = 'error';
    ttsMessage.value = '浏览器阻止了自动播放，请重试';
  });
}

function pauseTts(): void {
  if (ttsAudio && ttsStatus.value === 'playing') {
    ttsAudio.pause();
    ttsStatus.value = 'paused';
    ttsMessage.value = '已暂停';
  }
}

function resumeTts(): void {
  if (!ttsAudio || ttsStatus.value !== 'paused') return;
  ttsAudio.play().then(() => {
    ttsStatus.value = 'playing';
  }).catch(() => {
    ttsStatus.value = 'error';
    ttsMessage.value = '继续播放失败';
  });
}

function startTts(): void {
  if (!detail.value || !currentChapterNumber.value) return;
  stopTts();
  ttsStatus.value = 'loading';
  ttsMessage.value = '正在合成本章音频…';
  ttsAbort = streamTTSSynthesize(detail.value.novelId, currentChapterNumber.value, (event) => {
    if (event.type === 'segment') {
      ttsSegments.value.push(event);
      ttsMessage.value = `已生成 ${event.index + 1}/${event.total} 段`;
      if (ttsCurrentIndex.value === -1) playTtsSegment(0);
    } else if (event.type === 'done') {
      ttsAbort = null;
      if (!ttsSegments.value.length) {
        ttsStatus.value = 'done';
        ttsMessage.value = '没有可播放片段';
      }
    } else {
      ttsStatus.value = 'error';
      ttsMessage.value = event.message;
      ttsAbort = null;
    }
  }, ttsRate.value, { onAbort: () => { ttsAbort = null; } });
}

async function loadComic(): Promise<void> {
  if (!detail.value || !currentChapterNumber.value) return;
  comicLoading.value = true;
  try {
    const manifest = await getBookStorePublicComic(detail.value.id, currentChapterNumber.value);
    comicManifest.value = manifest;
    comicPanelIndex.value = 0;
    if (manifest?.panels?.length) {
      comicVisible.value = true;
    } else {
      ElMessage.info('当前章节暂无漫画版本');
    }
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '漫画加载失败'));
  } finally {
    comicLoading.value = false;
  }
}

function getComicPanelUrl(imagePath: string): string {
  if (!detail.value || !currentChapterNumber.value) return '';
  return bookStorePublicComicPanelUrl(detail.value.id, currentChapterNumber.value, imagePath);
}

function prevComicPanel(): void {
  if (comicPanelIndex.value > 0) comicPanelIndex.value -= 1;
}

function nextComicPanel(): void {
  if (comicManifest.value && comicPanelIndex.value < comicManifest.value.panels.length - 1) {
    comicPanelIndex.value += 1;
  }
}

async function forkCurrentChapter(): Promise<void> {
  if (!detail.value) return;
  const novelId = detail.value.novelId;
  const chapterNumber = currentChapterNumber.value;
  if (!novelId || !chapterNumber) return;
  forking.value = true;
  try {
    const check = await checkFork(novelId, chapterNumber);
    if (!check.allowed) {
      ElMessage.warning(check.reason || '当前章节暂不允许创建分支');
      return;
    }
    await ElMessageBox.confirm(
      `将从第 ${chapterNumber} 章创建分支，保留此前章节内容，并生成一个独立的新作品。`,
      '创建剧情分支',
      { confirmButtonText: '创建分支', cancelButtonText: '取消', type: 'info' },
    );
    const result = await createFork({ novelId, fromChapter: chapterNumber });
    ElMessage.success(`分支已创建：${result.novel.title}`);
    await router.push(`/desktop/novel/${result.novel.id}`);
  } catch (err) {
    if (err === 'cancel') return;
    ElMessage.error(extractApiErrorMessage(err, '创建分支失败'));
  } finally {
    forking.value = false;
  }
}

function goDetail(): void {
  router.push(`/desktop/book/${bookId.value}`);
}

function goBookstore(): void {
  router.push('/desktop/bookstore');
}

function goPrev(): void {
  if (!hasPrev.value) return;
  const prev = chapters.value[currentIndex.value - 1];
  if (prev) void loadChapter(prev.chapterNumber);
}

function goNext(): void {
  if (!hasNext.value) return;
  const next = chapters.value[currentIndex.value + 1];
  if (next) void loadChapter(next.chapterNumber);
}

watch(bookId, () => { void loadReader(); }, { immediate: true });
watch(routeChapterNumber, (num) => {
  if (!loading.value && num !== currentChapterNumber.value) void loadChapter(num, false);
});

function updateReadingProgress(): void {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  readingProgress.value = docHeight > 0 ? Math.min(100, Math.max(0, Math.round((scrollTop / docHeight) * 100))) : 0;
}

onMounted(() => {
  window.addEventListener('scroll', updateReadingProgress, { passive: true });
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateReadingProgress);
  stopTts();
});
</script>

<template>
  <div class="desktop-reader-page" :class="`theme-${readerTheme}`">
    <StateView :loading="loading" :error="error && !content" :error-message="errorMessage" @retry="loadReader">
      <template #loading>
        <div class="desktop-reader-skeleton" />
      </template>

      <template v-if="detail">
        <aside class="reader-shell-sidebar" :class="{ collapsed: !sidebarOpen }">
          <div class="reader-book-card">
            <div class="reader-book-cover" :style="cover ? { backgroundImage: `url(${cover})` } : {}">
              <span v-if="!cover">{{ detail.title.slice(0, 1) }}</span>
            </div>
            <div v-if="sidebarOpen" class="reader-book-meta">
              <strong>{{ detail.title }}</strong>
              <small>{{ detail.authorName || '匿名作者' }}</small>
              <span>{{ chapters.length }} 章 · {{ fmt(detail.wordCount || 0) }} 字</span>
            </div>
          </div>

          <div v-if="sidebarOpen" class="reader-book-actions">
            <button class="reader-action-btn" type="button" @click="goDetail">
              <Icon name="bookOpen" :size="14" />
              <span>作品详情</span>
            </button>
            <button class="reader-action-btn" type="button" @click="goBookstore">
              <Icon name="store" :size="14" />
              <span>返回书城</span>
            </button>
          </div>

          <button class="reader-sidebar-toggle" type="button" @click="sidebarOpen = !sidebarOpen">
            <Icon name="chevronRight" :size="14" :style="{ transform: sidebarOpen ? 'rotate(180deg)' : 'rotate(0deg)' }" />
            <span v-if="sidebarOpen">收起目录</span>
          </button>

          <div v-if="sidebarOpen" class="reader-chapter-nav">
            <button
              v-for="chapter in chapters"
              :key="chapter.chapterNumber"
              type="button"
              class="reader-chapter-nav-item"
              :class="{ active: chapter.chapterNumber === currentChapterNumber }"
              @click="loadChapter(chapter.chapterNumber)"
            >
              <span>{{ chapter.chapterNumber }}</span>
              <strong>{{ chapter.title || `第${chapter.chapterNumber}章` }}</strong>
              <small>{{ fmt(chapter.wordCount) }} 字 · {{ fmtDate(chapter.updatedAt) }}</small>
            </button>
            <div v-if="!chapters.length" class="reader-empty">暂无公开章节</div>
          </div>
        </aside>

        <main class="reader-shell-main">
          <header class="reader-toolbar nw-panel">
            <div class="reader-toolbar-left">
              <button class="desktop-btn" type="button" @click="goBookstore"><Icon name="arrowLeft" :size="14" /> 书城</button>
              <button class="desktop-btn" type="button" @click="goDetail">作品详情</button>
            </div>
            <div class="reader-toolbar-center">
              <span>{{ currentChapter?.chapterNumber ? `第 ${currentChapter.chapterNumber} 章` : '阅读' }}</span>
              <strong>{{ content?.title || currentChapter?.title || detail.title }}</strong>
            </div>
            <div class="reader-toolbar-right">
              <button class="desktop-btn" :class="{ 'interact-active': liked }" type="button" @click="toggleLike"><Icon name="thumbsUp" :size="14" /> {{ likeCount }}</button>
              <button class="desktop-btn" :class="{ 'interact-active': favorited }" type="button" @click="toggleFavorite"><Icon name="book" :size="14" /> {{ favorited ? '已收藏' : '收藏' }}</button>
              <button class="desktop-btn" type="button" @click="openComments"><Icon name="messageCircle" :size="14" /> 评论</button>
              <button class="desktop-btn" type="button" @click="sideStoriesVisible = true"><Icon name="bookmark" :size="14" /> 番外</button>
              <button class="desktop-btn" type="button" @click="plotVotesVisible = true"><Icon name="sparkles" :size="14" /> 投票</button>
              <button class="desktop-btn" type="button" :disabled="comicLoading" @click="loadComic"><Icon name="image" :size="14" /> 漫画</button>
            </div>
          </header>

          <section class="reader-controls nw-panel">
            <div class="reader-control-group">
              <button class="desktop-btn" :class="{ 'desktop-btn--primary': readerTheme === 'dark' }" type="button" @click="readerTheme = 'dark'">深色</button>
              <button class="desktop-btn" :class="{ 'desktop-btn--primary': readerTheme === 'light' }" type="button" @click="readerTheme = 'light'">浅色</button>
              <button class="desktop-btn" :class="{ 'desktop-btn--primary': readerTheme === 'paper' }" type="button" @click="readerTheme = 'paper'">纸感</button>
            </div>
            <div class="reader-control-group">
              <button class="desktop-btn" type="button" :disabled="fontSize <= 15" @click="fontSize -= 1">A-</button>
              <span>{{ fontSize }}px</span>
              <button class="desktop-btn" type="button" :disabled="fontSize >= 24" @click="fontSize += 1">A+</button>
            </div>
            <div class="reader-control-group">
              <button class="desktop-btn" :class="{ 'desktop-btn--primary': lineHeight === 1.8 }" type="button" @click="lineHeight = 1.8">紧凑</button>
              <button class="desktop-btn" :class="{ 'desktop-btn--primary': lineHeight === 2 }" type="button" @click="lineHeight = 2">标准</button>
              <button class="desktop-btn" :class="{ 'desktop-btn--primary': lineHeight === 2.2 }" type="button" @click="lineHeight = 2.2">宽松</button>
            </div>
            <div class="reader-control-group">
              <button class="desktop-btn" type="button" :disabled="forking" @click="forkCurrentChapter">
                <Icon name="gitBranch" :size="14" /> {{ forking ? '创建中…' : '从此章创建分支' }}
              </button>
            </div>
            <div class="reader-control-group reader-progress">
              <span>{{ currentIndex + 1 }}/{{ chapters.length || 1 }}</span>
            </div>
          </section>

          <section class="reader-tts-bar nw-panel">
            <div class="reader-tts-main">
              <Icon name="volume2" :size="16" />
              <div>
                <strong>听书</strong>
                <span>{{ ttsMessage }}</span>
              </div>
            </div>
            <div class="reader-tts-progress"><i :style="{ width: `${ttsProgress}%` }" /></div>
            <div class="reader-tts-actions">
              <select v-model="ttsRate" class="nw-input reader-tts-rate" :disabled="ttsStatus === 'loading' || ttsStatus === 'playing'">
                <option value="-20%">慢速</option>
                <option value="0%">标准</option>
                <option value="+20%">快速</option>
              </select>
              <button v-if="ttsStatus === 'paused'" class="desktop-btn desktop-btn--primary" type="button" @click="resumeTts"><Icon name="play" :size="14" /> 继续</button>
              <button v-else class="desktop-btn desktop-btn--primary" type="button" :disabled="ttsStatus === 'loading' || ttsStatus === 'playing'" @click="startTts"><Icon name="play" :size="14" /> {{ ttsStatus === 'loading' ? '合成中…' : '开始听书' }}</button>
              <button class="desktop-btn" type="button" :disabled="ttsStatus !== 'playing'" @click="pauseTts">暂停</button>
              <button class="desktop-btn" type="button" :disabled="ttsStatus === 'idle'" @click="stopTts">停止</button>
            </div>
          </section>

          <section v-if="resumeHint && resumeHint !== currentChapterNumber" class="reader-resume-tip nw-panel">
            <span>上次读到第 {{ resumeHint }} 章</span>
            <button class="desktop-btn" type="button" @click="loadChapter(resumeHint)">继续上次进度</button>
          </section>

          <article class="reader-document nw-panel" :style="{ fontSize: `${fontSize}px`, lineHeight: `${lineHeight}` }">
            <div class="reader-progress-bar"><i :style="{ width: `${readingProgress}%` }" /></div>
            <StateView :loading="chapterLoading" :error="error && !content" :error-message="errorMessage" @retry="loadChapter(currentChapterNumber, false)">
              <template v-if="content">
                <p class="reader-document-kicker">{{ detail.category || '作品阅读' }}</p>
                <h1>{{ content.title }}</h1>
                <div class="reader-document-meta">{{ fmt(content.wordCount) }} 字 · {{ detail.title }}</div>
                <div class="reader-document-content">{{ content.content }}</div>
              </template>
            </StateView>
          </article>

          <footer class="reader-bottom-bar">
            <button class="desktop-btn" :disabled="!hasPrev || chapterLoading" type="button" @click="goPrev"><Icon name="arrowLeft" :size="14" /> 上一章</button>
            <button class="desktop-btn desktop-btn--primary" :disabled="!hasNext || chapterLoading" type="button" @click="goNext">下一章 <Icon name="arrowRight" :size="14" /></button>
          </footer>
        </main>
      </template>
    </StateView>

    <DesktopSideStoryPlaza v-if="detail" v-model:visible="sideStoriesVisible" :novel-id="detail.novelId" :title="detail.title" />
    <DesktopPlotVotePanel v-if="detail" v-model:visible="plotVotesVisible" :novel-id="detail.novelId" :title="detail.title" />

    <Modal v-model="comicVisible" title="本章漫画" width="820px">
      <div class="reader-comic-viewer">
        <StateView :loading="comicLoading" :empty="!comicLoading && !comicManifest?.panels?.length">
          <template #empty>
            <p class="nw-state__title">暂无漫画内容</p>
            <p class="nw-state__desc">当前章节还没有生成漫画版本。</p>
          </template>
          <template v-if="comicManifest && comicManifest.panels.length">
            <div class="comic-stage">
              <img :src="getComicPanelUrl(comicManifest.panels[comicPanelIndex].imagePath)" :alt="`第 ${comicPanelIndex + 1} 格`" />
            </div>
            <div class="comic-nav">
              <button class="desktop-btn" type="button" :disabled="comicPanelIndex === 0" @click="prevComicPanel"><Icon name="arrowLeft" :size="14" /> 上一格</button>
              <span class="comic-progress">{{ comicPanelIndex + 1 }} / {{ comicManifest.panels.length }}</span>
              <button class="desktop-btn desktop-btn--primary" type="button" :disabled="comicPanelIndex >= comicManifest.panels.length - 1" @click="nextComicPanel">下一格 <Icon name="arrowRight" :size="14" /></button>
            </div>
          </template>
        </StateView>
      </div>
    </Modal>

    <Modal v-model="commentsVisible" title="作品评论" width="760px">
      <div class="reader-comments-panel">
        <div class="reader-comment-editor">
          <textarea v-model="newComment" class="nw-input" rows="4" placeholder="写下你的阅读感受，和其他读者交流。" />
          <div class="reader-comment-editor-foot">
            <span>{{ newComment.trim().length }}/500</span>
            <button class="desktop-btn desktop-btn--primary" :disabled="postingComment || !newComment.trim()" type="button" @click="postComment">
              {{ postingComment ? '发布中…' : '发表评论' }}
            </button>
          </div>
        </div>

        <StateView :loading="commentsLoading" :empty="!commentsLoading && !comments.length">
          <template #empty>
            <p class="nw-state__title">还没有评论</p>
            <p class="nw-state__desc">成为第一个留下阅读反馈的人。</p>
          </template>
          <div class="reader-comment-list">
            <article v-for="comment in comments" :key="comment.id" class="reader-comment-item">
              <div class="reader-comment-avatar">{{ (comment.username || comment.authorName || '?').slice(0, 1) }}</div>
              <div class="reader-comment-body">
                <div class="reader-comment-meta">
                  <strong>{{ comment.username || comment.authorName || '读者' }}</strong>
                  <span>{{ fmtDate(comment.createdAt) }}</span>
                </div>
                <p>{{ comment.content }}</p>
              </div>
            </article>
          </div>
        </StateView>
      </div>
    </Modal>
  </div>
</template>
