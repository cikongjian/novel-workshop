<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowLeft, ChatDotRound, Reading, RefreshRight } from '@element-plus/icons-vue';
import { useRouter } from 'vue-router';
import { deleteBookComment, getMyBookCommentPage } from '../api/bookstore';
import type { BookStoreUserComment } from '../api/types';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import { usePullRefresh } from '../composables/usePullRefresh';
import { useThemeMode } from '../composables/useThemeMode';
import LazyImage from '../components/shared/LazyImage.vue';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const loading = ref(false);
const removingId = ref('');
const comments = ref<BookStoreUserComment[]>([]);
const commentPage = ref(0);
const commentTotal = ref(0);
const commentHasMore = ref(false);

onMounted(() => {
  void loadComments();
});

const { pullDistance, refreshing, triggered, pullContainerRef } = usePullRefresh({
  onRefresh: () => loadComments(true),
});

async function loadComments(reset = true) {
  loading.value = true;
  try {
    const result = await getMyBookCommentPage({
      page: reset ? 1 : commentPage.value + 1,
      pageSize: 20,
    });
    comments.value = reset ? result.items : [...comments.value, ...result.items];
    commentPage.value = result.page;
    commentTotal.value = result.total;
    commentHasMore.value = result.page < result.totalPages;
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '加载评论失败');
  } finally {
    loading.value = false;
  }
}

function goBack() {
  void router.push('/m/me');
}

function openBook(bookId: string) {
  void router.push(`/m/bookstore/${bookId}`);
}

function locateComment(item: BookStoreUserComment) {
  void router.push({
    path: `/m/bookstore/${item.bookId}/read`,
    query: {
      comments: '1',
      commentId: item.commentId,
    },
  });
}

async function removeComment(item: BookStoreUserComment) {
  removingId.value = item.commentId;
  try {
    await deleteBookComment(item.bookId, item.commentId);
    comments.value = comments.value.filter((comment) => comment.commentId !== item.commentId);
    commentTotal.value = Math.max(0, commentTotal.value - 1);
    ElMessage.success('评论已删除');
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '删除评论失败');
  } finally {
    removingId.value = '';
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '刚刚' : date.toLocaleDateString();
}
</script>

