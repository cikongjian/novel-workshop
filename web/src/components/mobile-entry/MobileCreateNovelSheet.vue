<script setup lang="ts">
import axios from 'axios';
import { computed, onUnmounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowDown, ArrowUp, Close, MagicStick } from '@element-plus/icons-vue';
import { createNovel, createShuangwenAsync } from '../../api/novels';
import { userApiApi } from '../../api/user-api';
import { DEFAULT_CHAPTER_WORD_TARGET } from '../../config/chapter-generation-options';
import { NOVEL_CONSTITUTION_TAG_LIMIT } from '../../config/novel-constitution-tags';
import { NOVEL_GENRE_OPTIONS, NOVEL_GENRE_SELECT_HINT } from '../../config/novel-genres';
import { extractApiErrorMessage } from '../../utils/api-error';
import { syncUserApiProfileState } from '../../utils/user-api-local';
import type { NovelGenre } from '../../types';
import IdeaKickstartPanel from '../novel/IdeaKickstartPanel.vue';
import NovelConstitutionTagPicker from '../dashboard/NovelConstitutionTagPicker.vue';

interface Props {
  modelValue: boolean;
  initialSeedIdea?: string;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
  (e: 'created', novelId: string): void;
  (e: 'created-detail', payload: { novelId: string; launchMode: 'blank' | 'kickstart' }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const form = ref({
  title: '',
  genre: 'fantasy' as NovelGenre,
  synopsis: '',
  shuangwenSeedIdea: '',
  constitutionTags: [] as string[],
});
const creating = ref(false);
const kickstarting = ref(false);
const extraInfoExpanded = ref(false);
const previousBodyOverflow = ref('');

const genreOptions = NOVEL_GENRE_OPTIONS;
const titlePlaceholder = computed(() => '输入小说标题');

const kickstartProductTitle = computed(() => 'AI 开书脑洞');
const kickstartPrimaryLabel = computed(() => `启动${kickstartProductTitle.value}`);
const kickstartSummary = computed(() => '系统会用你的模型 API 生成书名、设定、大纲和首章样稿。');
const kickstartMetaText = computed(() => '平台不提供模型额度，调用成本由你的模型 API 账户承担。');

function resetForm() {
  form.value = {
    title: '',
    genre: 'fantasy',
    synopsis: '',
    shuangwenSeedIdea: props.initialSeedIdea?.trim().slice(0, 800) || '',
    constitutionTags: [],
  };
  extraInfoExpanded.value = false;
}

function lockBodyScroll(locked: boolean) {
  if (typeof document === 'undefined') return;
  if (locked) {
    previousBodyOverflow.value = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return;
  }
  document.body.style.overflow = previousBodyOverflow.value;
}

function closeSheet() {
  if (creating.value || kickstarting.value) return;
  visible.value = false;
}

function buildShuangwenSeedIdea(): string {
  const seed = typeof form.value.shuangwenSeedIdea === 'string' ? form.value.shuangwenSeedIdea.trim() : '';
  if (seed) return seed.slice(0, 800);
  const synopsis = typeof form.value.synopsis === 'string' ? form.value.synopsis.trim() : '';
  return synopsis.slice(0, 800);
}

async function handleCreateEmpty() {
  if (!form.value.title.trim()) {
    ElMessage.warning('请输入小说标题');
    return;
  }

  creating.value = true;
  try {
    const novel = await createNovel({
      title: form.value.title.trim(),
      genre: form.value.genre,
      synopsis: form.value.synopsis.trim() || undefined,
      constitutionTags: form.value.constitutionTags,
    });
    ElMessage.success('已创建空白项目');
    visible.value = false;
    emit('created-detail', { novelId: novel.id, launchMode: 'blank' });
    emit('created', novel.id);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '创建失败'));
  } finally {
    creating.value = false;
  }
}

