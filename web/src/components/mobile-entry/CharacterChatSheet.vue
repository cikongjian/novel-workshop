<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ChatLineRound, Close, Delete, InfoFilled, Promotion } from '@element-plus/icons-vue';
import { useCharacterChat } from '../../composables/useCharacterChat';
import { useAuthStore } from '../../stores/auth';
import EmojiPicker from './EmojiPicker.vue';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  characterId: string;
  characterName: string;
  characterPortrait?: string;
  chapterInfo?: string;
}>();

const emit = defineEmits<{
  close: [];
  openMailbox: [];
}>();

const auth = useAuthStore();
const authStore = auth;
const chat = useCharacterChat();

const inputText = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const abortController = ref<AbortController | null>(null);
const showEmojiPicker = ref(false);
const emojiPickerRef = ref<HTMLElement | null>(null);

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  });
}

async function handleSend() {
  const text = inputText.value.trim();
  if (!text || chat.sending.value) return;

  if (!authStore.isAuthenticated) {
    ElMessage.warning('请先登录后再对话');
    return;
  }

  inputText.value = '';
  await chat.send(text);
  scrollToBottom();
}

function handleEnter(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    void handleSend();
  }
}

async function handleClear() {
  try {
    await ElMessageBox.confirm('确定要清空所有对话记录吗？', '清空对话', {
      confirmButtonText: '清空',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await chat.clear();
    ElMessage.success('对话已清空');
  } catch {
    // 取消
  }
}

function handleClose() {
  emit('close');
}

function handleOpenMailbox() {
  emit('openMailbox');
}

function toggleEmojiPicker() {
  showEmojiPicker.value = !showEmojiPicker.value;
}

function handleEmojiSelect(emoji: string) {
  inputText.value += emoji;
  showEmojiPicker.value = false;
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node;
  if (emojiPickerRef.value && !emojiPickerRef.value.contains(target)) {
    showEmojiPicker.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  abortController.value?.abort();
  chat.reset();
  document.removeEventListener('click', handleClickOutside);
});

watch(
  () => [props.visible, props.characterId] as const,
  ([visible, characterId]) => {
    if (visible && characterId && props.novelId) {
      void chat.loadSession(props.novelId, characterId).then(() => scrollToBottom());
    } else if (!visible) {
      chat.reset();
    }
  },
  { immediate: true },
);

watch(
  () => chat.messages.value.length,
  () => scrollToBottom(),
);

watch(
  () => chat.streamingContent.value,
  () => scrollToBottom(),
);

onBeforeUnmount(() => {
  abortController.value?.abort();
  chat.reset();
});
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="character-chat-overlay mobile-focus-light-vars">
      <div class="character-chat-sheet">
          <!-- 顶部栏 -->
          <div class="chat-header">
            <div class="chat-header__left">
              <div class="chat-header__avatar">
                <img
                  v-if="characterPortrait"
                  :src="characterPortrait"
                  :alt="characterName"
                />
                <span v-else class="chat-header__avatar-placeholder">
                  {{ characterName.charAt(0) }}
                </span>
              </div>
              <div class="chat-header__info">
                <strong class="chat-header__name">{{ characterName }}</strong>
                <span v-if="chapterInfo" class="chat-header__status">
                  <el-icon class="chat-header__status-icon"><InfoFilled /></el-icon>
                  <span>{{ chapterInfo }}</span>
                </span>
              </div>
            </div>
            <div class="chat-header__actions">
              <button
                class="chat-header__btn"
                type="button"
                title="写信"
                @click="handleOpenMailbox"
              >
                <el-icon><ChatLineRound /></el-icon>
              </button>
              <button
                class="chat-header__btn"
                type="button"
                title="清空对话"
                @click="handleClear"
              >
                <el-icon><Delete /></el-icon>
              </button>
              <button
                class="chat-header__btn chat-header__btn--close"
                type="button"
                title="关闭"
                @click="handleClose"
              >
                <el-icon><Close /></el-icon>
              </button>
            </div>
          </div>

          <!-- 消息列表 -->
          <div ref="messagesContainer" class="chat-messages">
            <div v-if="chat.loading.value" class="chat-empty">
              <span>正在加载对话...</span>
            </div>
            <div v-else-if="chat.messages.value.length === 0 && !chat.streamingContent.value" class="chat-empty">
              <div class="chat-empty__icon">
                <el-icon><ChatLineRound /></el-icon>
              </div>
              <p>和 {{ characterName }} 开始对话吧</p>
              <p class="chat-empty__hint">角色会根据当前剧情状态回复你</p>
            </div>
            <template v-else>
              <div
                v-for="msg in chat.messages.value"
                :key="msg.id"
                class="chat-msg"
                :class="msg.role === 'reader' ? 'chat-msg--reader' : 'chat-msg--character'"
              >
                <div v-if="msg.role === 'character'" class="chat-msg__avatar">
                  <img
                    v-if="characterPortrait"
                    :src="characterPortrait"
                    :alt="characterName"
                  />
                  <span v-else>{{ characterName.charAt(0) }}</span>
                </div>
                <div class="chat-msg__bubble">
                  {{ msg.content }}
                </div>
              </div>
              <!-- 等待回复（输入中） -->
              <div v-if="chat.sending.value && !chat.streamingContent.value" class="chat-msg chat-msg--character">
                <div class="chat-msg__avatar">
                  <img
                    v-if="characterPortrait"
                    :src="characterPortrait"
                    :alt="characterName"
                  />
                  <span v-else>{{ characterName.charAt(0) }}</span>
                </div>
                <div class="chat-msg__bubble chat-msg__typing">
                  <span class="chat-msg__typing-dot"></span>
                  <span class="chat-msg__typing-dot"></span>
                  <span class="chat-msg__typing-dot"></span>
                </div>
              </div>
              <!-- 流式输出中 -->
              <div v-if="chat.streamingContent.value" class="chat-msg chat-msg--character">
                <div class="chat-msg__avatar">
                  <img
                    v-if="characterPortrait"
                    :src="characterPortrait"
                    :alt="characterName"
                  />
                  <span v-else>{{ characterName.charAt(0) }}</span>
                </div>
                <div class="chat-msg__bubble chat-msg__bubble--streaming">
                  {{ chat.streamingContent.value }}<span class="chat-msg__cursor">▌</span>
                </div>
              </div>
            </template>
          </div>

          <!-- 错误提示 -->
          <div v-if="chat.error.value" class="chat-error">
            {{ chat.error.value }}
          </div>

          <!-- 输入栏 -->
          <div class="chat-input-bar">
            <button
              class="chat-emoji-btn"
              type="button"
              :disabled="chat.sending.value"
              @click.stop="toggleEmojiPicker"
            >
              😀
            </button>
            <div ref="emojiPickerRef" class="chat-emoji-picker-wrapper">
              <EmojiPicker
                :visible="showEmojiPicker"
                @select="handleEmojiSelect"
                @close="showEmojiPicker = false"
              />
            </div>
            <textarea
              v-model="inputText"
              class="chat-input"
              placeholder="输入消息..."
              rows="1"
              :disabled="chat.sending.value"
              @keydown="handleEnter"
            />
            <button
              class="chat-send-btn"
              type="button"
              :disabled="!inputText.trim() || chat.sending.value"
              @click="handleSend"
            >
              <el-icon v-if="!chat.sending.value"><Promotion /></el-icon>
              <span v-else class="chat-send-btn__loading"></span>
            </button>
          </div>
        </div>
      </div>
  </Teleport>
</template>

<style scoped>
.character-chat-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  color: var(--nw-text-primary);
}

.character-chat-sheet {
  background: var(--mobile-focus-surface-muted);
  border-radius: 20px 20px 0 0;
  height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部栏 */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--nw-bg-secondary);
  border-bottom: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  flex-shrink: 0;
}

