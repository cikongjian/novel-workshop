<script setup lang="ts">
/**
 * 桌面端·作品详情
 * 真实数据：getBookStoreDetail（详情/简介/互动）+ getBookStorePublicChapters（公开章节）。
 * 复用共享组件 StateView / Icon，复用 desktop.css 的面板/表格基元。
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAsyncData } from '../../composables/useAsyncData';
import { extractApiErrorMessage, isAbortError } from '../../api/errors';
import {
  getBookStoreDetail,
  getBookStorePublicChapters,
  likeBook,
  favoriteBook,
  getBookLikeStatus,
  getBookFavoriteStatus,
  getBookComments,
  createBookComment,
  deleteBookComment,
  type BookStorePublicChapter,
  type BookStoreComment,
} from '../../api/bookstore';
import { fetchForksByNovel, type ForkRecord } from '../../api/forks';
import type { BookStore } from '../../api/types';
import { resolveCoverSrc } from '../../utils/deploy-path';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import DesktopSideStoryPlaza from '../components/DesktopSideStoryPlaza.vue';
import DesktopPlotVotePanel from '../components/DesktopPlotVotePanel.vue';

interface DetailPayload {
  detail: BookStore;
  chapters: BookStorePublicChapter[];
}

interface ForkedFromInfo {
  originalNovelId: string;
  originalTitle: string;
  chapter: number;
  forkedBy?: string;
}

const route = useRoute();
const router = useRouter();
const bookId = computed(() => String(route.params.id || ''));

const { data, loading, error, run } = useAsyncData<DetailPayload, []>(
  async () => {
    const [detail, chapters] = await Promise.all([
      getBookStoreDetail(bookId.value),
      getBookStorePublicChapters(bookId.value),
    ]);
    return { detail, chapters };
  },
  { immediate: true },
);

// 同一组件复用时（book/:id → book/:otherId）重新拉取
watch(bookId, () => { void run(); });

const errorMessage = computed(() => {
  if (!error.value || isAbortError(error.value)) return '';
  return extractApiErrorMessage(error.value);
});
const stateError = computed(() => (errorMessage.value ? error.value : null));

const detail = computed<BookStore | null>(() => data.value?.detail ?? null);
const chapters = computed<BookStorePublicChapter[]>(() => data.value?.chapters ?? []);
const cover = computed(() => resolveCoverSrc(detail.value?.cover || detail.value?.coverUrl));
const forkedFrom = computed<ForkedFromInfo | null>(() => ((detail.value as (BookStore & { forkedFrom?: ForkedFromInfo }) | null)?.forkedFrom ?? null));
const forkRecords = ref<ForkRecord[]>([]);
const forkRecordsLoading = ref(false);

function fmt(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n);
}
function fmtDate(s?: string | Date): string {
  const d = typeof s === 'string' ? new Date(s) : s;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('zh-CN') : '—';
}

function back(): void {
  router.push('/desktop');
}

/** 互动：点赞 / 收藏 */
const liked = ref(false);
const favorited = ref(false);
const likeCount = ref(0);
const favoriteCount = ref(0);

async function loadInteractStatus(): Promise<void> {
  if (!detail.value) return;
  likeCount.value = detail.value.likeCount;
  favoriteCount.value = detail.value.favoriteCount;
  try {
    const [lk, fv] = await Promise.all([
      getBookLikeStatus(detail.value.id),
      getBookFavoriteStatus(detail.value.id),
    ]);
    liked.value = lk.liked;
    favorited.value = fv.favorited;
  } catch {
    // 未登录时忽略
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

/** 评论 */
const comments = ref<BookStoreComment[]>([]);
const newComment = ref('');
const postingComment = ref(false);
const sideStoriesVisible = ref(false);
const plotVotesVisible = ref(false);
const commentsLoading = ref(false);
const deletingCommentId = ref<string | null>(null);

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

async function removeComment(commentId: string): Promise<void> {
  if (!detail.value) return;
  deletingCommentId.value = commentId;
  try {
    await deleteBookComment(detail.value.id, commentId);
    comments.value = comments.value.filter((item) => item.id !== commentId);
    ElMessage.success('评论已删除');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  } finally {
    deletingCommentId.value = null;
  }
}

async function openReader(num: number): Promise<void> {
  await router.push(`/desktop/book/${bookId.value}/read/${num}`);
}

async function loadForkRecords(): Promise<void> {
  if (!detail.value?.novelId) return;
  forkRecordsLoading.value = true;
  try {
    const res = await fetchForksByNovel(detail.value.novelId);
    forkRecords.value = res.records;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '分支记录加载失败'));
  } finally {
    forkRecordsLoading.value = false;
  }
}

