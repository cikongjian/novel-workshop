<script setup lang="ts">
/**
 * 桌面端·番外篇管理
 * 复用 side-stories API，支持列表、生成、审核、删除等操作。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  fetchSideStories,
  deleteSideStory,
  reviewSideStory,
  generateSideStoryStream,
  fetchSideStoryConfig,
  updateSideStoryConfig,
  type SideStory,
  type SideStorySceneType,
  type SideStoryStatus,
} from '../api/side-stories';
import { fetchCharacters } from '../api/characters';
import type { CharacterProfile } from '../api/characters';
import { extractApiErrorMessage } from '../api/errors';
import { useSideStoryPermission } from '../composables/useSideStoryPermission';
import StateView from '../components/shared/StateView.vue';
import Icon from '../components/shared/Icon.vue';
import Modal from '../components/shared/Modal.vue';

const props = defineProps<{ novelId: string }>();

const permission = useSideStoryPermission();

// ===== 列表 =====
const stories = ref<SideStory[]>([]);
const loading = ref(false);
const filterStatus = ref<SideStoryStatus | 'all'>('all');

const filteredStories = computed(() => {
  if (filterStatus.value === 'all') return stories.value;
  return stories.value.filter((s) => s.status === filterStatus.value);
});

const sceneLabels: Record<string, string> = {
  childhood: '童年',
  daily: '日常',
  'what-if': '如果线',
  prequel: '前传',
  custom: '自定义',
};

const statusInfo: Record<string, { text: string; tone: string }> = {
  pending: { text: '待审核', tone: 'warning' },
  approved: { text: '已通过', tone: 'success' },
  rejected: { text: '已退回', tone: 'danger' },
  published: { text: '已发布', tone: 'primary' },
};

async function loadStories() {
  if (!props.novelId) return;
  loading.value = true;
  try {
    stories.value = await fetchSideStories(props.novelId);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载番外失败'));
  } finally {
    loading.value = false;
  }
}

// ===== 角色列表 =====
const characters = ref<CharacterProfile[]>([]);

async function loadCharacters() {
  if (!props.novelId) return;
  try {
    characters.value = await fetchCharacters(props.novelId);
  } catch {
    characters.value = [];
  }
}

// ===== 生成番外 =====
const generateVisible = ref(false);
const generating = ref(false);
const generateContent = ref('');
const generateTitle = ref('');
const selectedCharacterIds = ref<string[]>([]);
const selectedScene = ref<SideStorySceneType>('daily');
const customScene = ref('');
const targetWordCount = ref(2000);
let generateAbort: AbortController | null = null;

const sceneOptions: { value: SideStorySceneType; label: string; desc: string }[] = [
  { value: 'childhood', label: '童年', desc: '角色们的童年往事' },
  { value: 'daily', label: '日常', desc: '正文之外的日常片段' },
  { value: 'what-if', label: '如果线', desc: '假设某个关键节点不同' },
  { value: 'prequel', label: '前传', desc: '故事开始之前的经历' },
  { value: 'custom', label: '自定义', desc: '自由设定场景' },
];

function openGenerate() {
  selectedCharacterIds.value = [];
  selectedScene.value = 'daily';
  customScene.value = '';
  targetWordCount.value = 2000;
  generateContent.value = '';
  generateTitle.value = '';
  generateVisible.value = true;
}

function toggleCharacter(charId: string) {
  const idx = selectedCharacterIds.value.indexOf(charId);
  if (idx >= 0) {
    selectedCharacterIds.value.splice(idx, 1);
  } else {
    selectedCharacterIds.value.push(charId);
  }
}

async function startGenerate() {
  if (selectedCharacterIds.value.length === 0) {
    ElMessage.warning('请至少选择一个角色');
    return;
  }
  if (selectedScene.value === 'custom' && !customScene.value.trim()) {
    ElMessage.warning('请输入自定义场景描述');
    return;
  }

  generating.value = true;
  generateContent.value = '';
  generateTitle.value = '';
  generateAbort = new AbortController();

  try {
    await generateSideStoryStream(
      {
        novelId: props.novelId,
        characterIds: selectedCharacterIds.value,
        sceneType: selectedScene.value,
        customScene: selectedScene.value === 'custom' ? customScene.value : undefined,
        wordCount: targetWordCount.value,
      },
      {
        onChunk: (chunk) => {
          generateContent.value += chunk;
        },
        onDone: (storyId, title, status) => {
          generateTitle.value = title;
          generating.value = false;
          ElMessage.success(`番外《${title}》生成完成`);
          void loadStories();
        },
        onError: (message) => {
          generating.value = false;
          ElMessage.error(`生成失败: ${message}`);
        },
      },
      generateAbort.signal,
    );
  } catch (err) {
    generating.value = false;
    ElMessage.error(extractApiErrorMessage(err, '生成失败'));
  }
}

function cancelGenerate() {
  if (generateAbort) {
    generateAbort.abort();
    generateAbort = null;
  }
  generating.value = false;
}

// ===== 阅读 =====
const readerVisible = ref(false);
const readerStory = ref<SideStory | null>(null);

function openReader(story: SideStory) {
  readerStory.value = story;
  readerVisible.value = true;
}

// ===== 审核 =====
async function handleReview(story: SideStory, status: SideStoryStatus) {
  try {
    await reviewSideStory(story.id, status);
    ElMessage.success('操作成功');
    void loadStories();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '操作失败'));
  }
}

// ===== 删除 =====
async function handleDelete(story: SideStory) {
  try {
    await ElMessageBox.confirm(`确定删除番外《${story.title}》？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
    });
  } catch {
    return;
  }
  try {
    await deleteSideStory(story.id);
    ElMessage.success('已删除');
    void loadStories();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  }
}

// ===== 配置 =====
const configVisible = ref(false);
const configEnabledCharacterIds = ref<string[]>([]);
const configDailyLimit = ref(3);
const configAutoPublish = ref(false);
const configLoading = ref(false);

async function openConfig() {
  configVisible.value = true;
  configLoading.value = true;
  try {
    const config = await fetchSideStoryConfig(props.novelId);
    configEnabledCharacterIds.value = config.enabledCharacterIds || [];
    configDailyLimit.value = config.dailyLimitPerReader || 3;
    configAutoPublish.value = config.autoPublish || false;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载配置失败'));
  } finally {
    configLoading.value = false;
  }
}

async function saveConfig() {
  configLoading.value = true;
  try {
    await updateSideStoryConfig(props.novelId, {
      enabledCharacterIds: configEnabledCharacterIds.value,
      dailyLimitPerReader: configDailyLimit.value,
      autoPublish: configAutoPublish.value,
    });
    ElMessage.success('配置已保存');
    configVisible.value = false;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    configLoading.value = false;
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatWords(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

watch(
  () => props.novelId,
  () => {
    void permission.checkPermission();
    void loadStories();
    void loadCharacters();
  },
  { immediate: true }
);
</script>

<template>
  <div class="desktop-side-stories">
    <!-- 头部操作栏 -->
    <div class="nw-panel ss-header">
      <div class="ss-header__info">
        <div class="ss-header__kicker">
          <Icon name="bookmark" :size="14" /> 番外广场
        </div>
        <h2 class="ss-header__title">番外篇管理</h2>
        <p class="ss-header__desc">
          从角色切入，补出正文之外的高光、日常或如果线，让作品多一个可分享的入口。
        </p>
      </div>
      <div class="ss-header__actions">
        <button
          v-if="permission.canGenerate"
          class="desktop-btn desktop-btn--primary"
          @click="openGenerate"
        >
          <Icon name="sparkles" :size="16" /> 生成番外
        </button>
        <button
          v-if="permission.canManage"
          class="desktop-btn"
          @click="openConfig"
        >
          <Icon name="settings" :size="16" /> 配置
        </button>
      </div>
    </div>

    <!-- 统计 + 筛选 -->
    <div class="nw-panel">
      <div class="ss-toolbar">
        <div class="ss-stat-row">
          <div class="ss-stat">
            <strong>{{ stories.length }}</strong>
            <span>全部</span>
          </div>
          <div class="ss-stat">
            <strong>{{ stories.filter(s => s.status === 'pending').length }}</strong>
            <span>待审核</span>
          </div>
          <div class="ss-stat">
            <strong>{{ stories.filter(s => s.status === 'published').length }}</strong>
            <span>已发布</span>
          </div>
        </div>
        <div class="ss-filters">
          <button
            v-for="opt in [
              { value: 'all', label: '全部' },
              { value: 'pending', label: '待审核' },
              { value: 'approved', label: '已通过' },
              { value: 'rejected', label: '已退回' },
              { value: 'published', label: '已发布' },
            ]"
            :key="opt.value"
            class="desktop-chip"
            :class="{ 'is-active': filterStatus === opt.value }"
            @click="filterStatus = opt.value as any"
          >{{ opt.label }}</button>
        </div>
      </div>
    </div>

    <!-- 列表 -->
    <div class="nw-panel">
      <StateView :loading="loading" :error="null">
        <div v-if="filteredStories.length === 0 && !loading" class="ss-empty">
          <Icon name="bookmark" :size="48" />
          <strong>暂无番外</strong>
          <p>点击上方按钮生成第一篇番外</p>
        </div>

        <div v-else class="ss-list">
          <div
            v-for="story in filteredStories"
            :key="story.id"
            class="ss-card"
          >
            <div class="ss-card__head">
              <div class="ss-card__title-row">
                <h3 class="ss-card__title">{{ story.title }}</h3>
                <span
                  class="ss-status-badge"
                  :class="`ss-status-badge--${statusInfo[story.status]?.tone}`"
                >
                  {{ statusInfo[story.status]?.text }}
                </span>
              </div>
              <div class="ss-card__meta">
                <span class="ss-scene-tag">{{ sceneLabels[story.sceneType] || story.sceneType }}</span>
                <span>
                  <Icon name="pen" :size="11" /> {{ formatWords(story.wordCount) }} 字
                </span>
                <span>
                  <Icon name="heart" :size="11" /> {{ story.likes?.length || 0 }}
                </span>
                <span>{{ formatDate(story.createdAt) }}</span>
              </div>
            </div>

            <div class="ss-card__chars">
              <span class="ss-card__chars-label">登场角色：</span>
              <span class="ss-card__chars-names">{{ story.characterNames?.join('、') || '—' }}</span>
            </div>

            <p class="ss-card__preview">
              {{ story.content?.slice(0, 120) }}{{ story.content?.length > 120 ? '…' : '' }}
            </p>

            <div class="ss-card__actions">
              <button class="desktop-btn desktop-btn--sm" @click="openReader(story)">
                <Icon name="bookOpen" :size="12" /> 阅读
              </button>
              <template v-if="permission.canManage">
                <button
                  v-if="story.status === 'pending'"
                  class="desktop-btn desktop-btn--sm desktop-btn--success-ghost"
                  @click="handleReview(story, 'approved')"
                >
                  <Icon name="check" :size="12" /> 通过
                </button>
                <button
                  v-if="story.status === 'pending'"
                  class="desktop-btn desktop-btn--sm desktop-btn--danger-ghost"
                  @click="handleReview(story, 'rejected')"
                >
                  <Icon name="close" :size="12" /> 退回
                </button>
                <button
                  v-if="story.status === 'approved'"
                  class="desktop-btn desktop-btn--sm"
                  @click="handleReview(story, 'published')"
                >
                  <Icon name="upload" :size="12" /> 发布
                </button>
                <button class="desktop-btn desktop-btn--sm" @click="handleDelete(story)">
                  <Icon name="trash" :size="12" /> 删除
                </button>
              </template>
            </div>
          </div>
        </div>
      </StateView>
    </div>

    <!-- 生成番外弹窗 -->
    <Modal v-model="generateVisible" title="生成番外" width="680px">
      <div class="ss-generate">
        <div class="nw-field">
          <label class="nw-field-label">选择角色 <span class="ss-hint">（至少选 1 个）</span></label>
          <div class="ss-char-grid">
            <button
              v-for="char in characters"
              :key="char.id"
              class="ss-char-chip"
              :class="{ 'is-selected': selectedCharacterIds.includes(char.id) }"
              type="button"
              @click="toggleCharacter(char.id)"
            >
              {{ char.name }}
              <span v-if="char.role === 'protagonist'" class="ss-char-role">主角</span>
            </button>
          </div>
        </div>

        <div class="nw-field">
          <label class="nw-field-label">场景类型</label>
          <div class="ss-scene-grid">
            <button
              v-for="opt in sceneOptions"
              :key="opt.value"
              class="ss-scene-card"
              :class="{ 'is-active': selectedScene === opt.value }"
              type="button"
              @click="selectedScene = opt.value"
            >
              <div class="ss-scene-card__title">{{ opt.label }}</div>
              <div class="ss-scene-card__desc">{{ opt.desc }}</div>
            </button>
          </div>
        </div>

        <div v-if="selectedScene === 'custom'" class="nw-field">
          <label class="nw-field-label">自定义场景描述</label>
          <textarea
            v-model="customScene"
            class="nw-textarea"
            rows="3"
            placeholder="描述你想要的番外场景，例如：主角穿越回十年前..."
          />
        </div>

        <div class="nw-field">
          <label class="nw-field-label">目标字数</label>
          <div class="ss-word-count">
            <button
              v-for="wc in [1000, 2000, 3000, 5000]"
              :key="wc"
              class="desktop-chip"
              :class="{ 'is-active': targetWordCount === wc }"
              @click="targetWordCount = wc"
            >{{ formatWords(wc) }}字</button>
          </div>
        </div>

        <!-- 生成输出 -->
        <div v-if="generateContent || generating" class="nw-field">
          <label class="nw-field-label">
            {{ generating ? '正在生成…' : '生成结果' }}
          </label>
          <div class="ss-generate-output">
            <h3 v-if="generateTitle" class="ss-generate-title">{{ generateTitle }}</h3>
            <div class="ss-generate-content">{{ generateContent }}</div>
            <div v-if="generating" class="ss-generate-cursor"></div>
          </div>
        </div>
      </div>

      <template #footer>
        <button v-if="generating" class="desktop-btn" @click="cancelGenerate">
          取消生成
        </button>
        <template v-else>
          <button class="desktop-btn" @click="generateVisible = false">取消</button>
          <button class="desktop-btn desktop-btn--primary" :disabled="generating" @click="startGenerate">
            <Icon name="sparkles" :size="14" /> 开始生成
          </button>
        </template>
      </template>
    </Modal>

    <!-- 阅读弹窗 -->
    <Modal v-model="readerVisible" :title="readerStory?.title || '阅读番外'" width="720px">
      <div v-if="readerStory" class="ss-reader">
        <div class="ss-reader__meta">
          <span class="ss-scene-tag">{{ sceneLabels[readerStory.sceneType] }}</span>
          <span>{{ formatWords(readerStory.wordCount) }} 字</span>
          <span>{{ formatDate(readerStory.createdAt) }}</span>
        </div>
        <div class="ss-reader__chars">
          登场：{{ readerStory.characterNames?.join('、') }}
        </div>
        <div class="ss-reader__content">
          {{ readerStory.content }}
        </div>
      </div>
      <template #footer>
        <button class="desktop-btn desktop-btn--primary" @click="readerVisible = false">关闭</button>
      </template>
    </Modal>

    <!-- 配置弹窗 -->
    <Modal v-model="configVisible" title="番外配置" width="520px">
      <StateView :loading="configLoading">
        <div class="ss-config">
          <div class="nw-field">
            <label class="nw-field-label">可登场角色</label>
            <div class="ss-char-grid">
              <button
                v-for="char in characters"
                :key="char.id"
                class="ss-char-chip"
                :class="{ 'is-selected': configEnabledCharacterIds.includes(char.id) }"
                type="button"
                @click="() => {
                  const idx = configEnabledCharacterIds.indexOf(char.id);
                  if (idx >= 0) configEnabledCharacterIds.splice(idx, 1);
                  else configEnabledCharacterIds.push(char.id);
                }"
              >{{ char.name }}</button>
            </div>
            <p class="ss-hint">限制读者在番外生成时可选择的角色范围</p>
          </div>

          <div class="nw-field">
            <label class="nw-field-label">每日生成上限（每位读者）</label>
            <input
              v-model.number="configDailyLimit"
              type="number"
              class="nw-input"
              min="0"
              max="20"
            />
          </div>

          <div class="nw-field">
            <div class="ss-config-toggle">
              <div>
                <div class="nw-field-label" style="margin-bottom: 2px;">自动发布</div>
                <p class="ss-hint">生成后自动发布，无需审核</p>
              </div>
              <button
                class="ad-toggle"
                :class="{ 'is-on': configAutoPublish }"
                type="button"
                @click="configAutoPublish = !configAutoPublish"
              >
                <span class="ad-toggle-dot"></span>
              </button>
            </div>
          </div>
        </div>
      </StateView>

      <template #footer>
        <button class="desktop-btn" @click="configVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="configLoading" @click="saveConfig">
          保存
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.desktop-side-stories {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

.ss-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--nw-space-5);
  padding: var(--nw-space-5);
}

.ss-header__info {
  flex: 1;
}

.ss-header__kicker {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--nw-accent-strong);
  margin-bottom: var(--nw-space-2);
}

.ss-header__title {
  margin: 0 0 var(--nw-space-2);
  font-size: 22px;
  font-weight: 700;
  font-family: var(--nw-font-display);
  color: var(--nw-text-primary);
}

.ss-header__desc {
  margin: 0;
  font-size: 14px;
  color: var(--nw-text-secondary);
  line-height: 1.6;
}

.ss-header__actions {
  display: flex;
  gap: var(--nw-space-2);
}

/* Toolbar */
.ss-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--nw-space-4);
  flex-wrap: wrap;
}

