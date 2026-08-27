<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useThemeMode, type ThemeMode } from '../../composables/useThemeMode';
import { useOfflineChapterCache } from '../../composables/useOfflineStorage';
import { clearTTSCache, getTTSCacheByNovel, type NovelCacheInfo } from '../../utils/tts-audio-cache';
import { userApiApi, type TestUserApiProfileResult, type UserApiProfile } from '../../api/user-api';
import { MODEL_PROVIDER_OPTIONS } from '../../components/dashboard/model-provider-options';
import { extractApiErrorMessage } from '../../utils/api-error';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';

const { mode: themeMode, setMode: setThemeMode } = useThemeMode();
const offlineCache = useOfflineChapterCache();

const activeSection = ref<'appearance' | 'text-model' | 'image-model' | 'cache'>('appearance');

const SECTIONS = [
  { key: 'appearance', label: '外观主题', icon: 'sunMoon', desc: '主题模式与显示偏好' },
  { key: 'text-model', label: '文字模型', icon: 'cpu', desc: '自定义大模型 API' },
  { key: 'image-model', label: '文生图模型', icon: 'image', desc: '自定义绘图 API' },
  { key: 'cache', label: '缓存管理', icon: 'database', desc: '离线章节与听书音频' },
];

// ===== 主题设置 =====
const themeOptions: { value: ThemeMode; label: string; icon: string; desc: string }[] = [
  { value: 'light', label: '浅色模式', icon: 'sun', desc: '明亮清爽' },
  { value: 'dark', label: '深色模式', icon: 'moon', desc: '护眼省电' },
  { value: 'warm-night', label: '暖夜模式', icon: 'bookOpen', desc: '暖色护眼' },
];

// ===== 缓存管理 =====
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
  try {
    await ElMessageBox.confirm('确定清除所有离线章节缓存？', '清除缓存', { type: 'warning' });
  } catch { return; }
  cacheClearing.value = true;
  try {
    await offlineCache.clearAll();
    cachedNovels.value = [];
    ElMessage.success('离线缓存已清除');
  } catch {
    ElMessage.error('清除失败');
  } finally {
    cacheClearing.value = false;
  }
}

