<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ChatDotRound, CircleClose, CollectionTag, EditPen, Lock, Plus, Reading, RefreshRight, SetUp, View } from '@element-plus/icons-vue';
import { useRoute, useRouter } from 'vue-router';
import RealNameStatusBanner from '../components/auth/RealNameStatusBanner.vue';
import { resolveCoverSrc } from '../utils/deploy-path';
import {
  getMyPublishedBookPage,
  publishToBookstore,
  resubmitBookCover,
  unlockBookCover,
  unpublishBook,
  updateBookStore,
} from '../api/bookstore';
import type { BookStore } from '../api/types';
import { fetchNovelSummaries } from '../api/novels';
import { useRealNameAccess } from '../composables/useRealNameAccess';
import { usePullRefresh } from '../composables/usePullRefresh';
import type { NovelMetadata } from '../types';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileStatGroup from '../components/mobile-focus/MobileStatGroup.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import ForkPublishApprovalSheet from '../components/mobile-entry/ForkPublishApprovalSheet.vue';
import { checkForkPublish } from '../api/forks';
import ChapterPublishManagerDialog from '../components/bookstore/ChapterPublishManagerDialog.vue';
import { BOOKSTORE_CATEGORIES, BOOKSTORE_TAGS } from '../constants/bookstore-options';
import { useThemeMode } from '../composables/useThemeMode';
import LazyImage from '../components/shared/LazyImage.vue';

interface ManagedBook extends BookStore {
  coverUrl?: string;
  coverAuditStatus?: 'pending_review' | 'pass' | 'reject';
  coverLocked?: boolean;
  coverAuditRejectReason?: string;
}

const router = useRouter();
const route = useRoute();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const {
  ensureRealNameAction,
  handleRealNameBlockedError,
  realNameEnabled,
  loadRealNamePolicy,
} = useRealNameAccess();

const loading = ref(false);
const publishing = ref(false);
const editing = ref(false);
const availableNovelsLoading = ref(false);
const availableNovelsLoaded = ref(false);
const publishDialogVisible = ref(false);
const forkApprovalVisible = ref(false);
const forkApprovalNovelId = ref('');
const editDialogVisible = ref(false);
const chapterManagerVisible = ref(false);
const books = ref<ManagedBook[]>([]);
const bookPage = ref(0);
const bookTotal = ref(0);
const bookHasMore = ref(false);
const availableNovels = ref<NovelMetadata[]>([]);
const currentEditBook = ref<ManagedBook | null>(null);
const currentChapterBook = ref<ManagedBook | null>(null);

const publishForm = ref({
  novelId: '',
  category: '',
  tags: [] as string[],
  description: '',
});

const editForm = ref({
  tags: [] as string[],
  description: '',
});

const availablePublishNovels = computed(() => {
  const publishedNovelIds = new Set(books.value.map((book) => book.novelId));
  return availableNovels.value.filter((novel) => !publishedNovelIds.has(novel.id));
});

const totalViews = computed(() => books.value.reduce((sum, book) => sum + (book.viewCount ?? 0), 0));
const totalComments = computed(() => books.value.reduce((sum, book) => sum + (book.commentCount ?? 0), 0));
const pendingActions = computed(() => books.value.filter((book) => needsAttention(book)).length);
const approvedBooks = computed(() => books.value.filter((book) => canManageChapters(book)).length);
const showContestPublishingRealNameBanner = false;
const showRealNameBanner = computed(() => showContestPublishingRealNameBanner && realNameEnabled.value);

const heroStats = computed(() => [
  { label: '正常上架', value: approvedBooks.value },
  { label: '待处理', value: pendingActions.value },
  { label: '累计阅读', value: totalViews.value },
]);

onMounted(() => {
  void loadRealNamePolicy();
  void loadBooks();
});

const { pullDistance, refreshing, triggered, pullContainerRef } = usePullRefresh({
  onRefresh: async () => {
    await loadBooks(true);
    if (publishDialogVisible.value || availableNovelsLoaded.value) {
      await ensureAvailableNovelsLoaded(true);
    }
  },
});

watch(publishDialogVisible, (visible) => {
  if (!visible) return;
  void ensureAvailableNovelsLoaded();
});