.ss-stat-row {
  display: flex;
  gap: var(--nw-space-5);
}

.ss-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ss-stat strong {
  font-size: 20px;
  font-weight: 700;
  font-family: var(--nw-font-display);
  color: var(--nw-text-primary);
}

.ss-stat span {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.ss-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2);
}

/* List */
.ss-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--nw-space-3);
}

.ss-card {
  padding: var(--nw-space-4);
  border-radius: var(--nw-radius-lg);
  background: var(--nw-bg-secondary);
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
  transition: transform var(--nw-duration-fast) var(--nw-ease-smooth),
    box-shadow var(--nw-duration-fast) var(--nw-ease-smooth);
}

.ss-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--nw-shadow-color) 15%, transparent);
}

.ss-card__head {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
}

.ss-card__title-row {
  display: flex;
  align-items: center;
  gap: var(--nw-space-2);
}

.ss-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
  flex-shrink: 0;
}

.ss-status-badge--warning {
  background: color-mix(in srgb, var(--nw-warning) 15%, transparent);
  color: var(--nw-warning);
}

.ss-status-badge--success {
  background: color-mix(in srgb, var(--nw-success) 15%, transparent);
  color: var(--nw-success);
}

.ss-status-badge--danger {
  background: color-mix(in srgb, var(--nw-danger) 15%, transparent);
  color: var(--nw-danger);
}

