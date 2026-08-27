<template>
  <div v-if="visible" class="char-manage-sheet">
    <div class="char-manage-sheet__backdrop" @click="close" />
    <div class="char-manage-sheet__panel">
      <div class="char-manage-sheet__header">
        <span class="char-manage-sheet__title">角色管理</span>
        <button class="char-manage-sheet__close" @click="close">关闭</button>
      </div>

      <div v-if="loading" class="char-manage-sheet__loading">加载中...</div>

      <template v-else>
        <!-- 待确认角色 -->
        <div v-if="pendingItems.length > 0" class="char-manage-sheet__pending">
          <div class="char-manage-sheet__section-head">
            <span class="char-manage-sheet__section-title">待确认角色</span>
            <span class="char-manage-sheet__badge">{{ pendingItems.length }}</span>
            <button
              class="char-manage-sheet__approve-all"
              :disabled="approving"
              @click="approveAll"
            >
              全部通过
            </button>
          </div>
          <div class="char-manage-sheet__pending-list">
            <div v-for="item in pendingItems" :key="item.name" class="char-manage-sheet__pending-item">
              <div class="char-manage-sheet__pending-info">
                <span class="char-manage-sheet__pending-name">{{ item.name }}</span>
                <span class="char-manage-sheet__pending-meta">出场 {{ item.hitCount }} 次 · 第 {{ item.firstDetectedIn }} 章</span>
              </div>
              <div class="char-manage-sheet__pending-actions">
                <button
                  class="char-manage-sheet__approve-btn"
                  :disabled="approving || rejecting"
                  @click="approveOne(item.name)"
                >通过</button>
                <button
                  class="char-manage-sheet__reject-btn"
                  :disabled="approving || rejecting"
                  @click="rejectOne(item.name)"
                >忽略</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 已建档角色 -->
        <div v-if="characters.length > 0" class="char-manage-sheet__section-head">
          <span class="char-manage-sheet__section-title">已建档角色</span>
          <span class="char-manage-sheet__badge char-manage-sheet__badge--muted">{{ characters.length }}</span>
        </div>

        <div v-if="characters.length > 0" class="char-manage-sheet__list">
          <div v-for="char in characters" :key="char.id" class="char-manage-sheet__item">
            <div class="char-manage-sheet__avatar" @click="openDetail(char.id)">
              <img v-if="char.portraitImagePath" :src="`/api/novels/${novelId}/characters/${char.id}/portrait?w=160&_t=${portraitVersion}`" alt="" />
              <span v-else>{{ char.name?.charAt(0) || '?' }}</span>
            </div>
            <div class="char-manage-sheet__info" @click="openDetail(char.id)">
              <div class="char-manage-sheet__name-row">
                <span class="char-manage-sheet__name">{{ char.name }}</span>
                <span class="char-manage-sheet__role">{{ getRoleLabel(char.role) }}</span>
              </div>
              <p v-if="char.personality" class="char-manage-sheet__desc">{{ char.personality }}</p>
            </div>
            <div class="char-manage-sheet__actions">
              <button
                class="char-manage-sheet__icon-btn"
                :class="{ 'is-active': !!char.portraitImagePath }"
                :disabled="generatingPortraitId === char.id || togglingId === char.id"
                @click="openPromptEditor(char)"
              >
                <el-icon :size="16"><PictureFilled /></el-icon>
                <span class="char-manage-sheet__icon-btn-label">{{ getPortraitActionLabel(char.id) }}</span>
              </button>
              <button
                v-if="comicEnabled"
                class="char-manage-sheet__icon-btn"
                :class="{ 'is-active': dnaStatusMap[char.id] }"
                :disabled="generatingDnaId === char.id"
                @click="generateDNA(char)"
              >
                <el-icon :size="16"><Histogram /></el-icon>
                <span class="char-manage-sheet__icon-btn-label">{{ generatingDnaId === char.id ? '...' : 'DNA' }}</span>
              </button>
              <button
                class="char-manage-sheet__icon-btn"
                :class="{ 'is-active': char.mailboxEnabled }"
                :disabled="togglingId === char.id || generatingPortraitId === char.id"
                @click="toggleMailbox(char)"
              >
                <el-icon :size="16"><Message /></el-icon>
                <span class="char-manage-sheet__icon-btn-label">{{ togglingId === char.id ? '...' : '信箱' }}</span>
              </button>
              <button
                class="char-manage-sheet__icon-btn"
                :class="{ 'is-active': char.momentsEnabled }"
                :disabled="togglingId === char.id || generatingPortraitId === char.id"
                @click="toggleMoments(char)"
              >
                <el-icon :size="16"><Share /></el-icon>
                <span class="char-manage-sheet__icon-btn-label">{{ togglingId === char.id ? '...' : '圈子' }}</span>
              </button>
            </div>
          </div>
        </div>

        <div v-if="characters.length === 0 && pendingItems.length === 0" class="char-manage-sheet__empty">
          暂无角色数据，角色会在写作过程中自动检测
        </div>
      </template>

      <div v-if="!loading && (characters.length > 0 || pendingItems.length > 0)" class="char-manage-sheet__footer">
        <span class="char-manage-sheet__summary">
          已建档 {{ characters.length }} · 待确认 {{ pendingItems.length }} · 已开信箱 {{ mailboxCount }} · 有立绘 {{ portraitCount }}
        </span>
      </div>
    </div>

    <MobileCharacterDetailSheet
      :visible="detailVisible"
      :novel-id="novelId"
      :character-id="detailCharacterId"
      :can-edit="true"
      @close="detailVisible = false"
      @character-updated="onCharacterUpdated"
    />

    <!-- 立绘提示词编辑弹窗 -->
    <div v-if="promptEditorVisible" class="char-manage-sheet__backdrop" @click="promptEditorVisible = false" />
    <div v-if="promptEditorVisible" class="prompt-editor">
      <div class="prompt-editor__header">
        <span class="prompt-editor__title">
          {{ promptEditorChar?.portraitImagePath ? '重绘' : '生成立绘' }} · {{ promptEditorChar?.name }}
        </span>
        <button class="prompt-editor__close" @click="promptEditorVisible = false">取消</button>
      </div>
      <div class="prompt-editor__body">
        <!-- 年代选择 -->
        <div class="prompt-editor__section">
          <span class="prompt-editor__section-label">年代</span>
          <div class="prompt-editor__chip-row">
            <button
              class="prompt-editor__chip"
              :class="{ 'is-active': !selectedEra }"
              @click="selectedEra = ''"
            >自动</button>
            <button
              v-for="item in eraOptions"
              :key="item.key"
              class="prompt-editor__chip"
              :class="{ 'is-active': selectedEra === item.key }"
              @click="selectedEra = item.key"
            >{{ item.label }}</button>
          </div>
        </div>

        <!-- 服饰选择 -->
        <div class="prompt-editor__section">
          <button class="prompt-editor__section-label prompt-editor__section-label--toggle" @click="showAttireList = !showAttireList">
            <span>服饰</span>
            <span class="prompt-editor__attire-current">
              {{ selectedRoleAttireLabel || '自动匹配' }}
            </span>
            <span class="prompt-editor__attire-arrow" :class="{ 'is-open': showAttireList }">▾</span>
          </button>
          <div v-if="showAttireList" class="prompt-editor__attire">
            <div class="prompt-editor__attire-search">
              <input
                v-model="attireSearchKeyword"
                type="text"
                placeholder="搜索服饰 / 输入关键词筛选"
                class="prompt-editor__attire-input"
              />
              <button
                v-if="selectedRoleAttireId"
                class="prompt-editor__attire-clear"
                @click="selectAttireItem('')"
              >清除</button>
            </div>
            <div class="prompt-editor__attire-list">
              <button
                class="prompt-editor__attire-option"
                :class="{ 'is-active': !selectedRoleAttireId }"
                @click="selectAttireItem('')"
              >自动匹配</button>
              <template v-for="group in filteredAttireGroups" :key="group.category">
                <div class="prompt-editor__attire-group">{{ group.category }}</div>
                <button
                  v-for="item in group.items"
                  :key="item.id"
                  class="prompt-editor__attire-option"
                  :class="{ 'is-active': selectedRoleAttireId === item.id }"
                  @click="selectAttireItem(item.id)"
                >{{ item.label }}</button>
              </template>
              <div v-if="!filteredAttireGroups.length" class="prompt-editor__attire-empty">
                没有匹配的服饰
              </div>
            </div>
          </div>
        </div>

        <!-- 画风选择 -->
        <div class="prompt-editor__section">
          <span class="prompt-editor__section-label">视觉画风</span>
          <div class="prompt-editor__chip-row">
            <button
              v-for="item in visualStyleOptions"
              :key="item.key"
              class="prompt-editor__chip"
              :class="{ 'is-active': selectedVisualStyle === item.key }"
              :title="item.summary"
              @click="selectedVisualStyle = item.key"
            >{{ item.label }}</button>
          </div>
        </div>

        <!-- 呈现形式 -->
        <div class="prompt-editor__section">
          <span class="prompt-editor__section-label">呈现形式</span>
          <div class="prompt-editor__chip-row">
            <button
              v-for="item in formatOptions"
              :key="item.key"
              class="prompt-editor__chip"
              :class="{ 'is-active': selectedFormat === item.key }"
              :title="item.summary"
              @click="selectedFormat = item.key"
            >{{ item.label }}</button>
          </div>
        </div>

        <!-- 生成提示词按钮 -->
        <button
          class="prompt-editor__generate-btn"
          :disabled="promptEditorLoading"
          @click="handleGeneratePrompt"
        >
          <span v-if="promptEditorLoading" class="prompt-editor__generate-spinner"></span>
          {{ promptEditorLoading ? '生成中...' : promptEditorPromptReady ? '重新生成提示词' : '生成提示词' }}
        </button>

        <!-- 提示词已生成后才显示编辑区 -->
        <template v-if="promptEditorPromptReady">
          <div class="prompt-editor__label">
            <span>图像提示词（可修改）</span>
          </div>
          <textarea
            v-model="promptEditorText"
            class="prompt-editor__textarea"
            placeholder="描述你想要的角色形象..."
            rows="8"
          ></textarea>
        </template>
      </div>
      <div class="prompt-editor__footer">
        <button
          class="prompt-editor__cancel-btn"
          @click="promptEditorVisible = false"
        >取消</button>
        <button
          class="prompt-editor__confirm-btn"
          :disabled="promptEditorGenerating || !promptEditorPromptReady"
          @click="confirmGeneratePortrait"
        >
          {{ promptEditorGenerating ? getPortraitConfirmLabel() : '确认生成' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { PictureFilled, Histogram, Message, Share } from '@element-plus/icons-vue';
import { CHARACTER_ROLE_LABELS, type CharacterProfile, type CharacterRole } from '../../types';
import {
  fetchCharacters,
  updateCharacter,
  fetchPendingCharacterCandidates,
  approvePendingCharacterCandidates,
  rejectPendingCharacterCandidates,
  type PendingCharacterCandidate,
} from '../../api/characters';
import { generateCharacterPortrait, generatePortraitPrompt, fetchPortraitStyleOptions, type PortraitStyleOptions } from '../../api/portraits';
import { http } from '../../api/http';
import { useComicFeature } from '../../composables/useComicFeature';
import {
  isRecoverablePortraitGenerationError,
  waitForPortraitGenerationSync,
} from '../../composables/usePortraitGenerationRecovery';
import MobileCharacterDetailSheet from './MobileCharacterDetailSheet.vue';

const props = defineProps<{
  visible: boolean;
  novelId: string;
}>();

const emit = defineEmits<{
  close: [];
  updated: [];
}>();

function close() {
  emit('close');
}

async function onCharacterUpdated() {
  characters.value = await fetchCharacters(props.novelId);
  emit('updated');
}

const loading = ref(false);
const characters = ref<CharacterProfile[]>([]);
const pendingCandidates = ref<PendingCharacterCandidate[]>([]);
const togglingId = ref<string | null>(null);
const generatingPortraitId = ref<string | null>(null);
/** 立绘版本号，重绘后递增以绕过浏览器缓存 */
const portraitVersion = ref(Date.now());
const approving = ref(false);
const rejecting = ref(false);
const detailVisible = ref(false);
const detailCharacterId = ref<string | null>(null);
const { comicEnabled } = useComicFeature();
const generatingDnaId = ref<string | null>(null);
const dnaStatusMap = ref<Record<string, boolean>>({});

async function generateDNA(char: CharacterProfile) {
  generatingDnaId.value = char.id;
  try {
    await http.post(`/novels/${props.novelId}/comics/character-dna/${char.id}`, {}, { timeout: 120_000 });
    dnaStatusMap.value[char.id] = true;
    ElMessage.success(`${char.name} 的角色DNA已生成`);
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      || (err instanceof Error ? err.message : '生成失败');
    ElMessage.error(msg);
  } finally {
    generatingDnaId.value = null;
  }
}

// 提示词编辑弹窗
const promptEditorVisible = ref(false);
const promptEditorChar = ref<CharacterProfile | null>(null);
const promptEditorText = ref('');
const promptEditorLoading = ref(false);
const promptEditorGenerating = ref(false);
const portraitGenerationStage = ref<'idle' | 'generating' | 'syncing'>('idle');
const promptEditorPromptReady = ref(false);

// 画风和形式选择
const styleOptions = ref<PortraitStyleOptions | null>(null);
const selectedEra = ref('');
const selectedRoleAttireId = ref('');
const selectedVisualStyle = ref('cinematic-realistic');
const selectedFormat = ref('standard');

const eraOptions = computed(() => styleOptions.value?.eraOptions ?? []);
const roleAttireOptions = computed(() => styleOptions.value?.roleAttireOptions ?? []);
const visualStyleOptions = computed(() => styleOptions.value?.visualStyleOptions ?? []);
const formatOptions = computed(() => styleOptions.value?.formatOptions ?? []);

/** 服饰按 category 分组，便于下拉展示 */
const roleAttireGroups = computed(() => {
  const groups: Array<{ category: string; items: Array<{ id: string; label: string }> }> = [];
  const map = new Map<string, Array<{ id: string; label: string }>>();
  for (const item of roleAttireOptions.value) {
    if (!map.has(item.category)) map.set(item.category, []);
    map.get(item.category)!.push({ id: item.id, label: item.label });
  }
  for (const [category, items] of map) {
    groups.push({ category, items });
  }
  return groups;
});

const attireSearchKeyword = ref('');

/** 按搜索关键词筛选后的服饰分组 */
const filteredAttireGroups = computed(() => {
  const keyword = attireSearchKeyword.value.trim().toLowerCase();
  if (!keyword) return roleAttireGroups.value;
  const result: Array<{ category: string; items: Array<{ id: string; label: string }> }> = [];
  for (const group of roleAttireGroups.value) {
    const matched = group.items.filter(item => item.label.toLowerCase().includes(keyword));
    if (matched.length) result.push({ category: group.category, items: matched });
  }
  return result;
});

const showAttireList = ref(false);

const selectedRoleAttireLabel = computed(() => {
  if (!selectedRoleAttireId.value) return '';
  const entry = roleAttireOptions.value.find(item => item.id === selectedRoleAttireId.value);
  return entry?.label ?? '';
});

function selectAttireItem(id: string) {
  selectedRoleAttireId.value = id;
  showAttireList.value = false;
}

function getStyleOverrides() {
  const overrides: Record<string, string> = {};
  if (selectedEra.value) {
    overrides.eraKey = selectedEra.value;
  }
  if (selectedRoleAttireId.value) {
    overrides.roleAttireId = selectedRoleAttireId.value;
  }
  if (selectedVisualStyle.value !== 'cinematic-realistic') {
    overrides.visualStyleKey = selectedVisualStyle.value;
  }
  if (selectedFormat.value !== 'standard') {
    overrides.formatKey = selectedFormat.value;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

const pendingItems = computed(() =>
  pendingCandidates.value.filter(
    (item) => item.status === 'pending' && !/^退场[：:]\s*.+/.test(item.name),
  ),
);
const mailboxCount = computed(() => characters.value.filter((c) => c.mailboxEnabled).length);
const portraitCount = computed(() => characters.value.filter((c) => c.portraitImagePath).length);

watch(
  () => props.visible,
  async (val) => {
    if (val && props.novelId) {
      await loadAll();
    }
  },
);

async function loadAll() {
  loading.value = true;
  try {
    const [charList, pendingList] = await Promise.all([
      fetchCharacters(props.novelId).catch(() => [] as CharacterProfile[]),
      fetchPendingCharacterCandidates(props.novelId).catch(() => [] as PendingCharacterCandidate[]),
    ]);
    characters.value = charList;
    pendingCandidates.value = pendingList;

    // 初始加载时检查已有DNA状态
    if (comicEnabled.value && charList.length > 0) {
      try {
        const ids = charList.map((c) => c.id).join(',');
        const { data } = await http.get<Record<string, boolean>>(
          `/novels/${props.novelId}/comics/dna-check?charIds=${encodeURIComponent(ids)}`,
        );
        for (const cid of Object.keys(data)) {
          if (data[cid]) dnaStatusMap.value[cid] = true;
        }
      } catch {
        // 检查失败不影响主流程
      }
    }
  } finally {
    loading.value = false;
  }
}

async function toggleMailbox(char: CharacterProfile) {
  togglingId.value = char.id;
  try {
    const newValue = !char.mailboxEnabled;
    await updateCharacter(props.novelId, char.id, { mailboxEnabled: newValue } as Partial<CharacterProfile>);
    char.mailboxEnabled = newValue;
    ElMessage.success(newValue ? '信箱已开启' : '信箱已关闭');
    emit('updated');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '操作失败');
  } finally {
    togglingId.value = null;
  }
}

async function toggleMoments(char: CharacterProfile) {
  togglingId.value = char.id;
  try {
    const newValue = !char.momentsEnabled;
    await updateCharacter(props.novelId, char.id, { momentsEnabled: newValue } as Partial<CharacterProfile>);
    char.momentsEnabled = newValue;
    ElMessage.success(newValue ? '朋友圈已开启' : '朋友圈已关闭');
    emit('updated');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '操作失败');
  } finally {
    togglingId.value = null;
  }
}

async function openPromptEditor(char: CharacterProfile) {
  promptEditorChar.value = char;
  promptEditorText.value = '';
  promptEditorPromptReady.value = false;
  promptEditorVisible.value = true;
  // 加载画风和形式选项（首次加载）
  if (!styleOptions.value) {
    try {
      styleOptions.value = await fetchPortraitStyleOptions(props.novelId);
    } catch {
      // 选项加载失败不影响
    }
  }
}

async function handleGeneratePrompt() {
  const char = promptEditorChar.value;
  if (!char) return;
  promptEditorLoading.value = true;
  try {
    const result = await generatePortraitPrompt(props.novelId, char.id,
      { styleOverrides: getStyleOverrides() },
    );
    promptEditorText.value = result.prompt || '';
    promptEditorPromptReady.value = true;
  } catch {
    // 获取提示词失败，仍显示编辑区让用户手动输入
    promptEditorPromptReady.value = true;
  } finally {
    promptEditorLoading.value = false;
  }
}

function getPortraitActionLabel(charId: string): string {
  if (generatingPortraitId.value !== charId) return '立绘';
  return portraitGenerationStage.value === 'syncing' ? '同步中' : '生成中';
}

function getPortraitConfirmLabel(): string {
  return portraitGenerationStage.value === 'syncing' ? '同步中...' : '生成中...';
}

function schedulePortraitDnaStatusCheck(charId: string) {
  if (!comicEnabled.value) return;

  setTimeout(async () => {
    try {
      const { data } = await http.get<Record<string, boolean>>(
        `/novels/${props.novelId}/comics/dna-check?charIds=${encodeURIComponent(charId)}`,
      );
      if (data[charId]) dnaStatusMap.value[charId] = true;
    } catch {
      // DNA检查失败，不标记
    }
  }, 4000);
}

async function finishPortraitGeneration(charId: string) {
  portraitVersion.value = Date.now();
  promptEditorVisible.value = false;
  await loadAll();
  schedulePortraitDnaStatusCheck(charId);
  emit('updated');
}

async function confirmGeneratePortrait() {
  const char = promptEditorChar.value;
  if (!char) return;
  const prompt = promptEditorText.value.trim();
  promptEditorGenerating.value = true;
  generatingPortraitId.value = char.id;
  portraitGenerationStage.value = 'generating';
  try {
    await generateCharacterPortrait(props.novelId, char.id,
      prompt
        ? { prompt, styleOverrides: getStyleOverrides() }
        : { autoGenerate: true, styleOverrides: getStyleOverrides() },
    );
    ElMessage.success('立绘生成成功');
    await finishPortraitGeneration(char.id);
  } catch (err: any) {
    if (isRecoverablePortraitGenerationError(err)) {
      portraitGenerationStage.value = 'syncing';
      ElMessage.info('立绘仍在生成，正在同步结果');
      const syncResult = await waitForPortraitGenerationSync({
        novelId: props.novelId,
        characterId: char.id,
        previousPortraitImagePath: char.portraitImagePath,
        previousUpdatedAt: char.updatedAt,
      });
      if (syncResult.characters) characters.value = syncResult.characters;

      if (syncResult.synced) {
        ElMessage.success('立绘生成成功');
        await finishPortraitGeneration(char.id);
      } else {
        portraitVersion.value = Date.now();
        promptEditorVisible.value = false;
        ElMessage.warning('立绘还在生成中，完成后会出现在角色卡片');
      }
      return;
    }

    ElMessage.error(err?.response?.data?.error || '立绘生成失败');
  } finally {
    promptEditorGenerating.value = false;
    generatingPortraitId.value = null;
    portraitGenerationStage.value = 'idle';
  }
}

async function approveOne(name: string) {
  approving.value = true;
  try {
    const result = await approvePendingCharacterCandidates(props.novelId, { names: [name] });
    ElMessage.success(`已通过「${name}」`);
    pendingCandidates.value = result.pendingCandidates;
    characters.value = await fetchCharacters(props.novelId);
    emit('updated');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '审批失败');
  } finally {
    approving.value = false;
  }
}

async function approveAll() {
  approving.value = true;
  try {
    const names = pendingItems.value.map((item) => item.name);
    const result = await approvePendingCharacterCandidates(props.novelId, { names });
    ElMessage.success(`已通过 ${result.approvedCount} 个角色`);
    pendingCandidates.value = result.pendingCandidates;
    characters.value = await fetchCharacters(props.novelId);
    emit('updated');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '审批失败');
  } finally {
    approving.value = false;
  }
}

