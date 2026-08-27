<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { SwitchButton, User, EditPen, Lock, View, CollectionTag, ChatDotRound, Cpu, Clock, Document, Notebook, Link, Star, PictureFilled, Coin, Tickets, Histogram, Connection, ChatLineSquare, MagicStick, Promotion, SetUp, DataAnalysis, Trophy, Share } from '@element-plus/icons-vue';
import { useRoute, useRouter } from 'vue-router';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import { resolveCoverSrc } from '../utils/deploy-path';
import MobileStatGroup from '../components/mobile-focus/MobileStatGroup.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import { fetchMyWriterScore, type WriterScoreResult } from '../api/writer-scores';

import CreatorApplicationDialog from '../components/auth/CreatorApplicationDialog.vue';
import CreatorInviteRedeemPanel from '../components/auth/CreatorInviteRedeemPanel.vue';
import RealNameStatusBanner from '../components/auth/RealNameStatusBanner.vue';
import RealNameVerificationPanel from '../components/auth/RealNameVerificationPanel.vue';
import { authApi, type UserProfile } from '../api/auth';
import { getMyBookCommentPage, getMyPublishedBookPage } from '../api/bookstore';
import { fetchNovelSummaries } from '../api/novels';
import { userApiApi } from '../api/user-api';
import { usePasswordPolicy } from '../composables/usePasswordPolicy';
import { usePullRefresh } from '../composables/usePullRefresh';
import { useVisibilityTrigger } from '../composables/useVisibilityTrigger';
import { useOfflineChapterCache } from '../composables/useOfflineStorage';
import { useRealNameAccess } from '../composables/useRealNameAccess';
import { clearTTSCache, clearNovelCache, getTTSCacheByNovel, type NovelCacheInfo } from '../utils/tts-audio-cache';
import type { BookStore, BookStoreUserComment } from '../api/types';
import { useAuthStore } from '../stores/auth';
import { useBillingStore } from '../stores/billing';
import { useThemeMode } from '../composables/useThemeMode';
import { useAchievements } from '../composables/useAchievements';
import type { NovelMetadata } from '../types';
import { CREATOR_STATUS_LABELS, getUserRoleLabel } from '../utils/auth-display';
import { getCreatorPortalHint } from '../utils/creator-portal';
import { scheduleIdleTask } from '../utils/idle-task';
import { validatePasswordAgainstPolicy } from '../utils/password-policy';
import { http } from '../api/http';

const authStore = useAuthStore();
const billingStore = useBillingStore();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const achievements = useAchievements();
const router = useRouter();
const route = useRoute();
const {
  ensureRealNameAction,
  handleRealNameBlockedError,
  realNameEnabled,
  loading: realNamePolicyLoading,
  loadRealNamePolicy,
} = useRealNameAccess();
const { passwordPolicy, passwordPolicyHint, loadPasswordPolicy } = usePasswordPolicy();

// 离线缓存管理
const offlineCache = useOfflineChapterCache();
const cachedNovels = ref<{ novelId: string; novelTitle: string; chapterCount: number; lastCachedAt: number }[]>([]);
const cacheLoading = ref(false);
const cacheClearing = ref(false);

async function loadCacheInfo() {
  cacheLoading.value = true;
  try { cachedNovels.value = await offlineCache.getCachedNovels(); }
  catch { /* 静默 */ }
  finally { cacheLoading.value = false; }
}

async function handleClearCache() {
  cacheClearing.value = true;
  try { await offlineCache.clearAll(); cachedNovels.value = []; }
  finally { cacheClearing.value = false; }
}

async function handleRemoveNovelCache(novelId: string) {
  try { await offlineCache.removeNovel(novelId); cachedNovels.value = cachedNovels.value.filter((n) => n.novelId !== novelId); }
  catch { /* 静默 */ }
}

// TTS 听书音频缓存（按小说分组）
const ttsNovelCaches = ref<NovelCacheInfo[]>([]);
const ttsCacheLoading = ref(false);
const ttsCacheClearing = ref(false);
const ttsNovelClearingId = ref('');

async function loadTtsCacheStats() {
  ttsCacheLoading.value = true;
  try { ttsNovelCaches.value = await getTTSCacheByNovel(); }
  catch { /* 静默 */ }
  finally { ttsCacheLoading.value = false; }
}

async function handleClearTtsCache() {
  ttsCacheClearing.value = true;
  try { await clearTTSCache(); ttsNovelCaches.value = []; ElMessage.success('听书缓存已清除'); }
  catch { ElMessage.error('清除失败，请稍后重试'); }
  finally { ttsCacheClearing.value = false; }
}