.ss-status-badge--primary {
  background: color-mix(in srgb, var(--nw-accent-start) 20%, transparent);
  color: var(--nw-accent-strong);
}

.ss-card__meta {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  font-size: 12px;
  color: var(--nw-text-muted);
}

.ss-scene-tag {
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nw-accent-start) 15%, transparent);
  color: var(--nw-accent-strong);
  font-size: 11px;
  font-weight: 500;
}

.ss-card__chars {
  font-size: 13px;
  color: var(--nw-text-secondary);
}

.ss-card__chars-label {
  color: var(--nw-text-muted);
}

.ss-card__preview {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ss-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2);
  margin-top: auto;
}

/* Empty */
.ss-empty {
  padding: var(--nw-space-10) var(--nw-space-6);
  text-align: center;
  color: var(--nw-text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--nw-space-2);
}

.ss-empty strong {
  font-size: 16px;
  color: var(--nw-text-primary);
}

.ss-empty p {
  margin: 0;
  font-size: 13px;
}

/* Generate */
.ss-generate {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.ss-hint {
  font-size: 12px;
  color: var(--nw-text-muted);
  font-weight: 400;
}

.ss-char-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2);
}

.ss-char-chip {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--nw-border);
  background: transparent;
  font-size: 13px;
  color: var(--nw-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all var(--nw-duration-fast) var(--nw-ease-smooth);
}

