<script setup lang="ts">
/**
 * 桌面端·我的（丰富版）
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { authApi, type UserProfile } from '../../api/auth';
import { deleteBookComment, getMyPublishedBookPage, getMyBookCommentPage } from '../../api/bookstore';
import { fetchNovelSummaries } from '../../api/novels';
import { fetchMyWriterScore, type WriterScoreResult } from '../../api/writer-scores';
import { fetchBillingOverview } from '../../api/billing';
import { useAuthStore } from '../../stores/auth';
import { extractApiErrorMessage } from '../../api/errors';
import type { BookStore, BookStoreUserComment } from '../../api/types';
import type { NovelMetadata } from '../../types';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import Modal from '../../components/shared/Modal.vue';
import CreatorApplicationDialog from '../../components/auth/CreatorApplicationDialog.vue';
import RealNameVerificationPanel from '../../components/auth/RealNameVerificationPanel.vue';
import { useRealNameAccess } from '../../composables/useRealNameAccess';
import { CREATOR_STATUS_LABELS } from '../../utils/auth-display';

const router = useRouter();
const authStore = useAuthStore();

const profile = ref<UserProfile | null>(null);
const novels = ref<NovelMetadata[]>([]);
const publishedBooks = ref<BookStore[]>([]);
const myComments = ref<BookStoreUserComment[]>([]);
const writerScore = ref<WriterScoreResult | null>(null);
const balancePoints = ref(0);
const frozenPoints = ref(0);
const trialRemaining = ref(0);
const trialTotal = ref(0);
const loading = ref(true);
const commentsLoading = ref(false);
const commentsPage = ref(1);
const commentsTotal = ref(0);
const commentsHasMore = ref(false);
const removingCommentId = ref('');

const openApiSettings = ref(false);
const openCachePanel = ref(false);

function gotoSettings() {
  router.push('/desktop/settings');
}

async function loadAll(): Promise<void> {
  loading.value = true;
  try {
    const [p, nv, pub, cm, sc, bill] = await Promise.allSettled([
      authApi.getProfile(),
      fetchNovelSummaries(),
      getMyPublishedBookPage({ page: 1, pageSize: 20 }),
      getMyBookCommentPage({ page: 1, pageSize: 8 }),
      fetchMyWriterScore(),
      fetchBillingOverview(),
    ]);
    if (p.status === 'fulfilled') { profile.value = p.value; authStore.user = p.value; }
    if (nv.status === 'fulfilled') novels.value = nv.value;
    if (pub.status === 'fulfilled') publishedBooks.value = pub.value.items;
    if (cm.status === 'fulfilled') {
      myComments.value = cm.value.items;
      commentsPage.value = cm.value.page;
      commentsTotal.value = cm.value.total;
      commentsHasMore.value = cm.value.page < cm.value.totalPages;
    }
    if (sc.status === 'fulfilled') writerScore.value = sc.value;
    if (bill.status === 'fulfilled' && bill.value) {
      balancePoints.value = bill.value.balancePoints ?? 0;
      frozenPoints.value = bill.value.frozenPoints ?? 0;
      if (bill.value.trialQuota) {
        trialRemaining.value = bill.value.trialQuota.remaining;
        trialTotal.value = bill.value.trialQuota.total;
      }
    }
  } finally { loading.value = false; }
}
onMounted(loadAll);

const displayName = computed(() => profile.value?.penName || profile.value?.username || '创作者');
const avatarLetter = computed(() => displayName.value.slice(0, 1));

// 统计
const totalNovels = computed(() => novels.value.length);
const writingNovels = computed(() => novels.value.filter(n => n.status === 'writing').length);
const completedNovels = computed(() => novels.value.filter(n => n.status === 'completed' || n.status === 'published').length);
const totalPublished = computed(() => publishedBooks.value.length);
const totalViews = computed(() => publishedBooks.value.reduce((s, b) => s + (b.viewCount ?? 0), 0));
const totalLikes = computed(() => publishedBooks.value.reduce((s, b) => s + (b.likeCount ?? 0), 0));
const totalFavorites = computed(() => publishedBooks.value.reduce((s, b) => s + (b.favoriteCount ?? 0), 0));
const totalComments = computed(() => publishedBooks.value.reduce((s, b) => s + (b.commentCount ?? 0), 0));
const totalWords = computed(() => novels.value.reduce((s, n) => s + (n.wordCount ?? 0), 0));

// Top 3 作品
const topBooks = computed(() =>
  [...publishedBooks.value]
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, 3),
);

// 作家分维度
const WRITER_DIM_LABELS: Record<string, string> = { bili: '笔力', pinzhi: '品质', renqi: '人气', duoyuan: '多元' };

// 配额进度
const trialPercent = computed(() => trialTotal.value > 0 ? Math.round((trialRemaining.value / trialTotal.value) * 100) : 0);

/** 编辑 */
const editVisible = ref(false);
const editForm = ref({ penName: '', bio: '' });
const editSaving = ref(false);
function openEdit(): void { editForm.value = { penName: profile.value?.penName ?? '', bio: profile.value?.bio ?? '' }; editVisible.value = true; }
async function saveProfile(): Promise<void> {
  editSaving.value = true;
  try {
    const updated = await authApi.updateProfile({ penName: editForm.value.penName.trim() || null, bio: editForm.value.bio.trim() || null });
    profile.value = updated; authStore.user = updated;
    editVisible.value = false; ElMessage.success('资料已更新');
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '保存失败')); }
  finally { editSaving.value = false; }
}