async function handleClearNovelTtsCache(novelId: string) {
  ttsNovelClearingId.value = novelId;
  try {
    await clearNovelCache(novelId);
    ttsNovelCaches.value = ttsNovelCaches.value.filter((n) => n.novelId !== novelId);
    ElMessage.success('已清除该作品的听书缓存');
  } catch { ElMessage.error('清除失败，请稍后重试'); }
  finally { ttsNovelClearingId.value = ''; }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const loading = ref(false);
const creatorSubmitting = ref(false);
const creatorDialogVisible = ref(false);
const passwordSaving = ref(false);
const showPasswordForm = ref(false);
const realNameDialogVisible = ref(false);
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' });
const novels = ref<NovelMetadata[]>([]);
const publishedBooks = ref<BookStore[]>([]);
const bookComments = ref<BookStoreUserComment[]>([]);
const realNameEntryRef = ref<HTMLElement | null>(null);
const bookstoreLoaded = ref(false);
const friendlyLinks = ref<{ name: string; url: string }[]>([]);
const userTextModelConfigured = ref(false);
const userImageModelConfigured = ref(false);
const { target: bookstoreSectionTarget, visible: bookstoreSectionVisible } = useVisibilityTrigger();
let cancelIdleBookstoreWarmup: (() => void) | null = null;

const activeSheet = ref('');
function openSheet(key: string) { activeSheet.value = key; }
function closeSheet() { activeSheet.value = ''; }

const currentUserName = computed(() => authStore.user?.penName || authStore.user?.username || '创作者');
const currentRole = computed(() => getUserRoleLabel(authStore.user));
const isCreatorUser = computed(() => authStore.isCreator);
const writerScore = ref<WriterScoreResult | null>(null);

// 笔名内联编辑
const penNameEditing = ref(false);
const penNameInput = ref('');
const penNameSaving = ref(false);

function startPenNameEdit() {
  penNameInput.value = authStore.user?.penName || '';
  penNameEditing.value = true;
}

function cancelPenNameEdit() {
  penNameEditing.value = false;
}

async function savePenName() {
  const trimmed = penNameInput.value.trim();
  if (trimmed.length > 50) {
    ElMessage.warning('笔名不能超过 50 个字');
    return;
  }
  penNameSaving.value = true;
  try {
    await authApi.updateProfile({ penName: trimmed || null });
    await authStore.refreshProfile();
    ElMessage.success(trimmed ? '笔名已更新' : '笔名已清除');
    penNameEditing.value = false;
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '保存失败');
  } finally {
    penNameSaving.value = false;
  }
}

// 加载作家分
async function loadWriterScore() {
  if (!authStore.user?.id) return;
  try { writerScore.value = await fetchMyWriterScore(); }
  catch { writerScore.value = null; }
}

const LEVEL_MINS: number[] = [0, 100, 500, 1500, 4500, 12000, 30000, 75000, 150000];
const LEVEL_NAMES: string[] = ['初涉文墨', '妙笔生花', '下笔有神', '文思泉涌', '著作等身', '独步文坛', '一代文豪', '文曲星君', '开宗立派'];

