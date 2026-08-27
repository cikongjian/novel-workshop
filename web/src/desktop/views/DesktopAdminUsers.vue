<script setup lang="ts">
/**
 * 桌面端·用户管理
 * 复用 authApi.listUsers / setUserStatus / reviewCreatorStatus / deleteUser +
 * adjustBillingUserPoints / updateBillingUserTrialQuota。
 */
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { authApi, type AdminUserListItem } from '../../api/auth';
import { adjustBillingUserPoints, updateBillingUserTrialQuota } from '../../api/billing';
import { extractApiErrorMessage } from '../../api/errors';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import Modal from '../../components/shared/Modal.vue';

const users = ref<AdminUserListItem[]>([]);
const total = ref(0);
const loading = ref(false);
const loadError = ref('');
const keyword = ref('');
const hasMore = computed(() => users.value.length < total.value);

async function load(append = false): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await authApi.listUsers({
      keyword: keyword.value.trim() || undefined,
      limit: 25,
      offset: append ? users.value.length : 0,
    });
    users.value = append ? [...users.value, ...res.items] : res.items;
    total.value = res.total;
  } catch (err) {
    loadError.value = extractApiErrorMessage(err, '加载用户列表失败');
  } finally {
    loading.value = false;
  }
}
load();

function search(): void { void load(false); }

async function toggleBan(user: AdminUserListItem): Promise<void> {
  const newStatus = user.status === 'active' ? 'disabled' : 'active';
  const action = newStatus === 'disabled' ? '封禁' : '解封';
  try {
    await ElMessageBox.confirm(`${action}用户「${user.penName || user.username}」？`, action, { type: 'warning', confirmButtonText: action });
  } catch { return; }
  try {
    await authApi.setUserStatus(user.id, newStatus);
    ElMessage.success(`已${action}`);
    await load(false);
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, `${action}失败`)); }
}

async function reviewCreator(user: AdminUserListItem, approve: boolean): Promise<void> {
  const status = approve ? 'approved' : 'rejected';
  try {
    await authApi.reviewCreatorStatus(user.id, status as 'approved' | 'rejected');
    ElMessage.success(approve ? '已通过创作者申请' : '已拒绝');
    await load(false);
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '操作失败')); }
}

async function deleteUser(user: AdminUserListItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`永久删除用户「${user.penName || user.username}」？此操作不可撤销。`, '删除用户', { type: 'error', confirmButtonText: '删除' });
  } catch { return; }
  try {
    await authApi.deleteUser(user.id);
    ElMessage.success('已删除');
    await load(false);
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '删除失败')); }
}

/** 积分调整 */
const adjustVisible = ref(false);
const adjustUser = ref<AdminUserListItem | null>(null);
const adjustDelta = ref(0);
const adjustRemark = ref('');
const adjustSaving = ref(false);

function openAdjust(user: AdminUserListItem): void {
  adjustUser.value = user;
  adjustDelta.value = 0;
  adjustRemark.value = '';
  adjustVisible.value = true;
}

async function doAdjust(): Promise<void> {
  if (!adjustUser.value || adjustDelta.value === 0) return;
  adjustSaving.value = true;
  try {
    await adjustBillingUserPoints(adjustUser.value.id, adjustDelta.value, adjustRemark.value.trim() || undefined);
    ElMessage.success(`积分已调整 ${adjustDelta.value > 0 ? '+' : ''}${adjustDelta.value}`);
    adjustVisible.value = false;
    await load(false);
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '调整失败')); }
  finally { adjustSaving.value = false; }
}

/** 配额调整 */
const quotaVisible = ref(false);
const quotaUser = ref<AdminUserListItem | null>(null);
const quotaRemaining = ref(0);
const quotaTotal = ref(0);
const quotaSaving = ref(false);

function openQuota(user: AdminUserListItem): void {
  quotaUser.value = user;
  quotaRemaining.value = user.quotaRemaining;
  quotaTotal.value = user.quotaTotal;
  quotaVisible.value = true;
}

async function doQuota(): Promise<void> {
  if (!quotaUser.value) return;
  quotaSaving.value = true;
  try {
    await updateBillingUserTrialQuota(quotaUser.value.id, quotaRemaining.value, quotaTotal.value);
    ElMessage.success('配额已更新');
    quotaVisible.value = false;
    await load(false);
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '更新失败')); }
  finally { quotaSaving.value = false; }
}

function fmt(n: number): string { return n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n); }
function fmtDate(s?: string | null): string { return s ? new Date(s).toLocaleDateString('zh-CN') : '—'; }
</script>