/** 密码 */
const pwdVisible = ref(false);
const pwdForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' });
const pwdSaving = ref(false);
async function changePassword(): Promise<void> {
  if (!pwdForm.value.oldPassword || !pwdForm.value.newPassword) { ElMessage.warning('请完整填写'); return; }
  if (pwdForm.value.newPassword !== pwdForm.value.confirmPassword) { ElMessage.error('两次新密码不一致'); return; }
  pwdSaving.value = true;
  try {
    await authApi.changePassword?.({ oldPassword: pwdForm.value.oldPassword, newPassword: pwdForm.value.newPassword });
    ElMessage.success('密码已修改，请重新登录');
    pwdVisible.value = false;
    void authStore.logout();
    router.push('/desktop');
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '修改失败')); }
  finally { pwdSaving.value = false; }
}

async function logout(): Promise<void> {
  try { await ElMessageBox.confirm('确定退出登录？', '退出', { type: 'warning', confirmButtonText: '退出' }); } catch { return; }
  await authStore.logout();
  router.push({ name: 'Login' });
}

async function loadMyComments(reset = true): Promise<void> {
  commentsLoading.value = true;
  try {
    const result = await getMyBookCommentPage({ page: reset ? 1 : commentsPage.value + 1, pageSize: 8 });
    myComments.value = reset ? result.items : [...myComments.value, ...result.items];
    commentsPage.value = result.page;
    commentsTotal.value = result.total;
    commentsHasMore.value = result.page < result.totalPages;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '评论加载失败'));
  } finally {
    commentsLoading.value = false;
  }
}

function locateComment(item: BookStoreUserComment): void {
  router.push(`/desktop/book/${item.bookId}/read/1`);
}

async function removeMyComment(item: BookStoreUserComment): Promise<void> {
  removingCommentId.value = item.commentId;
  try {
    await deleteBookComment(item.bookId, item.commentId);
    myComments.value = myComments.value.filter((comment) => comment.commentId !== item.commentId);
    commentsTotal.value = Math.max(0, commentsTotal.value - 1);
    ElMessage.success('评论已删除');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除评论失败'));
  } finally {
    removingCommentId.value = '';
  }
}

function fmt(n: number): string { return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString(); }
function fmtDate(s?: string | null): string { return s ? new Date(s).toLocaleDateString('zh-CN') : '—'; }

