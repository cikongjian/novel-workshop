<template>
  <div v-if="visible" class="char-detail-sheet">
    <div class="char-detail-sheet__backdrop" @click="close" />
    <div class="char-detail-sheet__panel">
      <div class="char-detail-sheet__header">
        <span class="char-detail-sheet__title">角色档案</span>
        <button class="char-detail-sheet__close" @click="close">关闭</button>
      </div>

      <div v-if="loading" class="char-detail-sheet__loading">加载中...</div>

      <div v-else-if="!character" class="char-detail-sheet__loading">未找到角色</div>

      <div v-else class="char-detail-sheet__body">
        <!-- 立绘大图 -->
        <div class="char-detail-sheet__portrait">
          <img
            v-if="character.portraitImagePath"
            :src="`/api/novels/${novelId}/characters/${character.id}/portrait?w=600`"
            alt=""
          />
          <div v-else class="char-detail-sheet__portrait-placeholder">
            <span>{{ character.name?.charAt(0) || '?' }}</span>
          </div>
        </div>

        <!-- 基本信息 -->
        <div class="char-detail-sheet__section">
          <div class="char-detail-sheet__name-row">
            <h2 class="char-detail-sheet__name">{{ character.name }}</h2>
          </div>
          <div v-if="character.aliases?.length" class="char-detail-sheet__aliases">
            别名：{{ character.aliases.join('、') }}
          </div>
          <div class="char-detail-sheet__meta-row">
            <span>{{ CHARACTER_ROLE_LABELS[character.role] }}</span>
            <span v-if="character.gender">{{ character.gender }}</span>
            <span v-if="character.age">{{ character.age }}</span>
            <span v-if="character.position">{{ character.position }}</span>
            <span v-if="character.firstAppearance">首次出场：第 {{ character.firstAppearance }} 章</span>
          </div>
          <MobileCharacterIdentityLabels :labels="character.identityLabels ?? []" />
          <div class="char-detail-sheet__mailbox-row" v-if="character.mailboxEnabled">
            <span class="char-detail-sheet__mailbox-tag">信箱已开</span>
          </div>
        </div>

        <!-- 金句 + 高光时刻（粉丝向魅力档案） -->
        <div v-if="characterId" class="char-detail-sheet__section">
          <MobileCharacterHighlights :novel-id="novelId" :character-id="characterId" />
        </div>

        <!-- 人物关系（对手戏 / 羁绊） -->
        <div v-if="characterId" class="char-detail-sheet__section">
          <MobileCharacterRelations :novel-id="novelId" :character-id="characterId" />
        </div>

        <!-- 来信统计 -->
        <div v-if="letterCount > 0" class="char-detail-sheet__section char-detail-sheet__letters">
          <div class="char-detail-sheet__letters-count">
            <span class="char-detail-sheet__letters-num">{{ letterCount }}</span>
            <span class="char-detail-sheet__letters-label">封读者来信</span>
          </div>
        </div>

        <!-- 互动操作区 -->
        <div class="char-detail-sheet__actions">
          <button
            v-if="canEdit"
            class="char-detail-sheet__icon-btn"
            @click="editVisible = true"
          >
            <el-icon :size="20"><EditPen /></el-icon>
            <span class="char-detail-sheet__icon-btn-label">编辑</span>
          </button>
          <button
            v-if="character.mailboxEnabled"
            class="char-detail-sheet__icon-btn"
            @click="openChat"
          >
            <el-icon :size="20"><ChatDotRound /></el-icon>
            <span class="char-detail-sheet__icon-btn-label">对话</span>
          </button>
          <button
            v-if="character.mailboxEnabled"
            class="char-detail-sheet__icon-btn"
            @click="openSideStory"
          >
            <el-icon :size="20"><Reading /></el-icon>
            <span class="char-detail-sheet__icon-btn-label">番外</span>
          </button>
          <button
            v-if="canEdit"
            class="char-detail-sheet__icon-btn"
            :class="{ 'is-loading': polishingIntro }"
            :disabled="polishingIntro"
            @click="handlePolishIntro"
          >
            <el-icon :size="20"><MagicStick /></el-icon>
            <span class="char-detail-sheet__icon-btn-label">润色</span>
          </button>
          <button
            v-if="canEdit"
            class="char-detail-sheet__icon-btn"
            :class="{ 'is-on': autoEvolve }"
            @click="toggleAutoEvolve"
          >
            <el-icon :size="20"><Odometer /></el-icon>
            <span class="char-detail-sheet__icon-btn-label">进化</span>
          </button>
        </div>

        <!-- AI 润色结果 -->
        <div v-if="polishResult" class="char-detail-sheet__section char-detail-sheet__polish">
          <div class="char-detail-sheet__polish-oneliner" v-if="polishResult.oneLiner">
            {{ polishResult.oneLiner }}
          </div>
          <h3 class="char-detail-sheet__section-title">AI 润色 · 人物介绍</h3>
          <p class="char-detail-sheet__section-text">{{ polishResult.introParagraph }}</p>
          <div v-if="polishResult.polishedFields" class="char-detail-sheet__polish-fields">
            <div
              v-for="(value, key) in polishResult.polishedFields"
              :key="key"
              class="char-detail-sheet__polish-field"
            >
              <span class="char-detail-sheet__polish-field-label">{{ POLISH_FIELD_LABELS[key] || key }}</span>
              <p class="char-detail-sheet__polish-field-text">{{ value }}</p>
            </div>
          </div>
          <div v-if="polishResult.suggestedTags?.length" class="char-detail-sheet__polish-tags">
            <span v-for="tag in polishResult.suggestedTags" :key="tag" class="char-detail-sheet__trait-tag char-detail-sheet__trait-tag--suggested">{{ tag }}</span>
          </div>
          <button
            class="char-detail-sheet__polish-apply-btn"
            :disabled="polishApplyingFields"
            @click="handleApplyPolishedFields"
          >
            {{ polishApplyingFields ? '应用中...' : '一键应用润色结果' }}
          </button>
        </div>

        <!-- 性格 -->
        <div v-if="character.personality" class="char-detail-sheet__section">
          <h3 class="char-detail-sheet__section-title">性格</h3>
          <p class="char-detail-sheet__section-text">{{ character.personality }}</p>
          <div v-if="character.personalityTraits?.length" class="char-detail-sheet__tags">
            <span v-for="trait in character.personalityTraits" :key="trait" class="char-detail-sheet__trait-tag">{{ trait }}</span>
          </div>
        </div>

        <!-- 外貌 -->
        <div v-if="character.appearance" class="char-detail-sheet__section">
          <h3 class="char-detail-sheet__section-title">外貌</h3>
          <p class="char-detail-sheet__section-text">{{ character.appearance }}</p>
        </div>

        <!-- 说话风格 -->
        <div v-if="character.speechStyle" class="char-detail-sheet__section">
          <h3 class="char-detail-sheet__section-title">说话风格</h3>
          <p class="char-detail-sheet__section-text">{{ character.speechStyle }}</p>
          <div v-if="character.speechExamples?.length" class="char-detail-sheet__quotes">
            <blockquote v-for="(quote, i) in character.speechExamples.slice(0, 3)" :key="i" class="char-detail-sheet__quote">
              {{ quote }}
            </blockquote>
          </div>
        </div>

        <!-- 背景故事 -->
        <div v-if="character.backstory" class="char-detail-sheet__section">
          <h3 class="char-detail-sheet__section-title">背景故事</h3>
          <p class="char-detail-sheet__section-text">{{ character.backstory }}</p>
        </div>

        <!-- 动机 -->
        <div v-if="character.motivation" class="char-detail-sheet__section">
          <h3 class="char-detail-sheet__section-title">核心动机</h3>
          <p class="char-detail-sheet__section-text">{{ character.motivation }}</p>
        </div>

        <!-- 能力 -->
        <div v-if="character.abilities?.length" class="char-detail-sheet__section">
          <h3 class="char-detail-sheet__section-title">能力</h3>
          <div class="char-detail-sheet__tags">
            <span v-for="ability in character.abilities" :key="ability" class="char-detail-sheet__ability-tag">{{ ability }}</span>
          </div>
        </div>

        <!-- 成长轨迹 -->
        <div v-if="character.arc" class="char-detail-sheet__section">
          <h3 class="char-detail-sheet__section-title">成长轨迹</h3>
          <p class="char-detail-sheet__section-text">{{ character.arc }}</p>
        </div>
      </div>
    </div>

    <!-- 角色实时对话 -->
    <CharacterChatSheet
      :visible="chatVisible"
      :novel-id="novelId"
      :character-id="characterId || ''"
      :character-name="character?.name || ''"
      :character-portrait="character?.portraitImagePath ? `/api/novels/${novelId}/characters/${character.id}/portrait?w=200` : ''"
      @close="chatVisible = false"
    />

    <!-- 角色档案编辑（仅作者/管理员） -->
    <MobileCharacterEditSheet
      :visible="editVisible"
      :novel-id="novelId"
      :character="character"
      @close="editVisible = false"
      @saved="handleEditSaved"
    />

    <!-- 番外广场 -->
    <SideStoryPlaza
      :visible="sideStoryPlazaVisible"
      :novel-id="novelId"
      :novel-owner-id="character?.ownerId"
      @close="sideStoryPlazaVisible = false"
      @open-reader="(id: string) => { sideStoryReaderId = id; sideStoryReaderVisible = true; }"
      @open-generate="openSideStoryGenerate"
    />
    <SideStoryGenerateSheet
      :visible="sideStoryGenVisible"
      :novel-id="novelId"
      :preselect-character-id="sideStoryPreselectCharId"
      @close="closeSideStoryGenerate"
      @generated="onSideStoryGenerated"
    />
    <SideStoryReader
      :visible="sideStoryReaderVisible"
      :story-id="sideStoryReaderId"
      :is-owner="canEdit"
      @close="sideStoryReaderVisible = false"
      @deleted="() => { sideStoryReaderVisible = false; sideStoryPlazaVisible = true; }"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { EditPen, ChatDotRound, MagicStick, Odometer, Reading } from '@element-plus/icons-vue';
