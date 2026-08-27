<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { authApi, type CreatorApplicationRecord } from '../../api/auth';
import { getPendingAudits, approveAudit, rejectAudit, getAuditStats } from '../../api/content-audit';
import { http } from '../../api/http';
import { extractApiErrorMessage } from '../../utils/api-error';
import { resolveCoverSrc } from '../../utils/deploy-path';
import type { ContentAudit } from '../../api/types';
import Icon from '../../components/shared/Icon.vue';

const PAGE_SIZE = 20;

const activeTab = ref<'creator' | 'content' | 'cover'>('creator');

// 统计
const stats = ref({ pending: 0, manualReview: 0, pass: 0, reject: 0 });
const creatorApplicationTotal = ref(0);
const coverPendingTotal = ref(0);

// 加载状态
const creatorLoading = ref(false);
const contentLoading = ref(false);
const coverLoading = ref(false);
const processingId = ref('');
const rejectDialogVisible = ref(false);
const currentAudit = ref<ContentAudit | null>(null);
const rejectReason = ref('');
const rejecting = ref(false);

// 数据
const creatorApplications = ref<CreatorApplicationRecord[]>([]);
const audits = ref<ContentAudit[]>([]);
const coverPendingBooks = ref<any[]>([]);

const heroStats = computed(() => [
  { label: '资格待审', value: creatorApplicationTotal.value },
  { label: '内容待审', value: stats.value.pending },
  { label: '人工复核', value: stats.value.manualReview },
  { label: '封面待审', value: coverPendingTotal.value },
]);

function getCreatorStatusTone(status: CreatorApplicationRecord['status']): string {
  if (status === 'approved') return 'status--success';
  if (status === 'rejected') return 'status--danger';
  return 'status--warning';
}

function getCreatorStatusLabel(status: CreatorApplicationRecord['status']): string {
  if (status === 'approved') return '已通过';
  if (status === 'rejected') return '已驳回';
  return '待审核';
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '待审核',
    manual_review: '人工复核',
    pass: '已通过',
    reject: '已拒绝',
  };
  return map[status] ?? status;
}

function getStatusTone(status: string): string {
  const map: Record<string, string> = {
    pending: 'status--warning',
    manual_review: 'status--info',
    pass: 'status--success',
    reject: 'status--danger',
  };
  return map[status] ?? '';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return '安全';
  if (score >= 50) return '需复核';
  return '高风险';
}

function getScoreTone(score: number): string {
  if (score >= 80) return 'status--success';
  if (score >= 50) return 'status--warning';
  return 'status--danger';
}

async function loadStats() {
  try {
    const result = await getAuditStats();
    stats.value = {
      pending: result.total - result.pass - result.reject,
      manualReview: result.review,
      pass: result.pass,
      reject: result.reject,
    };
  } catch {
    // ignore
  }
}

async function loadCreatorApplications() {
  creatorLoading.value = true;
  try {
    const result = await authApi.listCreatorApplications({
      status: 'pending',
      page: 1,
      pageSize: PAGE_SIZE,
    });
    creatorApplications.value = result.items;
    creatorApplicationTotal.value = result.total;
  } catch (error) {
    creatorApplications.value = [];
    ElMessage.error(extractApiErrorMessage(error, '加载作家资格待审列表失败'));
  } finally {
    creatorLoading.value = false;
  }
}

async function loadAudits() {
  contentLoading.value = true;
  try {
    const result = await getPendingAudits(1, PAGE_SIZE);
    audits.value = result.items;
  } catch {
    audits.value = [];
  } finally {
    contentLoading.value = false;
  }
}

async function loadCoverPending() {
  coverLoading.value = true;
  try {
    const response = await http.get('/audit/admin/cover-pending-page', {
      params: { page: 1, pageSize: PAGE_SIZE },
    });
    coverPendingBooks.value = response.data.items;
    coverPendingTotal.value = response.data.total;
  } catch {
    coverPendingBooks.value = [];
    coverPendingTotal.value = 0;
  } finally {
    coverLoading.value = false;
  }
}

function loadAll() {
  void Promise.all([loadStats(), loadCreatorApplications(), loadAudits(), loadCoverPending()]);
}

async function handleApproveCreator(application: CreatorApplicationRecord) {
  try {
    await ElMessageBox.confirm(
      `确认通过 ${application.username} 的作家资格申请？`,
      '通过资格申请',
      { confirmButtonText: '通过', cancelButtonText: '取消', type: 'success' },
    );
  } catch {
    return;
  }
  processingId.value = application.id;
  try {
    await authApi.reviewCreatorApplication(application.id, { status: 'approved' });
    ElMessage.success('已通过作家资格申请');
    loadAll();
  } catch (error) {
    ElMessage.error(extractApiErrorMessage(error, '通过作家资格申请失败'));
  } finally {
    processingId.value = '';
  }
}

