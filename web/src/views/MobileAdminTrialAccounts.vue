<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Plus, CopyDocument, User } from '@element-plus/icons-vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import { useAuthStore } from '../stores/auth';
import { authApi, type TrialAccountMeta } from '../api/auth';
import { extractApiErrorMessage } from '../utils/api-error';
import { useThemeMode } from '../composables/useThemeMode';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const { isAdmin } = useAuthStore();

const loading = ref(false);
const accounts = ref<TrialAccountMeta[]>([]);

// 发放弹层
const showCreateSheet = ref(false);
const createCount = ref(3);
const createPoints = ref(2000);
const createQuota = ref(50000);
const createDays = ref(30);
const creating = ref(false);

function formatDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysLeft(expiresAt: string): number {
  const remaining = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  return Math.max(0, remaining);
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

async function loadAccounts() {
  loading.value = true;
  try {
    const result = await authApi.listTrialAccounts();
    accounts.value = result.accounts;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载体验账号失败'));
  } finally { loading.value = false; }
}

async function handleCreate() {
  if (createCount.value < 1 || createCount.value > 50) return;
  creating.value = true;
  try {
    const expiresAt = new Date(Date.now() + createDays.value * 86400000).toISOString();
    const result = await authApi.createTrialAccounts({
      count: createCount.value,
      initialPoints: createPoints.value,
      trialQuotaChars: createQuota.value,
      expiresAt,
    });
    ElMessage.success(`已创建 ${result.accounts.length} 个体验账号`);
    showCreateSheet.value = false;
    await loadAccounts();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '创建失败'));
  } finally { creating.value = false; }
}

async function copyCredentials(account: TrialAccountMeta) {
  const text = `账号：${account.username}\n密码：${account.password}\n平台地址：${window.location.origin}\n有效期至：${formatDate(account.expiresAt)}`;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制账号信息');
  } catch {
    ElMessage.error('复制失败，请手动复制');
  }
}

async function copyBatchCredentials() {
  let text = '';
  for (const a of accounts.value) {
    if (isExpired(a.expiresAt)) continue;
    text += `${a.username} / ${a.password}\n`;
  }
  if (!text) { ElMessage.warning('没有可复制的有效账号'); return; }
  try {
    await navigator.clipboard.writeText(text.trim());
    ElMessage.success('已复制全部有效账号');
  } catch {
    ElMessage.error('复制失败');
  }
}

async function toggleStatus(account: TrialAccountMeta) {
  // trial account status toggle - enable/disable via the users endpoint
  const newStatus = 'disabled' as const;
  try {
    await ElMessageBox.confirm(`确定要停用体验账号「${account.username}」吗？`, '确认停用', { confirmButtonText: '停用', cancelButtonText: '取消', type: 'warning' });
    await authApi.setTrialAccountStatus(account.userId, newStatus);
    ElMessage.success('已停用');
    await loadAccounts();
  } catch { /* 取消 */ }
}

async function handleDelete(account: TrialAccountMeta) {
  try {
    await ElMessageBox.confirm(`确定要删除体验账号「${account.username}」吗？此操作不可撤销。`, '确认删除', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'error' });
    await authApi.deleteTrialAccount(account.userId);
    accounts.value = accounts.value.filter((a) => a.userId !== account.userId);
    ElMessage.success('已删除');
  } catch { /* 取消 */ }
}

const inputClass = 'mas-input';
const fieldClass = 'mas-field';
const saveBtnClass = 'mas-save';

onMounted(() => {
  if (isAdmin) void loadAccounts();
  else router.replace('/m/app');
});

function goBack() { void router.push('/m/admin'); }
</script>