import { CHARACTER_ROLE_LABELS, type CharacterProfile } from '../../types';
import { fetchCharacters, polishCharacterIntro, updateCharacter } from '../../api/characters';
import { http } from '../../api/http';
import type { PolishIntroResult } from '../../api/characters';
import { fetchNovelLetters } from '../../api/character-mail';
import CharacterChatSheet from './CharacterChatSheet.vue';
import MobileCharacterEditSheet from './MobileCharacterEditSheet.vue';
import MobileCharacterHighlights from './MobileCharacterHighlights.vue';
import MobileCharacterIdentityLabels from './MobileCharacterIdentityLabels.vue';
import MobileCharacterRelations from './MobileCharacterRelations.vue';
import SideStoryPlaza from './SideStoryPlaza.vue';
import SideStoryGenerateSheet from './SideStoryGenerateSheet.vue';
import SideStoryReader from './SideStoryReader.vue';

const POLISH_FIELD_LABELS: Record<string, string> = {
  personality: '性格描述',
  backstory: '背景故事',
  motivation: '核心动机',
  appearance: '外貌特征',
  publicPersona: '公众形象',
  privatePersona: '私下面目',
  reputation: '名声评价',
  speechStyle: '说话风格',
  worldview: '世界观/信念',
};

const props = defineProps<{
  visible: boolean;
  novelId: string;
  characterId: string | null;
  /** 是否允许编辑（角色身份、AI润色等），仅作者/管理员可见 */
  canEdit?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  openSideStory: [characterId: string];
  characterUpdated: [];
}>();

