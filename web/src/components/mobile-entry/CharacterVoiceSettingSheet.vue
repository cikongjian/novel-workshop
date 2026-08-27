<template>
  <div v-if="visible" class="voice-setting-sheet">
    <div class="voice-setting-sheet__backdrop" @click="$emit('close')" />
    <div class="voice-setting-sheet__page">
      <div class="voice-setting-sheet__shell">
        <div class="voice-setting-sheet__panel">
          <div class="voice-setting-sheet__header">
            <span class="voice-setting-sheet__title">角色声音设置</span>
            <button class="voice-setting-sheet__close" @click="$emit('close')">关闭</button>
          </div>

          <div v-if="voiceListLoading" class="voice-setting-sheet__loading">加载声音列表...</div>

          <div v-else class="voice-setting-sheet__body">
            <div class="voice-setting-sheet__hint">
              选择一个适合该角色的音色，设置后广播剧将使用此声音朗读该角色的台词
            </div>

            <div class="voice-setting-sheet__voice-list">
              <button
                v-for="voice in filteredVoices"
                :key="voice.value"
                class="voice-setting-sheet__voice-item"
                :class="{ 'is-selected': selectedVoice === voice.value }"
                @click="selectedVoice = voice.value"
              >
                <div class="voice-setting-sheet__voice-name">{{ voice.label }}</div>
                <div class="voice-setting-sheet__voice-meta">{{ voice.gender }} · {{ voice.locale }}</div>
              </button>
            </div>
          </div>

          <div class="voice-setting-sheet__footer">
            <button
              class="voice-setting-sheet__btn voice-setting-sheet__btn--ghost"
              :class="{ 'is-loading': previewing }"
              :disabled="!selectedVoice || previewing"
              @click="handlePreview"
            >
              试听
            </button>
            <button
              class="voice-setting-sheet__btn voice-setting-sheet__btn--primary"
              :class="{ 'is-loading': saving }"
              :disabled="!selectedVoice || saving"
              @click="handleSave"
            >
              应用此声音
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { CharacterProfile } from '../../types';
import { fetchVoices, previewVoice } from '../../api/tts';
import { updateCharacter } from '../../api/characters';
import { useAuthStore } from '../../stores/auth';
import { useClientTTS } from '../../composables/useClientTTS';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  characterId: string | null;
  character: CharacterProfile | null;
}>();

const emit = defineEmits<{
  close: [];
  updated: [];
}>();

const authStore = useAuthStore();
const clientTTS = useClientTTS();
const saving = ref(false);
const previewing = ref(false);
const voiceListLoading = ref(false);
const voiceList = ref<Array<{ value: string; label: string; gender: string; locale: string }>>([]);
const selectedVoice = ref('');

const filteredVoices = computed(() => {
  if (!voiceList.value.length) return [];
  const charGender = props.character?.gender || '';
  if (charGender.includes('男')) {
    return voiceList.value.filter((v) => v.gender === '男');
  }
  if (charGender.includes('女')) {
    return voiceList.value.filter((v) => v.gender === '女');
  }
  return voiceList.value;
});

async function loadVoiceList() {
  voiceListLoading.value = true;
  try {
    const result = await fetchVoices();
    voiceList.value = result
      .filter((v) => v.locale?.startsWith('zh'))
      .map((v) => ({
        value: v.name,
        label: v.label || v.name,
        gender: v.gender === 'male' ? '男' : v.gender === 'female' ? '女' : '',
        locale: v.locale || '',
      }));
  } catch {
    ElMessage.error('加载声音列表失败');
  } finally {
    voiceListLoading.value = false;
  }
}

let previewAudioEl: HTMLAudioElement | null = null;

function stopPreview() {
  clientTTS.stop();
  if (previewAudioEl) {
    previewAudioEl.pause();
    previewAudioEl = null;
  }
}

async function handlePreview() {
  if (!selectedVoice.value) return;
  stopPreview();
  previewing.value = true;
  try {
    const text = props.character?.speechExamples?.[0] || `你好，我是${props.character?.name || '角色'}。`;
    if (!authStore.isAdmin) {
      if (!clientTTS.isSupported()) {
        throw new Error('当前浏览器不支持本地语音试听');
      }
      await clientTTS.speak(text, { voiceName: selectedVoice.value });
      return;
    }

    const result = await previewVoice({ voice: selectedVoice.value, text });
    const audio = new Audio(`data:audio/wav;base64,${result.audio}`);
    previewAudioEl = audio;
    audio.play().catch(() => {});
    audio.onended = () => {
      previewAudioEl = null;
    };
  } catch {
    ElMessage.error('试听失败');
  } finally {
    previewing.value = false;
  }
}

