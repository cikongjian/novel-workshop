<script setup lang="ts">
import { useAttrs, type ShallowUnwrapRef } from 'vue';
import { CloseBold } from '@element-plus/icons-vue';
import type { useReaderTTS } from '../../composables/useReaderTTS';
import MobileReaderTTSPlaybackControls from './MobileReaderTTSPlaybackControls.vue';

// 父组件通过 proxyRefs(useReaderTTS(...)) 传入已解包的对象，因此属性类型取解包后的形态
type ReaderTTS = ShallowUnwrapRef<ReturnType<typeof useReaderTTS>>;

defineProps<{
  visible: boolean;
  tts: ReaderTTS;
}>();

const emit = defineEmits<{
  close: [];
}>();

defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
</script>

<template>
  <Transition name="reader-tts-panel">
    <section v-if="visible" class="reader-tts-panel" v-bind="attrs">
      <div class="reader-tts-panel__inner">
        <div class="reader-tts-panel__head">
          <div class="reader-tts-panel__copy">
            <strong>语音朗读</strong>
            <span class="reader-tts-panel__progress">{{ tts.progressLabel }}</span>
          </div>
          <button
            class="reader-tts-panel__close-icon"
            type="button"
            aria-label="收起"
            @click="emit('close')"
          >
            <el-icon :size="16"><CloseBold /></el-icon>
          </button>
        </div>
        <button
          v-if="tts.showNativeTtsSetupAction"
          class="reader-tts-panel__setup-btn"
          type="button"
          @click="tts.openNativeTtsSetup"
        >
          {{ tts.nativeTtsSetupLabel }}
        </button>
        <div v-if="tts.buffering" class="reader-tts-panel__buffer">
          <div class="reader-tts-panel__buffer-info">
            <span class="reader-tts-panel__buffer-label">正在缓冲…</span>
            <span class="reader-tts-panel__buffer-percent">{{ tts.bufferProgress }}%</span>
          </div>
          <div class="reader-tts-panel__buffer-bar">
            <div class="reader-tts-panel__buffer-fill" :style="{ width: `${tts.bufferProgress}%` }"></div>
          </div>
        </div>
        <MobileReaderTTSPlaybackControls :tts="tts" />
        <p v-if="tts.voicePanelOpen" class="reader-tts-panel__hint">{{ tts.compatibilityHint }}</p>
        <div v-if="tts.voicePanelOpen" class="reader-tts-panel__voice-panel">
          <div v-if="tts.hasOnlineVoices" class="reader-tts-panel__voice-group">
            <div class="reader-tts-panel__voice-group-title">在线音色 · 更动听</div>
            <div
              v-for="voice in tts.onlineVoiceOptionItems"
              :key="voice.value"
              class="reader-tts-panel__voice-row"
            >
              <button
                class="reader-tts-panel__voice-option"
                :class="{ active: tts.selectedVoiceName === voice.value }"
                type="button"
                @click="tts.chooseVoice(voice.value)"
              >
                <span class="reader-tts-panel__voice-title">{{ voice.title }}</span>
                <span class="reader-tts-panel__voice-detail">{{ voice.detail }}</span>
              </button>
              <button
                class="reader-tts-panel__voice-preview"
                :class="{ active: tts.voicePreviewing && tts.previewingVoiceName === voice.value }"
                type="button"
                @click="tts.previewVoice(voice.value)"
              >
                {{ tts.voicePreviewing && tts.previewingVoiceName === voice.value ? '试听中' : '试听' }}
              </button>
            </div>
          </div>
          <div v-if="tts.systemVoiceOptionItems.length > 0" class="reader-tts-panel__voice-group">
            <div class="reader-tts-panel__voice-group-title">系统音色</div>
            <div
              v-for="voice in tts.systemVoiceOptionItems"
              :key="voice.value"
              class="reader-tts-panel__voice-row"
            >
              <button
                class="reader-tts-panel__voice-option"
                :class="{ active: tts.selectedVoiceName === voice.value }"
                type="button"
                @click="tts.chooseVoice(voice.value)"
              >
                <span class="reader-tts-panel__voice-title">{{ voice.title }}</span>
                <span class="reader-tts-panel__voice-detail">{{ voice.detail }}</span>
              </button>
              <button
                class="reader-tts-panel__voice-preview"
                :class="{ active: tts.voicePreviewing && tts.previewingVoiceName === voice.value }"
                type="button"
                @click="tts.previewVoice(voice.value)"
              >
                {{ tts.voicePreviewing && tts.previewingVoiceName === voice.value ? '试听中' : '试听' }}
              </button>
            </div>
            <div class="reader-tts-panel__voice-row reader-tts-panel__voice-row--system">
              <button
                class="reader-tts-panel__voice-option"
                :class="{ active: !tts.selectedVoiceName }"
                type="button"
                @click="tts.chooseVoice('')"
              >
                <span class="reader-tts-panel__voice-title">系统默认</span>
                <span class="reader-tts-panel__voice-detail">跟随设备语音</span>
              </button>
              <button
                class="reader-tts-panel__voice-preview"
                :class="{ active: tts.voicePreviewing && tts.previewingVoiceName === '' }"
                type="button"
                @click="tts.previewVoice('')"
              >
                {{ tts.voicePreviewing && tts.previewingVoiceName === '' ? '试听中' : '试听' }}
              </button>
            </div>
          </div>
          <p v-if="tts.voiceOptionItems.length === 0" class="reader-tts-panel__voice-empty">
            正在读取音色列表，请稍候…
          </p>
        </div>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
