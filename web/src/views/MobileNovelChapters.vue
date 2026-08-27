<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { EditPen, Reading, RefreshRight, TrendCharts, PictureFilled, Histogram, View, Edit, DataLine, Ticket, DocumentChecked, SortUp, SortDown, Delete } from '@element-plus/icons-vue';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileStatGroup from '../components/mobile-focus/MobileStatGroup.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileBatchGenerateSheet from '../components/mobile-entry/MobileBatchGenerateSheet.vue';
import MobileBatchProgressCard from '../components/mobile-entry/MobileBatchProgressCard.vue';
import MobileChapterPreviewDrawer from '../components/mobile-entry/MobileChapterPreviewDrawer.vue';
import MobileRewriteChapterSheet from '../components/mobile-entry/MobileRewriteChapterSheet.vue';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import PlotVoteEditor from '../components/mobile-entry/PlotVoteEditor.vue';
import MobileComicStrip from '../components/mobile-entry/MobileComicStrip.vue';
import { fetchVoteByChapter, type VotePointWithStats } from '../api/plot-votes';
import { fetchChapter, deleteChapter } from '../api/chapters';
import { fetchNovel } from '../api/novels';
import { finalizeChapter } from '../api/generate';
import { retryFailedBatch, pauseBatch, forceResetBatch } from '../api/batch-control';
import { usePullRefresh } from '../composables/usePullRefresh';
import { useComicFeature } from '../composables/useComicFeature';
import { useBatchStatusRecovery } from '../composables/useBatchStatusRecovery';
import { getSessionAccessToken } from '../utils/auth-session';
import { usePagedChapters } from '../composables/usePagedChapters';
import { useNovelGenerationStatusPolling } from '../composables/useNovelGenerationStatusPolling';
import { useAgentsStore } from '../stores/agents';
import {
  AGENT_NAMES,
  CHAPTER_STATUS_LABELS,
  STATUS_LABELS,
  type AgentRole,
  type Chapter,
  type ChapterSummary,
  type NovelMetadata,
} from '../types';
import { resolvePreferredActiveRole } from '../utils/agent-progress';
import { runWithConcurrency } from '../utils/concurrency';
import { buildMobileChapterExcerpt } from '../utils/mobile-chapter-preview';
import { useThemeMode } from '../composables/useThemeMode';
import { ElMessage, ElMessageBox } from 'element-plus';
import { extractApiErrorMessage } from '../utils/api-error';

const STAGE_DESCRIPTION: Partial<Record<AgentRole, string>> = {
  outline: '故事骨架正在整理当前章节的关键推进点。',
  'world-builder': '世界设定正在补齐场景、规则与环境约束。',
  character: '角色状态正在校准动机、关系与出场状态。',
  writer: '正文起草中，当前重点是把这一章写出来。',
  editor: '文本润色中，正在统一节奏、文风与表达。',
  reader: '质检中，正在做收尾检查和入库确认。',
  'writing-assistant': '写作助手正在协调当前生成流程。',
};

const route = useRoute();
const router = useRouter();
const agentsStore = useAgentsStore();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const { comicEnabled } = useComicFeature();
/** 章节 → 漫画状态（'draft' | 'published' | null），从后端批量加载 */
const chapterComicStatus = ref<Record<number, 'draft' | 'published' | null>>({});
/** 章节 → 投票状态（true = 已设投票） */
const chapterVoteStatus = ref<Record<number, boolean>>({});

/** 左侧指示条颜色：综合章节状态 + 漫画/投票 */
function getChapterIndicatorClass(chapter: ChapterSummary): string {
  if (isChapterFailed(chapter)) return 'mnc-indicator--failed';
  const comic = chapterComicStatus.value[chapter.chapterNumber];
  if (comic === 'published') return 'mnc-indicator--published';
  if (comic === 'draft') return 'mnc-indicator--draft';
  if (chapter.status === 'finalized' || chapter.status === 'edited' || chapter.status === 'drafted') return 'mnc-indicator--done';
  return 'mnc-indicator--default';
}

function isChapterFailed(chapter: ChapterSummary): boolean {
  return chapter.diagnostics?.generationLifecycle?.phase === 'failed';
}

const loadingNovel = ref(false);
const novel = ref<NovelMetadata | null>(null);
const previewVisible = ref(false);
const previewChapterNumber = ref<number | null>(null);
const batchSheetVisible = ref(false);
const rewriteSheetVisible = ref(false);
const rewriteChapterNumber = ref<number | null>(null);
const rewriteMode = ref<'rewrite' | 'polish'>('rewrite');
const voteEditorVisible = ref(false);
const voteChapterId = ref('');
const voteExisting = ref<VotePointWithStats | null>(null);