async function handleRejectCreator(application: CreatorApplicationRecord) {
  let adminNote = '';
  try {
    const result = await ElMessageBox.prompt(
      `请输入驳回 ${application.username} 的原因`,
      '驳回资格申请',
      { confirmButtonText: '驳回', cancelButtonText: '取消', inputPlaceholder: '可填写驳回原因' },
    );
    if (typeof result === 'object' && result && 'value' in result) {
      adminNote = result.value?.trim() || '';
    }
  } catch {
    return;
  }
  processingId.value = application.id;
  try {
    await authApi.reviewCreatorApplication(application.id, { status: 'rejected', adminNote });
    ElMessage.success('已驳回作家资格申请');
    loadAll();
  } catch (error) {
    ElMessage.error(extractApiErrorMessage(error, '驳回作家资格申请失败'));
  } finally {
    processingId.value = '';
  }
}

async function handleApproveAudit(audit: ContentAudit) {
  try {
    await ElMessageBox.confirm('确定通过该作品审核？', '确认通过', {
      confirmButtonText: '通过', cancelButtonText: '取消', type: 'success',
    });
    await approveAudit(audit.id);
    ElMessage.success('已通过');
    loadAll();
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(extractApiErrorMessage(error, '操作失败'));
  }
}

function openRejectDialog(audit: ContentAudit) {
  currentAudit.value = audit;
  rejectReason.value = '';
  rejectDialogVisible.value = true;
}

async function confirmReject() {
  if (!currentAudit.value) return;
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请输入拒绝原因');
    return;
  }
  rejecting.value = true;
  try {
    await rejectAudit(currentAudit.value.id, rejectReason.value.trim());
    ElMessage.success('已拒绝');
    rejectDialogVisible.value = false;
    loadAll();
  } catch (error) {
    ElMessage.error(extractApiErrorMessage(error, '操作失败'));
  } finally {
    rejecting.value = false;
  }
}

async function handleApproveCover(book: any) {
  try {
    await ElMessageBox.confirm(`确定通过《${book.title}》的封面？`, '封面审核', {
      confirmButtonText: '通过', cancelButtonText: '取消', type: 'success',
    });
    await http.post(`/bookstore/${book.id}/cover-audit/approve`);
    ElMessage.success('封面已通过');
    loadCoverPending();
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(extractApiErrorMessage(error, '操作失败'));
  }
}

async function handleRejectCover(book: any) {
  try {
    const result = await ElMessageBox.prompt('请输入封面拒绝原因', '拒绝封面', {
      confirmButtonText: '拒绝', cancelButtonText: '取消',
      inputPlaceholder: '拒绝原因',
      inputValidator: (val: string) => (val?.trim() ? true : '请填写原因'),
    });
    const reason = typeof result === 'object' && result && 'value' in result ? result.value : '';
    await http.post(`/bookstore/${book.id}/cover-audit/reject`, { reason });
    ElMessage.success('封面已拒绝');
    loadCoverPending();
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(extractApiErrorMessage(error, '操作失败'));
  }
}

onMounted(() => {
  loadAll();
});
</script>

