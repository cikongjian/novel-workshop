<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Delete, DocumentChecked, EditPen, MoreFilled, Promotion } from '@element-plus/icons-vue';
import { organizeCangjieStory, sendCangjieChat } from '../api/cangjie';
import { useCangjieSession } from '../composables/useCangjieSession';
import { extractApiErrorMessage } from '../utils/api-error';
import '../styles/mobile-fun-features.css';

const PROMPT_CHIPS = [
  '我有一个主角，但还没想好冲突',
  '想写反套路重生，开局要更狠',
  '世界里有一条不能触碰的规则',
  '先帮我追问，把故事核拎出来',
];

const router = useRouter();
const session = useCangjieSession();
const draft = ref('');
const booting = ref(false);
const sending = ref(false);
const organizing = ref(false);
const showMore = ref(false);
const threadScrollRef = ref<HTMLElement | null>(null);
let openingRequested = false;

const normalizedDraft = computed(() => draft.value.trim());
const canSend = computed(() => Boolean(normalizedDraft.value) && !sending.value && !booting.value);
const canOrganize = computed(() => session.hasUserMessages.value && !organizing.value && !sending.value);

async function scrollToBottom() {
  await nextTick();
  if (threadScrollRef.value) {
    threadScrollRef.value.scrollTop = threadScrollRef.value.scrollHeight;
  }
}

async function requestOpening() {
  if (openingRequested || session.messages.value.length > 0) return;
  openingRequested = true;
  booting.value = true;
  try {
    const reply = await sendCangjieChat([]);
    session.appendMessage(reply.role, reply.content);
  } catch (err) {
    openingRequested = false;
    ElMessage.error(extractApiErrorMessage(err, '仓颉暂时没接上，请稍后再试'));
  } finally {
    booting.value = false;
  }
}

function usePrompt(prompt: string) {
  draft.value = draft.value.trim() ? `${draft.value.trim()}\n${prompt}` : prompt;
}

async function sendMessage() {
  const content = normalizedDraft.value;
  if (!content) return;

  draft.value = '';
  session.appendMessage('user', content);
  sending.value = true;
  try {
    const reply = await sendCangjieChat(session.messages.value);
    session.appendMessage(reply.role, reply.content);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '发送失败，请稍后重试'));
  } finally {
    sending.value = false;
  }
}

async function organizeStory() {
  if (!session.hasUserMessages.value) {
    ElMessage.warning('先聊出一个故事方向');
    return;
  }

  organizing.value = true;
  try {
    const checklist = await organizeCangjieStory(session.messages.value);
    session.setChecklist(checklist);
    void router.push('/m/fun/cangjie/review');
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '整理失败，请稍后重试'));
  } finally {
    organizing.value = false;
  }
}

async function resetChat() {
  try {
    await ElMessageBox.confirm('当前聊天和整理结果会清空。', '重新开始仓颉造字', {
      confirmButtonText: '重新开始',
      cancelButtonText: '保留',
      type: 'warning',
    });
  } catch {
    return;
  }

  draft.value = '';
  openingRequested = false;
  session.resetSession();
  await requestOpening();
}

watch(
  () => [session.messages.value.length, booting.value, sending.value],
  () => {
    void scrollToBottom();
  },
);

onMounted(() => {
  void requestOpening();
  void scrollToBottom();
});
</script>

<template>
  <div class="cangjie-wechat-page">
    <div class="cangjie-wechat-hd">
      <button class="cangjie-wechat-back" type="button" @click="router.back()">
        <el-icon :size="18"><ArrowLeft /></el-icon>
      </button>
      <span class="cangjie-wechat-title">仓颉造字</span>
      <button
        class="cangjie-wechat-more"
        type="button"
        :disabled="organizing || sending"
        @click.stop="showMore = !showMore"
      >
        <el-icon :size="18"><MoreFilled /></el-icon>
      </button>
      <Transition name="cangjie-wechat-drop">
        <div v-if="showMore" class="cangjie-wechat-dropdown" @click.stop>
          <button type="button" :disabled="!canOrganize" @click="showMore = false; organizeStory()">
            <el-icon :size="14"><DocumentChecked /></el-icon>
            <span>整理故事核心</span>
          </button>
          <button type="button" @click="showMore = false; resetChat()">
            <el-icon :size="14"><Delete /></el-icon>
            <span>重新开始</span>
          </button>
        </div>
      </Transition>
    </div>

    <div ref="threadScrollRef" class="cangjie-wechat-body">
      <div class="cangjie-wechat-msg-list">
        <div v-if="session.messages.value.length === 0 && !booting" class="cangjie-wechat-date-tip">
          随便聊聊你的故事灵感，我会帮你理出核心
        </div>

        <article
          v-for="message in session.messages.value"
          :key="message.id"
          class="cangjie-wechat-msg"
          :class="`cangjie-wechat-msg--${message.role}`"
        >
          <span v-if="message.role === 'assistant'" class="cangjie-wechat-avatar cangjie-wechat-avatar--assistant">
            <el-icon :size="17"><EditPen /></el-icon>
          </span>
          <div class="cangjie-wechat-bubble">
            {{ message.content }}
          </div>
          <span v-if="message.role === 'user'" class="cangjie-wechat-avatar cangjie-wechat-avatar--self">我</span>
        </article>

        <article v-if="booting || sending" class="cangjie-wechat-msg cangjie-wechat-msg--assistant">
          <span class="cangjie-wechat-avatar cangjie-wechat-avatar--assistant">
            <el-icon :size="17"><EditPen /></el-icon>
          </span>
          <div class="cangjie-wechat-bubble cangjie-wechat-bubble--typing">
            {{ booting ? '正在接入...' : '正在构思...' }}
          </div>
        </article>
      </div>

      <div v-if="session.messages.value.length === 0" class="cangjie-wechat-quick">
        <button
          v-for="prompt in PROMPT_CHIPS"
          :key="prompt"
          type="button"
          class="cangjie-wechat-quick-btn"
          :disabled="sending || organizing"
          @click="usePrompt(prompt)"
        >
          {{ prompt }}
        </button>
      </div>
    </div>

    <div class="cangjie-wechat-ft">
      <form class="cangjie-wechat-input-row" @submit.prevent="sendMessage">
        <input
          v-model="draft"
          type="text"
          maxlength="1000"
          :disabled="sending || organizing"
          placeholder="输入..."
          class="cangjie-wechat-input"
          enterkeyhint="send"
        />
        <button class="cangjie-wechat-send" type="submit" :disabled="!canSend">
          <el-icon :size="18"><Promotion /></el-icon>
        </button>
      </form>
    </div>
  </div>
</template>
