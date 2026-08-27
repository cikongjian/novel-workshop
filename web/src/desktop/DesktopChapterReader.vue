<script setup lang="ts">
/**
 * 桌面端·章节阅读弹窗
 * 复用 fetchChapter（章节正文）。从作品工作台点章节打开，不跳移动端。
 * 支持上一章/下一章切换（基于传入的章节总数）。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAsyncData } from '../composables/useAsyncData';
import { extractApiErrorMessage, isAbortError } from '../api/errors';
import { fetchChapter, updateChapter, deleteChapter, fetchChapterVersions, rollbackChapter, type ChapterVersionMeta } from '../api/chapters';
import { rewriteChapter, resizeChapter, finalizeChapter } from '../api/generate';
import { polishDialogue } from '../api/analytics';
import type { Chapter } from '../types';
import Modal from '../components/shared/Modal.vue';
import StateView from '../components/shared/StateView.vue';
import Icon from '../components/shared/Icon.vue';

const props = defineProps<{ modelValue: boolean; novelId: string; chapterNumber: number; chapterCount: number }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; 'request-refresh': [] }>();

const currentNum = ref(props.chapterNumber);
watch(() => props.chapterNumber, (n) => { currentNum.value = n; });

const { data, loading, error, run } = useAsyncData<Chapter, []>(
  () => fetchChapter(props.novelId, currentNum.value),
  { immediate: false },
);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      currentNum.value = props.chapterNumber;
      void run();
    }
  },
);

const chapter = computed<Chapter | null>(() => data.value ?? null);
const errorMessage = computed(() => {
  if (!error.value || isAbortError(error.value)) return '';
  return extractApiErrorMessage(error.value);
});
const stateError = computed(() => (errorMessage.value ? error.value : null));

const canPrev = computed(() => currentNum.value > 1);
const canNext = computed(() => currentNum.value < props.chapterCount);

/** 编辑模式 */
const editing = ref(false);
const saving = ref(false);
const editForm = ref({ title: '', content: '' });

function enterEdit(): void {
  if (!chapter.value) return;
  editForm.value = { title: chapter.value.title || '', content: chapter.value.content || '' };
  editing.value = true;
}
function cancelEdit(): void {
  editing.value = false;
}
async function saveEdit(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  try {
    const updated = await updateChapter(props.novelId, currentNum.value, {
      title: editForm.value.title.trim(),
      content: editForm.value.content,
    });
    data.value = updated;
    editing.value = false;
    ElMessage.success('已保存');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '保存失败'));
  } finally {
    saving.value = false;
  }
}

function prev(): void {
  if (!canPrev.value || loading.value) return;
  editing.value = false;
  currentNum.value -= 1;
  void run();
}
function next(): void {
  if (!canNext.value || loading.value) return;
  editing.value = false;
  currentNum.value += 1;
  void run();
}

/** 重写章节 */
const rewriteVisible = ref(false);
const rewriteDirection = ref('');
const rewriting = ref(false);
function openRewrite(): void {
  rewriteDirection.value = '';
  rewriteVisible.value = true;
}
async function doRewrite(): Promise<void> {
  rewriting.value = true;
  try {
    await rewriteChapter({
      novelId: props.novelId,
      chapterNumber: currentNum.value,
      userDirection: rewriteDirection.value.trim() || undefined,
      stylePreset: 'auto',
      maxWordCount: 3000,
    });
    rewriteVisible.value = false;
    ElMessage.success('重写完成');
    await run();
    emit('request-refresh');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '重写失败'));
  } finally {
    rewriting.value = false;
  }
}

/** 历史版本 + 回滚 */
const versionsVisible = ref(false);
const versions = ref<ChapterVersionMeta[]>([]);
const versionsLoading = ref(false);
const rollingBack = ref<number | null>(null);
async function openVersions(): Promise<void> {
  versionsVisible.value = true;
  versionsLoading.value = true;
  try {
    const res = await fetchChapterVersions(props.novelId, currentNum.value);
    versions.value = res.versions;
  } catch {
    ElMessage.error('版本加载失败');
  } finally {
    versionsLoading.value = false;
  }
}
async function doRollback(version: number): Promise<void> {
  try {
    await ElMessageBox.confirm(`回滚到版本 ${version}？当前章节内容会被覆盖。`, '版本回滚', { type: 'warning', confirmButtonText: '回滚' });
  } catch {
    return;
  }
  rollingBack.value = version;
  try {
    await rollbackChapter(props.novelId, currentNum.value, version);
    ElMessage.success('已回滚');
    versionsVisible.value = false;
    await run();
    emit('request-refresh');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '回滚失败'));
  } finally {
    rollingBack.value = null;
  }
}

