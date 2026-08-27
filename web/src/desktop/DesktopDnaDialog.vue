<script setup lang="ts">
/**
 * 桌面端·DNA 开书（爽点 DNA 测试 → 开书）
 * 复用移动端同一逻辑：useShuangwenDna（8 题问卷 + 雷达计算）+ useDnaNovelCreation（开书）。
 * 多步弹窗：问卷 → 雷达结果 + 开书表单 → 创建。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import axios from 'axios';
import Modal from '../components/shared/Modal.vue';
import NwChart from '../components/shared/NwChart.vue';
import { useShuangwenDna } from '../composables/useShuangwenDna';
import { useDnaNovelCreation } from '../composables/useDnaNovelCreation';
import { NOVEL_GENRE_OPTIONS } from '../config/novel-genres';
import { extractApiErrorMessage } from '../api/errors';
import type { EChartsOption } from 'echarts';
import type { NovelGenre } from '../types';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; created: [string] }>();

const dna = useShuangwenDna();
const { currentStep, questions, displayOptions, answers, result, totalQuestions, progress, selectAnswer, goBack, init } = dna;
const dnaNovel = useDnaNovelCreation();

const createForm = ref({ name: '', gender: '男' as '男' | '女', theme: '', genre: 'fantasy' as NovelGenre });

const phase = computed<'quiz' | 'result'>(() => (result.value ? 'result' : 'quiz'));

const radarOption = computed<EChartsOption>(() => ({
  radar: {
    indicator: (result.value?.dims ?? []).map((d) => ({ name: d.label, max: 100 })),
    radius: '62%',
    axisName: { color: '#64748b', fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
    axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
  },
  series: [
    {
      type: 'radar',
      data: [
        {
          value: (result.value?.dims ?? []).map((d) => d.value),
          name: '爽点 DNA',
          areaStyle: { color: 'rgba(99,102,241,0.25)' },
          lineStyle: { color: '#6366f1', width: 2 },
          itemStyle: { color: '#6366f1' },
        },
      ],
    },
  ],
}));

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      init();
      createForm.value = { name: '', gender: '男', theme: '', genre: 'fantasy' };
    }
  },
);

function close(): void {
  if (dnaNovel.creatingNovel.value) return;
  emit('update:modelValue', false);
}

function retryQuiz(): void {
  init();
}

async function create(): Promise<void> {
  if (!result.value) return;
  if (!createForm.value.name.trim()) {
    ElMessage.warning('请输入主角名');
    return;
  }
  try {
    const novelId = await dnaNovel.createNovel({
      result: result.value,
      questions: questions.value,
      displayOptions: displayOptions.value,
      answers: answers.value,
      name: createForm.value.name,
      gender: createForm.value.gender,
      theme: createForm.value.theme,
      genre: createForm.value.genre,
      constitutionTags: [],
    });
    ElMessage.success('DNA 开书已启动，正在生成基础内容');
    emit('created', novelId);
    emit('update:modelValue', false);
  } catch (err) {
    const msg = extractApiErrorMessage(err, '开书失败');
    if (axios.isAxiosError(err) && err.response?.status === 402) {
      ElMessage.error(`${msg}。本平台使用自填 API，请先确认模型配置可用。`);
    } else {
      ElMessage.error(msg);
    }
  }
}
</script>

<template>
  <Modal :model-value="modelValue" title="DNA 开书" width="600px" @update:model-value="(v) => emit('update:modelValue', v)">
    <!-- 问卷 -->
    <div v-if="phase === 'quiz'" class="dna-quiz">
      <div class="dna-progress">
        <div class="dna-progress-bar"><div class="dna-progress-fill" :style="{ width: `${progress}%` }" /></div>
        <span class="dna-progress-text">{{ currentStep + 1 }} / {{ totalQuestions }}</span>
      </div>
      <h3 class="dna-question">{{ questions[currentStep]?.question }}</h3>
      <div class="dna-options">
        <button
          v-for="(opt, i) in displayOptions[currentStep]"
          :key="i"
          type="button"
          class="dna-option"
          @click="selectAnswer(i)"
        >{{ opt.text }}</button>
      </div>
      <button v-if="currentStep > 0" type="button" class="desktop-btn dna-back" @click="goBack">上一题</button>
    </div>

    <!-- 结果 + 开书 -->
    <div v-else class="dna-result">
      <div class="dna-result-head">
        <span class="nw-tag">{{ result?.topLabel }}</span>
        <p class="dna-result-desc">{{ result?.topDesc }}</p>
      </div>
      <NwChart :option="radarOption" height="260px" />

      <div class="dna-create-form">
        <div class="nw-field">
          <label class="nw-field-label">主角名</label>
          <input v-model="createForm.name" class="nw-input" placeholder="给主角起个名字" maxlength="20" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">性别</label>
          <div class="create-genres">
            <button type="button" class="desktop-chip" :class="{ 'is-active': createForm.gender === '男' }" @click="createForm.gender = '男'">男</button>
            <button type="button" class="desktop-chip" :class="{ 'is-active': createForm.gender === '女' }" @click="createForm.gender = '女'">女</button>
          </div>
        </div>
        <div class="nw-field">
          <label class="nw-field-label">题材</label>
          <div class="create-genres">
            <button
              v-for="g in NOVEL_GENRE_OPTIONS"
              :key="g.value"
              type="button"
              class="desktop-chip"
              :class="{ 'is-active': createForm.genre === g.value }"
              @click="createForm.genre = g.value"
            >{{ g.label }}</button>
          </div>
        </div>
        <div class="nw-field">
          <label class="nw-field-label">主题（可选）</label>
          <input v-model="createForm.theme" class="nw-input" placeholder="例如：娱乐圈、修仙、逆袭" maxlength="40" />
        </div>
      </div>
    </div>

    <template #footer>
      <button class="desktop-btn" :disabled="dnaNovel.creatingNovel.value" @click="close">取消</button>
      <button v-if="phase === 'result'" class="desktop-btn" :disabled="dnaNovel.creatingNovel.value" @click="retryQuiz">重新测试</button>
      <button v-if="phase === 'result'" class="desktop-btn desktop-btn--primary" :disabled="dnaNovel.creatingNovel.value" @click="create">
        {{ dnaNovel.creatingNovel.value ? '开书中…' : '用它开书' }}
      </button>
    </template>
  </Modal>
</template>
