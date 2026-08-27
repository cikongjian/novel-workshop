<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Check, Delete, Edit, Plus, RefreshRight, Star } from '@element-plus/icons-vue';
import { useRoute, useRouter } from 'vue-router';
import { userApiApi, type TestUserApiProfileResult, type UserApiPolicy, type UserApiProfile } from '../api/user-api';
import { http, AI_TIMEOUT } from '../api/http';
import { MODEL_PROVIDER_OPTIONS } from '../components/dashboard/model-provider-options';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileWorkbenchDock from '../components/mobile-entry/MobileWorkbenchDock.vue';
import { usePullRefresh } from '../composables/usePullRefresh';
import { useThemeMode } from '../composables/useThemeMode';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const route = useRoute();

const currentScope = computed<'model' | 'image-generation'>(() =>
  (route.query.scope as string) === 'image-generation' ? 'image-generation' : 'model',
);

const providerOptions = computed(() => {
  if (currentScope.value === 'image-generation') {
    return [
      { value: 'openai', label: 'OpenAI', baseUrl: '', models: [
        { value: 'gpt-image-2', label: 'GPT-Image-2（最新旗舰）' },
        { value: 'gpt-image-1.5', label: 'GPT-Image-1.5' },
        { value: 'gpt-image-1', label: 'GPT-Image-1' },
        { value: 'gpt-image-1-mini', label: 'GPT-Image-1 Mini（快速）' },
        { value: 'dall-e-3', label: 'DALL-E 3（兼容）' },
      ]},
    ];
  }
  return MODEL_PROVIDER_OPTIONS.map((item) => ({
    value: item.value, label: item.label, models: item.models,
    baseUrl: 'baseUrl' in item ? (item as { baseUrl?: string }).baseUrl ?? '' : '',
  }));
});

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const listingModels = ref(false);
const modelList = ref<string[]>([]);
const modelListShown = ref(false);
const policy = ref<UserApiPolicy | null>(null);
const profiles = ref<UserApiProfile[]>([]);
const editingProfileId = ref('');
const showForm = ref(false);
const testResult = ref<TestUserApiProfileResult | null>(null);

const form = ref({
  name: '',
  provider: providerOptions.value[0]?.value ?? '',
  model: '',
  baseUrl: '',
  apiKey: '',
});

const selectedProvider = computed(() => providerOptions.value.find((item) => item.value === form.value.provider));
const canManage = computed(() => policy.value?.enabled && policy.value?.canManage);
const scopedProfiles = computed(() => profiles.value.filter((item) => item.scope === currentScope.value));
const activeProfiles = computed(() => scopedProfiles.value.filter((item) => item.enabled));
const defaultProfile = computed(() => scopedProfiles.value.find((item) => item.isDefault) ?? null);
const pageTitle = computed(() => currentScope.value === 'image-generation' ? '文生图 API' : '文字 API');

const canSubmit = computed(() => (
  form.value.provider.trim()
  && form.value.model.trim()
  && (form.value.apiKey.trim() || editingProfileId.value)
));

function resetForm() {
  editingProfileId.value = '';
  form.value = {
    name: currentScope.value === 'image-generation' ? '默认文生图模型' : '默认创作模型',
    provider: providerOptions.value[0]?.value ?? (currentScope.value === 'image-generation' ? 'openai' : 'deepseek'),
    model: currentScope.value === 'image-generation' ? 'gpt-image-2' : 'deepseek-v4-flash',
    baseUrl: providerOptions.value[0]?.baseUrl ?? '',
    apiKey: '',
  };
  testResult.value = null;
}

function fillFromProfile(profile: UserApiProfile) {
  editingProfileId.value = profile.id;
  form.value = {
    name: profile.name || (currentScope.value === 'image-generation' ? '默认文生图模型' : '默认创作模型'),
    provider: profile.provider,
    model: profile.model,
    baseUrl: profile.baseUrl || '',
    apiKey: '',
  };
  testResult.value = null;
  showForm.value = true;
}

function startAddNew() {
  resetForm();
  showForm.value = true;
}

function cancelForm() {
  showForm.value = false;
  modelList.value = [];
  modelListShown.value = false;
  resetForm();
}

watch(() => form.value.provider, (nextProvider, previousProvider) => {
  const next = providerOptions.value.find((item) => item.value === nextProvider);
  const previous = providerOptions.value.find((item) => item.value === previousProvider);
  if (!next) return;
  if (next.models.length > 0 && !next.models.some((model) => model.value === form.value.model)) {
    form.value.model = next.models[0]?.value ?? '';
  }
  if (!form.value.baseUrl || form.value.baseUrl === (previous?.baseUrl ?? '')) {
    form.value.baseUrl = next.baseUrl;
  }
  testResult.value = null;
});