const novelId = computed(() => String(route.params.id || ''));
const {
  chapters,
  hasMore: hasMoreChapters,
  loadedCount: loadedChapterCount,
  loading: loadingChapters,
  loadingMore: loadingMoreChapters,
  loadFirstPage: loadFirstChapterPage,
  loadMore: loadMoreChapters,
  reset: resetChapters,
  total: chapterTotal,
  upsert: upsertChapterSummary,
} = usePagedChapters(novelId, { pageSize: 50, order: 'desc' });
const selectedChapterNumber = computed(() => {
  const value = Number(route.query.chapter);
  return Number.isFinite(value) && value > 0 ? value : null;
});
const loading = computed(() => loadingNovel.value || loadingChapters.value);

// 移动端使用 HTTP 轮询替代 WebSocket（DMP 平台 ws 不可用）
// agent 生成进度通过 polling composable 驱动 agentsStore
const { poll: pollGenerationStatus } = useNovelGenerationStatusPolling(novelId);

// 批量任务状态通过已有的 REST 轮询恢复（useBatchStatusRecovery）
// 但需要 isConnected 为 true 才启动轮询；移动端没有 ws，始终传 true
const isConnected = ref(true);
useBatchStatusRecovery({
  novelId,
  isConnected,
});

function safeGetSortAsc(): boolean {
  try { return localStorage.getItem('novel_chapters_sort_asc') === '1'; } catch { return false; }
}
function safeSetSortAsc(val: boolean) {
  try { localStorage.setItem('novel_chapters_sort_asc', val ? '1' : '0'); } catch { /* 静默 */ }
}

const sortAsc = ref(safeGetSortAsc());
const chapterPreviewTextMap = ref<Record<number, string>>({});
let chapterPreviewRequestSerial = 0;
/** 章节正文预览批量加载的取消控制器；翻页/重入时 abort 上一批未完成请求 */
let chapterPreviewAbort: AbortController | null = null;
/** 章节漫画/投票状态批量加载的取消控制器；novelId 变化或卸载时 abort */
let chapterStatusAbort: AbortController | null = null;
/** 状态加载的串行序号，确保只有最新一轮可以写回响应式状态 */
let chapterStatusRequestSerial = 0;
/** 已查询缓存：避免重复查询同一章节的漫画/投票状态（key=章节号） */
const chapterStatusQueried = new Map<number, boolean>();

const sortedChapters = computed(() => {
  const all = [...chapters.value].sort((a, b) =>
    sortAsc.value ? a.chapterNumber - b.chapterNumber : b.chapterNumber - a.chapterNumber,
  );
  const start = (chapterCurrentPage.value - 1) * chaptersPerPage;
  return all.slice(start, start + chaptersPerPage);
});
const chaptersPerPage = 10;
const chapterCurrentPage = ref(1);
const chapterTotalPages = computed(() =>
  Math.max(1, Math.ceil(totalChapterCount.value / chaptersPerPage)),
);
function changeChapterPage(page: number): void {
  chapterCurrentPage.value = Math.max(1, Math.min(chapterTotalPages.value, page));
  // 翻页后加载该页可能需要的章节数据
  const needed = chapterCurrentPage.value * chaptersPerPage;
  if (chapters.value.length < needed && hasMoreChapters.value) {
    void handleLoadMoreChapters();
  }
  void loadChapterPreviewTexts(novelId.value);
}
const selectedChapter = computed(() => {
  if (selectedChapterNumber.value == null) return null;
  return sortedChapters.value.find((item) => item.chapterNumber === selectedChapterNumber.value) ?? null;
});
const latestChapter = computed(() => sortedChapters.value[0] ?? null);
const highlightedChapter = computed(() => selectedChapter.value ?? latestChapter.value);
const previewChapter = computed(() => {
  if (previewChapterNumber.value == null) return null;
  return sortedChapters.value.find((item) => item.chapterNumber === previewChapterNumber.value) ?? null;
});
const rewriteChapter = computed(() => {
  if (rewriteChapterNumber.value == null) return null;
  return sortedChapters.value.find((item) => item.chapterNumber === rewriteChapterNumber.value) ?? null;
});

const totalChapterCount = computed(() => Math.max(chapterTotal.value, novel.value?.chapterCount ?? chapters.value.length));
const finalizedCount = computed(() => (
  novel.value?.finalizedChapterCount ?? chapters.value.filter((item) => item.status === 'finalized').length
));
const draftingCount = computed(() => Math.max(0, totalChapterCount.value - finalizedCount.value));
const heroStats = computed(() => [
  { label: '总章节', value: totalChapterCount.value },
  { label: '已定稿', value: finalizedCount.value },
  { label: '待推进', value: draftingCount.value },
]);

const nextChapterNumber = computed(() => Math.max(latestChapter.value?.chapterNumber ?? 0, novel.value?.chapterCount ?? 0) + 1);
const isGeneratingHere = computed(() => (
  agentsStore.isGeneratingNovel(novelId.value)
));
const activeRole = computed<AgentRole | null>(() => {
  if (!isGeneratingHere.value) return null;
  return resolvePreferredActiveRole(agentsStore.getNovelActiveAgentList(novelId.value) as AgentRole[]);
});
const activeAgentLabel = computed(() => (
  activeRole.value ? (AGENT_NAMES[activeRole.value] ?? activeRole.value) : '写作助手'
));