const loading = ref(false);
const character = ref<CharacterProfile | null>(null);
const letterCount = ref(0);
const chatVisible = ref(false);
const editVisible = ref(false);

const sideStoryPlazaVisible = ref(false);
const sideStoryGenVisible = ref(false);
const sideStoryReaderVisible = ref(false);
const sideStoryReaderId = ref<string | null>(null);
const sideStoryPreselectCharId = ref<string | null>(null);

// 自动进化开关
const autoEvolve = ref(true);
const togglingAutoEvolve = ref(false);

// AI 润色
const polishingIntro = ref(false);
const polishResult = ref<PolishIntroResult | null>(null);
const polishApplyingFields = ref(false);

function openChat() {
  chatVisible.value = true;
}

function openSideStory() {
  if (character.value?.id) {
    sideStoryPreselectCharId.value = character.value.id;
    sideStoryPlazaVisible.value = true;
    emit('openSideStory', character.value.id);
  }
}

function openSideStoryGenerate() {
  sideStoryPlazaVisible.value = false;
  sideStoryGenVisible.value = true;
}

function closeSideStoryGenerate() {
  sideStoryGenVisible.value = false;
  sideStoryPreselectCharId.value = null;
}

function onSideStoryGenerated(storyId: string) {
  sideStoryGenVisible.value = false;
  sideStoryPreselectCharId.value = null;
  sideStoryReaderId.value = storyId;
  sideStoryReaderVisible.value = true;
}