watch(() => [form.value.model, form.value.baseUrl, form.value.apiKey], () => { testResult.value = null; modelListShown.value = false; });

async function loadData() {
  loading.value = true;
  try {
    policy.value = await userApiApi.getPolicy();
    if (!policy.value.enabled || !policy.value.canManage) {
      profiles.value = [];
      return;
    }
    profiles.value = await userApiApi.listProfiles();
  } catch {
    // ignore
  } finally {
    loading.value = false;
  }
}

async function testConnection() {
  const apiKey = form.value.apiKey.trim();
  if (!apiKey && !editingProfileId.value) { ElMessage.warning('请先填写 API Key'); return; }
  testing.value = true;
  try {
    testResult.value = editingProfileId.value && !apiKey
      ? await userApiApi.testProfile(editingProfileId.value)
      : await userApiApi.testDraftProfile({
        scope: currentScope.value,
        provider: form.value.provider.trim(),
        model: form.value.model.trim(),
        baseUrl: form.value.baseUrl.trim(),
        storageMode: 'server',
        apiKeys: [apiKey],
      });
    if (testResult.value.success) ElMessage.success('模型连接成功');
    else ElMessage.error(testResult.value.error || '模型连接失败');
  } catch (err: any) {
    testResult.value = { success: false, error: err?.message ?? '模型连接失败' };
    ElMessage.error(testResult.value.error);
  } finally { testing.value = false; }
}

async function listPersonalModels() {
  let apiKey = form.value.apiKey.trim();
  if (!apiKey && !editingProfileId.value) { ElMessage.warning('请先填写 API Key'); return; }
  // 编辑已有配置且未填写新 Key 时，从服务器读取已保存的密钥
  if (!apiKey && editingProfileId.value) {
    try {
      const secrets = await userApiApi.getProfileSecrets(editingProfileId.value);
      apiKey = secrets.apiKeys[0] ?? '';
    } catch {
      ElMessage.error('无法读取已保存的 API Key');
      return;
    }
  }
  if (!apiKey) { ElMessage.warning('请先填写 API Key'); return; }
  listingModels.value = true;
  modelList.value = [];
  try {
    const { data } = await http.post('/settings/list-models', {
      apiKey,
      baseUrl: form.value.baseUrl.trim(),
      provider: form.value.provider.trim(),
    }, { timeout: AI_TIMEOUT });
    if (data.success) {
      modelList.value = data.models;
      modelListShown.value = true;
      ElMessage.success(`拉取到 ${data.models.length} 个模型`);
    } else {
      ElMessage.error(data.error || '拉取失败');
    }
  } catch (err: any) {
    ElMessage.error(err?.message ?? '拉取失败');
  } finally {
    listingModels.value = false;
  }
}

async function saveProfile() {
  if (!canSubmit.value) { ElMessage.warning(editingProfileId.value ? '请填写模型信息' : '请填写 API Key 和模型信息'); return; }
  saving.value = true;
  try {
    const apiKey = form.value.apiKey.trim();
    const payload = {
      scope: currentScope.value,
      name: form.value.name.trim() || (currentScope.value === 'image-generation' ? '默认文生图模型' : '默认创作模型'),
      provider: form.value.provider.trim(),
      model: form.value.model.trim(),
      baseUrl: form.value.baseUrl.trim(),
      storageMode: 'server' as const,
      apiKeys: apiKey ? [apiKey] : undefined,
      isDefault: editingProfileId.value
        ? (scopedProfiles.value.find(p => p.id === editingProfileId.value)?.isDefault ?? false)
        : true,
      enabled: true,
    };
    const saved = editingProfileId.value
      ? await userApiApi.updateProfile(editingProfileId.value, payload)
      : await userApiApi.createProfile(payload);
    ElMessage.success(editingProfileId.value ? '配置已更新' : '新配置已创建');
    await loadData();
    // 保留编辑状态以便继续修改
    editingProfileId.value = saved.id;
    form.value.apiKey = '';
  } catch (err: any) {
    ElMessage.error(err?.message ?? '保存失败');
  } finally { saving.value = false; }
}

async function setDefault(profile: UserApiProfile) {
  try {
    await userApiApi.updateProfile(profile.id, { isDefault: true } as any);
    ElMessage.success(`已将「${profile.name}」设为默认`);
    await loadData();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '操作失败');
  }
}

