<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  ArrowLeft, Cpu, Link, Connection, PictureFilled, Microphone,
  CircleCheckFilled, Switch, Lock, Message, HomeFilled, Stamp,
  UserFilled, Tickets, Coin, Bell, MagicStick, Search, Tools,
} from '@element-plus/icons-vue';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import { useAuthStore } from '../stores/auth';
import { fetchSettings, saveSettings, type Settings } from '../api/settings';
import { http, AI_TIMEOUT } from '../api/http';
import { extractApiErrorMessage } from '../utils/api-error';
import {
  ADMIN_TOGGLES,
  CATEGORY_META,
  getGroupsByCategory,
  getTogglesByGroup,
  getToggleByKey,
  type ToggleCategory,
  type ToggleMeta,
} from '../config/admin-toggle-registry';
import { useThemeMode } from '../composables/useThemeMode';
import { brand } from '../config/brand';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const { isAdmin } = useAuthStore();

const loading = ref(false);
const savingSection = ref('');
const settings = ref<Settings | null>(null);

const activeSheet = ref('');
function openSheet(key: string) {
  if (key === 'users') { void router.push('/m/admin/users'); return; }
  if (key === 'trialAccounts') { void router.push('/m/admin/trial-accounts'); return; }
  if (key === 'billing') { void router.push('/m/admin/billing'); return; }
  if (key === 'dnaIllustrations') { void router.push('/m/admin/dna-illustrations'); return; }
  if (key === 'ai') { activeModelTab.value = 'ai'; }
  activeSheet.value = key;
}
function closeSheet() { activeSheet.value = ''; }

const gateModes = [
  { value: 'off', label: '关闭' },
  { value: 'warn', label: '警告' },
  { value: 'strict', label: '严格' },
];

// ── 模型配置 Tab ──
type ModelTab = 'ai' | 'emb' | 'image' | 'tts';
const modelTabs: { key: ModelTab; label: string }[] = [
  { key: 'ai', label: 'AI 对话' },
  { key: 'emb', label: '向量检索' },
  { key: 'image', label: '图片生成' },
  { key: 'tts', label: '语音合成' },
];
const activeModelTab = ref<ModelTab>('ai');

// ── 运营配置 Tab ──
type OpsTab = 'smtp' | 'notify';
const opsTabs: { key: OpsTab; label: string }[] = [
  { key: 'smtp', label: '邮件服务' },
  { key: 'notify', label: '通知消息' },
];
const activeOpsTab = ref<OpsTab>('smtp');

const providerOptions = computed(() =>
  (settings.value?.providers ?? []).map((p) => ({ value: p.id, label: p.name })),
);

const ttsEngineOptions = [
  { value: 'edge-tts', label: 'Edge TTS (系统内置)' },
  { value: 'qwen3-tts', label: 'Qwen3-TTS (自托管)' },
  { value: 'azure-tts', label: 'Azure TTS' },
  { value: 'openai-tts', label: 'OpenAI TTS' },
];

const narrationEngineOptions = [
  { value: 'edge-tts', label: 'Edge TTS' },
  { value: 'kokoro', label: 'Kokoro' },
];

const homepageJson = computed({
  get() {
    if (!settings.value?.homepageConfig) return '';
    return JSON.stringify(settings.value.homepageConfig, null, 2);
  },
  set(val: string) {
    try { if (settings.value) settings.value.homepageConfig = JSON.parse(val); } catch { /* ignore */ }
  },
});

// ── 分区域保存 ──
async function saveSection(sectionKey: string, fields: (keyof Settings)[]) {
  if (!settings.value) return;
  savingSection.value = sectionKey;
  try {
    // 友情链接本地编辑在 friendlyLinksLocal，需同步回 settings 再保存
    if (fields.includes('friendlyLinks' as any)) {
      settings.value.friendlyLinks = friendlyLinksLocal.value.map((l) => ({ ...l }));
    }
    const server = await fetchSettings();
    const merged: any = { ...server };
    for (const f of fields) {
      if (f in settings.value) merged[f] = (settings.value as any)[f];
    }
    const { configured, providers, realNameVerificationProviders, ...payload } = merged;
    await saveSettings(payload);
    ElMessage.success('已保存');
    closeSheet();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    savingSection.value = '';
  }
}

async function load() {
  loading.value = true;
  try {
    settings.value = await fetchSettings();
    initFriendlyLinks();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载设置失败'));
  } finally {
    loading.value = false;
  }
}

// ── 测试模型连通性 ──
const testingModel = ref(false);
const testingEmbedding = ref(false);
const testingImage = ref(false);
const listingModels = ref(false);
const modelList = ref<string[]>([]);
const modelListShown = ref(false);

async function testModel(provider: string, apiKey: string, model: string, baseUrl: string) {
  testingModel.value = true;
  try {
    const { data } = await http.post('/settings/test-model', { provider, apiKey, model, baseUrl }, { timeout: AI_TIMEOUT });
    if (data.success) ElMessage.success(`连接成功 ${data.model ?? ''} ${data.elapsed}ms`);
    else ElMessage.error(data.error || '测试失败');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '测试失败'));
  } finally { testingModel.value = false; }
}

async function testEmbedding(provider: string, apiKey: string, model: string, baseUrl: string) {
  testingEmbedding.value = true;
  try {
    const { data } = await http.post('/settings/test-embedding', { provider, apiKey, model, baseUrl }, { timeout: AI_TIMEOUT });
    if (data.success) ElMessage.success(`连接成功 维度=${data.dimensions} ${data.elapsed}ms`);
    else ElMessage.error(data.error || '测试失败');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '测试失败'));
  } finally { testingEmbedding.value = false; }
}

async function testImage(apiKey: string, model: string, baseUrl: string) {
  testingImage.value = true;
  try {
    const { data } = await http.post('/settings/test-image', { apiKey, model, baseUrl }, { timeout: AI_TIMEOUT });
    if (data.success) ElMessage.success(`连接成功 model=${data.model} ${data.elapsed}ms`);
    else ElMessage.error(data.error || '测试失败');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '测试失败'));
  } finally { testingImage.value = false; }
}

async function listModels(apiKey: string, baseUrl: string, provider: string) {
  listingModels.value = true;
  modelList.value = [];
  try {
    const { data } = await http.post('/settings/list-models', { apiKey, baseUrl, provider }, { timeout: AI_TIMEOUT });
    if (data.success) {
      modelList.value = data.models;
      modelListShown.value = true;
      ElMessage.success(`拉取到 ${data.models.length} 个模型`);
    } else ElMessage.error(data.error || '拉取失败');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '拉取失败'));
  } finally { listingModels.value = false; }
}

const modelFields: (keyof Settings)[] = ['modelProvider', 'modelApiKey', 'modelName', 'modelBaseUrl'];
const embFields: (keyof Settings)[] = ['embeddingProvider', 'embeddingApiKey', 'embeddingModel', 'embeddingBaseUrl'];
const imageFields: (keyof Settings)[] = ['imageApiKey', 'imageModel', 'imageBaseUrl'];
const ttsFields: (keyof Settings)[] = ['ttsEngine', 'ttsNarrationEngine', 'qwen3TtsUrl', 'kokoroUrl'];

const trendsFields: (keyof Settings)[] = [
  'trendsEnabled', 'trendsSearchProvider', 'trendsSearchApiKey', 'trendsSearchApiBaseUrl',
  'trendsScheduleHour', 'trendsScheduleMinute',
];

