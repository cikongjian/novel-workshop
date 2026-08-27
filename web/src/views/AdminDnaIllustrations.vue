<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import { http } from '../api/http';
import { QUIZ_QUESTIONS_FULL } from '../data/quiz-questions';
import '../styles/mobile-fun-features.css';

const router = useRouter();

interface QItem {
  questionId: number;
  hasImage: boolean;
  prompt: string;
  question: string;
  illustrationPrompt: string;
  previewB64?: string;
}

const currentIdx = ref(0);
const items = ref<QItem[]>([]);
const loading = ref(false);
const busy = ref(false);
const total = 35;
const progressStyle = computed(() => ({
  '--dna-progress': `${((currentIdx.value + 1) / total) * 100}%`,
}));

// 照搬立绘管理页的模式：独立 ref
const promptText = ref('');

function syncPromptFromItem() {
  const item = items.value[currentIdx.value];
  promptText.value = item?.prompt ?? '';
}

function syncPromptToItem() {
  const item = items.value[currentIdx.value];
  if (item && item.prompt !== promptText.value) {
    item.prompt = promptText.value;
  }
}

onMounted(loadAll);

async function loadAll() {
  loading.value = true;
  try {
    const { data } = await http.get('/admin/dna-illustrations');
    items.value = (data as Array<{ questionId: number; hasImage: boolean; prompt: string }>).map((item) => {
      const q = QUIZ_QUESTIONS_FULL.find(qq => qq.id === item.questionId);
      return {
        questionId: item.questionId,
        hasImage: item.hasImage,
        prompt: item.prompt || '',
        question: q?.question ?? `第 ${item.questionId} 题`,
        illustrationPrompt: q?.illustrationPrompt ?? '',
      };
    });
    // 加载完成后同步第一题的 prompt
    if (items.value.length) promptText.value = items.value[0]!.prompt;
  } catch { ElMessage.error('加载失败'); }
  finally { loading.value = false; }
}

const cur = () => items.value[currentIdx.value]!;

function goPrev() {
  if (currentIdx.value <= 0) return;
  syncPromptToItem();
  currentIdx.value--;
  syncPromptFromItem();
}
function goNext() {
  if (currentIdx.value >= total - 1) return;
  syncPromptToItem();
  currentIdx.value++;
  syncPromptFromItem();
}
function goBack() { void router.push('/m/admin'); }

async function generatePrompt() {
  const item = cur();
  busy.value = true;
  try {
    ElMessage.info('正在生成提示词...');
    const res = await http.post(`/admin/dna-illustrations/${item.questionId}/generate-prompt`, {
      rawPrompt: item.illustrationPrompt || item.question || '',
    });
    const prompt = (res.data as { prompt?: string }).prompt?.trim();
    if (!prompt) {
      ElMessage.error('模型返回空内容，请检查模型配置或稍后重试');
      return;
    }
    promptText.value = prompt;
    await nextTick();
    ElMessage.success('提示词已生成并保存');
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '生成失败';
    ElMessage.error(msg);
  }
  finally { busy.value = false; }
}

async function savePrompt() {
  if (!promptText.value.trim()) { ElMessage.warning('请输入提示词'); return; }
  busy.value = true;
  try {
    await http.put(`/admin/dna-illustrations/${cur().questionId}/prompt`, { prompt: promptText.value.trim() });
    ElMessage.success('已保存');
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '保存失败';
    ElMessage.error(msg);
  }
  finally { busy.value = false; }
}

async function generateImage() {
  if (!promptText.value.trim()) { ElMessage.warning('请先生成或填写提示词'); return; }
  const item = cur();
  busy.value = true;
  try {
    ElMessage.info('正在生成插画（约 10-30 秒）...');
    const { data } = await http.post(`/admin/dna-illustrations/${item.questionId}/generate-image`, {
      prompt: promptText.value.trim(),
    });
    item.prompt = promptText.value.trim();
    item.hasImage = true;
    item.previewB64 = (data as { b64Data?: string }).b64Data ?? undefined;
    ElMessage.success('插画生成成功');
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '生成失败';
    ElMessage.error(msg);
  }
  finally { busy.value = false; }
}

