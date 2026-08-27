<script setup lang="ts">
import { computed, type ShallowUnwrapRef } from 'vue';
import { Microphone, Odometer, RefreshRight, VideoPause, VideoPlay } from '@element-plus/icons-vue';
import type { useReaderTTS } from '../../composables/useReaderTTS';

type ReaderTTS = ShallowUnwrapRef<ReturnType<typeof useReaderTTS>>;

const props = defineProps<{
  tts: ReaderTTS;
}>();

const mainLabel = computed(() => {
  if (props.tts.speaking) return '暂停';
  if (props.tts.paused) return '继续';
  return '播放';
});

const mainDisabled = computed(() => !props.tts.ready && !props.tts.visible);

function replay(): void {
  void props.tts.play();
}

function toggleMain(): void {
  if (props.tts.visible) {
    props.tts.togglePause();
    return;
  }

  void props.tts.play();
}
</script>

<template>
  <div class="reader-tts-playback-controls" role="group" aria-label="听书播放控制">
    <button
      class="reader-tts-playback-controls__button reader-tts-playback-controls__button--setting reader-tts-playback-controls__button--rate"
      type="button"
      :aria-label="`切换语速，当前 ${tts.playbackRateLabel}`"
      :title="`语速 ${tts.playbackRateLabel}`"
      :disabled="!tts.ready && !tts.visible"
      @click="tts.cyclePlaybackRate"
    >
      <el-icon :size="17"><Odometer /></el-icon>
      <span>{{ tts.playbackRateLabel }}</span>
    </button>
    <button
      class="reader-tts-playback-controls__button reader-tts-playback-controls__button--side"
      type="button"
      aria-label="重读"
      title="重读"
      :disabled="!tts.ready"
      @click="replay"
    >
      <el-icon :size="18"><RefreshRight /></el-icon>
    </button>
    <button
      class="reader-tts-playback-controls__button reader-tts-playback-controls__button--main"
      type="button"
      :aria-label="mainLabel"
      :title="mainLabel"
      :disabled="mainDisabled"
      @click="toggleMain"
    >
      <el-icon :size="30">
        <VideoPause v-if="tts.speaking" />
        <VideoPlay v-else />
      </el-icon>
    </button>
    <button
      class="reader-tts-playback-controls__button reader-tts-playback-controls__button--side"
      type="button"
      aria-label="停止"
      title="停止"
      :disabled="!tts.visible"
      @click="tts.stop"
    >
      <span class="reader-tts-playback-controls__stop-icon" aria-hidden="true"></span>
    </button>
    <button
      class="reader-tts-playback-controls__button reader-tts-playback-controls__button--setting reader-tts-playback-controls__button--voice-setting"
      :class="{ 'is-active': tts.voicePanelOpen }"
      type="button"
      :aria-label="`选择音色，当前 ${tts.selectedVoiceLabel}`"
      :title="`音色 ${tts.selectedVoiceLabel}`"
      :disabled="!tts.canUseAnyTTS"
      @click="tts.toggleVoicePanel"
    >
      <el-icon :size="17"><Microphone /></el-icon>
    </button>
  </div>
</template>

<style scoped>
.reader-tts-playback-controls {
  display: grid;
  grid-template-columns: 46px 48px 68px 48px 46px;
  justify-content: center;
  align-items: center;
  gap: 9px;
  min-height: 72px;
  padding: 2px 0 0;
}

.reader-tts-playback-controls__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--rtts-line, rgba(148, 163, 184, 0.28));
  border-radius: 50%;
  color: var(--rtts-text, #0f172a);
  font: inherit;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease, opacity 0.16s ease;
}

.reader-tts-playback-controls__button--side {
  width: 48px;
  height: 48px;
  background: color-mix(in srgb, var(--rtts-paper, #ffffff) 90%, transparent);
}

.reader-tts-playback-controls__button--setting {
  width: 46px;
  height: 46px;
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  background: color-mix(in srgb, var(--rtts-paper, #ffffff) 90%, transparent);
  color: var(--rtts-muted, #64748b);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.reader-tts-playback-controls__button--voice-setting {
  gap: 0;
}

.reader-tts-playback-controls__button--setting.is-active {
  border-color: var(--rtts-accent-line, rgba(249, 115, 22, 0.55));
  background: linear-gradient(135deg, var(--rtts-accent-from-soft, rgba(249, 115, 22, 0.14)), var(--rtts-accent-to-soft, rgba(251, 113, 133, 0.1)));
  color: var(--rtts-accent-from, #f97316);
}

.reader-tts-playback-controls__button--main {
  width: 68px;
  height: 68px;
  border-color: transparent;
  background:
    radial-gradient(circle at 36% 24%, rgba(255, 255, 255, 0.42), transparent 38%),
    linear-gradient(135deg, var(--rtts-accent-from, #f97316), var(--rtts-accent-to, #fb7185));
  color: #fff7ed;
  box-shadow: 0 14px 28px color-mix(in srgb, var(--rtts-accent-from, #f97316) 28%, transparent);
}

.reader-tts-playback-controls__button:active:not(:disabled) {
  transform: scale(0.96);
}

.reader-tts-playback-controls__button:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.reader-tts-playback-controls__stop-icon {
  width: 15px;
  height: 15px;
  border-radius: 4px;
  background: currentColor;
}

@media (max-width: 360px) {
  .reader-tts-playback-controls {
    grid-template-columns: 40px 42px 60px 42px 40px;
    gap: 7px;
    min-height: 64px;
  }

  .reader-tts-playback-controls__button--side {
    width: 42px;
    height: 42px;
  }

  .reader-tts-playback-controls__button--setting {
    width: 40px;
    height: 40px;
    font-size: 9px;
  }

  .reader-tts-playback-controls__button--main {
    width: 60px;
    height: 60px;
  }

}
</style>