.chat-header__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.chat-header__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chat-header__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-header__avatar-placeholder {
  color: var(--mobile-focus-on-accent);
  font-size: 18px;
  font-weight: 700;
}

.chat-header__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.chat-header__name {
  font-size: 16px;
  font-weight: 700;
  color: var(--nw-text-primary);
}

.chat-header__status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--mobile-focus-status-gold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-header__status-icon {
  flex: 0 0 auto;
}

.chat-header__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.chat-header__btn {
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--nw-text-muted);
  transition: background 0.15s;
}

.chat-header__btn:hover {
  background: color-mix(in srgb, var(--nw-text-primary) 5%, transparent);
}

.chat-header__btn--close:hover {
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 10%, transparent);
  color: var(--mobile-focus-status-danger);
}

/* 消息列表 */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--nw-text-muted);
}

.chat-empty__icon {
  font-size: 48px;
  line-height: 1;
}

.chat-empty p {
  margin: 0;
  font-size: 14px;
}

.chat-empty__hint {
  font-size: 12px !important;
  color: color-mix(in srgb, var(--nw-text-muted) 58%, var(--nw-bg-secondary));
}

.chat-msg {
  display: flex;
  gap: 8px;
  max-width: 85%;
  animation: chat-msg-in 0.2s ease;
}