async function syncDefaultUserApiProfile() {
  try {
    const profiles = await userApiApi.listProfiles();
    syncUserApiProfileState(profiles);
  } catch {
  }
}

async function handleKickstartFailure(err: unknown) {
  const message = extractApiErrorMessage(err, '开书创建失败');
  if (axios.isAxiosError(err) && err.response?.status === 402) {
    ElMessage.error(`${message}。本平台使用自填 API，请先确认模型配置可用。`);
    return;
  }

  ElMessage.error(message);
}

async function handleKickstart() {
  const seedIdea = buildShuangwenSeedIdea();
  if (!seedIdea) {
    ElMessage.warning('请填写开书提示，或至少提供一段简介');
    return;
  }

  kickstarting.value = true;
  try {
    await syncDefaultUserApiProfile();
    const result = await createShuangwenAsync({
      genre: form.value.genre,
      seedIdea,
      title: form.value.title.trim() || undefined,
      synopsis: form.value.synopsis.trim() || undefined,
      constitutionTags: form.value.constitutionTags,
      titleHint: form.value.title.trim() || undefined,
      synopsisHint: form.value.synopsis.trim() || undefined,
      outlineChapters: 20,
      targetChapters: 120,
      includeMarketing: false,
      sampleChapter: true,
      maxWordCount: DEFAULT_CHAPTER_WORD_TARGET,
      createChapterShells: false,
    });

    if (!result.novelId) {
      ElMessage.error(`${kickstartProductTitle.value}创建成功，但没有返回小说 ID`);
      return;
    }

    ElMessage.success(`${kickstartProductTitle.value}已启动，正在为你生成基础内容`);
    visible.value = false;
    emit('created-detail', { novelId: result.novelId, launchMode: 'kickstart' });
    emit('created', result.novelId);
  } catch (err) {
    await handleKickstartFailure(err);
  } finally {
    kickstarting.value = false;
  }
}