const levelProgress = computed(() => {
  if (!writerScore.value || writerScore.value.level >= 8) return 100;
  const cur = LEVEL_MINS[writerScore.value.level];
  const nxt = LEVEL_MINS[writerScore.value.level + 1];
  return Math.min(100, Math.round(((writerScore.value.score - cur) / (nxt - cur)) * 100));
});
const nextLevelName = computed(() => {
  if (!writerScore.value || writerScore.value.level >= 8) return '';
  return LEVEL_NAMES[writerScore.value.level + 1] ?? '';
});
const nextLevelRemaining = computed(() => {
  if (!writerScore.value || writerScore.value.level >= 8) return 0;
  const nxt = LEVEL_MINS[writerScore.value.level + 1];
  return Math.max(0, nxt - writerScore.value.score);
});
const creatorHint = computed(() => getCreatorPortalHint(authStore.user));
const canApplyCreator = computed(() => {
  const user = authStore.user;
  if (!user || user.role === 'admin') return false;
  return user.creatorStatus === 'none' || user.creatorStatus === 'rejected';
});
const userIdShort = computed(() => {
  const id = authStore.user?.id;
  if (!id) return '--';
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
});
const totalNovels = computed(() => novels.value.length);
const writingNovels = computed(() => novels.value.filter((item) => item.status === 'writing').length);
const completedNovels = computed(() => novels.value.filter((item) => item.status === 'completed' || item.status === 'published').length);
const totalPublishedViews = computed(() => publishedBooks.value.reduce((sum, item) => sum + (item.viewCount ?? 0), 0));
const totalPublishedFavorites = computed(() => publishedBooks.value.reduce((sum, item) => sum + (item.favoriteCount ?? 0), 0));
const totalPublishedComments = computed(() => publishedBooks.value.reduce((sum, item) => sum + (item.commentCount ?? 0), 0));
const topPublishedBooks = computed(() => (
  [...publishedBooks.value]
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0) || (b.commentCount ?? 0) - (a.commentCount ?? 0) || (b.favoriteCount ?? 0) - (a.favoriteCount ?? 0))
    .slice(0, 3)
));
const recentBookComments = computed(() => (
  [...bookComments.value].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 3)
));
const heroStats = computed(() => [
  { label: '作品总数', value: totalNovels.value },
  { label: '连载中', value: writingNovels.value },
  { label: '已完结', value: completedNovels.value },
]);
const realNameEntryLabel = computed(() => authStore.user?.realNameVerified ? '查看实名信息' : '填写实名认证');

// 积分与字数余额
const billingLoaded = computed(() => billingStore.account !== null);
const displayBalance = computed(() => billingStore.account?.balancePoints ?? 0);
const displayFrozen = computed(() => billingStore.account?.frozenPoints ?? 0);
const trialRemaining = computed(() => billingStore.trialQuota?.remaining ?? 0);
const trialTotal = computed(() => billingStore.trialQuota?.total ?? 0);
const trialUsed = computed(() => Math.max(0, trialTotal.value - trialRemaining.value));
const trialPercent = computed(() => trialTotal.value > 0 ? Math.round((trialRemaining.value / trialTotal.value) * 100) : 0);
const trialLabel = computed(() => {
  if (trialTotal.value <= 0) return '无试用额度';
  if (trialRemaining.value <= 0) return '试用额度已用完';
  const remainingK = (trialRemaining.value / 10000).toFixed(1);
  return `剩余约 ${remainingK} 万字`;
});
const showRealNameModule = computed(() => showContestAuxiliaryEntries && authStore.authEnabled && realNameEnabled.value);
const showContestAuxiliaryEntries = false;

void loadRealNamePolicy();
void loadPasswordPolicy();

function navigate(path: string) { void router.push(path); }
function openRealNameDialog() {
  if (!showRealNameModule.value) return;
  realNameDialogVisible.value = true;
}
function openPublishedBook(bookId: string) { navigate(`/m/bookstore/${bookId}`); }
function openPublishedComment(bookId: string, commentId?: string) {
  void router.push({ path: `/m/bookstore/${bookId}/read`, query: commentId ? { commentId } : undefined });
}
function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

async function loadBaseData() {
  if (!authStore.user?.id) return;
  try {
    const novelList = await fetchNovelSummaries();
    novels.value = novelList.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  } catch { novels.value = []; }
}

let bookstorePromise: Promise<void> | null = null;
async function loadBookstoreData(): Promise<void> {
  if (bookstorePromise) return bookstorePromise;
  bookstorePromise = (async () => {
    loading.value = true;
    try {
      const [myPublishedResult, myCommentsResult] = await Promise.allSettled([
        getMyPublishedBookPage({ page: 1, pageSize: 20 }),
        getMyBookCommentPage({ page: 1, pageSize: 20 }),
      ]);
      publishedBooks.value = myPublishedResult.status === 'fulfilled' ? myPublishedResult.value.items : [];
      bookComments.value = myCommentsResult.status === 'fulfilled' ? myCommentsResult.value.items : [];
      bookstoreLoaded.value = true;
    } catch { publishedBooks.value = []; bookComments.value = []; }
    finally { loading.value = false; bookstorePromise = null; }
  })();
  return bookstorePromise;
}

async function ensureBookstoreDataLoaded(force = false): Promise<void> {
  if (!force && bookstoreLoaded.value) return;
  await loadBookstoreData();
}

async function loadData() { await Promise.all([loadBaseData(), ensureBookstoreDataLoaded(true), loadWriterScore()]); }

const { pullDistance, refreshing, triggered, pullContainerRef } = usePullRefresh({ onRefresh: () => loadData() });