.ss-char-chip:hover {
  border-color: var(--nw-accent-strong);
  color: var(--nw-accent-strong);
}

.ss-char-chip.is-selected {
  background: var(--nw-accent-gradient);
  border-color: transparent;
  color: #fff;
}

.ss-char-role {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.2);
}

.ss-scene-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: var(--nw-space-2);
}

.ss-scene-card {
  padding: var(--nw-space-3);
  border-radius: var(--nw-radius-md);
  border: 1.5px solid var(--nw-border);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: all var(--nw-duration-fast) var(--nw-ease-smooth);
}

.ss-scene-card:hover {
  border-color: var(--nw-accent-strong);
}

.ss-scene-card.is-active {
  border-color: var(--nw-accent-strong);
  background: color-mix(in srgb, var(--nw-accent-start) 10%, transparent);
}

.ss-scene-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin-bottom: 2px;
}

.ss-scene-card__desc {
  font-size: 12px;
  color: var(--nw-text-muted);
  line-height: 1.4;
}

.ss-word-count {
  display: flex;
  gap: var(--nw-space-2);
}

.ss-generate-output {
  padding: var(--nw-space-4);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-secondary);
  max-height: 320px;
  overflow-y: auto;
  line-height: 1.8;
  font-size: 14px;
  color: var(--nw-text-primary);
  position: relative;
}

