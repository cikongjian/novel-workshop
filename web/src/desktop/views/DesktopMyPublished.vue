<script setup lang="ts">
/**
 * 桌面端·我的发布
 * 复用移动端同一 API 和组件（getMyPublishedBookPage、publishToBookstore、ChapterPublishManagerDialog、ForkPublishApprovalSheet）。
 * 桌面布局：卡片列表 + 操作按钮。
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRouter } from 'vue-router';
import {
  getMyPublishedBookPage,
  publishToBookstore,
  resubmitBookCover,
  unlockBookCover,
  unpublishBook,
  updateBookStore,
} from '../../api/bookstore';
import { checkForkPublish } from '../../api/forks';
import { fetchNovelSummaries } from '../../api/novels';
import { resolveCoverSrc } from '../../utils/deploy-path';
import { extractApiErrorMessage } from '../../api/errors';
import { useRealNameAccess } from '../../composables/useRealNameAccess';
import ChapterPublishManagerDialog from '../../components/bookstore/ChapterPublishManagerDialog.vue';
import ForkPublishApprovalSheet from '../../components/mobile-entry/ForkPublishApprovalSheet.vue';
import RealNameStatusBanner from '../../components/auth/RealNameStatusBanner.vue';
import StateView from '../../components/shared/StateView.vue';
import StatCard from '../../components/shared/StatCard.vue';
import Icon from '../../components/shared/Icon.vue';
import type { NovelMetadata } from '../../types';
import { BOOKSTORE_CATEGORIES, BOOKSTORE_TAGS } from '../../constants/bookstore-options';

interface ManagedBook {
  id: string;
  novelId: string;
  title: string;
  category?: string;
  tags?: string[];
  description?: string;
  cover?: string;
  coverUrl?: string;
  viewCount?: number;
  likeCount?: number;
  favoriteCount?: number;
  commentCount?: number;
  publishedChapterCount?: number;
  totalChapterCount?: number;
  chapterCount?: number;
  lastPublishedChapterNumber?: number;
  scheduledChapterCount?: number;
  nextScheduledAt?: string;
  publishStatus?: string;
  auditStatus?: string;
  coverAuditStatus?: 'pending_review' | 'pass' | 'reject';
  coverLocked?: boolean;
  coverAuditRejectReason?: string;
}

const router = useRouter();
const {
  ensureRealNameAction,
  handleRealNameBlockedError,
  realNameEnabled,
  loadRealNamePolicy,
} = useRealNameAccess();

const loading = ref(false);
const books = ref<ManagedBook[]>([]);
const bookPage = ref(0);
const bookTotal = ref(0);
const bookHasMore = ref(false);
const publishing = ref(false);
const editing = ref(false);
const refreshing = ref(false);
const availableNovels = ref<NovelMetadata[]>([]);
const availableNovelsLoading = ref(false);
const availableNovelsLoaded = ref(false);

const publishDialogVisible = ref(false);
const forkApprovalVisible = ref(false);
const forkApprovalNovelId = ref('');
const editDialogVisible = ref(false);
const chapterManagerVisible = ref(false);
const currentEditBook = ref<ManagedBook | null>(null);
const currentChapterBook = ref<ManagedBook | null>(null);
const removingId = ref('');

const publishForm = ref<{ novelId: string; category: string; tags: string[]; description: string; _newTag: string }>({ novelId: '', category: '', tags: [], description: '', _newTag: '' });
const editForm = ref<{ tags: string[]; description: string; _newTag: string }>({ tags: [], description: '', _newTag: '' });
const showRealNameBanner = computed(() => realNameEnabled.value);

const totalViews = computed(() => books.value.reduce((s, b) => s + (b.viewCount ?? 0), 0));
const totalComments = computed(() => books.value.reduce((s, b) => s + (b.commentCount ?? 0), 0));
const pendingActions = computed(() => books.value.filter(b => needsAttention(b)).length);
const approvedBooks = computed(() => books.value.filter(b => canManageChapters(b)).length);

const availablePublishNovels = computed(() => {
  const publishedNovelIds = new Set(books.value.map((book) => book.novelId));
  return availableNovels.value.filter((novel) => !publishedNovelIds.has(novel.id));
});

async function loadBooks(reset = true) {
  loading.value = true;
  try {
    const result = await getMyPublishedBookPage({ page: reset ? 1 : bookPage.value + 1, pageSize: 20 });
    books.value = (reset ? result.items : [...books.value, ...result.items]) as ManagedBook[];
    bookPage.value = result.page;
    bookTotal.value = result.total;
    bookHasMore.value = result.page < result.totalPages;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载发布列表失败'));
  } finally {
    loading.value = false;
    refreshing.value = false;
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
    } catch (err) {
      ElMessage.error(extractApiErrorMessage(err, '加载作品列表失败'));
    } finally {
      availableNovelsLoading.value = false;
      availableNovelsPromise = null;
    }
  })();
  return availableNovelsPromise;
}

function handleNovelSelect(novelId: string) {
  const novel = availablePublishNovels.value.find((item) => item.id === novelId);
  if (!novel) return;
  publishForm.value.description = novel.synopsis || novel.description || '';
}

async function openPublishDialog() {
  if (!(await ensureRealNameAction('bookPublishing', { router, isMobile: false, redirect: '' }))) return;
  publishForm.value = { novelId: '', category: '', tags: [], description: '', _newTag: '' };
  publishDialogVisible.value = true;
  void ensureAvailableNovelsLoaded();
}

async function submitPublish() {
  if (!publishForm.value.novelId) { ElMessage.warning('请选择要发布的作品'); return; }
  if (!publishForm.value.category) { ElMessage.warning('请选择作品分类'); return; }

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

  if (!(await ensureRealNameAction('bookPublishing', { router, isMobile: false, redirect: '' }))) return;

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
  } catch (err: any) {
    if (handleRealNameBlockedError(err, { scene: 'bookPublishing', router, isMobile: false, redirect: '' })) return;
    const errStatus = err?.response?.status;
    const errMsg = err?.response?.data?.error || '';
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
  editForm.value = { tags: [...(book.tags ?? [])], description: book.description || '' };
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
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '更新失败'));
  } finally {
    editing.value = false;
  }
}

async function handleUnpublish(book: ManagedBook) {
  try {
    await ElMessageBox.confirm(`确定下架《${book.title}》吗？`, '取消发布', { confirmButtonText: '确定下架', cancelButtonText: '取消', type: 'warning' });
    await unpublishBook(book.id);
    ElMessage.success('已取消发布');
    await loadBooks(true);
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(extractApiErrorMessage(err, '操作失败'));
  }
}

async function handleUnlockCover(book: ManagedBook) {
  try {
    await ElMessageBox.confirm(
      `调整《${book.title}》封面前会先从书城撤下。换好封面后，再点"重新上架"。`,
      '调整封面', { confirmButtonText: '开始调整', cancelButtonText: '取消', type: 'warning' },
    );
    await unlockBookCover(book.id);
    ElMessage.success('封面已可调整，作品已暂时下架');
    await loadBooks(true);
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(extractApiErrorMessage(err, '操作失败'));
  }
}

async function handleResubmit(book: ManagedBook) {
  try {
    await resubmitBookCover(book.id);
    ElMessage.success('已提交重新上架');
    await loadBooks(true);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '提交失败，请先更换新封面'));
  }
}

function openChapterManager(book: ManagedBook) {
  currentChapterBook.value = book;
  chapterManagerVisible.value = true;
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

function getStatusText(book: ManagedBook): string {
  if (book.publishStatus === 'approved') return '展示中';
  if (book.publishStatus === 'pending') return '待重新上架';
  if (book.publishStatus === 'offline') return '已下架';
  if (book.publishStatus === 'rejected') return '需调整';
  return '处理中';
}

function getStatusType(book: ManagedBook): 'success' | 'warning' | 'danger' | 'info' {
  if (book.publishStatus === 'approved') return 'success';
  if (book.publishStatus === 'pending' || book.publishStatus === 'offline') return 'warning';
  if (book.publishStatus === 'rejected') return 'danger';
  return 'info';
}

function getAuditText(status: string): string {
  const map: Record<string, string> = { pending: '同步中', manual_review: '确认中', pass: '已就绪', reject: '需调整' };
  return map[status] ?? status;
}

function getCoverText(status?: string): string {
  const map: Record<string, string> = { pending_review: '同步中', pass: '已就绪', reject: '需调整' };
  return map[status ?? 'pending_review'] ?? '同步中';
}

function fmtDate(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmt(n?: number): string {
  return n ? (n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString()) : '0';
}

onMounted(() => {
  void loadRealNamePolicy();
  void loadBooks();
});
</script>

<template>
  <div class="desktop-my-published">
    <StateView :loading="loading && !books.length" :empty="!loading && books.length === 0">
      <template #empty>
        <div class="nw-state nw-state--empty">
          <p class="nw-state__title">还没有发布作品</p>
          <p class="nw-state__desc">从这里直接选择已有小说，补齐分类和标签后提交到书城。</p>
          <button class="desktop-btn desktop-btn--primary" @click="openPublishDialog">
            <Icon name="plus" :size="14" /> 发布第一本
          </button>
        </div>
      </template>

      <template v-if="books.length">
        <!-- 顶部操作栏 -->
        <div class="mp-toolbar nw-panel">
          <div class="mp-toolbar-left">
            <h2 class="mp-toolbar-title">我的发布</h2>
            <span class="desktop-section-count">{{ bookTotal || books.length }} 本</span>
          </div>
          <div class="mp-toolbar-actions">
            <button class="desktop-btn desktop-btn--primary" @click="openPublishDialog">
              <Icon name="plus" :size="14" /> 发布新作品
            </button>
            <button class="desktop-btn" :disabled="refreshing || loading" @click="refreshing = true; void loadBooks(true)">
              <Icon name="refresh" :size="14" :class="{ 'is-spin': refreshing }" />
              {{ refreshing ? '刷新中…' : '刷新列表' }}
            </button>
          </div>
        </div>

        <!-- 统计卡 -->
        <div class="mp-stats-row">
          <StatCard icon="checkCircle" accent="emerald" :value="approvedBooks" label="正常上架" />
          <StatCard icon="alertCircle" accent="amber" :value="pendingActions" label="待处理" />
          <StatCard icon="eye" accent="sky" :value="fmt(totalViews)" label="累计阅读" />
          <StatCard icon="messageCircle" accent="indigo" :value="totalComments" label="累计评论" />
        </div>

        <!-- 实名认证提示 -->
        <RealNameStatusBanner v-if="showRealNameBanner" scene="bookPublishing" />

        <!-- 书籍列表 -->
        <div class="nw-panel mp-books-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">已发布作品</h2>
          </div>
          <div class="mp-books">
            <article v-for="book in books" :key="book.id" class="mp-book-card">
              <div class="mp-book-card__left">
                <div class="mp-book-cover">
                  <img v-if="book.cover || book.coverUrl" :src="resolveCoverSrc(book.cover || book.coverUrl)" :alt="book.title" />
                  <span v-else>{{ (book.title || '?').slice(0, 1) }}</span>
                </div>
              </div>

              <div class="mp-book-card__main">
                <div class="mp-book-header">
                  <div class="mp-book-title-row">
                    <strong class="mp-book-title">{{ book.title }}</strong>
                    <span class="nw-tag">{{ book.category || '未分类' }}</span>
                    <span class="nw-tag" :class="{
                      'nw-tag--success': getStatusType(book) === 'success',
                      'nw-tag--warning': getStatusType(book) === 'warning',
                      'nw-tag--danger': getStatusType(book) === 'danger',
                    }">{{ getStatusText(book) }}</span>
                  </div>
                  <div class="mp-book-chips">
                    <span class="nw-tag nw-tag--muted">{{ getAuditText(book.auditStatus ?? '') }}</span>
                    <span class="nw-tag nw-tag--muted">{{ getCoverText(book.coverAuditStatus) }}</span>
                    <span class="nw-tag nw-tag--muted">{{ canManageChapters(book) ? '可发章节' : '待上架' }}</span>
                  </div>
                </div>

                <div class="mp-book-meta">
                  <span class="mp-book-stat"><Icon name="eye" :size="12" /> {{ fmt(book.viewCount) }}</span>
                  <span class="mp-book-stat"><Icon name="heart" :size="12" /> {{ fmt(book.likeCount) }}</span>
                  <span class="mp-book-stat"><Icon name="book" :size="12" /> {{ fmt(book.favoriteCount) }}</span>
                  <span class="mp-book-stat"><Icon name="messageCircle" :size="12" /> {{ book.commentCount ?? 0 }}</span>
                </div>

                <div class="mp-book-chapters">
                  <span>已发布 {{ book.publishedChapterCount ?? 0 }} / {{ book.totalChapterCount ?? book.chapterCount ?? 0 }} 章</span>
                  <span v-if="book.lastPublishedChapterNumber"> · 到第 {{ book.lastPublishedChapterNumber }} 章</span>
                  <span v-if="book.scheduledChapterCount"> · 待定时 {{ book.scheduledChapterCount }} 章</span>
                  <span v-if="book.nextScheduledAt"> · 下次定时：{{ fmtDate(book.nextScheduledAt) }}</span>
                </div>

                <p v-if="book.coverAuditStatus === 'reject' && book.coverAuditRejectReason" class="mp-book-alert">
                  封面需调整：{{ book.coverAuditRejectReason }}
                </p>
                <p v-else-if="shouldShowResubmit(book)" class="mp-book-alert">
                  这本书已暂时下架，换好封面后可以在这里重新上架。
                </p>
              </div>

              <div class="mp-book-card__actions">
                <button class="desktop-btn desktop-btn--primary" :disabled="!canManageChapters(book)" @click="openChapterManager(book)">
                  <Icon name="bookOpen" :size="13" /> 发布章节
                </button>
                <button class="desktop-btn" @click="router.push(`/desktop/book/${book.id}`)">
                  <Icon name="eye" :size="13" /> 查看书籍
                </button>
                <button class="desktop-btn" @click="openEditDialog(book)">
                  <Icon name="pen" :size="13" /> 编辑信息
                </button>
                <button v-if="book.coverLocked" class="desktop-btn" @click="handleUnlockCover(book)">
                  <Icon name="image" :size="13" /> 调整封面
                </button>
                <button v-else-if="shouldShowResubmit(book)" class="desktop-btn desktop-btn--primary" @click="handleResubmit(book)">
                  <Icon name="refreshCw" :size="13" /> 重新上架
                </button>
                <button v-if="shouldShowResubmit(book)" class="desktop-btn" @click="router.push(`/desktop/novel/${book.novelId}`)">
                  <Icon name="image" :size="13" /> 换封面
                </button>
                <button class="desktop-btn reader-danger" :disabled="removingId === book.id" @click="removingId = book.id; void handleUnpublish(book)">
                  <Icon name="xCircle" :size="13" />
                  {{ removingId === book.id ? '下架中…' : '取消发布' }}
                </button>
              </div>
            </article>

            <button v-if="bookHasMore" class="desktop-btn" :disabled="loading" @click="void loadBooks(false)">
              {{ loading ? '加载中…' : '继续加载' }}
            </button>
          </div>
        </div>
      </template>
    </StateView>

    <!-- 发布弹窗 -->
    <el-dialog v-model="publishDialogVisible" title="发布到书城" width="520px" :close-on-click-modal="false">
      <div class="model-form">
        <RealNameStatusBanner v-if="showRealNameBanner" scene="bookPublishing" />
        <div class="nw-field">
          <label class="nw-field-label">选择作品</label>
          <select v-model="publishForm.novelId" class="nw-input" :disabled="availableNovelsLoading" @change="handleNovelSelect(publishForm.novelId)">
            <option value="">— 选择 —</option>
            <option v-for="n in availablePublishNovels" :key="n.id" :value="n.id">{{ n.title }}</option>
          </select>
          <p v-if="publishDialogVisible && !availableNovelsLoading && availablePublishNovels.length === 0" class="nw-hint">
            没有可发布的作品，请先在创作区完成小说。
          </p>
        </div>
        <div class="nw-field">
          <label class="nw-field-label">分类</label>
          <select v-model="publishForm.category" class="nw-input">
            <option value="">— 选择分类 —</option>
            <option v-for="c in BOOKSTORE_CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="nw-field">
          <label class="nw-field-label">标签（最多 8 个）</label>
          <div class="nw-tags-input">
            <span v-for="tag in publishForm.tags" :key="tag" class="nw-tag">
              {{ tag }}
              <button type="button" @click="publishForm.tags = publishForm.tags.filter(t => t !== tag)">×</button>
            </span>
            <input
              v-if="publishForm.tags.length < 8"
              v-model="publishForm._newTag"
              class="nw-tags-input__input"
              placeholder="输入后回车添加"
              @keydown.enter.prevent="() => { const t = publishForm._newTag?.trim(); if (t && !publishForm.tags.includes(t)) publishForm.tags.push(t); publishForm._newTag = ''; }"
            />
          </div>
          <div class="nw-tag-suggestions">
            <button v-for="tag in BOOKSTORE_TAGS.slice(0, 12)" :key="tag" type="button" class="nw-tag-suggestion" :disabled="publishForm.tags.includes(tag)" @click="!publishForm.tags.includes(tag) && publishForm.tags.push(tag)">
              {{ tag }}
            </button>
          </div>
        </div>
        <div class="nw-field">
          <label class="nw-field-label">作品简介</label>
          <textarea v-model="publishForm.description" class="nw-textarea" rows="4" placeholder="补一句给读者看的作品简介" />
        </div>
      </div>
      <template #footer>
        <button class="desktop-btn" @click="publishDialogVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="publishing || !publishForm.novelId || !publishForm.category" @click="submitPublish">
          {{ publishing ? '发布中…' : '发布到书城' }}
        </button>
      </template>
    </el-dialog>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editDialogVisible" title="编辑发布信息" width="480px" :close-on-click-modal="false">
      <div class="model-form">
        <div class="nw-field">
          <label class="nw-field-label">标签</label>
          <div class="nw-tags-input">
            <span v-for="tag in editForm.tags" :key="tag" class="nw-tag">
              {{ tag }}
              <button type="button" @click="editForm.tags = editForm.tags.filter(t => t !== tag)">×</button>
            </span>
            <input
              v-if="editForm.tags.length < 8"
              v-model="editForm._newTag"
              class="nw-tags-input__input"
              placeholder="输入后回车添加"
              @keydown.enter.prevent="() => { const t = editForm._newTag?.trim(); if (t && !editForm.tags.includes(t)) editForm.tags.push(t); editForm._newTag = ''; }"
            />
          </div>
        </div>
        <div class="nw-field">
          <label class="nw-field-label">简介</label>
          <textarea v-model="editForm.description" class="nw-textarea" rows="4" />
        </div>
      </div>
      <template #footer>
        <button class="desktop-btn" @click="editDialogVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="editing" @click="submitEdit">
          {{ editing ? '保存中…' : '保存修改' }}
        </button>
      </template>
    </el-dialog>

    <!-- 章节发布管理 -->
    <ChapterPublishManagerDialog
      v-model="chapterManagerVisible"
      :book="currentChapterBook"
      @refreshed="loadBooks(true)"
    />

    <!-- 分叉发布审批 -->
    <ForkPublishApprovalSheet
      :visible="forkApprovalVisible"
      :novel-id="forkApprovalNovelId"
      @close="forkApprovalVisible = false"
      @approved="() => { forkApprovalVisible = false; publishDialogVisible = true; }"
    />
  </div>
</template>

<style scoped>
.desktop-my-published {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

/* Toolbar */
.mp-toolbar {
  padding: var(--nw-space-5);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mp-toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
}

