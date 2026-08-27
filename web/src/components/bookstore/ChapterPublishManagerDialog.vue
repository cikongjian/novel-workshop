<template>
  <el-dialog
    v-model="dialogVisible"
    :title="book ? `章节发布 · ${book.title}` : '章节发布'"
    :width="mobile ? '94%' : '980px'"
    :class="['chapter-publish-dialog', mobile ? 'mobile-published-dialog' : 'mp-chapter-dialog']"
    destroy-on-close
  >
    <div v-loading="loading" class="cp-shell" :class="{ 'cp-shell--mobile': mobile }">
      <template v-if="book && summary">
        <section class="cp-summary">
          <div class="cp-summary__hero">
            <strong>已发布到第 {{ summary.lastPublishedChapterNumber || 0 }} 章</strong>
            <span v-if="summary.nextScheduledAt">下一次定时：{{ formatDateTime(summary.nextScheduledAt) }}</span>
            <span v-else>当前没有待执行的定时发布</span>
          </div>
          <div class="cp-summary__chips">
            <span class="cp-chip cp-chip--strong">共 {{ summary.total }} 章</span>
            <span class="cp-chip">已发布 {{ summary.published }}</span>
            <span class="cp-chip">待定时 {{ summary.scheduled }}</span>
            <span class="cp-chip">审核中 {{ summary.pendingAudit }}</span>
            <span class="cp-chip">未发布 {{ summary.unpublished }}</span>
          </div>
        </section>

        <section class="cp-batch">
          <div class="cp-batch__header">
            <div>
              <strong>批量操作</strong>
              <p>先选章节，再统一立即发布或定时发布。</p>
            </div>
            <span class="cp-batch__count">已选择 {{ selectedCount }} / 可操作 {{ selectableCount }} 章</span>
          </div>

          <div class="cp-batch__selection">
            <div class="cp-quick">
              <div class="cp-inline cp-inline--compact">
                <el-input-number
                  v-model="continuousSelectCount"
                  :min="1"
                  :max="Math.max(1, selectableCount)"
                  :step="1"
                  controls-position="right"
                />
                <button
                  class="cp-action cp-action--ghost cp-action--icon"
                  type="button"
                  :disabled="!selectableCount || isBusy"
                  @click="selectNextChapters"
                  title="从下一章起连续选"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14M5 12l7-7 7 7"/>
                  </svg>
                </button>
              </div>

              <div class="cp-inline cp-inline--grid">
                <button
                  class="cp-action cp-action--ghost cp-action--icon"
                  type="button"
                  :disabled="!selectableCount || isBusy"
                  @click="selectAllNotPublished"
                  title="全选未发布章节"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 9h6M9 15h6"/>
                  </svg>
                </button>
                <button
                  class="cp-action cp-action--ghost cp-action--icon"
                  type="button"
                  :disabled="!selectableCount || isBusy"
                  @click="selectAllEligible"
                  title="全选可操作章节"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                </button>
                <button
                  class="cp-action cp-action--ghost cp-action--icon"
                  type="button"
                  :disabled="!summary?.scheduled || isBusy"
                  @click="selectScheduledChapters"
                  title="只选待定时"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </button>
                <button
                  class="cp-action cp-action--ghost cp-action--icon"
                  type="button"
                  :disabled="!summary?.hidden || isBusy"
                  @click="selectHiddenChapters"
                  title="只选隐藏章"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 7.94A10.07 10.07 0 0 1 20 12c0 6.62-5.38 12-12 12S4 18.62 4 12a9.93 9.93 0 0 1 1.1-4.48"/><path d="M9.87 9.87A3 3 0 1 0 12 12"/><line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
                <button
                  class="cp-action cp-action--ghost cp-action--icon"
                  type="button"
                  :disabled="!summary?.unpublished || isBusy"
                  @click="selectUnpublishedChapters"
                  title="只选未发布"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6"/><line x1="12" y1="13" x2="12" y2="17"/>
                  </svg>
                </button>
                <button
                  class="cp-action cp-action--ghost cp-action--icon"
                  type="button"
                  :disabled="!selectedCount || isBusy"
                  @click="clearSelection"
                  title="清空选择"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="cp-range">
              <el-input-number
                v-model="rangeStartChapter"
                :min="1"
                :max="maxChapterNumber"
                :step="1"
                controls-position="right"
                placeholder="起始章"
              />
              <span class="cp-range__dash">到</span>
              <el-input-number
                v-model="rangeEndChapter"
                :min="1"
                :max="maxChapterNumber"
                :step="1"
                controls-position="right"
                placeholder="结束章"
              />
              <button
                class="cp-action cp-action--ghost cp-action--icon"
                type="button"
                :disabled="!selectableCount || isBusy"
                @click="selectRange"
                title="按范围选择"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="cp-batch__actions">
            <el-date-picker
              v-model="bulkScheduleDraft"
              class="cp-picker cp-picker--wide"
              type="datetime"
              :editable="false"
              :clearable="false"
              format="YYYY-MM-DD HH:mm"
              placeholder="选择批量定时发布时间"
              value-format="YYYY-MM-DDTHH:mm:ss"
            />
            <el-select v-model="bulkScheduleIntervalMinutes" class="cp-select-box">
              <el-option
                v-for="option in intervalOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <button
              class="cp-action cp-action--secondary cp-action--icon"
              type="button"
              :disabled="!selectedSchedulableCount || isBusy"
              @click="scheduleSelectedBatch"
              title="批量定时发布"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><line x1="16" y1="10" x2="16" y2="14"/><line x1="8" y1="10" x2="8" y2="14"/>
              </svg>
            </button>
            <button
              class="cp-action cp-action--ghost cp-action--icon"
              type="button"
              :disabled="!selectedScheduledCount || isBusy"
              @click="cancelScheduledSelectedBatch"
              title="批量取消定时"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </button>
            <button
              class="cp-action cp-action--primary cp-action--icon"
              type="button"
              :disabled="!selectedPublishableCount || isBusy"
              @click="publishSelectedBatch"
              title="批量立即发布"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 20 12 14 6 20"/><line x1="12" y1="20" x2="12" y2="10"/>
              </svg>
            </button>
          </div>
        </section>

        <section class="cp-list">
          <article
            v-for="chapter in items"
            :key="chapter.chapterNumber"
            class="cp-row"
            :class="{
              'cp-row--selected': isSelected(chapter.chapterNumber),
              'cp-row--disabled': !isSelectable(chapter),
            }"
          >
            <div class="cp-row__main">
              <label class="cp-select">
                <input
                  type="checkbox"
                  :checked="isSelected(chapter.chapterNumber)"
                  :disabled="!isSelectable(chapter) || isBusy"
                  @change="toggleSelection(chapter.chapterNumber)"
                />
                <span />
              </label>

              <div class="cp-row__meta">
                <div class="cp-row__title">
                  <strong>第 {{ chapter.chapterNumber }} 章 · {{ chapter.title || `第 ${chapter.chapterNumber} 章` }}</strong>
                  <span>{{ formatWordCount(chapter.wordCount) }}</span>
                </div>
                <div class="cp-row__subline">
                  <span class="cp-status" :class="`cp-status--${chapter.status}`">{{ getStatusText(chapter.status) }}</span>
                  <span v-if="chapter.publishedAt">发布时间 {{ formatDateTime(chapter.publishedAt) }}</span>
                  <span v-else-if="chapter.scheduledAt">计划时间 {{ formatDateTime(chapter.scheduledAt) }}</span>
                  <span v-else-if="chapter.updatedAt">最近更新 {{ formatDateTime(chapter.updatedAt) }}</span>
                </div>
              </div>
            </div>

            <div class="cp-row__actions">
              <button
                v-if="canPublishNow(chapter)"
                class="cp-action cp-action--primary"
                type="button"
                :disabled="busyChapterNumber === chapter.chapterNumber || isBusyForOtherChapter(chapter.chapterNumber)"
                @click="publishNow(chapter.chapterNumber)"
              >
                立即发布
              </button>

              <template v-if="canSchedule(chapter)">
                <el-date-picker
                  v-model="scheduleDrafts[chapter.chapterNumber]"
                  class="cp-picker"
                  type="datetime"
                  :editable="false"
                  :clearable="false"
                  format="YYYY-MM-DD HH:mm"
                  placeholder="选择发布时间"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                />
                <button
                  class="cp-action cp-action--secondary"
                  type="button"
                  :disabled="busyChapterNumber === chapter.chapterNumber || isBusyForOtherChapter(chapter.chapterNumber)"
                  @click="scheduleChapter(chapter.chapterNumber)"
                >
                  定时发布
                </button>
              </template>

              <button
                v-if="chapter.status === 'scheduled'"
                class="cp-action cp-action--ghost"
                type="button"
                :disabled="busyChapterNumber === chapter.chapterNumber || isBusyForOtherChapter(chapter.chapterNumber)"
                @click="cancelSchedule(chapter.chapterNumber)"
              >
                取消定时
              </button>
            </div>
          </article>
          <button
            v-if="manageData?.hasMore"
            class="cp-load-more"
            type="button"
            :disabled="isBusy"
            @click="loadMoreData"
          >
            {{ loadingMore ? '正在加载...' : `继续加载章节（${items.length}/${summary.total}）` }}
          </button>
        </section>
      </template>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import {
  cancelScheduledBookStoreChapter,
  cancelScheduledBookStoreChaptersBatch,
  getBookStoreManageChapters,
  publishBookStoreChapter,
  publishBookStoreChaptersBatch,
  scheduleBookStoreChapter,
  scheduleBookStoreChaptersBatch,
  type BookStoreManageChapter,
  type BookStoreManageChaptersResponse,
} from '../../api/bookstore';

