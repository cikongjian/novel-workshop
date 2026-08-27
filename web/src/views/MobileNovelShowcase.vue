<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Share, Reading, MagicStick, Picture, Star, VideoPlay, VideoPause, Headset, Right } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { fetchCharacters, type CharacterProfile } from '../api/characters';
import { fetchCharacterGrowth, type CharacterQuote } from '../api/character-growth';
import {
  getBookStoreDetail,
  getBookStorePublicChapters,
  getBookStorePublicComic,
  bookStorePublicComicPanelUrl,
  type BookStorePublicComicPanel,
  type BookStore,
} from '../api/bookstore';
import { fetchNovel, getCoverUrl } from '../api/novels';
import { getComic, comicPanelUrl, type ComicManifest } from '../api/comic';
import { fetchAudiobookPage, streamTTSSynthesize, type AudiobookEntry, type TTSSegmentData } from '../api/tts';
import { CHARACTER_ROLE_LABELS, type NovelMetadata } from '../types';
import { resolveCoverSrc } from '../utils/deploy-path';
import { safeImageUrl } from '../utils/safe-url';
import { useThemeMode } from '../composables/useThemeMode';
import { useShareCard } from '../composables/useShareCard';
import '../styles/mobile-showcase.css';
import { brand } from '../config/brand';

type ShowcaseMode = 'bookstore' | 'novel';

interface ShowcaseCharacter {
  id: string;
  name: string;
  role: CharacterProfile['role'];
  position?: string;
  cardBlurb?: string;
  portraitImagePath?: string;
}

interface ShowcaseQuote {
  text: string;
  chapter: number;
  score: number;
  characterName: string;
  characterId: string;
}

interface ShowcaseComic {
  chapterNumber: number;
  panels: Array<{ imageUrl: string; narration?: string; dialogue?: string }>;
}

const CHARACTER_ROLE_ORDER: Record<CharacterProfile['role'], number> = {
  protagonist: 0,
  antagonist: 1,
  deuteragonist: 2,
  rival: 3,
  love_interest: 4,
  mentor: 5,
  ally: 6,
  faction_leader: 7,
  supporting: 8,
  family: 9,
  comic_relief: 10,
  minor: 11,
};

const MAX_CHARACTERS = 2;
const MAX_QUOTES = 3;
const MAX_COMIC_PANELS = 3;

const route = useRoute();
const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const share = useShareCard();

const mode = ref<ShowcaseMode>('bookstore');
const loading = ref(true);

const book = ref<BookStore | null>(null);
const novel = ref<NovelMetadata | null>(null);
const characters = ref<ShowcaseCharacter[]>([]);
const quotes = ref<ShowcaseQuote[]>([]);
const comic = ref<ShowcaseComic | null>(null);

const audiobookFirstChapter = ref<AudiobookEntry | null>(null);
const audioPlaying = ref(false);
const audioSynthLoading = ref(false);
const audioSegments = ref<Array<{ segment: TTSSegmentData; audio: string; duration: number; blobUrl?: string }>>([]);
const audioCurrentIdx = ref(-1);
let audioEl: HTMLAudioElement | null = null;
let audioAbort: (() => void) | null = null;

const PREVIEW_SEG_LIMIT = 5;

const currentAudioSegment = computed(() =>
  audioCurrentIdx.value >= 0 && audioCurrentIdx.value < audioSegments.value.length
    ? audioSegments.value[audioCurrentIdx.value].segment
    : null
);

const bookId = computed(() => String(route.params.id || ''));
const novelId = computed(() => {
  if (mode.value === 'bookstore') return book.value?.novelId || '';
  return bookId.value;
});

const title = computed(() => {
  if (mode.value === 'bookstore') return book.value?.title || '';
  return novel.value?.title || '';
});

const coverSrc = computed(() => {
  if (mode.value === 'bookstore') {
    return resolveCoverSrc(book.value?.coverUrl || book.value?.cover || '');
  }
  if (novel.value) {
    return getCoverUrl(novel.value.id, novel.value.coverVersion);
  }
  return '';
});

