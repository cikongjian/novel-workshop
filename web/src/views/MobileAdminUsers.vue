<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Search, User } from '@element-plus/icons-vue';
import MobileAdminUserDetailSheet from '../components/mobile-focus/MobileAdminUserDetailSheet.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import { useAuthStore } from '../stores/auth';
import { authApi, type AdminUserListItem } from '../api/auth';
import { adjustBillingUserPoints, updateBillingUserTrialQuota } from '../api/billing';
import { extractApiErrorMessage } from '../utils/api-error';
import {
  formatAdminCreatorStatus,
  formatAdminDate,
  formatAdminDateTime,
  formatAdminShortWords,
  formatAdminUserStatus,
} from '../utils/mobile-admin-user-format';
import { useThemeMode } from '../composables/useThemeMode';
import '../styles/mobile-admin-users.css';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const { isAdmin } = useAuthStore();

const loading = ref(false);
const keyword = ref('');
const users = ref<AdminUserListItem[]>([]);
const total = ref(0);
const page = ref(0);
const pageSize = 25;
const hasMore = computed(() => users.value.length < total.value);
const adjustingUserId = ref('');
const adjustingDelta = ref(0);
const adjustingRemark = ref('');
const adjustingSaving = ref(false);
const remainingDeltaInput = ref(0);
const totalDeltaInput = ref(0);
const quotaSaving = ref(false);

// 详情弹层
const detailUser = ref<AdminUserListItem | null>(null);
function openDetail(user: AdminUserListItem) { detailUser.value = user; }
function closeDetail() { detailUser.value = null; }

// 积分调整弹层
const adjustUser = ref<AdminUserListItem | null>(null);
function openAdjust(user: AdminUserListItem) {
  adjustUser.value = user;
  adjustingDelta.value = 0;
  adjustingRemark.value = '';
}
function closeAdjust() { adjustUser.value = null; }

// 免费字数调整弹层
const quotaUser = ref<AdminUserListItem | null>(null);
function openQuotaAdjust(user: AdminUserListItem) {
  quotaUser.value = user;
  remainingDeltaInput.value = 0;
  totalDeltaInput.value = 0;
}
function closeQuotaAdjust() { quotaUser.value = null; }
const quotaCurrentTotal = computed(() => quotaUser.value?.quotaTotal || 0);
const quotaOldRemaining = computed(() => quotaUser.value?.quotaRemaining ?? Math.max(0, quotaCurrentTotal.value - (quotaUser.value?.quotaUsed || 0)));
const quotaNewRemaining = computed(() => Math.max(0, quotaOldRemaining.value + remainingDeltaInput.value));
const quotaPreviewTotal = computed(() => Math.max(0, quotaCurrentTotal.value + totalDeltaInput.value));

async function search(reset = true) {
  if (reset) { page.value = 0; users.value = []; }
  loading.value = true;
  try {
    const result = await authApi.listUsers({ keyword: keyword.value.trim() || undefined, limit: pageSize, offset: page.value * pageSize });
    if (reset) { users.value = result.items; } else { users.value.push(...result.items); }
    total.value = result.total;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载用户列表失败'));
  } finally { loading.value = false; }
}

async function loadMore() {
  page.value += 1;
  await search(false);
}

async function toggleStatus(user: AdminUserListItem) {
  const newStatus = user.status === 'active' ? 'disabled' : 'active';
  const action = newStatus === 'disabled' ? '禁用' : '启用';
  try {
    await ElMessageBox.confirm(`确定要${action}用户「${user.username}」吗？`, `确认${action}`, { confirmButtonText: action, cancelButtonText: '取消', type: 'warning' });
    await authApi.setUserStatus(user.id, newStatus);
    user.status = newStatus;
    ElMessage.success(`已${action}`);
  } catch { /* 取消 */ }
}