type ManagedBookLite = {
  id: string;
  title: string;
  publishStatus?: string;
};

const props = defineProps<{
  modelValue: boolean;
  book: ManagedBookLite | null;
  mobile?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  refreshed: [];
}>();

const intervalOptions = [
  { label: '同一时间', value: 0 },
  { label: '每章间隔 10 分钟', value: 10 },
  { label: '每章间隔 30 分钟', value: 30 },
  { label: '每章间隔 60 分钟', value: 60 },
];
const MANAGE_CHAPTER_PAGE_SIZE = 100;

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const loading = ref(false);
const loadingMore = ref(false);
const busyChapterNumber = ref<number | null>(null);
const busyBatchAction = ref<'publish' | 'schedule' | 'cancel' | null>(null);
const manageData = ref<BookStoreManageChaptersResponse | null>(null);
const scheduleDrafts = reactive<Record<number, string>>({});
const selectedChapters = reactive<Record<number, boolean>>({});
const bulkScheduleDraft = ref('');
const bulkScheduleIntervalMinutes = ref(0);
const rangeStartChapter = ref<number | undefined>(undefined);
const rangeEndChapter = ref<number | undefined>(undefined);
const continuousSelectCount = ref(10);

const summary = computed(() => manageData.value?.summary ?? null);
const items = computed(() => manageData.value?.items ?? []);
const mobile = computed(() => Boolean(props.mobile));
const isBusy = computed(() => loading.value || loadingMore.value || busyChapterNumber.value !== null || busyBatchAction.value !== null);
const maxChapterNumber = computed(() => summary.value?.total || items.value.at(-1)?.chapterNumber || 1);
const selectableItems = computed(() => items.value.filter((chapter) => isSelectable(chapter)));
const selectableCount = computed(() => selectableItems.value.length);
const selectedItems = computed(() =>
  items.value.filter((chapter) => selectedChapters[chapter.chapterNumber] && isSelectable(chapter)),
);
const selectedCount = computed(() => selectedItems.value.length);
const selectedPublishableItems = computed(() => selectedItems.value.filter((chapter) => canPublishNow(chapter)));
const selectedSchedulableItems = computed(() => selectedItems.value.filter((chapter) => canSchedule(chapter)));
const selectedScheduledItems = computed(() => selectedItems.value.filter((chapter) => chapter.status === 'scheduled'));
const selectedPublishableCount = computed(() => selectedPublishableItems.value.length);
const selectedSchedulableCount = computed(() => selectedSchedulableItems.value.length);
const selectedScheduledCount = computed(() => selectedScheduledItems.value.length);