const hookText = computed(() => {
  if (mode.value === 'bookstore') {
    return book.value?.description?.trim() || book.value?.synopsis?.trim() || '';
  }
  return novel.value?.description?.trim() || novel.value?.synopsis?.trim() || '';
});

const tags = computed(() => {
  if (mode.value === 'bookstore') return book.value?.tags || [];
  return novel.value?.tags || novel.value?.constitutionTags || [];
});

const category = computed(() => {
  if (mode.value === 'bookstore') return book.value?.category || '';
  return novel.value?.genre || '';
});

const authorName = computed(() => {
  if (mode.value === 'bookstore') return book.value?.authorName || `${brand.displayName} 作者`;
  return '作者';
});

const firstChapterNumber = computed(() => {
  return 1;
});

function characterPortrait(character: ShowcaseCharacter): string {
  if (!novelId.value || !character.id) return '';
  if (character.portraitImagePath) {
    return safeImageUrl(`/api/novels/${novelId.value}/characters/${character.id}/portrait?w=240`);
  }
  return '';
}

function stopAudio() {
  if (audioAbort) {
    audioAbort();
    audioAbort = null;
  }
  if (audioEl) {
    audioEl.pause();
    audioEl = null;
  }
  for (const item of audioSegments.value) {
    if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
  }
  audioSegments.value = [];
  audioCurrentIdx.value = -1;
  audioPlaying.value = false;
  audioSynthLoading.value = false;
}

function playNextSegment() {
  if (audioCurrentIdx.value >= audioSegments.value.length - 1) {
    audioPlaying.value = false;
    audioCurrentIdx.value = -1;
    return;
  }
  const nextIdx = audioCurrentIdx.value + 1;
  const seg = audioSegments.value[nextIdx];
  if (!seg?.blobUrl) {
    playNextSegment();
    return;
  }
  audioCurrentIdx.value = nextIdx;
  audioEl = new Audio(seg.blobUrl);
  audioEl.onended = () => {
    playNextSegment();
  };
  audioEl.onerror = () => {
    playNextSegment();
  };
  audioEl.play().catch(() => {
    playNextSegment();
  });
}

async function startAudioPreview() {
  if (!novelId.value || !audiobookFirstChapter.value) return;
  stopAudio();
  audioSynthLoading.value = true;
  let firstReceived = false;

  audioAbort = streamTTSSynthesize(
    novelId.value,
    audiobookFirstChapter.value.chapterNumber,
    (event) => {
      if (event.type === 'segment') {
        const blob = b64toBlob(event.audio, 'audio/mpeg');
        const blobUrl = URL.createObjectURL(blob);
        audioSegments.value.push({
          segment: event.segment,
          audio: event.audio,
          duration: event.duration,
          blobUrl,
        });
        if (!firstReceived && audioSegments.value.length >= 1) {
          firstReceived = true;
          audioSynthLoading.value = false;
          audioPlaying.value = true;
          playNextSegment();
        }
        if (audioSegments.value.length >= PREVIEW_SEG_LIMIT) {
          if (audioAbort) {
            audioAbort();
            audioAbort = null;
          }
        }
      } else if (event.type === 'error') {
        audioSynthLoading.value = false;
        audioPlaying.value = false;
        ElMessage.error(event.message || '试听失败');
      } else if (event.type === 'done') {
        audioSynthLoading.value = false;
        if (!firstReceived) {
          ElMessage.warning('暂无试听内容');
        }
      }
    },
  );
}

function b64toBlob(b64: string, type: string): Blob {
  const byteCharacters = atob(b64);
  const byteArrays: Uint8Array[] = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type });
}

function toggleAudioPreview() {
  if (audioPlaying.value) {
    stopAudio();
  } else {
    startAudioPreview();
  }
}

function openAudioDrama() {
  stopAudio();
  router.push(`/m/novel/${novelId.value}/audio-drama`);
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/m');
  }
}

function openReader() {
  if (mode.value === 'bookstore') {
    router.push(`/m/bookstore/${bookId.value}/read/${firstChapterNumber.value}`);
  } else {
    router.push(`/m/novel/${novelId.value}/read`);
  }
}

