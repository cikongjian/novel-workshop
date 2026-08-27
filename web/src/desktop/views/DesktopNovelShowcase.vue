<script setup lang="ts">
/**
 * 桌面端·作品展示页
 * 复用移动端 MobileNovelShowcase 的数据获取逻辑：
 * 角色卡 + 金句 + 漫画面板，支持书城/小说两种模式。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Share, MagicStick, Picture } from '@element-plus/icons-vue';
import { fetchCharacters, type CharacterProfile } from '../../api/characters';
import { fetchCharacterGrowth, type CharacterQuote } from '../../api/character-growth';
import {
  getBookStoreDetail,
  getBookStorePublicComic,
  bookStorePublicComicPanelUrl,
  type BookStorePublicComicPanel,
  type BookStore,
} from '../../api/bookstore';
import { fetchNovel, getCoverUrl } from '../../api/novels';
import { getComic, comicPanelUrl, type ComicManifest } from '../../api/comic';
import { CHARACTER_ROLE_LABELS, type NovelMetadata } from '../../types';
import { resolveCoverSrc } from '../../utils/deploy-path';
import { safeImageUrl } from '../../utils/safe-url';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import { useShareCard } from '../../composables/useShareCard';
import { brand } from '../../config/brand';

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

const MAX_CHARACTERS = 4;
const MAX_QUOTES = 6;
const MAX_COMIC_PANELS = 4;

const route = useRoute();
const router = useRouter();
const share = useShareCard();

const mode = ref<ShowcaseMode>('bookstore');
const loading = ref(true);

const book = ref<BookStore | null>(null);
const novel = ref<NovelMetadata | null>(null);
const characters = ref<ShowcaseCharacter[]>([]);
const quotes = ref<ShowcaseQuote[]>([]);
const comic = ref<ShowcaseComic | null>(null);

const targetId = computed(() => String(route.params.id || ''));
const novelId = computed(() => (mode.value === 'bookstore' ? book.value?.novelId || '' : targetId.value));
const title = computed(() => (mode.value === 'bookstore' ? book.value?.title || '' : novel.value?.title || ''));
const coverSrc = computed(() => {
  if (mode.value === 'bookstore') {
    return resolveCoverSrc(book.value?.coverUrl || book.value?.cover || '');
  }
  return novel.value ? getCoverUrl(novel.value.id, novel.value.coverVersion) : '';
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
  return novel.value?.authorName || '作者';
});
const stats = computed(() => {
  if (mode.value === 'bookstore') {
    return [
      { label: '阅读', value: book.value?.viewCount ?? 0 },
      { label: '点赞', value: book.value?.likeCount ?? 0 },
      { label: '收藏', value: book.value?.favoriteCount ?? 0 },
      { label: '章节', value: book.value?.chapterCount ?? 0 },
    ];
  }
  return [
    { label: '字数', value: novel.value?.wordCount ?? 0 },
    { label: '章节', value: novel.value?.totalChapters ?? 0 },
    { label: '已发布', value: novel.value?.publishedChapterCount ?? 0 },
  ];
});

function characterPortrait(character: ShowcaseCharacter): string {
  if (character.portraitImagePath) {
    return safeImageUrl(`/api${character.portraitImagePath}`);
  }
  return '';
}

function goBack() {
  if (window.history.length > 1) router.back();
  else router.push('/desktop');
}

async function doShare() {
  if (!share) return;
  try {
    await share.shareElement(document.body, { title: title.value || '作品展示' });
  } catch (err) {
    ElMessage.info('分享取消');
  }
}

async function loadBookstoreData() {
  if (!targetId.value) return;
  try {
    const detail = await getBookStoreDetail(targetId.value);
    book.value = detail;
    if (detail.novelId) {
      await loadCharacters(detail.novelId);
      await loadBookstoreComic(1);
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '加载失败');
  }
}

async function loadNovelData() {
  if (!targetId.value) return;
  try {
    const data = await fetchNovel(targetId.value);
    novel.value = data;
    await loadCharacters(targetId.value);
    await loadNovelComic(1);
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

async function loadBookstoreComic(chapterNumber: number) {
  if (!targetId.value) return;
  try {
    const manifest = await getBookStorePublicComic(targetId.value, chapterNumber);
    if (manifest && manifest.panels.length > 0) {
      comic.value = {
        chapterNumber,
        panels: manifest.panels
          .slice(0, MAX_COMIC_PANELS)
          .map((p: BookStorePublicComicPanel) => ({
            imageUrl: bookStorePublicComicPanelUrl(targetId.value, chapterNumber, p.imagePath),
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
  const query = route.query;
  if (query.type === 'novel' || route.path.includes('/novel/')) return 'novel';
  return 'bookstore';
}

function fmtNum(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return (n || 0).toLocaleString();
}

function quoteColor(score: number): string {
  if (score >= 90) return '#ff6b6b';
  if (score >= 75) return '#f59e0b';
  if (score >= 60) return '#10b981';
  return '#6b7280';
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

watch(() => route.params.id, async (newId) => {
  if (!newId) return;
  loading.value = true;
  if (mode.value === 'bookstore') {
    book.value = null;
    await loadBookstoreData();
  } else {
    novel.value = null;
    await loadNovelData();
  }
  loading.value = false;
});
</script>

<template>
  <div class="desktop-showcase">
    <StateView :loading="loading">
      <template v-if="title">
        <!-- 顶栏 -->
        <div class="showcase-topbar">
          <button class="showcase-back" @click="goBack">
            <el-icon :size="18"><ArrowLeft /></el-icon>
            <span>返回</span>
          </button>
          <h1 class="showcase-topbar__title">{{ title }}</h1>
          <button class="showcase-share" @click="doShare">
            <el-icon :size="18"><Share /></el-icon>
            <span>分享</span>
          </button>
        </div>

        <!-- 英雄区 -->
        <section class="showcase-hero nw-panel">
          <div class="showcase-hero__main">
            <div class="showcase-cover">
              <img v-if="coverSrc" :src="coverSrc" :alt="title" loading="lazy" />
              <div v-else class="showcase-cover__fallback">{{ title.slice(0, 2) || '书' }}</div>
            </div>
            <div class="showcase-hero__info">
              <span class="showcase-hero__kicker">{{ category || '精选故事' }}</span>
              <h1 class="showcase-hero__title">{{ title }}</h1>
              <div class="showcase-hero__author">
                <Icon name="bookOpen" :size="14" />
                <span>{{ authorName }}</span>
              </div>
              <div v-if="tags.length" class="showcase-hero__tags">
                <span v-for="tag in tags.slice(0, 5)" :key="tag" class="showcase-tag">{{ tag }}</span>
              </div>
              <div class="showcase-stats">
                <div v-for="s in stats" :key="s.label" class="showcase-stat">
                  <span class="showcase-stat__num">{{ fmtNum(s.value) }}</span>
                  <span class="showcase-stat__label">{{ s.label }}</span>
                </div>
              </div>
            </div>
          </div>
          <p v-if="hookText" class="showcase-hero__hook">{{ hookText }}</p>
        </section>

        <div class="showcase-grid">
          <!-- 左列：角色 -->
          <section v-if="characters.length > 0" class="showcase-card">
            <header class="showcase-section__head">
              <div>
                <p class="showcase-section__kicker">Cast</p>
                <h2 class="showcase-section__title">角色亮相</h2>
              </div>
              <span class="showcase-section__hint">认识他们，再进入故事</span>
            </header>
            <div class="showcase-cast">
              <article v-for="character in characters" :key="character.id" class="showcase-cast-card">
                <div class="showcase-cast-card__portrait">
                  <img v-if="characterPortrait(character)" :src="characterPortrait(character)" :alt="character.name" loading="lazy" />
                  <span v-else class="showcase-cast-card__initial">{{ character.name.slice(0, 1) }}</span>
                </div>
                <div class="showcase-cast-card__body">
                  <div class="showcase-cast-card__name">
                    {{ character.name }}
                    <span class="showcase-cast-card__role">
                      {{ character.position || CHARACTER_ROLE_LABELS[character.role] || '角色' }}
                    </span>
                  </div>
                  <p class="showcase-cast-card__blurb">
                    {{ character.cardBlurb || '神秘角色，故事中见真章' }}
                  </p>
                </div>
              </article>
            </div>
          </section>

          <!-- 右列：金句 -->
          <section v-if="quotes.length > 0" class="showcase-card">
            <header class="showcase-section__head">
              <div>
                <p class="showcase-section__kicker">Quotes</p>
                <h2 class="showcase-section__title">金句暴击</h2>
              </div>
              <span class="showcase-section__hint">先睹为快</span>
            </header>
            <div class="showcase-quotes">
              <article v-for="(q, i) in quotes" :key="i" class="showcase-quote">
                <div class="showcase-quote__mark">"</div>
                <p class="showcase-quote__text">{{ q.text }}</p>
                <div class="showcase-quote__meta">
                  <span class="showcase-quote__author">{{ q.characterName }}</span>
                  <span class="showcase-quote__chapter">第 {{ q.chapter }} 章</span>
                  <span v-if="q.score" class="showcase-quote__score" :style="{ color: quoteColor(q.score) }">{{ q.score }}分</span>
                </div>
              </article>
            </div>
          </section>
        </div>

        <!-- 漫画 -->
        <section v-if="comic && comic.panels.length > 0" class="showcase-card showcase-comic">
          <header class="showcase-section__head">
            <div>
              <p class="showcase-section__kicker">Comic</p>
              <h2 class="showcase-section__title">分镜预览 · 第 {{ comic.chapterNumber }} 章</h2>
            </div>
            <span class="showcase-section__hint">故事画面抢先看</span>
          </header>
          <div class="showcase-comic-grid">
            <figure v-for="(panel, i) in comic.panels" :key="i" class="showcase-comic-panel">
              <img :src="panel.imageUrl" :alt="panel.narration || `分镜 ${i + 1}`" loading="lazy" />
              <figcaption v-if="panel.dialogue || panel.narration" class="showcase-comic-panel__caption">
                <p v-if="panel.dialogue" class="showcase-comic-panel__dialogue">「{{ panel.dialogue }}」</p>
                <p v-if="panel.narration" class="showcase-comic-panel__narration">{{ panel.narration }}</p>
              </figcaption>
            </figure>
          </div>
        </section>

        <!-- 空状态 -->
        <div v-if="!characters.length && !quotes.length && (!comic || !comic.panels.length)" class="showcase-empty nw-state nw-state--empty">
          <p class="nw-state__title">作品内容正在生成中</p>
          <p class="nw-state__desc">角色、金句、漫画会随着创作自动填充</p>
        </div>
      </template>

      <div v-else class="showcase-empty nw-state nw-state--empty">
        <p class="nw-state__title">未找到作品</p>
        <p class="nw-state__desc">作品可能已下架或链接失效</p>
      </div>
    </StateView>
  </div>
</template>

<style scoped>
.desktop-showcase {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
  padding: var(--nw-space-5) 0;
  max-width: 1100px;
  margin: 0 auto;
}

.showcase-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-3);
}

.showcase-back,
.showcase-share {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--nw-border);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-primary);
  color: var(--nw-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.showcase-back:hover,
.showcase-share:hover {
  border-color: var(--nw-accent-start);
  color: var(--nw-accent-start);
}

.showcase-topbar__title {
  font-size: 15px;
  font-weight: 500;
  color: var(--nw-text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: center;
}

.showcase-hero {
  padding: var(--nw-space-5);
  background: var(--nw-bg-primary);
}

.showcase-hero__main {
  display: flex;
  gap: var(--nw-space-5);
  align-items: flex-start;
}

.showcase-cover {
  width: 140px;
  aspect-ratio: 6 / 8;
  border-radius: var(--nw-radius-lg);
  overflow: hidden;
  background: var(--nw-bg-secondary);
  flex-shrink: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.showcase-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.showcase-cover__fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background: var(--nw-accent-gradient);
  color: #fff;
  font-size: 36px;
  font-weight: 700;
  font-family: var(--nw-font-display);
}

.showcase-hero__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
}

.showcase-hero__kicker {
  font-size: 12px;
  font-weight: 600;
  color: var(--nw-accent-start);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.showcase-hero__title {
  font-size: 26px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0;
  line-height: 1.3;
  font-family: var(--nw-font-display);
}

.showcase-hero__author {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--nw-text-secondary);
}

.showcase-hero__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.showcase-tag {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: color-mix(in srgb, var(--nw-accent-start) 10%, transparent);
  color: var(--nw-accent-strong);
}

.showcase-stats {
  display: flex;
  gap: var(--nw-space-4);
  margin-top: var(--nw-space-3);
  padding-top: var(--nw-space-3);
  border-top: 1px dashed var(--nw-border);
}

.showcase-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.showcase-stat__num {
  font-size: 18px;
  font-weight: 700;
  color: var(--nw-text-primary);
  font-family: var(--nw-font-display);
}

.showcase-stat__label {
  font-size: 11px;
  color: var(--nw-text-muted);
}

.showcase-hero__hook {
  margin: var(--nw-space-4) 0 0 0;
  padding: var(--nw-space-4);
  border-left: 3px solid var(--nw-accent-start);
  background: color-mix(in srgb, var(--nw-accent-start) 4%, transparent);
  border-radius: var(--nw-radius-sm);
  font-size: 14px;
  line-height: 1.75;
  color: var(--nw-text-secondary);
  font-style: italic;
}

.showcase-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--nw-space-4);
}

@media (max-width: 900px) {
  .showcase-grid {
    grid-template-columns: 1fr;
  }
}

.showcase-card {
  padding: var(--nw-space-5);
  background: var(--nw-bg-primary);
}

.showcase-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--nw-space-4);
  padding-bottom: var(--nw-space-3);
  border-bottom: 1px solid var(--nw-border);
}

.showcase-section__kicker {
  font-size: 11px;
  font-weight: 600;
  color: var(--nw-text-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0 0 2px 0;
}

.showcase-section__title {
  font-size: 18px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0;
  font-family: var(--nw-font-display);
}

.showcase-section__hint {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.showcase-cast {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
}

.showcase-cast-card {
  display: flex;
  gap: var(--nw-space-3);
  padding: var(--nw-space-3);
  border-radius: var(--nw-radius-md);
  background: color-mix(in srgb, var(--nw-accent-start) 4%, transparent);
  transition: transform 0.2s ease;
}

.showcase-cast-card:hover {
  transform: translateX(4px);
  background: color-mix(in srgb, var(--nw-accent-start) 8%, transparent);
}

.showcase-cast-card__portrait {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--nw-accent-gradient);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.showcase-cast-card__portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.showcase-cast-card__initial {
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  font-family: var(--nw-font-display);
}

.showcase-cast-card__body {
  flex: 1;
  min-width: 0;
}

.showcase-cast-card__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.showcase-cast-card__role {
  font-size: 11px;
  font-weight: 500;
  color: var(--nw-accent-strong);
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nw-accent-start) 12%, transparent);
}

.showcase-cast-card__blurb {
  margin: 4px 0 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.showcase-quotes {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
}

.showcase-quote {
  position: relative;
  padding: var(--nw-space-3) var(--nw-space-4);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-secondary);
  border-left: 3px solid var(--nw-accent-start);
}

.showcase-quote__mark {
  position: absolute;
  top: 4px;
  left: 8px;
  font-size: 36px;
  line-height: 1;
  font-family: Georgia, serif;
  color: var(--nw-accent-start);
  opacity: 0.3;
}

.showcase-quote__text {
  margin: 0 0 var(--nw-space-2) 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--nw-text-primary);
  position: relative;
  z-index: 1;
}

.showcase-quote__meta {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  font-size: 12px;
  color: var(--nw-text-muted);
}

.showcase-quote__author {
  font-weight: 600;
  color: var(--nw-text-secondary);
}

.showcase-quote__chapter {
  padding: 1px 8px;
  background: var(--nw-bg-primary);
  border-radius: 999px;
}

.showcase-quote__score {
  margin-left: auto;
  font-weight: 700;
  font-family: var(--nw-font-display);
}

.showcase-comic {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.showcase-comic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--nw-space-3);
}

.showcase-comic-panel {
  margin: 0;
  border-radius: var(--nw-radius-md);
  overflow: hidden;
  background: var(--nw-bg-secondary);
}

.showcase-comic-panel img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  display: block;
}

.showcase-comic-panel__caption {
  padding: var(--nw-space-3);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.showcase-comic-panel__dialogue {
  margin: 0;
  font-size: 13px;
  color: var(--nw-text-primary);
  font-weight: 500;
}

.showcase-comic-panel__narration {
  margin: 0;
  font-size: 12px;
  color: var(--nw-text-muted);
  line-height: 1.5;
}

.showcase-empty {
  padding: var(--nw-space-6) var(--nw-space-5);
}
</style>
