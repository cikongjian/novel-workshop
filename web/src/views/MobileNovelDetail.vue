<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import type { Chapter } from '../types';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CaretBottom, ChatDotRound, Connection, DocumentChecked, EditPen, Headset, MagicStick, MapLocation, Promotion, Reading, Setting, Share, Star, StarFilled, Delete, TrendCharts } from '@element-plus/icons-vue';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileCreateChapterSheet from '../components/mobile-entry/MobileCreateChapterSheet.vue';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import MobileCoverEditorSheet from '../components/mobile-entry/MobileCoverEditorSheet.vue';
import MobileNovelStatusSheet from '../components/mobile-entry/MobileNovelStatusSheet.vue';
import MobilePublishSheet from '../components/mobile-entry/MobilePublishSheet.vue';
import InteractiveSetupSheet from '../components/mobile-entry/InteractiveSetupSheet.vue';
import InteractiveStatusCard from '../components/mobile-entry/InteractiveStatusCard.vue';
import WriterLevelBadge from '../components/mobile-focus/WriterLevelBadge.vue';
import { CHARACTER_ROLE_LABELS, type CharacterProfile } from '../types';
import { fetchMyCharacterCardCollections, toggleCharacterCardCollect } from '../api/character-cards';
import { fetchCharacters, fetchPendingCharacterCandidates } from '../api/characters';
import { fetchChapter, fetchChapterPage } from '../api/chapters';
import { fetchNovel, getCoverUrl, deleteNovel, updateNovel } from '../api/novels';
import { useNovelGenerationStatusPolling } from '../composables/useNovelGenerationStatusPolling';
import { usePullRefresh } from '../composables/usePullRefresh';
import { useVisibilityTrigger } from '../composables/useVisibilityTrigger';
import { useSharePoster } from '../composables/useSharePoster';
import SharePosterList from '../components/mobile-entry/SharePosterList.vue';
import SharePosterPreview from '../components/mobile-entry/SharePosterPreview.vue';
import AuthorLetterOverview from '../components/mobile-entry/AuthorLetterOverview.vue';
import { CHAPTER_STATUS_LABELS, GENRE_LABELS, STATUS_LABELS, AGENT_NAMES, type AgentRole, type ChapterSummary, type NovelMetadata } from '../types';
import { scheduleIdleTask } from '../utils/idle-task';
import { buildMobileChapterExcerpt } from '../utils/mobile-chapter-preview';
import { useAgentsStore } from '../stores/agents';
import { useAuthStore } from '../stores/auth';
import { useThemeMode } from '../composables/useThemeMode';
import MobileCharacterManageSheet from '../components/mobile-entry/MobileCharacterManageSheet.vue';
import MobileCharacterDetailSheet from '../components/mobile-entry/MobileCharacterDetailSheet.vue';
import MobileWorldBibleSheet from '../components/mobile-entry/MobileWorldBibleSheet.vue';
import SideStoryPlaza from '../components/mobile-entry/SideStoryPlaza.vue';
import SideStoryGenerateSheet from '../components/mobile-entry/SideStoryGenerateSheet.vue';
import SideStoryReader from '../components/mobile-entry/SideStoryReader.vue';
import ForkRecordsPanel from '../components/mobile-entry/ForkRecordsPanel.vue';
import ForkSettingsSheet from '../components/mobile-entry/ForkSettingsSheet.vue';
import ForkPublishReviewPanel from '../components/mobile-entry/ForkPublishReviewPanel.vue';
import ForkPublishApprovalSheet from '../components/mobile-entry/ForkPublishApprovalSheet.vue';
import { resolvePreferredActiveRole } from '../utils/agent-progress';
import { formatEstimatedTime } from '../utils/chapter-timing';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const loading = ref(false);
const novel = ref<NovelMetadata | null>(null);
const chapters = ref<ChapterSummary[]>([]);
const recentChapterPreviewMap = ref<Record<number, string>>({});
const createSheetVisible = ref(false);
const createSheetRef = ref<{ startAutoGenerate: () => Promise<boolean> } | null>(null);
const coverEditorVisible = ref(false);
const synopsisEditorVisible = ref(false);
const synopsisSaving = ref(false);
const synopsisForm = ref({
  synopsis: '',
  description: '',
});
const publishSheetVisible = ref(false);
const statusSheetVisible = ref(false);
const interactiveSheetVisible = ref(false);
const characters = ref<CharacterProfile[]>([]);
const collectedCharacterIds = ref<Set<string>>(new Set());
const collectingCharacterId = ref<string | null>(null);
const characterManageVisible = ref(false);
const pendingCharacterCount = ref(0);
const characterDetailVisible = ref(false);
const characterDetailId = ref<string | null>(null);
const worldBibleVisible = ref(false);
const sideStoryPlazaVisible = ref(false);
const sideStoryGenVisible = ref(false);
const sideStoryReaderVisible = ref(false);
const sideStoryReaderId = ref<string | null>(null);
const sideStoryPreselectCharId = ref<string | null>(null);
const forkRecordsVisible = ref(false);
const forkSettingsVisible = ref(false);
const forkPublishReviewVisible = ref(false);
const forkPublishApprovalVisible = ref(false);
const forkPublishApprovalNovelId = ref('');
const completionNotice = ref<{ chapterNumber: number; message: string } | null>(null);
let completionNoticeTimer: ReturnType<typeof setTimeout> | null = null;
const KICKSTART_RECOVERY_INTERVAL_MS = 3000;
const KICKSTART_RECOVERY_MAX_ATTEMPTS = 30;
let kickstartRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
let kickstartRecoveryToken = 0;
let displayedKickstartCompletionKey = '';
const { target: previewSectionTarget, visible: previewSectionVisible } = useVisibilityTrigger({ rootMargin: '320px 0px' });
let cancelIdlePreviewWarmup: (() => void) | null = null;

const novelId = computed(() => String(route.params.id || ''));
const agentsStore = useAgentsStore();

// 移动端使用 HTTP 轮询替代 WebSocket（DMP 平台 ws 不可用）
const { latestStatus } = useNovelGenerationStatusPolling(novelId);
let lastMetadataUpdatedAt: number | null = null;