watch(
  () => props.modelValue,
  (value) => {
    lockBodyScroll(value);
    if (value) {
      resetForm();
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  lockBodyScroll(false);
});
</script>

<template>
  <Teleport to="body">
    <transition name="mobile-create-sheet-fade">
      <div v-if="visible" class="mobile-create-sheet">
        <button class="mobile-create-sheet__backdrop" type="button" aria-label="关闭开书面板" @click="closeSheet" />

        <section class="mobile-create-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="mobile-create-sheet-title">
          <header class="mobile-create-sheet__header">
            <div class="mobile-create-sheet__heading">
              <p>新建作品</p>
              <h2 id="mobile-create-sheet-title">开始开书</h2>
              <span>先写书名，再决定怎么开。</span>
            </div>
            <button class="mobile-create-sheet__close" type="button" aria-label="关闭" @click="closeSheet">
              <el-icon :size="18"><Close /></el-icon>
            </button>
          </header>

          <div class="mobile-create-sheet__body">
            <div class="mobile-create-sheet__mode-strip">
              <strong>开书模式</strong>
              <div class="mobile-create-sheet__mode-chips">
                <span>空白项目</span>
                <span>
                  <el-icon :size="12"><MagicStick /></el-icon>
                  {{ kickstartProductTitle }}
                </span>
              </div>
            </div>

            <section class="mobile-create-sheet__section">
              <div class="mobile-create-sheet__section-head">
                <strong>开书信息</strong>
                <span>{{ form.title.trim() ? '书名已定' : '先占个书名' }}</span>
              </div>

              <label class="mobile-create-sheet__field">
                <span>书名</span>
                <input v-model="form.title" type="text" maxlength="50" :placeholder="titlePlaceholder" />
              </label>

              <div class="mobile-create-sheet__field">
                <span>题材</span>
                <div class="mobile-create-sheet__genre-grid">
                  <button
                    v-for="item in genreOptions"
                    :key="item.value"
                    class="mobile-create-sheet__genre-chip"
                    :class="{ active: form.genre === item.value }"
                    type="button"
                    @click="form.genre = item.value"
                  >
                    {{ item.label }}
                  </button>
                </div>
                <p class="mobile-create-sheet__field-note">{{ NOVEL_GENRE_SELECT_HINT }}</p>
              </div>

              <label class="mobile-create-sheet__field">
                <span>开书提示</span>
                <textarea
                  v-model="form.shuangwenSeedIdea"
                  rows="4"
                  maxlength="800"
                  placeholder="把开局、人设、冲突、爽点丢进来。"
                />
              </label>

              <button class="mobile-create-sheet__toggle" type="button" @click="extraInfoExpanded = !extraInfoExpanded">
                <span>{{ extraInfoExpanded ? '收起补充信息' : '补充信息' }}</span>
                <small>{{ form.synopsis.trim() ? '已填写简介' : '可选' }}</small>
                <el-icon :size="14">
                  <ArrowUp v-if="extraInfoExpanded" />
                  <ArrowDown v-else />
                </el-icon>
              </button>

              <label v-if="extraInfoExpanded" class="mobile-create-sheet__field mobile-create-sheet__field--supplement">
                <span>作品简介</span>
                <textarea
                  v-model="form.synopsis"
                  rows="3"
                  maxlength="500"
                  placeholder="一句话写主角、设定或卖点。空着也可以。"
                />
              </label>

              <div class="mobile-create-sheet__field mobile-create-sheet__field--supplement">
                <span>题材宪章</span>
                <NovelConstitutionTagPicker v-model="form.constitutionTags" compact />
                <p class="mobile-create-sheet__field-note">
                  属于强约束，生成时优先兑现这些卖点。最多 {{ NOVEL_CONSTITUTION_TAG_LIMIT }} 个。
                </p>
              </div>
            </section>

            <section class="mobile-create-sheet__section">
              <IdeaKickstartPanel
                v-model:title="form.title"
                v-model:synopsis="form.synopsis"
                v-model:seed-idea="form.shuangwenSeedIdea"
                :genre="form.genre"
                mode="mobile"
              />
            </section>

          </div>

          <footer class="mobile-create-sheet__footer">
            <button class="mobile-create-sheet__secondary" type="button" :disabled="creating || kickstarting" @click="handleCreateEmpty">
              {{ creating ? '创建中...' : '只建空白项目' }}
            </button>
            <button
              class="mobile-create-sheet__primary"
              type="button"
              :disabled="creating || kickstarting"
              @click="handleKickstart"
            >
              {{ kickstarting ? '开书中...' : kickstartPrimaryLabel }}
            </button>
          </footer>
        </section>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.mobile-create-sheet {
  --mobile-create-accent: var(--star-brand-sky);
  --mobile-create-accent-strong: var(--star-brand-teal);
  position: fixed;
  inset: 0;
  z-index: 2100;
}

.mobile-create-sheet__backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(10px);
}

.mobile-create-sheet__panel {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(100%, 520px);
  height: 100%;
  margin: 0 auto;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--mobile-create-accent) 12%, transparent), transparent 26%),
    radial-gradient(circle at top left, color-mix(in srgb, var(--mobile-create-accent-strong) 8%, transparent), transparent 22%),
    linear-gradient(180deg, var(--nw-bg-primary), var(--nw-bg-secondary) 44%, color-mix(in srgb, var(--nw-bg-primary) 80%, var(--nw-bg-secondary)));
  color: var(--nw-text-primary);
}

/* 深色模式已通过 mobile-focus.css 的 html.dark .mobile-create-sheet 变量覆盖实现 */

.mobile-create-sheet__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--mobile-create-accent) 14%, var(--nw-border));
}

.mobile-create-sheet__heading p,
.mobile-create-sheet__heading span,
.mobile-create-sheet__field span,
.mobile-create-sheet__section-head span {
  color: var(--nw-text-secondary);
}

