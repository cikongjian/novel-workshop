<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowLeft, Lock, Setting, FolderDelete,
  User, PictureFilled, Sunny, Moon, Reading, Promotion, Star,
  Plus, Edit, Delete, Check, RefreshRight,
} from '@element-plus/icons-vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import { useAuthStore } from '../stores/auth';
import { useThemeMode, type ThemeMode } from '../composables/useThemeMode';
import { usePasswordPolicy } from '../composables/usePasswordPolicy';
import { useOfflineChapterCache } from '../composables/useOfflineStorage';
import { userApiApi, type TestUserApiProfileResult, type UserApiPolicy, type UserApiProfile } from '../api/user-api';
import { clearTTSCache, getTTSCacheByNovel, type NovelCacheInfo } from '../utils/tts-audio-cache';
import { useRouter } from 'vue-router';
import { validatePasswordAgainstPolicy } from '../utils/password-policy';
import { MODEL_PROVIDER_OPTIONS } from '../components/dashboard/model-provider-options';
import { http, AI_TIMEOUT } from '../api/http';
import { brand } from '../config/brand';

const router = useRouter();
const authStore = useAuthStore();
const { mode: themeMode, isDark: isDarkTheme, isWarmNight, setMode: setThemeMode } = useThemeMode();
const { passwordPolicy, passwordPolicyHint, loadPasswordPolicy } = usePasswordPolicy();

const modelScopeBySheet = {
  'text-model': 'model',
  'image-model': 'image-generation',
} as const;

type ModelScope = typeof modelScopeBySheet[keyof typeof modelScopeBySheet];

function hasConfiguredProfile(profile: UserApiProfile) {
  return profile.enabled && (profile.apiKeyCount > 0 || Boolean(profile.maskedApiKey));
}

async function refreshModelStatus() {
  try {
    const profiles = await userApiApi.listProfiles();
    userTextModelConfigured.value = profiles.some((profile) => profile.scope === 'model' && hasConfiguredProfile(profile));
    userImageModelConfigured.value = profiles.some((profile) => profile.scope === 'image-generation' && hasConfiguredProfile(profile));
  } catch { /* ignore */ }
}

const activeSheet = ref('');
function openSheet(key: string) {
  activeSheet.value = key;
  if (key === 'cache') void loadCacheData();
  if (key === 'account') void loadPasswordPolicy();
  if (key === 'text-model' || key === 'image-model') {
    currentModelScope.value = modelScopeBySheet[key];
    void loadModelData();
  }
}
function closeSheet() { activeSheet.value = ''; }

const friendlyLinks = ref<{ name: string; url: string }[]>([]);
const appVersion = ref('');

onMounted(async () => {
  try {
    const settings = await import('../api/settings').then((m) => m.fetchPublicSettings());
    friendlyLinks.value = settings.friendlyLinksEnabled
      ? (settings.friendlyLinks ?? []).filter((l: any) => l.enabled).map((l: any) => ({ name: l.name, url: l.url }))
      : [];
  } catch { /* ignore */ }

  // 版本号由 vite define 注入，避免把整个 package.json 打进前端产物
  appVersion.value = __APP_VERSION__;

  void refreshModelStatus();
});

const userTextModelConfigured = ref(false);
const userImageModelConfigured = ref(false);

const currentThemeLabel = computed(() => {
  if (themeMode.value === 'light') return '浅色模式';
  if (themeMode.value === 'dark') return '深色模式';
  return '暖夜模式';
});

const themeOptions: { value: ThemeMode; label: string; icon: any; desc: string }[] = [
  { value: 'light', label: '浅色模式', icon: Sunny, desc: '明亮清爽' },
  { value: 'dark', label: '深色模式', icon: Moon, desc: '护眼省电' },
  { value: 'warm-night', label: '暖夜模式', icon: Reading, desc: '暖色护眼' },
];

const offlineCache = useOfflineChapterCache();
const cachedNovels = ref<{ novelId: string; novelTitle: string; chapterCount: number; lastCachedAt: number }[]>([]);
const cacheLoading = ref(false);
const cacheClearing = ref(false);
const ttsNovelCaches = ref<NovelCacheInfo[]>([]);
const ttsCacheLoading = ref(false);
const ttsCacheClearing = ref(false);

async function loadCacheData() {
  cacheLoading.value = true;
  ttsCacheLoading.value = true;
  try {
    cachedNovels.value = await offlineCache.getCachedNovels();
  } catch { /* ignore */ }
  try {
    ttsNovelCaches.value = await getTTSCacheByNovel();
  } catch { /* ignore */ }
  finally {
    cacheLoading.value = false;
    ttsCacheLoading.value = false;
  }
}

async function clearAllOfflineCache() {
  cacheClearing.value = true;
  try { await offlineCache.clearAll(); cachedNovels.value = []; ElMessage.success('离线缓存已清除'); }
  catch { ElMessage.error('清除失败'); }
  finally { cacheClearing.value = false; }
}