const batchBelongsHere = computed(() => agentsStore.batchNovelId === novelId.value);
const isBatchRunningHere = computed(() => batchBelongsHere.value && agentsStore.batchRunning);
const isBatchFinalizingHere = computed(() => batchBelongsHere.value && agentsStore.batchFinalizing);
const hasBatchStateHere = computed(() => (
  batchBelongsHere.value && (agentsStore.batchItems.length > 0 || agentsStore.batchFinalizeStatus !== 'idle')
));
const batchCompletedCount = computed(() => (
  batchBelongsHere.value ? agentsStore.batchItems.filter((item) => item.status === 'completed').length : 0
));
const batchFailedCount = computed(() => (
  batchBelongsHere.value ? agentsStore.batchItems.filter((item) => item.status === 'failed').length : 0
));
const batchCurrentChapterNumber = computed(() => {
  if (!batchBelongsHere.value) return null;
  const runningItem = agentsStore.batchItems.find((item) => item.status === 'running');
  if (runningItem) return runningItem.chapterNumber;
  return isGeneratingHere.value ? agentsStore.getGeneratingChapterNumberForNovel(novelId.value) : null;
});
const batchProgressDescription = computed(() => {
  if (isBatchFinalizingHere.value) {
    return '章节正文已经生成完，当前正在逐章定稿并写入最终状态。';
  }
  if (activeRole.value) {
    return STAGE_DESCRIPTION[activeRole.value] ?? `${activeAgentLabel.value} 正在处理当前章节。`;
  }
  if (isBatchRunningHere.value && batchCurrentChapterNumber.value != null) {
    return `第 ${batchCurrentChapterNumber.value} 章正在执行中，这一批会自动继续往后跑。`;
  }
  if (hasBatchStateHere.value) {
    return '这批任务已经结束，你可以清空状态，或继续启动下一批。';
  }
  return '支持一次连续生成多章，适合先把后续章节整体铺开。';
});
const batchEstimatedRemaining = computed(() => {
  if (!batchBelongsHere.value) return null;
  const finished = agentsStore.batchItems.filter((item) => typeof item.duration === 'number' && item.duration > 0);
  if (finished.length === 0) return null;
  const avgMs = finished.reduce((sum, item) => sum + (item.duration ?? 0), 0) / finished.length;
  const pending = agentsStore.batchItems.filter((item) => item.status === 'pending' || item.status === 'running').length;
  if (pending <= 0) return null;
  const totalMs = avgMs * pending;
  if (totalMs < 60_000) return `${Math.max(1, Math.round(totalMs / 1000))} 秒`;
  return `${Math.max(1, Math.round(totalMs / 60_000))} 分钟`;
});
const batchState = computed(() => ({
  running: isBatchRunningHere.value,
  finalizing: isBatchFinalizingHere.value,
  progress: batchBelongsHere.value ? agentsStore.batchProgress : 0,
  currentChapterNumber: batchCurrentChapterNumber.value,
  currentIndex: batchBelongsHere.value ? agentsStore.batchCurrentIndex : 0,
  completedCount: batchCompletedCount.value,
  failedCount: batchFailedCount.value,
  totalCount: batchBelongsHere.value ? agentsStore.batchItems.length : 0,
  activeAgentLabel: isBatchFinalizingHere.value ? '定稿流程' : activeAgentLabel.value,
  progressDescription: batchProgressDescription.value,
  estimatedRemaining: batchEstimatedRemaining.value,
  finalizeSucceeded: batchBelongsHere.value ? agentsStore.batchFinalizeSucceeded : 0,
  finalizeFailed: batchBelongsHere.value ? agentsStore.batchFinalizeFailed : 0,
  hasFailedItems: batchFailedCount.value > 0,
}));

const canCancelBatch = computed(() => batchBelongsHere.value && isBatchRunningHere.value);
const canRetryBatch = computed(() => batchBelongsHere.value && !isBatchRunningHere.value && batchFailedCount.value > 0);
const canClearBatch = computed(() => batchBelongsHere.value && !isBatchRunningHere.value && agentsStore.batchItems.length > 0);

async function handleCancelBatch() {
  if (!canCancelBatch.value) return;
  try {
    await ElMessageBox.confirm('确定取消当前批量生成任务吗？已完成的章节会保留。', '取消批量', {
      type: 'warning',
      confirmButtonText: '确认取消',
      cancelButtonText: '继续生成',
    });
  } catch { return; }
  try {
    await pauseBatch(novelId.value);
    ElMessage.success('已发送取消指令');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '取消失败，请稍后重试'));
  }
}

async function handleRetryFailedBatch() {
  if (!canRetryBatch.value) return;
  try {
    const res = await retryFailedBatch(novelId.value);
    ElMessage.success(`已重新排队 ${res.retryCount} 个失败章节`);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '重试失败，请稍后重试'));
  }
}

async function handleClearBatch() {
  if (!canClearBatch.value) return;
  try {
    await ElMessageBox.confirm('确定清空批量任务状态吗？只会清空进度记录，不会删除已生成的章节。', '清空状态', {
      type: 'warning',
      confirmButtonText: '确认清空',
      cancelButtonText: '取消',
    });
  } catch { return; }
  try {
    await forceResetBatch(novelId.value);
    ElMessage.success('已清空');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '清空失败，请稍后重试'));
  }
}