async function handlePolishIntro() {
  if (!props.characterId) return;
  polishingIntro.value = true;
  polishResult.value = null;
  try {
    const result = await polishCharacterIntro(props.novelId, props.characterId);
    polishResult.value = result;
  } catch {
    // 错误静默处理，用户可见按钮状态恢复
  } finally {
    polishingIntro.value = false;
  }
}

async function handleApplyPolishedFields() {
  if (!props.characterId || !polishResult.value || !character.value) return;
  polishApplyingFields.value = true;
  try {
    const fields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(polishResult.value.polishedFields)) {
      if (value) fields[key] = value;
    }
    if (polishResult.value.suggestedTags?.length) {
      fields.tags = [...new Set([...(character.value.tags || []), ...polishResult.value.suggestedTags])];
    }
    await updateCharacter(props.novelId, props.characterId, fields);
    polishResult.value = null;
    emit('characterUpdated');
    // 刷新角色数据
    if (props.characterId) {
      await loadDetail(props.characterId);
    }
  } catch {
    // 错误静默处理
  } finally {
    polishApplyingFields.value = false;
  }
}

watch(
  () => [props.visible, props.characterId] as const,
  async ([val, charId]) => {
    if (val && charId && props.novelId) {
      await loadDetail(charId);
    }
  },
);

async function loadDetail(charId: string) {
  loading.value = true;
  character.value = null;
  letterCount.value = 0;
  try {
    const [charList, letterData] = await Promise.all([
      fetchCharacters(props.novelId).catch(() => [] as CharacterProfile[]),
      fetchNovelLetters(props.novelId).catch(() => ({ letters: [], stats: [], total: 0 })),
    ]);
    character.value = charList.find((c) => c.id === charId) ?? null;
    autoEvolve.value = (character.value as any)?.autoEvolve !== false;
    const stat = letterData.stats.find((s) => s.characterId === charId);
    letterCount.value = stat?.count ?? 0;
  } finally {
    loading.value = false;
  }
}

async function toggleAutoEvolve() {
  if (!props.characterId || togglingAutoEvolve.value) return;
  togglingAutoEvolve.value = true;
  const next = !autoEvolve.value;
  try {
    await http.post(`/novels/${props.novelId}/characters/${props.characterId}/auto-evolve`, { enabled: next });
    autoEvolve.value = next;
  } catch {
    // 静默
  } finally {
    togglingAutoEvolve.value = false;
  }
}

function close() {
  emit('close');
}

async function handleEditSaved() {
  emit('characterUpdated');
  if (props.characterId) {
    await loadDetail(props.characterId);
  }
}
</script>

<style scoped>
.char-detail-sheet {
  position: fixed;
  inset: 0;
  z-index: 2100;
  --char-sheet-accent: var(--mobile-focus-accent, var(--star-brand-sky));
  --char-sheet-accent-strong: var(--mobile-focus-accent-strong, var(--star-brand-teal));
  --char-sheet-surface: color-mix(in srgb, var(--nw-bg-primary) 92%, transparent);
  --char-sheet-surface-soft: color-mix(in srgb, var(--nw-bg-secondary) 86%, transparent);
  --char-sheet-border: color-mix(in srgb, var(--char-sheet-accent) 18%, var(--nw-border));
}

.char-detail-sheet__backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--nw-text-primary) 58%, transparent);
  backdrop-filter: blur(8px);
}

.char-detail-sheet__panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 92dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--char-sheet-border);
  border-bottom: 0;
  border-radius: 24px 24px 0 0;
  background:
    radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--char-sheet-accent) 16%, transparent), transparent 34%),
    linear-gradient(180deg, var(--char-sheet-surface), var(--char-sheet-surface-soft));
  box-shadow: 0 -24px 48px color-mix(in srgb, var(--nw-text-primary) 18%, transparent);
}

