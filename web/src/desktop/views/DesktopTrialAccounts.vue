<script setup lang="ts">
/**
 * 桌面端·试用账号管理
 * 复用 authApi.createTrialAccounts / listTrialAccounts / deleteTrialAccount / setTrialAccountStatus。
 */
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { authApi, type TrialAccountMeta } from '../../api/auth';
import { extractApiErrorMessage } from '../../api/errors';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import Modal from '../../components/shared/Modal.vue';

const accounts = ref<TrialAccountMeta[]>([]);
const loading = ref(false);
const loadError = ref('');

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await authApi.listTrialAccounts();
    accounts.value = res.accounts ?? [];
  } catch (err) {
    loadError.value = extractApiErrorMessage(err, '加载失败');
  } finally { loading.value = false; }
}
load();

/** 创建试用账号 */
const createVisible = ref(false);
const createForm = ref({ count: 1, initialPoints: 1000, trialQuotaChars: 50000, expiresAt: '', password: '' });
const creating = ref(false);

async function doCreate(): Promise<void> {
  if (!createForm.value.expiresAt) { ElMessage.warning('请设置过期时间'); return; }
  creating.value = true;
  try {
    const res = await authApi.createTrialAccounts({
      count: createForm.value.count,
      initialPoints: createForm.value.initialPoints,
      trialQuotaChars: createForm.value.trialQuotaChars,
      expiresAt: new Date(createForm.value.expiresAt).toISOString(),
      password: createForm.value.password || undefined,
    });
    ElMessage.success(`已创建 ${res.accounts.length} 个试用账号`);
    createVisible.value = false;
    await load();
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '创建失败')); }
  finally { creating.value = false; }
}

async function toggleStatus(acc: TrialAccountMeta): Promise<void> {
  // 循环 active/disabled（API 需要查当前状态，这里简化为 toggle）
  try {
    await authApi.setTrialAccountStatus?.(acc.userId, 'disabled');
    ElMessage.success('已禁用');
    await load();
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '操作失败')); }
}

async function remove(acc: TrialAccountMeta): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除试用账号「${acc.username}」？`, '删除', { type: 'warning', confirmButtonText: '删除' });
  } catch { return; }
  try {
    await authApi.deleteTrialAccount(acc.userId);
    ElMessage.success('已删除');
    await load();
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '删除失败')); }
}

function fmtDate(s?: string): string { return s ? new Date(s).toLocaleDateString('zh-CN') : '—'; }
</script>

<template>
  <div class="desktop-admin">
    <div class="desktop-greeting">
      <h1>试用账号 <span class="desktop-section-count">{{ accounts.length }}</span></h1>
      <div style="display:flex;gap:8px">
        <button class="desktop-btn" :disabled="loading" @click="load"><Icon name="refresh" :size="14" /> 刷新</button>
        <button class="desktop-btn desktop-btn--primary" @click="createVisible = true"><Icon name="plus" :size="16" /> 创建试用账号</button>
      </div>
    </div>

    <StateView :loading="loading" :error="loadError ? new Error(loadError) : null" :error-message="loadError" :empty="!loading && !accounts.length" @retry="load">
      <template #empty><p class="nw-state__title">暂无试用账号</p></template>

      <table class="nw-table">
        <thead>
          <tr><th>用户名</th><th>密码</th><th>积分</th><th>配额</th><th>过期时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="a in accounts" :key="a.userId">
            <td><strong>{{ a.username }}</strong></td>
            <td><code style="font-size:12px;color:var(--nw-text-muted)">{{ a.password }}</code></td>
            <td>{{ a.initialPoints.toLocaleString() }}</td>
            <td>{{ (a.trialQuotaChars / 10000).toFixed(0) }} 万字</td>
            <td class="user-date">{{ fmtDate(a.expiresAt) }}</td>
            <td>
              <div class="user-actions">
                <button class="chapter-action chapter-action--danger" title="删除" @click="remove(a)"><Icon name="close" :size="14" /></button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </StateView>

    <Modal v-model="createVisible" title="创建试用账号" width="480px">
      <div class="cover-form-grid">
        <div class="nw-field">
          <label class="nw-field-label">数量</label>
          <input v-model.number="createForm.count" type="number" min="1" max="50" class="nw-input" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">初始积分</label>
          <input v-model.number="createForm.initialPoints" type="number" min="0" class="nw-input" />
        </div>
      </div>
      <div class="cover-form-grid">
        <div class="nw-field">
          <label class="nw-field-label">试用字数</label>
          <input v-model.number="createForm.trialQuotaChars" type="number" min="0" step="10000" class="nw-input" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">过期时间</label>
          <input v-model="createForm.expiresAt" type="date" class="nw-input" />
        </div>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">统一密码（可选，留空随机）</label>
        <input v-model="createForm.password" type="text" class="nw-input" placeholder="留空则随机生成" />
      </div>
      <template #footer>
        <button class="desktop-btn" :disabled="creating" @click="createVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="creating" @click="doCreate">
          {{ creating ? '创建中…' : '创建' }}
        </button>
      </template>
    </Modal>
  </div>
</template>