.mobile-create-sheet__heading p {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  margin: 0 0 4px;
  padding: 0 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-create-accent) 8%, var(--nw-bg-secondary));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.mobile-create-sheet__heading h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.04;
  letter-spacing: -0.03em;
}

.mobile-create-sheet__heading span {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.45;
}

.mobile-create-sheet__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 16%, var(--nw-border));
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  color: var(--nw-text-secondary);
}

.mobile-create-sheet__body {
  overflow-y: auto;
  padding: 0 16px 16px;
}

.mobile-create-sheet__mode-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: space-between;
  margin-top: 10px;
  padding: 0 2px;
}

.mobile-create-sheet__mode-strip strong,
.mobile-create-sheet__section-head strong,
.mobile-create-sheet__resource-head strong {
  display: block;
}

.mobile-create-sheet__mode-strip strong {
  font-size: 13px;
  color: var(--nw-text-primary);
}

.mobile-create-sheet__mode-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mobile-create-sheet__mode-chips span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 18%, var(--nw-border));
  background: color-mix(in srgb, var(--mobile-create-accent) 8%, var(--nw-bg-secondary));
  color: var(--nw-text-primary);
  font-size: 11px;
  font-weight: 700;
}

.mobile-create-sheet__section {
  margin-top: 8px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 14%, var(--nw-border));
  border-radius: 20px;
  background: var(--nw-bg-secondary);
  box-shadow: 0 10px 22px color-mix(in srgb, var(--nw-text-primary) 6%, transparent);
}

.mobile-create-sheet__resource {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 14%, var(--nw-border));
  border-radius: 18px;
  background: color-mix(in srgb, var(--mobile-create-accent) 4%, var(--nw-bg-secondary));
}

.mobile-create-sheet__resource-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.mobile-create-sheet__resource-head strong {
  font-size: 14px;
  line-height: 1.3;
}

.mobile-create-sheet__resource-head span,
.mobile-create-sheet__meta {
  color: var(--nw-text-secondary);
}

.mobile-create-sheet__resource-head span {
  font-size: 12px;
}

.mobile-create-sheet__resource-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: center;
}

.mobile-create-sheet__skill-panel {
  margin-top: 10px;
}

.mobile-create-sheet__section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--mobile-create-accent) 10%, var(--nw-border));
}

.mobile-create-sheet__section-head strong {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--mobile-create-accent) 76%, var(--nw-text-primary));
}

.mobile-create-sheet__section-head span {
  font-size: 11px;
}

.mobile-create-sheet__field {
  display: grid;
  gap: 7px;
}

.mobile-create-sheet__field + .mobile-create-sheet__field,
.mobile-create-sheet__field + div,
.mobile-create-sheet__status-strip + .mobile-create-sheet__summary {
  margin-top: 10px;
}

.mobile-create-sheet__toggle {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 14%, var(--nw-border));
  border-radius: 16px;
  background: color-mix(in srgb, var(--mobile-create-accent) 4%, var(--nw-bg-secondary));
  color: var(--nw-text-primary);
  text-align: left;
}

.mobile-create-sheet__toggle span {
  font-size: 12px;
  font-weight: 700;
  color: var(--nw-text-primary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.mobile-create-sheet__toggle small {
  font-size: 11px;
  color: var(--nw-text-secondary);
}

.mobile-create-sheet__field--supplement {
  margin-top: 10px;
  padding: 12px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--mobile-create-accent) 4%, var(--nw-bg-secondary));
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 12%, var(--nw-border));
}

.mobile-create-sheet__field input,
.mobile-create-sheet__field textarea {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 16%, var(--nw-border));
  border-radius: 14px;
  background: var(--nw-bg-secondary);
  padding: 12px 13px;
  font: inherit;
  color: var(--nw-text-primary);
  resize: vertical;
  box-sizing: border-box;
}

.mobile-create-sheet__field input:focus,
.mobile-create-sheet__field textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--mobile-create-accent) 46%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--mobile-create-accent) 12%, transparent);
}