async function handleApplyCreator() {
  if (!(await ensureRealNameAction('creatorApplication', { router, isMobile: true, redirect: route.fullPath }))) return;
  creatorSubmitting.value = true;
  try { creatorDialogVisible.value = true; }
  catch (error: any) {
    if (handleRealNameBlockedError(error, { scene: 'creatorApplication', router, isMobile: true, redirect: route.fullPath })) return;
    ElMessage.error(error?.response?.data?.error || '提交申请失败');
  } finally { creatorSubmitting.value = false; }
}

async function handleLogout() { await authStore.logout(); navigate('/m'); }

async function handleChangePassword() {
  if (!passwordForm.value.oldPassword || !passwordForm.value.newPassword || !passwordForm.value.confirmPassword) { ElMessage.warning('请完整填写密码信息'); return; }
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) { ElMessage.error('两次输入的新密码不一致'); return; }
  const passwordError = validatePasswordAgainstPolicy(passwordForm.value.newPassword, passwordPolicy.value);
  if (passwordError) { ElMessage.error(passwordError); return; }
  passwordSaving.value = true;
  try {
    await authApi.changePassword({ oldPassword: passwordForm.value.oldPassword, newPassword: passwordForm.value.newPassword });
    passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' };
    showPasswordForm.value = false;
    closeSheet();
    ElMessage.success('密码已修改，请重新登录');
    await authStore.logout();
    navigate('/m/login');
  } catch (error: any) { ElMessage.error(error?.response?.data?.error || '修改密码失败'); }
  finally { passwordSaving.value = false; }
}

async function handleCreatorApplicationSubmitted(_profile: UserProfile) {
  await authStore.refreshProfile();
  ElMessage.success('作家申请已提交');
}

async function handleRealNameVerified(_profile: UserProfile) {
  realNameDialogVisible.value = false;
  if (route.query.realName === '1') { void router.replace({ path: route.path, query: { ...route.query, realName: undefined } }); }
  await authStore.refreshProfile();
  await loadBaseData();
  void loadWriterScore();
  if (bookstoreLoaded.value || bookstoreSectionVisible.value) { await ensureBookstoreDataLoaded(true); }
}

async function loadFriendlyLinks() {
  try { const { data } = await http.get<{ name: string; url: string }[]>('/settings/public/friendly-links'); friendlyLinks.value = data ?? []; }
  catch { /* 忽略 */ }
}

async function loadUserApiStatus() {
  if (!isCreatorUser.value) return;
  try {
    const profiles = await userApiApi.listProfiles();
    const list = Array.isArray(profiles) ? profiles : [];
    userTextModelConfigured.value = list.some((p) => p.scope === 'model' && p.enabled);
    userImageModelConfigured.value = list.some((p) => p.scope === 'image-generation' && p.enabled);
  } catch { /* 忽略 */ }
}

async function loadBilling() {
  try { await billingStore.loadOverview(); } catch { /* 忽略 */ }
}

onMounted(() => {
  void loadBaseData();
  void loadCacheInfo();
  void loadTtsCacheStats();
  void loadWriterScore();
  loadFriendlyLinks();
  loadUserApiStatus();
  loadBilling();
  achievements.load();
  cancelIdleBookstoreWarmup = scheduleIdleTask(() => { void ensureBookstoreDataLoaded(); }, 1800);
});

onUnmounted(() => { cancelIdleBookstoreWarmup?.(); });

watch(bookstoreSectionVisible, (visible) => {
  if (!visible) return;
  cancelIdleBookstoreWarmup?.();
  cancelIdleBookstoreWarmup = null;
  void ensureBookstoreDataLoaded();
}, { immediate: true });

watch([() => route.query.realName, showRealNameModule], async ([value, enabled]) => {
  if (value !== '1') return;
  if (!enabled) { if (realNamePolicyLoading.value) return; realNameDialogVisible.value = false; void router.replace({ path: route.path, query: { ...route.query, realName: undefined } }); return; }
  await nextTick();
  realNameEntryRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  realNameDialogVisible.value = true;
}, { immediate: true });

// ── 导航卡片 ──
const ttsCacheDesc = computed(() => {
  if (ttsNovelCaches.value.length === 0) return '暂无缓存';
  const totalBytes = ttsNovelCaches.value.reduce((sum, n) => sum + n.sizeBytes, 0);
  return `${formatBytes(totalBytes)}`;
});