<template>
  <div class="desktop-admin">
    <div class="desktop-greeting">
      <h1>用户管理 <span class="desktop-section-count">{{ total }}</span></h1>
      <div style="display:flex;gap:8px">
        <input v-model="keyword" class="nw-input" style="width:200px" placeholder="搜索用户名/笔名/手机" @keydown.enter="search" />
        <button class="desktop-btn desktop-btn--primary" :disabled="loading" @click="search"><Icon name="search" :size="14" /> 搜索</button>
      </div>
    </div>

    <StateView :loading="loading && !users.length" :error="loadError ? new Error(loadError) : null" :error-message="loadError" @retry="() => load(false)">
      <table class="nw-table">
        <thead>
          <tr>
            <th>用户</th><th>角色</th><th>状态</th><th>积分</th><th>配额</th><th>字数</th><th>注册</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>
              <div class="user-cell">
                <div class="user-avatar">{{ (u.penName || u.username).slice(0, 1) }}</div>
                <div>
                  <div class="user-name">{{ u.penName || u.username }}</div>
                  <div class="user-sub">{{ u.username }}{{ u.phone ? ' · ' + u.phone : '' }}</div>
                </div>
              </div>
            </td>
            <td>
              <span class="nw-tag" :class="{ 'priority-low': u.role === 'admin' }">{{ u.role === 'admin' ? '管理员' : '用户' }}</span>
            </td>
            <td>
              <span class="nw-tag" :class="u.status === 'active' ? 'priority-low' : 'priority-high'">{{ u.status === 'active' ? '正常' : '封禁' }}</span>
              <span v-if="u.creatorStatus === 'pending'" class="nw-tag priority-medium">创作者待审</span>
              <span v-else-if="u.creatorStatus === 'approved'" class="nw-tag">创作者</span>
            </td>
            <td>{{ fmt(u.balancePoints) }}</td>
            <td>{{ fmt(u.quotaRemaining) }} / {{ fmt(u.quotaTotal) }}</td>
            <td>{{ fmt(u.totalGeneratedWords) }}</td>
            <td class="user-date">{{ fmtDate(u.createdAt) }}</td>
            <td>
              <div class="user-actions">
                <el-dropdown trigger="click" @command="(cmd: string) => {
                  if (cmd === 'ban') toggleBan(u);
                  else if (cmd === 'approve') reviewCreator(u, true);
                  else if (cmd === 'reject') reviewCreator(u, false);
                  else if (cmd === 'adjust') openAdjust(u);
                  else if (cmd === 'quota') openQuota(u);
                  else if (cmd === 'delete') deleteUser(u);
                }">
                  <button class="chapter-action" title="操作"><Icon name="settings" :size="14" /></button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="adjust">调整积分</el-dropdown-item>
                      <el-dropdown-item command="quota">修改配额</el-dropdown-item>
                      <el-dropdown-item v-if="u.creatorStatus === 'pending'" command="approve" divided>通过创作者</el-dropdown-item>
                      <el-dropdown-item v-if="u.creatorStatus === 'pending'" command="reject">拒绝创作者</el-dropdown-item>
                      <el-dropdown-item command="ban" divided>{{ u.status === 'active' ? '封禁' : '解封' }}</el-dropdown-item>
                      <el-dropdown-item command="delete" style="color:var(--nw-danger)">删除用户</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </td>
          </tr>
          <tr v-if="!users.length"><td colspan="8" class="detail-empty-row">暂无用户</td></tr>
        </tbody>
      </table>

      <div v-if="hasMore" style="text-align:center;padding:var(--nw-space-4)">
        <button class="desktop-btn" :disabled="loading" @click="load(true)"><Icon name="refresh" :size="14" /> 加载更多</button>
      </div>
    </StateView>

    <!-- 积分调整弹窗 -->
    <Modal v-model="adjustVisible" title="调整积分" width="440px">
      <p style="margin:0 0 var(--nw-space-3);color:var(--nw-text-muted);font-size:var(--nw-text-sm)">
        用户：{{ adjustUser?.penName || adjustUser?.username }}（当前 {{ adjustUser?.balancePoints ?? 0 }} 积分）
      </p>
      <div class="nw-field">
        <label class="nw-field-label">调整额度（正数增加，负数扣除）</label>
        <input v-model.number="adjustDelta" type="number" class="nw-input" placeholder="如 100 或 -50" />
      </div>
      <div class="nw-field">
        <label class="nw-field-label">备注</label>
        <input v-model="adjustRemark" class="nw-input" placeholder="调整原因（可选）" />
      </div>
      <template #footer>
        <button class="desktop-btn" :disabled="adjustSaving" @click="adjustVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="adjustSaving || adjustDelta === 0" @click="doAdjust">
          {{ adjustSaving ? '调整中…' : '确认调整' }}
        </button>
      </template>
    </Modal>

    <!-- 配额调整弹窗 -->
    <Modal v-model="quotaVisible" title="修改试用配额" width="440px">
      <p style="margin:0 0 var(--nw-space-3);color:var(--nw-text-muted);font-size:var(--nw-text-sm)">
        用户：{{ quotaUser?.penName || quotaUser?.username }}
      </p>
      <div class="cover-form-grid">
        <div class="nw-field">
          <label class="nw-field-label">剩余配额</label>
          <input v-model.number="quotaRemaining" type="number" class="nw-input" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">总配额</label>
          <input v-model.number="quotaTotal" type="number" class="nw-input" />
        </div>
      </div>
      <template #footer>
        <button class="desktop-btn" :disabled="quotaSaving" @click="quotaVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="quotaSaving" @click="doQuota">{{ quotaSaving ? '更新中…' : '更新' }}</button>
      </template>
    </Modal>
  </div>
</template>