const CREATOR_LABELS: Record<string, string> = { none: '普通用户', pending: '创作者审核中', approved: '已认证创作者', rejected: '创作者申请被拒' };

// 实名认证
const { realNameEnabled, loadRealNamePolicy } = useRealNameAccess();
const realNameDialogVisible = ref(false);

function openRealNameDialog() {
  void loadRealNamePolicy();
  realNameDialogVisible.value = true;
}

function onRealNameVerified(updatedProfile: UserProfile) {
  profile.value = updatedProfile;
  authStore.user = updatedProfile;
  realNameDialogVisible.value = false;
  ElMessage.success('实名认证已通过');
}

// 创作者申请
const creatorDialogVisible = ref(false);
const creatorSubmitting = ref(false);

function openCreatorApplication() {
  creatorDialogVisible.value = true;
}

function onCreatorApplicationSubmitted(updatedProfile: UserProfile) {
  profile.value = updatedProfile;
  authStore.user = updatedProfile;
  creatorDialogVisible.value = false;
  ElMessage.success('申请已提交，等待审核');
}

const canApplyCreator = computed(() => {
  if (!profile.value) return false;
  return profile.value.creatorStatus === 'none' || profile.value.creatorStatus === 'rejected';
});

const quickLinks = computed(() => {
  const links = [
    { to: '/desktop/novels', icon: 'book', label: '我的作品', desc: '创作管理', count: totalNovels.value },
    { to: '/desktop/analytics', icon: 'layers', label: '数据分析', desc: '运营看板' },
  ];
  if (profile.value?.role === 'admin') {
    links.push({ to: '/desktop/admin', icon: 'settings', label: '管理设置', desc: '全局配置' });
    links.push({ to: '/desktop/admin/users', icon: 'user', label: '用户管理', desc: '用户与权限' });
  }
  return links;
});
</script>