.char-detail-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 14px 18px;
  border-bottom: 1px solid var(--char-sheet-border);
}

.char-detail-sheet__title {
  color: var(--nw-text-primary);
  font-size: 16px;
  font-weight: 800;
}

.char-detail-sheet__close {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--char-sheet-accent) 18%, var(--nw-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--char-sheet-accent) 9%, transparent);
  color: color-mix(in srgb, var(--char-sheet-accent) 86%, var(--nw-text-primary));
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}

.char-detail-sheet__loading {
  padding: 48px 20px;
  color: var(--nw-text-muted);
  font-size: 14px;
  text-align: center;
}

.char-detail-sheet__body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 32px;
}

/* Portrait */
.char-detail-sheet__portrait {
  width: 100%;
  aspect-ratio: 3 / 4;
  max-height: 420px;
  overflow: hidden;
  background:
    radial-gradient(circle at center, color-mix(in srgb, var(--char-sheet-accent) 14%, transparent), transparent 54%),
    var(--char-sheet-surface-soft);
}

.char-detail-sheet__portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.char-detail-sheet__portrait-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: color-mix(in srgb, var(--char-sheet-accent) 34%, var(--nw-text-muted));
  font-size: 64px;
  font-weight: 800;
}

/* Sections */
.char-detail-sheet__section {
  padding: 16px 20px 0;
}

.char-detail-sheet__name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.char-detail-sheet__name {
  margin: 0;
  color: var(--nw-text-primary);
  font-size: 22px;
  font-weight: 800;
}

.char-detail-sheet__role-tag,
.char-detail-sheet__mailbox-tag {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.char-detail-sheet__role-tag {
  background: color-mix(in srgb, var(--char-sheet-accent) 10%, transparent);
  color: color-mix(in srgb, var(--char-sheet-accent) 84%, var(--nw-text-primary));
}

.char-detail-sheet__mailbox-tag {
  background: linear-gradient(135deg, var(--char-sheet-accent), var(--char-sheet-accent-strong));
  color: var(--mobile-focus-on-accent, var(--nw-bg-primary));
}

.char-detail-sheet__aliases {
  margin-top: 6px;
  color: var(--nw-text-muted);
  font-size: 13px;
}

.char-detail-sheet__meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  color: var(--nw-text-secondary);
  font-size: 13px;
}

.char-detail-sheet__meta-row span::after {
  content: '·';
  margin-left: 12px;
  color: var(--nw-text-muted);
}

.char-detail-sheet__meta-row span:last-child::after {
  content: '';
}

.char-detail-sheet__mailbox-row {
  margin-top: 8px;
}

/* Letter stats */
.char-detail-sheet__letters {
  margin: 12px 20px 0;
  padding: 16px 20px;
  border: 1px solid var(--char-sheet-border);
  border-radius: 16px;
  background:
    radial-gradient(circle at 14% 0%, color-mix(in srgb, var(--char-sheet-accent) 16%, transparent), transparent 44%),
    var(--char-sheet-surface-soft);
}

.char-detail-sheet__letters-count {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.char-detail-sheet__letters-num {
  color: color-mix(in srgb, var(--char-sheet-accent) 88%, var(--nw-text-primary));
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
}

.char-detail-sheet__letters-label {
  color: var(--nw-text-secondary);
  font-size: 14px;
  font-weight: 600;
}

/* 互动操作区 */
.char-detail-sheet__actions {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-evenly;
  gap: 8px;
  margin: 12px 20px 0;
}

.char-detail-sheet__icon-btn {
  width: 50px;
  min-height: 50px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 7px 4px 6px;
  border: 1px solid var(--char-sheet-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--nw-bg-secondary) 70%, transparent);
  color: var(--nw-text-secondary);
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.char-detail-sheet__icon-btn-label {
  color: var(--nw-text-muted);
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
}

.char-detail-sheet__icon-btn:active {
  transform: scale(0.94);
  background: color-mix(in srgb, var(--char-sheet-accent) 10%, var(--nw-bg-secondary));
}

.char-detail-sheet__icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

/* 自动进化：开启状态 */
.char-detail-sheet__icon-btn.is-on {
  border-color: color-mix(in srgb, var(--char-sheet-accent) 45%, var(--nw-border));
  background: color-mix(in srgb, var(--char-sheet-accent) 14%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--char-sheet-accent) 88%, var(--nw-text-primary));
}