// 直接从 agentsStore 派生状态（原 useNovelRealtimeStatus 的逻辑内联）
const isConnected = ref(true); // 轮询模式始终可用
const isGeneratingHere = computed(() => agentsStore.isGeneratingNovel(novelId.value));
const generatingChapterNumber = computed(() =>
  isGeneratingHere.value ? agentsStore.getGeneratingChapterNumberForNovel(novelId.value) : null,
);
const activeRole = computed<AgentRole | null>(() => {
  if (!isGeneratingHere.value) return null;
  return resolvePreferredActiveRole(agentsStore.getNovelActiveAgentList(novelId.value) as AgentRole[]);
});
const activeAgentLabel = computed(() =>
  activeRole.value ? (AGENT_NAMES[activeRole.value] ?? activeRole.value) : '写作助手',
);
const progressDescription = computed(() => {
  const role = activeRole.value;
  if (role) {
    const STAGE_DESC: Partial<Record<AgentRole, string>> = {
      outline: '故事骨架正在整理当前章节的关键推进点。',
      'world-builder': '世界设定正在补齐场景、规则与环境约束。',
      character: '角色状态正在校准动机、关系与出场状态。',
      writer: '正文起草中，当前重点是把这一章写出来。',
      editor: '文本润色中，正在统一节奏、文风与表达。',
      reader: '质检中，正在做收尾检查和入库确认。',
      'writing-assistant': '写作助手正在协调当前生成流程。',
    };
    return STAGE_DESC[role] ?? `${activeAgentLabel.value} 正在处理中…`;
  }
  return `正在准备第 ${generatingChapterNumber.value ?? 1} 章内容…`;
});
const lastCompletedChapterHere = computed(() =>
  agentsStore.getLastCompletedChapterForNovel(novelId.value),
);
const latestChapter = computed(() =>
  [...chapters.value].sort((a, b) => b.chapterNumber - a.chapterNumber)[0] ?? null,
);
const recentChapters = computed(() =>
  [...chapters.value].sort((a, b) => b.chapterNumber - a.chapterNumber).slice(0, 2),
);
const recentChapterPreviewKey = computed(() => recentChapters.value.map((item) => item.chapterNumber).join(','));
const nextChapterNumber = computed(() => Math.max(latestChapter.value?.chapterNumber ?? 0, novel.value?.chapterCount ?? 0) + 1);
const generatingChapterLabel = computed(() => generatingChapterNumber.value ?? (latestChapter.value ? nextChapterNumber.value : 1));

function openSideStoryFromCharacterDetail(id: string) {
  characterDetailVisible.value = false;
  sideStoryPreselectCharId.value = id;
  sideStoryGenVisible.value = true;
}
const generatingChapterSubject = computed(() => `第 ${generatingChapterLabel.value} 章`);
const writingLabel = computed(() =>
  isGeneratingHere.value
    ? generatingChapterSubject.value
    : latestChapter.value
    ? `第 ${nextChapterNumber.value} 章`
    : '第 1 章',
);
const readingLabel = computed(() =>
  latestChapter.value ? `第 ${latestChapter.value.chapterNumber} 章` : '暂无章节',
);
const latestChapterHint = computed(() =>
  isGeneratingHere.value
    ? `正在生成第 ${generatingChapterLabel.value} 章`
    : latestChapter.value
    ? `最近更新：第 ${latestChapter.value.chapterNumber} 章`
    : '还没有章节内容',
);
const coverUrl = computed(() => {
  if (!novel.value?.coverImage) return null;
  return getCoverUrl(novel.value.id, novel.value.coverImage || novel.value.updatedAt || novel.value.createdAt);
});
const coverFallback = computed(() => novel.value?.title?.trim().charAt(0) || '书');
const storyOverview = computed(() => {
  const synopsis = novel.value?.synopsis?.trim();
  const description = novel.value?.description?.trim();
  return synopsis || description || '故事概况还没有整理，补上一段给自己和未来读者看的作品方向。';
});

const isOwner = computed(() => {
  if (!novel.value?.ownerId || !authStore.user?.id) return false;
  return novel.value.ownerId === authStore.user.id;
});

const visibleCharacters = computed(() =>
  characters.value.filter((char) => {
    const name = char.name?.trim();
    return Boolean(name && name.length >= 2 && /[\u4e00-\u9fff]/.test(name));
  }),
);

const characterSearchKeyword = ref('');

const filteredCharacters = computed(() => {
  const keyword = characterSearchKeyword.value.trim().toLowerCase();
  if (!keyword) return visibleCharacters.value;
  return visibleCharacters.value.filter((char) => {
    return (
      char.name?.toLowerCase().includes(keyword)
      || char.position?.toLowerCase().includes(keyword)
      || char.role?.toLowerCase().includes(keyword)
    );
  });
});

async function reloadCharactersAfterManage() {
  await loadCharacters();
}

function openCharacterDetail(charId: string) {
  characterDetailId.value = charId;
  characterDetailVisible.value = true;
}

function handleCharacterCollectChanged(payload: { characterId: string; collected: boolean }) {
  const next = new Set(collectedCharacterIds.value);
  if (payload.collected) {
    next.add(payload.characterId);
  } else {
    next.delete(payload.characterId);
  }
  collectedCharacterIds.value = next;
}

async function toggleListedCharacterCollect(char: CharacterProfile, event: Event) {
  event.stopPropagation();
  if (collectingCharacterId.value) return;
  collectingCharacterId.value = char.id;
  try {
    const result = await toggleCharacterCardCollect({
      characterId: char.id,
      novelId: novelId.value,
      characterName: char.name,
    });
    handleCharacterCollectChanged({
      characterId: char.id,
      collected: result.collected,
    });
  } catch { /* 静默 */ }
  finally {
    collectingCharacterId.value = null;
  }
}

function formatNovelStatus(status?: NovelMetadata['status']): string {
  if (!status) return '--';
  return STATUS_LABELS[status] ?? status;
}

function formatGenre(genre?: NovelMetadata['genre']): string {
  if (!genre) return '--';
  return GENRE_LABELS[genre] ?? genre;
}