const trendsProviderOptions = [
  { value: 'none', label: '关闭（不使用搜索）' },
  { value: 'serpapi', label: 'SerpAPI' },
  { value: 'bing', label: 'Bing Search' },
  { value: 'tavily', label: 'Tavily' },
  { value: 'agent-reach', label: 'Agent Reach（Exa + 微博）' },
  { value: 'direct', label: '直接抓取（微博/知乎/百度）' },
];
const gateFields: (keyof Settings)[] = [
  'characterGuardrailMinConflictRate', 'characterGuardrailMinHumanityRate', 'characterGuardrailMinStabilityScore',
  'antiTemplateRepeatedOpenerMinCount', 'antiTemplateRepeatedClicheMinCount', 'antiTemplateLookbackChapters',
  'antiAiTellsEnabled', 'antiAiStructureEnabled',
  'worldGateMode', 'outlineGateMode', 'qualityGateMode', 'continuityGateMode', 'powerRuleGateMode',
  'worldGateStrictFallbackToWarn', 'outlineGateStrictFallbackToWarn', 'qualityGateStrictFallbackToWarn',
  'continuityGateStrictFallbackToWarn', 'powerRuleGateStrictFallbackToWarn',
  'qualityGatePassScore', 'qualityGateMinStructureScore', 'qualityGateMinStyleScore', 'qualityGateMinEmotionScore',
  'outlineGateMaxRequired', 'worldRetrievalTopK',
];
const toggleFields: (keyof Settings)[] = [
  'modelStreamingEnabled',
  'superLongModeEnabled', 'truthFilesEnabled', 'structuredAuditEnabled', 'snapshotEnabled',
  'autoRevisionEnabled', 'qualityFloorRevisionEnabled', 'autoCurateEnabled', 'autoFinalizeEnabled', 'authorNoteEnabled', 'chapterLengthGuardEnabled',
  'worldContractEnabled', 'worldRetrievalV2Enabled',
  'autoRevisionScoreThreshold', 'autoRevisionMaxRounds',
  'chapterLengthGuardTriggerPercent', 'chapterLengthGuardAllowedPercent',
  'aiTraceGateMode',
  'momentsIdleCooldownHours',
  'comicChapterEnabled',
  'audiobookAccessMode',
];
const authFields: (keyof Settings)[] = [
  'registrationProtectionEnabled',
  'registrationProtectionRegPerHour', 'registrationProtectionRegPerDay',
  'newUserCooldownHours', 'disableCoverUpload',
  'publishMaxPerMonth', 'publishUnlockReads', 'publishUnlockLikes', 'publishUnlockFavorites', 'publishUnlockChapters',
  'authPasswordMinLength',
  'authPasswordRequireLowercase', 'authPasswordRequireUppercase', 'authPasswordRequireNumbers', 'authPasswordRequireSpecialChars',
  'userApiFeatureEnabled', 'userApiAllowPlatformCache', 'userApiAllowLocalOnly',
];
const smtpFields: (keyof Settings)[] = ['smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPass', 'smtpFrom', 'platformUrl', 'commentEnabled'];
const homepageFields: (keyof Settings)[] = ['homepageConfig'];

// ── 友情链接管理 ──
const friendlyLinksLocal = ref<{ id: string; name: string; url: string; enabled: boolean }[]>([]);
const newLinkName = ref('');
const newLinkUrl = ref('');
const friendlyLinksFields: (keyof Settings)[] = ['friendlyLinks'];

function initFriendlyLinks() {
  friendlyLinksLocal.value = (settings.value?.friendlyLinks ?? []).map((l) => ({ ...l }));
}

function addFriendlyLink() {
  const name = newLinkName.value.trim();
  const url = newLinkUrl.value.trim();
  if (!name || !url) return;
  friendlyLinksLocal.value.push({ id: crypto.randomUUID(), name: name.slice(0, 30), url: url.slice(0, 500), enabled: true });
  newLinkName.value = '';
  newLinkUrl.value = '';
}

function removeFriendlyLink(id: string) {
  friendlyLinksLocal.value = friendlyLinksLocal.value.filter((l) => l.id !== id);
}

function toggleFriendlyLink(id: string) {
  const link = friendlyLinksLocal.value.find((l) => l.id === id);
  if (link) link.enabled = !link.enabled;
}

// ── 管理员通知 ──
type BroadcastItem = { id: string; title: string; body: string; targetUserId?: string; sentCount: number; sentAt: string; revokedAt?: string };
const notifyTitle = ref('');
const notifyBody = ref('');
const notifyTarget = ref('');
const notifySending = ref(false);
const broadcastList = ref<BroadcastItem[]>([]);
const broadcastLoading = ref(false);
const actionId = ref('');
const editingId = ref('');

async function loadBroadcasts() {
  broadcastLoading.value = true;
  try {
    const { data } = await http.get<BroadcastItem[]>('/admin/notifications/list');
    broadcastList.value = data ?? [];
  } catch { /* ignore */ }
  finally { broadcastLoading.value = false; }
}

function editBroadcast(b: BroadcastItem) {
  editingId.value = b.id;
  notifyTitle.value = b.title;
  notifyBody.value = b.body;
  notifyTarget.value = b.targetUserId ?? '';
}

function cancelEdit() {
  editingId.value = '';
  notifyTitle.value = '';
  notifyBody.value = '';
  notifyTarget.value = '';
}

async function sendNotification() {
  const title = notifyTitle.value.trim();
  const body = notifyBody.value.trim();
  if (!title || !body) { ElMessage.warning('标题和内容不能为空'); return; }
  notifySending.value = true;
  try {
    if (editingId.value) {
      await http.post(`/admin/notifications/${editingId.value}/resend`, { title, body });
      ElMessage.success('已重发');
    } else {
      const payload: Record<string, string> = { title, body };
      const target = notifyTarget.value.trim();
      if (target) payload.targetUserId = target;
      await http.post('/admin/notifications/broadcast', payload);
      ElMessage.success('发送成功');
    }
    cancelEdit();
    await loadBroadcasts();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '发送失败'));
  } finally { notifySending.value = false; }
}

async function revokeBroadcast(id: string) {
  actionId.value = id;
  try {
    await http.delete(`/admin/notifications/${id}`);
    ElMessage.success('已撤销，用户消息已清除');
    await loadBroadcasts();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '撤销失败'));
  } finally { actionId.value = ''; }
}

async function deleteBroadcastHistory(id: string) {
  actionId.value = id;
  try {
    await http.delete(`/admin/notifications/history/${id}`);
    ElMessage.success('已删除');
    await loadBroadcasts();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  } finally { actionId.value = ''; }
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

watch(activeSheet, (val) => { if (val === 'notify') { loadBroadcasts(); } else { cancelEdit(); } });

// ── 导航卡片定义 ──
const navTiles = [
  { key: 'users', icon: UserFilled, label: '用户管理', desc: '搜索与管理用户' },
  { key: 'trialAccounts', icon: Tickets, label: '体验账号', desc: '发放试用账号' },
  { key: 'billing', icon: Coin, label: '计费规则', desc: '积分单价与绑定' },
  { key: 'dnaIllustrations', icon: PictureFilled, label: 'DNA 插画', desc: '爽点测试题库插画' },
  { key: 'lab', icon: MagicStick, label: '功能实验室', desc: '全部开关总览', highlight: true },
  { key: 'ai', icon: Cpu, label: '模型配置', desc: 'AI/向量/图片/语音' },
  { key: 'trends', icon: Search, label: '热点趋势', desc: '搜索源与定时刷新' },
  { key: 'ops', icon: Tools, label: '运营配置', desc: '首页/邮件/通知' },
  { key: 'compliance', icon: Stamp, label: '合规备案', desc: 'ICP/公安/版权' },
];

// ── 功能实验室 ──
const labSearchKeyword = ref('');
const labActiveCategory = ref<ToggleCategory>('creation');

const labCategories = Object.entries(CATEGORY_META).map(([key, meta]) => ({
  key: key as ToggleCategory,
  ...meta,
}));

const filteredToggles = computed(() => {
  const keyword = labSearchKeyword.value.trim().toLowerCase();
  if (!keyword) {
    return ADMIN_TOGGLES.filter((t) => t.category === labActiveCategory.value);
  }
  return ADMIN_TOGGLES.filter(
    (t) =>
      t.label.toLowerCase().includes(keyword) ||
      (t.description ?? '').toLowerCase().includes(keyword) ||
      (t.group ?? '').toLowerCase().includes(keyword),
  );
});

const groupedFilteredToggles = computed(() => {
  const toggles = filteredToggles.value;
  const groups = new Map<string, ToggleMeta[]>();
  for (const t of toggles) {
    const groupName = t.group ?? '其他';
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName)!.push(t);
  }
  return Array.from(groups.entries());
});

const allToggleKeys = computed(() => ADMIN_TOGGLES.map((t) => t.key));

function selectLabCategory(key: ToggleCategory) {
  labActiveCategory.value = key;
  labSearchKeyword.value = '';
}

async function saveLabToggles() {
  if (!settings.value) return;
  savingSection.value = 'lab';
  try {
    const server = await fetchSettings();
    const merged: any = { ...server };
    for (const key of allToggleKeys.value) {
      if (key in settings.value) {
        merged[key] = (settings.value as any)[key];
      }
    }
    const { configured, providers, realNameVerificationProviders, ...payload } = merged;
    await saveSettings(payload);
    ElMessage.success('已保存');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    savingSection.value = '';
  }
}

onMounted(() => {
  if (isAdmin) void load();
  else router.replace('/m/app');
});

function goBack() { void router.push('/m/me'); }

const inputClass = 'mas-input';
const fieldClass = 'mas-field';
const rowClass = 'mas-row';
const subClass = 'mas-sub';
const checkClass = 'mas-check';
const swatchClass = 'mas-swatch';
const saveBtnClass = 'mas-save';
</script>