async function loadBooks(reset = true) {
  loading.value = true;
  try {
    const result = await getMyPublishedBookPage({
      page: reset ? 1 : bookPage.value + 1,
      pageSize: 20,
    });
    books.value = (reset ? result.items : [...books.value, ...result.items]) as ManagedBook[];
    bookPage.value = result.page;
    bookTotal.value = result.total;
    bookHasMore.value = result.page < result.totalPages;
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '加载发布列表失败');
  } finally {
    loading.value = false;
  }
}

let availableNovelsPromise: Promise<void> | null = null;

async function ensureAvailableNovelsLoaded(force = false): Promise<void> {
  if (!force && availableNovelsLoaded.value) return;
  if (availableNovelsPromise) return availableNovelsPromise;

  availableNovelsPromise = (async () => {
    availableNovelsLoading.value = true;
    try {
      availableNovels.value = await fetchNovelSummaries();
      availableNovelsLoaded.value = true;
    } catch (error: any) {
      ElMessage.error(error?.response?.data?.error || '加载作品列表失败');
    } finally {
      availableNovelsLoading.value = false;
      availableNovelsPromise = null;
    }
  })();

  return availableNovelsPromise;
}

function goBack() {
  void router.push('/m/me');
}

function openBook(bookId: string) {
  void router.push(`/m/bookstore/${bookId}`);
}

function openWorkspace(novelId: string) {
  void router.push(`/m/novel/${novelId}/chapters`);
}

function openChapterManager(book: ManagedBook) {
  currentChapterBook.value = book;
  chapterManagerVisible.value = true;
}

function handleNovelSelect(novelId: string) {
  const novel = availablePublishNovels.value.find((item) => item.id === novelId);
  if (!novel) return;
  publishForm.value.description = novel.synopsis || novel.description || '';
}

async function openPublishDialog() {
  if (!(await ensureRealNameAction('bookPublishing', {
    router,
    isMobile: true,
    redirect: route.fullPath,
  }))) {
    return;
  }
  publishForm.value = {
    novelId: '',
    category: '',
    tags: [],
    description: '',
  };
  publishDialogVisible.value = true;
  void ensureAvailableNovelsLoaded();
}

async function submitPublish() {
  if (!publishForm.value.novelId) {
    ElMessage.warning('请选择要发布的作品');
    return;
  }
  if (!publishForm.value.category) {
    ElMessage.warning('请选择作品分类');
    return;
  }
  // 分叉作品发布闸门：必须先通过原作者审批
  try {
    const check = await checkForkPublish(publishForm.value.novelId);
    if (check.isFork && !check.canPublish) {
      publishDialogVisible.value = false;
      forkApprovalNovelId.value = publishForm.value.novelId;
      await nextTick();
      setTimeout(() => { forkApprovalVisible.value = true; }, 300);
      return;
    }
  } catch (e: any) {
    console.warn('[publish] fork pre-check failed:', e?.response?.status, e?.response?.data?.error);
  }
  if (!(await ensureRealNameAction('bookPublishing', {
    router,
    isMobile: true,
    redirect: route.fullPath,
  }))) {
    return;
  }

  publishing.value = true;
  try {
    await publishToBookstore({
      novelId: publishForm.value.novelId,
      category: publishForm.value.category,
      tags: publishForm.value.tags,
      description: publishForm.value.description,
    });
    ElMessage.success('已发布到书城');
    publishDialogVisible.value = false;
    await Promise.all([loadBooks(true), ensureAvailableNovelsLoaded(true)]);
  } catch (error: any) {
    const errStatus = error?.response?.status;
    const errMsg = error?.response?.data?.error || '';

    // 实名认证拦截
    if (handleRealNameBlockedError(error, {
      scene: 'bookPublishing',
      router,
      isMobile: true,
      redirect: route.fullPath,
    })) {
      return;
    }
    // 分叉作品发布被拦截（403 + 非实名认证）：弹出发布申请表单
    if (errStatus === 403 && !errMsg.includes('实名')) {
      publishDialogVisible.value = false;
      forkApprovalNovelId.value = publishForm.value.novelId;
      await nextTick();
      setTimeout(() => { forkApprovalVisible.value = true; }, 300);
      return;
    }
    ElMessage.error(errMsg || '发布失败');
  } finally {
    publishing.value = false;
  }
}

function openEditDialog(book: ManagedBook) {
  currentEditBook.value = book;
  editForm.value = {
    tags: [...(book.tags ?? [])],
    description: book.description || '',
  };
  editDialogVisible.value = true;
}