function openOriginalForkSource(): void {
  if (!forkedFrom.value) return;
  router.push(`/desktop/novel/${forkedFrom.value.originalNovelId}`);
}

function openForkedNovel(record: ForkRecord): void {
  router.push(`/desktop/novel/${record.forkedNovelId}`);
}

/** 详情数据就绪后加载互动状态 + 评论 */
watch(detail, () => {
  if (detail.value) {
    void loadInteractStatus();
    void loadComments();
    void loadForkRecords();
  }
});
</script>

<template>
  <div class="desktop-book-detail">
    <button class="desktop-back" @click="back">
      <Icon name="arrowLeft" :size="16" /> 返回作品列表
    </button>

    <StateView :loading="loading && !data" :error="stateError" :error-message="errorMessage" @retry="run">
      <template #loading>
        <div class="desktop-detail-skeleton" />
      </template>

      <template v-if="detail">
        <!-- 头部 -->
        <div class="nw-panel detail-header">
          <div class="detail-cover" :style="cover ? { backgroundImage: `url(${cover})` } : {}">
            <span v-if="!cover" class="detail-cover-fallback">{{ detail.title.slice(0, 1) }}</span>
          </div>
          <div class="detail-meta">
            <div class="detail-tags">
              <span class="nw-tag">{{ detail.category || '未分类' }}</span>
              <span v-for="t in detail.tags" :key="t" class="nw-tag nw-tag--muted">{{ t }}</span>
              <span class="nw-tag nw-tag--muted">{{ detail.publishStatus }}</span>
            </div>
            <h1 class="detail-title">{{ detail.title }}</h1>
            <div class="detail-sub">
              <Icon name="pen" :size="14" /> {{ detail.authorName || '匿名' }}
              <span class="detail-dot" />
              更新于 {{ fmtDate(detail.updateTime) }}
            </div>
            <p v-if="detail.description" class="detail-synopsis">{{ detail.description }}</p>
            <div class="detail-actions">
              <button class="desktop-btn desktop-btn--primary" @click="openReader(chapters[0]?.chapterNumber ?? 1)">
                <Icon name="book" :size="16" /> 开始阅读
              </button>
              <button class="desktop-btn" :class="{ 'interact-active': liked }" :disabled="!detail.id" @click="toggleLike">
                点赞 {{ likeCount }}
              </button>
              <button class="desktop-btn" :class="{ 'interact-active': favorited }" :disabled="!detail.id" @click="toggleFavorite">
                收藏 {{ favoriteCount }}
              </button>
              <button class="desktop-btn" :disabled="!detail.novelId" @click="sideStoriesVisible = true">
                <Icon name="bookmark" :size="14" /> 番外
              </button>
              <button class="desktop-btn" :disabled="!detail.novelId" @click="plotVotesVisible = true">
                <Icon name="sparkles" :size="14" /> 投票
              </button>
            </div>
          </div>
        </div>

        <button v-if="forkedFrom" class="desktop-fork-banner" type="button" @click="openOriginalForkSource">
          <span class="desktop-fork-banner-icon"><Icon name="gitBranch" :size="18" /></span>
          <span class="desktop-fork-banner-text">分支自《{{ forkedFrom.originalTitle }}》第 {{ forkedFrom.chapter }} 章</span>
          <span class="desktop-fork-banner-action">查看原作 <Icon name="chevronRight" :size="14" /></span>
        </button>

        <!-- 互动数据条 -->
        <div class="detail-stats">
          <div class="detail-stat"><span class="detail-stat-num">{{ fmt(detail.viewCount || 0) }}</span><span class="detail-stat-label">阅读</span></div>
          <div class="detail-stat"><span class="detail-stat-num">{{ detail.likeCount || 0 }}</span><span class="detail-stat-label">点赞</span></div>
          <div class="detail-stat"><span class="detail-stat-num">{{ detail.favoriteCount || 0 }}</span><span class="detail-stat-label">收藏</span></div>
          <div class="detail-stat"><span class="detail-stat-num">{{ detail.commentCount || 0 }}</span><span class="detail-stat-label">评论</span></div>
          <div class="detail-stat"><span class="detail-stat-num">{{ detail.publishedChapterCount || 0 }}</span><span class="detail-stat-label">章节</span></div>
          <div class="detail-stat"><span class="detail-stat-num">{{ fmt(detail.wordCount || 0) }}</span><span class="detail-stat-label">字数</span></div>
        </div>

        <!-- 章节 + 评论 -->
        <div class="detail-body">
          <div class="nw-panel">
            <div class="nw-panel__head">
              <h2 class="nw-panel__title"><Icon name="bookOpen" :size="16" /> 章节目录</h2>
              <span class="desktop-section-count">{{ chapters.length }} 章</span>
            </div>
            <div class="reader-chapter-list">
              <div
                v-for="ch in chapters"
                :key="ch.chapterNumber"
                class="reader-chapter-item"
                @click="openReader(ch.chapterNumber)"
              >
                <div class="reader-chapter-num">{{ ch.chapterNumber }}</div>
                <div class="reader-chapter-info">
                  <div class="reader-chapter-title">{{ ch.title || `第${ch.chapterNumber}章` }}</div>
                  <div class="reader-chapter-meta">
                    <span><Icon name="pen" :size="11" /> {{ fmt(ch.wordCount || 0) }} 字</span>
                    <span class="reader-chapter-date"><Icon name="refresh" :size="11" /> {{ fmtDate(ch.updatedAt) }}</span>
                  </div>
                </div>
                <Icon name="chevronDown" :size="14" class="reader-chapter-arrow" />
              </div>
              <div v-if="!chapters.length" class="detail-empty-row">暂无公开章节</div>
            </div>
          </div>

          <div class="nw-panel">
            <div class="nw-panel__head">
              <h2 class="nw-panel__title"><Icon name="gitBranch" :size="16" /> 分支记录 <span class="desktop-section-count">{{ forkRecords.length }}</span></h2>
              <button class="desktop-btn" type="button" :disabled="forkRecordsLoading" @click="loadForkRecords">
                <Icon name="refresh" :size="14" /> {{ forkRecordsLoading ? '刷新中' : '刷新' }}
              </button>
            </div>
            <StateView :loading="forkRecordsLoading" :empty="!forkRecordsLoading && !forkRecords.length">
              <template #empty>
                <p class="nw-state__title">还没有分支作品</p>
                <p class="nw-state__desc">读者可以在阅读页从指定章节创建自己的剧情分支。</p>
              </template>
              <div class="desktop-fork-record-list">
                <button v-for="record in forkRecords" :key="record.id" class="desktop-fork-record" type="button" @click="openForkedNovel(record)">
                  <span class="desktop-fork-record-chapter">第 {{ record.fromChapter }} 章</span>
                  <strong>{{ record.forkedByName || '读者' }} 创建了分支</strong>
                  <small>{{ fmtDate(record.createdAt) }} · {{ record.isPublic ? '公开' : '私有' }}</small>
                  <Icon name="chevronRight" :size="14" />
                </button>
              </div>
            </StateView>
          </div>

          <!-- 评论 -->
          <div v-if="detail" class="nw-panel">
            <div class="nw-panel__head">
              <h2 class="nw-panel__title">评论 <span class="desktop-section-count">{{ comments.length }}</span></h2>
            </div>
            <div class="detail-comments">
              <div class="comment-input-row comment-input-row--stacked">
                <textarea v-model="newComment" class="nw-input" rows="4" maxlength="500" placeholder="写下你的阅读感受，和其他读者交流。" />
                <div class="comment-input-foot">
                  <span>{{ newComment.trim().length }}/500</span>
                  <button class="desktop-btn desktop-btn--primary" :disabled="postingComment || !newComment.trim()" @click="postComment">
                    {{ postingComment ? '发布中…' : '发布评论' }}
                  </button>
                </div>
              </div>
              <StateView :loading="commentsLoading" :empty="!commentsLoading && !comments.length">
                <template #empty>
                  <p class="nw-state__title">还没有评论</p>
                  <p class="nw-state__desc">成为第一个留下阅读反馈的人。</p>
                </template>
                <div class="reader-comment-list">
                  <article v-for="c in comments" :key="c.id" class="reader-comment-item">
                    <div class="reader-comment-avatar">{{ (c.username || c.authorName || '?').slice(0, 1) }}</div>
                    <div class="reader-comment-body">
                      <div class="reader-comment-meta">
                        <strong>{{ c.username || c.authorName || '读者' }}</strong>
                        <span>{{ fmtDate(c.createdAt) }}</span>
                      </div>
                      <p>{{ c.content }}</p>
                      <div class="reader-comment-actions">
                        <button class="desktop-btn" type="button" :disabled="deletingCommentId === c.id" @click="removeComment(c.id)">
                          {{ deletingCommentId === c.id ? '删除中…' : '删除' }}
                        </button>
                      </div>
                    </div>
                  </article>
                </div>
              </StateView>
            </div>
          </div>
        </div>

        <DesktopSideStoryPlaza v-if="detail" v-model:visible="sideStoriesVisible" :novel-id="detail.novelId" :title="detail.title" />
        <DesktopPlotVotePanel v-if="detail" v-model:visible="plotVotesVisible" :novel-id="detail.novelId" :title="detail.title" />
      </template>
    </StateView>
  </div>
</template>