<template>
  <div v-if="isAdmin" class="mobile-admin-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell">
      <MobileTopbar title="系统设置" subtitle="全局参数配置">
        <template #leading>
          <button class="mobile-focus-button--ghost" type="button" @click="goBack">
            <el-icon :size="18"><ArrowLeft /></el-icon>
          </button>
        </template>
      </MobileTopbar>

      <main class="mobile-focus-main">
        <div v-if="loading" class="mobile-focus-loading">
          <el-skeleton animated :rows="8" />
        </div>

        <template v-else-if="settings">
          <!-- 导航图标网格 -->
          <div class="mas-grid">
            <button
              v-for="tile in navTiles"
              :key="tile.key"
              :class="['mas-tile', { 'mas-tile--highlight': (tile as any).highlight }]"
              type="button"
              @click="openSheet(tile.key)"
            >
              <span class="mas-tile__icon">
                <el-icon :size="22"><component :is="tile.icon" /></el-icon>
              </span>
              <span class="mas-tile__label">{{ tile.label }}</span>
              <span class="mas-tile__desc">{{ tile.desc }}</span>
            </button>
          </div>
        </template>
      </main>
    </div>

    <!-- 底部弹出层（teleport 到 body，需自带主题变量作用域，否则背景透明看不清） -->
    <Teleport to="body">
      <div
        v-if="activeSheet"
        class="mas-overlay"
        :class="isDarkTheme ? 'mobile-focus-dark-vars' : 'mobile-focus-light-vars'"
        @click.self="closeSheet"
      >
        <div class="mas-sheet">
          <div class="mas-sheet__head">
            <span class="mas-sheet__title">{{ navTiles.find(t => t.key === activeSheet)?.label }}</span>
            <button class="mas-sheet__close" @click="closeSheet">取消</button>
          </div>
          <div class="mas-sheet__body">

            <!-- AI 模型（合并所有模型配置） -->
            <template v-if="activeSheet === 'ai'">
              <!-- Tab 导航 -->
              <div class="model-tabs">
                <button
                  v-for="tab in modelTabs"
                  :key="tab.key"
                  :class="['model-tab', { active: activeModelTab === tab.key }]"
                  type="button"
                  @click="activeModelTab = tab.key"
                >
                  {{ tab.label }}
                </button>
              </div>

              <!-- AI 对话模型 -->
              <template v-if="activeModelTab === 'ai'">
                <div :class="fieldClass"><label>模型供应商</label>
                  <select v-model="settings.modelProvider" :class="inputClass">
                    <option v-for="p in providerOptions" :key="p.value" :value="p.value">{{ p.label }}</option>
                  </select>
                </div>
                <div :class="fieldClass"><label>API Key</label><input v-model="settings.modelApiKey" :class="inputClass" placeholder="sk-..." /></div>
                <div :class="fieldClass"><label>模型名称</label><input v-model="settings.modelName" :class="inputClass" placeholder="gpt-4o" /></div>
                <div :class="fieldClass"><label>自定义 API 地址</label><input v-model="settings.modelBaseUrl" :class="inputClass" :placeholder="settings.modelProvider === 'custom-openai' ? '如 https://api.example.com/v1' : '留空使用默认'" />
                  <small v-if="settings.modelProvider === 'custom-openai'" class="mas-field-hint">请填写包含 /v1 路径的完整地址（系统会自动补全 /v1）</small>
                </div>
                <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('ai', modelFields)">
                  {{ savingSection === 'ai' ? '保存中' : '保存模型配置' }}
                </button>
                <div v-if="modelListShown && modelList.length" class="mas-model-list">
                  <p class="mas-model-list-title">服务商可用模型 ({{ modelList.length }})：</p>
                  <div class="mas-model-list-items">
                    <span v-for="m in modelList" :key="m" class="mas-model-tag" @click="settings.modelName = m">{{ m }}</span>
                  </div>
                </div>
                <div class="mas-test-btns">
                  <button class="mas-btn-test" :disabled="testingModel" @click="testModel(settings.modelProvider, settings.modelApiKey, settings.modelName, settings.modelBaseUrl)">
                    {{ testingModel ? '测试中...' : '测试连接' }}
                  </button>
                  <button class="mas-btn-list" :disabled="listingModels" @click="listModels(settings.modelApiKey, settings.modelBaseUrl, settings.modelProvider)">
                    {{ listingModels ? '拉取中...' : '拉取模型列表' }}
                  </button>
                </div>
              </template>

              <!-- 向量检索模型 -->
              <template v-if="activeModelTab === 'emb'">
                <div :class="fieldClass"><label>Embedding 供应商</label><input v-model="settings.embeddingProvider" :class="inputClass" /></div>
                <div :class="fieldClass"><label>Embedding API Key</label><input v-model="settings.embeddingApiKey" :class="inputClass" /></div>
                <div :class="fieldClass"><label>Embedding 模型</label><input v-model="settings.embeddingModel" :class="inputClass" /></div>
                <div :class="fieldClass"><label>Embedding 地址</label><input v-model="settings.embeddingBaseUrl" :class="inputClass" /></div>
                <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('emb', embFields)">
                  {{ savingSection === 'emb' ? '保存中' : '保存向量配置' }}
                </button>
                <div class="mas-test-btns">
                  <button class="mas-btn-test" :disabled="testingEmbedding" @click="testEmbedding(settings.embeddingProvider, settings.embeddingApiKey, settings.embeddingModel, settings.embeddingBaseUrl)">
                    {{ testingEmbedding ? '测试中...' : '测试连接' }}
                  </button>
                </div>
              </template>

              <!-- 图片生成模型 -->
              <template v-if="activeModelTab === 'image'">
                <div :class="fieldClass"><label>图片 API Key</label><input v-model="settings.imageApiKey" :class="inputClass" /></div>
                <div :class="fieldClass"><label>图片模型</label><input v-model="settings.imageModel" :class="inputClass" /></div>
                <div :class="fieldClass"><label>图片 API 地址</label><input v-model="settings.imageBaseUrl" :class="inputClass" /></div>
                <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('image', imageFields)">
                  {{ savingSection === 'image' ? '保存中' : '保存图片配置' }}
                </button>
                <div class="mas-test-btns">
                  <button class="mas-btn-test" :disabled="testingImage" @click="testImage(settings.imageApiKey, settings.imageModel, settings.imageBaseUrl)">
                    {{ testingImage ? '测试中...' : '测试连接' }}
                  </button>
                  <button class="mas-btn-list" :disabled="listingModels" @click="listModels(settings.imageApiKey, settings.imageBaseUrl, 'openai')">
                    {{ listingModels ? '拉取中...' : '拉取模型列表' }}
                  </button>
                </div>
              </template>

              <!-- 语音合成模型 -->
              <template v-if="activeModelTab === 'tts'">
                <div :class="fieldClass"><label>TTS 引擎</label>
                  <select v-model="settings.ttsEngine" :class="inputClass">
                    <option v-for="o in ttsEngineOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                </div>
                <div :class="fieldClass"><label>旁白引擎</label>
                  <select v-model="settings.ttsNarrationEngine" :class="inputClass">
                    <option v-for="o in narrationEngineOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                </div>
                <div :class="fieldClass"><label>Qwen3-TTS 地址</label><input v-model="settings.qwen3TtsUrl" :class="inputClass" /></div>
                <div :class="fieldClass"><label>Kokoro 地址</label><input v-model="settings.kokoroUrl" :class="inputClass" /></div>
                <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('tts', ttsFields)">
                  {{ savingSection === 'tts' ? '保存中' : '保存语音配置' }}
                </button>
              </template>
            </template>

            <!-- 热点趋势 -->
            <template v-if="activeSheet === 'trends'">
              <label :class="checkClass">
                <input v-model="settings.trendsEnabled" type="checkbox" />
                启用热点趋势分析
              </label>
              <p :class="subClass">搜索源配置</p>
              <div :class="fieldClass"><label>搜索引擎</label>
                <select v-model="settings.trendsSearchProvider" :class="inputClass">
                  <option v-for="o in trendsProviderOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div :class="fieldClass"><label>搜索 API Key</label>
                <input v-model="settings.trendsSearchApiKey" :class="inputClass" type="password" placeholder="留空表示不使用密钥" />
              </div>
              <div :class="fieldClass"><label>自定义 Base URL</label>
                <input v-model="settings.trendsSearchApiBaseUrl" :class="inputClass" placeholder="留空使用默认地址" />
              </div>
              <p :class="subClass">定时刷新</p>
              <div :class="rowClass">
                <div :class="fieldClass"><label>小时（0-23）</label>
                  <input v-model.number="settings.trendsScheduleHour" type="number" min="0" max="23" :class="inputClass" />
                </div>
                <div :class="fieldClass"><label>分钟（0-59）</label>
                  <input v-model.number="settings.trendsScheduleMinute" type="number" min="0" max="59" :class="inputClass" />
                </div>
              </div>
              <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('trends', trendsFields)">
                {{ savingSection === 'trends' ? '保存中' : '保存热点配置' }}
              </button>
            </template>

            <!-- 质量门禁 -->
            <template v-if="activeSheet === 'gate'">
              <p :class="subClass">角色一致性</p>
              <div :class="rowClass">
                <div :class="fieldClass"><label>冲突率</label><input v-model.number="settings.characterGuardrailMinConflictRate" type="number" step="0.01" :class="inputClass" /></div>
                <div :class="fieldClass"><label>人性化率</label><input v-model.number="settings.characterGuardrailMinHumanityRate" type="number" step="0.01" :class="inputClass" /></div>
              </div>
              <div :class="fieldClass"><label>稳定性</label><input v-model.number="settings.characterGuardrailMinStabilityScore" type="number" step="0.1" :class="inputClass" /></div>
              <p :class="subClass">去模板化</p>
              <div :class="rowClass">
                <div :class="fieldClass"><label>重复开头</label><input v-model.number="settings.antiTemplateRepeatedOpenerMinCount" type="number" :class="inputClass" /></div>
                <div :class="fieldClass"><label>重复套路</label><input v-model.number="settings.antiTemplateRepeatedClicheMinCount" type="number" :class="inputClass" /></div>
              </div>
              <div :class="fieldClass"><label>回溯章节数</label><input v-model.number="settings.antiTemplateLookbackChapters" type="number" :class="inputClass" /></div>
              <p :class="subClass">AI痕迹规避</p>
              <label :class="checkClass"><input v-model="settings.antiAiTellsEnabled" type="checkbox" />负面清单检测</label>
              <label :class="checkClass"><input v-model="settings.antiAiStructureEnabled" type="checkbox" />结构性检测</label>
              <p :class="subClass">门禁模式</p>
              <div v-for="g in [
                { key: 'worldGateMode' as keyof Settings, label: '世界观' },
                { key: 'outlineGateMode' as keyof Settings, label: '大纲' },
                { key: 'qualityGateMode' as keyof Settings, label: '质量' },
                { key: 'continuityGateMode' as keyof Settings, label: '连续性' },
                { key: 'powerRuleGateMode' as keyof Settings, label: '战力规则' },
              ]" :key="g.key" :class="fieldClass">
                <label>{{ g.label }}</label>
                <select v-model="settings[g.key]" :class="inputClass">
                  <option v-for="m in gateModes" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
              </div>
              <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('gate', gateFields)">
                {{ savingSection === 'gate' ? '保存中' : '保存门禁配置' }}
              </button>
            </template>

            <!-- 功能实验室 -->
            <template v-if="activeSheet === 'lab'">
              <div class="lab-search">
                <el-icon :size="16" class="lab-search__icon"><Search /></el-icon>
                <input
                  v-model="labSearchKeyword"
                  type="text"
                  placeholder="搜索开关..."
                  class="lab-search__input"
                />
              </div>

              <div class="lab-categories">
                <button
                  v-for="cat in labCategories"
                  :key="cat.key"
                  :class="['lab-cat', { active: labActiveCategory === cat.key && !labSearchKeyword }]"
                  type="button"
                  @click="selectLabCategory(cat.key)"
                >
                  {{ cat.label }}
                </button>
              </div>

              <div v-if="labSearchKeyword" class="lab-search-hint">
                搜索结果：{{ filteredToggles.length }} 个开关
              </div>

              <div v-for="[groupName, groupToggles] in groupedFilteredToggles" :key="groupName" class="lab-group">
                <div class="lab-group__title">{{ groupName }}</div>
                <div class="lab-group__items">
                  <div
                    v-for="toggle in groupToggles"
                    :key="toggle.key"
                    :class="['lab-toggle-item', { 'lab-toggle-item--danger': toggle.danger }]"
                  >
                    <div class="lab-toggle-item__info">
                      <div class="lab-toggle-item__label">
                        {{ toggle.label }}
                        <span v-if="toggle.experiment" class="lab-badge lab-badge--experiment">实验</span>
                        <span v-if="toggle.danger" class="lab-badge lab-badge--danger">危险</span>
                      </div>
                      <div v-if="toggle.description" class="lab-toggle-item__desc">
                        {{ toggle.description }}
                      </div>
                    </div>
                    <div class="lab-toggle-item__control">
                      <label v-if="toggle.type === 'boolean'" class="lab-switch">
                        <input v-model="(settings as any)[toggle.key]" type="checkbox" />
                        <span class="lab-switch__slider"></span>
                      </label>
                      <select
                        v-else-if="toggle.type === 'enum'"
                        v-model="(settings as any)[toggle.key]"
                        class="lab-select"
                      >
                        <option
                          v-for="opt in toggle.enumOptions"
                          :key="opt.value"
                          :value="opt.value"
                        >
                          {{ opt.label }}
                        </option>
                      </select>
                      <input
                        v-else-if="toggle.type === 'number'"
                        v-model.number="(settings as any)[toggle.key]"
                        type="number"
                        :min="toggle.numberMin"
                        :max="toggle.numberMax"
                        :step="toggle.numberStep"
                        class="lab-number"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="filteredToggles.length === 0" class="lab-empty">
                没有找到匹配的开关
              </div>

              <div class="lab-footer-spacer"></div>

              <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveLabToggles">
                {{ savingSection === 'lab' ? '保存中...' : '保存全部修改' }}
              </button>
            </template>

            <!-- 功能开关 -->
            <template v-if="activeSheet === 'toggles'">
              <p class="mobile-focus-note" style="margin-bottom: 12px;">
                以下开关也可在「功能实验室」中集中管理，这里提供快捷访问。
              </p>

              <!-- 创作功能 -->
              <div class="otg-section">
                <div class="otg-section__title">创作功能</div>
                <div class="otg-items">
                  <div
                    v-for="toggle in [
                      getToggleByKey('modelStreamingEnabled'),
                      getToggleByKey('superLongModeEnabled'),
                      getToggleByKey('truthFilesEnabled'),
                      getToggleByKey('structuredAuditEnabled'),
                      getToggleByKey('snapshotEnabled'),
                      getToggleByKey('autoRevisionEnabled'),
                      getToggleByKey('qualityFloorRevisionEnabled'),
                      getToggleByKey('autoCurateEnabled'),
                      getToggleByKey('autoFinalizeEnabled'),
                      getToggleByKey('authorNoteEnabled'),
                      getToggleByKey('chapterLengthGuardEnabled'),
                    ].filter(Boolean)"
                    :key="(toggle as any).key"
                    class="lab-toggle-item"
                  >
                    <div class="lab-toggle-item__info">
                      <div class="lab-toggle-item__label">
                        {{ (toggle as any).label }}
                        <span v-if="(toggle as any).experiment" class="lab-badge lab-badge--experiment">实验</span>
                      </div>
                      <div v-if="(toggle as any).description" class="lab-toggle-item__desc">
                        {{ (toggle as any).description }}
                      </div>
                    </div>
                    <div class="lab-toggle-item__control">
                      <label class="lab-switch">
                        <input v-model="(settings as any)[(toggle as any).key]" type="checkbox" />
                        <span class="lab-switch__slider"></span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 世界观与追踪 -->
              <div class="otg-section">
                <div class="otg-section__title">世界观与追踪</div>
                <div class="otg-items">
                  <div
                    v-for="toggle in [
                      getToggleByKey('worldContractEnabled'),
                      getToggleByKey('worldRetrievalV2Enabled'),
                      getToggleByKey('aiTraceGateMode'),
                    ].filter(Boolean)"
                    :key="(toggle as any).key"
                    class="lab-toggle-item"
                  >
                    <div class="lab-toggle-item__info">
                      <div class="lab-toggle-item__label">
                        {{ (toggle as any).label }}
                        <span v-if="(toggle as any).experiment" class="lab-badge lab-badge--experiment">实验</span>
                      </div>
                      <div v-if="(toggle as any).description" class="lab-toggle-item__desc">
                        {{ (toggle as any).description }}
                      </div>
                    </div>
                    <div class="lab-toggle-item__control">
                      <label v-if="(toggle as any).type === 'boolean'" class="lab-switch">
                        <input v-model="(settings as any)[(toggle as any).key]" type="checkbox" />
                        <span class="lab-switch__slider"></span>
                      </label>
                      <select
                        v-else-if="(toggle as any).type === 'enum'"
                        v-model="(settings as any)[(toggle as any).key]"
                        class="lab-select"
                      >
                        <option
                          v-for="opt in (toggle as any).enumOptions"
                          :key="opt.value"
                          :value="opt.value"
                        >
                          {{ opt.label }}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 实验功能 -->
              <div class="otg-section">
                <div class="otg-section__title">实验功能</div>
                <div class="otg-items">
                  <div
                    v-for="toggle in [
                      getToggleByKey('comicChapterEnabled'),
                      getToggleByKey('audiobookAccessMode'),
                    ].filter(Boolean)"
                    :key="(toggle as any).key"
                    class="lab-toggle-item lab-toggle-item--danger"
                  >
                    <div class="lab-toggle-item__info">
                      <div class="lab-toggle-item__label">
                        {{ (toggle as any).label }}
                        <span class="lab-badge lab-badge--experiment">实验</span>
                        <span class="lab-badge lab-badge--danger">危险</span>
                      </div>
                      <div v-if="(toggle as any).description" class="lab-toggle-item__desc">
                        {{ (toggle as any).description }}
                      </div>
                    </div>
                    <div class="lab-toggle-item__control">
                      <label class="lab-switch">
                        <input v-model="(settings as any)[(toggle as any).key]" type="checkbox" />
                        <span class="lab-switch__slider"></span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 修订参数 -->
              <div class="otg-section">
                <div class="otg-section__title">修订参数</div>
                <div class="otg-items">
                  <div class="otg-param-item">
                    <div class="otg-param-item__label">评分阈值</div>
                    <input
                      v-model.number="settings.autoRevisionScoreThreshold"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      class="lab-number"
                    />
                  </div>
                  <div class="otg-param-item">
                    <div class="otg-param-item__label">最大轮次</div>
                    <input
                      v-model.number="settings.autoRevisionMaxRounds"
                      type="number"
                      min="1"
                      max="10"
                      class="lab-number"
                    />
                  </div>
                  <div class="otg-param-item">
                    <div class="otg-param-item__label">章节守卫触发%</div>
                    <input
                      v-model.number="settings.chapterLengthGuardTriggerPercent"
                      type="number"
                      min="0"
                      max="100"
                      class="lab-number"
                    />
                  </div>
                  <div class="otg-param-item">
                    <div class="otg-param-item__label">章节守卫允许%</div>
                    <input
                      v-model.number="settings.chapterLengthGuardAllowedPercent"
                      type="number"
                      min="0"
                      max="100"
                      class="lab-number"
                    />
                  </div>
                </div>
              </div>

              <div class="lab-footer-spacer"></div>
              <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('toggles', toggleFields)">
                {{ savingSection === 'toggles' ? '保存中...' : '保存开关配置' }}
              </button>
            </template>

            <!-- 注册与密码 -->
            <template v-if="activeSheet === 'auth'">
              <div class="mas-section-title">注册防护</div>
              <label :class="checkClass"><input v-model="settings.registrationProtectionEnabled" type="checkbox" />启用注册保护</label>
              <div :class="fieldClass"><label>每小时注册上限（每IP）</label><input v-model.number="settings.registrationProtectionRegPerHour" type="number" min="1" max="20" :class="inputClass" /></div>
              <div :class="fieldClass"><label>每天注册上限（每IP）</label><input v-model.number="settings.registrationProtectionRegPerDay" type="number" min="1" max="50" :class="inputClass" /></div>
              <div :class="fieldClass"><label>新用户冷静期（小时，0=关闭）</label><input v-model.number="settings.newUserCooldownHours" type="number" min="0" max="720" :class="inputClass" /></div>
              <p class="mobile-focus-note">注册后在此时间内禁止发布作品到书城</p>

              <div class="mas-section-title">封面安全</div>
              <label :class="checkClass"><input v-model="settings.disableCoverUpload" type="checkbox" />关闭手动上传封面</label>
              <p class="mobile-focus-note">仅允许AI生成封面，从源头杜绝违规图片</p>

              <div class="mas-section-title">发布限制</div>
              <div :class="fieldClass"><label>每月发布上限（基础）</label><input v-model.number="settings.publishMaxPerMonth" type="number" min="1" max="50" :class="inputClass" /></div>
              <p class="mobile-focus-note">单本优质作品可解锁额外配额（下方阈值设置）</p>
              <div :class="swatchClass">
                <div :class="fieldClass"><label>阅读量≥</label><input v-model.number="settings.publishUnlockReads" type="number" min="1" max="100000" :class="inputClass" /></div>
                <div :class="fieldClass"><label>点赞≥</label><input v-model.number="settings.publishUnlockLikes" type="number" min="0" max="10000" :class="inputClass" /></div>
                <div :class="fieldClass"><label>收藏≥</label><input v-model.number="settings.publishUnlockFavorites" type="number" min="0" max="10000" :class="inputClass" /></div>
                <div :class="fieldClass"><label>章节数≥</label><input v-model.number="settings.publishUnlockChapters" type="number" min="1" max="500" :class="inputClass" /></div>
              </div>
              <p class="mobile-focus-note">四项全部达标解锁 1 个额外发布位，可叠加</p>

              <div class="mas-section-title">密码策略</div>
              <div :class="fieldClass"><label>密码最小长度</label><input v-model.number="settings.authPasswordMinLength" type="number" min="4" max="32" :class="inputClass" /></div>
              <div :class="swatchClass">
                <label :class="checkClass"><input v-model="settings.authPasswordRequireLowercase" type="checkbox" />小写字母</label>
                <label :class="checkClass"><input v-model="settings.authPasswordRequireUppercase" type="checkbox" />大写字母</label>
                <label :class="checkClass"><input v-model="settings.authPasswordRequireNumbers" type="checkbox" />数字</label>
                <label :class="checkClass"><input v-model="settings.authPasswordRequireSpecialChars" type="checkbox" />特殊字符</label>
              </div>
              <label :class="checkClass"><input v-model="settings.userApiFeatureEnabled" type="checkbox" />启用用户自带API</label>
              <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('auth', authFields)">
                {{ savingSection === 'auth' ? '保存中' : '保存认证配置' }}
              </button>
            </template>

            <!-- SMTP -->
            <template v-if="activeSheet === 'smtp'">
              <div :class="fieldClass"><label>SMTP 主机</label><input v-model="settings.smtpHost" :class="inputClass" /></div>
              <div :class="rowClass">
                <div :class="fieldClass"><label>端口</label><input v-model.number="settings.smtpPort" type="number" :class="inputClass" /></div>
                <div :class="fieldClass"><label :class="checkClass" style="margin-top:18px"><input v-model="settings.smtpSecure" type="checkbox" />SSL</label></div>
              </div>
              <div :class="fieldClass"><label>用户名</label><input v-model="settings.smtpUser" :class="inputClass" /></div>
              <div :class="fieldClass"><label>授权码</label><input v-model="settings.smtpPass" type="password" :class="inputClass" /></div>
              <div :class="fieldClass"><label>发件人</label><input v-model="settings.smtpFrom" :class="inputClass" /></div>
              <div :class="fieldClass"><label>平台 URL</label><input v-model="settings.platformUrl" :class="inputClass" /></div>
              <label :class="checkClass"><input v-model="settings.commentEnabled" type="checkbox" />启用评论</label>
              <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('smtp', smtpFields)">
                {{ savingSection === 'smtp' ? '保存中' : '保存邮件配置' }}
              </button>
            </template>

            <!-- 首页配置 -->
            <template v-if="activeSheet === 'homepage'">
              <p class="mobile-focus-note">JSON 格式，修改 hero / showcase / footer 等区块</p>
              <textarea v-model="homepageJson" class="mas-textarea" rows="12" />
              <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('homepage', homepageFields)">
                {{ savingSection === 'homepage' ? '保存中' : '保存首页配置' }}
              </button>
            </template>

            <!-- 运营配置（整合首页/邮件/通知） -->
            <template v-if="activeSheet === 'ops'">
              <!-- Tab 导航 -->
              <div class="ops-tabs">
                <button
                  v-for="tab in opsTabs"
                  :key="tab.key"
                  :class="['ops-tab', { active: activeOpsTab === tab.key }]"
                  type="button"
                  @click="activeOpsTab = tab.key; if (tab.key === 'notify') loadBroadcasts();"
                >
                  {{ tab.label }}
                </button>
              </div>

              <!-- 首页配置 -->
              <template v-if="activeOpsTab === 'homepage'">
                <p class="mobile-focus-note">JSON 格式，修改 hero / showcase / footer 等区块</p>
                <textarea v-model="homepageJson" class="mas-textarea" rows="12" />
                <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('homepage', homepageFields)">
                  {{ savingSection === 'homepage' ? '保存中' : '保存首页配置' }}
                </button>
              </template>

              <!-- 邮件服务 -->
              <template v-if="activeOpsTab === 'smtp'">
                <div :class="fieldClass"><label>SMTP 主机</label><input v-model="settings.smtpHost" :class="inputClass" /></div>
                <div :class="rowClass">
                  <div :class="fieldClass"><label>端口</label><input v-model.number="settings.smtpPort" type="number" :class="inputClass" /></div>
                  <div :class="fieldClass"><label :class="checkClass" style="margin-top:18px"><input v-model="settings.smtpSecure" type="checkbox" />SSL</label></div>
                </div>
                <div :class="fieldClass"><label>用户名</label><input v-model="settings.smtpUser" :class="inputClass" /></div>
                <div :class="fieldClass"><label>授权码</label><input v-model="settings.smtpPass" type="password" :class="inputClass" /></div>
                <div :class="fieldClass"><label>发件人</label><input v-model="settings.smtpFrom" :class="inputClass" /></div>
                <div :class="fieldClass"><label>平台 URL</label><input v-model="settings.platformUrl" :class="inputClass" /></div>
                <label :class="checkClass"><input v-model="settings.commentEnabled" type="checkbox" />启用评论</label>
                <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('smtp', smtpFields)">
                  {{ savingSection === 'smtp' ? '保存中' : '保存邮件配置' }}
                </button>
              </template>

              <!-- 通知消息 -->
              <template v-if="activeOpsTab === 'notify'">
                <p class="mobile-focus-note">向指定用户或全部用户发送通知消息（会在消息中心显示）。</p>
                <div :class="fieldClass"><label>标题（最多80字）</label>
                  <input v-model="notifyTitle" maxlength="80" placeholder="例如：系统维护通知" :class="inputClass" />
                </div>
                <div :class="fieldClass"><label>内容（最多600字）</label>
                  <textarea v-model="notifyBody" maxlength="600" rows="3" placeholder="输入通知内容..." :class="['mas-input', 'mas-textarea', 'mas-textarea--tall']" />
                </div>
                <div :class="fieldClass"><label>目标用户 ID（留空发送给全部用户）</label>
                  <input v-model="notifyTarget" placeholder="留空 = 全部用户" :class="inputClass" />
                </div>
                <button :class="saveBtnClass" :disabled="notifySending" @click="sendNotification()">
                  {{ notifySending ? '发送中' : editingId ? '修改并重发' : '发送通知' }}
                </button>
                <button v-if="editingId" class="mobile-focus-button--ghost mas-cancel-edit" @click="cancelEdit()">取消编辑</button>

                <!-- 已发通知列表 -->
                <div v-if="broadcastList.length > 0" class="mas-broadcast-section">
                  <h4 class="mas-broadcast-title">已发通知（{{ broadcastList.length }}）</h4>
                  <div
                    v-for="b in broadcastList"
                    :key="b.id"
                    :class="['mas-broadcast-card', b.revokedAt ? 'mas-broadcast-card--revoked' : '']"
                  >
                    <div class="mas-bc-row">
                       <div class="mas-bc-main">
                         <span :class="['mas-bc-title', b.revokedAt ? 'mas-bc-title--revoked' : '']">{{ b.title }}</span>
                         <span v-if="b.revokedAt" class="mas-bc-revoked-badge">已撤销</span>
                       </div>
                       <div class="mas-bc-actions">
                         <button v-if="!b.revokedAt" class="mas-bc-btn mas-bc-btn--edit" :disabled="!!actionId" @click="editBroadcast(b)">编辑</button>
                         <button v-if="!b.revokedAt" class="mas-bc-btn mas-bc-btn--revoke" :disabled="actionId === b.id" @click="revokeBroadcast(b.id)">{{ actionId === b.id ? '...' : '撤销' }}</button>
                         <button v-if="b.revokedAt" class="mas-bc-btn mas-bc-btn--delete" :disabled="actionId === b.id" @click="deleteBroadcastHistory(b.id)">{{ actionId === b.id ? '...' : '删除' }}</button>
                       </div>
                     </div>
                    <div class="mas-bc-body">
                      {{ b.body.length > 60 ? b.body.slice(0, 60) + '...' : b.body }}
                    </div>
                    <div class="mas-bc-meta">
                      {{ fmtTime(b.sentAt) }} · {{ b.sentCount }} 人{{ b.targetUserId ? ' · 定向' : '' }}
                    </div>
                  </div>
                </div>
              </template>
            </template>

            <!-- 合规备案 -->
            <template v-if="activeSheet === 'compliance'">
              <div :class="fieldClass"><label>平台/公司名称</label><input v-model="settings.homepageConfig.footer.companyName" :class="inputClass" :placeholder="brand.displayName" /></div>
              <div :class="fieldClass"><label>版权文案</label><input v-model="settings.homepageConfig.footer.copyrightText" :class="inputClass" placeholder="Copyright © 2026 ..." /></div>
              <div :class="fieldClass"><label>ICP 备案号</label><input v-model="settings.homepageConfig.footer.icpNumber" :class="inputClass" placeholder="如：京ICP备XXXXXXXX号" /></div>
              <div :class="fieldClass"><label>ICP 备案链接</label><input v-model="settings.homepageConfig.footer.icpLink" :class="inputClass" placeholder="https://beian.miit.gov.cn/" /></div>
              <div :class="fieldClass"><label>公安备案号</label><input v-model="settings.homepageConfig.footer.policeNumber" :class="inputClass" placeholder="如：京公网安备 XXXXXXXXXXXX号" /></div>
              <div :class="fieldClass"><label>公安备案链接</label><input v-model="settings.homepageConfig.footer.policeLink" :class="inputClass" placeholder="https://beian.mps.gov.cn/" /></div>
              <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('compliance', homepageFields)">
                {{ savingSection === 'compliance' ? '保存中' : '保存合规信息' }}
              </button>
            </template>

            <!-- 友情链接 -->
            <template v-if="activeSheet === 'friendlyLinks'">
              <p class="mobile-focus-note">设置 Token 申请等第三方平台链接，用户只能看到已启用的链接</p>
              <div class="fl-link-list">
                <div v-for="link in friendlyLinksLocal" :key="link.id" class="fl-link-row">
                  <label class="fl-link-toggle">
                    <input type="checkbox" :checked="link.enabled" @change="toggleFriendlyLink(link.id)" />
                    <span class="fl-link-name">{{ link.name }}</span>
                  </label>
                  <span class="fl-link-url">{{ link.url }}</span>
                  <button class="fl-link-del" @click="removeFriendlyLink(link.id)">删除</button>
                </div>
                <div v-if="friendlyLinksLocal.length === 0" class="fl-link-empty">暂无链接</div>
              </div>
              <div class="fl-link-add">
                <input v-model="newLinkName" placeholder="链接名称（如：Token申请）" :class="inputClass" style="flex:1" />
                <input v-model="newLinkUrl" placeholder="https://..." :class="inputClass" style="flex:1" />
                <button class="fl-link-add-btn" @click="addFriendlyLink">添加</button>
              </div>
              <button :class="saveBtnClass" :disabled="!!savingSection" @click="saveSection('friendlyLinks', friendlyLinksFields)">
                {{ savingSection === 'friendlyLinks' ? '保存中' : '保存友情链接' }}
              </button>
            </template>

            <!-- 管理员通知 -->
            <template v-if="activeSheet === 'notify'">
              <p class="mobile-focus-note">向指定用户或全部用户发送通知消息（会在消息中心显示）。</p>
              <div :class="fieldClass"><label>标题（最多80字）</label>
                <input v-model="notifyTitle" maxlength="80" placeholder="例如：系统维护通知" :class="inputClass" />
              </div>
              <div :class="fieldClass"><label>内容（最多600字）</label>
                <textarea v-model="notifyBody" maxlength="600" rows="3" placeholder="输入通知内容..." :class="['mas-input', 'mas-textarea', 'mas-textarea--tall']" />
              </div>
              <div :class="fieldClass"><label>目标用户 ID（留空发送给全部用户）</label>
                <input v-model="notifyTarget" placeholder="留空 = 全部用户" :class="inputClass" />
              </div>
              <button :class="saveBtnClass" :disabled="notifySending" @click="sendNotification()">
                {{ notifySending ? '发送中' : editingId ? '修改并重发' : '发送通知' }}
              </button>
              <button v-if="editingId" class="mobile-focus-button--ghost mas-cancel-edit" @click="cancelEdit()">取消编辑</button>

              <!-- 已发通知列表 -->
              <div v-if="broadcastList.length > 0" class="mas-broadcast-section">
                <h4 class="mas-broadcast-title">已发通知（{{ broadcastList.length }}）</h4>
                <div
                  v-for="b in broadcastList"
                  :key="b.id"
                  :class="['mas-broadcast-card', b.revokedAt ? 'mas-broadcast-card--revoked' : '']"
                >
                  <div class="mas-bc-row">
                     <div class="mas-bc-main">
                       <span :class="['mas-bc-title', b.revokedAt ? 'mas-bc-title--revoked' : '']">{{ b.title }}</span>
                       <span v-if="b.revokedAt" class="mas-bc-revoked-badge">已撤销</span>
                     </div>
                     <div class="mas-bc-actions">
                       <button v-if="!b.revokedAt" class="mas-bc-btn mas-bc-btn--edit" :disabled="!!actionId" @click="editBroadcast(b)">编辑</button>
                       <button v-if="!b.revokedAt" class="mas-bc-btn mas-bc-btn--revoke" :disabled="actionId === b.id" @click="revokeBroadcast(b.id)">{{ actionId === b.id ? '...' : '撤销' }}</button>
                       <button v-if="b.revokedAt" class="mas-bc-btn mas-bc-btn--delete" :disabled="actionId === b.id" @click="deleteBroadcastHistory(b.id)">{{ actionId === b.id ? '...' : '删除' }}</button>
                     </div>
                   </div>
                  <div class="mas-bc-body">
                    {{ b.body.length > 60 ? b.body.slice(0, 60) + '...' : b.body }}
                  </div>
                  <div class="mas-bc-meta">
                    {{ fmtTime(b.sentAt) }} · {{ b.sentCount }} 人{{ b.targetUserId ? ' · 定向' : '' }}
                  </div>
                </div>
              </div>
            </template>

          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mobile-admin-page { --mobile-focus-accent: var(--star-brand-sky, #0ea5e9); --mobile-focus-accent-strong: var(--star-brand-teal, #14b8a6); padding-bottom: 40px; }

/* ── 图标网格 ── */
.mas-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
@media (min-width: 420px) { .mas-grid { grid-template-columns: repeat(3, 1fr); } }
.mas-tile {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 18px 8px 14px;
  border: 1px solid color-mix(in srgb, var(--nw-text-primary) 10%, transparent);
  border-radius: 18px;
  background: var(--mobile-focus-surface);
  backdrop-filter: blur(10px);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.mas-tile:active { transform: scale(0.95); border-color: color-mix(in srgb, var(--mobile-focus-accent) 35%, transparent); box-shadow: 0 4px 14px color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent); }
.mas-tile__icon {
  width: 44px; height: 44px; border-radius: 14px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--mobile-focus-accent) 14%, transparent), color-mix(in srgb, var(--mobile-focus-accent-strong) 8%, transparent));
  display: flex; align-items: center; justify-content: center;
  color: var(--mobile-focus-accent);
}
.mas-tile__label { font-size: 13px; font-weight: 700; color: var(--nw-text-primary); line-height: 1.2; }
.mas-tile__desc { font-size: 11px; color: var(--nw-text-muted); font-weight: 500; }