async function clearAllTtsCache() {
  try {
    await ElMessageBox.confirm('确定清除所有听书音频缓存？', '清除缓存', { type: 'warning' });
  } catch { return; }
  ttsCacheClearing.value = true;
  try {
    await clearTTSCache();
    ttsNovelCaches.value = [];
    ElMessage.success('听书缓存已清除');
  } catch {
    ElMessage.error('清除失败');
  } finally {
    ttsCacheClearing.value = false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN');
}

// ===== 模型配置 =====
const textModelLoading = ref(false);
const imageModelLoading = ref(false);
const textProfiles = ref<UserApiProfile[]>([]);
const imageProfiles = ref<UserApiProfile[]>([]);
const modelSaving = ref(false);
const modelTesting = ref(false);
const testResult = ref<TestUserApiProfileResult | null>(null);
const showModelForm = ref(false);
const editingScope = ref<'model' | 'image-generation'>('model');
const editingProfileId = ref('');

const modelForm = ref({
  name: '',
  provider: '',
  model: '',
  baseUrl: '',
  apiKey: '',
});

const providerOptions = computed(() => {
  if (editingScope.value === 'image-generation') {
    return [
      { value: 'openai', label: 'OpenAI', baseUrl: '', models: [
        { value: 'gpt-image-2', label: 'GPT-Image-2' },
        { value: 'gpt-image-1.5', label: 'GPT-Image-1.5' },
        { value: 'gpt-image-1', label: 'GPT-Image-1' },
        { value: 'dall-e-3', label: 'DALL-E 3' },
      ]},
    ];
  }
  return MODEL_PROVIDER_OPTIONS.map((item) => ({
    value: item.value,
    label: item.label,
    models: item.models,
    baseUrl: 'baseUrl' in item ? (item as { baseUrl?: string }).baseUrl ?? '' : '',
  }));
});

const selectedProvider = computed(() =>
  providerOptions.value.find((item) => item.value === modelForm.value.provider)
);

const canSubmitModel = computed(() => (
  modelForm.value.provider.trim()
  && modelForm.value.model.trim()
  && (modelForm.value.apiKey.trim() || editingProfileId.value)
));

async function loadModelProfiles() {
  textModelLoading.value = true;
  imageModelLoading.value = true;
  try {
    const profiles = await userApiApi.listProfiles();
    textProfiles.value = profiles.filter((p) => p.scope === 'model');
    imageProfiles.value = profiles.filter((p) => p.scope === 'image-generation');
  } catch { /* ignore */ }
  finally {
    textModelLoading.value = false;
    imageModelLoading.value = false;
  }
}

function resetModelForm() {
  editingProfileId.value = '';
  const defaultProvider = providerOptions.value[0];
  modelForm.value = {
    name: editingScope.value === 'image-generation' ? '默认文生图模型' : '默认创作模型',
    provider: defaultProvider?.value ?? '',
    model: defaultProvider?.models?.[0]?.value ?? '',
    baseUrl: defaultProvider?.baseUrl ?? '',
    apiKey: '',
  };
  testResult.value = null;
}

function startAddModel(scope: 'model' | 'image-generation') {
  editingScope.value = scope;
  resetModelForm();
  showModelForm.value = true;
}

function editModelProfile(profile: UserApiProfile) {
  editingScope.value = profile.scope as 'model' | 'image-generation';
  editingProfileId.value = profile.id;
  modelForm.value = {
    name: profile.name || '',
    provider: profile.provider,
    model: profile.model,
    baseUrl: profile.baseUrl || '',
    apiKey: '',
  };
  testResult.value = null;
  showModelForm.value = true;
}

async function saveModelProfile() {
  if (!canSubmitModel.value) return;
  modelSaving.value = true;
  try {
    const data = {
      scope: editingScope.value,
      name: modelForm.value.name.trim(),
      provider: modelForm.value.provider.trim(),
      model: modelForm.value.model.trim(),
      baseUrl: modelForm.value.baseUrl.trim() || undefined,
      apiKey: modelForm.value.apiKey.trim() || undefined,
      enabled: true,
      isDefault: true,
    };
    if (editingProfileId.value) {
      await userApiApi.updateProfile(editingProfileId.value, data as any);
    } else {
      await userApiApi.createProfile(data as any);
    }
    ElMessage.success('保存成功');
    showModelForm.value = false;
    void loadModelProfiles();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    modelSaving.value = false;
  }
}

async function testModelProfile() {
  const apiKey = modelForm.value.apiKey.trim();
  if (!apiKey && !editingProfileId.value) {
    ElMessage.warning('请先填写 API Key');
    return;
  }
  modelTesting.value = true;
  try {
    testResult.value = editingProfileId.value && !apiKey
      ? await userApiApi.testProfile(editingProfileId.value)
      : await userApiApi.testDraftProfile({
          scope: editingScope.value,
          provider: modelForm.value.provider.trim(),
          model: modelForm.value.model.trim(),
          baseUrl: modelForm.value.baseUrl.trim() || undefined,
          apiKey: apiKey || undefined,
        } as any);
  } catch (err) {
    testResult.value = { ok: false, message: extractApiErrorMessage(err, '测试失败') } as any;
  } finally {
    modelTesting.value = false;
  }
}

async function deleteModelProfile(profile: UserApiProfile) {
  try {
    await ElMessageBox.confirm('确定删除这个模型配置？', '删除配置', { type: 'warning' });
  } catch { return; }
  try {
    await userApiApi.deleteProfile(profile.id);
    ElMessage.success('已删除');
    void loadModelProfiles();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  }
}

function onProviderChange() {
  const next = selectedProvider.value;
  if (!next) return;
  if (next.models?.length && !next.models.some((m: any) => m.value === modelForm.value.model)) {
    modelForm.value.model = next.models[0]?.value ?? '';
  }
  if (!modelForm.value.baseUrl) {
    modelForm.value.baseUrl = next.baseUrl ?? '';
  }
  testResult.value = null;
}

onMounted(() => {
  void loadModelProfiles();
  void loadCacheData();
});
</script>

<template>
  <div class="desktop-settings">
    <div class="settings-layout">
      <!-- 侧边栏 -->
      <div class="settings-sidebar nw-panel">
        <h2 class="settings-sidebar-title">设置</h2>
        <div class="settings-nav">
          <button
            v-for="section in SECTIONS"
            :key="section.key"
            class="settings-nav-item"
            :class="{ 'is-active': activeSection === section.key }"
            @click="activeSection = section.key as any"
          >
            <Icon :name="section.icon" :size="18" />
            <div class="settings-nav-text">
              <span class="settings-nav-label">{{ section.label }}</span>
              <span class="settings-nav-desc">{{ section.desc }}</span>
            </div>
          </button>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="settings-main">
        <!-- 外观主题 -->
        <div v-if="activeSection === 'appearance'" class="nw-panel settings-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">外观主题</h2>
          </div>
          <div class="settings-section">
            <div class="settings-section-label">主题模式</div>
            <div class="theme-grid">
              <button
                v-for="opt in themeOptions"
                :key="opt.value"
                class="theme-card"
                :class="{ 'is-active': themeMode === opt.value }"
                @click="setThemeMode(opt.value)"
              >
                <div class="theme-icon"><Icon :name="opt.icon" :size="24" /></div>
                <div class="theme-label">{{ opt.label }}</div>
                <div class="theme-desc">{{ opt.desc }}</div>
                <div v-if="themeMode === opt.value" class="theme-check">
                  <Icon name="check" :size="16" />
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- 文字模型 -->
        <div v-if="activeSection === 'text-model'" class="nw-panel settings-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">文字模型配置</h2>
            <button class="desktop-btn desktop-btn--primary" @click="startAddModel('model')">
              <Icon name="plus" :size="14" /> 新增配置
            </button>
          </div>
          <StateView :loading="textModelLoading" :empty="textProfiles.length === 0">
            <template #empty>
              <p class="nw-state__title">暂无自定义模型</p>
              <p class="nw-state__desc">添加你自己的 API 配置，获得更个性化的创作体验。</p>
            </template>
            <div v-if="textProfiles.length" class="model-list">
              <div v-for="profile in textProfiles" :key="profile.id" class="model-card">
                <div class="model-card-main">
                  <div class="model-card-icon"><Icon name="cpu" :size="20" /></div>
                  <div class="model-card-info">
                    <div class="model-card-name">
                      {{ profile.name || '默认创作模型' }}
                      <span v-if="profile.isDefault" class="nw-tag priority-low">默认</span>
                    </div>
                    <div class="model-card-meta">
                      <span class="nw-tag">{{ profile.provider }}</span>
                      <span>{{ profile.model }}</span>
                    </div>
                  </div>
                </div>
                <div class="model-card-actions">
                  <button class="desktop-btn" @click="editModelProfile(profile)">
                    <Icon name="pen" :size="14" /> 编辑
                  </button>
                  <button class="desktop-btn reader-danger" @click="deleteModelProfile(profile)">
                    <Icon name="trash2" :size="14" /> 删除
                  </button>
                </div>
              </div>
            </div>
          </StateView>
        </div>

        <!-- 文生图模型 -->
        <div v-if="activeSection === 'image-model'" class="nw-panel settings-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">文生图模型配置</h2>
            <button class="desktop-btn desktop-btn--primary" @click="startAddModel('image-generation')">
              <Icon name="plus" :size="14" /> 新增配置
            </button>
          </div>
          <StateView :loading="imageModelLoading" :empty="imageProfiles.length === 0">
            <template #empty>
              <p class="nw-state__title">暂无自定义绘图模型</p>
              <p class="nw-state__desc">添加你自己的绘图 API，让角色封面和插图更符合你的审美。</p>
            </template>
            <div v-if="imageProfiles.length" class="model-list">
              <div v-for="profile in imageProfiles" :key="profile.id" class="model-card">
                <div class="model-card-main">
                  <div class="model-card-icon"><Icon name="image" :size="20" /></div>
                  <div class="model-card-info">
                    <div class="model-card-name">
                      {{ profile.name || '默认文生图模型' }}
                      <span v-if="profile.isDefault" class="nw-tag priority-low">默认</span>
                    </div>
                    <div class="model-card-meta">
                      <span class="nw-tag">{{ profile.provider }}</span>
                      <span>{{ profile.model }}</span>
                    </div>
                  </div>
                </div>
                <div class="model-card-actions">
                  <button class="desktop-btn" @click="editModelProfile(profile)">
                    <Icon name="pen" :size="14" /> 编辑
                  </button>
                  <button class="desktop-btn reader-danger" @click="deleteModelProfile(profile)">
                    <Icon name="trash2" :size="14" /> 删除
                  </button>
                </div>
              </div>
            </div>
          </StateView>
        </div>

        <!-- 缓存管理 -->
        <div v-if="activeSection === 'cache'" class="nw-panel settings-panel">
          <div class="nw-panel__head">
            <h2 class="nw-panel__title">缓存管理</h2>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">离线章节缓存</div>
            <StateView :loading="cacheLoading" :empty="cachedNovels.length === 0">
              <template #empty>
                <p class="nw-state__desc">暂无离线缓存的章节</p>
              </template>
              <div v-if="cachedNovels.length" class="cache-list">
                <div v-for="item in cachedNovels" :key="item.novelId" class="cache-item">
                  <div class="cache-item-info">
                    <div class="cache-item-title">{{ item.novelTitle }}</div>
                    <div class="cache-item-meta">
                      <span>{{ item.chapterCount }} 章</span>
                      <span>{{ formatDate(item.lastCachedAt) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </StateView>
            <button
              v-if="cachedNovels.length"
              class="desktop-btn reader-danger"
              :disabled="cacheClearing"
              @click="clearAllOfflineCache"
            >
              <Icon name="trash2" :size="14" />
              {{ cacheClearing ? '清除中…' : '清除全部离线缓存' }}
            </button>
          </div>

          <div class="settings-section">
            <div class="settings-section-label">听书音频缓存</div>
            <StateView :loading="ttsCacheLoading" :empty="ttsNovelCaches.length === 0">
              <template #empty>
                <p class="nw-state__desc">暂无听书音频缓存</p>
              </template>
              <div v-if="ttsNovelCaches.length" class="cache-list">
                <div v-for="item in ttsNovelCaches" :key="item.novelId" class="cache-item">
                  <div class="cache-item-info">
                    <div class="cache-item-title">{{ item.novelTitle }}</div>
                    <div class="cache-item-meta">
                      <span>{{ item.chapterCount }} 章</span>
                      <span>{{ formatBytes(item.totalSizeBytes) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </StateView>
            <button
              v-if="ttsNovelCaches.length"
              class="desktop-btn reader-danger"
              :disabled="ttsCacheClearing"
              @click="clearAllTtsCache"
            >
              <Icon name="trash2" :size="14" />
              {{ ttsCacheClearing ? '清除中…' : '清除全部听书缓存' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 模型配置弹窗 -->
    <el-dialog
      v-model="showModelForm"
      :title="editingProfileId ? '编辑模型配置' : '新增模型配置'"
      width="520px"
      :close-on-click-modal="false"
    >
      <div class="model-form">
        <div class="nw-field">
          <label class="nw-field-label">配置名称</label>
          <input v-model="modelForm.name" class="nw-input" placeholder="给这个配置起个名字" maxlength="30" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">供应商</label>
          <select v-model="modelForm.provider" class="nw-input" @change="onProviderChange">
            <option v-for="p in providerOptions" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </div>
        <div class="nw-field">
          <label class="nw-field-label">模型名称</label>
          <select v-if="selectedProvider?.models?.length" v-model="modelForm.model" class="nw-input">
            <option v-for="m in selectedProvider.models" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <input v-else v-model="modelForm.model" class="nw-input" placeholder="例如：deepseek-chat" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">Base URL（留空用默认）</label>
          <input v-model="modelForm.baseUrl" class="nw-input" placeholder="https://api.example.com/v1" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">API Key</label>
          <input v-model="modelForm.apiKey" type="password" class="nw-input" :placeholder="editingProfileId ? '不修改则留空' : 'sk-...'" />
        </div>
        <div v-if="testResult" class="test-result" :class="{ 'is-ok': testResult.ok }">
          <Icon :name="testResult.ok ? 'checkCircle' : 'xCircle'" :size="16" />
          <span>{{ testResult.message || (testResult.ok ? '连接成功' : '连接失败') }}</span>
        </div>
      </div>
      <template #footer>
        <button class="desktop-btn" @click="testModelProfile" :disabled="modelTesting || !canSubmitModel">
          <Icon name="refreshCw" :size="14" :class="{ 'is-spin': modelTesting }" />
          {{ modelTesting ? '测试中…' : '测试连接' }}
        </button>
        <button class="desktop-btn" @click="showModelForm = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="!canSubmitModel || modelSaving" @click="saveModelProfile">
          {{ modelSaving ? '保存中…' : '保存' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.desktop-settings {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

.settings-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: var(--nw-space-5);
  align-items: start;
}

.settings-sidebar {
  padding: var(--nw-space-5);
  position: sticky;
  top: var(--nw-space-5);
}

.settings-sidebar-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0 0 var(--nw-space-4) 0;
  font-family: var(--nw-font-display);
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  padding: var(--nw-space-3) var(--nw-space-3);
  border-radius: var(--nw-radius-md);
  border: none;
  background: transparent;
  color: var(--nw-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.settings-nav-item:hover {
  background: var(--nw-bg-secondary);
  color: var(--nw-text-primary);
}

.settings-nav-item.is-active {
  background: color-mix(in srgb, var(--nw-accent-start) 10%, transparent);
  color: var(--nw-accent-strong);
}

.settings-nav-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.settings-nav-label {
  font-size: 14px;
  font-weight: 500;
}

.settings-nav-desc {
  font-size: 11px;
  color: var(--nw-text-muted);
}

.settings-panel {
  padding: var(--nw-space-6);
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
  padding-bottom: var(--nw-space-6);
  margin-bottom: var(--nw-space-6);
  border-bottom: 1px solid var(--nw-border);
}

.settings-section:last-child {
  padding-bottom: 0;
  margin-bottom: 0;
  border-bottom: none;
}

.settings-section-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

/* 主题选择 */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--nw-space-3);
}

.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--nw-space-2);
  padding: var(--nw-space-5) var(--nw-space-3);
  border-radius: var(--nw-radius-lg);
  border: 2px solid var(--nw-border);
  background: var(--nw-bg-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.theme-card:hover {
  border-color: var(--nw-accent-start);
}

.theme-card.is-active {
  border-color: var(--nw-accent-strong);
  background: color-mix(in srgb, var(--nw-accent-start) 8%, var(--nw-bg-primary));
}

.theme-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-secondary);
  color: var(--nw-text-secondary);
  display: grid;
  place-items: center;
}

.theme-card.is-active .theme-icon {
  background: var(--nw-accent-gradient);
  color: #fff;
}

.theme-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.theme-desc {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.theme-check {
  position: absolute;
  top: var(--nw-space-3);
  right: var(--nw-space-3);
  color: var(--nw-accent-strong);
}

/* 模型列表 */
.model-list {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
}

.model-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--nw-space-4);
  border-radius: var(--nw-radius-md);
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-secondary);
}

.model-card-main {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
}

.model-card-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--nw-radius-md);
  background: color-mix(in srgb, var(--nw-accent-start) 12%, transparent);
  color: var(--nw-accent-strong);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.model-card-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
  display: flex;
  align-items: center;
  gap: var(--nw-space-2);
}

.model-card-meta {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2);
  font-size: 13px;
  color: var(--nw-text-secondary);
}

.model-card-actions {
  display: flex;
  gap: var(--nw-space-2);
}

/* 缓存列表 */
.cache-list {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
}

.cache-item {
  padding: var(--nw-space-3) var(--nw-space-4);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-secondary);
}

.cache-item-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cache-item-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--nw-text-primary);
}

.cache-item-meta {
  display: flex;
  gap: var(--nw-space-4);
  font-size: 12px;
  color: var(--nw-text-muted);
}

/* 模型表单 */
.model-form {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.test-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: var(--nw-space-3) var(--nw-space-4);
  border-radius: var(--nw-radius-md);
  font-size: 13px;
  background: color-mix(in srgb, var(--nw-danger) 10%, transparent);
  color: var(--nw-danger);
}

.test-result.is-ok {
  background: color-mix(in srgb, var(--nw-success) 10%, transparent);
  color: var(--nw-success);
}

.is-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 900px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }

  .settings-sidebar {
    position: static;
  }

  .theme-grid {
    grid-template-columns: 1fr;
  }
}
</style>
