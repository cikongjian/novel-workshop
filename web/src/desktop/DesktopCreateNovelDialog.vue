<script setup lang="ts">
/**
 * 桌面端·新建作品弹窗（多模式）
 * 顶部切换开书方式，表单在弹窗内切换，不跳新页面（对齐移动端 sheet 体验）：
 * - 手动创作：空白作品（createNovel）+ AI 开书脑洞（createShuangwenAsync）
 * - 盘古开天：一句话灵感 → usePanguNovelCreation（与移动端同一 composable）
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import axios from 'axios';
import Modal from '../components/shared/Modal.vue';
import Icon from '../components/shared/Icon.vue';
import { createNovel, createShuangwenAsync } from '../api/novels';
import { userApiApi } from '../api/user-api';
import { syncUserApiProfileState } from '../utils/user-api-local';
import { NOVEL_GENRE_OPTIONS } from '../config/novel-genres';
import { extractApiErrorMessage } from '../api/errors';
import { usePanguNovelCreation, getPanguCreationErrorMessage } from '../composables/usePanguNovelCreation';
import { useDesktopCreate } from '../composables/useDesktopCreate';
import type { NovelGenre } from '../types';

type CreateMode = 'manual' | 'pangu';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; created: [string] }>();

const mode = ref<CreateMode>('manual');
const form = ref({ title: '', genre: 'fantasy' as NovelGenre, synopsis: '' });
const panguSeed = ref('');
const submitting = ref(false);
const kickstarting = ref(false);
const pangu = usePanguNovelCreation();
const { openDna, openCangjie } = useDesktopCreate();

const busy = computed(() => submitting.value || kickstarting.value || pangu.creatingNovel.value);

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      mode.value = 'manual';
      form.value = { title: '', genre: 'fantasy', synopsis: '' };
      panguSeed.value = '';
    }
  },
);

function close(): void {
  if (busy.value) return;
  emit('update:modelValue', false);
}

async function syncDefaultUserApiProfile(): Promise<void> {
  try {
    const profiles = await userApiApi.listProfiles();
    syncUserApiProfileState(profiles);
  } catch {
    // 忽略
  }
}

/** 手动·空白作品 */
async function submit(): Promise<void> {
  if (!form.value.title.trim()) {
    ElMessage.warning('请输入作品标题');
    return;
  }
  submitting.value = true;
  try {
    const novel = await createNovel({
      title: form.value.title.trim(),
      genre: form.value.genre,
      synopsis: form.value.synopsis.trim() || undefined,
    });
    ElMessage.success('已创建空白作品');
    emit('created', novel.id);
    emit('update:modelValue', false);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '创建失败'));
  } finally {
    submitting.value = false;
  }
}

/** 手动·AI 开书脑洞 */
async function kickstart(): Promise<void> {
  const seedIdea = form.value.synopsis.trim();
  if (!seedIdea) {
    ElMessage.warning('请填写简介/灵感，AI 开书需要它作为种子');
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
      titleHint: form.value.title.trim() || undefined,
      synopsisHint: form.value.synopsis.trim() || undefined,
      outlineChapters: 20,
      targetChapters: 120,
      includeMarketing: false,
      sampleChapter: true,
      maxWordCount: 2200,
      createChapterShells: false,
    });
    if (!result.novelId) {
      ElMessage.error('开书已启动，但未返回作品 ID');
      return;
    }
    ElMessage.success('AI 开书已启动，正在生成基础内容');
    emit('created', result.novelId);
    emit('update:modelValue', false);
  } catch (err) {
    const message = extractApiErrorMessage(err, '开书失败');
    if (axios.isAxiosError(err) && err.response?.status === 402) {
      ElMessage.error(`${message}。本平台使用自填 API，请先确认模型配置可用。`);
    } else {
      ElMessage.error(message);
    }
  } finally {
    kickstarting.value = false;
  }
}

