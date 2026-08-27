<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, ArrowRight, CollectionTag, Headset, MagicStick, Share, Sort, Star, UserFilled, View } from '@element-plus/icons-vue';
import { fetchCharacters } from '../api/characters';
import { getBookStoreDetail, getBookStorePublicChapterPage, type BookStorePublicChapter } from '../api/bookstore';
import type { BookStore } from '../api/types';
import { CHARACTER_ROLE_LABELS, type CharacterProfile } from '../types';
import { resolveCoverSrc } from '../utils/deploy-path';
import { safeImageUrl } from '../utils/safe-url';
import { formatBookWordCount, formatPublishedChapterText } from '../utils/bookstore-display';
import { useThemeMode } from '../composables/useThemeMode';
import { useAuthStore } from '../stores/auth';
import MobileCharacterDetailSheet from '../components/mobile-entry/MobileCharacterDetailSheet.vue';
import LazyImage from '../components/shared/LazyImage.vue';
import '../styles/mobile-book-detail.css';
import { brand } from '../config/brand';

type ChapterOrder = 'asc' | 'desc';

type CharacterCard = Pick<CharacterProfile,
  'id' | 'name' | 'role' | 'position' | 'cardBlurb' | 'personality' | 'portraitImagePath' | 'firstAppearance'
>;