function formatChapterStatus(status: ChapterSummary['status']): string {
  return CHAPTER_STATUS_LABELS[status] ?? status;
}
function getChapterStatusTone(status: ChapterSummary['status']): string {
  switch (status) {
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

function navigate(path: string) {
  void router.push(path);
}

function openReader(chapterNumber?: number) {
  const query = chapterNumber ? `?chapter=${chapterNumber}` : '';
  void router.push(`/m/novel/${novelId.value}/read${query}`);
}
function openCompletionReader() {
  const chapterNumber = completionNotice.value?.chapterNumber;
  if (!chapterNumber) return;
  completionNotice.value = null;
  openReader(chapterNumber);
}
function openCreateSheet() {
  if (isGeneratingHere.value) return;
  createSheetVisible.value = true;
}
function openNextChapterSheetFromCompletion() {
  completionNotice.value = null;
  openCreateSheet();
}
function openChapterHub(chapterNumber?: number) {
  const query = chapterNumber ? `?chapter=${chapterNumber}` : '';
  void router.push(`/m/novel/${novelId.value}/chapters${query}`);
}
function openForkPublishApproval(targetNovelId = novelId.value) {
  forkPublishApprovalNovelId.value = targetNovelId;
  publishSheetVisible.value = false;
  forkPublishApprovalVisible.value = true;
}
function handleChapterGenerated(payload: { chapterNumber: number; autoOpen: boolean }) {
  createSheetVisible.value = false;
  void loadData();
  if (payload.autoOpen) {
    void router.push(`/m/novel/${novelId.value}/read?chapter=${payload.chapterNumber}`);
  }
}

function showCompletionNotice(chapterNumber: number, message: string) {
  completionNotice.value = { chapterNumber, message };
  if (completionNoticeTimer) clearTimeout(completionNoticeTimer);
  completionNoticeTimer = setTimeout(() => {
    completionNotice.value = null;
    completionNoticeTimer = null;
  }, 7000);
}

function stopKickstartRecoveryPolling() {
  kickstartRecoveryToken += 1;
  if (kickstartRecoveryTimer) {
    clearTimeout(kickstartRecoveryTimer);
    kickstartRecoveryTimer = null;
  }
}

async function clearKickstartRecoveryQuery() {
  if (route.query.kickstart !== '1') return;
  const nextQuery = { ...route.query };
  delete nextQuery.kickstart;
  await router.replace({ path: route.path, query: nextQuery });
}

async function clearComposeQuery() {
  if (route.query.compose !== '1') return;
  const nextQuery = { ...route.query };
  delete nextQuery.compose;
  await router.replace({ path: route.path, query: nextQuery });
}

async function autoGenerateKickstartChapter() {
  if (isGeneratingHere.value) return;
  ElMessage.info('开书首章没有自动落地，已自动补发第一章生成任务。');
  await createSheetRef.value?.startAutoGenerate();
}

function scheduleKickstartRecoveryPolling(attempt = 0) {
  stopKickstartRecoveryPolling();
  const token = kickstartRecoveryToken;
  kickstartRecoveryTimer = setTimeout(() => {
    void (async () => {
      if (token !== kickstartRecoveryToken) return;
      if (route.query.kickstart !== '1') return;

      await loadData();
      const chapterOneExists = chapters.value.some(ch => ch.chapterNumber === 1);
      if (chapterOneExists) {
        showCompletionNotice(1, '开书已完成，第一章已经自动生成，可以直接开读。');
        await clearKickstartRecoveryQuery();
        stopKickstartRecoveryPolling();
        return;
      }

      if (attempt >= 1 && isConnected.value && !isGeneratingHere.value) {
        await clearKickstartRecoveryQuery();
        stopKickstartRecoveryPolling();
        await autoGenerateKickstartChapter();
        return;
      }

      if (attempt + 1 >= KICKSTART_RECOVERY_MAX_ATTEMPTS) {
        await clearKickstartRecoveryQuery();
        stopKickstartRecoveryPolling();
        return;
      }

      scheduleKickstartRecoveryPolling(attempt + 1);
    })();
  }, KICKSTART_RECOVERY_INTERVAL_MS);
}
function getRecentChapterPreview(chapter: ChapterSummary): string {
  return recentChapterPreviewMap.value[chapter.chapterNumber]
    || buildMobileChapterExcerpt(undefined, chapter.summary);
}

async function loadData() {
  if (!novelId.value) return;
  loading.value = true;
  try {
    const [novelData, chapterPage] = await Promise.all([
      fetchNovel(novelId.value),
      fetchChapterPage(novelId.value, { page: 1, pageSize: 2, order: 'desc' }),
    ]);
    novel.value = novelData;
    chapters.value = chapterPage.items;
  } catch {
    novel.value = null;
    chapters.value = [];
  } finally {
    loading.value = false;
    // 延迟加载角色
    loadCharacters();
  }
}

async function loadCharacters() {
  if (!novelId.value) return;
  try {
    const [list, pending, collections] = await Promise.all([
      fetchCharacters(novelId.value),
      fetchPendingCharacterCandidates(novelId.value).catch(() => []),
      loadCollectedCharacterIds(),
    ]);
    characters.value = list;
    collectedCharacterIds.value = collections;
    pendingCharacterCount.value = pending.filter(
      (item) => item.status === 'pending' && !/^退场[：:]\s*.+/.test(item.name),
    ).length;
  } catch { /* 静默 */ }
}

async function loadCollectedCharacterIds(): Promise<Set<string>> {
  if (authStore.authEnabled && !authStore.isAuthenticated) return new Set();
  try {
    const collections = await fetchMyCharacterCardCollections();
    return new Set(
      collections
        .filter((item) => item.novelId === novelId.value)
        .map((item) => item.characterId),
    );
  } catch {
    return new Set();
  }
}

let recentPreviewsPromise: Promise<void> | null = null;
let recentPreviewKeyLoaded = '';

async function ensureRecentChapterPreviewsLoaded(force = false) {
  if (!novelId.value || recentChapters.value.length === 0) {
    recentChapterPreviewMap.value = {};
    recentPreviewKeyLoaded = recentChapterPreviewKey.value;
    return;
  }
  const previewKey = recentChapterPreviewKey.value;
  if (!force && recentPreviewKeyLoaded === previewKey) return;
  if (recentPreviewsPromise) return recentPreviewsPromise;

  const chaptersForPreview = [...recentChapters.value];
  recentPreviewsPromise = (async () => {
    try {
      const previewEntries = await Promise.all(
        chaptersForPreview.map(async (chapter) => {
          try {
            const detail: Chapter = await fetchChapter(novelId.value, chapter.chapterNumber);
            return [
              chapter.chapterNumber,
              buildMobileChapterExcerpt(detail.content, chapter.summary),
            ] as const;
          } catch {
            return [
              chapter.chapterNumber,
              buildMobileChapterExcerpt(undefined, chapter.summary),
            ] as const;
          }
        }),
      );

      if (recentChapterPreviewKey.value === previewKey) {
        recentChapterPreviewMap.value = Object.fromEntries(previewEntries);
        recentPreviewKeyLoaded = previewKey;
      }
    } finally {
      recentPreviewsPromise = null;
      if (recentChapterPreviewKey.value !== previewKey && previewSectionVisible.value) {
        void ensureRecentChapterPreviewsLoaded();
      }
    }
  })();

  return recentPreviewsPromise;
}

const { pullDistance, refreshing, triggered, pullContainerRef } = usePullRefresh({
  onRefresh: () => loadData(),
});

watch(novelId, () => {
  lastMetadataUpdatedAt = null;
  void loadData();
}, { immediate: true });

watch(
  () => latestStatus.value?.metadataUpdatedAt ?? null,
  (metadataUpdatedAt) => {
    if (!metadataUpdatedAt) return;
    if (lastMetadataUpdatedAt === metadataUpdatedAt) return;
    lastMetadataUpdatedAt = metadataUpdatedAt;
    void loadData();
  },
);

watch(
  () => [novelId.value, recentChapterPreviewKey.value] as const,
  () => {
    recentChapterPreviewMap.value = {};
    recentPreviewKeyLoaded = '';
    if (previewSectionVisible.value) {
      void ensureRecentChapterPreviewsLoaded();
    }
  },
  { immediate: true },
);

watch(previewSectionVisible, (visible) => {
  if (!visible) return;
  void ensureRecentChapterPreviewsLoaded();
});

onMounted(() => {
  cancelIdlePreviewWarmup = scheduleIdleTask(() => {
    void ensureRecentChapterPreviewsLoaded();
  }, 1800);
});

watch(
  () => lastCompletedChapterHere.value,
  (chapterNumber) => {
    if (chapterNumber !== null) {
      void loadData();
      showCompletionNotice(chapterNumber, `第 ${chapterNumber} 章已生成完成，可以直接阅读或继续写下一章。`);
    }
  },
);

watch(
  () => [route.query.kickstart, novelId.value, chapters.value.length, isGeneratingHere.value] as const,
  ([kickstart]) => {
    if (kickstart !== '1') {
      stopKickstartRecoveryPolling();
      return;
    }
    if (chapters.value.some(ch => ch.chapterNumber === 1)) {
      stopKickstartRecoveryPolling();
      const completionKey = `${novelId.value}:1`;
      if (displayedKickstartCompletionKey !== completionKey) {
        displayedKickstartCompletionKey = completionKey;
        showCompletionNotice(1, '开书已完成，第一章已经准备好，可以直接开读或继续生成下一章。');
      }
      void clearKickstartRecoveryQuery();
      return;
    }
    if (isGeneratingHere.value) return;
    scheduleKickstartRecoveryPolling();
  },
  { immediate: true },
);

watch(
  () => [route.query.compose, novelId.value, chapters.value.length, isGeneratingHere.value] as const,
  ([compose]) => {
    if (compose !== '1') return;
    if (chapters.value.some(ch => ch.chapterNumber === 1) || isGeneratingHere.value) {
      void clearComposeQuery();
      return;
    }
    openCreateSheet();
    void clearComposeQuery();
  },
  { immediate: true },
);

watch(novelId, () => {
  stopKickstartRecoveryPolling();
  if (completionNoticeTimer) {
    clearTimeout(completionNoticeTimer);
    completionNoticeTimer = null;
  }
  completionNotice.value = null;
});

onUnmounted(() => {
  cancelIdlePreviewWarmup?.();
  stopKickstartRecoveryPolling();
  if (completionNoticeTimer) {
    clearTimeout(completionNoticeTimer);
    completionNoticeTimer = null;
  }
});

// 分享海报（HTML 页面方案）
const showPosterList = ref(false);
const showPosterPreview = ref(false);
const showLetterOverview = ref(false);
const poster = useSharePoster();

/** 点击入口：打开海报列表（不自动生成） */
function openPosterList() {
  showPosterList.value = true;
}

/** 关闭海报列表 */
function closePosterList() {
  showPosterList.value = false;
}

/** 生成新海报：关闭列表，打开预览，调用 AI */
async function generateNewPoster() {
  showPosterList.value = false;
  showPosterPreview.value = true;
  await poster.generate(novelId.value);
}

/** 重新生成（预览页内） */
async function regeneratePoster() {
  await poster.generate(novelId.value);
}

/** 从列表选择某条历史海报 → 打开预览 */
function selectPosterFromList(item: { posterId: string; pageUrl: string; headline: string; tagline: string; novelTitle: string }) {
  showPosterList.value = false;
  poster.result.value = {
    posterId: item.posterId,
    pageUrl: item.pageUrl,
    headline: item.headline,
    tagline: item.tagline,
    hooks: [],
    novelTitle: item.novelTitle,
    authorName: '',
    chapterCount: 0,
    wordCount: 0,
    category: '',
  };
  showPosterPreview.value = true;
}

/** 预览页内切换历史海报 */
function selectHistoryPoster(item: { posterId: string; pageUrl: string; headline: string; tagline: string; novelTitle: string }) {
  poster.result.value = {
    posterId: item.posterId,
    pageUrl: item.pageUrl,
    headline: item.headline,
    tagline: item.tagline,
    hooks: [],
    novelTitle: item.novelTitle,
    authorName: '',
    chapterCount: 0,
    wordCount: 0,
    category: '',
  };
}

function closePosterPreview() {
  showPosterPreview.value = false;
  poster.reset();
}

// ── 删除作品 ──
const deleting = ref(false);
async function handleDeleteNovel() {
  if (!novel.value) return;
  try {
    await ElMessageBox.confirm(
      `确定删除《${novel.value.title}》吗？所有章节、角色、世界观数据将一并删除，此操作不可撤销。`,
      '删除作品',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    );
  } catch { return; }
  deleting.value = true;
  try {
    await deleteNovel(novelId.value);
    ElMessage.success('作品已删除');
    router.replace('/m/novels');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '删除失败');
  } finally {
    deleting.value = false;
  }
}

async function handleRenameNovel() {
  if (!novel.value) return;
  let newTitle = '';
  try {
    const { value } = await ElMessageBox.prompt('请输入新的小说标题', '修改标题', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputValue: novel.value.title,
      inputValidator: (v: string) => (v.trim() ? true : '标题不能为空'),
    });
    newTitle = value.trim();
  } catch { return; }
  if (newTitle === novel.value.title) return;
  try {
    await updateNovel(novelId.value, { title: newTitle });
    ElMessage.success('标题已更新');
    await loadData();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '修改标题失败');
  }
}