const coreTiles = computed(() => {
  const tiles: { key: string; icon: any; label: string; desc: string; action: 'navigate' | 'sheet'; target?: string; warn?: boolean }[] = [
    { key: 'collection', icon: Notebook, label: '角色图鉴', desc: '收藏卡牌', action: 'navigate', target: '/m/character-collection' },
    { key: 'favorites', icon: CollectionTag, label: '我的收藏', desc: '书城收藏', action: 'navigate', target: '/m/favorites' },
    { key: 'comments', icon: ChatDotRound, label: '我的评论', desc: '书城互动', action: 'navigate', target: '/m/comments' },
    { key: 'trends', icon: DataAnalysis, label: '热点报告', desc: '全网创作风向', action: 'navigate', target: '/m/trends' },
    { key: 'settings', icon: SetUp, label: '设置与偏好', desc: '主题 · 模型 · 缓存', action: 'navigate', target: '/m/settings' },
  ];
  if (authStore.isAdmin) {
    tiles.push({ key: 'admin', icon: Cpu, label: '系统设置', desc: '全局配置', action: 'navigate', target: '/m/admin' });
  }
  return tiles;
});

const funTiles = computed(() => [
  { key: 'fun-achievements', icon: Trophy, label: '我的成就', desc: `${achievements.unlockedCount.value}/${achievements.totalCount.value} 徽章`, action: 'navigate' as const, target: '/m/achievements' },
  { key: 'fun-radar', icon: Histogram, label: '角色人格卡', desc: '六维人设雷达', action: 'navigate' as const, target: '/m/fun/character-radar' },
  { key: 'fun-relation', icon: Share, label: '角色关系图谱', desc: '人物关系网络', action: 'navigate' as const, target: '/m/fun/relation' },
  { key: 'fun-chemistry', icon: Connection, label: 'CP化学反应', desc: '双角色火花测试', action: 'navigate' as const, target: '/m/fun/chemistry' },
  { key: 'fun-quotes', icon: ChatLineSquare, label: '金句广场', desc: '名场面台词榜', action: 'navigate' as const, target: '/m/fun/quotes' },
  { key: 'fun-dna', icon: MagicStick, label: '爽点DNA', desc: '你的阅读人格', action: 'navigate' as const, target: '/m/fun/dna' },
  { key: 'fun-pangu', icon: Promotion, label: '盘古开天', desc: '一灵感开新书', action: 'navigate' as const, target: '/m/fun/pangu' },
  { key: 'fun-cangjie', icon: EditPen, label: '仓颉造字', desc: '聊出故事内核', action: 'navigate' as const, target: '/m/fun/cangjie' },
]);

function handleTile(tile: { key: string; action: string; target?: string }) {
  if (tile.action === 'navigate' && tile.target) navigate(tile.target);
  else openSheet(tile.key);
}

const ic = 'mme-input';
const fc = 'mme-field';
const rc = 'mme-row';
const sc = 'mme-swatch';
const cc = 'mme-check';
const bc = 'mme-save';
</script>