.mp-toolbar-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0;
}

.mp-toolbar-actions {
  display: flex;
  gap: var(--nw-space-2);
}

/* Stats */
.mp-stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--nw-space-3);
}

/* Books Panel */
.mp-books-panel {
  padding: 0;
}

.mp-books {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
  padding: var(--nw-space-5);
}

.mp-book-card {
  display: flex;
  gap: var(--nw-space-5);
  padding: var(--nw-space-5);
  border-radius: var(--nw-radius-md);
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-secondary);
  transition: border-color 0.2s ease;
}

.mp-book-card:hover {
  border-color: var(--nw-accent-start);
}

.mp-book-cover {
  width: 72px;
  height: 96px;
  border-radius: var(--nw-radius-md);
  background: var(--nw-accent-gradient);
  overflow: hidden;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #fff;
  font-size: 24px;
  font-weight: 700;
}

.mp-book-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mp-book-card__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
}

.mp-book-header {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
}

.mp-book-title-row {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2);
  flex-wrap: wrap;
}

.mp-book-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--nw-text-primary);
}

.mp-book-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.mp-book-meta {
  display: flex;
  gap: var(--nw-space-4);
}

.mp-book-stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--nw-text-muted);
}

.mp-book-chapters {
  font-size: 13px;
  color: var(--nw-text-secondary);
}

.mp-book-alert {
  font-size: 13px;
  color: var(--nw-danger);
  margin: 0;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--nw-danger) 8%, transparent);
  border-radius: var(--nw-radius-md);
  border-left: 3px solid var(--nw-danger);
}

.mp-book-card__actions {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
  flex-shrink: 0;
  min-width: 140px;
}

/* Form */
.model-form {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.nw-hint {
  font-size: 12px;
  color: var(--nw-text-muted);
  margin: 4px 0 0 0;
}

/* Tags input */
.nw-tags-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--nw-border);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-primary);
  min-height: 42px;
  align-items: center;
}

.nw-tags-input .nw-tag {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nw-tags-input .nw-tag button {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--nw-text-muted);
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}

.nw-tags-input__input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--nw-text-primary);
  flex: 1;
  min-width: 100px;
}

.nw-tag-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.nw-tag-suggestion {
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-secondary);
  font-size: 12px;
  color: var(--nw-text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.nw-tag-suggestion:hover:not(:disabled) {
  border-color: var(--nw-accent-start);
  color: var(--nw-accent-strong);
}

.nw-tag-suggestion:disabled {
  opacity: 0.4;
  cursor: default;
}

.is-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