<template>
  <div class="desktop-admin-audit">
    <div class="desktop-greeting">
      <h1>审核管理</h1>
      <p>管理作家资格、内容审核和封面审核。</p>
    </div>

    <!-- 数据概览 -->
    <div class="stat-grid">
      <div v-for="stat in heroStats" :key="stat.label" class="stat-card nw-panel">
        <div class="stat-card-label">{{ stat.label }}</div>
        <div class="stat-card-value">{{ stat.value }}</div>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="nw-panel">
      <div class="audit-tabs">
        <button class="audit-tab" :class="{ 'is-active': activeTab === 'creator' }" @click="activeTab = 'creator'">
          作家资格审核
        </button>
        <button class="audit-tab" :class="{ 'is-active': activeTab === 'content' }" @click="activeTab = 'content'">
          内容审核
        </button>
        <button class="audit-tab" :class="{ 'is-active': activeTab === 'cover' }" @click="activeTab = 'cover'">
          封面审核
        </button>
        <div class="audit-tab-spacer"></div>
        <button class="desktop-btn" @click="loadAll">
          <Icon name="refreshCw" :size="14" /> 刷新
        </button>
      </div>
    </div>

    <!-- 作家资格审核 -->
    <div v-if="activeTab === 'creator'" class="nw-panel">
      <div v-if="creatorLoading" class="nw-state nw-state--loading">
        <span class="nw-state__spinner" />
        <span>加载中…</span>
      </div>
      <div v-else-if="creatorApplications.length" class="audit-list">
        <article v-for="app in creatorApplications" :key="app.id" class="audit-item">
          <div class="audit-item-head">
            <div class="audit-item-user">
              <div class="audit-avatar">{{ app.username?.charAt(0) || '?' }}</div>
              <div>
                <div class="audit-item-title">{{ app.username }}</div>
                <div class="audit-item-sub">笔名：{{ app.penName }} · {{ app.email }}</div>
              </div>
            </div>
            <span class="audit-status" :class="getCreatorStatusTone(app.status)">
              {{ getCreatorStatusLabel(app.status) }}
            </span>
          </div>
          <div class="audit-item-body">
            <p v-if="app.reason"><strong>申请说明：</strong>{{ app.reason }}</p>
            <p v-if="app.sampleWork"><strong>样章：</strong>{{ app.sampleWork }}</p>
            <p class="audit-item-time">提交于 {{ app.createdAt }}</p>
          </div>
          <div class="audit-item-actions">
            <button
              class="desktop-btn desktop-btn--primary"
              :disabled="processingId === app.id"
              @click="handleApproveCreator(app)"
            >
              <Icon name="check" :size="14" /> 通过
            </button>
            <button
              class="desktop-btn desktop-btn--danger"
              :disabled="processingId === app.id"
              @click="handleRejectCreator(app)"
            >
              <Icon name="x" :size="14" /> 驳回
            </button>
          </div>
        </article>
      </div>
      <div v-else class="nw-state nw-state--empty">
        <p class="nw-state__title">暂无待审申请</p>
        <p class="nw-state__desc">作家资格审核队列已清空。</p>
      </div>
    </div>

    <!-- 内容审核 -->
    <div v-if="activeTab === 'content'" class="nw-panel">
      <div v-if="contentLoading" class="nw-state nw-state--loading">
        <span class="nw-state__spinner" />
        <span>加载中…</span>
      </div>
      <div v-else-if="audits.length" class="audit-list">
        <article v-for="audit in audits" :key="audit.id" class="audit-item">
          <div class="audit-item-head">
            <div class="audit-item-title">作品 ID：{{ audit.novelId }}</div>
            <div class="audit-score-group">
              <span class="audit-score" :class="getScoreTone(audit.result?.overallScore ?? 0)">
                置信度 {{ audit.result?.overallScore ?? '--' }}%
              </span>
              <span class="audit-status" :class="getStatusTone(audit.status)">
                {{ getStatusLabel(audit.status) }}
              </span>
            </div>
          </div>
          <div v-if="audit.result?.violations?.length" class="audit-violations">
            <span
              v-for="(v, idx) in audit.result.violations.slice(0, 5)"
              :key="idx"
              class="violation-tag"
            >
              {{ v.type }}
            </span>
          </div>
          <div class="audit-item-actions">
            <button class="desktop-btn desktop-btn--primary" @click="handleApproveAudit(audit)">
              <Icon name="check" :size="14" /> 通过
            </button>
            <button class="desktop-btn desktop-btn--danger" @click="openRejectDialog(audit)">
              <Icon name="x" :size="14" /> 拒绝
            </button>
          </div>
        </article>
      </div>
      <div v-else class="nw-state nw-state--empty">
        <p class="nw-state__title">暂无待审内容</p>
        <p class="nw-state__desc">内容审核队列已清空。</p>
      </div>
    </div>

    <!-- 封面审核 -->
    <div v-if="activeTab === 'cover'" class="nw-panel">
      <div v-if="coverLoading" class="nw-state nw-state--loading">
        <span class="nw-state__spinner" />
        <span>加载中…</span>
      </div>
      <div v-else-if="coverPendingBooks.length" class="cover-list">
        <article v-for="book in coverPendingBooks" :key="book.id" class="cover-item">
          <div class="cover-item-cover">
            <img v-if="book.coverUrl || book.cover" :src="resolveCoverSrc(book.coverUrl || book.cover)" :alt="book.title" />
            <div v-else class="cover-fallback">
              <span>{{ book.title?.charAt(0) || '书' }}</span>
            </div>
          </div>
          <div class="cover-item-info">
            <div class="cover-item-title">{{ book.title }}</div>
            <div class="cover-item-meta">{{ book.category || '未分类' }}</div>
          </div>
          <div class="cover-item-actions">
            <button class="desktop-btn desktop-btn--primary" @click="handleApproveCover(book)">
              <Icon name="check" :size="14" /> 通过
            </button>
            <button class="desktop-btn desktop-btn--danger" @click="handleRejectCover(book)">
              <Icon name="x" :size="14" /> 拒绝
            </button>
          </div>
        </article>
      </div>
      <div v-else class="nw-state nw-state--empty">
        <p class="nw-state__title">暂无待审封面</p>
        <p class="nw-state__desc">封面审核队列已清空。</p>
      </div>
    </div>

    <!-- 拒绝弹窗 -->
    <el-dialog v-model="rejectDialogVisible" title="拒绝审核" width="480px">
      <el-input
        v-model="rejectReason"
        type="textarea"
        :rows="4"
        placeholder="请输入拒绝原因（必填）"
      />
      <template #footer>
        <button class="desktop-btn" @click="rejectDialogVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--danger" :disabled="rejecting" @click="confirmReject">
          {{ rejecting ? '提交中...' : '确认拒绝' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.desktop-admin-audit {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--nw-space-4);
}

.stat-card {
  padding: var(--nw-space-5);
}

.stat-card-label {
  font-size: 13px;
  color: var(--nw-text-secondary);
  margin-bottom: var(--nw-space-2);
}

.stat-card-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--nw-text-primary);
  font-family: var(--nw-font-display);
}

