<script setup lang="ts">
/**
 * 桌面端·书城发布管理
 * 复用 publishToBookstore / unpublishBook / getBookStoreManageChapters /
 * publishBookStoreChapter / scheduleBookStoreChapter / publishBookStoreChaptersBatch。
 * 两步：作品发布到书城（首次）+ 章节发布管理（逐章/批量）。
 */
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  publishToBookstore,
  unpublishBook,
  getMyPublishedBooks,
  getBookStoreManageChapters,
  publishBookStoreChapter,
  publishBookStoreChaptersBatch,
  type BookStoreManageChapter,
} from '../../api/bookstore';
import { fetchChapters } from '../../api/chapters';
import { extractApiErrorMessage } from '../../api/errors';
import type { ChapterSummary } from '../../types';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import Modal from '../../components/shared/Modal.vue';

const props = defineProps<{ novelId: string }>();
const emit = defineEmits<{ 'request-refresh': [] }>();

/** 加载书城状态 + 章节列表 */
const bookstoreId = ref<string | null>(null);
const publishStatus = ref<string>('');
const category = ref('');
const description = ref('');
const manageChapters = ref<BookStoreManageChapter[]>([]);
const novelChapters = ref<ChapterSummary[]>([]);
const loading = ref(false);
const loadError = ref('');

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const [chapters, myBooks] = await Promise.all([
      fetchChapters(props.novelId),
      getMyPublishedBooks().catch(() => [] as Awaited<ReturnType<typeof getMyPublishedBooks>>),
    ]);
    novelChapters.value = chapters;
    // 从「我的已发布作品」里按 novelId 匹配
    const book = myBooks.find(b => b.novelId === props.novelId);
    if (book) {
      bookstoreId.value = book.id;
      publishStatus.value = book.publishStatus;
      category.value = book.category;
      description.value = book.description;
      try {
        const res = await getBookStoreManageChapters(book.id);
        manageChapters.value = res.items ?? [];
      } catch { /* ignore */ }
    }
  } catch (err) {
    loadError.value = extractApiErrorMessage(err, '加载失败');
  } finally {
    loading.value = false;
  }
}
load();

const isPublished = computed(() => bookstoreId.value !== null);
const publishedChapterNums = computed(() => new Set(manageChapters.value.filter(c => c.publishStatus === 'published').map(c => c.chapterNumber)));

/** 发布作品到书城 */
const publishDialogVisible = ref(false);
const publishForm = ref({ category: '', tags: [] as string[], description: '' });
const newTag = ref('');
const publishing = ref(false);

function openPublishDialog(): void {
  publishForm.value = { category: category.value || '都市', tags: [], description: description.value };
  publishDialogVisible.value = true;
}

function addTag(): void {
  const v = newTag.value.trim();
  if (v && !publishForm.value.tags.includes(v)) {
    publishForm.value.tags.push(v);
    newTag.value = '';
  }
}
function removeTag(t: string): void {
  publishForm.value.tags = publishForm.value.tags.filter(x => x !== t);
}

const CATEGORY_OPTIONS = ['玄幻', '都市', '科幻', '历史', '悬疑', '言情', '武侠', '其他'];

async function doPublish(): Promise<void> {
  publishing.value = true;
  try {
    const res = await publishToBookstore({
      novelId: props.novelId,
      category: publishForm.value.category,
      tags: publishForm.value.tags,
      description: publishForm.value.description || undefined,
    });
    ElMessage.success(`已提交发布审核（队列位置 ${res.queue?.position ?? '?'})`);
    publishDialogVisible.value = false;
    await load();
    emit('request-refresh');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '发布失败'));
  } finally {
    publishing.value = false;
  }
}

async function doUnpublish(): Promise<void> {
  if (!bookstoreId.value) return;
  try {
    await ElMessageBox.confirm('下架后读者将无法看到此作品。确定？', '下架作品', { type: 'warning', confirmButtonText: '下架' });
  } catch { return; }
  try {
    await unpublishBook(bookstoreId.value);
    ElMessage.success('已下架');
    await load();
    emit('request-refresh');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '下架失败'));
  }
}

/** 章节发布 */
const publishingChapter = ref<number | null>(null);
const batchPublishing = ref(false);

async function publishChapter(num: number): Promise<void> {
  publishingChapter.value = num;
  try {
    await publishBookStoreChapter(bookstoreId.value!, num);
    ElMessage.success(`第 ${num} 章已发布`);
    await load();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '发布失败'));
  } finally {
    publishingChapter.value = null;
  }
}