<template>
  <div ref="pullContainerRef" class="mobile-comments-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div
      class="mobile-focus-pull-indicator"
      :class="{
        'mobile-focus-pull-indicator--visible': pullDistance > 0,
        'mobile-focus-pull-indicator--triggered': triggered,
        'mobile-focus-pull-indicator--refreshing': refreshing,
      }"
      :style="{ '--pull-offset': pullDistance > 0 || refreshing ? '0px' : '-60px' }"
    >
      <span v-if="refreshing" class="mobile-focus-pull-spinner" />
      <span v-else class="mobile-focus-pull-arrow">↓</span>
      <span>{{ refreshing ? '刷新中...' : triggered ? '松手刷新' : '下拉刷新' }}</span>
    </div>
    <div class="mobile-focus-shell">
      <MobileTopbar title="我的评论" subtitle="互动留档">
        <template #actions>
          <button class="mobile-focus-button--secondary" type="button" @click="goBack">
            <el-icon :size="14"><ArrowLeft /></el-icon>
            返回
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-comments-main mobile-focus-main">
        <MobileSectionCard
          hero
          kicker="Comments"
          title="你发过的评论都在这里"
          hint="回看互动记录，随时回书继续读，也可以直接删掉"
          class="mobile-comments-hero"
        >
          <div class="mobile-comments-hero__actions">
            <button class="mobile-focus-button--primary" type="button" @click="loadComments(true)">
              <el-icon :size="14"><RefreshRight /></el-icon>
              刷新评论
            </button>
            <button class="mobile-focus-button--secondary" type="button" @click="router.push('/m')">
              去书城
            </button>
          </div>
        </MobileSectionCard>

        <MobileSectionCard kicker="Records" :title="`共 ${commentTotal || comments.length} 条评论`" class="mobile-comments-panel">
          <div v-if="loading" class="mobile-focus-loading">
            <el-skeleton animated :rows="6" />
          </div>

          <div v-else-if="comments.length" class="mobile-focus-list">
            <article v-for="item in comments" :key="item.commentId" class="mobile-comments-card">
              <button class="mobile-comments-card__main" type="button" @click="openBook(item.bookId)">
                <div class="mobile-comments-card__cover">
                  <LazyImage
                    v-if="item.bookCover"
                    :src="item.bookCover"
                    :alt="item.bookTitle"
                    :fallback-text="item.bookTitle"
                    aspect-ratio="6/8"
                  />
                  <div v-else class="mobile-comments-card__fallback">
                    <span>{{ item.bookTitle.charAt(0) }}</span>
                  </div>
                </div>

                <div class="mobile-comments-card__body">
                  <div class="mobile-focus-item__top">
                    <strong>{{ item.bookTitle }}</strong>
                    <span>{{ item.bookCategory || '未分类' }}</span>
                  </div>
                  <p class="mobile-comments-card__content">{{ item.content }}</p>
                  <div class="mobile-comments-card__meta">
                    <span><el-icon><ChatDotRound /></el-icon>我的评论</span>
                    <span>{{ formatDate(item.createdAt) }}</span>
                  </div>
                </div>
              </button>

              <div class="mobile-comments-card__actions">
                <button class="mobile-focus-button--secondary" type="button" @click="locateComment(item)">
                  <el-icon :size="14"><Reading /></el-icon>
                  定位评论
                </button>
                <button
                  class="mobile-focus-button--ghost"
                  type="button"
                  :disabled="removingId === item.commentId"
                  @click="removeComment(item)"
                >
                  {{ removingId === item.commentId ? '处理中...' : '删除评论' }}
                </button>
              </div>
            </article>
            <button
              v-if="commentHasMore"
              class="mobile-focus-button--secondary"
              type="button"
              :disabled="loading"
              @click="loadComments(false)"
            >
              继续加载评论
            </button>
          </div>

          <div v-else class="mobile-focus-empty">
            <strong>还没有评论记录</strong>
            <p>去书城读几本，留下看法，这里就会变成你的互动归档。</p>
            <button class="mobile-focus-button--primary" type="button" @click="router.push('/m')">
              去逛书城
            </button>
          </div>
        </MobileSectionCard>
      </main>
    </div>

    <MobileWorkbenchDock />
  </div>
</template>

<style scoped>
.mobile-comments-page {
  --mobile-focus-accent: var(--star-brand-sky, #0ea5e9);
  --mobile-focus-accent-strong: var(--star-brand-teal, #14b8a6);
  --mobile-focus-tint: color-mix(in srgb, var(--mobile-focus-accent) 14%, transparent);
}

.mobile-comments-main {
  gap: 14px;
}

.mobile-comments-hero {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--mobile-focus-accent) 12%, transparent), transparent 34%),
    linear-gradient(180deg, var(--nw-bg-primary), color-mix(in srgb, var(--mobile-focus-accent) 6%, var(--nw-bg-secondary)));
}

.mobile-comments-hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.mobile-comments-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 8%, var(--nw-border));
  background: var(--nw-bg-card, var(--nw-bg-secondary));
}

.mobile-comments-card__main {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
}

.mobile-comments-card__cover {
  width: 88px;
  aspect-ratio: 6 / 8;
  overflow: hidden;
  border-radius: 16px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--star-brand-sky, #172033) 35%, var(--nw-bg-card)) 0%, color-mix(in srgb, var(--star-brand-sky, #2c4468) 55%, var(--nw-bg-card)) 100%);
}

.mobile-comments-card__cover :deep(.lazy-image-wrapper),
.mobile-comments-card__fallback {
  width: 100%;
  height: 100%;
  display: block;
}

.mobile-comments-card__fallback {
  display: grid;
  place-items: center;
}

.mobile-comments-card__fallback span {
  color: var(--nw-text-primary);
  font-size: 26px;
  font-weight: 800;
  opacity: 0.86;
}

.mobile-comments-card__body {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.mobile-comments-card__content {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--nw-text-secondary);
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.mobile-comments-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mobile-comments-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 8%, var(--nw-bg-secondary));
  color: var(--mobile-focus-accent);
  font-size: 11px;
  font-weight: 700;
}

.mobile-comments-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