/** 盘古开天：一句话灵感 */
async function startPangu(): Promise<void> {
  const seed = panguSeed.value.trim();
  if (!seed) {
    ElMessage.warning('先写下一个开篇灵感');
    return;
  }
  try {
    const novelId = await pangu.createNovel(seed);
    ElMessage.success('盘古开天已启动，首章正在生成');
    emit('created', novelId);
    emit('update:modelValue', false);
  } catch (err) {
    ElMessage.error(getPanguCreationErrorMessage(err));
  }
}
</script>

<template>
  <Modal :model-value="modelValue" title="新建作品" width="560px" @update:model-value="(v) => emit('update:modelValue', v)">
    <!-- 开书方式切换 -->
    <div class="create-modes">
      <button type="button" class="create-mode" :class="{ 'is-active': mode === 'manual' }" @click="mode = 'manual'">
        手动创作
      </button>
      <button type="button" class="create-mode" :class="{ 'is-active': mode === 'pangu' }" @click="mode = 'pangu'">
        <Icon name="sparkles" :size="14" /> 盘古开天
      </button>
      <button type="button" class="create-mode" @click="openDna">
        <Icon name="sparkles" :size="14" /> DNA 开书
      </button>
      <button type="button" class="create-mode" @click="openCangjie">
        <Icon name="sparkles" :size="14" /> 仓颉造字
      </button>
    </div>

    <!-- 手动创作 -->
    <template v-if="mode === 'manual'">
      <div class="nw-field">
        <label class="nw-field-label">作品标题</label>
        <input v-model="form.title" class="nw-input" placeholder="输入作品标题" maxlength="60" />
      </div>
      <div class="nw-field">
        <label class="nw-field-label">题材</label>
        <div class="create-genres">
          <button
            v-for="g in NOVEL_GENRE_OPTIONS"
            :key="g.value"
            type="button"
            class="desktop-chip"
            :class="{ 'is-active': form.genre === g.value }"
            @click="form.genre = g.value"
          >{{ g.label }}</button>
        </div>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">简介 / 开书灵感</label>
        <textarea v-model="form.synopsis" class="nw-textarea" placeholder="一句话或几句话描述你的故事。AI 开书脑洞会把它作为种子生成书名、设定、大纲与首章样稿。" maxlength="500" />
        <span class="nw-field-hint">「AI 开书脑洞」用你的模型 API 生成，调用成本由你的账户承担。</span>
      </div>
    </template>

    <!-- 盘古开天 -->
    <template v-else>
      <div class="create-mode-intro">
        <Icon name="sparkles" :size="18" />
        <span>一句话灵感，AI 自动生成书名、设定、大纲和首章。调用你的模型 API，成本由你的账户承担。</span>
      </div>
      <div class="nw-field">
        <label class="nw-field-label">开篇灵感</label>
        <textarea
          v-model="panguSeed"
          class="nw-textarea"
          placeholder="想写什么，一句话也可以。比如：被雪藏的演员在综艺现场意外翻红，靠一段旧片段重回顶流。"
          maxlength="800"
        />
        <span class="nw-field-hint">{{ panguSeed.trim().length }} / 800</span>
      </div>
    </template>

    <template #footer>
      <button class="desktop-btn" :disabled="busy" @click="close">取消</button>
      <template v-if="mode === 'manual'">
        <button class="desktop-btn" :disabled="busy" @click="submit">
          {{ submitting ? '创建中…' : '创建空白' }}
        </button>
        <button class="desktop-btn desktop-btn--primary" :disabled="busy" @click="kickstart">
          <Icon name="sparkles" :size="16" /> {{ kickstarting ? '开书中…' : 'AI 开书脑洞' }}
        </button>
      </template>
      <button v-else class="desktop-btn desktop-btn--primary" :disabled="busy" @click="startPangu">
        <Icon name="sparkles" :size="16" /> {{ pangu.creatingNovel.value ? '开书中…' : '启动盘古开天' }}
      </button>
    </template>
  </Modal>
</template>