/* ── 底部弹出层 ── */
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
.mas-sheet .mobile-focus-note { color: var(--nw-text-secondary); opacity: 1; }
.mas-sheet button,
.mas-sheet input,
.mas-sheet select,
.mas-sheet textarea { font-family: inherit; }

/* ── 表单组件 ── */
.mas-field { display: grid; gap: 4px; }
.mas-field label { font-size: 12px; font-weight: 600; color: var(--nw-text-secondary); }
.mas-field-hint { font-size: 11px; color: var(--nw-text-muted); margin-top: 2px; }
.mas-input {
  width: 100%; min-height: 38px; padding: 0 12px;
  border: 1px solid var(--nw-border); border-radius: 10px;
  background: var(--mobile-focus-surface-muted); color: var(--nw-text-primary); font-size: 13px; outline: none;
  -webkit-text-fill-color: var(--nw-text-primary);
}
.mas-input::placeholder { color: var(--nw-text-muted); opacity: 1; -webkit-text-fill-color: var(--nw-text-muted); }
.mas-input:focus { border-color: var(--mobile-focus-accent); background: var(--mobile-focus-surface-strong); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mobile-focus-accent) 8%, transparent); }
.mas-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mas-swatch { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.mas-check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--nw-text-secondary); cursor: pointer; }
.mas-check input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--mobile-focus-accent); }
.mas-sub {
  margin: 4px 0 0; font-size: 11px; font-weight: 700; color: var(--nw-text-muted);
  text-transform: uppercase; letter-spacing: 0.06em;
  padding-top: 4px; border-top: 1px solid color-mix(in srgb, var(--nw-text-primary) 10%, transparent);
}
.mas-section-title {
  margin: 6px 0 2px; font-size: 12px; font-weight: 700; color: var(--mobile-focus-accent, #0ea5e9);
  text-transform: none; letter-spacing: 0.02em;
}
.mas-save {
  position: fixed;
  left: 20px;
  right: 20px;
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  z-index: 230;
  width: auto; min-height: 44px;
  border: none; border-radius: 12px;
  background: linear-gradient(135deg, var(--mobile-focus-accent, #0ea5e9), var(--mobile-focus-accent-strong, #14b8a6));
  color: var(--mobile-focus-on-accent, #fff); font-size: 14px; font-weight: 700; cursor: pointer;
  transition: opacity 0.15s;
  box-shadow: 0 12px 26px color-mix(in srgb, var(--nw-text-primary) 20%, transparent);
  margin-top: 8px;
  flex-shrink: 0;
}
.mas-save:disabled { opacity: 0.72; cursor: not-allowed; }
.mas-textarea { width: 100%; padding: 12px; border: 1px solid var(--nw-border); border-radius: 12px; background: var(--mobile-focus-surface-muted); color: var(--nw-text-primary); font-size: 12px; font-family: ui-monospace, monospace; resize: vertical; outline: none; -webkit-text-fill-color: var(--nw-text-primary); }
.mas-textarea::placeholder { color: var(--nw-text-muted); opacity: 1; -webkit-text-fill-color: var(--nw-text-muted); }
.mas-textarea--tall { min-height: 70px; padding: 8px 12px; resize: vertical; }
.mas-input--auto { width: auto; min-width: 80px; }
.mas-cancel-edit { margin-top: 6px; width: 100%; justify-content: center; }

/* ── 测试按钮 ── */
.mas-test-btns { display: flex; gap: 8px; margin-top: 4px; }
.mas-btn-test {
  flex: 1; min-height: 34px; border: 1px solid var(--mobile-focus-accent); border-radius: 10px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 8%, transparent); color: var(--mobile-focus-accent);
  font-size: 12px; font-weight: 600; cursor: pointer;
}
.mas-btn-test:disabled { opacity: 0.72; cursor: not-allowed; }
.mas-btn-list {
  flex: 1; min-height: 34px; border: 1px solid color-mix(in srgb, #f59e0b 60%, transparent); border-radius: 10px;
  background: color-mix(in srgb, #f59e0b 8%, transparent); color: color-mix(in srgb, #f59e0b 80%, var(--nw-text-primary));
  font-size: 12px; font-weight: 600; cursor: pointer;
}
.mas-btn-list:disabled { opacity: 0.72; cursor: not-allowed; }

/* ── 模型列表 ── */
.mas-model-list { padding: 10px; border: 1px solid color-mix(in srgb, var(--nw-text-primary) 10%, transparent); border-radius: 10px; background: var(--mobile-focus-surface); }
.mas-model-list-title { margin: 0 0 8px; font-size: 12px; color: var(--nw-text-muted); font-weight: 600; }
.mas-model-list-items { display: flex; flex-wrap: wrap; gap: 6px; }
.mas-model-tag {
  display: inline-block; padding: 3px 10px; border: 1px solid var(--nw-border);
  border-radius: 999px; font-size: 11px; color: var(--nw-text-secondary);
  background: var(--mobile-focus-surface-muted); cursor: pointer; white-space: nowrap;
}
.mas-model-tag:hover { border-color: var(--mobile-focus-accent); color: var(--mobile-focus-accent); background: color-mix(in srgb, var(--mobile-focus-accent) 8%, transparent); }

/* ── 友情链接 ── */
.fl-link-list { display: flex; flex-direction: column; gap: 6px; }
.fl-link-row {
  display: flex; align-items: center; gap: 8px; padding: 9px 10px;
  min-width: 0;
  background: var(--mobile-focus-surface-strong); border-radius: 10px;
  border: 1px solid var(--nw-border);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--nw-text-primary) 5%, transparent);
}
.fl-link-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; min-width: 0; flex: 0 1 110px; }
.fl-link-toggle input[type="checkbox"] { width: 14px; height: 14px; accent-color: var(--mobile-focus-accent); flex-shrink: 0; }
.fl-link-name { font-size: 13px; font-weight: 700; color: var(--nw-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; }
.fl-link-url { flex: 1; min-width: 0; font-size: 11px; font-weight: 600; color: var(--nw-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fl-link-del { flex-shrink: 0; border: 1px solid color-mix(in srgb, #ef4444 18%, transparent); border-radius: 8px; background: color-mix(in srgb, #ef4444 8%, transparent); color: color-mix(in srgb, #ef4444 80%, var(--nw-text-primary)); font-size: 11px; font-weight: 700; cursor: pointer; padding: 3px 7px; }
.fl-link-empty { padding: 12px; text-align: center; color: var(--nw-text-secondary); font-size: 13px; font-weight: 600; }
.fl-link-add { display: flex; gap: 6px; }
.fl-link-add .mas-input { min-width: 0; }
.fl-link-add-btn {
  width: 48px; flex-shrink: 0; border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 35%, transparent); border-radius: 8px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 12%, transparent); color: var(--mobile-focus-accent); font-size: 12px; font-weight: 700; cursor: pointer;
}

/* ── 通知广播卡片 ── */
.mas-broadcast-section { margin-top: 18px; }
.mas-broadcast-title { font-size: 13px; font-weight: 700; color: var(--nw-text-secondary); margin: 0 0 8px; }
.mas-broadcast-card {
  padding: 10px 12px; border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--nw-text-primary) 8%, transparent);
  margin-bottom: 8px; background: var(--mobile-focus-surface);
}
.mas-bc-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
.mas-bc-main { flex: 1; min-width: 0; }
.mas-bc-title { font-size: 13px; font-weight: 700; color: var(--nw-text-primary); word-break: break-all; }
.mas-bc-title--revoked { color: var(--nw-text-muted); }
.mas-bc-revoked-badge { font-size: 10px; font-weight: 700; color: color-mix(in srgb, #ef4444 80%, var(--nw-text-primary)); margin-left: 6px; }
.mas-bc-actions { display: flex; gap: 4px; flex-shrink: 0; }
.mas-bc-btn {
  border-radius: 6px; font-size: 11px; font-weight: 600;
  padding: 3px 8px; cursor: pointer; border: 1px solid transparent;
}
.mas-bc-btn--edit { border-color: color-mix(in srgb, var(--mobile-focus-accent) 25%, transparent); background: color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent); color: var(--mobile-focus-accent); }
.mas-bc-btn--revoke { border-color: color-mix(in srgb, #ef4444 25%, transparent); background: color-mix(in srgb, #ef4444 8%, transparent); color: color-mix(in srgb, #ef4444 80%, var(--nw-text-primary)); }
.mas-bc-btn--delete { border-color: var(--nw-border); background: var(--mobile-focus-surface-muted); color: var(--nw-text-muted); }
.mas-bc-body { font-size: 12px; color: var(--nw-text-muted); margin-top: 3px; line-height: 1.4; word-break: break-all; }
.mas-bc-meta { font-size: 11px; color: var(--nw-text-muted); margin-top: 4px; }

/* ── 高亮导航卡片 ── */
.mas-tile--highlight {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 35%, transparent);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--mobile-focus-accent) 8%, transparent),
    color-mix(in srgb, var(--mobile-focus-accent-strong) 6%, transparent)
  );
}
.mas-tile--highlight .mas-tile__icon {
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent, #fff);
}
.mas-tile--highlight .mas-tile__label {
  color: var(--mobile-focus-accent);
}

/* ── 功能实验室 ── */
.lab-search {
  position: relative;
  margin-bottom: 12px;
}
.lab-search__icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--nw-text-muted);
}
.lab-search__input {
  width: 100%;
  min-height: 40px;
  padding: 0 12px 0 36px;
  border: 1px solid var(--nw-border);
  border-radius: 12px;
  background: var(--mobile-focus-surface-muted);
  color: var(--nw-text-primary);
  font-size: 13px;
  outline: none;
  -webkit-text-fill-color: var(--nw-text-primary);
  font-family: inherit;
}
.lab-search__input:focus {
  border-color: var(--mobile-focus-accent);
  background: var(--mobile-focus-surface-strong);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent);
}
.lab-search__input::placeholder {
  color: var(--nw-text-muted);
  opacity: 1;
  -webkit-text-fill-color: var(--nw-text-muted);
}