async function handleAdjust() {
  if (!adjustUser.value || adjustingDelta.value === 0) return;
  adjustingSaving.value = true;
  try {
    await adjustBillingUserPoints(adjustUser.value.id, {
      deltaPoints: adjustingDelta.value,
      remark: adjustingRemark.value.trim() || undefined,
    });
    ElMessage.success('积分已调整');
    closeAdjust();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '调整失败'));
  } finally { adjustingSaving.value = false; }
}

async function handleQuotaAdjust() {
  if (!quotaUser.value || (remainingDeltaInput.value === 0 && totalDeltaInput.value === 0)) return;
  quotaSaving.value = true;
  try {
    await updateBillingUserTrialQuota(quotaUser.value.id, {
      remainingDelta: remainingDeltaInput.value,
      totalDelta: totalDeltaInput.value,
    });
    ElMessage.success('免费字数已更新');
    closeQuotaAdjust();
    await search();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '更新免费字数失败'));
  } finally { quotaSaving.value = false; }
}

async function handleDelete(user: AdminUserListItem) {
  try {
    await ElMessageBox.confirm(`确定要删除用户「${user.username}」吗？此操作不可撤销。`, '确认删除', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'error' });
    await authApi.deleteUser(user.id);
    users.value = users.value.filter((u) => u.id !== user.id);
    ElMessage.success('已删除');
  } catch { /* 取消 */ }
}

function handleDetailAdjust(user: AdminUserListItem) {
  openAdjust(user);
  closeDetail();
}

function handleDetailQuotaAdjust(user: AdminUserListItem) {
  openQuotaAdjust(user);
  closeDetail();
}

function handleDetailDelete(user: AdminUserListItem) {
  void handleDelete(user);
  closeDetail();
}

const inputClass = 'mas-input';
const fieldClass = 'mas-field';
const saveBtnClass = 'mas-save';

onMounted(() => {
  if (isAdmin) void search();
  else router.replace('/m/app');
});

function goBack() { void router.push('/m/admin'); }
</script>