/* 主题变量（由父组件注入）：
   --rtts-text / --rtts-muted / --rtts-line / --rtts-surface / --rtts-paper
   --rtts-accent-from / --rtts-accent-to / --rtts-accent-line
   --rtts-panel-width / --rtts-z */

.reader-tts-panel {
  position: fixed;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 84px);
  z-index: var(--rtts-z, 24);
  transform: translateX(-50%);
  width: var(--rtts-panel-width, min(calc(100% - 24px), 480px));
}

.reader-tts-panel__inner {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--rtts-line, rgba(148, 163, 184, 0.28));
  border-radius: 18px;
  background: var(--rtts-surface, #ffffff);
  backdrop-filter: blur(10px);
  box-shadow: 0 20px 42px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.58);
  max-height: min(58vh, 520px);
  overflow-y: auto;
}

.reader-tts-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.reader-tts-panel__copy {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.reader-tts-panel__copy strong {
  font-size: 14px;
  color: var(--rtts-text, #0f172a);
  white-space: nowrap;
}

.reader-tts-panel__progress {
  font-size: 12px;
  color: var(--rtts-muted, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reader-tts-panel__close-icon {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--rtts-text, #0f172a) 6%, transparent);
  color: var(--rtts-muted, #64748b);
  cursor: pointer;
}

.reader-tts-panel__close-icon:active {
  background: color-mix(in srgb, var(--rtts-text, #0f172a) 12%, transparent);
}

.reader-tts-panel__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--rtts-muted, #64748b);
}

.reader-tts-panel__setup-btn {
  height: 30px;
  border: 1px dashed var(--rtts-line, rgba(148, 163, 184, 0.28));
  border-radius: 8px;
  background: transparent;
  color: var(--rtts-muted, #64748b);
  font: inherit;
  font-size: 12px;
  padding: 0 10px;
  cursor: pointer;
}

.reader-tts-panel__buffer {
  display: grid;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--rtts-text, #0f172a) 4%, transparent);
}

.reader-tts-panel__buffer-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.reader-tts-panel__buffer-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--rtts-text, #0f172a);
}

.reader-tts-panel__buffer-percent {
  font-size: 12px;
  font-weight: 700;
  color: var(--rtts-accent-from, #f97316);
  font-variant-numeric: tabular-nums;
}

.reader-tts-panel__buffer-bar {
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--rtts-text, #0f172a) 10%, transparent);
  overflow: hidden;
}

.reader-tts-panel__buffer-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, var(--rtts-accent-from, #f97316), var(--rtts-accent-to, #fb7185));
  transition: width 0.2s ease;
}

.reader-tts-panel__voice-panel {
  display: grid;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--rtts-line, rgba(148, 163, 184, 0.28));
  border-radius: 10px;
  background: color-mix(in srgb, var(--rtts-paper, #ffffff) 94%, transparent);
}

.reader-tts-panel__voice-group {
  display: grid;
  gap: 6px;
}

.reader-tts-panel__voice-group + .reader-tts-panel__voice-group {
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px dashed var(--rtts-line, rgba(148, 163, 184, 0.28));
}

.reader-tts-panel__voice-group-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--rtts-accent-from, #f97316);
  letter-spacing: 0.02em;
}

.reader-tts-panel__voice-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}

.reader-tts-panel__voice-option {
  min-height: 32px;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 8px;
  background: color-mix(in srgb, var(--rtts-text, #0f172a) 5%, transparent);
  color: var(--rtts-text, #0f172a);
  text-align: left;
  font: inherit;
  font-size: 12px;
  padding: 6px 8px;
  display: grid;
  gap: 1px;
  align-content: center;
  cursor: pointer;
}

.reader-tts-panel__voice-option.active {
  border-color: var(--rtts-accent-line, rgba(249, 115, 22, 0.55));
  background: linear-gradient(135deg, var(--rtts-accent-from-soft, rgba(249, 115, 22, 0.14)), var(--rtts-accent-to-soft, rgba(251, 113, 133, 0.1)));
}

.reader-tts-panel__voice-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--rtts-text, #0f172a);
}

.reader-tts-panel__voice-detail {
  font-size: 11px;
  line-height: 1.4;
  color: var(--rtts-muted, #64748b);
}

.reader-tts-panel__voice-preview {
  min-width: 52px;
  min-height: 32px;
  border: 1px solid var(--rtts-line, rgba(148, 163, 184, 0.28));
  border-radius: 8px;
  background: color-mix(in srgb, var(--rtts-paper, #ffffff) 88%, transparent);
  color: var(--rtts-muted, #64748b);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  padding: 0 8px;
  cursor: pointer;
}

.reader-tts-panel__voice-preview.active {
  border-color: var(--rtts-accent-line, rgba(56, 189, 248, 0.48));
  color: var(--rtts-text, #0f172a);
}

.reader-tts-panel__voice-empty {
  margin: 4px 0 2px;
  font-size: 11px;
  color: var(--rtts-muted, #64748b);
}

.reader-tts-panel-enter-active,
.reader-tts-panel-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.reader-tts-panel-enter-from,
.reader-tts-panel-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}
</style>