function openFork() {
  if (mode.value === 'bookstore') {
    ElMessage.info('Fork 功能即将开放');
  } else {
    router.push(`/m/novel/${novelId.value}/chapters`);
  }
}

async function doShare() {
  if (!title.value) return;
  try {
    const topQuote = quotes.value[0];
    const url = await share.generateCard({
      text: topQuote?.text || hookText.value || title.value,
      novelTitle: title.value,
      authorName: authorName.value,
      chapterTitle: topQuote ? `金句分 ${topQuote.score}` : '精选故事',
    });
    if (url) await share.shareImage(url);
  } catch (e) {
    ElMessage.error('分享生成失败');
  }
}

async function loadBookstoreData() {
  if (!bookId.value) return;
  try {
    const detail = await getBookStoreDetail(bookId.value);
    book.value = detail;

    const [charsRes, chaptersRes] = await Promise.allSettled([
      loadCharacters(detail.novelId),
      getBookStorePublicChapters(bookId.value),
    ]);

    if (chaptersRes.status === 'fulfilled' && chaptersRes.value.length > 0) {
      const firstChapter = chaptersRes.value[0]?.chapterNumber || 1;
      await Promise.allSettled([
        loadBookstoreComic(firstChapter),
        loadAudiobook(detail.novelId),
      ]);
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '加载失败');
  }
}

async function loadNovelData() {
  if (!bookId.value) return;
  try {
    const data = await fetchNovel(bookId.value);
    novel.value = data;
    await loadCharacters(bookId.value);
    await Promise.allSettled([
      loadNovelComic(1),
      loadAudiobook(bookId.value),
    ]);
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '加载失败');
  }
}

async function loadCharacters(nid: string) {
  if (!nid) return;
  try {
    const list = await fetchCharacters(nid);
    const sorted = list
      .filter((item) => item.name?.trim())
      .sort((a, b) => {
        const roleRank = (CHARACTER_ROLE_ORDER[a.role] ?? 99) - (CHARACTER_ROLE_ORDER[b.role] ?? 99);
        if (roleRank !== 0) return roleRank;
        return (a.firstAppearance ?? Number.MAX_SAFE_INTEGER) - (b.firstAppearance ?? Number.MAX_SAFE_INTEGER);
      })
      .slice(0, MAX_CHARACTERS)
      .map((item) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        position: item.position,
        cardBlurb: item.cardBlurb,
        portraitImagePath: item.portraitImagePath,
      }));
    characters.value = sorted;

    await loadQuotes(nid, sorted);
  } catch {
    characters.value = [];
  }
}

async function loadQuotes(nid: string, chars: ShowcaseCharacter[]) {
  if (!nid || chars.length === 0) return;
  try {
    const results = await Promise.allSettled(
      chars.map(async (c) => {
        const growth = await fetchCharacterGrowth(nid, c.id);
        return growth.quotes.map((q: CharacterQuote) => ({
          ...q,
          characterName: c.name,
          characterId: c.id,
        }));
      }),
    );
    const all: ShowcaseQuote[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all.push(...r.value);
    }
    all.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    quotes.value = all.slice(0, MAX_QUOTES);
  } catch {
    quotes.value = [];
  }
}

async function loadAudiobook(nid: string) {
  if (!nid) return;
  try {
    const result = await fetchAudiobookPage(nid, { page: 1, pageSize: 3, order: 'asc' });
    if (result.entries.length > 0) {
      audiobookFirstChapter.value = result.entries[0];
    }
  } catch {
    audiobookFirstChapter.value = null;
  }
}

async function loadBookstoreComic(chapterNumber: number) {
  if (!bookId.value) return;
  try {
    const manifest = await getBookStorePublicComic(bookId.value, chapterNumber);
    if (manifest && manifest.panels.length > 0) {
      comic.value = {
        chapterNumber,
        panels: manifest.panels
          .slice(0, MAX_COMIC_PANELS)
          .map((p: BookStorePublicComicPanel) => ({
            imageUrl: bookStorePublicComicPanelUrl(bookId.value, chapterNumber, p.imagePath),
            narration: p.narration,
            dialogue: p.dialogue,
          })),
      };
    }
  } catch {
    comic.value = null;
  }
}

