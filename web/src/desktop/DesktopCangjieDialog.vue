<script setup lang="ts">
/**
 * 桌面端·仓颉造字（对话式开书）
 * 复用移动端同一逻辑：useCangjieSession（会话+清单+持久化）+ sendCangjieChat/organizeCangjieStory
 * + useCangjieNovelCreation（生成脑洞+开书）。
 * 多步弹窗：对话 → 整理故事核心 → 勾选清单 → 用它开书。
 */
import { computed, nextTick, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import Modal from '../components/shared/Modal.vue';
import Icon from '../components/shared/Icon.vue';
import { useCangjieSession } from '../composables/useCangjieSession';
import { useCangjieNovelCreation, getCangjieCreationErrorMessage } from '../composables/useCangjieNovelCreation';
import {
  sendCangjieChat,
  organizeCangjieStory,
  CANGJIE_CHECKLIST_GROUP_ORDER,
  CANGJIE_CHECKLIST_GROUP_LABELS,
  type CangjieChecklistItem,
  type CangjieConversationTurn,
} from '../api/cangjie';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; created: [string] }>();

const session = useCangjieSession();
const cangjie = useCangjieNovelCreation();
const {
  messages,
  organizedChecklist,
  hasUserMessages,
  selectedChecklist,
  appendMessage,
  setChecklist,
  resetSession,
} = session;

const phase = ref<'chat' | 'checklist'>('chat');
const input = ref('');
const sending = ref(false);
const organizing = ref(false);
const booting = ref(false);
const listRef = ref<HTMLDivElement>();

const groupedChecklist = computed(() =>
  CANGJIE_CHECKLIST_GROUP_ORDER.map((g) => ({
    group: g,
    label: CANGJIE_CHECKLIST_GROUP_LABELS[g],
    items: organizedChecklist.value.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0),
);

function toTurns(): CangjieConversationTurn[] {
  return messages.value.map((m) => ({ role: m.role, content: m.content }));
}

async function scrollBottom(): Promise<void> {
  await nextTick();
  listRef.value?.scrollTo({ top: listRef.value.scrollHeight, behavior: 'smooth' });
}

async function boot(): Promise<void> {
  if (messages.value.length > 0 || booting.value) return;
  booting.value = true;
  try {
    const reply = await sendCangjieChat([]);
    appendMessage('assistant', reply.content);
  } catch {
    ElMessage.error('仓颉暂时没接上，请稍后再试');
  } finally {
    booting.value = false;
  }
}

async function send(): Promise<void> {
  const text = input.value.trim();
  if (!text || sending.value) return;
  appendMessage('user', text);
  input.value = '';
  sending.value = true;
  void scrollBottom();
  try {
    const reply = await sendCangjieChat(toTurns());
    appendMessage('assistant', reply.content);
    void scrollBottom();
  } catch {
    ElMessage.error('仓颉暂时没接上，请稍后再试');
  } finally {
    sending.value = false;
  }
}

async function organize(): Promise<void> {
  if (organizing.value) return;
  organizing.value = true;
  try {
    const checklist = await organizeCangjieStory(toTurns());
    setChecklist(checklist);
    phase.value = 'checklist';
  } catch {
    ElMessage.error('整理失败，请稍后再试');
  } finally {
    organizing.value = false;
  }
}

function toggleItem(item: CangjieChecklistItem): void {
  setChecklist(
    organizedChecklist.value.map((i) => (i.id === item.id ? { ...i, selected: !i.selected } : i)),
  );
}

async function create(): Promise<void> {
  if (selectedChecklist.value.length === 0) {
    ElMessage.warning('请至少选择一个故事核心');
    return;
  }
  try {
    const result = await cangjie.createNovel({
      messages: toTurns(),
      checklist: selectedChecklist.value,
    });
    ElMessage.success('仓颉开书已启动，正在生成基础内容');
    emit('created', result.novelId);
    emit('update:modelValue', false);
  } catch (err) {
    ElMessage.error(getCangjieCreationErrorMessage(err));
  }
}

function close(): void {
  if (sending.value || organizing.value || cangjie.creatingNovel.value) return;
  emit('update:modelValue', false);
}

function restart(): void {
  resetSession();
  phase.value = 'chat';
  void boot();
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      phase.value = organizedChecklist.value.length > 0 ? 'checklist' : 'chat';
      if (!hasUserMessages.value) void boot();
      else void scrollBottom();
    }
  },
);
</script>

<template>
  <Modal :model-value="modelValue" title="仓颉造字" width="640px" @update:model-value="(v) => emit('update:modelValue', v)">
    <!-- 对话 -->
    <div v-if="phase === 'chat'" class="cangjie-chat">
      <div ref="listRef" class="cangjie-messages">
        <div v-for="m in messages" :key="m.id" class="cangjie-msg" :class="m.role">
          <div class="cangjie-bubble">{{ m.content }}</div>
        </div>
        <div v-if="booting || sending" class="cangjie-msg assistant">
          <div class="cangjie-bubble cangjie-typing">正在思考…</div>
        </div>
      </div>
      <div class="cangjie-input-row">
        <input
          v-model="input"
          class="nw-input"
          placeholder="说说你想写的故事…"
          :disabled="sending || booting"
          @keydown.enter="send"
        />
        <button class="desktop-btn desktop-btn--primary" :disabled="!input.trim() || sending || booting" @click="send">
          <Icon name="send" :size="16" />
        </button>
      </div>
    </div>

    <!-- 故事核心清单 -->
    <div v-else class="cangjie-checklist">
      <p class="cangjie-checklist-hint">勾选要用作开书基础的故事核心（点卡片切换）。</p>
      <div v-for="g in groupedChecklist" :key="g.group" class="cangjie-group">
        <div class="cangjie-group-label">{{ g.label }}</div>
        <div
          v-for="item in g.items"
          :key="item.id"
          class="cangjie-item"
          :class="{ 'is-selected': item.selected }"
          @click="toggleItem(item)"
        >
          <div class="cangjie-item-title">{{ item.title }}</div>
          <div class="cangjie-item-content">{{ item.content }}</div>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="desktop-btn" :disabled="sending || organizing || cangjie.creatingNovel.value" @click="close">取消</button>
      <button class="desktop-btn" :disabled="sending || organizing" @click="restart">重新开始</button>
      <template v-if="phase === 'chat'">
        <button class="desktop-btn desktop-btn--primary" :disabled="organizing || !hasUserMessages || sending" @click="organize">
          {{ organizing ? '整理中…' : '整理故事核心' }}
        </button>
      </template>
      <template v-else>
        <button class="desktop-btn" :disabled="cangjie.creatingNovel.value" @click="phase = 'chat'">继续对话</button>
        <button class="desktop-btn desktop-btn--primary" :disabled="cangjie.creatingNovel.value" @click="create">
          {{ cangjie.creatingNovel.value ? '开书中…' : `用它开书（${selectedChecklist.length}）` }}
        </button>
      </template>
    </template>
  </Modal>
</template>
