import { ref, computed, watch } from 'vue';
import type { Ref } from 'vue';
import { ElMessage } from 'element-plus';
import * as api from '../api';
import { useNovelStore } from '../stores/novel';
import { extractApiErrorMessage } from '../utils/api-error';
import { useFavoriteVoices } from './useFavoriteVoices';
import { CLIENT_TTS_STOPPED, useClientTTS } from './useClientTTS';
import type { UserRole } from '../utils/feature-flags';

export function useNarratorVoice(deps: {
  novelId: Ref<string>;
  userRole: Ref<UserRole>;
  onCacheClear?: () => void;
}) {
  const { novelId, userRole, onCacheClear } = deps;
  const novelStore = useNovelStore();
  const clientTTS = useClientTTS();

  const narratorVoiceDialogVisible = ref(false);
  const narratorVoiceLoading = ref(false);
  const narratorVoiceSaving = ref(false);
  const narratorVoicePreviewing = ref(false);
  const narratorVoiceOptions = ref<api.VoiceInfo[]>([]);
  const narratorVoiceSelected = ref('');
  const narratorVoicePreviewText = ref('这是旁白试听文本，用于确认当前小说的叙事音色。');
  let narratorVoicePreviewAudio: HTMLAudioElement | null = null;
  const narratorEngineType = ref<'edge-tts' | 'kokoro'>('edge-tts');

  const narratorEngineLabel = computed(() => {
    const map: Record<string, string> = { 'edge-tts': 'Edge-TTS', 'kokoro': 'Kokoro' };
    return map[narratorEngineType.value] || narratorEngineType.value;
  });

  const { isFavorite: isNarratorVoiceFav, toggleFavorite: toggleNarratorVoiceFav } = useFavoriteVoices();

  const narratorVoiceOptionGroups = computed(() => {
    const favs = narratorVoiceOptions.value.filter(v => isNarratorVoiceFav(v.name));
    const male = narratorVoiceOptions.value.filter(v => v.gender === 'male');
    const female = narratorVoiceOptions.value.filter(v => v.gender === 'female');
    const groups: { label: string; options: api.VoiceInfo[] }[] = [];
    if (favs.length > 0) groups.push({ label: '收藏', options: favs });
    if (male.length > 0) groups.push({ label: '男声', options: male });
    if (female.length > 0) groups.push({ label: '女声', options: female });
    return groups;
  });

  function stopNarratorVoicePreview() {
    narratorVoicePreviewing.value = false;
    clientTTS.stop();
    if (narratorVoicePreviewAudio) {
      narratorVoicePreviewAudio.pause();
      narratorVoicePreviewAudio = null;
    }
  }

  async function loadNovelNarratorVoiceSettings() {
    if (!novelId.value) return;
    narratorVoiceLoading.value = true;
    try {
      const data = await api.fetchNovelNarratorVoiceSettings(novelId.value);
      narratorVoiceOptions.value = data.voices;
      narratorVoiceSelected.value = data.voice;
      if (data.engine) narratorEngineType.value = data.engine;
      if (novelStore.currentNovel) {
        novelStore.currentNovel.edgeNarratorVoice = data.voice;
      }
    } catch (err: unknown) {
      ElMessage.error(extractApiErrorMessage(err, '加载旁白音色配置失败'));
    } finally {
      narratorVoiceLoading.value = false;
    }
  }

  async function openNarratorVoiceDialog() {
    narratorVoiceDialogVisible.value = true;
    await loadNovelNarratorVoiceSettings();
  }

  async function previewNarratorVoice() {
    if (!narratorVoiceSelected.value) {
      ElMessage.warning('请先选择一个旁白音色');
      return;
    }

    const previewText = narratorVoicePreviewText.value.trim() || '这是旁白试听文本，用于确认当前小说的叙事音色。';
    narratorVoicePreviewing.value = true;

    try {
      if (userRole.value !== 'admin') {
        if (!clientTTS.isSupported()) {
          throw new Error('当前浏览器不支持本地语音试听，请使用 Chrome 或 Edge');
        }

        stopNarratorVoicePreview();
        narratorVoicePreviewing.value = true;
        await clientTTS.speak(previewText, {
          voiceName: narratorVoiceSelected.value,
        });
        narratorVoicePreviewing.value = false;
        return;
      }

      if (!novelId.value) return;
      const result = await api.previewNovelNarratorVoice(novelId.value, {
        voice: narratorVoiceSelected.value,
        text: previewText,
      });
      stopNarratorVoicePreview();
      narratorVoicePreviewing.value = true;
      narratorVoicePreviewAudio = new Audio(`data:audio/mp3;base64,${result.audio}`);
      narratorVoicePreviewAudio.onended = () => {
        narratorVoicePreviewing.value = false;
        narratorVoicePreviewAudio = null;
      };
      narratorVoicePreviewAudio.onerror = () => {
        narratorVoicePreviewing.value = false;
        narratorVoicePreviewAudio = null;
      };
      await narratorVoicePreviewAudio.play();
    } catch (err: unknown) {
      narratorVoicePreviewing.value = false;
      if (err instanceof Error && err.message === CLIENT_TTS_STOPPED) {
        return;
      }
      ElMessage.error(extractApiErrorMessage(err, '旁白音色试听失败'));
    }
  }

  async function saveNarratorVoice() {
    if (!novelId.value) return;
    if (!narratorVoiceSelected.value) {
      ElMessage.warning('请先选择一个旁白音色');
      return;
    }
    narratorVoiceSaving.value = true;
    try {
      const result = await api.updateNovelNarratorVoice(novelId.value, narratorVoiceSelected.value);
      if (novelStore.currentNovel) {
        novelStore.currentNovel.edgeNarratorVoice = result.voice;
      }
      // 旁白音色变化会影响合成结果：通知外部清掉缓存
      onCacheClear?.();
      ElMessage.success('已保存小说旁白音色，后续播报将按新音色合成');
      narratorVoiceDialogVisible.value = false;
    } catch (err: unknown) {
      ElMessage.error(extractApiErrorMessage(err, '保存旁白音色失败'));
    } finally {
      narratorVoiceSaving.value = false;
    }
  }

  watch(narratorVoiceDialogVisible, (visible) => {
    if (!visible) stopNarratorVoicePreview();
  });

  return {
    narratorVoiceDialogVisible,
    narratorVoiceLoading,
    narratorVoiceSaving,
    narratorVoicePreviewing,
    narratorVoiceOptions,
    narratorVoiceSelected,
    narratorVoicePreviewText,
    narratorEngineType,
    narratorEngineLabel,
    narratorVoiceOptionGroups,
    isNarratorVoiceFav,
    toggleNarratorVoiceFav,
    stopNarratorVoicePreview,
    loadNovelNarratorVoiceSettings,
    openNarratorVoiceDialog,
    previewNarratorVoice,
    saveNarratorVoice,
  };
}