.char-detail-sheet__icon-btn.is-on .char-detail-sheet__icon-btn-label {
  color: color-mix(in srgb, var(--char-sheet-accent) 88%, var(--nw-text-primary));
}

/* AI 润色：加载中脉冲动画 */
.char-detail-sheet__icon-btn.is-loading {
  animation: char-detail-pulse 1.2s ease-in-out infinite;
}

@keyframes char-detail-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* AI polish results */
.char-detail-sheet__polish {
  margin: 12px 20px 0;
  padding: 16px 20px;
  border: 1px solid var(--char-sheet-border);
  border-radius: 16px;
  background:
    radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--char-sheet-accent-strong) 13%, transparent), transparent 42%),
    var(--char-sheet-surface-soft);
}

.char-detail-sheet__polish-oneliner {
  margin-bottom: 14px;
  padding: 10px 14px;
  border-left: 3px solid color-mix(in srgb, var(--char-sheet-accent) 72%, var(--nw-border));
  border-radius: 0 10px 10px 0;
  background: color-mix(in srgb, var(--char-sheet-accent) 10%, transparent);
  color: color-mix(in srgb, var(--char-sheet-accent) 86%, var(--nw-text-primary));
  font-size: 14px;
  font-weight: 800;
  line-height: 1.6;
}

.char-detail-sheet__polish-fields,
.char-detail-sheet__polish-tags {
  margin-top: 12px;
}

.char-detail-sheet__polish-field {
  margin-bottom: 10px;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--char-sheet-accent) 12%, var(--nw-border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--nw-bg-primary) 56%, transparent);
}

.char-detail-sheet__polish-field-label {
  color: color-mix(in srgb, var(--char-sheet-accent) 82%, var(--nw-text-primary));
  font-size: 12px;
  font-weight: 800;
}

.char-detail-sheet__polish-field-text {
  margin: 4px 0 0;
  color: var(--nw-text-secondary);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.char-detail-sheet__polish-apply-btn {
  display: block;
  width: 100%;
  margin-top: 14px;
  padding: 12px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--char-sheet-accent), var(--char-sheet-accent-strong));
  color: var(--mobile-focus-on-accent, var(--nw-bg-primary));
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.char-detail-sheet__polish-apply-btn:active {
  transform: scale(0.98);
}

.char-detail-sheet__polish-apply-btn:disabled {
  opacity: 0.6;
}

/* Section content */
.char-detail-sheet__section-title {
  margin: 0 0 8px;
  color: var(--nw-text-primary);
  font-size: 14px;
  font-weight: 800;
}

.char-detail-sheet__section-text {
  margin: 0;
  color: var(--nw-text-secondary);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}

/* Tags */
.char-detail-sheet__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.char-detail-sheet__trait-tag,
.char-detail-sheet__ability-tag {
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--char-sheet-accent) 15%, var(--nw-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--char-sheet-accent) 8%, transparent);
  color: color-mix(in srgb, var(--char-sheet-accent) 80%, var(--nw-text-primary));
  font-size: 12px;
  font-weight: 600;
}

.char-detail-sheet__ability-tag {
  background: color-mix(in srgb, var(--char-sheet-accent-strong) 8%, transparent);
  color: color-mix(in srgb, var(--char-sheet-accent-strong) 82%, var(--nw-text-primary));
}

.char-detail-sheet__trait-tag--suggested {
  background: color-mix(in srgb, var(--char-sheet-accent-strong) 12%, transparent);
  color: color-mix(in srgb, var(--char-sheet-accent-strong) 86%, var(--nw-text-primary));
}

/* Quotes */
.char-detail-sheet__quotes {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.char-detail-sheet__quote {
  margin: 0;
  padding: 10px 14px;
  border-left: 3px solid color-mix(in srgb, var(--char-sheet-accent) 72%, var(--nw-border));
  border-radius: 0 10px 10px 0;
  background: color-mix(in srgb, var(--nw-bg-secondary) 76%, transparent);
  color: var(--nw-text-secondary);
  font-size: 13px;
  font-style: italic;
  line-height: 1.6;
}
</style>