async function loadNovelComic(chapterNumber: number) {
  if (!novelId.value) return;
  try {
    const manifest: ComicManifest | null = await getComic(novelId.value, chapterNumber);
    if (manifest && manifest.panels.length > 0) {
      comic.value = {
        chapterNumber,
        panels: manifest.panels
          .filter((p) => p.imagePath && !p.failed)
          .slice(0, MAX_COMIC_PANELS)
          .map((p) => ({
            imageUrl: comicPanelUrl(novelId.value, chapterNumber, p.imagePath),
            narration: p.narration,
            dialogue: p.dialogue,
          })),
      };
    }
  } catch {
    comic.value = null;
  }
}

function detectMode(): ShowcaseMode {
  const path = route.path;
  if (path.includes('/bookstore/')) return 'bookstore';
  return 'novel';
}

onMounted(async () => {
  mode.value = detectMode();
  try {
    if (mode.value === 'bookstore') {
      await loadBookstoreData();
    } else {
      await loadNovelData();
    }
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  stopAudio();
});
</script>

<template>
  <div class="mobile-showcase-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell">
      <header class="mns-topbar">
        <button class="mns-topbar__back" type="button" aria-label="返回" @click="goBack">
          <el-icon :size="18"><ArrowLeft /></el-icon>
        </button>
        <span class="mns-topbar__title">{{ title || '作品展示' }}</span>
        <button class="mns-topbar__share" type="button" aria-label="分享" @click="doShare">
          <el-icon :size="18"><Share /></el-icon>
        </button>
      </header>

        <div v-if="loading" class="mns-loading">
          <span>正在加载作品展示...</span>
        </div>

        <template v-else>
          <section class="mns-hero">
            <div class="mns-hero__cover-row">
              <div class="mns-cover">
                <img v-if="coverSrc" :src="coverSrc" :alt="title" loading="lazy" />
                <div v-else class="mns-cover__fallback">{{ title?.slice(0, 2) || '书' }}</div>
              </div>
              <div class="mns-hero__meta">
                <span class="mns-hero__kicker">{{ category || '精选故事' }}</span>
                <h1 class="mns-hero__title">{{ title }}</h1>
                <span class="mns-hero__author">{{ authorName }}</span>
                <div class="mns-hero__tags">
                  <span v-for="tag in tags.slice(0, 3)" :key="tag" class="mns-hero__tag">{{ tag }}</span>
                </div>
              </div>
            </div>
            <p v-if="hookText" class="mns-hero__hook">{{ hookText }}</p>
          </section>

          <section v-if="characters.length > 0" class="mns-section">
            <div class="mns-section__head">
              <div>
                <p class="mns-section__kicker">Cast</p>
                <h2 class="mns-section__title">角色亮相</h2>
              </div>
              <span class="mns-section__hint">认识他们，再进入故事</span>
            </div>
            <div class="mns-cast-row">
              <div
                v-for="character in characters"
                :key="character.id"
                class="mns-char-card"
              >
                <div class="mns-char-card__portrait">
                  <img v-if="characterPortrait(character)" :src="characterPortrait(character)" :alt="character.name" loading="lazy" />
                </div>
                <div class="mns-char-card__body">
                  <div class="mns-char-card__name">
                    {{ character.name }}
                    <span class="mns-char-card__role">
                      {{ character.position || CHARACTER_ROLE_LABELS[character.role] || '角色' }}
                    </span>
                  </div>
                  <p class="mns-char-card__blurb">
                    {{ character.cardBlurb || '神秘角色，故事中见真章' }}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section v-if="quotes.length > 0" class="mns-section">
            <div class="mns-section__head">
              <div>
                <p class="mns-section__kicker">Quotes</p>
                <h2 class="mns-section__title">金句暴击</h2>
              </div>
              <span class="mns-section__hint">先睹为快</span>
            </div>
            <div class="mns-quote-list">
              <div v-for="(q, idx) in quotes" :key="idx" class="mns-quote-card">
                <p class="mns-quote-card__text">{{ q.text }}</p>
                <div class="mns-quote-card__meta">
                  <span class="mns-quote-card__char">—— {{ q.characterName }}</span>
                  <span class="mns-quote-card__score">
                    <el-icon :size="12"><Star /></el-icon>
                    金句分 {{ q.score }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section v-if="audiobookFirstChapter" class="mns-section">
            <div class="mns-section__head">
              <div>
                <p class="mns-section__kicker">Audio Drama</p>
                <h2 class="mns-section__title">广播剧试听</h2>
              </div>
              <span class="mns-section__hint">多角色配音</span>
            </div>
            <div class="mns-audio-card">
              <div class="mns-audio-card__head">
                <div class="mns-audio-card__icon">
                  <el-icon :size="22"><Headset /></el-icon>
                </div>
                <div class="mns-audio-card__meta">
                  <div class="mns-audio-card__chapter">{{ audiobookFirstChapter.title || '第 1 章' }}</div>
                  <div class="mns-audio-card__sub">
                    试听前 {{ PREVIEW_SEG_LIMIT }} 段 · 共 {{ audiobookFirstChapter.segmentCount }} 段
                  </div>
                </div>
                <button
                  class="mns-audio-card__play"
                  type="button"
                  :aria-label="audioPlaying ? '暂停' : '播放'"
                  :disabled="audioSynthLoading"
                  @click="toggleAudioPreview"
                >
                  <el-icon v-if="audioSynthLoading" :size="18" class="is-loading"><VideoPlay /></el-icon>
                  <el-icon v-else-if="audioPlaying" :size="18"><VideoPause /></el-icon>
                  <el-icon v-else :size="18"><VideoPlay /></el-icon>
                </button>
              </div>
              <div v-if="currentAudioSegment" class="mns-audio-card__script">
                <div v-if="currentAudioSegment.type === 'dialogue'" class="mns-audio-card__speaker">
                  {{ currentAudioSegment.speaker || '角色' }}
                </div>
                <div
                  class="mns-audio-card__text"
                  :class="{ 'is-narration': currentAudioSegment.type === 'narration' }"
                >
                  {{ currentAudioSegment.text }}
                </div>
                <div class="mns-audio-card__progress">
                  <div
                    class="mns-audio-card__progress-bar"
                    :style="{ width: `${((audioCurrentIdx + 1) / Math.min(audioSegments.length, PREVIEW_SEG_LIMIT)) * 100}%` }"
                  ></div>
                </div>
              </div>
              <button
                v-else
                class="mns-audio-card__cta"
                type="button"
                @click="openAudioDrama"
              >
                <span>听完整广播剧</span>
                <el-icon :size="14"><Right /></el-icon>
              </button>
            </div>
          </section>

          <section v-if="comic && comic.panels.length > 0" class="mns-section">
            <div class="mns-section__head">
              <div>
                <p class="mns-section__kicker">Comic</p>
                <h2 class="mns-section__title">漫画预告</h2>
              </div>
              <span class="mns-section__hint">第 {{ comic.chapterNumber }} 章</span>
            </div>
            <div class="mns-comic-strip">
              <div
                v-for="(panel, idx) in comic.panels"
                :key="idx"
                class="mns-comic-panel"
              >
                <img :src="panel.imageUrl" :alt="`第${idx + 1}格`" loading="lazy" />
              </div>
            </div>
            <p class="mns-comic-hint">左右滑动查看更多 → 进入阅读器看完整漫画</p>
          </section>

          <div class="mns-cta-group">
            <button class="mns-cta-primary" type="button" @click="openReader">
              <el-icon :size="18"><Reading /></el-icon>
              <span>开始阅读</span>
            </button>
            <div class="mns-cta-row">
              <button class="mns-cta-secondary" type="button" @click="openFork">
                <el-icon :size="16"><MagicStick /></el-icon>
                <span>Fork 改写</span>
              </button>
              <button class="mns-cta-secondary" type="button" @click="doShare">
                <el-icon :size="16"><Picture /></el-icon>
                <span>生成分享卡</span>
              </button>
            </div>
          </div>
        </template>
    </div>
  </div>
</template>