async function rejectOne(name: string) {
  rejecting.value = true;
  try {
    const result = await rejectPendingCharacterCandidates(props.novelId, { names: [name] });
    ElMessage.success(`已忽略「${name}」`);
    pendingCandidates.value = result.pendingCandidates;
    emit('updated');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '操作失败');
  } finally {
    rejecting.value = false;
  }
}

function getRoleLabel(role: string): string {
  return CHARACTER_ROLE_LABELS[role as CharacterRole] || role;
}

function openDetail(charId: string) {
  detailCharacterId.value = charId;
  detailVisible.value = true;
}
</script>

<style scoped>
.char-manage-sheet {
  position: fixed;
  inset: 0;
  z-index: 2000;
}

.char-manage-sheet__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

.char-manage-sheet__panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 85dvh;
  background: var(--nw-bg-secondary);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.char-manage-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--nw-border);
  flex-shrink: 0;
}

.char-manage-sheet__title {
  font-size: 17px;
  font-weight: 700;
  color: var(--nw-text-primary);
}

.char-manage-sheet__close {
  border: none;
  background: none;
  font-size: 14px;
  color: var(--mobile-focus-accent, #6366f1);
  cursor: pointer;
  padding: 4px 8px;
}

.char-manage-sheet__loading,
.char-manage-sheet__empty {
  padding: 48px 20px;
  text-align: center;
  color: var(--nw-text-secondary);
  font-size: 14px;
}

/* Section headers */
.char-manage-sheet__section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 8px;
  flex-shrink: 0;
}