.lab-categories {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 8px;
  margin-bottom: 8px;
  -webkit-overflow-scrolling: touch;
}
.lab-categories::-webkit-scrollbar {
  display: none;
}
.lab-cat {
  flex-shrink: 0;
  padding: 6px 14px;
  border: 1px solid var(--nw-border);
  border-radius: 999px;
  background: var(--mobile-focus-surface-muted);
  color: var(--nw-text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}
.lab-cat.active {
  border-color: var(--mobile-focus-accent);
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent, #fff);
}

.lab-search-hint {
  font-size: 12px;
  color: var(--nw-text-muted);
  margin-bottom: 8px;
  font-weight: 500;
}

.lab-group {
  margin-bottom: 16px;
}
.lab-group__title {
  font-size: 11px;
  font-weight: 700;
  color: var(--nw-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
  padding-left: 2px;
}
.lab-group__items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lab-toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: var(--mobile-focus-surface-muted);
  border: 1px solid color-mix(in srgb, var(--nw-text-primary) 10%, transparent);
  border-radius: 14px;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.lab-toggle-item:hover {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 25%, transparent);
  background: color-mix(in srgb, var(--mobile-focus-accent) 6%, transparent);
}
.lab-toggle-item--danger {
  border-color: color-mix(in srgb, #ef4444 20%, transparent);
}
.lab-toggle-item--danger:hover {
  border-color: color-mix(in srgb, #ef4444 35%, transparent);
  background: color-mix(in srgb, #ef4444 8%, transparent);
}

.lab-toggle-item__info {
  flex: 1;
  min-width: 0;
}
.lab-toggle-item__label {
  font-size: 14px;
  font-weight: 700;
  color: var(--nw-text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.lab-toggle-item__desc {
  font-size: 12px;
  color: var(--nw-text-muted);
  margin-top: 2px;
  line-height: 1.4;
}

.lab-toggle-item__control {
  flex-shrink: 0;
}

.lab-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
}
.lab-badge--experiment {
  background: color-mix(in srgb, #f59e0b 12%, transparent);
  color: color-mix(in srgb, #f59e0b 80%, var(--nw-text-primary));
}
.lab-badge--danger {
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: color-mix(in srgb, #ef4444 80%, var(--nw-text-primary));
}

/* 自定义开关样式 */
.lab-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 26px;
  flex-shrink: 0;
  cursor: pointer;
}
.lab-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.lab-switch__slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: color-mix(in srgb, var(--nw-text-primary) 20%, transparent);
  border-radius: 26px;
  transition: 0.2s;
}
.lab-switch__slider::before {
  content: '';
  position: absolute;
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background: var(--mobile-focus-on-accent, #fff);
  border-radius: 50%;
  transition: 0.2s;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--nw-text-primary) 15%, transparent);
}
.lab-switch input:checked + .lab-switch__slider {
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
}
.lab-switch input:checked + .lab-switch__slider::before {
  transform: translateX(18px);
}

.lab-select {
  min-height: 32px;
  padding: 0 28px 0 10px;
  border: 1px solid var(--nw-border);
  border-radius: 8px;
  background: var(--mobile-focus-surface-strong);
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  font-family: inherit;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 12px;
}
.lab-select:focus {
  border-color: var(--mobile-focus-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent);
}

.lab-number {
  width: 80px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--nw-border);
  border-radius: 8px;
  background: var(--mobile-focus-surface-strong);
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 600;
  text-align: right;
  outline: none;
  font-family: inherit;
}
.lab-number:focus {
  border-color: var(--mobile-focus-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent);
}

.lab-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--nw-text-muted);
  font-size: 13px;
  font-weight: 500;
}

.lab-footer-spacer {
  height: 70px;
}

/* ── 功能开关弹窗（统一样式） ── */
.otg-section {
  margin-bottom: 20px;
}
.otg-section__title {
  font-size: 11px;
  font-weight: 700;
  color: var(--nw-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
  padding-left: 2px;
}
.otg-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.otg-param-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--mobile-focus-surface-muted);
  border: 1px solid color-mix(in srgb, var(--nw-text-primary) 10%, transparent);
  border-radius: 12px;
}
.otg-param-item__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-secondary);
}