.mobile-create-sheet__genre-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mobile-create-sheet__field-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
}

.mobile-create-sheet__universe-context {
  margin: 10px 0 0;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 18%, var(--nw-border));
  border-radius: 14px;
  background: color-mix(in srgb, var(--mobile-create-accent) 6%, var(--nw-bg-secondary));
  color: var(--nw-text-secondary);
  font-size: 12px;
  line-height: 1.7;
}

.mobile-create-sheet__genre-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--mobile-create-accent) 14%, var(--nw-border));
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.mobile-create-sheet__genre-chip.active {
  border-color: transparent;
  background: linear-gradient(135deg, var(--mobile-create-accent), var(--mobile-create-accent-strong));
  color: var(--mobile-focus-on-accent, #fff);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--mobile-create-accent) 16%, transparent);
}

.mobile-create-sheet__status-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 9px 11px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--mobile-create-accent) 5%, var(--nw-bg-secondary));
}

.mobile-create-sheet__status-strip span {
  font-size: 12px;
  color: var(--nw-text-secondary);
}

.mobile-create-sheet__status-strip strong {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-create-accent) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-create-accent) 90%, var(--nw-text-primary));
  font-size: 12px;
  font-weight: 700;
}

.mobile-create-sheet__meta {
  font-size: 12px;
  line-height: 1.5;
}

.mobile-create-sheet__summary,
.mobile-create-sheet__meta {
  margin: 0;
}

.mobile-create-sheet__summary {
  font-size: 11px;
  line-height: 1.45;
  color: var(--nw-text-secondary);
}

.mobile-create-sheet__inline-action {
  min-height: 30px;
  margin-left: auto;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mobile-create-accent-strong) 10%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-create-accent-strong) 88%, var(--nw-text-primary));
  font-size: 12px;
  font-weight: 700;
}

.mobile-create-sheet__footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 8px;
  padding: 10px 16px calc(env(safe-area-inset-bottom, 0px) + 12px);
  border-top: 1px solid color-mix(in srgb, var(--mobile-create-accent) 14%, var(--nw-border));
  background: color-mix(in srgb, var(--nw-bg-secondary) 94%, transparent);
  backdrop-filter: blur(16px);
}

.mobile-create-sheet__secondary,
.mobile-create-sheet__primary {
  min-height: 46px;
  border: 0;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 700;
}

.mobile-create-sheet__secondary {
  background: var(--nw-bg-secondary);
  color: var(--nw-text-primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mobile-create-accent) 14%, var(--nw-border));
}

.mobile-create-sheet__primary {
  background: linear-gradient(135deg, var(--mobile-create-accent), var(--mobile-create-accent-strong));
  color: var(--mobile-focus-on-accent, #fff);
  box-shadow: 0 16px 28px color-mix(in srgb, var(--mobile-create-accent) 20%, transparent);
}

.mobile-create-sheet__secondary:disabled,
.mobile-create-sheet__primary:disabled,
.mobile-create-sheet__inline-action:disabled,
.mobile-create-sheet__close:disabled,
.mobile-create-sheet__genre-chip:disabled {
  opacity: 0.56;
}

.mobile-create-sheet-fade-enter-active,
.mobile-create-sheet-fade-leave-active {
  transition: opacity 0.2s ease;
}

.mobile-create-sheet-fade-enter-from,
.mobile-create-sheet-fade-leave-to {
  opacity: 0;
}

@media (max-width: 380px) {
  .mobile-create-sheet__footer {
    grid-template-columns: minmax(0, 1fr);
  }

  .mobile-create-sheet__status-strip,
  .mobile-create-sheet__toggle,
  .mobile-create-sheet__resource-head,
  .mobile-create-sheet__mode-strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .mobile-create-sheet__inline-action {
    margin-left: 0;
    justify-self: start;
  }
}
</style>