async function submitEdit() {
  if (!currentEditBook.value) return;

  editing.value = true;
  try {
    await updateBookStore(currentEditBook.value.id, {
      tags: editForm.value.tags,
      description: editForm.value.description,
    });
    ElMessage.success('作品信息已更新');
    editDialogVisible.value = false;
    await loadBooks(true);
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '更新失败');
  } finally {
    editing.value = false;
  }
}

async function handleUnpublish(book: ManagedBook) {
  try {
    await ElMessageBox.confirm(`确定下架《${book.title}》吗？`, '取消发布', {
      confirmButtonText: '确定下架',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await unpublishBook(book.id);
    ElMessage.success('已取消发布');
    await loadBooks(true);
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.error || '操作失败');
    }
  }
}

async function handleUnlockCover(book: ManagedBook) {
  try {
    await ElMessageBox.confirm(
      `调整《${book.title}》封面前会先从书城撤下。换好封面后，再点“重新上架”。`,
      '调整封面',
      {
        confirmButtonText: '开始调整',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
    await unlockBookCover(book.id);
    ElMessage.success('封面已可调整，作品已暂时下架');
    await loadBooks(true);
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.response?.data?.error || '操作失败');
    }
  }
}

async function handleResubmit(book: ManagedBook) {
  try {
    await resubmitBookCover(book.id);
    ElMessage.success('已提交重新上架');
    await loadBooks(true);
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '提交失败，请先更换新封面');
  }
}

function shouldShowResubmit(book: ManagedBook): boolean {
  if (book.coverLocked) return false;
  if (book.coverAuditStatus === 'pending_review') return false;
  return book.coverAuditStatus === 'reject' || book.publishStatus === 'pending';
}

function needsAttention(book: ManagedBook): boolean {
  return shouldShowResubmit(book) || book.auditStatus === 'reject';
}

function canManageChapters(book: ManagedBook): boolean {
  return book.publishStatus === 'approved';
}

function getChapterManageStatusText(book: ManagedBook): string {
  if (canManageChapters(book)) {
    return '作品已在书城展示，可立即发布或定时发布章节';
  }
  return '作品正在准备上架，章节发布入口会在上架后开启';
}

function getStatusText(book: ManagedBook): string {
  if (book.publishStatus === 'approved') return '书城展示中';
  if (book.publishStatus === 'pending') return '待重新上架';
  if (book.publishStatus === 'offline') return '已下架';
  if (book.publishStatus === 'rejected') return '需调整后上架';
  return '上架处理中';
}

function getAuditText(status: string): string {
  const map: Record<string, string> = {
    pending: '内容同步中',
    manual_review: '内容确认中',
    pass: '内容已就绪',
    reject: '内容需调整',
  };
  return map[status] ?? status;
}

