<script setup lang="ts">
/**
 * 桌面端·角色管理
 * 复用 fetchCharacters / createCharacter / updateCharacter / deleteCharacter。
 * 列表（卡片）+ 编辑弹窗（表单）。
 */
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchCharacters, createCharacter, updateCharacter, deleteCharacter } from '../../api/characters';
import {
  generateCharacterPortrait,
  generatePortraitPrompt,
  fetchPortraitStyleOptions,
  fetchCharacterPortraitBlob,
  deleteCharacterPortrait,
  type PortraitStyleOptions,
  type PortraitStyleOverrides,
} from '../../api/portraits';
import { extractApiErrorMessage } from '../../api/errors';
import { CHARACTER_ROLE_LABELS, type CharacterProfile, type CharacterRole } from '../../types';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import Modal from '../../components/shared/Modal.vue';
import DesktopCharacterDetail from '../DesktopCharacterDetail.vue';

const props = defineProps<{ novelId: string }>();
const emit = defineEmits<{ 'request-refresh': [] }>();

const characters = ref<CharacterProfile[]>([]);
const loading = ref(false);
const loadError = ref('');
const portraitCache = ref<Record<string, string>>({});

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    characters.value = await fetchCharacters(props.novelId);
    void loadPortraits();
  } catch (err) {
    loadError.value = extractApiErrorMessage(err, '加载角色失败');
  } finally {
    loading.value = false;
  }
}

async function loadPortraits(): Promise<void> {
  for (const ch of characters.value) {
    if (!ch.portraitImagePath) continue;
    try {
      const blob = await fetchCharacterPortraitBlob(props.novelId, ch.id, 200);
      portraitCache.value = { ...portraitCache.value, [ch.id]: URL.createObjectURL(blob) };
    } catch {
      // 立绘加载失败，忽略（显示首字母占位）
    }
  }
}

function getPortrait(ch: CharacterProfile): string {
  return portraitCache.value[ch.id] ?? '';
}
load();

/** 编辑弹窗 */
const editVisible = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);
const ROLE_OPTIONS = Object.entries(CHARACTER_ROLE_LABELS) as [CharacterRole, string][];

const emptyForm = (): Partial<CharacterProfile> => ({
  name: '', aliases: [], role: 'supporting' as CharacterRole,
  appearance: '', personality: '', speechStyle: '', backstory: '',
  motivation: '', arc: '', currentState: '',
  personalityTraits: [], speechExamples: [], abilities: [],
});
const form = ref<Partial<CharacterProfile>>(emptyForm());
const newAlias = ref('');
const newTrait = ref('');

const isEditing = computed(() => editingId.value !== null);

function openCreate(): void {
  editingId.value = null;
  form.value = emptyForm();
  newAlias.value = '';
  newTrait.value = '';
  editVisible.value = true;
}

function openEdit(ch: CharacterProfile): void {
  editingId.value = ch.id;
  form.value = { ...ch };
  newAlias.value = '';
  newTrait.value = '';
  editVisible.value = true;
}

/** 立绘生成 */
const portraitDialogVisible = ref(false);
const portraitCharacter = ref<CharacterProfile | null>(null);
const portraitStyleOptions = ref<PortraitStyleOptions | null>(null);
const portraitPreviewUrl = ref('');
const portraitGenerating = ref(false);
const portraitSelected = ref<{ eraKey?: string; visualStyleKey?: string; roleAttireId?: string }>({});

function openPortrait(ch: CharacterProfile): void {
  portraitCharacter.value = ch;
  portraitPreviewUrl.value = getPortrait(ch);
  portraitSelected.value = {};
  portraitDialogVisible.value = true;
  void loadPortraitStyleOptions();
}

async function loadPortraitStyleOptions(): Promise<void> {
  try {
    portraitStyleOptions.value = await fetchPortraitStyleOptions(props.novelId);
  } catch { /* ignore */ }
}

async function generatePortrait(): Promise<void> {
  if (!portraitCharacter.value) return;
  portraitGenerating.value = true;
  try {
    const overrides: PortraitStyleOverrides = {};
    if (portraitSelected.value.eraKey) overrides.eraKey = portraitSelected.value.eraKey;
    if (portraitSelected.value.visualStyleKey) overrides.visualStyleKey = portraitSelected.value.visualStyleKey;
    if (portraitSelected.value.roleAttireId) overrides.roleAttireId = portraitSelected.value.roleAttireId;

    const result = await generateCharacterPortrait(props.novelId, portraitCharacter.value.id, {
      autoGenerate: true,
      styleOverrides: Object.keys(overrides).length ? overrides : undefined,
    });
    // 加载新立绘预览
    const blob = await fetchCharacterPortraitBlob(props.novelId, portraitCharacter.value.id, 400);
    if (portraitPreviewUrl.value.startsWith('blob:')) URL.revokeObjectURL(portraitPreviewUrl.value);
    portraitPreviewUrl.value = URL.createObjectURL(blob);
    portraitCache.value = { ...portraitCache.value, [portraitCharacter.value.id]: portraitPreviewUrl.value };
    ElMessage.success('立绘生成完成');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '立绘生成失败'));
  } finally {
    portraitGenerating.value = false;
  }
}