<template>
  <div ref="pullContainerRef" class="mobile-me-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div
      class="mobile-focus-pull-indicator"
      :class="{ 'mobile-focus-pull-indicator--visible': pullDistance > 0, 'mobile-focus-pull-indicator--triggered': triggered, 'mobile-focus-pull-indicator--refreshing': refreshing }"
      :style="{ '--pull-offset': pullDistance > 0 || refreshing ? '0px' : '-60px' }"
    >
      <span v-if="refreshing" class="mobile-focus-pull-spinner" />
      <span v-else class="mobile-focus-pull-arrow">↓</span>
      <span>{{ refreshing ? '刷新中...' : triggered ? '松手刷新' : '下拉刷新' }}</span>
    </div>
    <CreatorApplicationDialog v-model="creatorDialogVisible" :profile="authStore.user" is-mobile @submitted="handleCreatorApplicationSubmitted" />

    <div class="mobile-focus-shell">
      <MobileTopbar title="我的" subtitle="账号与作品">
        <template #actions>
          <button class="mobile-focus-button--secondary" type="button" @click="handleLogout">
            <el-icon :size="14"><SwitchButton /></el-icon>
            退出
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-me-main mobile-focus-main">
        <!-- 个人资料卡片 -->
        <MobileSectionCard kicker="My Space" hero class="mobile-me-profile">
          <div class="mobile-me-profile__top">
            <span class="mobile-me-profile__avatar"><el-icon :size="22"><User /></el-icon></span>
            <div class="mobile-me-profile__identity">
              <template v-if="!penNameEditing">
                <div class="mobile-me-profile__name-row">
                  <h1>{{ currentUserName }}</h1>
                  <button class="mobile-me-profile__edit-btn" type="button" title="修改笔名" @click="startPenNameEdit">
                    <el-icon :size="12"><EditPen /></el-icon>
                  </button>
                </div>
              </template>
              <template v-else>
                <div class="mobile-me-profile__name-edit">
                  <input
                    v-model="penNameInput"
                    type="text"
                    maxlength="50"
                    placeholder="输入笔名"
                    @keyup.enter="savePenName"
                  />
                  <div class="mobile-me-profile__edit-actions">
                    <button type="button" @click="cancelPenNameEdit">取消</button>
                    <button type="button" :disabled="penNameSaving" @click="savePenName">
                      {{ penNameSaving ? '保存中' : '保存' }}
                    </button>
                  </div>
                </div>
              </template>
              <span>{{ currentRole }} · {{ userIdShort }}</span>
            </div>
          </div>
          <MobileStatGroup v-if="isCreatorUser" :items="heroStats" />
        </MobileSectionCard>

        <!-- 积分与额度卡片 -->
        <MobileSectionCard v-if="billingLoaded" kicker="Billing" hero class="mobile-me-billing-card">
          <div class="mme-billing-row">
            <div class="mme-billing-item">
              <span class="mme-billing-item__icon"><el-icon :size="16"><Coin /></el-icon></span>
              <div class="mme-billing-item__body">
                <span class="mme-billing-item__label">可用积分</span>
                <span class="mme-billing-item__value">{{ displayBalance.toLocaleString() }}</span>
              </div>
            </div>
            <div class="mme-billing-item">
              <span class="mme-billing-item__icon"><el-icon :size="16"><Tickets /></el-icon></span>
              <div class="mme-billing-item__body">
                <span class="mme-billing-item__label">试用字数</span>
                <span class="mme-billing-item__value">{{ trialLabel }}</span>
              </div>
            </div>
          </div>
          <div v-if="trialTotal > 0" class="mme-billing-bar">
            <div class="mme-billing-bar__fill" :style="{ width: trialPercent + '%' }" />
          </div>
          <div v-if="displayFrozen > 0" class="mme-billing-frozen">
            <span class="mobile-focus-note">冻结中 {{ displayFrozen.toLocaleString() }} 分</span>
          </div>
        </MobileSectionCard>

        <!-- 作家等级卡片 -->
        <MobileSectionCard v-if="writerScore" kicker="Writer Level" hero class="mobile-me-level-card">
          <div class="mme-level-hero">
            <div class="mme-level-hero__badge">
              <span class="mme-level-hero__lv">Lv.{{ writerScore.level }}</span>
              <span class="mme-level-hero__name">{{ writerScore.levelName }}</span>
            </div>
            <div class="mme-level-hero__score">
              <span class="mme-level-hero__num">{{ writerScore.score.toLocaleString() }}</span>
              <span class="mme-level-hero__unit">作家分</span>
            </div>
          </div>
          <div class="mme-level-progress" v-if="writerScore.level < 8">
            <div class="mme-level-progress__bar">
              <div class="mme-level-progress__fill" :style="{ width: levelProgress + '%' }" />
            </div>
            <div class="mme-level-progress__text">
              <span>距 <strong>{{ nextLevelName }}</strong></span>
              <span>还需 {{ nextLevelRemaining.toLocaleString() }} 分</span>
            </div>
          </div>
          <div class="mme-level-dims">
            <div class="mme-level-dim">
              <span class="mme-level-dim__val">{{ writerScore.dimensions.bili }}</span>
              <span class="mme-level-dim__label">笔力</span>
            </div>
            <div class="mme-level-dim">
              <span class="mme-level-dim__val">{{ writerScore.dimensions.pinzhi }}</span>
              <span class="mme-level-dim__label">品质</span>
            </div>
            <div class="mme-level-dim">
              <span class="mme-level-dim__val">{{ writerScore.dimensions.renqi }}</span>
              <span class="mme-level-dim__label">人气</span>
            </div>
            <div class="mme-level-dim">
              <span class="mme-level-dim__val">{{ writerScore.dimensions.duoyuan }}</span>
              <span class="mme-level-dim__label">多元</span>
            </div>
          </div>
          <div class="mme-level-extra" v-if="writerScore.comboDays >= 7">
            <span>连续创作 {{ writerScore.comboDays }} 天 · 系数 ×{{ writerScore.comboMultiplier }}</span>
          </div>
          <router-link to="/m/writer-stats" class="mme-level-link">查看写作分析 →</router-link>
        </MobileSectionCard>

        <!-- 图标卡片网格 - 核心功能 -->
        <div class="mme-grid">
          <button v-for="tile in coreTiles" :key="tile.key" class="mme-tile" :class="{ 'mme-tile--warn': tile.warn }" type="button" @click="handleTile(tile)">
            <span class="mme-tile__icon" :class="{ 'mme-tile__icon--warn': tile.warn }"><el-icon :size="22"><component :is="tile.icon" /></el-icon></span>
            <span class="mme-tile__label">{{ tile.label }}</span>
            <span class="mme-tile__desc">{{ tile.desc }}</span>
          </button>
        </div>

        <!-- 趣味玩法 -->
        <MobileSectionCard v-if="funTiles.length > 0" kicker="FOR FUN" class="mme-fun-section">
          <div class="mme-fun-grid">
            <button v-for="tile in funTiles" :key="tile.key" class="mme-fun-item" type="button" @click="handleTile(tile)">
              <span class="mme-fun-item__icon"><el-icon :size="18"><component :is="tile.icon" /></el-icon></span>
              <span class="mme-fun-item__label">{{ tile.label }}</span>
            </button>
          </div>
        </MobileSectionCard>
      </main>
    </div>

    <!-- 底部弹出层 -->
    <Teleport to="body">
      <div v-if="activeSheet" class="mme-overlay mobile-focus-light-vars" @click.self="closeSheet">
        <div class="mme-sheet">
          <div class="mme-sheet__head">
            <span class="mme-sheet__title">{{ activeSheet }}</span>
            <button class="mme-sheet__close" @click="closeSheet">取消</button>
          </div>
          <div class="mme-sheet__body">

            <!-- 账户安全 -->
            <template v-if="activeSheet === 'security'">
              <p class="mobile-focus-note">{{ passwordPolicyHint || '请输入旧密码并设置新密码' }}</p>
              <input v-model="passwordForm.oldPassword" :class="ic" type="password" autocomplete="current-password" placeholder="当前密码" />
              <input v-model="passwordForm.newPassword" :class="ic" type="password" autocomplete="new-password" placeholder="新密码" />
              <input v-model="passwordForm.confirmPassword" :class="ic" type="password" autocomplete="new-password" placeholder="再次输入新密码" @keyup.enter="handleChangePassword" />
              <button :class="bc" :disabled="passwordSaving" @click="handleChangePassword">{{ passwordSaving ? '提交中' : '确认修改' }}</button>
            </template>

            <!-- 离线缓存 -->
            <template v-if="activeSheet === 'cache'">
              <div v-if="cacheLoading" class="mobile-focus-loading" style="padding:12px 0"><el-skeleton animated :rows="2" /></div>
              <template v-else-if="cachedNovels.length">
                <div class="mme-cache-list">
                  <div v-for="novel in cachedNovels" :key="novel.novelId" class="mme-cache-item">
                    <div class="mme-cache-item__info">
                      <strong>{{ novel.novelTitle }}</strong>
                      <span>已缓存 {{ novel.chapterCount }} 章</span>
                    </div>
                    <button class="mobile-focus-button--ghost" type="button" @click="handleRemoveNovelCache(novel.novelId)">移除</button>
                  </div>
                </div>
                <p class="mobile-focus-note" style="margin-top:8px">阅读章节时会自动缓存，离线也能继续阅读。</p>
                <button class="mobile-me-compact-btn" style="margin-top:8px;width:100%" :disabled="cacheClearing" @click="handleClearCache">{{ cacheClearing ? '清理中...' : '清除全部缓存' }}</button>
              </template>
              <p v-else class="mobile-focus-note">暂无离线缓存。阅读章节后会自动缓存，断网也能继续阅读。</p>
            </template>

            <!-- 听书音频缓存 -->
            <template v-if="activeSheet === 'tts-cache'">
              <div v-if="ttsCacheLoading" class="mobile-focus-loading" style="padding:12px 0"><el-skeleton animated :rows="2" /></div>
              <template v-else>
                <p class="mobile-focus-note" style="margin-bottom:8px">
                  在线听书时会自动缓存合成音频，下次听同一段无需重新合成，秒开且省流量。
                </p>
                <div v-if="ttsNovelCaches.length" class="mme-cache-list">
                  <div v-for="novel in ttsNovelCaches" :key="novel.novelId" class="mme-cache-item">
                    <div class="mme-cache-item__info">
                      <strong>{{ novel.novelTitle }}</strong>
                      <span>{{ formatBytes(novel.sizeBytes) }}</span>
                    </div>
                    <button
                      class="mobile-focus-button--ghost"
                      type="button"
                      :disabled="ttsNovelClearingId === novel.novelId"
                      @click="handleClearNovelTtsCache(novel.novelId)"
                    >{{ ttsNovelClearingId === novel.novelId ? '清理中' : '移除' }}</button>
                  </div>
                </div>
                <button
                  v-if="ttsNovelCaches.length > 0"
                  class="mobile-me-compact-btn"
                  style="margin-top:8px;width:100%"
                  :disabled="ttsCacheClearing"
                  @click="handleClearTtsCache"
                >{{ ttsCacheClearing ? '清理中...' : '清除全部听书缓存' }}</button>
                <p v-else class="mobile-focus-note" style="margin-top:8px">暂无听书缓存，听书后会自动累积。</p>
              </template>
            </template>

            <!-- 书城动态（创作者） -->
            <template v-if="activeSheet === 'bookstore'">
              <div v-if="loading" class="mobile-focus-loading"><el-skeleton animated :rows="4" /></div>
              <template v-else>
                <div class="mme-bookstore-hero">
                  <div>
                    <span>书城表现</span>
                    <strong>{{ publishedBooks.length ? `${publishedBooks.length} 部作品` : '暂无上架作品' }}</strong>
                    <p>阅读、收藏与评论表现集中看板</p>
                  </div>
                  <button type="button" class="mme-bookstore-link" @click="navigate('/m/my-published')">管理</button>
                </div>
                <div class="mme-balance">
                  <div class="mme-balance__item">
                    <span class="mme-balance__icon"><el-icon :size="16"><View /></el-icon></span>
                    <div><strong>{{ totalPublishedViews }}</strong><span>总阅读</span></div>
                  </div>
                  <div class="mme-balance__item">
                    <span class="mme-balance__icon"><el-icon :size="16"><CollectionTag /></el-icon></span>
                    <div><strong>{{ totalPublishedFavorites }}</strong><span>收藏</span></div>
                  </div>
                  <div class="mme-balance__item">
                    <span class="mme-balance__icon"><el-icon :size="16"><ChatDotRound /></el-icon></span>
                    <div><strong>{{ totalPublishedComments }}</strong><span>评论</span></div>
                  </div>
                </div>
                <div v-if="topPublishedBooks.length" class="mme-bookstore-block">
                  <div class="mme-bookstore-block__head">
                    <strong>热门作品</strong>
                    <span>按阅读优先</span>
                  </div>
                  <button v-for="book in topPublishedBooks" :key="book.id" type="button" class="mme-book" @click="openPublishedBook(book.id)">
                    <span class="mme-book__name">{{ book.displayTitle || book.title }}</span>
                    <span class="mme-book__stat">阅读 {{ book.viewCount ?? 0 }} · 收藏 {{ book.favoriteCount ?? 0 }}</span>
                  </button>
                </div>
                <div v-if="recentBookComments.length" class="mme-bookstore-block">
                  <div class="mme-bookstore-block__head">
                    <strong>最近评论</strong>
                    <span>读者反馈</span>
                  </div>
                  <button v-for="c in recentBookComments" :key="c.id" type="button" class="mme-comment" @click="openPublishedComment(c.bookId, c.id)">
                    <span class="mme-comment__text">{{ c.content }}</span>
                    <span class="mme-comment__date">{{ formatDate(c.updatedAt || c.createdAt) }}</span>
                  </button>
                </div>
                <div v-if="!topPublishedBooks.length && !recentBookComments.length" class="mme-bookstore-empty">
                  <strong>作品上架后会自动汇总动态</strong>
                  <span>阅读、收藏、评论都会在这里沉淀成可追踪的数据。</span>
                  <button type="button" @click="navigate('/m/my-published')">查看作品</button>
                </div>
              </template>
            </template>

            <!-- 友情链接 -->
            <template v-if="activeSheet === 'links'">
              <div class="mme-link-list">
                <a v-for="link in friendlyLinks" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer" class="mme-link-item">
                  <span class="mme-link-item__name">{{ link.name }}</span>
                  <span class="mme-link-item__arrow">&rarr;</span>
                </a>
              </div>
            </template>

          </div>
        </div>
      </div>
    </Teleport>

    <MobileWorkbenchDock />
  </div>
</template>

<style scoped src="../styles/mobile-me.css"></style>