<template>
  <div v-if="isAdmin" class="mobile-admin-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell">
      <MobileTopbar title="体验账号" subtitle="发放与管理试用账号">
        <template #leading>
          <button class="mobile-focus-button--ghost" type="button" @click="goBack">
            <el-icon :size="18"><ArrowLeft /></el-icon>
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-focus-main">
        <!-- 发放按钮 + 批量复制 -->
        <div class="mas-toolbar">
          <button class="mas-toolbar-btn mas-toolbar-btn--primary" @click="showCreateSheet = true">
            <el-icon :size="14"><Plus /></el-icon> 发放体验号
          </button>
          <button v-if="accounts.length > 0" class="mas-toolbar-btn" @click="copyBatchCredentials">
            <el-icon :size="14"><CopyDocument /></el-icon> 复制全部
          </button>
        </div>

        <!-- 加载中 -->
        <div v-if="loading" class="mobile-focus-loading">
          <el-skeleton animated :rows="4" />
        </div>

        <!-- 账号列表 -->
        <div v-if="accounts.length > 0" class="mas-user-list">
          <div
            v-for="account in accounts"
            :key="account.userId"
            :class="['mas-trial-card', isExpired(account.expiresAt) ? 'mas-trial-card--expired' : '']"
          >
            <div class="mas-trial-card__top">
              <span class="mas-trial-card__avatar">
                <el-icon :size="18"><User /></el-icon>
              </span>
              <div class="mas-trial-card__info">
                <span class="mas-trial-card__name">{{ account.username }}</span>
                <span class="mas-trial-card__pass">密码：{{ account.password }}</span>
              </div>
              <button class="mas-trial-card__copy" @click="copyCredentials(account)">
                <el-icon :size="14"><CopyDocument /></el-icon>
              </button>
            </div>
            <div class="mas-trial-card__meta">
              <span class="mas-trial-tag">初始积分 {{ account.initialPoints }}</span>
              <span class="mas-trial-tag">试用 {{ (account.trialQuotaChars / 10000).toFixed(1) }} 万字</span>
              <span :class="['mas-trial-tag', isExpired(account.expiresAt) ? 'mas-trial-tag--expired' : '']">
                {{ isExpired(account.expiresAt) ? '已过期' : `剩余 ${daysLeft(account.expiresAt)} 天` }}
              </span>
            </div>
            <div class="mas-trial-card__footer">
              <span class="mas-trial-card__date">创建于 {{ formatDate(account.createdAt) }} · 到期 {{ formatDate(account.expiresAt) }}</span>
              <button class="mas-trial-card__del" @click="handleDelete(account)">删除</button>
              <button v-if="!isExpired(account.expiresAt)" class="mas-trial-card__stop" @click="toggleStatus(account)">停用</button>
            </div>
          </div>
        </div>

        <!-- 空 -->
        <div v-if="!loading && accounts.length === 0" class="mobile-focus-empty">
          暂无体验账号，点击上方按钮发放
        </div>
      </main>
    </div>

    <!-- 发放弹层 -->
    <Teleport to="body">
      <div
        v-if="showCreateSheet"
        class="mas-overlay"
        :class="isDarkTheme ? 'mobile-focus-dark-vars' : 'mobile-focus-light-vars'"
        @click.self="showCreateSheet = false"
      >
        <div class="mas-sheet">
          <div class="mas-sheet__head">
            <span class="mas-sheet__title">发放体验账号</span>
            <button class="mas-sheet__close" @click="showCreateSheet = false">取消</button>
          </div>
          <div class="mas-sheet__body">
            <p class="mobile-focus-note">系统自动生成「试用_XXXXXX」格式的账号和随机密码，发放后可在列表中复制账号信息。</p>
            <div :class="fieldClass"><label>生成数量</label>
              <input v-model.number="createCount" type="number" min="1" max="50" :class="inputClass" />
            </div>
            <div :class="fieldClass"><label>初始积分（每个账号）</label>
              <input v-model.number="createPoints" type="number" min="0" step="100" :class="inputClass" />
            </div>
            <div :class="fieldClass"><label>试用字数上限（每个账号）</label>
              <input v-model.number="createQuota" type="number" min="0" step="1000" :class="inputClass" />
            </div>
            <div :class="fieldClass"><label>有效期</label>
              <input v-model.number="createDays" type="number" min="1" max="365" :class="inputClass" />
              <span class="mas-field-suffix">天后过期</span>
            </div>
            <button :class="saveBtnClass" :disabled="creating || createCount < 1" @click="handleCreate">
              {{ creating ? '创建中...' : `确认发放 ${createCount} 个体验账号` }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mobile-admin-page { --mobile-focus-accent: var(--star-brand-sky, #0ea5e9); --mobile-focus-accent-strong: var(--star-brand-teal, #14b8a6); padding-bottom: 40px; }

/* ── 工具栏 ── */
.mas-toolbar { display: flex; gap: 8px; margin-bottom: 12px; }
.mas-toolbar-btn {
  display: flex; align-items: center; gap: 5px;
  min-height: 38px; padding: 0 16px;
  border: 1px solid var(--nw-border); border-radius: 12px;
  background: var(--mobile-focus-surface); color: var(--nw-text-secondary);
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.mas-toolbar-btn--primary {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 30%, transparent); background: color-mix(in srgb, var(--mobile-focus-accent) 12%, transparent); color: var(--mobile-focus-accent);
}

/* ── 体验账号卡片 ── */
.mas-user-list { display: flex; flex-direction: column; gap: 8px; }
.mas-trial-card {
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--nw-text-primary) 8%, transparent);
  border-radius: 14px;
  background: var(--mobile-focus-surface);
  backdrop-filter: blur(8px);
}
.mas-trial-card--expired { opacity: 0.55; background: var(--mobile-focus-surface-muted); }
.mas-trial-card__top {
  display: flex; align-items: center; gap: 10px;
}
.mas-trial-card__avatar {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  background: linear-gradient(135deg, color-mix(in srgb, var(--mobile-focus-accent) 14%, transparent), color-mix(in srgb, var(--mobile-focus-accent-strong) 8%, transparent));
  display: flex; align-items: center; justify-content: center;
  color: var(--mobile-focus-accent);
}
.mas-trial-card__info { flex: 1; min-width: 0; }
.mas-trial-card__name { display: block; font-size: 14px; font-weight: 700; color: var(--nw-text-primary); line-height: 1.2; }
.mas-trial-card__pass { display: block; font-size: 12px; color: var(--nw-text-muted); margin-top: 1px; font-family: ui-monospace, monospace; }
.mas-trial-card__copy {
  flex-shrink: 0; width: 36px; height: 36px; border-radius: 10px;
  border: 1px solid var(--nw-border); background: var(--mobile-focus-surface-muted);
  color: var(--nw-text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.mas-trial-card__meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.mas-trial-tag {
  padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, transparent); color: var(--mobile-focus-accent);
}
.mas-trial-tag--expired { background: color-mix(in srgb, #ef4444 14%, transparent); color: color-mix(in srgb, #ef4444 80%, var(--nw-text-primary)); }
.mas-trial-card__footer {
  display: flex; align-items: center; gap: 8px; margin-top: 10px;
  padding-top: 10px; border-top: 1px solid color-mix(in srgb, var(--nw-text-primary) 8%, transparent);
}
.mas-trial-card__date { font-size: 11px; color: var(--nw-text-muted); flex: 1; }
.mas-trial-card__del, .mas-trial-card__stop {
  border: 1px solid color-mix(in srgb, #ef4444 18%, transparent); border-radius: 8px;
  background: color-mix(in srgb, #ef4444 8%, transparent); color: color-mix(in srgb, #ef4444 80%, var(--nw-text-primary));
  font-size: 11px; font-weight: 600; cursor: pointer; padding: 3px 8px;
}
.mas-trial-card__stop {
  border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent); background: color-mix(in srgb, #f59e0b 8%, transparent); color: color-mix(in srgb, #f59e0b 80%, var(--nw-text-primary));
}

/* ── 弹层复用 ── */
.mas-overlay {
  position: fixed; inset: 0; z-index: 200;
  --mobile-focus-accent: var(--star-brand-sky, #0ea5e9);
  --mobile-focus-accent-strong: var(--star-brand-teal, #14b8a6);
  display: flex; align-items: flex-end;
  background: color-mix(in srgb, var(--nw-text-primary) 35%, transparent);
  backdrop-filter: blur(4px);
}
.mas-sheet {
  width: 100%; max-height: 78dvh;
  background: var(--mobile-focus-surface-strong);
  color: var(--nw-text-primary);
  border-radius: 22px 22px 0 0;
  display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -8px 40px color-mix(in srgb, var(--nw-text-primary) 18%, transparent);
}
.mas-sheet__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--nw-border);
  flex-shrink: 0;
}
.mas-sheet__title { font-size: 17px; font-weight: 700; color: var(--nw-text-primary); }
.mas-sheet__close {
  border: 1px solid var(--nw-border); border-radius: 10px;
  background: var(--mobile-focus-surface-muted); color: var(--nw-text-secondary);
  font-size: 13px; font-weight: 600; cursor: pointer;
  padding: 6px 14px;
}
.mas-sheet__body {
  flex: 1; overflow-y: auto;
  min-height: 0;
  padding: 16px 20px calc(86px + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; gap: 10px;
  color: var(--nw-text-primary);
  -webkit-overflow-scrolling: touch;
}
.mas-sheet .mobile-focus-note { color: var(--nw-text-secondary); font-size: 13px; opacity: 1; }
.mas-field { display: grid; gap: 4px; }
.mas-field label { font-size: 12px; font-weight: 600; color: var(--nw-text-secondary); }
.mas-field-suffix { font-size: 11px; color: var(--nw-text-muted); }
.mas-input {
  width: 100%; min-height: 38px; padding: 0 12px;
  border: 1px solid var(--nw-border); border-radius: 10px;
  background: var(--mobile-focus-surface-muted); color: var(--nw-text-primary); font-size: 13px; outline: none;
  -webkit-text-fill-color: var(--nw-text-primary);
}
.mas-input::placeholder { color: var(--nw-text-muted); opacity: 1; -webkit-text-fill-color: var(--nw-text-muted); }
.mas-input:focus { border-color: var(--mobile-focus-accent); background: var(--mobile-focus-surface-strong); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mobile-focus-accent) 8%, transparent); }
.mas-save {
  position: fixed;
  left: 20px; right: 20px;
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  z-index: 230;
  width: auto; min-height: 44px;
  border: none; border-radius: 12px;
  background: linear-gradient(135deg, var(--mobile-focus-accent, #0ea5e9), var(--mobile-focus-accent-strong, #14b8a6));
  color: var(--mobile-focus-on-accent, #fff); font-size: 14px; font-weight: 700; cursor: pointer;
  transition: opacity 0.15s;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--nw-text-primary) 20%, transparent);
  margin-top: 8px; flex-shrink: 0;
}
.mas-save:disabled { opacity: 0.72; cursor: not-allowed; }
</style>