function openVoteForLatest() {
  const latest = latestChapter.value;
  if (latest) void openVoteEditor(latest.chapterNumber);
}

function navigate(path: string) {
  void router.push(path);
}

function openPreview(chapter: ChapterSummary) {
  previewChapterNumber.value = chapter.chapterNumber;
  previewVisible.value = true;
}

function openReader(chapterNumber?: number | null) {
  const query = chapterNumber ? `?chapter=${chapterNumber}` : '';
  void router.push(`/m/novel/${novelId.value}/read${query}`);
}

const comicVisible = ref(false);
const comicChapterNumber = ref<number | null>(null);
/** 打开章节漫画制作（当前位置直接弹窗，不跳转阅读器） */
function openComicMaker(chapterNumber: number) {
  comicChapterNumber.value = chapterNumber;
  comicVisible.value = true;
}

function openBatchSheet() {
  batchSheetVisible.value = true;
}

function openRewriteSheet(chapterNumber: number) {
  rewriteMode.value = 'rewrite';
  rewriteChapterNumber.value = chapterNumber;
  rewriteSheetVisible.value = true;
}

function openPolishSheet(chapterNumber: number) {
  rewriteMode.value = 'polish';
  rewriteChapterNumber.value = chapterNumber;
  rewriteSheetVisible.value = true;
}

async function openVoteEditor(chapterNumber: number) {
  voteChapterId.value = String(chapterNumber);
  voteExisting.value = null;
  voteEditorVisible.value = true;
  try {
    const existing = await fetchVoteByChapter(novelId.value, String(chapterNumber));
    voteExisting.value = existing;
  } catch {
    // 忽略错误
  }
}

const finalizingChapter = ref<number | null>(null);
async function handleFinalize(chapterNumber: number) {
  if (finalizingChapter.value) return;
  finalizingChapter.value = chapterNumber;
  try {
    await finalizeChapter(novelId.value, chapterNumber);
    upsertChapterSummary(chapterNumber, { status: 'finalized' } as any);
    await loadData();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '定稿失败，请稍后重试'));
  }
  finally {
    finalizingChapter.value = null;
  }
}

const deletingChapter = ref<number | null>(null);
async function handleDeleteChapter(chapter: ChapterSummary) {
  if (deletingChapter.value) return;
  try {
    await ElMessageBox.confirm(
      `确定删除第 ${chapter.chapterNumber} 章《${chapter.title || '未命名章节'}》吗？此操作不可撤销。`,
      '删除章节',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    );
  } catch { return; }
  deletingChapter.value = chapter.chapterNumber;
  try {
    await deleteChapter(novelId.value, chapter.chapterNumber);
    ElMessage.success('章节已删除');
    await loadData();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败，请稍后重试'));
  } finally {
    deletingChapter.value = null;
  }
}

function handleVoteSaved() {
  voteEditorVisible.value = false;
}

function handlePreviewRewrite(chapterNumber: number) {
  previewVisible.value = false;
  openRewriteSheet(chapterNumber);
}

function getChapterPreviewText(chapter: ChapterSummary): string {
  return chapterPreviewTextMap.value[chapter.chapterNumber]
    || buildMobileChapterExcerpt(undefined, chapter.summary);
}

function handlePreviewPolish(chapterNumber: number) {
  previewVisible.value = false;
  openPolishSheet(chapterNumber);
}

async function handleRewriteCompleted(payload: { chapterNumber: number }) {
  rewriteSheetVisible.value = false;
  rewriteChapterNumber.value = payload.chapterNumber;
  await loadData();
  await ensureChapterSummaryLoaded(payload.chapterNumber);
  previewChapterNumber.value = payload.chapterNumber;
  previewVisible.value = true;
}

function formatNovelStatus(status?: NovelMetadata['status']): string {
  if (!status) return '--';
  return STATUS_LABELS[status] ?? status;
}

function formatChapterStatus(chapter: ChapterSummary): string {
  if (isChapterFailed(chapter)) return '生成失败';
  return CHAPTER_STATUS_LABELS[chapter.status] ?? chapter.status;
}

function getChapterStatusTone(chapter: ChapterSummary): string {
  if (isChapterFailed(chapter)) return 'mobile-focus-tag--danger';
  switch (chapter.status) {
    case 'finalized':
      return 'mobile-focus-tag--teal';
    case 'reviewed':
      return 'mobile-focus-tag--gold';
    case 'edited':
    case 'drafted':
      return 'mobile-focus-tag--sky';
    case 'outlined':
    default:
      return 'mobile-focus-tag--ink';
  }
}