.ss-generate-title {
  margin: 0 0 var(--nw-space-3);
  font-size: 18px;
  font-weight: 700;
  text-align: center;
}

.ss-generate-content {
  white-space: pre-wrap;
}

.ss-generate-cursor {
  display: inline-block;
  width: 8px;
  height: 16px;
  background: var(--nw-accent-strong);
  animation: blink 1s step-end infinite;
  vertical-align: middle;
  margin-left: 2px;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* Reader */
.ss-reader {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.ss-reader__meta {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  font-size: 13px;
  color: var(--nw-text-muted);
}

.ss-reader__chars {
  font-size: 13px;
  color: var(--nw-text-secondary);
}

.ss-reader__content {
  padding: var(--nw-space-4);
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-md);
  line-height: 1.9;
  font-size: 15px;
  color: var(--nw-text-primary);
  max-height: 500px;
  overflow-y: auto;
  white-space: pre-wrap;
}

/* Config */
.ss-config {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.ss-config-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--nw-space-4);
}

.desktop-btn--success-ghost {
  color: var(--nw-success);
  border: 1px solid color-mix(in srgb, var(--nw-success) 30%, transparent);
  background: transparent;
}

.desktop-btn--success-ghost:hover {
  background: color-mix(in srgb, var(--nw-success) 8%, transparent);
  border-color: var(--nw-success);
}

.desktop-btn--danger-ghost {
  color: var(--nw-danger);
  border: 1px solid color-mix(in srgb, var(--nw-danger) 30%, transparent);
  background: transparent;
}

.desktop-btn--danger-ghost:hover {
  background: color-mix(in srgb, var(--nw-danger) 8%, transparent);
  border-color: var(--nw-danger);
}
</style>