function getCoverText(status?: string): string {
  const map: Record<string, string> = {
    pending_review: '封面同步中',
    pass: '封面已就绪',
    reject: '封面需调整',
  };
  return map[status ?? 'pending_review'] ?? '封面同步中';
}
function formatDateTime(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<template>
  <div ref="pullContainerRef" class="mobile-published-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
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
      <MobileTopbar title="管理发布" subtitle="书城作品">
        <template #actions>
          <button class="mobile-focus-button--secondary" type="button" @click="goBack">
            <el-icon :size="14"><ArrowLeft /></el-icon>
            返回
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-focus-main mobile-published-main">
        <MobileSectionCard hero kicker="Publishing" title="移动端管理你的书城作品" hint="查状态、改信息、发布章节和调整封面，都放在这一页" class="mobile-published-hero">
          <RealNameStatusBanner v-if="showRealNameBanner" scene="bookPublishing" is-mobile compact />
          <div class="mobile-published-hero__actions">
            <button class="mobile-focus-button--primary" type="button" @click="openPublishDialog">
              <el-icon :size="14"><Plus /></el-icon>
              发布新作品
            </button>
            <button class="mobile-focus-button--secondary" type="button" @click="loadBooks(true)">
              <el-icon :size="14"><RefreshRight /></el-icon>
              刷新列表
            </button>
          </div>
          <MobileStatGroup :items="heroStats" />
          <p class="mobile-published-hero__hint">累计评论 {{ totalComments }} 条，需要调整的作品 {{ pendingActions }} 本。</p>
        </MobileSectionCard>

        <MobileSectionCard kicker="Library" :title="`已发布 ${bookTotal || books.length} 本`" class="mobile-published-panel">
          <div v-if="loading" class="mobile-focus-loading">
            <el-skeleton animated :rows="6" />
          </div>

          <div v-else-if="books.length" class="mobile-focus-list">
            <article v-for="book in books" :key="book.id" class="mobile-published-card">
              <div class="mobile-published-card__main">
                <div class="mobile-published-card__cover">
                  <LazyImage
                    v-if="book.cover || book.coverUrl"
                    :src="resolveCoverSrc(book.cover || book.coverUrl)"
                    :alt="book.title"
                    :fallback-text="book.title"
                    aspect-ratio="6/8"
                  />
                  <div v-else class="mobile-published-card__fallback">
                    <span>{{ book.title.charAt(0) }}</span>
                  </div>
                </div>

                <div class="mobile-published-card__body">
                  <div class="mobile-focus-item__top">
                    <strong>{{ book.title }}</strong>
                    <span>{{ book.category || '书城作品' }}</span>
                  </div>

                  <div class="mobile-published-card__chips">
                    <span class="mobile-published-chip">{{ getStatusText(book) }}</span>
                    <span class="mobile-published-chip mobile-published-chip--plain">{{ getAuditText(book.auditStatus) }}</span>
                    <span class="mobile-published-chip mobile-published-chip--plain">{{ getCoverText(book.coverAuditStatus) }}</span>
                    <span class="mobile-published-chip" :class="{ 'mobile-published-chip--muted': !canManageChapters(book) }">
                      {{ canManageChapters(book) ? '可发章节' : '待上架' }}
                    </span>
                  </div>

                  <div class="mobile-published-card__metrics">
                    <span><el-icon><View /></el-icon>{{ book.viewCount ?? 0 }}</span>
                    <span><el-icon><CollectionTag /></el-icon>{{ book.favoriteCount ?? 0 }}</span>
                    <span><el-icon><ChatDotRound /></el-icon>{{ book.commentCount ?? 0 }}</span>
                  </div>

                  <p class="mobile-published-card__note mobile-published-card__note--summary">
                    已发布 {{ book.publishedChapterCount ?? 0 }} / {{ book.totalChapterCount ?? book.chapterCount ?? 0 }} 章
                    <template v-if="book.lastPublishedChapterNumber"> · 到第 {{ book.lastPublishedChapterNumber }} 章</template>
                    <template v-if="book.scheduledChapterCount"> · 待定时 {{ book.scheduledChapterCount }} 章</template>
                  </p>
                  <p class="mobile-published-card__note mobile-published-card__note--summary">
                    {{ getChapterManageStatusText(book) }}
                    <template v-if="book.nextScheduledAt"> · 下一次定时：{{ formatDateTime(book.nextScheduledAt) }}</template>
                  </p>

                  <p v-if="book.coverAuditStatus === 'reject' && book.coverAuditRejectReason" class="mobile-published-card__note">
                    封面需调整：{{ book.coverAuditRejectReason }}
                  </p>
                  <p v-else-if="shouldShowResubmit(book)" class="mobile-published-card__note">
                    这本书已暂时下架，换好封面后可以在这里重新上架。
                  </p>
                </div>
              </div>

              <div class="mobile-published-card__actions">
                <button class="mpp-action-btn mpp-action-btn--primary" type="button" :disabled="!canManageChapters(book)" @click="openChapterManager(book)">
                  <el-icon :size="16"><Reading /></el-icon>
                  <span>发布章节</span>
                </button>
                <button class="mpp-action-btn" type="button" @click="openBook(book.id)">
                  <el-icon :size="16"><View /></el-icon>
                  <span>查看书籍</span>
                </button>
                <button class="mpp-action-btn" type="button" @click="openEditDialog(book)">
                  <el-icon :size="16"><EditPen /></el-icon>
                  <span>编辑信息</span>
                </button>
                <button
                  v-if="book.coverLocked"
                  class="mpp-action-btn mpp-action-btn--warn"
                  type="button"
                  @click="handleUnlockCover(book)"
                >
                  <el-icon :size="16"><Lock /></el-icon>
                  <span>调整封面</span>
                </button>
                <button
                  v-else-if="shouldShowResubmit(book)"
                  class="mpp-action-btn mpp-action-btn--primary"
                  type="button"
                  @click="handleResubmit(book)"
                >
                  <el-icon :size="16"><RefreshRight /></el-icon>
                  <span>重新上架</span>
                </button>
                <button v-if="shouldShowResubmit(book)" class="mpp-action-btn" type="button" @click="openWorkspace(book.novelId)">
                  <el-icon :size="16"><SetUp /></el-icon>
                  <span>换封面</span>
                </button>
                <button class="mpp-action-btn mpp-action-btn--danger" type="button" @click="handleUnpublish(book)">
                  <el-icon :size="16"><CircleClose /></el-icon>
                  <span>取消发布</span>
                </button>
              </div>
            </article>
            <button
              v-if="bookHasMore"
              class="mobile-focus-button--secondary"
              type="button"
              :disabled="loading"
              @click="loadBooks(false)"
            >
              继续加载发布作品
            </button>
          </div>

          <div v-else class="mobile-focus-empty">
            <strong>还没有发布作品</strong>
            <p>从这里直接选择已有小说，补齐分类和标签后提交到书城。</p>
            <button class="mobile-focus-button--primary" type="button" @click="openPublishDialog">
              发布第一本
            </button>
          </div>
        </MobileSectionCard>
      </main>
    </div>

    <el-dialog v-model="publishDialogVisible" title="发布到书城" width="92%" class="mobile-published-dialog">
      <div class="mobile-focus-input-stack">
        <RealNameStatusBanner v-if="showRealNameBanner" scene="bookPublishing" is-mobile compact />
        <el-select
          v-model="publishForm.novelId"
          placeholder="选择要发布的作品"
          filterable
          :loading="availableNovelsLoading"
          :disabled="availableNovelsLoading && availablePublishNovels.length === 0"
          @change="handleNovelSelect"
        >
          <el-option v-for="novel in availablePublishNovels" :key="novel.id" :label="novel.title" :value="novel.id" />
        </el-select>
        <p v-if="publishDialogVisible && !availableNovelsLoading && availablePublishNovels.length === 0" class="mobile-published-dialog__hint">
          可发布的作品还没准备好，先刷新一次再继续。
          <button class="mobile-focus-link" type="button" @click="ensureAvailableNovelsLoaded(true)">重新加载</button>
        </p>
        <el-select v-model="publishForm.category" placeholder="选择分类">
          <el-option v-for="category in BOOKSTORE_CATEGORIES" :key="category" :label="category" :value="category" />
        </el-select>
        <el-select
          v-model="publishForm.tags"
          multiple
          filterable
          allow-create
          default-first-option
          :reserve-keyword="false"
          :multiple-limit="8"
          placeholder="最多 8 个标签"
        >
          <el-option v-for="tag in BOOKSTORE_TAGS" :key="tag" :label="tag" :value="tag" />
        </el-select>
        <el-input v-model="publishForm.description" type="textarea" :rows="5" placeholder="补一句给读者看的作品简介" />
      </div>
      <template #footer>
        <button class="mobile-focus-button--ghost" type="button" @click="publishDialogVisible = false">取消</button>
        <button class="mobile-focus-button--primary" type="button" :disabled="publishing" @click="submitPublish">
          {{ publishing ? '发布中...' : '发布到书城' }}
        </button>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialogVisible" title="编辑发布信息" width="92%" class="mobile-published-dialog">
      <div class="mobile-focus-input-stack">
        <el-select
          v-model="editForm.tags"
          multiple
          filterable
          allow-create
          default-first-option
          :reserve-keyword="false"
          :multiple-limit="8"
          placeholder="更新作品标签"
        >
          <el-option v-for="tag in BOOKSTORE_TAGS" :key="tag" :label="tag" :value="tag" />
        </el-select>
        <el-input v-model="editForm.description" type="textarea" :rows="5" placeholder="更新书城简介" />
      </div>
      <template #footer>
        <button class="mobile-focus-button--ghost" type="button" @click="editDialogVisible = false">取消</button>
        <button class="mobile-focus-button--primary" type="button" :disabled="editing" @click="submitEdit">
          {{ editing ? '保存中...' : '保存修改' }}
        </button>
      </template>
    </el-dialog>

    <ChapterPublishManagerDialog
      v-model="chapterManagerVisible"
      :book="currentChapterBook"
      mobile
      @refreshed="loadBooks(true)"
    />

    <MobileWorkbenchDock />

    <ForkPublishApprovalSheet
      :visible="forkApprovalVisible"
      :novel-id="forkApprovalNovelId"
      @close="forkApprovalVisible = false"
      @approved="() => { forkApprovalVisible = false; publishDialogVisible = true; }"
    />
  </div>
</template>

<style scoped src="../styles/mobile-my-published.css"></style>