<template>
  <div v-if="isAdmin" class="mobile-admin-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell">
      <MobileTopbar title="用户管理" subtitle="搜索与管理注册用户">
        <template #leading>
          <button class="mobile-focus-button--ghost" type="button" @click="goBack">
            <el-icon :size="18"><ArrowLeft /></el-icon>
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-focus-main">
        <!-- 搜索栏 -->
        <div class="mas-search-bar">
          <el-icon :size="16"><Search /></el-icon>
          <input
            v-model="keyword"
            class="mas-search-input"
            placeholder="搜索用户名或 ID..."
            @keyup.enter="search()"
          />
        </div>

        <!-- 加载中 -->
        <div v-if="loading && users.length === 0" class="mobile-focus-loading">
          <el-skeleton animated :rows="5" />
        </div>

        <!-- 用户列表 -->
        <div v-if="users.length > 0" class="mas-user-list">
          <button
            v-for="user in users"
            :key="user.id"
            class="mas-user-card"
            type="button"
            @click="openDetail(user)"
          >
            <div class="mas-user-card__left">
              <span class="mas-user-card__avatar">
                <el-icon :size="20"><User /></el-icon>
              </span>
            </div>
            <div class="mas-user-card__body">
              <div class="mas-user-card__name">{{ user.username }}</div>
              <div class="mas-user-card__meta">
                <span :class="['mas-user-status', user.status === 'disabled' ? 'mas-user-status--disabled' : '']">{{ formatAdminUserStatus(user.status) }}</span>
                <span class="mas-user-role">{{ user.role === 'admin' ? '管理员' : '用户' }}</span>
                <span class="mas-user-creator">{{ formatAdminCreatorStatus(user.creatorStatus) }}</span>
              </div>
              <div class="mas-user-card__words" v-if="user.totalGeneratedWords > 0">
                累计生成 {{ formatAdminShortWords(user.totalGeneratedWords) }}
              </div>
              <div class="mas-user-card__billing">
                <span>{{ (user.balancePoints || 0).toLocaleString() }} 积分</span>
                <span class="mas-user-card__billing-sep">|</span>
                <span>免费 {{ (user.quotaRemaining || 0).toLocaleString() }}/{{ (user.quotaTotal || 0).toLocaleString() }}</span>
              </div>
            </div>
            <div class="mas-user-card__right">
              <span class="mas-user-date">登录 {{ formatAdminDateTime(user.lastLoginAt) }}</span>
              <span class="mas-user-date mas-user-date--sub">注册 {{ formatAdminDate(user.createdAt) }}</span>
            </div>
          </button>
        </div>

        <!-- 空 -->
        <div v-if="!loading && users.length === 0" class="mobile-focus-empty">
          暂无用户
        </div>

        <!-- 加载更多 -->
        <div v-if="hasMore" class="mas-load-more">
          <button class="mas-load-more-btn" :disabled="loading" @click="loadMore">
            {{ loading ? '加载中...' : `加载更多 (${users.length} / ${total})` }}
          </button>
        </div>
      </main>
    </div>

    <MobileAdminUserDetailSheet
      v-if="detailUser"
      :user="detailUser"
      @close="closeDetail"
      @adjust="handleDetailAdjust"
      @adjust-quota="handleDetailQuotaAdjust"
      @toggle-status="toggleStatus"
      @delete-user="handleDetailDelete"
    />

    <div v-if="adjustUser" class="mas-overlay" @click.self="closeAdjust">
      <div class="mas-sheet">
        <div class="mas-sheet__head">
          <span class="mas-sheet__title">调整积分 · {{ adjustUser.username }}</span>
          <button class="mas-sheet__close" @click="closeAdjust">取消</button>
        </div>
        <div class="mas-sheet__body">
          <div :class="fieldClass"><label>调整数额（正数增加，负数扣减）</label>
            <input v-model.number="adjustingDelta" type="number" :class="inputClass" placeholder="如 500 或 -200" />
          </div>
          <div :class="fieldClass"><label>备注（选填）</label>
            <input v-model="adjustingRemark" :class="inputClass" placeholder="调整原因" />
          </div>
          <button :class="saveBtnClass" :disabled="adjustingSaving || adjustingDelta === 0" @click="handleAdjust">
            {{ adjustingSaving ? '调整中...' : `确认${adjustingDelta > 0 ? '增加' : '扣减'} ${Math.abs(adjustingDelta)} 积分` }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="quotaUser" class="mas-overlay" @click.self="closeQuotaAdjust">
      <div class="mas-sheet">
        <div class="mas-sheet__head">
          <span class="mas-sheet__title">调整免费字数 · {{ quotaUser.username }}</span>
          <button class="mas-sheet__close" @click="closeQuotaAdjust">取消</button>
        </div>
        <div class="mas-sheet__body">
          <div :class="fieldClass"><label>本次充值/扣减余额</label>
            <input v-model.number="remainingDeltaInput" type="number" :class="inputClass" placeholder="如 10000 或 -5000" />
          </div>
          <div :class="fieldClass"><label>本次调整免费上限</label>
            <input v-model.number="totalDeltaInput" type="number" :class="inputClass" placeholder="不改上限就填 0" />
          </div>
          <p class="mas-info-text">余额和上限分开调整。当前余额 {{ quotaOldRemaining.toLocaleString() }}，保存后余额 {{ quotaNewRemaining.toLocaleString() }}；当前上限 {{ quotaCurrentTotal.toLocaleString() }}，保存后上限 {{ quotaPreviewTotal.toLocaleString() }}。</p>
          <button :class="saveBtnClass" :disabled="quotaSaving || (remainingDeltaInput === 0 && totalDeltaInput === 0)" @click="handleQuotaAdjust">
            {{ quotaSaving ? '保存中...' : '保存免费字数' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