watch(
  () => [props.modelValue, props.book?.id] as const,
  async ([visible, bookId]) => {
    if (!visible || !bookId) return;
    await loadData();
  },
  { immediate: false },
);

async function loadData() {
  if (!props.book?.id) return;
  loading.value = true;
  try {
    manageData.value = await getBookStoreManageChapters(props.book.id, {
      page: 1,
      pageSize: MANAGE_CHAPTER_PAGE_SIZE,
    });
    seedDraftsAndSelection();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '加载章节发布状态失败');
  } finally {
    loading.value = false;
  }
}

async function loadMoreData() {
  if (!props.book?.id || loadingMore.value || !manageData.value?.hasMore) return;
  loadingMore.value = true;
  try {
    const nextPage = await getBookStoreManageChapters(props.book.id, {
      page: manageData.value.page + 1,
      pageSize: MANAGE_CHAPTER_PAGE_SIZE,
    });
    const existing = new Set(manageData.value.items.map((chapter) => chapter.chapterNumber));
    const nextItems = nextPage.items.filter((chapter) => !existing.has(chapter.chapterNumber));
    manageData.value = {
      ...nextPage,
      items: [...manageData.value.items, ...nextItems],
    };
    seedDraftsForItems(nextItems);
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '加载更多章节失败');
  } finally {
    loadingMore.value = false;
  }
}

function seedDraftsAndSelection() {
  resetReactiveRecord(scheduleDrafts);
  resetReactiveRecord(selectedChapters);
  bulkScheduleDraft.value = getDefaultScheduleValue();
  bulkScheduleIntervalMinutes.value = 0;
  rangeStartChapter.value = undefined;
  rangeEndChapter.value = undefined;
  continuousSelectCount.value = 10;

  seedDraftsForItems(manageData.value?.items ?? []);
}

function seedDraftsForItems(chapters: BookStoreManageChapter[]) {
  for (const chapter of chapters) {
    scheduleDrafts[chapter.chapterNumber] = chapter.scheduledAt
      ? toPickerValue(chapter.scheduledAt)
      : bulkScheduleDraft.value;
  }
}

function resetReactiveRecord(record: Record<number, unknown>) {
  for (const key of Object.keys(record)) {
    delete record[Number(key)];
  }
}

function getDefaultScheduleValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 30);
  date.setSeconds(0, 0);
  return toPickerValue(date.toISOString());
}