function openSynopsisEditor() {
  if (!novel.value) return;
  const rawSynopsis = novel.value.synopsis || '';
  const rawDescription = novel.value.description || '';
  const isSynopsisTooLong = rawSynopsis.length > 120;
  synopsisForm.value = {
    synopsis: isSynopsisTooLong ? '' : rawSynopsis,
    description: rawDescription || rawSynopsis,
  };
  synopsisEditorVisible.value = true;
}

async function submitSynopsisEdit() {
  if (!novel.value) return;
  const synopsis = synopsisForm.value.synopsis.trim();
  const description = synopsisForm.value.description.trim();
  if (!synopsis && !description) {
    ElMessage.warning('故事概况不能为空');
    return;
  }
  synopsisSaving.value = true;
  try {
    await updateNovel(novelId.value, {
      synopsis: synopsis,
      description: description,
    });
    ElMessage.success('故事概况已更新');
    synopsisEditorVisible.value = false;
    await loadData();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '保存故事概况失败');
  } finally {
    synopsisSaving.value = false;
  }
}

async function handleStatusChange(status: NovelMetadata['status']) {
  statusSheetVisible.value = false;
  if (!novel.value || status === novel.value.status) return;
  try {
    await updateNovel(novelId.value, { status });
    ElMessage.success(`状态已更新为「${STATUS_LABELS[status]}」`);
    await loadData();
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '状态更新失败');
  }
}