const CHAPTER_PAGE_SIZE = 80;
const CHARACTER_LIMIT = 12;
const CHARACTER_ROLE_ORDER: Record<CharacterProfile['role'], number> = {
  protagonist: 0,
  deuteragonist: 1,
  antagonist: 2,
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

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const loading = ref(false);
const chaptersLoading = ref(false);
const book = ref<BookStore | null>(null);
const chapters = ref<BookStorePublicChapter[]>([]);
const characters = ref<CharacterCard[]>([]);
const chapterOrder = ref<ChapterOrder>('asc');
const chapterPage = ref(1);
const chapterTotal = ref(0);
const chapterHasMore = ref(false);
const synopsisExpanded = ref(false);
const characterDetailVisible = ref(false);
const activeCharacterId = ref<string | null>(null);
const chapterSearchQuery = ref('');

const bookId = computed(() => String(route.params.id || ''));
const coverSrc = computed(() => resolveCoverSrc(book.value?.coverUrl || book.value?.cover || ''));
const intro = computed(() => book.value?.description?.trim() || '故事正在展开，更多命运线索等待你进入正文。');
const chapterWordTotal = computed(() => chapters.value.reduce((sum, chapter) => {
  const wordCount = Number(chapter.wordCount);
  return sum + (Number.isFinite(wordCount) ? Math.max(0, Math.round(wordCount)) : 0);
}, 0));
const totalWords = computed(() => {
  const fromDetail = Number(book.value?.publishedWordCount) || Number(book.value?.wordCount) || 0;
  return fromDetail > 0 ? fromDetail : chapterWordTotal.value;
});
const chapterCount = computed(() => chapterTotal.value || book.value?.publishedChapterCount || book.value?.chapterCount || chapters.value.length);
const rememberedChapter = computed(() => readRememberedChapter(bookId.value));
const rememberedChapterSummary = computed(() => {
  const number = rememberedChapter.value;
  if (!number) return null;
  return chapters.value.find((chapter) => chapter.chapterNumber === number) ?? null;
});
const firstChapterNumber = computed(() => {
  if (!chapters.value.length) return null;
  return [...chapters.value].sort((a, b) => a.chapterNumber - b.chapterNumber)[0]?.chapterNumber ?? null;
});
const progressText = computed(() => {
  if (!rememberedChapter.value || !chapterCount.value) return '还没有阅读记录';
  const safeTotal = Math.max(rememberedChapter.value, chapterCount.value);
  return `已读到 ${rememberedChapter.value} / ${safeTotal} 章`;
});
const continueLabel = computed(() => {
  if (rememberedChapter.value) return `继续阅读 第 ${rememberedChapter.value} 章`;
  return '开始阅读';
});
const filteredChapters = computed(() => {
  if (!chapterSearchQuery.value.trim()) return chapters.value;
  const query = chapterSearchQuery.value.toLowerCase();
  return chapters.value.filter((chapter) =>
    chapter.title.toLowerCase().includes(query) ||
    String(chapter.chapterNumber).includes(query),
  );
});
const heroStats = computed(() => [
  { label: '热度', value: formatCount(book.value?.viewCount ?? 0), icon: View },
  { label: '收藏', value: formatCount(book.value?.favoriteCount ?? 0), icon: CollectionTag },
  { label: '喜欢', value: formatCount(book.value?.likeCount ?? 0), icon: Star },
]);

function readRememberedChapter(id: string): number | null {
  if (typeof window === 'undefined' || !id) return null;
  const raw = window.localStorage.getItem(`nw-mobile-book-reader:last-chapter:${id}`);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatCount(value: number): string {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  if (safeValue >= 10000) return `${(safeValue / 10000).toFixed(1).replace(/\.0$/, '')}万`;
  return `${safeValue}`;
}

function formatDate(value?: string): string {
  if (!value) return '最近更新';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '最近更新';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function characterPortrait(character: CharacterCard): string {
  if (!book.value?.novelId || !character.id) return '';
  if (character.portraitImagePath) {
    return safeImageUrl(`/api/novels/${book.value.novelId}/characters/${character.id}/portrait?w=120`);
  }
  return '';
}

function chapterMeta(chapter: BookStorePublicChapter): string {
  const parts = [formatBookWordCount(chapter.wordCount || 0)];
  if (chapter.updatedAt) parts.push(formatDate(chapter.updatedAt));
  return parts.join(' · ');
}

function goBack() {
  void router.push('/m');
}

function openCharacterDetail(characterId: string) {
  if (!authStore.isAuthenticated) {
    ElMessage.info('请先登录后查看角色详情');
    return;
  }
  activeCharacterId.value = characterId;
  characterDetailVisible.value = true;
}

function closeCharacterDetail() {
  characterDetailVisible.value = false;
  activeCharacterId.value = null;
}

function openReader(chapterNumber?: number | null) {
  const target = chapterNumber ?? rememberedChapter.value ?? firstChapterNumber.value;
  if (!target) {
    ElMessage.warning('这本书还没有可读章节');
    return;
  }
  void router.push(`/m/bookstore/${bookId.value}/read/${target}`);
}

function openShowcase() {
  void router.push(`/m/bookstore/${bookId.value}/showcase`);
}

function openAudioDrama() {
  void router.push(`/m/novel/${book.value?.novelId || bookId.value}/audio-drama`);
}

function openRelationGraph() {
  void router.push(`/m/fun/relation?novelId=${book.value?.novelId || bookId.value}`);
}

async function loadChapters(reset = false) {
  if (!bookId.value) return;
  chaptersLoading.value = true;
  try {
    const result = await getBookStorePublicChapterPage(bookId.value, {
      page: reset ? 1 : chapterPage.value + 1,
      pageSize: CHAPTER_PAGE_SIZE,
      order: chapterOrder.value,
    });
    chapterPage.value = result.page;
    chapterTotal.value = result.total;
    chapterHasMore.value = result.hasMore;
    const existing = new Set(chapters.value.map((chapter) => chapter.chapterNumber));
    const next = reset
      ? result.items
      : result.items.filter((chapter) => !existing.has(chapter.chapterNumber));
    chapters.value = reset ? next : [...chapters.value, ...next];
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '章节目录加载失败');
  } finally {
    chaptersLoading.value = false;
  }
}

async function changeOrder(order: ChapterOrder) {
  if (chapterOrder.value === order) return;
  chapterOrder.value = order;
  await loadChapters(true);
}

async function loadDetail() {
  if (!bookId.value) return;
  loading.value = true;
  try {
    const detail = await getBookStoreDetail(bookId.value);
    book.value = detail;
    await Promise.allSettled([
      loadChapters(true),
      loadCharacters(detail.novelId),
    ]);
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '作品详情加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadCharacters(novelId?: string) {
  if (!novelId) return;
  try {
    const list = await fetchCharacters(novelId);
    characters.value = list
      .filter((item) => item.name?.trim())
      .sort((a, b) => {
        const roleRank = (CHARACTER_ROLE_ORDER[a.role] ?? 99) - (CHARACTER_ROLE_ORDER[b.role] ?? 99);
        if (roleRank !== 0) return roleRank;
        return (a.firstAppearance ?? Number.MAX_SAFE_INTEGER) - (b.firstAppearance ?? Number.MAX_SAFE_INTEGER);
      })
      .slice(0, CHARACTER_LIMIT)
      .map((item) => ({
        id: item.id,
        name: item.name,
        role: item.role,
        position: item.position,
        cardBlurb: item.cardBlurb,
        personality: item.personality,
        portraitImagePath: item.portraitImagePath,
        firstAppearance: item.firstAppearance,
      }));
  } catch {
    characters.value = [];
  }
}

onMounted(() => {
  void loadDetail();
});
</script>

<template>
  <div class="mobile-book-detail-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell">
      <header class="mbd-topbar">
        <button class="mbd-icon-btn" type="button" aria-label="返回书城" @click="goBack">
          <el-icon :size="18"><ArrowLeft /></el-icon>
        </button>
        <div class="mbd-topbar__copy">
          <strong>{{ book?.title || '作品详情' }}</strong>
          <span>{{ rememberedChapter ? '上次读到第 ' + rememberedChapter + ' 章' : '先了解故事，再开始阅读' }}</span>
        </div>
      </header>

      <main class="mbd-main">
        <template v-if="loading">
          <section class="mbd-hero mbd-skeleton">
            <div class="mbd-cover mbd-skeleton-item"></div>
            <div class="mbd-hero__content">
              <p class="mbd-kicker mbd-skeleton-line"></p>
              <h1 class="mbd-skeleton-heading"></h1>
              <p class="mbd-author mbd-skeleton-line"></p>
              <div class="mbd-tags">
                <span class="mbd-skeleton-tag"></span>
                <span class="mbd-skeleton-tag"></span>
                <span class="mbd-skeleton-tag"></span>
              </div>
            </div>
          </section>
          <section class="mbd-cta-card mbd-skeleton">
            <div>
              <span class="mbd-skeleton-line"></span>
              <strong class="mbd-skeleton-line"></strong>
            </div>
            <div class="mbd-primary-btn mbd-skeleton-btn"></div>
          </section>
          <section class="mbd-stat-grid">
            <article class="mbd-stat mbd-skeleton">
              <div class="mbd-skeleton-icon"></div>
              <strong class="mbd-skeleton-line"></strong>
              <span class="mbd-skeleton-line"></span>
            </article>
            <article class="mbd-stat mbd-skeleton">
              <div class="mbd-skeleton-icon"></div>
              <strong class="mbd-skeleton-line"></strong>
              <span class="mbd-skeleton-line"></span>
            </article>
            <article class="mbd-stat mbd-skeleton">
              <div class="mbd-skeleton-icon"></div>
              <strong class="mbd-skeleton-line"></strong>
              <span class="mbd-skeleton-line"></span>
            </article>
          </section>
          <section class="mbd-section mbd-skeleton">
            <div class="mbd-section__head">
              <div>
                <p class="mbd-kicker mbd-skeleton-line"></p>
                <h2 class="mbd-skeleton-line"></h2>
              </div>
              <button class="mbd-link-btn mbd-skeleton-line"></button>
            </div>
            <p class="mbd-synopsis mbd-skeleton-paragraph"></p>
          </section>
          <section class="mbd-section mbd-catalog mbd-skeleton">
            <div class="mbd-section__head">
              <div>
                <p class="mbd-kicker mbd-skeleton-line"></p>
                <h2 class="mbd-skeleton-line"></h2>
              </div>
              <div class="mbd-order-switch">
                <button class="mbd-skeleton-tag"></button>
                <button class="mbd-skeleton-tag"></button>
              </div>
            </div>
            <div class="mbd-chapter-list">
              <div v-for="i in 4" :key="i" class="mbd-chapter mbd-skeleton">
                <span class="mbd-chapter__number mbd-skeleton-tag"></span>
                <span class="mbd-chapter__body">
                  <strong class="mbd-skeleton-line"></strong>
                  <small class="mbd-skeleton-line"></small>
                </span>
                <span class="mbd-skeleton-icon"></span>
              </div>
            </div>
          </section>
        </template>
        <template v-if="book">
          <section class="mbd-hero">
            <div class="mbd-cover">
              <LazyImage
                v-if="coverSrc"
                :src="coverSrc"
                :alt="book.title"
                aspect-ratio="3/4"
                :fallback-text="book.title"
                loading="eager"
              />
              <div v-else class="mbd-cover__fallback">{{ book.title.slice(0, 2) }}</div>
            </div>

            <div class="mbd-hero__content">
              <p class="mbd-kicker">{{ book.category || '精选故事' }}</p>
              <h1>{{ book.title }}</h1>
              <p class="mbd-author">{{ book.authorName || `${brand.displayName} 作者` }}</p>
              <div class="mbd-tags">
                <span v-for="tag in (book.tags || []).slice(0, 4)" :key="tag">{{ tag }}</span>
                <span>{{ formatPublishedChapterText(chapterCount) }}</span>
                <span>{{ formatBookWordCount(totalWords) }}</span>
              </div>
            </div>
          </section>

          <section class="mbd-cta-card">
            <div>
              <span>{{ progressText }}</span>
              <strong v-if="rememberedChapterSummary">{{ rememberedChapterSummary.title }}</strong>
              <strong v-else>从第一章进入这段命运</strong>
            </div>
            <button class="mbd-primary-btn" type="button" @click="openReader()">
              <span>{{ continueLabel }}</span>
              <el-icon :size="16"><ArrowRight /></el-icon>
            </button>
          </section>

          <section class="mbd-stat-grid">
            <article v-for="item in heroStats" :key="item.label" class="mbd-stat">
              <el-icon :size="16"><component :is="item.icon" /></el-icon>
              <strong>{{ item.value }}</strong>
              <span>{{ item.label }}</span>
            </article>
          </section>

          <section class="mbd-fun-grid">
            <button class="mbd-fun-item" type="button" @click="openShowcase" title="作品展示页">
              <div class="mbd-fun-item__icon mbd-fun-item__icon--showcase">
                <el-icon :size="18"><MagicStick /></el-icon>
              </div>
              <span>展示页</span>
            </button>
            <button class="mbd-fun-item" type="button" @click="openAudioDrama" title="AI广播剧">
              <div class="mbd-fun-item__icon mbd-fun-item__icon--audio">
                <el-icon :size="18"><Headset /></el-icon>
              </div>
              <span>广播剧</span>
            </button>
            <button class="mbd-fun-item" type="button" @click="openRelationGraph" title="角色关系图谱">
              <div class="mbd-fun-item__icon mbd-fun-item__icon--relation">
                <el-icon :size="18"><Share /></el-icon>
              </div>
              <span>关系图</span>
            </button>
          </section>

          <section class="mbd-section">
            <div class="mbd-section__head">
              <div>
                <p class="mbd-kicker">Story</p>
                <h2>故事概况</h2>
              </div>
              <button class="mbd-link-btn" type="button" @click="synopsisExpanded = !synopsisExpanded">
                {{ synopsisExpanded ? '收起' : '展开' }}
              </button>
            </div>
            <p class="mbd-synopsis" :class="{ 'is-expanded': synopsisExpanded }">{{ intro }}</p>
          </section>

          <section v-if="characters.length" class="mbd-section">
            <div class="mbd-section__head">
              <div>
                <p class="mbd-kicker">Cast</p>
                <h2>主要角色</h2>
              </div>
              <span class="mbd-section__hint">认识他们，再进入正文</span>
            </div>
            <div class="mbd-cast-row">
              <button
                v-for="character in characters"
                :key="character.id"
                class="mbd-character-card"
                type="button"
                @click="openCharacterDetail(character.id)"
              >
                <div class="mbd-avatar">
                  <LazyImage
                    v-if="characterPortrait(character)"
                    :src="characterPortrait(character)"
                    :alt="character.name"
                    aspect-ratio="1"
                    :fallback-text="character.name"
                  />
                  <el-icon v-else :size="22"><UserFilled /></el-icon>
                </div>
                <strong>{{ character.name }}</strong>
                <span>{{ character.position || CHARACTER_ROLE_LABELS[character.role] || '角色' }}</span>
              </button>
            </div>
          </section>

          <section class="mbd-section mbd-catalog">
            <div class="mbd-section__head">
              <div>
                <p class="mbd-kicker">Chapters</p>
                <h2>章节目录</h2>
              </div>
              <div class="mbd-order-switch" aria-label="章节排序">
                <button type="button" :class="{ 'is-active': chapterOrder === 'asc' }" @click="changeOrder('asc')">正序</button>
                <button type="button" :class="{ 'is-active': chapterOrder === 'desc' }" @click="changeOrder('desc')">倒序</button>
              </div>
            </div>

            <div class="mbd-catalog-search">
              <input
                v-model="chapterSearchQuery"
                type="text"
                placeholder="搜索章节标题或章节号…"
                class="mbd-search-input"
              />
            </div>

            <button v-if="rememberedChapter" class="mbd-last-read" type="button" @click="openReader(rememberedChapter)">
              <el-icon :size="16"><Sort /></el-icon>
              <span>回到上次阅读：第 {{ rememberedChapter }} 章</span>
              <el-icon :size="16"><ArrowRight /></el-icon>
            </button>

            <div class="mbd-chapter-list">
              <button
                v-for="chapter in filteredChapters"
                :key="chapter.chapterNumber"
                class="mbd-chapter"
                :class="{ 'is-last-read': chapter.chapterNumber === rememberedChapter }"
                type="button"
                @click="openReader(chapter.chapterNumber)"
              >
                <span class="mbd-chapter__number">第 {{ chapter.chapterNumber }} 章</span>
                <span class="mbd-chapter__body">
                  <strong>{{ chapter.title }}</strong>
                  <small>{{ chapterMeta(chapter) }}</small>
                </span>
                <span v-if="chapter.chapterNumber === rememberedChapter" class="mbd-chapter__badge">上次读到</span>
                <el-icon v-else :size="15"><ArrowRight /></el-icon>
              </button>
            </div>

            <div v-if="chapterSearchQuery && filteredChapters.length === 0" class="mbd-empty-state">
              <p>没有找到匹配的章节</p>
            </div>

            <button
              v-if="chapterHasMore && !chapterSearchQuery"
              class="mbd-load-more"
              type="button"
              :disabled="chaptersLoading"
              @click="loadChapters(false)"
            >
              {{ chaptersLoading ? '加载中...' : '展开更多章节' }}
            </button>
          </section>
        </template>
      </main>

      <MobileCharacterDetailSheet
        v-if="book?.novelId"
        :visible="characterDetailVisible"
        :novel-id="book.novelId"
        :character-id="activeCharacterId"
        @close="closeCharacterDetail"
      />
    </div>
  </div>
</template>