async function deleteProfile(profile: UserApiProfile) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${profile.name}」（${profile.model}）？已保存的密钥将被移除。`,
      '删除 API 配置',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  try {
    await userApiApi.deleteProfile(profile.id);
    ElMessage.success('已删除');
    if (editingProfileId.value === profile.id) cancelForm();
    await loadData();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '删除失败');
  }
}

function goBack() { void router.push('/m/me'); }

onMounted(() => { void loadData(); });

const { pullDistance, refreshing, triggered, pullContainerRef } = usePullRefresh({ onRefresh: () => loadData() });
</script>

<template>
  <div ref="pullContainerRef" class="mobile-api-settings-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-pull-indicator"
      :class="{ 'mobile-focus-pull-indicator--visible': pullDistance > 0, 'mobile-focus-pull-indicator--triggered': triggered, 'mobile-focus-pull-indicator--refreshing': refreshing }"
      :style="{ '--pull-offset': pullDistance > 0 || refreshing ? '0px' : '-60px' }">
      <span v-if="refreshing" class="mobile-focus-pull-spinner" />
      <span v-else class="mobile-focus-pull-arrow">↓</span>
      <span>{{ refreshing ? '刷新中...' : triggered ? '松手刷新' : '下拉刷新' }}</span>
    </div>

    <div class="mobile-focus-shell">
      <MobileTopbar :title="pageTitle" :subtitle="currentScope === 'image-generation' ? '封面生成模型' : '自填 Key 创作'">
        <template #leading>
          <button class="mobile-focus-button--secondary" type="button" @click="goBack">
            <el-icon :size="14"><ArrowLeft /></el-icon>返回
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-focus-main mobile-api-settings-main">
        <MobileSectionCard kicker="BYOK" hero class="mobile-api-settings-hero">
          <div class="mobile-api-settings-hero-body">
            <h1 v-if="currentScope === 'image-generation'">文生图模型</h1>
            <h1 v-else>自有模型</h1>
            <div class="mobile-api-settings-hero-stats">
              <span>{{ scopedProfiles.length }} 个配置</span>
              <span v-if="defaultProfile">默认 {{ defaultProfile.model }}</span>
            </div>
          </div>
        </MobileSectionCard>

        <!-- 无权限 -->
        <MobileSectionCard v-if="!canManage && !loading" kicker="Unavailable" title="暂不可配置">
          <div class="mobile-focus-empty">
            <strong v-if="!policy?.enabled">管理员未开启自定义 API 功能</strong>
            <strong v-else>当前账号暂不能管理模型 API</strong>
            <p v-if="!policy?.enabled">请联系管理员开启 USER_API_FEATURE_ENABLED 功能开关。</p>
            <p v-else>请确认已登录，并具备创作者权限。</p>
          </div>
        </MobileSectionCard>

        <template v-else>
          <!-- 加载中 -->
          <div v-if="loading" class="mobile-focus-loading"><el-skeleton animated :rows="5" /></div>

          <template v-else>
            <!-- 配置列表 -->
            <MobileSectionCard v-if="!showForm" :title="currentScope === 'image-generation' ? '文生图配置' : '创作模型配置'" kicker="Profiles">
              <div v-if="scopedProfiles.length === 0" class="mobile-focus-empty">
                <p>还没有保存任何模型 API 配置，点击下方按钮添加。</p>
              </div>
              <div v-else class="mobile-api-settings-list">
                <div v-for="profile in scopedProfiles" :key="profile.id" class="mobile-api-settings-list-item" :class="{ 'mobile-api-settings-list-item--default': profile.isDefault }">
                  <div class="mobile-api-settings-list-body">
                    <div class="mobile-api-settings-list-header">
                      <strong>{{ profile.name }}</strong>
                      <span v-if="profile.isDefault" class="mobile-api-settings-list-badge">默认</span>
                    </div>
                    <div class="mobile-api-settings-list-meta">
                      <span>{{ profile.provider }}</span>
                      <span>·</span>
                      <span>{{ profile.model }}</span>
                    </div>
                    <div class="mobile-api-settings-list-key">{{ profile.maskedApiKey || '已保存密钥' }}</div>
                  </div>
                  <div class="mobile-api-settings-list-actions">
                    <button v-if="!profile.isDefault" class="mobile-focus-button--ghost" type="button" title="设为默认" @click="setDefault(profile)">
                      <el-icon :size="14"><Star /></el-icon>
                    </button>
                    <button class="mobile-focus-button--ghost" type="button" title="编辑" @click="fillFromProfile(profile)">
                      <el-icon :size="14"><Edit /></el-icon>
                    </button>
                    <button class="mobile-focus-button--ghost mobile-focus-button--danger" type="button" title="删除" @click="deleteProfile(profile)">
                      <el-icon :size="14"><Delete /></el-icon>
                    </button>
                  </div>
                </div>
              </div>
              <div class="mobile-api-settings-add-bar">
                <button class="mobile-focus-button--primary" type="button" @click="startAddNew">
                  <el-icon :size="14"><Plus /></el-icon>添加新配置
                </button>
              </div>
            </MobileSectionCard>

            <!-- 编辑表单 -->
            <MobileSectionCard v-else :title="editingProfileId ? '编辑配置' : '新建配置'" kicker="Edit">
              <div class="mobile-api-settings-form">
                <label class="mobile-api-settings-field">
                  <span>配置名称</span>
                  <input v-model="form.name" class="mobile-focus-input" type="text" placeholder="默认创作模型" />
                </label>
                <label class="mobile-api-settings-field">
                  <span>供应商</span>
                  <select v-model="form.provider" class="mobile-focus-input">
                    <option v-for="item in providerOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                </label>
                <label class="mobile-api-settings-field">
                  <span>模型名</span>
                  <input v-model="form.model" class="mobile-focus-input" list="mobile-api-model-options" placeholder="例如 deepseek-chat" />
                  <datalist id="mobile-api-model-options">
                    <option v-for="model in selectedProvider?.models ?? []" :key="model.value" :value="model.value">{{ model.label }}</option>
                  </datalist>
                </label>
                <label class="mobile-api-settings-field">
                  <span>Base URL</span>
                  <input v-model="form.baseUrl" class="mobile-focus-input" type="text" :placeholder="form.provider === 'custom-openai' ? '如 https://api.example.com/v1' : '留空使用供应商默认地址'" />
                  <small v-if="form.provider === 'custom-openai'" class="mobile-api-settings-field-hint">请填写包含 /v1 路径的完整地址（系统会自动补全 /v1）</small>
                </label>
                <label class="mobile-api-settings-field">
                  <span>API Key</span>
                  <input v-model="form.apiKey" class="mobile-focus-input" type="password" autocomplete="off" :placeholder="editingProfileId ? '不修改可留空' : '粘贴你的模型 API Key'" />
                </label>

                <div v-if="testResult" class="mobile-api-settings-result" :class="{ success: testResult.success }">
                  <strong>{{ testResult.success ? '连接成功' : '连接失败' }}</strong>
                  <p>{{ testResult.success ? (testResult.reply || '模型已响应测试请求。') : testResult.error }}</p>
                  <p v-if="testResult.elapsed != null">耗时 {{ testResult.elapsed }}ms</p>
                  <img v-if="testResult.success && testResult.imageUrl" :src="testResult.imageUrl" alt="测试生成图片" class="mobile-api-settings-test-image" />
                </div>

                <!-- 拉取到的模型列表 -->
                <div v-if="modelListShown && modelList.length" class="mobile-api-settings-model-list">
                  <p class="mobile-api-settings-model-list-title">服务商可用模型 ({{ modelList.length }}) — 点击填入</p>
                  <div class="mobile-api-settings-model-list-items">
                    <span v-for="m in modelList" :key="m" class="mobile-api-settings-model-tag" @click="form.model = m">{{ m }}</span>
                  </div>
                </div>

                <div class="mobile-api-settings-actions">
                  <button class="mobile-focus-button--secondary" type="button" @click="cancelForm">取消</button>
                  <button class="mobile-focus-button--secondary" type="button" :disabled="listingModels" @click="listPersonalModels">
                    <el-icon :size="14"><RefreshRight /></el-icon>{{ listingModels ? '拉取中...' : '拉取模型列表' }}
                  </button>
                  <button class="mobile-focus-button--secondary" type="button" :disabled="testing" @click="testConnection">
                    <el-icon :size="14"><RefreshRight /></el-icon>{{ testing ? '测试中...' : '测试连接' }}
                  </button>
                  <button class="mobile-focus-button--primary" type="button" :disabled="saving || !canSubmit" @click="saveProfile">
                    <el-icon :size="14"><Check /></el-icon>{{ saving ? '保存中...' : '保存' }}
                  </button>
                </div>
              </div>
            </MobileSectionCard>
          </template>
        </template>
      </main>
    </div>
    <MobileWorkbenchDock />
  </div>
</template>

<style scoped>
.mobile-api-settings-page {
  --mobile-focus-accent: var(--star-brand-sky);
  --mobile-focus-accent-strong: var(--star-brand-teal);
  --mobile-focus-tint: rgba(3, 105, 161, 0.14);
}
.mobile-api-settings-hero {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--mobile-focus-accent) 12%, transparent), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--nw-bg-card) 96%, var(--nw-bg-secondary)), var(--nw-bg-card));
}
.mobile-api-settings-hero-body {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.mobile-api-settings-hero-body h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  flex-shrink: 0;
}
.mobile-api-settings-hero-stats {
  display: flex;
  gap: 10px;
  font-size: 13px;
  color: var(--nw-text-muted);
  white-space: nowrap;
}
.mobile-api-settings-form {
  display: grid;
  gap: 13px;
}
.mobile-api-settings-field {
  display: grid;
  gap: 7px;
}
.mobile-api-settings-field-hint {
  color: var(--nw-text-muted);
  font-size: 11px;
  margin-top: -2px;
}
.mobile-api-settings-field span {
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.mobile-api-settings-result {
  display: grid;
  gap: 4px;
  padding: 13px 14px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--nw-danger) 22%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-danger) 8%, var(--nw-bg-card));
}
.mobile-api-settings-result.success {
  border-color: color-mix(in srgb, var(--nw-success) 22%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-success) 8%, var(--nw-bg-card));
}
.mobile-api-settings-result p { color: var(--nw-text-secondary); font-size: 12px; }
.mobile-api-settings-result strong { color: var(--nw-text-primary); font-size: 14px; }

/* 拉取模型列表 */
.mobile-api-settings-model-list { margin-top: 12px; padding: 10px; border: 1px solid var(--nw-border); border-radius: 10px; background: color-mix(in srgb, var(--nw-bg-card) 88%, transparent); }
.mobile-api-settings-model-list-title { margin: 0 0 8px; font-size: 12px; color: var(--nw-text-muted); font-weight: 600; }
.mobile-api-settings-model-list-items { display: flex; flex-wrap: wrap; gap: 6px; max-height: 200px; overflow-y: auto; }
.mobile-api-settings-model-tag { display: inline-block; padding: 3px 10px; border: 1px solid var(--nw-border); border-radius: 999px; font-size: 11px; color: var(--nw-text-secondary); background: var(--mobile-focus-surface-muted); cursor: pointer; white-space: nowrap; }
.mobile-api-settings-model-tag:hover { border-color: var(--mobile-focus-accent); color: var(--mobile-focus-accent); background: color-mix(in srgb, var(--mobile-focus-accent) 8%, var(--nw-bg-secondary)); }

/* 配置列表 */
.mobile-api-settings-list {
  display: grid;
  gap: 10px;
}
.mobile-api-settings-list-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 12%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-bg-card) 92%, var(--nw-bg-secondary));
}
.mobile-api-settings-list-item--default {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 28%, var(--nw-border));
  background: color-mix(in srgb, var(--mobile-focus-accent) 8%, var(--nw-bg-card));
}
.mobile-api-settings-list-body {
  min-width: 0;
  flex: 1;
}
.mobile-api-settings-list-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mobile-api-settings-list-header strong {
  font-size: 14px;
  color: var(--nw-text-primary);
}
.mobile-api-settings-list-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 14%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
}
.mobile-api-settings-list-meta {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--nw-text-secondary);
}
.mobile-api-settings-list-key {
  margin-top: 4px;
  font-size: 11px;
  color: var(--nw-text-muted);
  font-family: monospace;
}
.mobile-api-settings-list-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  align-items: center;
}
.mobile-focus-button--ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--nw-text-muted);
  cursor: pointer;
  transition: background 0.15s;
}
.mobile-focus-button--ghost:hover { background: var(--nw-bg-hover); color: var(--mobile-focus-accent); }
.mobile-focus-button--danger:hover { color: var(--nw-danger); }

.mobile-api-settings-add-bar {
  margin-top: 12px;
}
.mobile-api-settings-add-bar button {
  width: 100%;
  justify-content: center;
}

.mobile-api-settings-actions {
  display: grid;
  grid-template-columns: minmax(0, 0.7fr) minmax(0, 0.9fr) minmax(0, 1fr);
  gap: 9px;
}
@media (max-width: 380px) {
  .mobile-api-settings-actions { grid-template-columns: minmax(0, 1fr); }
}
.mobile-api-settings-test-image {
  display: block;
  max-width: 100%;
  border-radius: 12px;
  margin-top: 8px;
  border: 1px solid var(--nw-border);
}
</style>