function loadPosterHistory() {
  void poster.loadHistory(novelId.value);
}

function loadPosterStats() {
  if (poster.result.value?.posterId) {
    void poster.loadStats(poster.result.value.posterId);
  }
}

function refreshPosterStats() {
  if (poster.result.value?.posterId) {
    void poster.loadStats(poster.result.value.posterId);
  }
}

async function disablePoster(posterId: string) {
  await poster.disable(posterId);
}

async function enablePoster(posterId: string) {
  await poster.enable(posterId);
}

async function deletePoster(posterId: string) {
  if (!confirm('确定永久删除这条海报？删除后已分享的链接将失效。')) return;
  await poster.remove(posterId);
}
</script>

<template>
  <div ref="pullContainerRef" class="mobile-novel-detail-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
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
      <MobileTopbar title="作品详情" subtitle="作品总览" :brand-size="28">
        <template #leading>
          <button class="mobile-focus-button--secondary" type="button" @click="navigate('/m/novels')">
            返回作品库
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-novel-detail-main mobile-focus-main">
        <MobileSectionCard v-if="novel" kicker="Story" hero class="mobile-novel-detail-hero">
          <div class="mobile-novel-detail-story">
            <div class="mobile-novel-detail-story__copy">
              <div class="mobile-novel-detail-title-row">
                <h1>{{ novel.title }}</h1>
                <button
                  v-if="isOwner"
                  class="mobile-novel-detail-rename-btn"
                  type="button"
                  title="修改标题"
                  @click="handleRenameNovel"
                >
                  <el-icon :size="18"><EditPen /></el-icon>
                </button>
              </div>

              <div class="mobile-focus-meta">
                <span class="mobile-focus-tag mobile-focus-tag--sky">{{ formatGenre(novel.genre) }}</span>
                <button
                  v-if="isOwner"
                  class="mobile-focus-tag mobile-focus-tag--sky mobile-novel-detail-status-btn"
                  type="button"
                  @click="statusSheetVisible = true"
                >
                  {{ formatNovelStatus(novel.status) }}
                  <el-icon :size="11"><CaretBottom /></el-icon>
                </button>
                <span v-else class="mobile-focus-tag mobile-focus-tag--sky">{{ formatNovelStatus(novel.status) }}</span>
                <span class="mobile-focus-tag mobile-focus-tag--sky">{{ novel.chapterCount || 0 }} 章</span>
              </div>
              <div v-if="novel.ownerName" class="mobile-novel-detail-author">
                <span class="mobile-novel-detail-author__name">{{ novel.ownerName }}</span>
                <WriterLevelBadge v-if="novel.ownerId" :user-id="novel.ownerId" />
              </div>
            </div>

            <button
              class="mobile-novel-detail-cover"
              type="button"
              @click="coverEditorVisible = true"
            >
              <img v-if="coverUrl" :src="coverUrl" :alt="novel.title" />
              <div v-else class="mobile-novel-detail-cover__fallback">
                <span>{{ coverFallback }}</span>
                <small>{{ formatGenre(novel.genre) }}</small>
              </div>
            </button>
          </div>

          <div class="mobile-novel-detail-summary">
            <strong>{{ latestChapterHint }}</strong>
            <span>{{ (novel.wordCount || 0).toLocaleString() }} 字</span>
          </div>

          <div class="mobile-focus-subcard mobile-novel-detail-overview">
            <div class="mobile-focus-item__top">
              <strong>故事概况</strong>
              <button
                v-if="isOwner"
                class="mobile-novel-detail-inline-edit-btn"
                type="button"
                title="编辑故事概况"
                aria-label="编辑故事概况"
                @click="openSynopsisEditor"
              >
                <el-icon :size="15"><EditPen /></el-icon>
              </button>
            </div>
            <p>{{ storyOverview }}</p>
          </div>

          <div v-if="completionNotice" class="mobile-focus-subcard mobile-novel-detail-completion">
            <div class="mobile-focus-item__top">
              <strong>第 {{ completionNotice.chapterNumber }} 章已生成</strong>
              <span class="mobile-focus-tag mobile-focus-tag--teal">已完成</span>
            </div>
            <p class="mobile-novel-detail-completion__summary">{{ completionNotice.message }}</p>
            <div class="mobile-novel-detail-completion__actions">
              <button class="mobile-focus-button--secondary" type="button" @click="openCompletionReader">
                去读第 {{ completionNotice.chapterNumber }} 章
              </button>
              <button class="mobile-focus-button--ghost" type="button" @click="openNextChapterSheetFromCompletion">
                继续写第 {{ completionNotice.chapterNumber + 1 }} 章
              </button>
            </div>
          </div>

          <div v-if="isGeneratingHere" class="mobile-focus-subcard mobile-novel-detail-progress">
            <div class="mobile-focus-item__top">
              <strong>{{ generatingChapterSubject }}生成中</strong>
              <span class="mobile-focus-tag mobile-focus-tag--sky">{{ activeAgentLabel }}</span>
            </div>
            <p class="mobile-novel-detail-progress__summary">{{ progressDescription }}</p>
            <div class="mobile-focus-item__meta">
              <span>{{ formatEstimatedTime() }}</span>
              <span>生成进度自动同步中</span>
              <span>完成后会自动刷新章节</span>
            </div>
          </div>

          <div class="mobile-novel-detail-actions" aria-label="作品快捷入口">
            <button
              class="mobile-novel-detail-tool"
              type="button"
              :disabled="!latestChapter"
              @click="openReader(latestChapter?.chapterNumber)"
            >
              <span class="mobile-novel-detail-tool__icon mobile-novel-detail-tool__icon--read">
                <el-icon :size="22"><Reading /></el-icon>
              </span>
              <strong>阅读</strong>
              <span>{{ readingLabel }}</span>
            </button>

            <button
              class="mobile-novel-detail-tool"
              type="button"
              @click="openCreateSheet"
            >
              <span class="mobile-novel-detail-tool__icon mobile-novel-detail-tool__icon--write">
                <el-icon :size="22"><EditPen /></el-icon>
              </span>
              <strong>{{ isGeneratingHere ? '生成中' : '写作' }}</strong>
              <span>{{ writingLabel }}</span>
            </button>

            <button
              class="mobile-novel-detail-tool"
              type="button"
              @click="openPosterList"
            >
              <span class="mobile-novel-detail-tool__icon mobile-novel-detail-tool__icon--share">
                <el-icon :size="22"><Share /></el-icon>
              </span>
              <strong>分享</strong>
              <span>海报</span>
            </button>

            <button
              v-if="isOwner && characters.length"
              class="mobile-novel-detail-tool"
              type="button"
              @click="showLetterOverview = true"
            >
              <span class="mobile-novel-detail-tool__icon mobile-novel-detail-tool__icon--mail">
                <el-icon :size="22"><ChatDotRound /></el-icon>
              </span>
              <strong>信箱</strong>
              <span>读者来信</span>
            </button>

            <button
              v-if="characters.length"
              class="mobile-novel-detail-tool"
              type="button"
              @click="sideStoryPlazaVisible = true"
            >
              <span class="mobile-novel-detail-tool__icon mobile-novel-detail-tool__icon--story">
                <el-icon :size="22"><Promotion /></el-icon>
              </span>
              <strong>番外</strong>
              <span>角色故事</span>
            </button>

            <button
              v-if="isOwner"
              class="mobile-novel-detail-tool"
              type="button"
              @click="worldBibleVisible = true"
            >
              <span class="mobile-novel-detail-tool__icon mobile-novel-detail-tool__icon--world">
                <el-icon :size="22"><MapLocation /></el-icon>
              </span>
              <strong>世界</strong>
              <span>长期设定</span>
            </button>

            <button
              class="mobile-novel-detail-tool"
              type="button"
              @click="interactiveSheetVisible = true"
            >
              <span class="mobile-novel-detail-tool__icon mobile-novel-detail-tool__icon--interactive">
                <el-icon :size="22"><TrendCharts /></el-icon>
              </span>
              <strong>互动</strong>
              <span>连载设置</span>
            </button>

            <button
              class="mobile-novel-detail-tool"
              type="button"
              @click="forkRecordsVisible = true"
            >
              <span class="mobile-novel-detail-tool__icon mobile-novel-detail-tool__icon--fork">
                <el-icon :size="22"><Connection /></el-icon>
              </span>
              <strong>抱走</strong>
              <span>分支记录</span>
            </button>

            <button
              v-if="isOwner"
              class="mobile-novel-detail-tool"
              type="button"
              @click="forkSettingsVisible = true"
            >
              <span class="mobile-novel-detail-tool__icon mobile-novel-detail-tool__icon--setting">
                <el-icon :size="22"><Setting /></el-icon>
              </span>
              <strong>权限</strong>
              <span>抱走设置</span>
            </button>

            <button
              v-if="isOwner"
              class="mobile-novel-detail-tool"
              type="button"
              @click="forkPublishReviewVisible = true"
            >
              <span class="mobile-novel-detail-tool__icon mobile-novel-detail-tool__icon--review">
                <el-icon :size="22"><DocumentChecked /></el-icon>
              </span>
              <strong>审批</strong>
              <span>发布申请</span>
            </button>

            <button
              v-if="isOwner"
              class="mobile-novel-detail-tool mobile-novel-detail-tool--danger"
              type="button"
              :disabled="deleting"
              @click="handleDeleteNovel"
            >
              <span class="mobile-novel-detail-tool__icon mobile-novel-detail-tool__icon--danger">
                <el-icon :size="22"><Delete /></el-icon>
              </span>
              <strong>{{ deleting ? '删除中' : '删除' }}</strong>
              <span>作品</span>
            </button>
          </div>
        </MobileSectionCard>

        <div v-if="novel" ref="previewSectionTarget">
          <MobileSectionCard kicker="More" title="更多入口" class="mobile-novel-detail-panel">
            <div class="mobile-novel-detail-toolbar">
              <button class="mobile-focus-button--secondary" type="button" @click="openChapterHub(latestChapter?.chapterNumber)">
                章节区
              </button>
              <button
                v-if="novel?.publishedBookId || isOwner"
                class="mobile-focus-button--ghost"
                type="button"
                @click="navigate(`/m/novel/${novelId}/audio-drama`)"
              >
                <el-icon :size="13" style="margin-right:3px;vertical-align:-2px"><Headset /></el-icon>
                听广播剧
              </button>
              <button class="mobile-focus-button--ghost" type="button" @click="navigate(`/m/novel/${novelId}/outline`)">
                看大纲
              </button>
              <button class="mobile-focus-button--primary" type="button" @click="publishSheetVisible = true">
                发布到书城
              </button>
            </div>

            <InteractiveStatusCard :novel-id="novelId" />

            <div v-if="recentChapters.length" class="mobile-focus-list">
              <button
                v-for="chapter in recentChapters"
                :key="chapter.chapterNumber"
                class="mobile-novel-detail-chapter mobile-focus-item mobile-focus-item--clickable"
                type="button"
                @click="openReader(chapter.chapterNumber)"
              >
                <div class="mobile-focus-item__top">
                  <strong>第 {{ chapter.chapterNumber }} 章 · {{ chapter.title }}</strong>
                  <span class="mobile-focus-tag" :class="getChapterStatusTone(chapter.status)">
                    {{ formatChapterStatus(chapter.status) }}
                  </span>
                </div>
                <div class="mobile-focus-item__meta">
                  <span>{{ (chapter.wordCount || 0).toLocaleString() }} 字</span>
                  <span v-if="chapter.readerScore">评分 {{ chapter.readerScore }}</span>
                </div>
                <p class="mobile-novel-detail-chapter__excerpt">{{ getRecentChapterPreview(chapter) }}</p>
              </button>
            </div>

            <div v-else class="mobile-focus-empty">
              <strong>{{ isGeneratingHere ? `${generatingChapterSubject}正在生成` : '还没有可读章节' }}</strong>
              <p>
                {{ isGeneratingHere
                  ? `${generatingChapterSubject}已经在生成了，完成后这里会自动变成最近阅读入口。`
                  : '先点上面的“开始写作”，内容出来后这里就会变成最近阅读入口。' }}
              </p>
            </div>
          </MobileSectionCard>
        </div>

        <MobileSectionCard v-else-if="loading" kicker="Loading" title="正在载入作品" class="mobile-novel-detail-panel">
          <div class="mobile-novel-detail-loading mobile-focus-loading">
            <el-skeleton animated :rows="6" />
          </div>
        </MobileSectionCard>

        <MobileSectionCard v-else kicker="Unavailable" title="作品不可用" class="mobile-novel-detail-panel">
          <div class="mobile-focus-empty">
            <strong>作品加载失败</strong>
            <p>可以回到作品库重新进入，或稍后刷新再试。</p>
            <button class="mobile-focus-button--secondary" type="button" @click="navigate('/m/novels')">
              返回作品库
            </button>
          </div>
        </MobileSectionCard>

        <!-- 角色图鉴 -->
        <MobileSectionCard
          v-if="characters.length || isOwner"
          kicker="Cast"
          title="角色图鉴"
          class="mobile-novel-detail-panel"
        >
          <template #actions>
            <div class="mobile-novel-detail-fun-links">
              <button
                v-if="characters.length"
                class="mobile-novel-detail-fun-link"
                type="button"
                @click="router.push(`/m/fun/quotes?novelId=${novelId}`)"
              >
                <el-icon :size="13"><Star /></el-icon>
                <span>金句</span>
              </button>
              <button
                v-if="characters.length >= 2"
                class="mobile-novel-detail-fun-link"
                type="button"
                @click="router.push(`/m/fun/chemistry?novelId=${novelId}`)"
              >
                <el-icon :size="13"><MagicStick /></el-icon>
                <span>测CP</span>
              </button>
              <button
                v-if="characters.length >= 2"
                class="mobile-novel-detail-fun-link"
                type="button"
                @click="router.push(`/m/fun/relation?novelId=${novelId}`)"
              >
                <el-icon :size="13"><Connection /></el-icon>
                <span>关系图</span>
              </button>
            </div>
          </template>
          <div v-if="visibleCharacters.length" class="mobile-novel-detail-character-groups">
            <div class="mobile-novel-detail-character-search">
              <input
                v-model="characterSearchKeyword"
                type="text"
                placeholder="搜索角色名 / 职位 / 定位"
                class="mobile-novel-detail-character-search__input"
              />
              <span v-if="characterSearchKeyword" class="mobile-novel-detail-character-search__count">
                {{ filteredCharacters.length }} / {{ visibleCharacters.length }}
              </span>
            </div>
            <div
              v-if="filteredCharacters.length"
              class="mobile-novel-detail-character-list"
            >
              <div
                v-for="char in filteredCharacters"
                :key="char.id"
                class="mobile-novel-detail-character-row"
                role="button"
                tabindex="0"
                @click="openCharacterDetail(char.id)"
                @keydown.enter="openCharacterDetail(char.id)"
                @keydown.space.prevent="openCharacterDetail(char.id)"
              >
                <span class="mobile-novel-detail-character-row__avatar">
                  <img
                    v-if="char.portraitImagePath"
                    :src="`/api/novels/${novelId}/characters/${char.id}/portrait?w=80`"
                    alt=""
                  />
                  <span v-else>{{ char.name.slice(0, 2) }}</span>
                </span>
                <span class="mobile-novel-detail-character-row__main">
                  <strong>{{ char.name }}</strong>
                  <span class="mobile-novel-detail-character-row__meta">
                    <span>{{ CHARACTER_ROLE_LABELS[char.role] || char.role }}</span>
                    <span v-if="char.position">{{ char.position }}</span>
                  </span>
                </span>
                <span class="mobile-novel-detail-character-row__badges">
                  <span v-if="char.portraitImagePath">立绘</span>
                  <span v-if="char.mailboxEnabled">信箱</span>
                </span>
                <button
                  :class="[
                    'mobile-novel-detail-character-row__star',
                    { 'is-active': collectedCharacterIds.has(char.id) },
                  ]"
                  type="button"
                  :disabled="collectingCharacterId === char.id"
                  aria-label="标星角色"
                  @click="toggleListedCharacterCollect(char, $event)"
                >
                  <el-icon :size="15"><StarFilled /></el-icon>
                </button>
              </div>
            </div>
            <div v-else class="mobile-novel-detail-characters-empty mobile-novel-detail-characters-empty--inline">
              <p>没有匹配的角色</p>
            </div>
          </div>
          <div v-else class="mobile-novel-detail-characters-empty">
            <p>角色阵容成型后，会在这里沉淀可互动的角色资产。</p>
          </div>
          <div v-if="isOwner" class="mobile-novel-detail-char-manage">
            <button class="mobile-novel-detail-char-manage__btn" @click="characterManageVisible = true">
              管理角色 · 信箱 · 立绘
              <span v-if="pendingCharacterCount > 0" class="mobile-novel-detail-char-manage__badge">{{ pendingCharacterCount }}</span>
            </button>
          </div>
        </MobileSectionCard>

      </main>
    </div>

    <MobileCreateChapterSheet
      ref="createSheetRef"
      :visible="createSheetVisible"
      :novel-id="novelId"
      :novel-title="novel?.title"
      :next-chapter-number="nextChapterNumber"
      :default-startup-platform-profile="novel?.startupPlatformProfile ?? 'auto'"
      @update:visible="(value) => { createSheetVisible = value; }"
      @generated="handleChapterGenerated"
      @open-batch="createSheetVisible = false; router.push(`/m/novel/${novelId}/chapters?batch=1`)"
    />
    <MobileCoverEditorSheet
      :visible="coverEditorVisible"
      :novel-id="novelId"
      :novel-title="novel?.title"
      :current-cover-url="coverUrl"
      @update:visible="(value) => { coverEditorVisible = value; }"
      @updated="loadData"
    />
    <MobileNovelStatusSheet
      :visible="statusSheetVisible"
      :current-status="novel?.status ?? 'planning'"
      @close="statusSheetVisible = false"
      @change="handleStatusChange"
    />
    <MobileWorldBibleSheet
      :visible="worldBibleVisible"
      :novel-id="novelId"
      @close="worldBibleVisible = false"
      @applied="worldBibleVisible = false"
    />

    <el-dialog v-model="synopsisEditorVisible" title="编辑故事概况" width="92%" class="mobile-novel-detail-dialog">
      <div class="mobile-focus-input-stack">
        <label class="mobile-novel-detail-field">
          <span>一句话卖点</span>
          <el-input
            v-model="synopsisForm.synopsis"
            maxlength="120"
            show-word-limit
            placeholder="一句话讲清这本书最抓人的看点"
          />
        </label>
        <label class="mobile-novel-detail-field">
          <span>故事概况</span>
          <el-input
            v-model="synopsisForm.description"
            type="textarea"
            :rows="6"
            maxlength="1200"
            show-word-limit
            placeholder="写给读者看的故事介绍，适合放在书城详情页"
          />
        </label>
      </div>
      <template #footer>
        <button class="mobile-focus-button--ghost" type="button" @click="synopsisEditorVisible = false">取消</button>
        <button class="mobile-focus-button--primary" type="button" :disabled="synopsisSaving" @click="submitSynopsisEdit">
          {{ synopsisSaving ? '保存中...' : '保存概况' }}
        </button>
      </template>
    </el-dialog>

    <MobilePublishSheet
      :visible="publishSheetVisible"
      :novel-id="novelId"
      :novel-title="novel?.title"
      :novel-synopsis="novel?.synopsis || novel?.description"
      :has-cover="Boolean(novel?.coverImage)"
      @update:visible="(value) => { publishSheetVisible = value; }"
      @published="loadData"
      @fork-approval-needed="openForkPublishApproval"
    />
    <InteractiveSetupSheet
      :visible="interactiveSheetVisible"
      :novel-id="novelId"
      @close="interactiveSheetVisible = false"
      @changed="loadData"
    />
    <MobileWorkbenchDock />
    <SharePosterList
      :visible="showPosterList"
      :history="poster.history.value"
      :loading="poster.historyLoading.value"
      :generating="poster.generating.value"
      :novel-title="novel?.title ?? '作品'"
      @close="closePosterList"
      @generate="generateNewPoster"
      @select="selectPosterFromList"
      @load-history="loadPosterHistory"
      @disable="disablePoster"
      @enable="enablePoster"
      @delete="deletePoster"
    />
    <SharePosterPreview
      :visible="showPosterPreview"
      :poster="poster.result.value"
      :generating="poster.generating.value"
      :error="poster.error.value"
      :history="poster.history.value"
      :history-loading="poster.historyLoading.value"
      :stats="poster.stats.value"
      :stats-loading="poster.statsLoading.value"
      @close="closePosterPreview"
      @regenerate="regeneratePoster"
      @load-stats="loadPosterStats"
      @refresh-stats="refreshPosterStats"
      @select-history="selectHistoryPoster"
      @disable="disablePoster"
      @enable="enablePoster"
      @delete="deletePoster"
    />
    <AuthorLetterOverview
      :visible="showLetterOverview"
      :novel-id="novelId"
      @close="showLetterOverview = false"
    />
    <MobileCharacterManageSheet
      :visible="characterManageVisible"
      :novel-id="novelId"
      @close="characterManageVisible = false"
      @updated="reloadCharactersAfterManage"
    />
    <MobileCharacterDetailSheet
      :visible="characterDetailVisible"
      :novel-id="novelId"
      :character-id="characterDetailId"
      :can-edit="isOwner || authStore.isAdmin"
      @close="characterDetailVisible = false"
      @open-side-story="openSideStoryFromCharacterDetail"
      @character-updated="reloadCharactersAfterManage"
    />
    <SideStoryPlaza
      :visible="sideStoryPlazaVisible"
      :novel-id="novelId"
      :novel-owner-id="novel?.ownerId"
      @close="sideStoryPlazaVisible = false"
      @open-reader="(id: string) => { sideStoryReaderId = id; sideStoryReaderVisible = true; }"
      @open-generate="() => { sideStoryPlazaVisible = false; sideStoryPreselectCharId = null; sideStoryGenVisible = true; }"
    />
    <SideStoryGenerateSheet
      :visible="sideStoryGenVisible"
      :novel-id="novelId"
      :preselect-character-id="sideStoryPreselectCharId"
      @close="sideStoryGenVisible = false; sideStoryPreselectCharId = null"
      @generated="() => { sideStoryGenVisible = false; sideStoryPreselectCharId = null; sideStoryPlazaVisible = true; }"
    />
    <SideStoryReader
      :visible="sideStoryReaderVisible"
      :story-id="sideStoryReaderId"
      :is-owner="isOwner"
      @close="sideStoryReaderVisible = false"
      @deleted="() => { sideStoryReaderVisible = false; sideStoryPlazaVisible = true; }"
    />
    <ForkRecordsPanel
      :visible="forkRecordsVisible"
      :novel-id="novelId"
      :is-owner="isOwner"
      @close="forkRecordsVisible = false"
    />
    <ForkSettingsSheet
      :visible="forkSettingsVisible"
      :novel-id="novelId"
      @close="forkSettingsVisible = false"
    />
    <ForkPublishReviewPanel
      :visible="forkPublishReviewVisible"
      @close="forkPublishReviewVisible = false"
    />
    <ForkPublishApprovalSheet
      :visible="forkPublishApprovalVisible"
      :novel-id="forkPublishApprovalNovelId"
      @close="forkPublishApprovalVisible = false"
      @approved="() => { forkPublishApprovalVisible = false; publishSheetVisible = true; }"
    />
  </div>
</template>

<style scoped src="../styles/mobile-novel-detail.css"></style>