/* ── 模型配置 Tab ── */
.model-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-text-primary) 10%, transparent);
}
.model-tab {
  flex: 1;
  min-height: 36px;
  padding: 6px 8px;
  border: 1px solid var(--nw-border);
  border-radius: 10px;
  background: var(--mobile-focus-surface-muted);
  color: var(--nw-text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
  white-space: nowrap;
}
.model-tab.active {
  border-color: var(--mobile-focus-accent);
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent, #fff);
}
.model-tab:not(.active):hover {
  background: var(--mobile-focus-surface);
  border-color: color-mix(in srgb, var(--nw-text-primary) 22%, transparent);
}

/* ── 运营配置 Tab ── */
.ops-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--nw-text-primary) 10%, transparent);
}
.ops-tab {
  flex: 1;
  min-height: 36px;
  padding: 6px 8px;
  border: 1px solid var(--nw-border);
  border-radius: 10px;
  background: var(--mobile-focus-surface-muted);
  color: var(--nw-text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
  white-space: nowrap;
}
.ops-tab.active {
  border-color: color-mix(in srgb, #10b981 60%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, #10b981 80%, var(--nw-text-primary)), color-mix(in srgb, #059669 80%, var(--nw-text-primary)));
  color: var(--mobile-focus-on-accent, #fff);
}
.ops-tab:not(.active):hover {
  background: var(--mobile-focus-surface);
  border-color: color-mix(in srgb, var(--nw-text-primary) 22%, transparent);
}
</style>
