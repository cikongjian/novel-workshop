/**
 * 角色实时对话逻辑封装
 */
import { ref } from 'vue';
import {
  fetchSession,
  clearSession,
  sendMessageStream,
  type ChatMessage,
  type ChatSession,
} from '../api/character-chat';

export function useCharacterChat() {
  const session = ref<ChatSession | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const loading = ref(false);
  const sending = ref(false);
  const streamingContent = ref('');
  const error = ref<string | null>(null);

  /** 加载会话 */
  async function loadSession(novelId: string, characterId: string) {
    loading.value = true;
    error.value = null;
    try {
      const s = await fetchSession(novelId, characterId);
      session.value = s;
      messages.value = s.messages;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载会话失败';
    } finally {
      loading.value = false;
    }
  }

  /** 发送消息 */
  async function send(message: string) {
    if (!session.value || sending.value) return;
    if (!message.trim()) return;

    sending.value = true;
    streamingContent.value = '';
    error.value = null;

    // 立即显示读者消息
    const readerMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'reader',
      content: message.trim(),
      createdAt: Date.now(),
    };
    messages.value.push(readerMsg);

    try {
      await sendMessageStream(session.value.id, message, {
        onChunk: (chunk) => {
          streamingContent.value += chunk;
        },
        onDone: (fullContent) => {
          if (fullContent.trim()) {
            messages.value.push({
              id: `char-${Date.now()}`,
              role: 'character',
              content: fullContent.trim(),
              createdAt: Date.now(),
            });
          }
          streamingContent.value = '';
        },
        onError: (msg) => {
          error.value = msg;
          streamingContent.value = '';
        },
      });
    } finally {
      sending.value = false;
    }
  }

  /** 清空会话 */
  async function clear() {
    if (!session.value) return;
    try {
      await clearSession(session.value.id);
      messages.value = [];
    } catch (err) {
      error.value = err instanceof Error ? err.message : '清空失败';
    }
  }

  /** 重置状态 */
  function reset() {
    session.value = null;
    messages.value = [];
    loading.value = false;
    sending.value = false;
    streamingContent.value = '';
    error.value = null;
  }

  return {
    session,
    messages,
    loading,
    sending,
    streamingContent,
    error,
    loadSession,
    send,
    clear,
    reset,
  };
}