.audit-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--nw-space-3) var(--nw-space-5);
}

.audit-tab {
  padding: 8px 18px;
  border-radius: var(--nw-radius-md);
  border: none;
  background: transparent;
  color: var(--nw-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.audit-tab:hover {
  color: var(--nw-text-primary);
  background: var(--nw-bg-secondary);
}

.audit-tab.is-active {
  color: var(--nw-accent-strong);
  background: color-mix(in srgb, var(--nw-accent-start) 12%, transparent);
  font-weight: 600;
}

.audit-tab-spacer {
  flex: 1;
}

.audit-list {
  display: flex;
  flex-direction: column;
}

.audit-item {
  padding: var(--nw-space-5);
  border-bottom: 1px solid var(--nw-border);
}

.audit-item:last-child {
  border-bottom: none;
}

.audit-item-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--nw-space-3);
}

.audit-item-user {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
}

.audit-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--nw-accent-gradient);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 18px;
  font-weight: 700;
  font-family: var(--nw-font-display);
}

.audit-item-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin-bottom: 2px;
}

.audit-item-sub {
  font-size: 13px;
  color: var(--nw-text-secondary);
}

.audit-score-group {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2);
}

.audit-score {
  font-size: 13px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 999px;
}

.audit-status {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 999px;
}

.status--success {
  background: color-mix(in srgb, var(--nw-success) 12%, transparent);
  color: var(--nw-success);
}

.status--danger {
  background: color-mix(in srgb, var(--nw-danger) 12%, transparent);
  color: var(--nw-danger);
}

.status--warning {
  background: color-mix(in srgb, var(--nw-warning) 12%, transparent);
  color: var(--nw-warning);
}

.status--info {
  background: color-mix(in srgb, var(--nw-info, #3b82f6) 12%, transparent);
  color: var(--nw-info, #3b82f6);
}

.audit-item-body {
  margin-bottom: var(--nw-space-4);
}

.audit-item-body p {
  margin: 0 0 6px 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
}

.audit-item-body strong {
  color: var(--nw-text-primary);
}

.audit-item-time {
  font-size: 12px !important;
  color: var(--nw-text-muted) !important;
}

.audit-violations {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: var(--nw-space-4);
}

.violation-tag {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nw-danger) 12%, transparent);
  color: var(--nw-danger);
}

.audit-item-actions {
  display: flex;
  gap: var(--nw-space-3);
}

.cover-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--nw-space-4);
  padding: var(--nw-space-5);
}

.cover-item {
  display: flex;
  gap: var(--nw-space-4);
  padding: var(--nw-space-4);
  border: 1px solid var(--nw-border);
  border-radius: var(--nw-radius-md);
  align-items: center;
}

.cover-item-cover {
  width: 80px;
  aspect-ratio: 6 / 8;
  border-radius: var(--nw-radius-sm);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--nw-bg-secondary);
}

.cover-item-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background: var(--nw-accent-gradient);
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  font-family: var(--nw-font-display);
}

.cover-item-info {
  flex: 1;
  min-width: 0;
}

.cover-item-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cover-item-meta {
  font-size: 13px;
  color: var(--nw-text-secondary);
}

.cover-item-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}
</style>