async function clearAllTtsCache() {
  ttsCacheClearing.value = true;
  try { await clearTTSCache(); ttsNovelCaches.value = []; ElMessage.success('听书缓存已清除'); }
  catch { ElMessage.error('清除失败'); }
  finally { ttsCacheClearing.value = false; }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const passwordSaving = ref(false);
const showPasswordForm = ref(false);
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' });

async function savePassword() {
  if (!passwordForm.value.oldPassword) { ElMessage.warning('请输入旧密码'); return; }
  if (!passwordForm.value.newPassword) { ElMessage.warning('请输入新密码'); return; }
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致');
    return;
  }
  const policyResult = validatePasswordAgainstPolicy(passwordForm.value.newPassword, passwordPolicy.value);
  if (!policyResult.valid) {
    ElMessage.warning(policyResult.hint || '密码不符合规则');
    return;
  }
  passwordSaving.value = true;
  try {
    const { authApi } = await import('../api/auth');
    await authApi.changePassword(passwordForm.value.oldPassword, passwordForm.value.newPassword);
    ElMessage.success('密码修改成功');
    passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' };
    showPasswordForm.value = false;
  } catch (err) {
    const { extractApiErrorMessage } = await import('../utils/api-error');
    ElMessage.error(extractApiErrorMessage(err, '修改失败'));
  } finally { passwordSaving.value = false; }
}

const currentUserName = computed(() => authStore.user?.penName || authStore.user?.username || '用户');
const userRoleLabel = computed(() => {
  const role = authStore.user?.role;
  if (role === 'admin') return '管理员';
  if (authStore.isCreator) return '创作者';
  return '普通用户';
});
const userIdShort = computed(() => {
  const id = authStore.user?.id;
  if (!id) return '--';
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
});

// ========== 模型配置逻辑 ==========
const currentModelScope = ref<ModelScope>('model');