/** 删除章节 */
async function confirmDelete(): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除第 ${currentNum.value} 章？此操作不可撤销。`, '删除章节', { type: 'warning', confirmButtonText: '删除' });
  } catch {
    return;
  }
  try {
    await deleteChapter(props.novelId, currentNum.value);
    ElMessage.success('已删除');
    emit('update:modelValue', false);
    emit('request-refresh');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '删除失败'));
  }
}

/** 进阶操作：缩写/扩写/对话打磨/定稿 */
const resizeVisible = ref(false);
const resizeMode = ref<'compress' | 'expand'>('compress');
const resizeTarget = ref(2000);
const resizeNotes = ref('');
const resizing = ref(false);
const polishing = ref(false);
const finalizing = ref(false);

function onMoreAction(cmd: string): void {
  if (cmd === 'compress' || cmd === 'expand') {
    const len = chapter.value?.content?.length ?? 3000;
    resizeMode.value = cmd;
    resizeTarget.value = Math.round((cmd === 'compress' ? len * 0.6 : len * 1.5) / 500) * 500;
    resizeNotes.value = '';
    resizeVisible.value = true;
  } else if (cmd === 'polish') {
    void doPolish();
  } else if (cmd === 'finalize') {
    void doFinalize();
  }
}

async function doResize(): Promise<void> {
  resizing.value = true;
  try {
    await resizeChapter({
      novelId: props.novelId,
      chapterNumber: currentNum.value,
      targetWordCount: resizeTarget.value,
      mode: resizeMode.value,
      preserveNotes: resizeNotes.value.trim() || undefined,
    });
    resizeVisible.value = false;
    ElMessage.success(`${resizeMode.value === 'compress' ? '缩写' : '扩写'}完成`);
    await run();
    emit('request-refresh');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '操作失败'));
  } finally {
    resizing.value = false;
  }
}

async function doPolish(): Promise<void> {
  if (!chapter.value) return;
  polishing.value = true;
  try {
    const res = (await polishDialogue(props.novelId, { chapterNumber: currentNum.value, text: chapter.value.content })) as { content?: string };
    if (res?.content) {
      data.value = { ...chapter.value, content: res.content };
      ElMessage.success('对话打磨完成');
    } else {
      ElMessage.warning('未返回结果');
    }
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '打磨失败'));
  } finally {
    polishing.value = false;
  }
}

async function doFinalize(): Promise<void> {
  try {
    await ElMessageBox.confirm('定稿将启动三大专家 Agent 管线（角色/世界/剧情合并）。确定？', '定稿', { type: 'info', confirmButtonText: '确认定稿' });
  } catch {
    return;
  }
  finalizing.value = true;
  try {
    await finalizeChapter(props.novelId, currentNum.value);
    ElMessage.success('定稿管线已启动');
    emit('request-refresh');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '定稿失败'));
  } finally {
    finalizing.value = false;
  }
}
</script>

<template>
  <Modal :model-value="modelValue" :title="`第 ${currentNum} 章`" width="720px" @update:model-value="(v) => emit('update:modelValue', v)">
    <StateView :loading="loading && !chapter" :error="stateError" :error-message="errorMessage" @retry="run">
      <template #loading>
        <div class="reader-skeleton" />
      </template>

      <!-- 编辑模式 -->
      <div v-if="editing && chapter" class="reader-edit">
        <div class="nw-field">
          <label class="nw-field-label">章节标题</label>
          <input v-model="editForm.title" class="nw-input" maxlength="80" />
        </div>
        <div class="nw-field">
          <label class="nw-field-label">正文</label>
          <textarea v-model="editForm.content" class="nw-textarea reader-edit-area" />
        </div>
      </div>

      <!-- 阅读模式 -->
      <div v-else-if="chapter" class="reader-content">
        <div class="reader-toolbar">
          <button class="desktop-btn" :disabled="loading" @click="enterEdit"><Icon name="pen" :size="14" /> 编辑</button>
          <button class="desktop-btn" :disabled="loading" @click="openRewrite"><Icon name="sparkles" :size="14" /> 重写</button>
          <button class="desktop-btn" :disabled="loading" @click="openVersions"><Icon name="layers" :size="14" /> 版本</button>
          <button class="desktop-btn reader-danger" :disabled="loading" @click="confirmDelete"><Icon name="close" :size="14" /> 删除</button>
          <el-dropdown trigger="click" @command="onMoreAction">
            <button class="desktop-btn" :disabled="loading || polishing || finalizing">更多 ▾</button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="compress">缩写</el-dropdown-item>
                <el-dropdown-item command="expand">扩写</el-dropdown-item>
                <el-dropdown-item command="polish" :disabled="polishing">{{ polishing ? '打磨中…' : '对话打磨' }}</el-dropdown-item>
                <el-dropdown-item command="finalize" :disabled="finalizing">{{ finalizing ? '定稿中…' : '定稿' }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <h2 class="reader-title">{{ chapter.title || `第 ${currentNum} 章` }}</h2>
        <article class="reader-text">{{ chapter.content }}</article>
      </div>
    </StateView>

    <template #footer>
      <button class="desktop-btn" :disabled="saving" @click="emit('update:modelValue', false)">关闭</button>
      <template v-if="editing">
        <button class="desktop-btn" :disabled="saving" @click="cancelEdit">取消</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="saving" @click="saveEdit">
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </template>
      <template v-else>
        <button class="desktop-btn" :disabled="!canPrev || loading" @click="prev">
          <Icon name="arrowLeft" :size="14" /> 上一章
        </button>
        <button class="desktop-btn desktop-btn--primary" :disabled="!canNext || loading" @click="next">
          下一章 <Icon name="arrowLeft" :size="14" style="transform: rotate(180deg)" />
        </button>
      </template>
    </template>
  </Modal>

  <!-- 重写弹窗 -->
  <Modal v-model="rewriteVisible" :title="`重写第 ${currentNum} 章`" width="480px">
    <div class="nw-field">
      <label class="nw-field-label">重写指引</label>
      <textarea v-model="rewriteDirection" class="nw-textarea" placeholder="告诉 AI 这章希望怎么改（语气、情节、节奏…）" maxlength="500" />
      <span class="nw-field-hint">重写会用你的模型 API 重新生成本章。</span>
    </div>
    <template #footer>
      <button class="desktop-btn" :disabled="rewriting" @click="rewriteVisible = false">取消</button>
      <button class="desktop-btn desktop-btn--primary" :disabled="rewriting" @click="doRewrite">
        {{ rewriting ? '重写中…' : '开始重写' }}
      </button>
    </template>
  </Modal>

  <!-- 历史版本弹窗 -->
  <Modal v-model="versionsVisible" title="历史版本" width="520px">
    <StateView :loading="versionsLoading" :empty="!versionsLoading && versions.length === 0" @retry="openVersions">
      <template #empty>
        <p class="nw-state__title">暂无历史版本</p>
      </template>
      <div class="version-list">
        <div v-for="v in versions" :key="v.version" class="version-item">
          <div class="version-meta">
            <span class="version-num">v{{ v.version }}</span>
            <span class="nw-tag nw-tag--muted">{{ v.status }}</span>
            <span class="version-info">{{ v.wordCount }} 字 · {{ v.revisionCount }} 次修订</span>
          </div>
          <button class="desktop-btn" :disabled="rollingBack !== null" @click="doRollback(v.version)">
            {{ rollingBack === v.version ? '回滚中…' : '回滚' }}
          </button>
        </div>
      </div>
    </StateView>
  </Modal>

  <!-- 缩写/扩写弹窗 -->
  <Modal v-model="resizeVisible" :title="resizeMode === 'compress' ? '缩写章节' : '扩写章节'" width="480px">
    <div class="nw-field">
      <label class="nw-field-label">目标字数</label>
      <input v-model.number="resizeTarget" type="number" min="500" step="500" class="nw-input" />
    </div>
    <div class="nw-field">
      <label class="nw-field-label">保留要点（可选）</label>
      <textarea v-model="resizeNotes" class="nw-textarea" placeholder="缩写/扩写时必须保留的情节或设定…" maxlength="300" />
    </div>
    <template #footer>
      <button class="desktop-btn" :disabled="resizing" @click="resizeVisible = false">取消</button>
      <button class="desktop-btn desktop-btn--primary" :disabled="resizing" @click="doResize">
        {{ resizing ? '处理中…' : '开始' }}
      </button>
    </template>
  </Modal>
</template>