async function deleteImage() {
  const item = cur();
  busy.value = true;
  try {
    await http.delete(`/admin/dna-illustrations/${item.questionId}`);
    item.hasImage = false;
    item.previewB64 = undefined;
    ElMessage.success('已删除');
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '删除失败';
    ElMessage.error(msg);
  }
  finally { busy.value = false; }
}

function imageSrc(item: QItem): string | undefined {
  if (item.previewB64) return `data:image/png;base64,${item.previewB64}`;
  if (item.hasImage) return `/api/fun/dna/illustration/${item.questionId}`;
  return undefined;
}
</script>

<template>
  <div class="admin-dna-page mobile-focus-page">
    <div class="mobile-focus-shell">
      <MobileTopbar title="DNA 插画" subtitle="爽点测试题库插画管理">
        <template #leading>
          <button class="mobile-focus-button--ghost" type="button" @click="goBack">
            <el-icon :size="18"><ArrowLeft /></el-icon>
          </button>
        </template>
      </MobileTopbar>
      <main class="mobile-focus-main admin-dna-main">
    <!-- 进度条 -->
    <div class="admin-dna-progress-row">
      <span class="admin-dna-progress-title">DNA 插画</span>
      <span class="admin-dna-progress-meta">
        {{ currentIdx + 1 }} / {{ total }}
        <span v-if="items.length" class="admin-dna-progress-count">
          {{ items.filter(i => i.hasImage).length }} 张
        </span>
      </span>
    </div>
    <div class="mf-progress-bar admin-dna-progress" :style="progressStyle">
      <div class="mf-progress-bar__fill" />
    </div>

    <!-- 题目 -->
    <div v-if="items.length" class="mf-card mf-card--glow">
      <!-- 插画预览 -->
      <div class="admin-dna-preview">
        <img
          v-if="cur().hasImage"
          :src="imageSrc(cur())"
          class="admin-dna-preview__image"
          alt=""
        />
        <div v-else class="admin-dna-empty">
          未生成插画<br>
          <span class="admin-dna-empty__hint">先完善提示词，再生成插画</span>
        </div>
      </div>

      <!-- 题目信息 -->
      <div class="admin-dna-info">
        <div class="admin-dna-question-title">
          第 {{ cur().questionId }} 题
        </div>
        <div class="admin-dna-question-copy">
          {{ cur().question }}
        </div>
        <div class="admin-dna-question-hint">
          原始提示：{{ cur().illustrationPrompt || '无' }}
        </div>
      </div>

      <!-- Prompt 输入 -->
      <div class="admin-dna-field">
        <div class="admin-dna-field__label">生图提示词</div>
        <textarea
          v-model="promptText"
          class="admin-dna-textarea"
          placeholder="输入或生成插画 prompt..."
        />
      </div>

      <!-- 操作按钮 -->
      <div class="admin-dna-actions">
        <button class="mf-btn mf-btn--outline" :disabled="busy" @click="generatePrompt">
          AI 生成提示词
        </button>
        <button class="mf-btn mf-btn--outline" :disabled="busy" @click="savePrompt">
          保存提示词
        </button>
        <button class="mf-btn mf-btn--primary" :disabled="busy || !promptText.trim()" @click="generateImage">
          {{ cur().hasImage ? '重新生成' : '生成插画' }}
        </button>
        <button
          v-if="cur().hasImage"
          class="mf-btn mf-btn--outline admin-dna-danger"
          :disabled="busy"
          @click="deleteImage"
        >
          删除插画
        </button>
      </div>
    </div>

    <!-- 上/下题导航 -->
    <div class="admin-dna-nav">
      <button
        class="mf-btn mf-btn--outline mf-btn--block"
        :disabled="currentIdx <= 0"
        @click="goPrev"
      >
        <el-icon :size="16"><ArrowLeft /></el-icon> 上一题
      </button>
      <button
        class="mf-btn mf-btn--outline mf-btn--block"
        :disabled="currentIdx >= total - 1"
        @click="goNext"
      >
        下一题 <el-icon :size="16"><ArrowRight /></el-icon>
      </button>
    </div>
      </main>
    </div>
  </div>
</template>