async function handleSave() {
  if (!props.characterId || !selectedVoice.value) return;
  saving.value = true;
  try {
    await updateCharacter(props.novelId, props.characterId, {
      ttsVoice: selectedVoice.value,
      voiceInstruct: '',
      voiceDesignStatus: 'none',
    });
    ElMessage.success('声音设置已保存');
    emit('updated');
  } catch {
    ElMessage.error('保存失败');
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.visible,
  (val) => {
    if (val && props.character) {
      selectedVoice.value = props.character.ttsVoice || '';
      void loadVoiceList();
    } else {
      stopPreview();
    }
  },
);
</script>

<style scoped>
.voice-setting-sheet {
  position: fixed;
  inset: 0;
  z-index: 2100;
  --voice-sheet-accent: var(--mobile-focus-accent, var(--star-brand-sky));
  --voice-sheet-accent-strong: var(--mobile-focus-accent-strong, var(--star-brand-teal));
  --voice-sheet-surface: color-mix(in srgb, var(--nw-bg-primary) 92%, transparent);
  --voice-sheet-surface-soft: color-mix(in srgb, var(--nw-bg-secondary) 86%, transparent);
  --voice-sheet-border: color-mix(in srgb, var(--voice-sheet-accent) 18%, var(--nw-border));
}

.voice-setting-sheet__backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--nw-text-primary) 65%, transparent);
  backdrop-filter: blur(12px);
}

.voice-setting-sheet__page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--voice-sheet-accent) 13%, transparent), transparent 26%),
    radial-gradient(circle at top left, color-mix(in srgb, var(--voice-sheet-accent-strong) 8%, transparent), transparent 24%),
    linear-gradient(180deg, var(--nw-bg-primary) 0%, color-mix(in srgb, var(--nw-bg-primary) 48%, var(--nw-bg-secondary)) 44%, color-mix(in srgb, var(--nw-bg-primary) 86%, var(--nw-bg-secondary)) 100%);
}

.voice-setting-sheet__shell {
  width: min(100%, 480px);
  height: min(92dvh, 700px);
  border-radius: 28px;
  overflow: hidden;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--voice-sheet-accent) 20%, var(--nw-border)),
    0 24px 64px color-mix(in srgb, var(--nw-text-primary) 30%, transparent);
}

.voice-setting-sheet__panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background:
    radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--voice-sheet-accent) 16%, transparent), transparent 34%),
    linear-gradient(180deg, var(--voice-sheet-surface), var(--voice-sheet-surface-soft));
}

.voice-setting-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 16px 18px;
  border-bottom: 1px solid var(--voice-sheet-border);
}

.voice-setting-sheet__title {
  color: var(--nw-text-primary);
  font-size: 16px;
  font-weight: 800;
}

.voice-setting-sheet__close {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--voice-sheet-accent) 18%, var(--nw-border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--voice-sheet-accent) 9%, transparent);
  color: color-mix(in srgb, var(--voice-sheet-accent) 86%, var(--nw-text-primary));
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.voice-setting-sheet__loading {
  padding: 48px 20px;
  text-align: center;
  color: var(--nw-text-secondary);
  font-size: 14px;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.voice-setting-sheet__body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px 18px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.voice-setting-sheet__hint {
  font-size: 13px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--voice-sheet-accent) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--voice-sheet-accent) 14%, var(--nw-border));
}

.voice-setting-sheet__voice-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.voice-setting-sheet__voice-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 16px;
  border: 1px solid var(--voice-sheet-border);
  background: color-mix(in srgb, var(--nw-bg-primary) 70%, transparent);
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
  font: inherit;
}

.voice-setting-sheet__voice-item.is-selected {
  border-color: var(--voice-sheet-accent-strong);
  background: color-mix(in srgb, var(--voice-sheet-accent) 14%, var(--nw-bg-primary));
  box-shadow: 0 2px 12px color-mix(in srgb, var(--voice-sheet-accent) 18%, transparent);
}

.voice-setting-sheet__voice-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.voice-setting-sheet__voice-meta {
  font-size: 12px;
  color: var(--nw-text-secondary);
}

.voice-setting-sheet__footer {
  flex-shrink: 0;
  padding: 14px 18px calc(14px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--voice-sheet-border);
  display: flex;
  gap: 12px;
  background: color-mix(in srgb, var(--nw-bg-secondary) 50%, transparent);
}

.voice-setting-sheet__btn {
  flex: 1;
  padding: 12px 20px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.voice-setting-sheet__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.voice-setting-sheet__btn--ghost {
  background: color-mix(in srgb, var(--nw-bg-primary) 60%, transparent);
  color: var(--nw-text-primary);
  border: 1px solid var(--voice-sheet-border);
}

.voice-setting-sheet__btn--primary {
  background: linear-gradient(
    135deg,
    var(--voice-sheet-accent),
    var(--voice-sheet-accent-strong)
  );
  color: #fff;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--voice-sheet-accent) 36%, transparent);
}

.voice-setting-sheet__btn--primary:hover:not(:disabled) {
  filter: brightness(1.05);
}

.voice-setting-sheet__btn.is-loading {
  opacity: 0.7;
}
</style>