.char-manage-sheet__section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-secondary);
}

.char-manage-sheet__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--nw-danger, #ef4444);
  color: var(--mobile-focus-on-accent, #fff);
  font-size: 11px;
  font-weight: 700;
}

.char-manage-sheet__badge--muted {
  background: color-mix(in srgb, var(--nw-text-primary) 10%, var(--nw-bg-secondary));
  color: var(--nw-text-secondary);
}

.char-manage-sheet__approve-all {
  margin-left: auto;
  border: none;
  border-radius: 999px;
  background: var(--mobile-focus-accent, #6366f1);
  color: var(--mobile-focus-on-accent, #fff);
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.char-manage-sheet__approve-all:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Pending list */
.char-manage-sheet__pending {
  flex-shrink: 0;
  border-bottom: 1px solid var(--nw-border);
}

.char-manage-sheet__pending-list {
  padding: 0 16px 8px;
  max-height: 240px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.char-manage-sheet__pending-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--nw-border);
}

.char-manage-sheet__pending-item:last-child {
  border-bottom: none;
}

.char-manage-sheet__pending-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.char-manage-sheet__pending-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.char-manage-sheet__pending-meta {
  font-size: 11px;
  color: var(--nw-text-secondary);
}

.char-manage-sheet__pending-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.char-manage-sheet__approve-btn {
  padding: 5px 12px;
  border: none;
  border-radius: 999px;
  background: var(--mobile-focus-accent, #6366f1);
  color: var(--mobile-focus-on-accent, #fff);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.char-manage-sheet__approve-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.char-manage-sheet__reject-btn {
  padding: 5px 12px;
  border: 1px solid var(--nw-border);
  border-radius: 999px;
  background: var(--nw-bg-primary);
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.char-manage-sheet__reject-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Character list */
.char-manage-sheet__list {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
  -webkit-overflow-scrolling: touch;
}

.char-manage-sheet__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--nw-border);
}

.char-manage-sheet__item:last-child {
  border-bottom: none;
}

.char-manage-sheet__avatar {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  flex-shrink: 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--nw-text-primary) 5%, var(--nw-bg-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--mobile-focus-accent, #6366f1);
  cursor: pointer;
}

.char-manage-sheet__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.char-manage-sheet__info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.char-manage-sheet__name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.char-manage-sheet__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.char-manage-sheet__role {
  font-size: 11px;
  color: var(--nw-text-secondary);
  background: color-mix(in srgb, var(--nw-text-primary) 5%, var(--nw-bg-secondary));
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.char-manage-sheet__desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--nw-text-secondary);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.char-manage-sheet__actions {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}

.char-manage-sheet__icon-btn {
  width: 46px;
  min-height: 46px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 3px 5px;
  border: 1px solid var(--nw-border, #e2e8f0);
  border-radius: 8px;
  background: var(--mobile-focus-surface);
  color: var(--nw-text-secondary, #64748b);
  cursor: pointer;
  transition: all 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.char-manage-sheet__icon-btn-label {
  font-size: 10px;
  line-height: 1;
  color: var(--nw-text-muted, #64748b);
  white-space: nowrap;
}

.char-manage-sheet__icon-btn:active {
  transform: scale(0.94);
  background: color-mix(in srgb, var(--mobile-focus-accent, #6366f1) 10%, #fff);
}

.char-manage-sheet__icon-btn.is-active {
  background: color-mix(in srgb, var(--mobile-focus-accent, #6366f1) 14%, #fff);
  border-color: color-mix(in srgb, var(--mobile-focus-accent, #6366f1) 45%, transparent);
  color: var(--mobile-focus-accent, #6366f1);
}

.char-manage-sheet__icon-btn.is-active .char-manage-sheet__icon-btn-label {
  color: var(--mobile-focus-accent, #6366f1);
}

.char-manage-sheet__icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

/* 暗色模式 */
html.dark .char-manage-sheet__icon-btn {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  color: var(--nw-text-secondary, #9ca3af);
}

html.dark .char-manage-sheet__icon-btn-label {
  color: var(--nw-text-muted, #6b7280);
}

html.dark .char-manage-sheet__icon-btn:active {
  background: rgba(255, 255, 255, 0.14);
}

html.dark .char-manage-sheet__icon-btn.is-active {
  background: rgba(99, 102, 241, 0.18);
  border-color: rgba(99, 102, 241, 0.45);
  color: var(--mobile-focus-accent);
}

html.dark .char-manage-sheet__icon-btn.is-active .char-manage-sheet__icon-btn-label {
  color: var(--mobile-focus-accent);
}

.char-manage-sheet__footer {
  padding: 12px 20px;
  border-top: 1px solid var(--nw-border);
  flex-shrink: 0;
}

.char-manage-sheet__summary {
  font-size: 12px;
  color: var(--nw-text-secondary);
}

/* 提示词编辑弹窗 */
.prompt-editor {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 70dvh;
  background: var(--nw-bg-secondary);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10;
}
.prompt-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--nw-border);
  flex-shrink: 0;
}
.prompt-editor__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
}
.prompt-editor__close {
  border: none;
  background: none;
  font-size: 14px;
  color: var(--nw-text-secondary);
  cursor: pointer;
  padding: 4px 8px;
}
.prompt-editor__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.prompt-editor__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--nw-text-secondary);
  font-weight: 500;
}
/* 画风/形式选择 */
.prompt-editor__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.prompt-editor__section-label {
  font-size: 12px;
  color: var(--nw-text-secondary);
  font-weight: 500;
}
.prompt-editor__section-label--toggle {
  box-sizing: border-box;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.prompt-editor__attire-current {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prompt-editor__attire-arrow {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--nw-text-secondary);
  transition: transform 0.2s ease;
}
.prompt-editor__attire-arrow.is-open {
  transform: rotate(180deg);
}
.prompt-editor__chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.prompt-editor__chip {
  padding: 4px 10px;
  border: 1px solid var(--nw-border);
  border-radius: 999px;
  background: var(--nw-bg-primary);
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.prompt-editor__chip.is-active {
  background: color-mix(in srgb, var(--mobile-focus-accent, #6366f1) 12%, var(--nw-bg-secondary));
  border-color: var(--mobile-focus-accent, #6366f1);
  color: var(--mobile-focus-accent, #6366f1);
  font-weight: 600;
}
.prompt-editor__chip:active {
  transform: scale(0.96);
}
/* 服饰搜索列表 */
.prompt-editor__attire {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.prompt-editor__attire-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}
.prompt-editor__attire-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  padding: 7px 10px;
  border: 1px solid var(--nw-border);
  border-radius: 8px;
  background: var(--nw-bg-primary);
  color: var(--nw-text-primary);
  font-size: 12px;
  outline: none;
  transition: border-color 0.16s ease, background-color 0.16s ease;
}
.prompt-editor__attire-input::placeholder {
  color: var(--nw-text-muted, var(--nw-text-secondary));
}
.prompt-editor__attire-input:focus {
  border-color: var(--mobile-focus-accent, #6366f1);
  background: var(--nw-bg-secondary);
}
.prompt-editor__attire-clear {
  flex-shrink: 0;
  padding: 5px 10px;
  border: none;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nw-text-primary) 10%, var(--nw-bg-secondary));
  color: var(--nw-text-secondary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.prompt-editor__attire-clear:active {
  opacity: 0.7;
}
.prompt-editor__attire-list {
  max-height: 180px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  border: 1px solid var(--nw-border);
  border-radius: 10px;
  background: var(--nw-bg-secondary);
  padding: 4px;
}
.prompt-editor__attire-group {
  padding: 6px 8px 2px;
  font-size: 10px;
  font-weight: 600;
  color: var(--nw-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.prompt-editor__attire-option {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--nw-text-primary);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}
.prompt-editor__attire-option:hover {
  background: color-mix(in srgb, var(--nw-text-primary) 5%, var(--nw-bg-secondary));
}
.prompt-editor__attire-option.is-active {
  background: color-mix(in srgb, var(--mobile-focus-accent, #6366f1) 12%, var(--nw-bg-secondary));
  color: var(--mobile-focus-accent, #6366f1);
  font-weight: 600;
}
.prompt-editor__attire-empty {
  padding: 12px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--nw-text-secondary);
}
/* 生成提示词按钮 */
.prompt-editor__generate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 40px;
  border: 1px dashed color-mix(in srgb, var(--mobile-focus-accent, #6366f1) 50%, var(--nw-border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--mobile-focus-accent, #6366f1) 6%, var(--nw-bg-secondary));
  color: var(--mobile-focus-accent, #6366f1);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 4px;
}
.prompt-editor__generate-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--mobile-focus-accent, #6366f1) 10%, var(--nw-bg-secondary));
  border-style: solid;
}
.prompt-editor__generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.prompt-editor__generate-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--mobile-focus-accent, #6366f1) 25%, transparent);
  border-top-color: var(--mobile-focus-accent, #6366f1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.prompt-editor__reset-btn {
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent, #6366f1) 25%, var(--nw-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-focus-accent, #6366f1) 8%, var(--nw-bg-secondary));
  color: var(--mobile-focus-accent, #6366f1);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 3px 10px;
}
.prompt-editor__loading {
  padding: 40px 0;
  text-align: center;
  color: var(--nw-text-secondary);
  font-size: 14px;
}
.prompt-editor__textarea {
  flex: 1;
  min-height: 200px;
  width: 100%;
  border: 1px solid var(--nw-border);
  border-radius: 12px;
  padding: 12px;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;
  color: var(--nw-text-primary);
  background: var(--nw-bg-primary);
  font-family: 'SF Mono', 'Consolas', monospace;
}
.prompt-editor__textarea:focus {
  border-color: var(--mobile-focus-accent, #6366f1);
  background: var(--nw-bg-secondary);
}
.prompt-editor__footer {
  display: flex;
  gap: 10px;
  padding: 12px 20px;
  border-top: 1px solid var(--nw-border);
  flex-shrink: 0;
}
.prompt-editor__cancel-btn {
  flex: 1;
  height: 44px;
  border: 1px solid var(--nw-border);
  border-radius: 10px;
  background: var(--nw-bg-primary);
  color: var(--nw-text-secondary);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}
.prompt-editor__confirm-btn {
  flex: 2;
  height: 44px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--mobile-focus-accent, #6366f1), var(--mobile-focus-accent-strong, #7c3aed));
  color: var(--mobile-focus-on-accent, #fff);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.prompt-editor__confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