async function batchPublish(): Promise<void> {
  if (!bookstoreId.value) return;
  const unpublished = novelChapters.value
    .filter(ch => ch.status === 'finalized' && !publishedChapterNums.value.has(ch.chapterNumber))
    .map(ch => ch.chapterNumber);
  if (!unpublished.length) {
    ElMessage.info('没有待发布的定稿章节');
    return;
  }
  try {
    await ElMessageBox.confirm(`批量发布 ${unpublished.length} 章已定稿但未发布的章节？`, '批量发布', { type: 'info', confirmButtonText: '发布' });
  } catch { return; }
  batchPublishing.value = true;
  try {
    await publishBookStoreChaptersBatch(bookstoreId.value, unpublished);
    ElMessage.success(`已发布 ${unpublished.length} 章`);
    await load();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '批量发布失败'));
  } finally {
    batchPublishing.value = false;
  }
}

function chapterPublishStatus(num: number): string {
  const mc = manageChapters.value.find(c => c.chapterNumber === num);
  return mc?.publishStatus ?? '未发布';
}
</script>

<template>
  <div class="desktop-publish">
    <div class="nw-panel__head" style="padding:0 0 var(--nw-space-4)">
      <h2 class="nw-panel__title">书城发布</h2>
      <div v-if="isPublished" class="outline-actions">
        <span class="nw-tag" :class="{ 'nw-tag--muted': publishStatus !== 'approved' }">{{ publishStatus }}</span>
        <button class="desktop-btn" :disabled="batchPublishing" @click="batchPublish">
          <Icon name="layers" :size="14" /> {{ batchPublishing ? '发布中…' : '批量发布定稿' }}
        </button>
        <button class="desktop-btn reader-danger" @click="doUnpublish"><Icon name="close" :size="14" /> 下架</button>
      </div>
      <button v-else class="desktop-btn desktop-btn--primary" @click="openPublishDialog">
        <Icon name="store" :size="14" /> 发布到书城
      </button>
    </div>

    <StateView :loading="loading" :error="loadError ? new Error(loadError) : null" :error-message="loadError" @retry="load">
      <!-- 未发布：提示 -->
      <div v-if="!isPublished" class="publish-empty">
        <Icon name="store" :size="48" />
        <p class="nw-state__title">作品尚未发布到书城</p>
        <p class="nw-state__desc">点击「发布到书城」，填写分类和标签后提交审核。</p>
      </div>

      <!-- 已发布：章节发布状态表 -->
      <div v-else>
        <table class="nw-table">
          <thead>
            <tr><th>章</th><th>标题</th><th>状态</th><th>发布</th></tr>
          </thead>
          <tbody>
            <tr v-for="ch in novelChapters" :key="ch.chapterNumber">
              <td>{{ ch.chapterNumber }}</td>
              <td class="detail-ch-title">{{ ch.title || `第${ch.chapterNumber}章` }}</td>
              <td>
                <span v-if="publishedChapterNums.has(ch.chapterNumber)" class="nw-tag priority-low">已发布</span>
                <span v-else-if="ch.status === 'finalized'" class="nw-tag priority-medium">待发布</span>
                <span v-else class="nw-tag nw-tag--muted">{{ ch.status }}</span>
              </td>
              <td>
                <button
                  v-if="ch.status === 'finalized' && !publishedChapterNums.has(ch.chapterNumber)"
                  class="desktop-btn"
                  style="padding:2px 10px; font-size:12px"
                  :disabled="publishingChapter === ch.chapterNumber"
                  @click="publishChapter(ch.chapterNumber)"
                >
                  {{ publishingChapter === ch.chapterNumber ? '发布中…' : '发布' }}
                </button>
                <span v-else-if="publishedChapterNums.has(ch.chapterNumber)" style="color:var(--nw-text-muted);font-size:12px">✓</span>
              </td>
            </tr>
            <tr v-if="!novelChapters.length"><td colspan="4" class="detail-empty-row">暂无章节</td></tr>
          </tbody>
        </table>
      </div>
    </StateView>

    <!-- 发布到书城弹窗 -->
    <Modal v-model="publishDialogVisible" title="发布到书城" width="500px">
      <div class="nw-field">
        <label class="nw-field-label">分类 *</label>
        <select v-model="publishForm.category" class="nw-input">
          <option v-for="c in CATEGORY_OPTIONS" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">标签</label>
        <div class="tag-input-row">
          <input v-model="newTag" class="nw-input" placeholder="输入后回车添加" @keydown.enter="addTag" />
          <button class="desktop-btn" @click="addTag"><Icon name="plus" :size="14" /></button>
        </div>
        <div v-if="publishForm.tags.length" class="tag-list">
          <span v-for="t in publishForm.tags" :key="t" class="nw-tag">{{ t }} <button class="tag-remove" @click="removeTag(t)">×</button></span>
        </div>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">简介</label>
        <textarea v-model="publishForm.description" class="nw-textarea" rows="3" placeholder="书城展示用简介" />
      </div>
      <template #footer>
        <button class="desktop-btn" :disabled="publishing" @click="publishDialogVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="publishing" @click="doPublish">
          {{ publishing ? '发布中…' : '提交审核' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