const modelProviderOptions = computed(() => {
  if (currentModelScope.value === 'image-generation') {
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

const modelLoading = ref(false);
const modelSaving = ref(false);
const modelTesting = ref(false);
const modelListing = ref(false);
const modelList = ref<string[]>([]);
const modelListShown = ref(false);
const modelPolicy = ref<UserApiPolicy | null>(null);
const modelProfiles = ref<UserApiProfile[]>([]);
const modelEditingId = ref('');
const modelShowForm = ref(false);
const modelTestResult = ref<TestUserApiProfileResult | null>(null);

const modelForm = ref({
  name: '',
  provider: '',
  model: '',
  baseUrl: '',
  apiKey: '',
});

const selectedModelProvider = computed(() => modelProviderOptions.value.find((item) => item.value === modelForm.value.provider));
const canManageModel = computed(() => modelPolicy.value?.enabled && modelPolicy.value?.canManage);
const scopedModelProfiles = computed(() => modelProfiles.value.filter((item) => item.scope === currentModelScope.value));
const defaultModelProfile = computed(() => scopedModelProfiles.value.find((item) => item.isDefault) ?? null);
const modelSheetTitle = computed(() => currentModelScope.value === 'image-generation' ? '文生图模型' : '文字模型');

const canSubmitModel = computed(() => (
  modelForm.value.provider.trim()
  && modelForm.value.model.trim()
  && (modelForm.value.apiKey.trim() || modelEditingId.value)
));

function resetModelForm() {
  modelEditingId.value = '';
  modelForm.value = {
    name: currentModelScope.value === 'image-generation' ? '默认文生图模型' : '默认创作模型',
    provider: modelProviderOptions.value[0]?.value ?? (currentModelScope.value === 'image-generation' ? 'openai' : 'deepseek'),
    model: currentModelScope.value === 'image-generation' ? 'gpt-image-2' : 'deepseek-v4-flash',
    baseUrl: modelProviderOptions.value[0]?.baseUrl ?? '',
    apiKey: '',
  };
  modelTestResult.value = null;
  modelList.value = [];
  modelListShown.value = false;
}

function fillModelFromProfile(profile: UserApiProfile) {
  modelEditingId.value = profile.id;
  modelForm.value = {
    name: profile.name || (currentModelScope.value === 'image-generation' ? '默认文生图模型' : '默认创作模型'),
    provider: profile.provider,
    model: profile.model,
    baseUrl: profile.baseUrl || '',
    apiKey: '',
  };
  modelTestResult.value = null;
  modelShowForm.value = true;
}

function startAddModel() {
  resetModelForm();
  modelShowForm.value = true;
}

function cancelModelForm() {
  modelShowForm.value = false;
  modelList.value = [];
  modelListShown.value = false;
  resetModelForm();
}

watch(() => modelForm.value.provider, (nextProvider, previousProvider) => {
  const next = modelProviderOptions.value.find((item) => item.value === nextProvider);
  const previous = modelProviderOptions.value.find((item) => item.value === previousProvider);
  if (!next) return;
  if (next.models.length > 0 && !next.models.some((model) => model.value === modelForm.value.model)) {
    modelForm.value.model = next.models[0]?.value ?? '';
  }
  if (!modelForm.value.baseUrl || modelForm.value.baseUrl === (previous?.baseUrl ?? '')) {
    modelForm.value.baseUrl = next.baseUrl;
  }
  modelTestResult.value = null;
});

watch(() => [modelForm.value.model, modelForm.value.baseUrl, modelForm.value.apiKey], () => {
  modelTestResult.value = null;
  modelListShown.value = false;
});

async function loadModelData() {
  modelLoading.value = true;
  modelShowForm.value = false;
  try {
    modelPolicy.value = await userApiApi.getPolicy();
    if (!modelPolicy.value.enabled || !modelPolicy.value.canManage) {
      modelProfiles.value = [];
      return;
    }
    modelProfiles.value = await userApiApi.listProfiles();
  } catch {
    // ignore
  } finally {
    modelLoading.value = false;
  }
}

async function testModelConnection() {
  const apiKey = modelForm.value.apiKey.trim();
  if (!apiKey && !modelEditingId.value) { ElMessage.warning('请先填写 API Key'); return; }
  modelTesting.value = true;
  try {
    modelTestResult.value = modelEditingId.value && !apiKey
      ? await userApiApi.testProfile(modelEditingId.value)
      : await userApiApi.testDraftProfile({
        scope: currentModelScope.value,
        provider: modelForm.value.provider.trim(),
        model: modelForm.value.model.trim(),
        baseUrl: modelForm.value.baseUrl.trim(),
        storageMode: 'server',
        apiKeys: [apiKey],
      });
    if (modelTestResult.value.success) ElMessage.success('模型连接成功');
    else ElMessage.error(modelTestResult.value.error || '模型连接失败');
  } catch (err: any) {
    modelTestResult.value = { success: false, error: err?.message ?? '模型连接失败' };
    ElMessage.error(modelTestResult.value.error);
  } finally { modelTesting.value = false; }
}

async function listModelPersonalModels() {
  let apiKey = modelForm.value.apiKey.trim();
  if (!apiKey && !modelEditingId.value) { ElMessage.warning('请先填写 API Key'); return; }
  // 编辑已有配置且未填写新 Key 时，从服务器读取已保存的密钥
  if (!apiKey && modelEditingId.value) {
    try {
      const secrets = await userApiApi.getProfileSecrets(modelEditingId.value);
      apiKey = secrets.apiKeys[0] ?? '';
    } catch {
      ElMessage.error('无法读取已保存的 API Key');
      return;
    }
  }
  if (!apiKey) { ElMessage.warning('请先填写 API Key'); return; }
  modelListing.value = true;
  modelList.value = [];
  try {
    const { data } = await http.post('/settings/list-models', {
      apiKey,
      baseUrl: modelForm.value.baseUrl.trim(),
      provider: modelForm.value.provider.trim(),
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
    modelListing.value = false;
  }
}

async function saveModelProfile() {
  if (!canSubmitModel.value) { ElMessage.warning(modelEditingId.value ? '请填写模型信息' : '请填写 API Key 和模型信息'); return; }
  modelSaving.value = true;
  try {
    const apiKey = modelForm.value.apiKey.trim();
    const payload = {
      scope: currentModelScope.value,
      name: modelForm.value.name.trim() || (currentModelScope.value === 'image-generation' ? '默认文生图模型' : '默认创作模型'),
      provider: modelForm.value.provider.trim(),
      model: modelForm.value.model.trim(),
      baseUrl: modelForm.value.baseUrl.trim(),
      storageMode: 'server' as const,
      apiKeys: apiKey ? [apiKey] : undefined,
      isDefault: modelEditingId.value
        ? (scopedModelProfiles.value.find(p => p.id === modelEditingId.value)?.isDefault ?? false)
        : true,
      enabled: true,
    };
    const saved = modelEditingId.value
      ? await userApiApi.updateProfile(modelEditingId.value, payload)
      : await userApiApi.createProfile(payload);
    ElMessage.success(modelEditingId.value ? '配置已更新' : '新配置已创建');
    await loadModelData();
    modelEditingId.value = saved.id;
    modelForm.value.apiKey = '';
    await refreshModelStatus();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '保存失败');
  } finally { modelSaving.value = false; }
}

async function setDefaultModel(profile: UserApiProfile) {
  try {
    await userApiApi.updateProfile(profile.id, { isDefault: true } as any);
    ElMessage.success(`已将「${profile.name}」设为默认`);
    await loadModelData();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '操作失败');
  }
}

async function deleteModelProfile(profile: UserApiProfile) {
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
    if (modelEditingId.value === profile.id) cancelModelForm();
    await loadModelData();
    await refreshModelStatus();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '删除失败');
  }
}

function goBack() { router.back(); }
</script>

<template>
  <div class="mobile-settings-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell mobile-settings-shell">
      <MobileTopbar title="设置与偏好" subtitle="账号、外观与缓存">
        <template #actions>
          <button class="mobile-focus-button--ghost" type="button" @click="goBack">
            <el-icon :size="14"><ArrowLeft /></el-icon>
            返回
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-focus-main mobile-settings-main">
        <div class="mobile-settings-card">
          <div class="mobile-settings-card__kicker">ACCOUNT</div>
          <div class="mobile-settings-profile">
            <span class="mobile-settings-profile__avatar"><el-icon :size="20"><User /></el-icon></span>
            <div class="mobile-settings-profile__info">
              <div class="mobile-settings-profile__name">{{ currentUserName }}</div>
              <div class="mobile-settings-profile__role">{{ userRoleLabel }} · {{ userIdShort }}</div>
            </div>
          </div>
        </div>

        <div class="mobile-settings-card">
          <div class="mobile-settings-card__kicker">PREFERENCES</div>
          <button class="mobile-settings-row" type="button" @click="openSheet('theme')">
            <span class="mobile-settings-row__icon"><el-icon :size="16"><Setting /></el-icon></span>
            <div class="mobile-settings-row__content">
              <div class="mobile-settings-row__label">主题外观</div>
              <div class="mobile-settings-row__value">{{ currentThemeLabel }}</div>
            </div>
            <span class="mobile-settings-row__arrow">›</span>
          </button>
        </div>

        <div class="mobile-settings-card">
          <div class="mobile-settings-card__kicker">CUSTOM MODEL</div>
          <button class="mobile-settings-row" type="button" @click="openSheet('text-model')">
            <span class="mobile-settings-row__icon"><el-icon :size="16"><Star /></el-icon></span>
            <div class="mobile-settings-row__content">
              <div class="mobile-settings-row__label">文字模型</div>
              <div class="mobile-settings-row__value">{{ userTextModelConfigured ? '已配置' : '未配置' }}</div>
            </div>
            <span class="mobile-settings-row__arrow">›</span>
          </button>
          <button class="mobile-settings-row" type="button" @click="openSheet('image-model')">
            <span class="mobile-settings-row__icon"><el-icon :size="16"><PictureFilled /></el-icon></span>
            <div class="mobile-settings-row__content">
              <div class="mobile-settings-row__label">文生图模型</div>
              <div class="mobile-settings-row__value">{{ userImageModelConfigured ? '已配置' : '未配置' }}</div>
            </div>
            <span class="mobile-settings-row__arrow">›</span>
          </button>
        </div>

        <div class="mobile-settings-card">
          <div class="mobile-settings-card__kicker">STORAGE</div>
          <button class="mobile-settings-row" type="button" @click="openSheet('cache')">
            <span class="mobile-settings-row__icon"><el-icon :size="16"><FolderDelete /></el-icon></span>
            <div class="mobile-settings-row__content">
              <div class="mobile-settings-row__label">缓存管理</div>
              <div class="mobile-settings-row__value">离线章节 + 听书音频</div>
            </div>
            <span class="mobile-settings-row__arrow">›</span>
          </button>
        </div>

        <div class="mobile-settings-card">
          <div class="mobile-settings-card__kicker">SECURITY</div>
          <button class="mobile-settings-row" type="button" @click="openSheet('account')">
            <span class="mobile-settings-row__icon"><el-icon :size="16"><Lock /></el-icon></span>
            <div class="mobile-settings-row__content">
              <div class="mobile-settings-row__label">账户安全</div>
              <div class="mobile-settings-row__value">修改密码</div>
            </div>
            <span class="mobile-settings-row__arrow">›</span>
          </button>
        </div>

        <div v-if="friendlyLinks.length > 0" class="mobile-settings-card">
          <div class="mobile-settings-card__kicker">ABOUT</div>
          <button class="mobile-settings-row" type="button" @click="openSheet('about')">
            <span class="mobile-settings-row__icon"><el-icon :size="16"><Promotion /></el-icon></span>
            <div class="mobile-settings-row__content">
              <div class="mobile-settings-row__label">关于</div>
              <div class="mobile-settings-row__value">v{{ appVersion }} · 友情链接</div>
            </div>
            <span class="mobile-settings-row__arrow">›</span>
          </button>
        </div>
      </main>
    </div>

    <div
        v-if="activeSheet"
        class="mobile-settings-overlay"
        :class="isDarkTheme ? 'mobile-focus-dark-vars' : 'mobile-focus-light-vars'"
        @click.self="closeSheet"
      >
        <div class="mobile-settings-sheet">
          <div class="mobile-settings-sheet__head">
            <span class="mobile-settings-sheet__title">
              {{ activeSheet === 'theme' ? '主题外观'
                : activeSheet === 'cache' ? '缓存管理'
                : activeSheet === 'account' ? '账户安全'
                : activeSheet === 'text-model' || activeSheet === 'image-model' ? modelSheetTitle
                : '关于' }}
            </span>
            <button class="mobile-settings-sheet__close" @click="closeSheet">取消</button>
          </div>
          <div class="mobile-settings-sheet__body">

            <template v-if="activeSheet === 'theme'">
              <div class="mobile-settings-theme-list">
                <button
                  v-for="opt in themeOptions"
                  :key="opt.value"
                  :class="['mobile-settings-theme-item', { active: themeMode === opt.value }]"
                  type="button"
                  @click="setThemeMode(opt.value); closeSheet();"
                >
                  <span class="mobile-settings-theme-item__icon"><el-icon :size="20"><component :is="opt.icon" /></el-icon></span>
                  <div class="mobile-settings-theme-item__info">
                    <div class="mobile-settings-theme-item__label">{{ opt.label }}</div>
                    <div class="mobile-settings-theme-item__desc">{{ opt.desc }}</div>
                  </div>
                  <span v-if="themeMode === opt.value" class="mobile-settings-theme-item__check">✓</span>
                </button>
              </div>
            </template>

            <template v-if="activeSheet === 'cache'">
              <div v-if="cacheLoading || ttsCacheLoading" class="mobile-focus-loading" style="padding:12px 0">
                <el-skeleton animated :rows="2" />
              </div>
              <template v-else>
                <div class="mobile-settings-cache-block">
                  <div class="mobile-settings-cache-header">
                    <div class="mobile-settings-cache-info">
                      <div class="mobile-settings-cache-label">离线章节缓存</div>
                      <div class="mobile-settings-cache-desc">{{ cachedNovels.length }} 部作品</div>
                    </div>
                    <button
                      class="mobile-focus-button--ghost mobile-settings-cache-btn"
                      :disabled="cacheClearing || cachedNovels.length === 0"
                      type="button"
                      @click="clearAllOfflineCache"
                    >
                      {{ cacheClearing ? '清除中...' : '清除' }}
                    </button>
                  </div>
                </div>

                <div class="mobile-settings-cache-block">
                  <div class="mobile-settings-cache-header">
                    <div class="mobile-settings-cache-info">
                      <div class="mobile-settings-cache-label">听书音频缓存</div>
                      <div class="mobile-settings-cache-desc">{{ ttsNovelCaches.length }} 部作品 · {{ formatBytes(ttsNovelCaches.reduce((sum, n) => sum + n.sizeBytes, 0)) }}</div>
                    </div>
                    <button
                      class="mobile-focus-button--ghost mobile-settings-cache-btn"
                      :disabled="ttsCacheClearing || ttsNovelCaches.length === 0"
                      type="button"
                      @click="clearAllTtsCache"
                    >
                      {{ ttsCacheClearing ? '清除中...' : '清除' }}
                    </button>
                  </div>
                </div>
              </template>
            </template>

            <template v-if="activeSheet === 'account'">
              <div v-if="!showPasswordForm" class="mobile-settings-row" @click="showPasswordForm = true">
                <span class="mobile-settings-row__icon"><el-icon :size="16"><Lock /></el-icon></span>
                <div class="mobile-settings-row__content">
                  <div class="mobile-settings-row__label">修改密码</div>
                  <div class="mobile-settings-row__value">定期更换更安全</div>
                </div>
                <span class="mobile-settings-row__arrow">›</span>
              </div>

              <div v-else class="mobile-settings-password-form">
                <p class="mobile-focus-note">{{ passwordPolicyHint || '请输入旧密码并设置新密码' }}</p>
                <div class="mobile-settings-field">
                  <label>旧密码</label>
                  <input v-model="passwordForm.oldPassword" type="password" class="mobile-settings-input" />
                </div>
                <div class="mobile-settings-field">
                  <label>新密码</label>
                  <input v-model="passwordForm.newPassword" type="password" class="mobile-settings-input" />
                </div>
                <div class="mobile-settings-field">
                  <label>确认新密码</label>
                  <input v-model="passwordForm.confirmPassword" type="password" class="mobile-settings-input" />
                </div>
                <button class="mobile-focus-button--primary mobile-settings-save-btn" :disabled="passwordSaving" @click="savePassword">
                  {{ passwordSaving ? '保存中...' : '确认修改' }}
                </button>
                <button class="mobile-focus-button--ghost mobile-settings-cancel-btn" @click="showPasswordForm = false">
                  取消
                </button>
              </div>
            </template>

            <template v-if="activeSheet === 'text-model' || activeSheet === 'image-model'">
              <div v-if="modelLoading" class="mobile-focus-loading"><el-skeleton animated :rows="4" /></div>
              <template v-else-if="!canManageModel">
                <div class="mobile-focus-empty">
                  <strong v-if="!modelPolicy?.enabled">管理员未开启自定义 API 功能</strong>
                  <strong v-else>当前账号暂不能管理模型 API</strong>
                  <p v-if="!modelPolicy?.enabled">请联系管理员开启 USER_API_FEATURE_ENABLED 功能开关。</p>
                  <p v-else>请确认已登录，并具备创作者权限。</p>
                </div>
              </template>
              <template v-else>
                <template v-if="!modelShowForm">
                  <div v-if="scopedModelProfiles.length === 0" class="mobile-focus-empty">
                    <p>还没有保存任何模型 API 配置，点击下方按钮添加。</p>
                  </div>
                  <div v-else class="mobile-settings-model-list">
                    <div
                      v-for="profile in scopedModelProfiles"
                      :key="profile.id"
                      class="mobile-settings-model-item"
                      :class="{ 'mobile-settings-model-item--default': profile.isDefault }"
                    >
                      <div class="mobile-settings-model-body">
                        <div class="mobile-settings-model-header">
                          <strong>{{ profile.name }}</strong>
                          <span v-if="profile.isDefault" class="mobile-settings-model-badge">默认</span>
                        </div>
                        <div class="mobile-settings-model-meta">
                          <span>{{ profile.provider }}</span>
                          <span>·</span>
                          <span>{{ profile.model }}</span>
                        </div>
                        <div class="mobile-settings-model-key">{{ profile.maskedApiKey || '已保存密钥' }}</div>
                      </div>
                      <div class="mobile-settings-model-item-actions">
                        <button v-if="!profile.isDefault" class="mobile-focus-button--ghost" type="button" title="设为默认" @click="setDefaultModel(profile)">
                          <el-icon :size="14"><Star /></el-icon>
                        </button>
                        <button class="mobile-focus-button--ghost" type="button" title="编辑" @click="fillModelFromProfile(profile)">
                          <el-icon :size="14"><Edit /></el-icon>
                        </button>
                        <button class="mobile-focus-button--ghost mobile-focus-button--danger" type="button" title="删除" @click="deleteModelProfile(profile)">
                          <el-icon :size="14"><Delete /></el-icon>
                        </button>
                      </div>
                    </div>
                  </div>
                  <div class="mobile-settings-model-add-bar">
                    <button class="mobile-focus-button--primary" type="button" @click="startAddModel">
                      <el-icon :size="14"><Plus /></el-icon>添加新配置
                    </button>
                  </div>
                </template>

                <template v-else>
                  <div class="mobile-settings-model-form">
                    <label class="mobile-settings-model-field">
                      <span>配置名称</span>
                      <input v-model="modelForm.name" class="mobile-focus-input" type="text" placeholder="默认创作模型" />
                    </label>
                    <label class="mobile-settings-model-field">
                      <span>供应商</span>
                      <select v-model="modelForm.provider" class="mobile-focus-input">
                        <option v-for="item in modelProviderOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                      </select>
                    </label>
                    <label class="mobile-settings-model-field">
                      <span>模型名</span>
                      <input v-model="modelForm.model" class="mobile-focus-input" list="mobile-settings-model-options" placeholder="例如 deepseek-chat" />
                      <datalist id="mobile-settings-model-options">
                        <option v-for="model in selectedModelProvider?.models ?? []" :key="model.value" :value="model.value">{{ model.label }}</option>
                      </datalist>
                    </label>
                    <label class="mobile-settings-model-field">
                      <span>Base URL</span>
                      <input v-model="modelForm.baseUrl" class="mobile-focus-input" type="text" placeholder="留空使用供应商默认地址" />
                    </label>
                    <label class="mobile-settings-model-field">
                      <span>API Key</span>
                      <input v-model="modelForm.apiKey" class="mobile-focus-input" type="password" autocomplete="off" :placeholder="modelEditingId ? '不修改可留空' : '粘贴你的模型 API Key'" />
                    </label>

                    <div v-if="modelTestResult" class="mobile-settings-model-result" :class="{ success: modelTestResult.success }">
                      <strong>{{ modelTestResult.success ? '连接成功' : '连接失败' }}</strong>
                      <p>{{ modelTestResult.success ? (modelTestResult.reply || '模型已响应测试请求。') : modelTestResult.error }}</p>
                      <p v-if="modelTestResult.elapsed != null">耗时 {{ modelTestResult.elapsed }}ms</p>
                      <img v-if="modelTestResult.success && modelTestResult.imageUrl" :src="modelTestResult.imageUrl" alt="测试生成图片" class="mobile-settings-model-test-image" />
                    </div>

                    <div v-if="modelListShown && modelList.length" class="mobile-settings-model-tag-list">
                      <p class="mobile-settings-model-tag-title">服务商可用模型 ({{ modelList.length }}) — 点击填入</p>
                      <div class="mobile-settings-model-tag-items">
                        <span v-for="m in modelList" :key="m" class="mobile-settings-model-tag" @click="modelForm.model = m">{{ m }}</span>
                      </div>
                    </div>

                    <div class="mobile-settings-model-form-actions">
                      <button class="mobile-focus-button--secondary" type="button" @click="cancelModelForm">取消</button>
                      <button class="mobile-focus-button--secondary" type="button" :disabled="modelListing" @click="listModelPersonalModels">
                        <el-icon :size="14"><RefreshRight /></el-icon>{{ modelListing ? '拉取中...' : '拉取模型列表' }}
                      </button>
                      <button class="mobile-focus-button--secondary" type="button" :disabled="modelTesting" @click="testModelConnection">
                        <el-icon :size="14"><RefreshRight /></el-icon>{{ modelTesting ? '测试中...' : '测试连接' }}
                      </button>
                      <button class="mobile-focus-button--primary" type="button" :disabled="modelSaving || !canSubmitModel" @click="saveModelProfile">
                        <el-icon :size="14"><Check /></el-icon>{{ modelSaving ? '保存中...' : '保存' }}
                      </button>
                    </div>
                  </div>
                </template>
              </template>
            </template>

            <template v-if="activeSheet === 'about'">
              <div class="mobile-settings-about">
                <div class="mobile-settings-about__icon">✦</div>
                <div class="mobile-settings-about__name">{{ brand.displayName }}</div>
                <div class="mobile-settings-about__ver">v{{ appVersion }}</div>
              </div>

              <div v-if="friendlyLinks.length > 0" class="mobile-settings-links">
                <div class="mobile-settings-links__title">友情链接</div>
                <div class="mobile-settings-links__grid">
                  <a
                    v-for="link in friendlyLinks"
                    :key="link.url"
                    :href="link.url"
                    target="_blank"
                    rel="noopener"
                    class="mobile-settings-link-item"
                  >
                    {{ link.name }}
                  </a>
                </div>
              </div>
            </template>

          </div>
        </div>
      </div>
  </div>
</template>

<style scoped>
.mobile-settings-page {
  position: relative;
  min-height: 100%;
  background: var(--nw-bg-primary, #f8fafc);
  overflow: hidden;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
}

.mobile-settings-shell {
  min-height: 100%;
}

.mobile-settings-main {
  padding: 12px 14px 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-settings-card {
  background: var(--mobile-focus-surface, #fff);
  border-radius: var(--nw-radius-lg, 16px);
  padding: 14px 16px;
}

.mobile-settings-card__kicker {
  font-size: 11px;
  font-weight: 700;
  color: var(--nw-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
}

.mobile-settings-profile {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mobile-settings-profile__avatar {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--mobile-focus-accent, #f59e0b), var(--mobile-focus-accent-strong, #38bdf8));
  color: #fff;
  border-radius: 14px;
}

.mobile-settings-profile__name {
  font-size: 16px;
  font-weight: 700;
  color: var(--nw-text-primary, #0f172a);
}

.mobile-settings-profile__role {
  font-size: 12px;
  color: var(--nw-text-secondary, #64748b);
  margin-top: 2px;
}

.mobile-settings-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background 0.15s ease;
}

.mobile-settings-row + .mobile-settings-row {
  border-top: 1px solid var(--nw-border, #e2e8f0);
}

.mobile-settings-row:first-child {
  padding-top: 0;
}

.mobile-settings-row:last-child {
  padding-bottom: 0;
}

.mobile-settings-row:active {
  background: rgba(14, 165, 233, 0.05);
}

.mobile-settings-row__icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(14, 165, 233, 0.1);
  color: var(--mobile-focus-accent, #0ea5e9);
  border-radius: 10px;
  flex-shrink: 0;
}

.mobile-settings-row__content {
  flex: 1;
  min-width: 0;
}

.mobile-settings-row__label {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary, #0f172a);
}

.mobile-settings-row__value {
  font-size: 12px;
  color: var(--nw-text-secondary, #64748b);
  margin-top: 2px;
}

.mobile-settings-row__arrow {
  color: var(--nw-text-muted, #94a3b8);
  font-size: 18px;
  font-weight: 300;
  flex-shrink: 0;
}

/* Bottom Sheet */
.mobile-settings-overlay {
  position: absolute;
  inset: 0;
  z-index: 200;
  --mobile-focus-accent: var(--star-brand-teal);
  --mobile-focus-accent-strong: var(--star-brand-teal-strong, var(--star-brand-teal));
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 0 calc(env(safe-area-inset-bottom, 0px) + 12px);
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(4px);
  box-sizing: border-box;
}

.mobile-settings-sheet {
  width: 100%;
  max-height: calc(100% - 72px);
  background: var(--mobile-focus-surface);
  color: var(--nw-text-primary);
  border-radius: var(--nw-radius-xl) var(--nw-radius-xl) 18px 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -8px 40px color-mix(in srgb, var(--nw-text-primary) 18%, transparent);
}

.mobile-settings-sheet__head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 62%, transparent);
  flex-shrink: 0;
}

.mobile-settings-sheet__title {
  font-size: 16px; font-weight: 700; color: var(--nw-text-primary);
}

.mobile-settings-sheet__close {
  background: none; border: none;
  color: var(--mobile-focus-accent);
  font-size: 14px; font-weight: 600;
  cursor: pointer; padding: 4px 8px;
}

.mobile-settings-sheet__body {
  flex: 1;
  min-height: 0;
  padding: 16px 20px 28px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* Theme */
.mobile-settings-theme-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mobile-settings-theme-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--nw-bg-secondary, #f8fafc);
  border: 2px solid transparent;
  border-radius: 14px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: all 0.15s ease;
}

.mobile-settings-theme-item.active {
  border-color: var(--mobile-focus-accent, #0ea5e9);
  background: rgba(14, 165, 233, 0.06);
}

.mobile-settings-theme-item__icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mobile-focus-surface, #fff);
  color: var(--mobile-focus-accent, #0ea5e9);
  border-radius: 12px;
  flex-shrink: 0;
}

.mobile-settings-theme-item__info {
  flex: 1;
}

.mobile-settings-theme-item__label {
  font-size: 15px;
  font-weight: 700;
  color: var(--nw-text-primary, #0f172a);
}

.mobile-settings-theme-item__desc {
  font-size: 12px;
  color: var(--nw-text-secondary, #64748b);
  margin-top: 2px;
}

.mobile-settings-theme-item__check {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mobile-focus-accent, #0ea5e9);
  color: #fff;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
}

/* Cache */
.mobile-settings-cache-block {
  margin-bottom: 20px;
}

.mobile-settings-cache-block:last-child {
  margin-bottom: 0;
}

.mobile-settings-cache-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mobile-settings-cache-info {
  flex: 1;
  min-width: 0;
}

.mobile-settings-cache-label {
  font-size: 14px;
  font-weight: 700;
  color: var(--nw-text-primary, #0f172a);
}

.mobile-settings-cache-desc {
  font-size: 12px;
  color: var(--nw-text-secondary, #64748b);
  margin-top: 2px;
}

.mobile-settings-cache-btn {
  flex-shrink: 0;
  min-height: 32px !important;
  font-size: 12px !important;
  padding: 0 14px !important;
}

/* Password form */
.mobile-settings-password-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-settings-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mobile-settings-field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--nw-text-secondary, #64748b);
}

.mobile-settings-input {
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 10px;
  background: var(--mobile-focus-surface, #fff);
  color: var(--nw-text-primary, #0f172a);
  font-size: 14px;
  outline: none;
  font-family: inherit;
}

.mobile-settings-input:focus {
  border-color: var(--mobile-focus-accent, #0ea5e9);
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
}

.mobile-settings-save-btn {
  margin-top: 8px;
  width: 100%;
}

.mobile-settings-cancel-btn {
  width: 100%;
}

/* Model list */
.mobile-settings-model-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-settings-model-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  padding: 14px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 4%, var(--mobile-focus-surface));
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 72%, transparent);
}

.mobile-settings-model-item--default {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 34%, var(--nw-border));
  background: color-mix(in srgb, var(--mobile-focus-accent) 8%, var(--mobile-focus-surface));
}

.mobile-settings-model-body {
  min-width: 0;
}

.mobile-settings-model-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  min-width: 0;
}

.mobile-settings-model-header strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 800;
  color: var(--nw-text-primary, #0f172a);
}

.mobile-settings-model-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 7px;
  background: var(--mobile-focus-accent, #0ea5e9);
  color: #fff;
  border-radius: 999px;
  letter-spacing: 0.04em;
}

.mobile-settings-model-meta {
  font-size: 12px;
  color: var(--nw-text-secondary, #64748b);
  display: flex;
  gap: 6px;
  min-width: 0;
  margin-bottom: 6px;
}

.mobile-settings-model-meta span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-settings-model-key {
  display: inline-flex;
  max-width: 100%;
  padding: 3px 8px;
  font-size: 11px;
  color: var(--nw-text-muted, #94a3b8);
  background: color-mix(in srgb, var(--nw-bg-primary) 72%, transparent);
  border-radius: 999px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mobile-settings-model-item-actions {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  flex-shrink: 0;
}

.mobile-settings-model-item-actions .mobile-focus-button--ghost {
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  border-radius: 10px;
}

.mobile-settings-model-add-bar {
  margin-top: 14px;
  display: flex;
  justify-content: center;
}

.mobile-settings-model-add-bar .mobile-focus-button--primary {
  min-width: 148px;
}

/* Model form */
.mobile-settings-model-form {
  display: grid;
  gap: 13px;
}

.mobile-settings-model-field {
  display: grid;
  gap: 7px;
}

.mobile-settings-model-field span {
  color: var(--nw-text-secondary, #64748b);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.mobile-settings-model-result {
  display: grid;
  gap: 4px;
  padding: 13px 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--nw-danger) 22%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-danger) 8%, var(--nw-bg-card));
}

.mobile-settings-model-result.success {
  border-color: color-mix(in srgb, var(--nw-success) 22%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-success) 8%, var(--nw-bg-card));
}

.mobile-settings-model-result strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--nw-text-primary, #0f172a);
}

.mobile-settings-model-result p {
  margin: 0;
  font-size: 13px;
  color: var(--nw-text-secondary, #64748b);
}

.mobile-settings-model-test-image {
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 8px;
  margin-top: 8px;
}

.mobile-settings-model-tag-list {
  margin-top: 4px;
}

.mobile-settings-model-tag-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--nw-text-secondary, #64748b);
  margin: 0 0 8px 2px;
}

.mobile-settings-model-tag-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mobile-settings-model-tag {
  padding: 5px 10px;
  background: var(--mobile-focus-surface, #fff);
  border: 1px solid var(--nw-border, #e2e8f0);
  border-radius: 999px;
  font-size: 12px;
  color: var(--nw-text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.15s ease;
}

.mobile-settings-model-tag:hover {
  border-color: var(--mobile-focus-accent, #0ea5e9);
  color: var(--mobile-focus-accent, #0ea5e9);
  background: rgba(14, 165, 233, 0.05);
}

.mobile-settings-model-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.mobile-settings-model-form-actions .mobile-focus-button--secondary,
.mobile-settings-model-form-actions .mobile-focus-button--primary {
  flex: 1;
  min-width: calc(50% - 4px);
}

/* About */
.mobile-settings-about {
  text-align: center;
  padding: 24px 0 20px;
}

.mobile-settings-about__icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--mobile-focus-accent, #f59e0b), var(--mobile-focus-accent-strong, #38bdf8));
  color: #fff;
  font-size: 28px;
  border-radius: 18px;
}

.mobile-settings-about__name {
  font-size: 20px;
  font-weight: 800;
  color: var(--nw-text-primary, #0f172a);
}

.mobile-settings-about__ver {
  font-size: 12px;
  color: var(--nw-text-muted, #94a3b8);
  margin-top: 4px;
}

.mobile-settings-links {
  margin-top: 8px;
}

.mobile-settings-links__title {
  font-size: 11px;
  font-weight: 700;
  color: var(--nw-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
  padding-left: 4px;
}

.mobile-settings-links__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mobile-settings-link-item {
  padding: 8px 14px;
  background: var(--nw-bg-secondary, #f8fafc);
  color: var(--nw-text-secondary, #64748b);
  font-size: 13px;
  font-weight: 500;
  border-radius: 999px;
  text-decoration: none;
  transition: all 0.15s ease;
}

.mobile-settings-link-item:hover {
  background: rgba(14, 165, 233, 0.1);
  color: var(--mobile-focus-accent, #0ea5e9);
}
</style>