@keyframes chat-msg-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.chat-msg--reader {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.chat-msg--character {
  align-self: flex-start;
}

.chat-msg__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--mobile-focus-on-accent);
  font-size: 14px;
  font-weight: 600;
}

.chat-msg__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.chat-msg__bubble {
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.chat-msg--reader .chat-msg__bubble {
  background: var(--mobile-focus-accent);
  color: var(--mobile-focus-on-accent);
  border-bottom-right-radius: 4px;
}

.chat-msg--character .chat-msg__bubble {
  background: var(--nw-bg-secondary);
  color: var(--nw-text-primary);
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 2px color-mix(in srgb, var(--nw-text-primary) 6%, transparent);
}

.chat-msg__bubble--streaming {
  color: var(--nw-text-secondary);
}

/* 输入中动画 */
.chat-msg__typing {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
}

.chat-msg__typing-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--nw-text-muted);
  animation: typing-bounce 1.2s infinite ease-in-out;
}

.chat-msg__typing-dot:nth-child(2) {
  animation-delay: 0.15s;
}

.chat-msg__typing-dot:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes typing-bounce {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-6px);
    opacity: 1;
  }
}

.chat-msg__cursor {
  animation: blink 0.8s infinite;
  color: var(--mobile-focus-accent);
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 错误提示 */
.chat-error {
  padding: 8px 16px;
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 8%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-status-danger) 86%, var(--nw-text-primary));
  font-size: 12px;
  text-align: center;
  flex-shrink: 0;
}

/* 输入栏 */
.chat-input-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  background: var(--nw-bg-secondary);
  border-top: 1px solid color-mix(in srgb, var(--nw-border) 46%, transparent);
  flex-shrink: 0;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  position: relative;
}

.chat-emoji-btn {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--nw-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
  font-size: 20px;
}

.chat-emoji-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--nw-text-primary) 8%, transparent);
  color: var(--nw-text-primary);
}

.chat-emoji-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chat-emoji-picker-wrapper {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 20;
}

.chat-input {
  flex: 1;
  border: 1px solid color-mix(in srgb, var(--nw-border) 70%, transparent);
  border-radius: 20px;
  padding: 10px 16px;
  font-size: 16px;
  color: var(--nw-text-primary);
  resize: none;
  outline: none;
  max-height: 100px;
  min-height: 40px;
  line-height: 1.4;
  background: var(--mobile-focus-surface-muted);
  transition: border-color 0.15s;
  font-family: inherit;
  -webkit-user-select: text;
  user-select: text;
  -webkit-appearance: none;
  appearance: none;
  touch-action: manipulation;
}

.chat-input:focus {
  border-color: var(--mobile-focus-accent);
  background: var(--nw-bg-secondary);
}

.chat-input::placeholder {
  color: color-mix(in srgb, var(--nw-text-muted) 58%, var(--nw-bg-secondary));
}

.chat-send-btn {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: var(--mobile-focus-accent);
  color: var(--mobile-focus-on-accent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.chat-send-btn:hover:not(:disabled) {
  background: var(--mobile-focus-accent-strong);
  transform: scale(1.05);
}

.chat-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chat-send-btn__loading {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--mobile-focus-on-accent) 30%, transparent);
  border-top-color: var(--mobile-focus-on-accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