<template>
  <div class="desktop-me">
    <StateView :loading="loading">

      <!-- ========== 个人卡 + 统计 ========== -->
      <div class="me-hero nw-panel">
        <div class="me-hero-left">
          <div class="me-avatar">{{ avatarLetter }}</div>
          <div class="me-hero-info">
            <h1 class="me-name">{{ displayName }}</h1>
            <div class="me-tags">
              <span class="nw-tag" :class="{ 'priority-low': profile?.role === 'admin' }">{{ profile?.role === 'admin' ? '管理员' : '用户' }}</span>
              <span v-if="profile?.creatorStatus && profile.creatorStatus !== 'none'" class="nw-tag" :class="{ 'priority-medium': profile.creatorStatus === 'pending', 'priority-low': profile.creatorStatus === 'approved' }">{{ CREATOR_LABELS[profile.creatorStatus] }}</span>
              <span v-if="profile?.realNameVerified" class="nw-tag priority-low">实名认证</span>
            </div>
            <p v-if="profile?.bio" class="me-bio">{{ profile.bio }}</p>
            <div class="me-sub-meta">
              <span><Icon name="user" :size="12" /> {{ profile?.username }}</span>
              <span v-if="profile?.email"><Icon name="bookOpen" :size="12" /> {{ profile.email }}</span>
              <span><Icon name="book" :size="12" /> 注册于 {{ fmtDate(profile?.createdAt) }}</span>
            </div>
          </div>
        </div>
        <div class="me-hero-actions">
          <button class="desktop-btn" @click="openEdit"><Icon name="pen" :size="14" /> 编辑资料</button>
          <button v-if="realNameEnabled" class="desktop-btn" @click="openRealNameDialog">
            <Icon name="shield" :size="14" />
            {{ profile?.realNameVerified ? '查看实名' : '实名认证' }}
          </button>
          <button v-if="canApplyCreator" class="desktop-btn desktop-btn--primary" @click="openCreatorApplication">
            <Icon name="star" :size="14" /> 申请创作者
          </button>
          <button class="desktop-btn" @click="pwdVisible = true"><Icon name="settings" :size="14" /> 修改密码</button>
          <button class="desktop-btn reader-danger" @click="logout"><Icon name="close" :size="14" /> 退出登录</button>
        </div>
      </div>

      <!-- ========== 双列布局 ========== -->
      <div class="me-grid">
        <!-- 左列 -->
        <div class="me-col">
          <!-- 创作统计 -->
          <div class="nw-panel">
            <div class="nw-panel__head"><h2 class="nw-panel__title">创作统计</h2></div>
            <div class="me-stats-grid">
              <div class="me-stat-item"><span class="me-stat-num">{{ totalNovels }}</span><span class="me-stat-label">作品</span></div>
              <div class="me-stat-item"><span class="me-stat-num">{{ writingNovels }}</span><span class="me-stat-label">连载中</span></div>
              <div class="me-stat-item"><span class="me-stat-num">{{ completedNovels }}</span><span class="me-stat-label">已完结</span></div>
              <div class="me-stat-item"><span class="me-stat-num">{{ fmt(totalWords) }}</span><span class="me-stat-label">总字数</span></div>
            </div>
          </div>

          <!-- 书城数据 -->
          <div class="nw-panel">
            <div class="nw-panel__head"><h2 class="nw-panel__title">书城数据</h2></div>
            <div class="me-stats-grid">
              <div class="me-stat-item"><span class="me-stat-num">{{ totalPublished }}</span><span class="me-stat-label">已发布</span></div>
              <div class="me-stat-item"><span class="me-stat-num">{{ fmt(totalViews) }}</span><span class="me-stat-label">总阅读</span></div>
              <div class="me-stat-item"><span class="me-stat-num">{{ fmt(totalLikes) }}</span><span class="me-stat-label">点赞</span></div>
              <div class="me-stat-item"><span class="me-stat-num">{{ fmt(totalFavorites) }}</span><span class="me-stat-label">收藏</span></div>
            </div>
          </div>

          <!-- 积分 -->
          <div class="nw-panel">
            <div class="nw-panel__head"><h2 class="nw-panel__title">积分与配额</h2></div>
            <div class="me-billing">
              <div class="me-billing-row">
                <div class="me-billing-item">
                  <Icon name="sparkles" :size="18" />
                  <div><div class="me-billing-val">{{ balancePoints.toLocaleString() }}</div><div class="me-billing-label">可用积分</div></div>
                </div>
                <div class="me-billing-item">
                  <Icon name="layers" :size="18" />
                  <div><div class="me-billing-val">{{ fmt(trialRemaining) }}</div><div class="me-billing-label">试用字数 / {{ fmt(trialTotal) }}</div></div>
                </div>
              </div>
              <div v-if="trialTotal > 0" class="me-trial-bar">
                <div class="me-trial-fill" :style="{ width: trialPercent + '%' }" />
              </div>
              <div v-if="frozenPoints > 0" class="me-frozen">冻结中 {{ frozenPoints.toLocaleString() }} 分</div>
            </div>
          </div>
        </div>

        <!-- 右列 -->
        <div class="me-col">
          <!-- 设置与偏好 -->
          <div class="nw-panel">
            <div class="nw-panel__head"><h2 class="nw-panel__title">设置与偏好</h2></div>
            <div class="me-settings-list">
              <div class="me-setting-row" @click="gotoSettings">
                <div class="me-setting-icon"><Icon name="cpu" :size="18" /></div>
                <div class="me-setting-body">
                  <div class="me-setting-label">文字模型</div>
                  <div class="me-setting-desc">配置自定义大模型 API</div>
                </div>
                <Icon name="chevronRight" :size="16" class="me-setting-arrow" />
              </div>
              <div class="me-setting-row" @click="gotoSettings">
                <div class="me-setting-icon"><Icon name="image" :size="18" /></div>
                <div class="me-setting-body">
                  <div class="me-setting-label">文生图模型</div>
                  <div class="me-setting-desc">配置自定义绘图 API</div>
                </div>
                <Icon name="chevronRight" :size="16" class="me-setting-arrow" />
              </div>
              <div class="me-setting-row" @click="gotoSettings">
                <div class="me-setting-icon"><Icon name="database" :size="18" /></div>
                <div class="me-setting-body">
                  <div class="me-setting-label">缓存管理</div>
                  <div class="me-setting-desc">离线章节与听书音频</div>
                </div>
                <Icon name="chevronRight" :size="16" class="me-setting-arrow" />
              </div>
            </div>
          </div>

          <!-- 作家分 -->
          <div v-if="writerScore" class="nw-panel me-level-panel">
            <div class="nw-panel__head"><h2 class="nw-panel__title">作家等级</h2></div>
            <div class="me-level-hero">
              <div class="me-level-badge">
                <span class="me-level-lv">Lv.{{ writerScore.level }}</span>
                <span class="me-level-name">{{ writerScore.levelName }}</span>
              </div>
              <div class="me-level-score">
                <span class="me-level-num">{{ writerScore.score.toLocaleString() }}</span>
                <span class="me-level-unit">作家分</span>
              </div>
            </div>
            <div class="me-level-dims">
              <div v-for="(val, key) in writerScore.dimensions" :key="key" class="me-level-dim">
                <div class="me-level-dim-bar"><div class="me-level-dim-fill" :style="{ width: Math.min(val, 100) + '%' }" /></div>
                <span class="me-level-dim-label">{{ WRITER_DIM_LABELS[key] ?? key }}</span>
                <span class="me-level-dim-val">{{ val }}</span>
              </div>
            </div>
            <div class="me-level-combo">
              <Icon name="sparkles" :size="14" /> 连续创作 {{ writerScore.comboDays }} 天 · 倍率 ×{{ writerScore.comboMultiplier }}
            </div>
          </div>

          <!-- 热门作品 -->
          <div v-if="topBooks.length" class="nw-panel">
            <div class="nw-panel__head"><h2 class="nw-panel__title">热门作品</h2></div>
            <div class="me-top-books">
              <div v-for="(b, i) in topBooks" :key="b.id" class="me-top-book" @click="router.push(`/desktop/book/${b.id}`)">
                <span class="me-top-rank">{{ i + 1 }}</span>
                <div class="me-top-info">
                  <div class="me-top-title">{{ b.title }}</div>
                  <div class="me-top-stats">{{ fmt(b.viewCount ?? 0) }} 阅读 · {{ b.likeCount ?? 0 }} 赞 · {{ b.favoriteCount ?? 0 }} 藏</div>
                </div>
              </div>
            </div>
          </div>

          <!-- 我的评论 -->
          <div class="nw-panel">
            <div class="nw-panel__head">
              <h2 class="nw-panel__title">我的评论 <span class="desktop-section-count">{{ commentsTotal || myComments.length }}</span></h2>
              <button class="desktop-btn" type="button" :disabled="commentsLoading" @click="loadMyComments(true)">
                <Icon name="refresh" :size="14" /> {{ commentsLoading ? '刷新中' : '刷新' }}
              </button>
            </div>
            <StateView :loading="commentsLoading && !myComments.length" :empty="!commentsLoading && !myComments.length">
              <template #empty>
                <p class="nw-state__title">还没有评论记录</p>
                <p class="nw-state__desc">去书城读几本，留下看法，这里就会变成你的互动归档。</p>
              </template>
              <div class="me-comments me-comments--full">
                <article v-for="c in myComments" :key="c.commentId" class="me-comment-card">
                  <button class="me-comment-main" type="button" @click="router.push(`/desktop/book/${c.bookId}`)">
                    <div class="me-comment-cover" :style="c.bookCover ? { backgroundImage: `url(${c.bookCover})` } : {}">
                      <span v-if="!c.bookCover">{{ c.bookTitle.slice(0, 1) }}</span>
                    </div>
                    <div class="me-comment-body">
                      <div class="me-comment-book">
                        <strong>{{ c.bookTitle }}</strong>
                        <span>{{ c.bookCategory || '未分类' }}</span>
                      </div>
                      <p>{{ c.content }}</p>
                      <small>{{ fmtDate(c.createdAt) }}</small>
                    </div>
                  </button>
                  <div class="me-comment-actions">
                    <button class="desktop-btn" type="button" @click="locateComment(c)"><Icon name="bookOpen" :size="14" /> 定位评论</button>
                    <button class="desktop-btn" type="button" :disabled="removingCommentId === c.commentId" @click="removeMyComment(c)">
                      {{ removingCommentId === c.commentId ? '删除中…' : '删除评论' }}
                    </button>
                  </div>
                </article>
                <button v-if="commentsHasMore" class="desktop-btn" type="button" :disabled="commentsLoading" @click="loadMyComments(false)">
                  {{ commentsLoading ? '加载中…' : '继续加载评论' }}
                </button>
              </div>
            </StateView>
          </div>
        </div>
      </div>

      <!-- ========== 快捷入口 ========== -->
      <div class="me-tiles">
        <RouterLink v-for="link in quickLinks" :key="link.to" :to="link.to" class="me-tile">
          <Icon :name="link.icon" :size="24" />
          <div class="me-tile-body">
            <span class="me-tile-label">{{ link.label }}</span>
            <span class="me-tile-desc">{{ link.desc }}</span>
          </div>
          <span v-if="link.count !== undefined" class="me-tile-count">{{ link.count }}</span>
        </RouterLink>
      </div>
    </StateView>

    <!-- 编辑弹窗 -->
    <Modal v-model="editVisible" title="编辑资料" width="480px">
      <div class="nw-field">
        <label class="nw-field-label">笔名</label>
        <input v-model="editForm.penName" class="nw-input" placeholder="显示在作品和书城" maxlength="50" />
      </div>
      <div class="nw-field">
        <label class="nw-field-label">个人简介</label>
        <textarea v-model="editForm.bio" class="nw-textarea" rows="3" placeholder="一句话介绍自己" maxlength="200" />
      </div>
      <template #footer>
        <button class="desktop-btn" :disabled="editSaving" @click="editVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="editSaving" @click="saveProfile">{{ editSaving ? '保存中…' : '保存' }}</button>
      </template>
    </Modal>

    <!-- 密码弹窗 -->
    <Modal v-model="pwdVisible" title="修改密码" width="440px">
      <div class="nw-field"><label class="nw-field-label">当前密码</label><input v-model="pwdForm.oldPassword" type="password" class="nw-input" autocomplete="current-password" /></div>
      <div class="nw-field"><label class="nw-field-label">新密码</label><input v-model="pwdForm.newPassword" type="password" class="nw-input" autocomplete="new-password" /></div>
      <div class="nw-field"><label class="nw-field-label">确认新密码</label><input v-model="pwdForm.confirmPassword" type="password" class="nw-input" autocomplete="new-password" /></div>
      <template #footer>
        <button class="desktop-btn" :disabled="pwdSaving" @click="pwdVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="pwdSaving" @click="changePassword">{{ pwdSaving ? '修改中…' : '确认' }}</button>
      </template>
    </Modal>

    <!-- 实名认证弹窗 -->
    <Modal v-model="realNameDialogVisible" :title="profile?.realNameVerified ? '实名认证信息' : '实名认证'" width="560px">
      <RealNameVerificationPanel
        :profile="profile"
        @verified="onRealNameVerified"
      />
    </Modal>

    <!-- 创作者申请弹窗 -->
    <CreatorApplicationDialog
      v-model="creatorDialogVisible"
      :profile="profile"
      @submitted="onCreatorApplicationSubmitted"
    />
  </div>
</template>