async function removePortrait(): Promise<void> {
  if (!portraitCharacter.value) return;
  try {
    await ElMessageBox.confirm('删除该角色立绘？', '删除立绘', { type: 'warning', confirmButtonText: '删除' });
  } catch { return; }
  try {
    await deleteCharacterPortrait(props.novelId, portraitCharacter.value.id);
    delete portraitCache.value[portraitCharacter.value.id];
    portraitPreviewUrl.value = '';
    ElMessage.success('立绘已删除');
    await load();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  }
}

function addAlias(): void {
  const v = newAlias.value.trim();
  if (v && !form.value.aliases?.includes(v)) {
    form.value.aliases = [...(form.value.aliases ?? []), v];
    newAlias.value = '';
  }
}
function removeAlias(a: string): void {
  form.value.aliases = form.value.aliases?.filter(x => x !== a);
}

function addTrait(): void {
  const v = newTrait.value.trim();
  if (v && !form.value.personalityTraits?.includes(v)) {
    form.value.personalityTraits = [...(form.value.personalityTraits ?? []), v];
    newTrait.value = '';
  }
}
function removeTrait(t: string): void {
  form.value.personalityTraits = form.value.personalityTraits?.filter(x => x !== t);
}

async function save(): Promise<void> {
  if (!form.value.name?.trim()) {
    ElMessage.warning('请输入角色名');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await updateCharacter(props.novelId, editingId.value, form.value);
      ElMessage.success('角色已更新');
    } else {
      await createCharacter(props.novelId, form.value as Omit<CharacterProfile, 'id' | 'createdAt' | 'updatedAt'>);
      ElMessage.success('角色已创建');
    }
    editVisible.value = false;
    await load();
    emit('request-refresh');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function remove(ch: CharacterProfile): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除角色「${ch.name}」？`, '删除角色', { type: 'warning', confirmButtonText: '删除' });
  } catch { return; }
  try {
    await deleteCharacter(props.novelId, ch.id);
    ElMessage.success('已删除');
    await load();
    emit('request-refresh');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  }
}

function portraitUrl(ch: CharacterProfile): string {
  return getPortrait(ch);
}

/** 角色详情（雷达 + 成长） */
const detailVisible = ref(false);
const detailCharacter = ref<CharacterProfile | null>(null);

function openDetail(ch: CharacterProfile): void {
  detailCharacter.value = ch;
  detailVisible.value = true;
}
</script>

<template>
  <div class="desktop-characters">
    <div class="nw-panel__head" style="padding:0 0 var(--nw-space-4)">
      <h2 class="nw-panel__title">角色 <span class="desktop-section-count">{{ characters.length }}</span></h2>
      <button class="desktop-btn desktop-btn--primary" @click="openCreate">
        <Icon name="plus" :size="14" /> 新建角色
      </button>
    </div>

    <StateView :loading="loading" :error="loadError ? new Error(loadError) : null" :error-message="loadError" :empty="!loading && characters.length === 0" @retry="load">
      <template #empty>
        <p class="nw-state__title">还没有角色</p>
        <p class="nw-state__desc">创建第一个角色，或通过生成章节让 AI 自动提取。</p>
      </template>

      <div class="character-grid">
        <div v-for="ch in characters" :key="ch.id" class="character-card">
          <div class="character-card-head">
            <div class="character-avatar">
              <img v-if="portraitUrl(ch)" :src="portraitUrl(ch)" class="character-avatar-img" alt="" @error="delete portraitCache[ch.id]" />
              <span v-else>{{ ch.name.slice(0, 1) }}</span>
            </div>
            <div class="character-info">
              <div class="character-name">{{ ch.name }}</div>
              <span class="nw-tag">{{ CHARACTER_ROLE_LABELS[ch.role] || ch.role }}</span>
            </div>
          </div>
          <p v-if="ch.personality" class="character-desc">{{ ch.personality }}</p>
          <div v-if="ch.aliases?.length" class="character-aliases">
            <span v-for="a in ch.aliases.slice(0,3)" :key="a" class="nw-tag nw-tag--muted">{{ a }}</span>
          </div>
          <div class="character-actions">
            <button class="chapter-action" title="详情" @click="openDetail(ch)"><Icon name="sparkles" :size="14" /></button>
            <button class="chapter-action" title="立绘" @click="openPortrait(ch)"><Icon name="user" :size="14" /></button>
            <button class="chapter-action" title="编辑" @click="openEdit(ch)"><Icon name="pen" :size="14" /></button>
            <button class="chapter-action chapter-action--danger" title="删除" @click="remove(ch)"><Icon name="close" :size="14" /></button>
          </div>
        </div>
      </div>
    </StateView>

    <!-- 编辑弹窗 -->
    <Modal v-model="editVisible" :title="isEditing ? '编辑角色' : '新建角色'" width="600px">
      <div class="nw-field">
        <label class="nw-field-label">角色名 *</label>
        <input v-model="form.name" class="nw-input" placeholder="角色名" />
      </div>
      <div class="cover-form-grid">
        <div class="nw-field">
          <label class="nw-field-label">角色定位</label>
          <select v-model="form.role" class="nw-input">
            <option v-for="[val, label] in ROLE_OPTIONS" :key="val" :value="val">{{ label }}</option>
          </select>
        </div>
        <div class="nw-field">
          <label class="nw-field-label">年龄</label>
          <input v-model="form.age" class="nw-input" placeholder="如：25" />
        </div>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">别名/称号</label>
        <div class="tag-input-row">
          <input v-model="newAlias" class="nw-input" placeholder="输入后回车添加" @keydown.enter="addAlias" />
          <button class="desktop-btn" @click="addAlias"><Icon name="plus" :size="14" /></button>
        </div>
        <div v-if="form.aliases?.length" class="tag-list">
          <span v-for="a in form.aliases" :key="a" class="nw-tag">{{ a }} <button class="tag-remove" @click="removeAlias(a)">×</button></span>
        </div>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">外貌</label>
        <textarea v-model="form.appearance" class="nw-textarea" rows="2" placeholder="外貌描写" />
      </div>
      <div class="nw-field">
        <label class="nw-field-label">性格</label>
        <textarea v-model="form.personality" class="nw-textarea" rows="2" placeholder="性格描写" />
      </div>
      <div class="nw-field">
        <label class="nw-field-label">性格标签</label>
        <div class="tag-input-row">
          <input v-model="newTrait" class="nw-input" placeholder="如：腹黑、温柔" @keydown.enter="addTrait" />
          <button class="desktop-btn" @click="addTrait"><Icon name="plus" :size="14" /></button>
        </div>
        <div v-if="form.personalityTraits?.length" class="tag-list">
          <span v-for="t in form.personalityTraits" :key="t" class="nw-tag">{{ t }} <button class="tag-remove" @click="removeTrait(t)">×</button></span>
        </div>
      </div>
      <div class="cover-form-grid">
        <div class="nw-field">
          <label class="nw-field-label">说话风格</label>
          <input v-model="form.speechStyle" class="nw-input" placeholder="如：冷淡、话少" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">动机</label>
          <input v-model="form.motivation" class="nw-input" placeholder="核心动机" />
        </div>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">背景故事</label>
        <textarea v-model="form.backstory" class="nw-textarea" rows="3" placeholder="角色背景" />
      </div>

      <template #footer>
        <button class="desktop-btn" :disabled="saving" @click="editVisible = false">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="saving" @click="save">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </template>
    </Modal>

    <!-- 立绘生成弹窗 -->
    <Modal v-model="portraitDialogVisible" :title="`立绘 · ${portraitCharacter?.name ?? ''}`" width="480px">
      <div class="portrait-preview">
        <img v-if="portraitPreviewUrl" :src="portraitPreviewUrl" class="portrait-preview-img" alt="立绘" />
        <div v-else-if="portraitGenerating" class="portrait-generating">
          <span class="gen-panel-spin" />
          <span>AI 立绘生成中…</span>
        </div>
        <div v-else class="portrait-placeholder">
          <Icon name="user" :size="48" />
          <span>暂无立绘</span>
        </div>
      </div>
      <div v-if="portraitStyleOptions" class="cover-form-grid" style="margin-top: var(--nw-space-4)">
        <div class="nw-field">
          <label class="nw-field-label">视觉风格</label>
          <select v-model="portraitSelected.visualStyleKey" class="nw-input">
            <option :value="undefined">自动</option>
            <option v-for="o in portraitStyleOptions.visualStyleOptions ?? []" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
        </div>
        <div class="nw-field">
          <label class="nw-field-label">时代</label>
          <select v-model="portraitSelected.eraKey" class="nw-input">
            <option :value="undefined">自动</option>
            <option v-for="o in portraitStyleOptions.eraOptions ?? []" :key="o.key" :value="o.key">{{ o.label }}</option>
          </select>
        </div>
      </div>

      <template #footer>
        <button class="desktop-btn" @click="portraitDialogVisible = false">关闭</button>
        <button v-if="portraitPreviewUrl" class="desktop-btn reader-danger" @click="removePortrait">删除</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="portraitGenerating" @click="generatePortrait">
          <Icon name="sparkles" :size="16" /> {{ portraitGenerating ? '生成中…' : (portraitPreviewUrl ? '重新生成' : 'AI 生成立绘') }}
        </button>
      </template>
    </Modal>

    <!-- 角色详情弹窗 -->
    <DesktopCharacterDetail v-model="detailVisible" :novel-id="novelId" :character="detailCharacter" />
  </div>
</template>