function toPickerValue(input: string) {
  const date = new Date(input);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  const second = `${date.getSeconds()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function parseLocalDatetime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function toIsoFromLocal(value: string) {
  const date = parseLocalDatetime(value);
  return date ? date.toISOString() : '';
}

function addMinutes(value: string, minutes: number) {
  const date = parseLocalDatetime(value);
  if (!date) return '';
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function validateScheduleDraft(value: string) {
  if (!value) {
    return '请先选择定时发布时间';
  }
  const date = parseLocalDatetime(value);
  if (!date) {
    return '定时发布时间格式不正确';
  }
  if (date.getTime() <= Date.now()) {
    return '定时发布时间必须晚于当前时间';
  }
  return '';
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatWordCount(value: number) {
  return `${Math.max(0, Math.round(value || 0))} 字`;
}

function getStatusText(status: BookStoreManageChapter['status']) {
  const map: Record<BookStoreManageChapter['status'], string> = {
    unpublished: '未发布',
    hidden: '待重新发布',
    scheduled: '已定时',
    pending_audit: '审核中',
    published: '已发布',
  };
  return map[status];
}

function canPublishNow(chapter: BookStoreManageChapter) {
  return chapter.status === 'unpublished' || chapter.status === 'hidden' || chapter.status === 'scheduled';
}

function canSchedule(chapter: BookStoreManageChapter) {
  return chapter.status === 'unpublished' || chapter.status === 'hidden' || chapter.status === 'scheduled';
}

function isSelectable(chapter: BookStoreManageChapter) {
  return canPublishNow(chapter) || canSchedule(chapter);
}

function isSelected(chapterNumber: number) {
  return Boolean(selectedChapters[chapterNumber]);
}

function toggleSelection(chapterNumber: number) {
  if (selectedChapters[chapterNumber]) {
    delete selectedChapters[chapterNumber];
    return;
  }
  selectedChapters[chapterNumber] = true;
}

function selectAllEligible() {
  clearSelection();
  for (const chapter of selectableItems.value) {
    selectedChapters[chapter.chapterNumber] = true;
  }
}

function selectAllNotPublished() {
  clearSelection();
  let count = 0;
  for (const chapter of items.value) {
    if (chapter.status !== 'published' && chapter.status !== 'pending_audit' && isSelectable(chapter)) {
      selectedChapters[chapter.chapterNumber] = true;
      count += 1;
    }
  }
  if (!count) {
    ElMessage.warning('当前没有可选的未发布章节');
    return;
  }
  ElMessage.success(`已选择 ${count} 个未发布章节`);
}

function selectByStatuses(statuses: BookStoreManageChapter['status'][], emptyMessage: string, successLabel: string) {
  clearSelection();
  let count = 0;
  for (const chapter of items.value) {
    if (statuses.includes(chapter.status) && isSelectable(chapter)) {
      selectedChapters[chapter.chapterNumber] = true;
      count += 1;
    }
  }
  if (!count) {
    ElMessage.warning(emptyMessage);
    return;
  }
  ElMessage.success(`已选择 ${count} 个${successLabel}`);
}

function selectScheduledChapters() {
  selectByStatuses(['scheduled'], '当前没有待取消的定时章节', '定时章节');
}

function selectHiddenChapters() {
  selectByStatuses(['hidden'], '当前没有隐藏待重发章节', '隐藏章节');
}

function selectUnpublishedChapters() {
  selectByStatuses(['unpublished'], '当前没有未发布章节', '未发布章节');
}

function selectNextChapters() {
  clearSelection();
  const startChapterNumber = (summary.value?.lastPublishedChapterNumber ?? 0) + 1;
  const limit = Math.max(1, continuousSelectCount.value || 1);
  let count = 0;

  for (const chapter of items.value) {
    if (chapter.chapterNumber < startChapterNumber) continue;
    if (!isSelectable(chapter)) continue;
    selectedChapters[chapter.chapterNumber] = true;
    count += 1;
    if (count >= limit) break;
  }

  if (!count) {
    ElMessage.warning('当前没有可连续选择的后续章节');
    return;
  }

  ElMessage.success(`已从第 ${startChapterNumber} 章开始选择 ${count} 个章节`);
}

function selectRange() {
  if (!rangeStartChapter.value || !rangeEndChapter.value) {
    ElMessage.warning('请先选择起始章和结束章');
    return;
  }

  const start = Math.min(rangeStartChapter.value, rangeEndChapter.value);
  const end = Math.max(rangeStartChapter.value, rangeEndChapter.value);
  clearSelection();

  let count = 0;
  for (const chapter of items.value) {
    if (chapter.chapterNumber >= start && chapter.chapterNumber <= end && isSelectable(chapter)) {
      selectedChapters[chapter.chapterNumber] = true;
      count += 1;
    }
  }

  if (!count) {
    ElMessage.warning('当前范围内没有可操作章节');
    return;
  }

  ElMessage.success(`已选择第 ${start} 章到第 ${end} 章中的 ${count} 个可操作章节`);
}

function clearSelection() {
  resetReactiveRecord(selectedChapters);
}

function isBusyForOtherChapter(chapterNumber: number) {
  return isBusy.value && busyChapterNumber.value !== chapterNumber;
}

async function publishNow(chapterNumber: number) {
  if (!props.book?.id) return;
  busyChapterNumber.value = chapterNumber;
  try {
    const response = await publishBookStoreChapter(props.book.id, chapterNumber);
    ElMessage.success(
      response.queue?.position > 1
        ? `已加入审核队列，当前排队位置 ${response.queue.position}`
        : '章节已提交审核',
    );
    await refreshAfterMutation();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '立即发布失败');
  } finally {
    busyChapterNumber.value = null;
  }
}

async function scheduleChapter(chapterNumber: number) {
  if (!props.book?.id) return;
  const draft = scheduleDrafts[chapterNumber];
  const validationMessage = validateScheduleDraft(draft);
  if (validationMessage) {
    ElMessage.warning(validationMessage);
    return;
  }

  busyChapterNumber.value = chapterNumber;
  try {
    await scheduleBookStoreChapter(props.book.id, chapterNumber, toIsoFromLocal(draft));
    ElMessage.success('已设置定时发布');
    await refreshAfterMutation();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '定时发布失败');
  } finally {
    busyChapterNumber.value = null;
  }
}

async function cancelSchedule(chapterNumber: number) {
  if (!props.book?.id) return;
  busyChapterNumber.value = chapterNumber;
  try {
    await cancelScheduledBookStoreChapter(props.book.id, chapterNumber);
    ElMessage.success('已取消定时发布');
    await refreshAfterMutation();
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '取消定时失败');
  } finally {
    busyChapterNumber.value = null;
  }
}

async function publishSelected() {
  if (!props.book?.id) return;
  const chapterNumbers = selectedPublishableItems.value
    .map((chapter) => chapter.chapterNumber)
    .sort((left, right) => left - right);
  if (!chapterNumbers.length) {
    ElMessage.warning('请先勾选可立即发布的章节');
    return;
  }

  busyBatchAction.value = 'publish';
  let successCount = 0;
  const failures: string[] = [];

  try {
    for (const chapterNumber of chapterNumbers) {
      try {
        await publishBookStoreChapter(props.book.id, chapterNumber);
        successCount += 1;
      } catch (error: any) {
        failures.push(`第 ${chapterNumber} 章：${error?.response?.data?.error || '提交失败'}`);
      }
    }

    await finalizeBatchMutation(successCount, failures, '已批量提交审核');
  } finally {
    busyBatchAction.value = null;
  }
}

async function scheduleSelected() {
  if (!props.book?.id) return;
  const validationMessage = validateScheduleDraft(bulkScheduleDraft.value);
  if (validationMessage) {
    ElMessage.warning(validationMessage);
    return;
  }

  const chapterNumbers = selectedSchedulableItems.value
    .map((chapter) => chapter.chapterNumber)
    .sort((left, right) => left - right);
  if (!chapterNumbers.length) {
    ElMessage.warning('请先勾选可定时发布的章节');
    return;
  }

  busyBatchAction.value = 'schedule';
  let successCount = 0;
  const failures: string[] = [];

  try {
    for (const [index, chapterNumber] of chapterNumbers.entries()) {
      const scheduledAt = bulkScheduleIntervalMinutes.value > 0
        ? addMinutes(bulkScheduleDraft.value, bulkScheduleIntervalMinutes.value * index)
        : toIsoFromLocal(bulkScheduleDraft.value);

      try {
        await scheduleBookStoreChapter(props.book.id, chapterNumber, scheduledAt);
        successCount += 1;
      } catch (error: any) {
        failures.push(`第 ${chapterNumber} 章：${error?.response?.data?.error || '定时失败'}`);
      }
    }

    await finalizeBatchMutation(successCount, failures, '已批量设置定时发布');
  } finally {
    busyBatchAction.value = null;
  }
}

async function publishSelectedBatch() {
  if (!props.book?.id) return;
  const chapterNumbers = selectedPublishableItems.value
    .map((chapter) => chapter.chapterNumber)
    .sort((left, right) => left - right);
  if (!chapterNumbers.length) {
    ElMessage.warning('请先勾选可立即发布的章节');
    return;
  }

  busyBatchAction.value = 'publish';
  try {
    const response = await publishBookStoreChaptersBatch(props.book.id, chapterNumbers);
    await finalizeBatchMutation(
      response.successCount,
      response.results
        .filter((item) => !item.success)
        .map((item) => `第 ${item.chapterNumber} 章：${item.error || '提交失败'}`),
      '已批量提交审核',
    );
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '批量发布失败');
  } finally {
    busyBatchAction.value = null;
  }
}

async function scheduleSelectedBatch() {
  if (!props.book?.id) return;
  const validationMessage = validateScheduleDraft(bulkScheduleDraft.value);
  if (validationMessage) {
    ElMessage.warning(validationMessage);
    return;
  }

  const chapterNumbers = selectedSchedulableItems.value
    .map((chapter) => chapter.chapterNumber)
    .sort((left, right) => left - right);
  if (!chapterNumbers.length) {
    ElMessage.warning('请先勾选可定时发布的章节');
    return;
  }

  busyBatchAction.value = 'schedule';
  try {
    const items = chapterNumbers.map((chapterNumber, index) => ({
      chapterNumber,
      scheduledAt: bulkScheduleIntervalMinutes.value > 0
        ? addMinutes(bulkScheduleDraft.value, bulkScheduleIntervalMinutes.value * index)
        : toIsoFromLocal(bulkScheduleDraft.value),
    }));
    const response = await scheduleBookStoreChaptersBatch(props.book.id, items);
    await finalizeBatchMutation(
      response.successCount,
      response.results
        .filter((item) => !item.success)
        .map((item) => `第 ${item.chapterNumber} 章：${item.error || '定时失败'}`),
      '已批量设置定时发布',
    );
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '批量定时发布失败');
  } finally {
    busyBatchAction.value = null;
  }
}

async function cancelScheduledSelectedBatch() {
  if (!props.book?.id) return;
  const chapterNumbers = selectedScheduledItems.value
    .map((chapter) => chapter.chapterNumber)
    .sort((left, right) => left - right);
  if (!chapterNumbers.length) {
    ElMessage.warning('请先勾选待取消定时的章节');
    return;
  }

  busyBatchAction.value = 'cancel';
  try {
    const response = await cancelScheduledBookStoreChaptersBatch(props.book.id, chapterNumbers);
    await finalizeBatchMutation(
      response.successCount,
      response.results
        .filter((item) => !item.success)
        .map((item) => `第 ${item.chapterNumber} 章：${item.error || '取消失败'}`),
      '已批量取消定时发布',
    );
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '批量取消定时失败');
  } finally {
    busyBatchAction.value = null;
  }
}

async function finalizeBatchMutation(successCount: number, failures: string[], successMessage: string) {
  if (successCount > 0) {
    await refreshAfterMutation();
    clearSelection();
  }

  if (!failures.length) {
    ElMessage.success(`${successMessage} ${successCount} 章`);
    return;
  }

  if (successCount > 0) {
    ElMessage.warning(`${successMessage} ${successCount} 章，另有 ${failures.length} 章失败`);
    return;
  }

  ElMessage.error(failures[0] || '批量操作失败');
}

async function refreshAfterMutation() {
  await loadData();
  emit('refreshed');
}
</script>

<style scoped>
:global(.mobile-published-dialog) {
  --mp-brand-violet: #0f766e;
  --mp-brand-indigo: #2563eb;
  --nw-bg-primary: #edf4f8;
  --nw-bg-secondary: #f4f8fb;
  --nw-bg-card: #ffffff;
  --cp-primary: #2563eb;
  --cp-primary-strong: #0f766e;
  --cp-text-primary: #102033;
  --cp-text-secondary: #41556b;
  --cp-text-muted: #5d7188;
  --cp-border: rgba(15, 118, 110, 0.14);
  --cp-border-strong: rgba(37, 99, 235, 0.2);
  --cp-surface: rgba(255, 255, 255, 0.96);
  --cp-surface-strong: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 251, 249, 0.94));
  --cp-surface-muted: rgba(244, 248, 251, 0.96);
}

:global(html.dark .mobile-published-dialog) {
  --mp-brand-violet: #0f766e;
  --mp-brand-indigo: #2563eb;
  --nw-bg-primary: #08111f;
  --nw-bg-secondary: #0e1a2d;
  --nw-bg-card: rgba(8, 18, 34, 0.94);
  --cp-primary: #60a5fa;
  --cp-primary-strong: #2dd4bf;
  --cp-text-primary: #f8fafc;
  --cp-text-secondary: rgba(226, 232, 240, 0.82);
  --cp-text-muted: rgba(226, 232, 240, 0.68);
  --cp-border: rgba(45, 212, 191, 0.2);
  --cp-border-strong: rgba(96, 165, 250, 0.28);
  --cp-surface: rgba(14, 26, 45, 0.96);
  --cp-surface-strong: linear-gradient(180deg, rgba(14, 26, 45, 0.98), rgba(8, 17, 31, 0.94));
  --cp-surface-muted: rgba(8, 17, 31, 0.96);
}

:global(html.dark.warm-night .mobile-published-dialog) {
  --mp-brand-violet: #d97706;
  --mp-brand-indigo: #f59e0b;
  --nw-bg-primary: #1a1512;
  --nw-bg-secondary: #241e1a;
  --nw-bg-card: rgba(36, 30, 26, 0.94);
  --nw-border: rgba(139, 92, 46, 0.3);
  --nw-text-primary: #f5e6d3;
  --nw-text-secondary: rgba(245, 230, 211, 0.82);
  --nw-text-muted: rgba(245, 230, 211, 0.68);
  --cp-primary: #fcd34d;
  --cp-primary-strong: #fbbf24;
  --cp-text-primary: #f5e6d3;
  --cp-text-secondary: rgba(245, 230, 211, 0.82);
  --cp-text-muted: rgba(245, 230, 211, 0.68);
  --cp-border: rgba(245, 158, 11, 0.2);
  --cp-border-strong: rgba(245, 158, 11, 0.28);
  --cp-surface: rgba(36, 30, 26, 0.96);
  --cp-surface-strong: linear-gradient(180deg, rgba(36, 30, 26, 0.98), rgba(54, 44, 36, 0.94));
  --cp-surface-muted: rgba(54, 44, 36, 0.96);
  --cp-on-accent: #1a1512;
  --cp-selected-glow: rgba(245, 158, 11, 0.14);
  --cp-disabled-bg: rgba(139, 115, 85, 0.5);
  --cp-disabled-text: rgba(245, 230, 211, 0.5);
  --cp-scrollbar: rgba(245, 158, 11, 0.3);
}

.cp-shell {
  --cp-brand-violet: var(--mp-brand-violet, #7c3aed);
  --cp-brand-indigo: var(--mp-brand-indigo, #4f46e5);
  --cp-resolved-text-primary: var(--cp-text-primary, var(--nw-text-primary, #102033));
  --cp-resolved-text-secondary: var(--cp-text-secondary, var(--nw-text-secondary, #4a6077));
  --cp-resolved-text-muted: var(--cp-text-muted, var(--nw-text-muted, #70849a));
  --cp-on-accent: var(--cp-on-accent, #fff);
  --cp-selected-glow: var(--cp-selected-glow, rgba(99, 102, 241, 0.14));
  --cp-disabled-bg: var(--cp-disabled-bg, rgba(148, 163, 184, 0.92));
  --cp-disabled-text: var(--cp-disabled-text, rgba(255, 255, 255, 0.92));
  --cp-scrollbar: var(--cp-scrollbar, rgba(125, 140, 162, 0.4));
  display: grid;
  gap: 14px;
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
  color: var(--cp-resolved-text-primary);
}

.cp-summary,
.cp-batch,
.cp-list {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 20px;
  border: 1px solid var(--cp-border, color-mix(in srgb, var(--cp-brand-violet) 20%, var(--nw-border, rgba(148, 163, 184, 0.3))));
  background: var(--cp-surface, linear-gradient(155deg, color-mix(in srgb, var(--cp-brand-violet) 7%, var(--nw-bg-card, #ffffff)), color-mix(in srgb, var(--cp-brand-indigo) 5%, var(--nw-bg-card, #ffffff))));
}

.cp-summary {
  gap: 14px;
  border-color: var(--cp-border-strong, color-mix(in srgb, var(--cp-brand-violet) 30%, var(--nw-border, rgba(148, 163, 184, 0.3))));
  background: var(--cp-surface-strong, linear-gradient(155deg, color-mix(in srgb, var(--cp-brand-violet) 9%, var(--nw-bg-card, #ffffff)), color-mix(in srgb, var(--cp-brand-indigo) 6%, var(--nw-bg-card, #ffffff))));
}

.cp-list {
  gap: 14px;
  max-height: 58vh;
  overflow: auto;
  padding: 0;
  border: 0;
  background: transparent;
}

.cp-list::-webkit-scrollbar {
  width: 10px;
}

.cp-list::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: var(--cp-scrollbar, rgba(125, 140, 162, 0.4));
  background-clip: padding-box;
}

.cp-summary__hero,
.cp-batch__header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  justify-content: space-between;
}

.cp-summary__hero strong,
.cp-batch__header strong {
  font-size: 16px;
  color: var(--cp-resolved-text-primary);
}

.cp-summary__hero span,
.cp-batch__header p,
.cp-batch__count {
  margin: 0;
  font-size: 13px;
  color: var(--cp-resolved-text-secondary);
}

.cp-summary__chips,
.cp-batch__actions,
.cp-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.cp-batch__selection,
.cp-quick {
  display: grid;
  gap: 10px;
}

.cp-batch__selection {
  gap: 12px;
}

.cp-quick,
.cp-range,
.cp-batch__actions {
  padding: 12px;
  border-radius: 16px;
  border: 1px solid var(--cp-border, color-mix(in srgb, var(--cp-brand-violet) 20%, var(--nw-border, rgba(148, 163, 184, 0.3))));
  background: var(--cp-surface-muted, color-mix(in srgb, var(--cp-brand-violet) 4%, var(--nw-bg-card, #ffffff)));
}

.cp-range {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.cp-range__dash {
  color: var(--cp-resolved-text-muted);
  font-size: 13px;
  font-weight: 700;
}

.cp-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--cp-brand-violet) 14%, var(--nw-border, rgba(148, 163, 184, 0.3)));
  background: color-mix(in srgb, var(--cp-brand-violet) 10%, var(--nw-bg-card, #ffffff));
  color: var(--cp-resolved-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.cp-chip--strong {
  border-color: color-mix(in srgb, var(--cp-brand-violet) 24%, var(--nw-border, rgba(148, 163, 184, 0.3)));
  background: color-mix(in srgb, var(--cp-brand-violet) 14%, var(--nw-bg-card, #ffffff));
  color: var(--cp-primary-strong, #4338ca);
}

.cp-row {
  display: grid;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 20px;
  border: 1px solid var(--cp-border, color-mix(in srgb, var(--cp-brand-violet) 20%, var(--nw-border, rgba(148, 163, 184, 0.3))));
  background: var(--cp-surface, linear-gradient(155deg, color-mix(in srgb, var(--cp-brand-violet) 7%, var(--nw-bg-card, #ffffff)), color-mix(in srgb, var(--cp-brand-indigo) 5%, var(--nw-bg-card, #ffffff))));
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.cp-row--selected {
  border-color: var(--cp-border-strong, color-mix(in srgb, var(--cp-brand-violet) 30%, var(--nw-border, rgba(148, 163, 184, 0.3))));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #ffffff 14%, transparent),
    0 8px 24px var(--cp-selected-glow, color-mix(in srgb, var(--cp-brand-violet) 12%, transparent));
}

.cp-row--disabled {
  opacity: 0.78;
}

.cp-load-more {
  min-height: 42px;
  border: 1px solid var(--cp-border, color-mix(in srgb, var(--cp-brand-violet) 20%, var(--nw-border, rgba(148, 163, 184, 0.3))));
  border-radius: 999px;
  background: color-mix(in srgb, var(--cp-brand-indigo) 8%, var(--nw-bg-card, #ffffff));
  color: var(--cp-primary-strong, #4338ca);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.cp-load-more:disabled {
  cursor: progress;
  opacity: 0.72;
}

.cp-row__main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.cp-select {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-top: 2px;
}

.cp-select input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.cp-select span {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--cp-brand-violet) 24%, var(--nw-border, rgba(148, 163, 184, 0.3)));
  background: color-mix(in srgb, var(--cp-brand-violet) 6%, var(--nw-bg-card, #ffffff));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 14%, transparent);
}

.cp-select input:checked + span {
  border-color: transparent;
  background: linear-gradient(135deg, var(--cp-primary-strong, #4338ca), var(--cp-primary, #4f46e5));
  box-shadow: inset 0 0 0 4px rgba(255, 255, 255, 0.96);
}

.cp-select input:disabled {
  cursor: not-allowed;
}

.cp-row__meta,
.cp-row__actions {
  display: grid;
  gap: 10px;
}

.cp-row__title,
.cp-row__subline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
}

.cp-row__title strong {
  color: var(--cp-resolved-text-primary);
  font-size: 15px;
}

.cp-row__title span,
.cp-row__subline span {
  color: var(--cp-resolved-text-secondary);
  font-size: 12px;
}

.cp-status {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  font-weight: 700;
}

.cp-status--unpublished,
.cp-status--hidden {
  background: rgba(148, 163, 184, 0.14);
  color: #64748b;
}

.cp-status--scheduled {
  background: rgba(14, 116, 144, 0.12);
  color: #0f766e;
}

.cp-status--pending_audit {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
}

.cp-status--published {
  background: rgba(22, 163, 74, 0.14);
  color: #15803d;
}

.cp-row__actions {
  grid-template-columns: repeat(auto-fit, minmax(132px, max-content));
  align-items: center;
}

.cp-picker {
  min-width: 220px;
}

.cp-picker--wide {
  min-width: min(320px, 100%);
}

.cp-select-box {
  min-width: 160px;
}

.cp-action {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid var(--cp-border, color-mix(in srgb, var(--cp-brand-violet) 20%, var(--nw-border, rgba(148, 163, 184, 0.3))));
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.cp-action--icon {
  min-height: 36px;
  min-width: 36px;
  padding: 0;
  border-radius: 10px;
}

.cp-action--icon svg {
  flex-shrink: 0;
}

.cp-action:hover:not(:disabled) {
  transform: translateY(-1px);
}

.cp-action:disabled {
  cursor: not-allowed;
  opacity: 1;
  transform: none;
  box-shadow: none;
}

.cp-action--primary:disabled {
  background: var(--cp-disabled-bg, linear-gradient(180deg, #94a3b8, #94a3b8));
  border-color: transparent;
  color: var(--cp-disabled-text, rgba(255, 255, 255, 0.92));
}

.cp-action--secondary:disabled,
.cp-action--ghost:disabled {
  background: var(--cp-disabled-bg, rgba(226, 232, 240, 0.92));
  border-color: color-mix(in srgb, var(--cp-brand-violet) 16%, var(--nw-border, rgba(148, 163, 184, 0.3)));
  color: var(--cp-disabled-text, #94a3b8);
}

.cp-action--primary {
  background: linear-gradient(135deg, var(--cp-primary-strong, #4338ca), var(--cp-primary, #4f46e5));
  color: var(--cp-on-accent, #fff);
  border-color: transparent;
  box-shadow: 0 10px 20px color-mix(in srgb, var(--cp-brand-violet) 18%, transparent);
}

.cp-action--secondary {
  background: color-mix(in srgb, var(--cp-brand-indigo) 8%, var(--nw-bg-card, #ffffff));
  border-color: color-mix(in srgb, var(--cp-brand-indigo) 18%, var(--nw-border, rgba(148, 163, 184, 0.3)));
  color: var(--cp-primary-strong, #4338ca);
}

.cp-action--ghost {
  background: color-mix(in srgb, var(--cp-brand-violet) 6%, var(--nw-bg-card, #ffffff));
  border-color: color-mix(in srgb, var(--cp-brand-violet) 16%, var(--nw-border, rgba(148, 163, 184, 0.3)));
  color: var(--cp-resolved-text-secondary);
}

.cp-action:hover:not(:disabled) {
  border-color: var(--cp-border-strong, color-mix(in srgb, var(--cp-brand-violet) 30%, var(--nw-border, rgba(148, 163, 184, 0.3))));
}

.chapter-publish-dialog :deep(.el-input-number) {
  width: 136px;
}

.chapter-publish-dialog :deep(.el-input-number .el-input__wrapper),
.chapter-publish-dialog :deep(.cp-picker .el-input__wrapper),
.chapter-publish-dialog :deep(.cp-select-box .el-select__wrapper) {
  min-height: 40px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--cp-brand-violet) 5%, var(--nw-bg-card, #ffffff));
  box-shadow: 0 0 0 1px var(--cp-border, color-mix(in srgb, var(--cp-brand-violet) 20%, var(--nw-border, rgba(148, 163, 184, 0.3)))) inset;
}

.chapter-publish-dialog :deep(.el-input-number .el-input__wrapper:hover),
.chapter-publish-dialog :deep(.cp-picker .el-input__wrapper:hover),
.chapter-publish-dialog :deep(.cp-select-box .el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--cp-border-strong, color-mix(in srgb, var(--cp-brand-violet) 30%, var(--nw-border, rgba(148, 163, 184, 0.3)))) inset;
}

.chapter-publish-dialog :deep(.el-input-number .el-input-number__decrease),
.chapter-publish-dialog :deep(.el-input-number .el-input-number__increase) {
  background: color-mix(in srgb, var(--cp-brand-violet) 8%, var(--nw-bg-card, #ffffff));
  color: var(--cp-resolved-text-secondary);
}

.chapter-publish-dialog :deep(.el-input-number .el-input__inner),
.chapter-publish-dialog :deep(.cp-picker .el-input__inner),
.chapter-publish-dialog :deep(.cp-select-box .el-select__selected-item) {
  color: var(--cp-resolved-text-primary);
}

.chapter-publish-dialog :deep(.el-date-editor.el-input),
.chapter-publish-dialog :deep(.cp-select-box) {
  width: auto;
}

@media (max-width: 767px) {
  .cp-shell--mobile .cp-summary,
  .cp-shell--mobile .cp-batch,
  .cp-shell--mobile .cp-list {
    padding: 14px;
  }

  .cp-range,
  .cp-row__actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .cp-shell--mobile .cp-range {
    grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr) minmax(112px, 128px);
    align-items: center;
  }

  .cp-shell--mobile .cp-inline--compact {
    display: grid;
    grid-template-columns: minmax(104px, 116px) minmax(0, 1fr);
    align-items: stretch;
  }

  .cp-shell--mobile .cp-inline--grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
  }

  .cp-shell--mobile .cp-batch__actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: stretch;
  }

  .cp-shell--mobile .cp-batch__actions > :nth-child(1) {
    grid-column: span 2;
  }

  .cp-shell--mobile .cp-batch__actions > :nth-child(2) {
    grid-column: span 1;
  }

  .cp-shell--mobile .cp-batch__actions > :nth-child(n + 3) {
    grid-column: span 1;
  }

  .cp-shell--mobile .cp-action {
    min-height: 36px;
    padding: 0 10px;
    font-size: 11px;
  }

  .cp-shell--mobile .cp-action--icon {
    min-height: 32px;
    min-width: 32px;
  }

  .cp-picker,
  .cp-picker--wide,
  .cp-select-box {
    min-width: 100%;
  }

  .cp-shell--mobile .cp-batch__actions .cp-select-box {
    min-width: 0;
  }

  .cp-shell--mobile .cp-inline--compact :deep(.el-input-number) {
    width: 100%;
  }

  .cp-shell--mobile .cp-range :deep(.el-input-number),
  .chapter-publish-dialog :deep(.cp-batch__actions .el-input-number) {
    width: 100%;
  }

  .cp-shell--mobile .cp-range :deep(.el-input__inner) {
    font-size: 12px;
  }

  .cp-row {
    padding: 14px;
  }

  .cp-shell--mobile .cp-row,
  .cp-shell--mobile .cp-quick,
  .cp-shell--mobile .cp-range,
  .cp-shell--mobile .cp-batch__actions {
    box-shadow: none;
  }

  .cp-shell--mobile .cp-row--disabled {
    opacity: 0.9;
  }

  .cp-list {
    padding: 0;
  }
}

@media (max-width: 420px) {
  .cp-shell--mobile .cp-range {
    grid-template-columns: minmax(0, 1fr) 12px minmax(0, 1fr) minmax(88px, 104px);
  }

  .cp-shell--mobile .cp-batch__actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .cp-shell--mobile .cp-range :deep(.el-input__inner) {
    font-size: 11px;
  }

  .cp-shell--mobile .cp-inline--grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 4px;
  }

  .cp-shell--mobile .cp-inline--compact {
    grid-template-columns: 1fr;
  }

  .cp-shell--mobile .cp-action--icon {
    min-height: 28px;
    min-width: 28px;
    border-radius: 8px;
  }

  .cp-shell--mobile .cp-action--icon svg {
    width: 16px;
    height: 16px;
  }
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-status--unpublished),
:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-status--hidden) {
  background: rgba(139, 115, 85, 0.2);
  color: #c4a882;
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-status--scheduled) {
  background: rgba(245, 158, 11, 0.14);
  color: #fbbf24;
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-status--pending_audit) {
  background: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-status--published) {
  background: rgba(52, 211, 153, 0.14);
  color: #34d399;
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-inline--grid .cp-action) {
  background: rgba(36, 30, 26, 0.96);
  border-color: rgba(245, 158, 11, 0.18);
  color: #f5e6d3;
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-inline--grid .cp-action:hover) {
  background: rgba(54, 44, 36, 0.96);
  border-color: rgba(245, 158, 11, 0.3);
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-batch__actions .cp-action) {
  background: rgba(36, 30, 26, 0.96);
  border-color: rgba(245, 158, 11, 0.18);
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-action--secondary) {
  color: #fbbf24;
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-action--ghost) {
  color: rgba(245, 230, 211, 0.82);
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-load-more) {
  background: rgba(36, 30, 26, 0.96);
  border-color: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.el-input-number .el-input-number__decrease),
:global(html.dark.warm-night .mobile-published-dialog) :deep(.el-input-number .el-input-number__increase) {
  background: rgba(36, 30, 26, 0.96);
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.el-input-number .el-input__wrapper),
:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-picker .el-input__wrapper),
:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-select-box .el-select__wrapper) {
  background: rgba(36, 30, 26, 0.96);
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.el-select__arrow) {
  color: #c4a882;
}

:global(html.dark.warm-night .mobile-published-dialog) :deep(.cp-action--primary) {
  background: linear-gradient(135deg, #fbbf24, #f59e0b) !important;
  color: #1a1512 !important;
  box-shadow: 0 10px 20px rgba(245, 158, 11, 0.25);
}
</style>