async function loadData() {
  const requestNovelId = novelId.value;
  if (!requestNovelId) return;

  loadingNovel.value = true;
  const [novelResult, chaptersResult] = await Promise.allSettled([
    fetchNovel(requestNovelId),
    loadFirstChapterPage(),
  ]);
  if (requestNovelId !== novelId.value) return;

  if (novelResult.status === 'fulfilled') {
    novel.value = novelResult.value;
  } else {
    novel.value = null;
  }
  if (chaptersResult.status === 'rejected') {
    resetChapters();
  }
  loadingNovel.value = false;

  void loadChapterPreviewTexts(requestNovelId);
  // 后台加载漫画/投票状态（不阻塞页面渲染）
  void loadChapterStatuses(requestNovelId);
}

async function loadChapterPreviewTexts(requestNovelId: string) {
  const chaptersForPreview = sortedChapters.value;
  if (chaptersForPreview.length === 0) {
    chapterPreviewTextMap.value = {};
    return;
  }

  // 翻页/重入时取消上一批未完成的请求，避免请求堆积
  if (chapterPreviewAbort) {
    chapterPreviewAbort.abort();
  }
  const controller = new AbortController();
  chapterPreviewAbort = controller;

  const serial = ++chapterPreviewRequestSerial;
  const entries: Array<readonly [number, string]> = [];
  await runWithConcurrency(
    chaptersForPreview,
    async (chapter) => {
      if (controller.signal.aborted) return;
      try {
        const detail = await fetchChapter(requestNovelId, chapter.chapterNumber, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        entries.push([
          chapter.chapterNumber,
          buildMobileChapterExcerpt(detail.content, chapter.summary),
        ]);
      } catch {
        // 被取消时不写入 fallback，避免覆盖新一轮结果
        if (controller.signal.aborted) return;
        entries.push([
          chapter.chapterNumber,
          buildMobileChapterExcerpt(undefined, chapter.summary),
        ]);
      }
    },
    3,
    controller.signal,
  );

  if (serial !== chapterPreviewRequestSerial || requestNovelId !== novelId.value || controller.signal.aborted) return;
  chapterPreviewTextMap.value = Object.fromEntries(entries);
}

let loadStatusesRunning = false;
/** 批量加载章节漫画状态 + 投票状态（并发执行，限制 4 路；novelId 变化/卸载时取消） */
async function loadChapterStatuses(nid: string) {
  if (loadStatusesRunning) return;
  loadStatusesRunning = true;
  try {
    // 取消上一次未完成的查询
    if (chapterStatusAbort) {
      chapterStatusAbort.abort();
    }
    const controller = new AbortController();
    chapterStatusAbort = controller;
    const serial = ++chapterStatusRequestSerial;

    const nums = sortedChapters.value.map((c) => c.chapterNumber);
    // 在已有响应式状态基础上增量更新，避免清空已查询章节
    const comicMap: Record<number, 'draft' | 'published' | null> = { ...chapterComicStatus.value };
    const voteMap: Record<number, boolean> = { ...chapterVoteStatus.value };
    const token = getSessionAccessToken() || '';

    await runWithConcurrency(
      nums,
      async (cn) => {
        if (controller.signal.aborted) return;
        // 已查询缓存：跳过重复查询
        if (chapterStatusQueried.get(cn)) return;
        const tasks: Array<Promise<void>> = [];
        // 漫画状态（仅功能开启时查询，避免生产大量404）
        if (comicEnabled.value) {
          tasks.push((async () => {
            try {
              const resp = await fetch(`/api/novels/${nid}/comics/${cn}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
              });
              if (resp.ok) {
                const manifest = await resp.json();
                comicMap[cn] = manifest.status ?? 'draft';
              }
            } catch { /* 静默 */ }
          })());
        }
        // 投票状态（fetchVoteByChapter 未暴露 signal，靠外部 abort 检查兜底）
        tasks.push((async () => {
          try {
            const vote = await fetchVoteByChapter(nid, String(cn));
            if (controller.signal.aborted) return;
            voteMap[cn] = !!vote;
          } catch { /* 静默 */ }
        })());
        await Promise.all(tasks);
        if (!controller.signal.aborted) {
          chapterStatusQueried.set(cn, true);
        }
      },
      4,
      controller.signal,
    );

    if (serial !== chapterStatusRequestSerial || controller.signal.aborted || nid !== novelId.value) return;
    chapterComicStatus.value = comicMap;
    chapterVoteStatus.value = voteMap;
  } catch {
    // 状态加载失败不阻塞页面使用
  } finally {
    loadStatusesRunning = false;
  }
}

async function handleLoadMoreChapters() {
  try {
    await loadMoreChapters();
    void loadChapterPreviewTexts(novelId.value);
  } catch {
    // Keep the mobile page quiet; the user can retry with the same button.
  }
}

let pendingSummaryKey = '';

async function ensureChapterSummaryLoaded(chapterNumber: number) {
  const requestNovelId = novelId.value;
  if (!requestNovelId || sortedChapters.value.some((item) => item.chapterNumber === chapterNumber)) return;
  const key = `${requestNovelId}:${chapterNumber}`;
  if (pendingSummaryKey === key) return;

  pendingSummaryKey = key;
  try {
    const detail = await fetchChapter(requestNovelId, chapterNumber);
    if (pendingSummaryKey !== key || requestNovelId !== novelId.value || detail.chapterNumber !== chapterNumber) return;
    upsertChapterSummary(toChapterSummary(detail));
  } catch {
    // Invalid deep links should not force the whole chapter hub into an error state.
  } finally {
    if (pendingSummaryKey === key) {
      pendingSummaryKey = '';
    }
  }
}

function toChapterSummary(chapter: Chapter): ChapterSummary {
  return {
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    status: chapter.status,
    wordCount: chapter.wordCount,
    summary: chapter.summary,
    readerScore: chapter.readerScore,
    diagnostics: chapter.diagnostics,
    updatedAt: chapter.updatedAt,
  };
}

const { pullDistance, refreshing, triggered, pullContainerRef } = usePullRefresh({
  onRefresh: () => loadData(),
});

watch(
  isConnected,
  (connected) => {
    if (connected && novelId.value) {
      void agentsStore.restoreBatch(novelId.value);
    }
  },
  { immediate: true },
);

watch(
  novelId,
  (value, oldValue) => {
    if (value !== oldValue) {
      agentsStore.clearAll();
      // 切换作品时取消上一部小说未完成的状态查询，并清空查询缓存
      if (chapterStatusAbort) {
        chapterStatusAbort.abort();
        chapterStatusAbort = null;
      }
      chapterStatusRequestSerial++;
      chapterStatusQueried.clear();
    }
    batchSheetVisible.value = false;
    rewriteSheetVisible.value = false;
    previewVisible.value = false;
    resetChapters();
    void loadData();
    if (value) {
      void agentsStore.restoreBatch(value);
    }
  },
  { immediate: true },
);

// 组件卸载时取消所有未完成的批量请求
onUnmounted(() => {
  if (chapterPreviewAbort) {
    chapterPreviewAbort.abort();
    chapterPreviewAbort = null;
  }
  if (chapterStatusAbort) {
    chapterStatusAbort.abort();
    chapterStatusAbort = null;
  }
});

watch(
  () => [novelId.value, selectedChapterNumber.value, sortedChapters.value] as const,
  ([, chapterNumber, chapterList]) => {
    if (chapterNumber == null) return;
    const chapter = chapterList.find((item) => item.chapterNumber === chapterNumber);
    if (!chapter) {
      void ensureChapterSummaryLoaded(chapterNumber);
    }
  },
  { immediate: true },
);

watch(
  () => agentsStore.getLastCompletedChapterForNovel(novelId.value),
  (completedChapter, prevChapter) => {
    if (completedChapter == null) return;
    if (completedChapter === prevChapter) return;
    void loadData();
  },
);

watch(
  () => [agentsStore.batchStatus, agentsStore.batchFinalizeStatus, agentsStore.batchNovelId] as const,
  ([status, finalizeStatus, batchNovelId], [prevStatus, prevFinalizeStatus, prevNovelId]) => {
    if (batchNovelId !== novelId.value) return;
    const completedNow = status === 'completed' && prevStatus !== 'completed';
    const cancelledNow = status === 'cancelled' && prevStatus !== 'cancelled';
    const finalizedNow = finalizeStatus === 'completed' && prevFinalizeStatus !== 'completed';
    const failedFinalizeNow = finalizeStatus === 'failed' && prevFinalizeStatus !== 'failed';
    if (completedNow || cancelledNow || finalizedNow || failedFinalizeNow || batchNovelId !== prevNovelId) {
      void loadData();
    }
  },
);

// 从首页"批量生成多章"链接跳转过来时自动打开批量面板
const autoOpenBatchFlag = ref(route.query.batch != null);
watch(
  () => route.query.batch,
  (val) => { if (val) autoOpenBatchFlag.value = true; },
  { immediate: true },
);
watch([loading, novel], ([isLoading, currentNovel]) => {
  if (!isLoading && currentNovel && autoOpenBatchFlag.value) {
    autoOpenBatchFlag.value = false;
    batchSheetVisible.value = true;
    router.replace({ query: {} });
  }
});
</script>

<template>
  <div ref="pullContainerRef" class="mobile-novel-chapters-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
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
      <MobileTopbar title="章节中心" subtitle="章节目录" :brand-size="28">
        <template #leading>
          <button class="mobile-focus-button--secondary" type="button" @click="navigate(`/m/novel/${novelId}`)">
            返回详情
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-novel-chapters-main mobile-focus-main">
        <MobileSectionCard kicker="Chapter Hub" hero class="mobile-novel-chapters-hero">
          <h1>{{ novel?.title || '当前作品' }}</h1>
          <p v-if="selectedChapter" class="mobile-focus-note">
            第 {{ selectedChapter.chapterNumber }} 章
          </p>

          <MobileBatchProgressCard
            v-if="hasBatchStateHere"
            :progress="batchState.progress"
            :running="batchState.running"
            :finalizing="batchState.finalizing"
            :current-chapter-number="batchState.currentChapterNumber"
            :current-index="batchState.currentIndex"
            :completed-count="batchState.completedCount"
            :failed-count="batchState.failedCount"
            :total-count="batchState.totalCount"
            :active-agent-label="batchState.activeAgentLabel"
            :progress-description="batchState.progressDescription"
            :estimated-remaining="batchState.estimatedRemaining"
            :finalize-succeeded="batchState.finalizeSucceeded"
            :finalize-failed="batchState.finalizeFailed"
            :can-cancel="canCancelBatch"
            :can-retry="canRetryBatch"
            :can-clear="canClearBatch"
            @cancel="handleCancelBatch"
            @retry="handleRetryFailedBatch"
            @clear="handleClearBatch"
          />

          <MobileStatGroup :items="heroStats" />

          <div class="mobile-focus-meta">
            <span class="mobile-focus-tag mobile-focus-tag--sky">{{ formatNovelStatus(novel?.status) }}</span>
            <span class="mobile-focus-tag mobile-focus-tag--sky">{{ (novel?.wordCount || 0).toLocaleString() }} 字</span>
            <span class="mobile-focus-tag mobile-focus-tag--sky">
              {{ isConnected ? '实时进度已连接' : '正在重连实时进度' }}
            </span>
          </div>

          <div class="mobile-novel-chapters-quick-actions">
            <button
              v-if="highlightedChapter?.chapterNumber"
              class="mobile-focus-button--primary mobile-novel-chapters-quick-btn"
              type="button"
              @click="openReader(highlightedChapter!.chapterNumber)"
            >
              <el-icon :size="15"><Reading /></el-icon>
              阅读第 {{ highlightedChapter!.chapterNumber }} 章
            </button>
            <button
              v-if="latestChapter"
              class="mobile-focus-button--ghost mobile-novel-chapters-quick-btn"
              type="button"
              @click="openVoteForLatest"
            >
              <el-icon :size="15"><TrendCharts /></el-icon>
              剧情投票
            </button>
          </div>
        </MobileSectionCard>

        <MobileSectionCard kicker="List" title="章节列表" class="mobile-novel-chapters-panel">
          <template #actions>
            <div class="mobile-novel-chapters-toolbar">
              <button class="mobile-focus-button--ghost" type="button" @click="sortAsc = !sortAsc; chapterCurrentPage = 1; safeSetSortAsc(sortAsc)">
                <el-icon :size="14"><component :is="sortAsc ? SortUp : SortDown" /></el-icon>
                {{ sortAsc ? '升序' : '降序' }}
              </button>
              <button class="mobile-focus-button--secondary" type="button" @click="loadData">
                <el-icon :size="14"><RefreshRight /></el-icon>
                刷新
              </button>
            </div>
          </template>

          <div v-if="loading" class="mobile-novel-chapters-loading mobile-focus-loading">
            <el-skeleton animated :rows="6" />
          </div>

          <div v-else-if="sortedChapters.length" class="mobile-focus-list">
            <div
              v-for="chapter in sortedChapters"
              :key="chapter.chapterNumber"
              class="mnc-compact-card"
              :class="{
                'mnc-compact-card--highlighted': highlightedChapter?.chapterNumber === chapter.chapterNumber,
              }"
            >
              <!-- 左侧状态指示条 -->
              <div class="mnc-compact-card__indicator" :class="getChapterIndicatorClass(chapter)" />

              <!-- 主体内容（点击预览） -->
              <div class="mnc-compact-card__body" @click="openPreview(chapter)">
                <div class="mnc-compact-card__header">
                  <strong class="mnc-compact-card__title">第 {{ chapter.chapterNumber }} 章 · {{ chapter.title }}</strong>
                  <div class="mnc-compact-card__badges">
                    <span class="mnc-compact-card__badge" :class="getChapterStatusTone(chapter)">
                      {{ formatChapterStatus(chapter) }}
                    </span>
                    <span class="mnc-compact-card__badge mnc-badge--meta">{{ (chapter.wordCount || 0).toLocaleString() }}字</span>
                    <span v-if="chapter.readerScore" class="mnc-compact-card__badge mnc-badge--score">评分{{ chapter.readerScore }}</span>
                  </div>
                </div>
                <p v-if="getChapterPreviewText(chapter)" class="mnc-compact-card__summary">{{ getChapterPreviewText(chapter) }}</p>
              </div>

              <!-- 状态标签（漫画/投票状态指示） -->
              <div class="mnc-compact-card__status-tags">
                <span v-if="comicEnabled && chapterComicStatus[chapter.chapterNumber] === 'published'" class="mnc-status-dot mnc-status-dot--published" title="漫画已发布" />
                <span v-else-if="comicEnabled && chapterComicStatus[chapter.chapterNumber] === 'draft'" class="mnc-status-dot mnc-status-dot--draft" title="漫画草稿" />
                <span v-if="chapterVoteStatus[chapter.chapterNumber]" class="mnc-status-dot mnc-status-dot--vote" title="已设投票" />
              </div>

              <!-- 操作按钮（图标+小字，一行排列） -->
              <div class="mnc-compact-card__actions">
                <button class="mnc-action-btn" type="button" @click.stop="openPreview(chapter)">
                  <el-icon :size="14"><View /></el-icon>
                  <span>预览</span>
                </button>
                <button
                  v-if="comicEnabled"
                  class="mnc-action-btn"
                  :class="{ 'mnc-action-btn--active': chapterComicStatus[chapter.chapterNumber] }"
                  type="button"
                  @click.stop="openComicMaker(chapter.chapterNumber)"
                >
                  <el-icon :size="14"><PictureFilled /></el-icon>
                  <span>漫画</span>
                </button>
                <button class="mnc-action-btn" type="button" @click.stop="openPolishSheet(chapter.chapterNumber)">
                  <el-icon :size="14"><Edit /></el-icon>
                  <span>润色</span>
                </button>
                <button class="mnc-action-btn" type="button" @click.stop="openRewriteSheet(chapter.chapterNumber)">
                  <el-icon :size="14"><EditPen /></el-icon>
                  <span>重写</span>
                </button>
                <button class="mnc-action-btn" type="button" @click.stop="openVoteEditor(chapter.chapterNumber)">
                  <el-icon :size="14"><Ticket /></el-icon>
                  <span>投票</span>
                </button>
                <button
                  v-if="chapter.status !== 'finalized'"
                  class="mnc-action-btn"
                  :class="{ 'mnc-action-btn--finalize': chapter.status !== 'finalized' }"
                  type="button"
                  :disabled="finalizingChapter === chapter.chapterNumber"
                  @click.stop="handleFinalize(chapter.chapterNumber)"
                >
                  <el-icon :size="14"><DocumentChecked /></el-icon>
                  <span>{{ finalizingChapter === chapter.chapterNumber ? '定稿中' : '定稿' }}</span>
                </button>
                <button
                  class="mnc-action-btn mnc-action-btn--danger"
                  type="button"
                  :disabled="deletingChapter === chapter.chapterNumber"
                  @click.stop="handleDeleteChapter(chapter)"
                >
                  <el-icon :size="14"><Delete /></el-icon>
                  <span>{{ deletingChapter === chapter.chapterNumber ? '删除中' : '删除' }}</span>
                </button>
                <button
                  class="mnc-action-btn mnc-action-btn--primary"
                  type="button"
                  @click.stop="openReader(chapter.chapterNumber)"
                >
                  <el-icon :size="14"><Reading /></el-icon>
                  <span>阅读</span>
                </button>
              </div>
            </div>
            <!-- 分页控件 -->
            <div v-if="totalChapterCount > chaptersPerPage" class="mnc-pagination">
              <button
                class="mnc-page-btn"
                type="button"
                :disabled="chapterCurrentPage <= 1"
                @click="changeChapterPage(chapterCurrentPage - 1)"
              >上一页</button>
              <span class="mnc-page-info">{{ chapterCurrentPage }} / {{ chapterTotalPages }}</span>
              <button
                class="mnc-page-btn"
                type="button"
                :disabled="chapterCurrentPage >= chapterTotalPages"
                @click="changeChapterPage(chapterCurrentPage + 1)"
              >下一页</button>
            </div>
          </div>

          <div v-else class="mobile-focus-empty">
            <strong>还没有章节</strong>
            <p>先从作品详情发起章节生成，生成完成后回来阅读。</p>
            <div class="mobile-novel-chapters-empty-actions">
              <button class="mobile-focus-button--secondary" type="button" @click="navigate(`/m/novel/${novelId}`)">
                返回作品详情
              </button>
            </div>
          </div>
        </MobileSectionCard>
      </main>
    </div>

    <MobileChapterPreviewDrawer
      :visible="previewVisible"
      :novel-id="novelId"
      :novel-title="novel?.title"
      :chapter-summary="previewChapter"
      @update:visible="(value) => { previewVisible = value; }"
      @open-reader="openReader"
      @rewrite-chapter="handlePreviewRewrite"
      @polish-chapter="handlePreviewPolish"
    />
    <MobileBatchGenerateSheet
      :visible="batchSheetVisible"
      :novel-id="novelId"
      :next-chapter-number="nextChapterNumber"
      :batch-state="batchState"
      @update:visible="(value) => { batchSheetVisible = value; }"
      @started="batchSheetVisible = true"
    />
    <MobileRewriteChapterSheet
      :visible="rewriteSheetVisible"
      :novel-id="novelId"
      :chapter-summary="rewriteChapter"
      :mode="rewriteMode"
      @update:visible="(value) => { rewriteSheetVisible = value; }"
      @rewritten="handleRewriteCompleted"
    />
    <MobileWorkbenchDock />
    <PlotVoteEditor
      :visible="voteEditorVisible"
      :novel-id="novelId"
      :chapter-id="voteChapterId"
      :existing="voteExisting"
      @close="voteEditorVisible = false"
      @saved="handleVoteSaved"
    />
    <MobileComicStrip
      v-if="comicVisible && comicChapterNumber != null"
      v-model:visible="comicVisible"
      :novel-id="novelId"
      :chapter-number="comicChapterNumber"
    />
  </div>
</template>

<style scoped src="../styles/mobile-novel-chapters.css"></style>
