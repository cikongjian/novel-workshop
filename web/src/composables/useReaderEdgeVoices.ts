import { ref } from 'vue';
import { fetchVoices } from '../api/tts';
import { useAuthStore } from '../stores/auth';
import {
  EDGE_ENGINE_MODE_STORAGE_KEY,
  EDGE_VOICE_PREFIX,
  EDGE_VOICE_STORAGE_KEY,
  mapEdgeVoiceToOption,
  type ReaderVoiceOption,
} from '../utils/reader-edge-voice';

export type ReaderTTSEngineMode = 'system' | 'edge-online';

/** 默认在线音色：云健（zh-CN-YunjianNeural），沉稳男声，适合小说朗读 */
const DEFAULT_EDGE_VOICE = 'zh-CN-YunjianNeural';

/**
 * 阅读器在线音色的状态管理：引擎模式、已选在线音色、在线音色列表的加载与持久化。
 * 与播放引擎解耦，只负责“选了哪个在线音色”这件事。
 */
export function useReaderEdgeVoices() {
  const auth = useAuthStore();
  const ttsEngineMode = ref<ReaderTTSEngineMode>('system');
  const edgeVoiceName = ref('');
  const edgeVoiceOptions = ref<ReaderVoiceOption[]>([]);
  const onlineVoicesLoading = ref(false);
  const onlineVoicesLoaded = ref(false);

  function persistEngineMode() {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(EDGE_ENGINE_MODE_STORAGE_KEY, ttsEngineMode.value);
  }

  function persistEdgeVoice() {
    if (typeof window === 'undefined') return;
    if (edgeVoiceName.value) {
      window.localStorage.setItem(EDGE_VOICE_STORAGE_KEY, edgeVoiceName.value);
      return;
    }
    window.localStorage.removeItem(EDGE_VOICE_STORAGE_KEY);
  }

  /** 从 localStorage 恢复引擎模式与已选在线音色 */
  function restoreEdgeVoiceState() {
    if (typeof window === 'undefined') return;
    // 游客不开放在线 TTS：强制系统模式，忽略历史的 edge-online 选择
    if (!auth.isAuthenticated) {
      ttsEngineMode.value = 'system';
      edgeVoiceName.value = DEFAULT_EDGE_VOICE;
      return;
    }
    const savedMode = window.localStorage.getItem(EDGE_ENGINE_MODE_STORAGE_KEY);
    ttsEngineMode.value = savedMode === 'edge-online' ? 'edge-online' : 'system';
    const savedEdgeVoice = window.localStorage.getItem(EDGE_VOICE_STORAGE_KEY);
    edgeVoiceName.value = savedEdgeVoice && savedEdgeVoice.startsWith('zh-') ? savedEdgeVoice : DEFAULT_EDGE_VOICE;
  }

  /** 拉取在线音色列表并校验已选音色是否仍可用（幂等，可重复调用） */
  async function loadOnlineVoices(): Promise<void> {
    // 在线 TTS 不对游客开放：未登录时不请求（接口会 401），保持空列表使在线音色入口隐藏
    if (!auth.isAuthenticated) {
      edgeVoiceOptions.value = [];
      onlineVoicesLoaded.value = true;
      if (ttsEngineMode.value === 'edge-online') ttsEngineMode.value = 'system';
      return;
    }
    if (onlineVoicesLoading.value) return;
    onlineVoicesLoading.value = true;
    try {
      const voices = await fetchVoices();
      edgeVoiceOptions.value = voices.map(mapEdgeVoiceToOption);
      onlineVoicesLoaded.value = true;
      // 已选在线音色若已不在列表中，回退到默认音色
      if (edgeVoiceName.value && !voices.some((v) => v.name === edgeVoiceName.value)) {
        const hasDefault = voices.some((v) => v.name === DEFAULT_EDGE_VOICE);
        edgeVoiceName.value = hasDefault ? DEFAULT_EDGE_VOICE : (voices.length > 0 ? voices[0].name : '');
        if (!edgeVoiceName.value) ttsEngineMode.value = 'system';
      }
    } catch {
      // 加载失败时保留空列表，不影响系统音色正常使用
      edgeVoiceOptions.value = [];
    } finally {
      onlineVoicesLoading.value = false;
    }
  }

  /** 选中某个统一音色值：edge: 前缀切到在线模式，否则切到系统模式 */
  function applyVoiceSelection(value: string) {
    if (value.startsWith(EDGE_VOICE_PREFIX)) {
      ttsEngineMode.value = 'edge-online';
      edgeVoiceName.value = value.slice(EDGE_VOICE_PREFIX.length);
    } else {
      ttsEngineMode.value = 'system';
    }
  }

  return {
    ttsEngineMode,
    edgeVoiceName,
    edgeVoiceOptions,
    onlineVoicesLoading,
    onlineVoicesLoaded,
    restoreEdgeVoiceState,
    loadOnlineVoices,
    applyVoiceSelection,
    persistEngineMode,
    persistEdgeVoice,
  };
}
