<script setup lang="ts">
/**
 * 桌面端·批量生成弹窗
 * 复用 startBatchGenerate（/generate/batch）。配置章节范围 + 指引 + 自动定稿 → 启动。
 * 进度由工作台从 agents store 的 batch 字段实时显示。
 */
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import Modal from '../components/shared/Modal.vue';
import Icon from '../components/shared/Icon.vue';
import { startBatchGenerate } from '../api/generate';
import { extractApiErrorMessage } from '../api/errors';

const props = defineProps<{ modelValue: boolean; novelId: string; startChapter: number }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; started: [] }>();

const fromChapter = ref(props.startChapter);
const toChapter = ref(props.startChapter + 4);
const userDirection = ref('');
const autoFinalize = ref(true);
const maxWordCount = ref(3000);
const submitting = ref(false);

watch(() => props.modelValue, (v) => {
  if (v) {
    fromChapter.value = props.startChapter;
    toChapter.value = props.startChapter + 4;
    userDirection.value = '';
    autoFinalize.value = true;
    maxWordCount.value = 3000;
  }
});

const batchCount = ref(0);
watch([fromChapter, toChapter], () => {
  batchCount.value = Math.max(0, toChapter.value - fromChapter.value + 1);
}, { immediate: true });

async function submit(): Promise<void> {
  if (toChapter.value < fromChapter.value) {
    ElMessage.warning('结束章不能小于起始章');
    return;
  }
  submitting.value = true;
  try {
    const result = await startBatchGenerate({
      novelId: props.novelId,
      fromChapter: fromChapter.value,
      toChapter: toChapter.value,
      autoFinalize: autoFinalize.value,
      userDirection: userDirection.value.trim() || undefined,
      maxWordCount: maxWordCount.value,
    });
    ElMessage.success(`已启动批量生成，共 ${result.items.length} 章`);
    emit('started');
    emit('update:modelValue', false);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '启动批量生成失败'));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal :model-value="modelValue" title="批量生成章节" width="520px" @update:model-value="(v) => emit('update:modelValue', v)">
    <div class="nw-field">
      <label class="nw-field-label">章节范围（第 {{ fromChapter }} ~ {{ toChapter }} 章，共 {{ batchCount }} 章）</label>
      <div style="display:flex; gap:12px; align-items:center;">
        <input v-model.number="fromChapter" type="number" min="1" class="nw-input" placeholder="起始章" />
        <span style="color:var(--nw-text-muted)">→</span>
        <input v-model.number="toChapter" type="number" min="1" class="nw-input" placeholder="结束章" />
      </div>
    </div>
    <div class="nw-field">
      <label class="nw-field-label">创作指引（可选，对所有章节生效）</label>
      <textarea v-model="userDirection" class="nw-textarea" placeholder="整体方向、文风、注意事项…" maxlength="500" />
    </div>
    <div class="nw-field">
      <label class="nw-field-label">单章字数上限</label>
      <input v-model.number="maxWordCount" type="number" min="500" step="500" class="nw-input" />
    </div>
    <div class="nw-field" style="flex-direction:row; align-items:center; gap:8px;">
      <input :id="'batch-autofinalize'" v-model="autoFinalize" type="checkbox" />
      <label for="batch-autofinalize" class="nw-field-label" style="margin:0;">每章生成后自动定稿（合并角色/世界/剧情）</label>
    </div>

    <template #footer>
      <button class="desktop-btn" :disabled="submitting" @click="emit('update:modelValue', false)">取消</button>
      <button class="desktop-btn desktop-btn--primary" :disabled="submitting" @click="submit">
        <Icon name="layers" :size="16" /> {{ submitting ? '启动中…' : `批量生成 ${batchCount} 章` }}
      </button>
    </template>
  </Modal>
</template>
