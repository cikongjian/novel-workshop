<script setup lang="ts">
import { computed } from 'vue';
import { Close, Microphone, RefreshRight, VideoPause, VideoPlay } from '@element-plus/icons-vue';

const props = withDefaults(defineProps<{
  playing: boolean;
  paused: boolean;
  progress: number;
  total: number;
  currentText: string;
  currentVoiceLabel?: string;
}>(), {
  currentVoiceLabel: '',
});

const emit = defineEmits<{
  pause: [];
  resume: [];
  restart: [];
  close: [];
}>();

const statusLabel = computed(() => {
  if (props.playing) return '朗读中';
  if (props.paused) return '已暂停';
  return '准备中';
});

const progressLabel = computed(() => {
  if (props.total <= 0) return '准备中';
  return `${Math.min(props.progress, props.total)} / ${props.total}`;
});
</script>

<template>
  <div class="client-tts-player">
    <div class="client-tts-player__body">
      <div class="client-tts-player__meta">
        <div class="client-tts-player__title">
          <el-icon :size="14"><Microphone /></el-icon>
          <span>客户端朗读</span>
        </div>
        <div class="client-tts-player__status">
          <span>{{ statusLabel }}</span>
          <span>{{ progressLabel }}</span>
          <span v-if="currentVoiceLabel">{{ currentVoiceLabel }}</span>
        </div>
      </div>

      <p class="client-tts-player__note">使用当前浏览器本机语音合成，不走服务器 TTS。</p>
      <p class="client-tts-player__text">{{ currentText || '正在准备朗读内容…' }}</p>
    </div>

    <div class="client-tts-player__actions">
      <el-button
        circle
        size="small"
        :icon="playing ? VideoPause : VideoPlay"
        :type="playing ? 'warning' : 'primary'"
        @click="playing ? emit('pause') : emit('resume')"
      />
      <el-button
        size="small"
        :icon="RefreshRight"
        @click="emit('restart')"
      >
        重新朗读
      </el-button>
      <el-button
        circle
        text
        size="small"
        :icon="Close"
        @click="emit('close')"
      />
    </div>
  </div>
</template>

<style scoped>
.client-tts-player {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--nw-border);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.98));
}

.client-tts-player__body {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 4px;
}

.client-tts-player__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.client-tts-player__title,
.client-tts-player__status,
.client-tts-player__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.client-tts-player__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.client-tts-player__status {
  flex-wrap: wrap;
  justify-content: flex-end;
  font-size: 12px;
  color: var(--nw-text-secondary);
}

.client-tts-player__note,
.client-tts-player__text {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
}

.client-tts-player__note {
  color: var(--nw-text-muted);
}

.client-tts-player__text {
  color: var(--nw-text-primary);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.client-tts-player__actions {
  flex-shrink: 0;
}

@media (max-width: 960px) {
  .client-tts-player {
    align-items: flex-start;
    flex-direction: column;
  }

  .client-tts-player__meta,
  .client-tts-player__actions {
    width: 100%;
  }

  .client-tts-player__meta {
    align-items: flex-start;
    flex-direction: column;
  }

  .client-tts-player__status {
    justify-content: flex-start;
  }
}
</style>
