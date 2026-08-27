<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Close, Microphone, RefreshRight, VideoPause, VideoPlay } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { previewVoice } from '../api';
import type { TTSSegmentData } from '../api';

interface QueueItem {
  segment: TTSSegmentData;
  audio: string; // base64
  duration: number;
  blobUrl?: string;
}

const props = defineProps<{
  synthesizing: boolean;
  progressText: string;
}>();

const emit = defineEmits<{
  highlight: [paragraphIndex: number];
  close: [];
  regenerate: [];
}>();

const queue = ref<QueueItem[]>([]);
const currentIdx = ref(-1);
const playing = ref(false);
const audio = ref<HTMLAudioElement | null>(null);
const playbackRate = ref(1);
const lyricsRef = ref<HTMLDivElement | null>(null);
const selectedSegmentIndexes = ref<number[]>([]);
const mergeRegenerating = ref(false);
const MERGE_PREVIEW_MAX_TEXT_LENGTH = 2000;

const currentItem = computed(() => {
  if (currentIdx.value < 0 || currentIdx.value >= queue.value.length) return null;
  return queue.value[currentIdx.value];
});

const currentSpeakerLabel = computed(() => {
  const item = currentItem.value;
  if (!item) return '';
  if (item.segment.type === 'narration') return '旁白';
  return item.segment.speaker || '对话';
});

const currentTypeLabel = computed(() => {
  const item = currentItem.value;
  if (!item) return '';
  return item.segment.type === 'dialogue' ? '对话' : '旁白';
});

const currentTypeTag = computed(() => {
  const item = currentItem.value;
  if (!item) return 'info';
  return item.segment.type === 'dialogue' ? 'success' : 'info';
});

const playProgress = computed(() => {
  if (queue.value.length === 0) return '';
  return `${Math.max(0, currentIdx.value + 1)} / ${queue.value.length}`;
});

const selectedIndexSet = computed(() => new Set(selectedSegmentIndexes.value));

const sortedSelectedIndexes = computed(() => (
  [...selectedSegmentIndexes.value].sort((a, b) => a - b)
));

function isContinuousSelection(indexes: number[]): boolean {
  if (indexes.length <= 1) return true;
  for (let i = 1; i < indexes.length; i += 1) {
    if (indexes[i] !== indexes[i - 1] + 1) return false;
  }
  return true;
}

const mergeDisabledReason = computed(() => {
  if (props.synthesizing) return '正在合成中，请稍后再试';
  if (mergeRegenerating.value) return '正在重生成，请稍后';
  if (sortedSelectedIndexes.value.length < 2) return '至少勾选 2 句';
  if (!isContinuousSelection(sortedSelectedIndexes.value)) return '请勾选连续句子';
  return '';
});

const canMergeRegenerate = computed(() => mergeDisabledReason.value.length === 0);

function mergeTexts(items: QueueItem[]): string {
  let merged = '';
  for (const item of items) {
    const piece = item.segment.text.trim();
    if (!piece) continue;
    if (!merged) {
      merged = piece;
      continue;
    }
    if (!/[。！？!?；;，,、：:“”"'’》」』）\]\}]+$/.test(merged)) {
      merged += '，';
    }
    merged += piece.replace(/^[，。！？!?；;、：:“”"'’《「『（\[\{]+/, '');
  }
  return merged;
}

function clearSelectedSegments() {
  selectedSegmentIndexes.value = [];
}

function selectAllSegments() {
  selectedSegmentIndexes.value = queue.value.map((_item, idx) => idx);
}

function toggleSegmentSelection(idx: number, checked: boolean) {
  const current = new Set(selectedSegmentIndexes.value);
  if (checked) {
    current.add(idx);
  } else {
    current.delete(idx);
  }
  selectedSegmentIndexes.value = [...current];
}

function resolveMergedVoice(items: QueueItem[]): string {
  const voices = Array.from(new Set(items.map(item => item.segment.voice).filter(Boolean)));
  if (voices.length === 0) return 'zh-CN-YunyangNeural';
  if (voices.length > 1) {
    ElMessage.warning('选中句子包含多个音色，将按第一句音色重生成');
  }
  const first = voices[0];
  if (first.startsWith('qwen3-clone')) {
    ElMessage.warning('克隆音色暂不支持局部重生成，已自动降级为 Uncle_Fu（男声）');
    return 'Uncle_Fu';
  }
  return first;
}

async function mergeAndRegenerateSelected() {
  const indexes = sortedSelectedIndexes.value;
  if (indexes.length < 2) {
    ElMessage.warning('请至少勾选 2 句再合并');
    return;
  }
  if (!isContinuousSelection(indexes)) {
    ElMessage.warning('请先勾选连续句子后再合并');
    return;
  }

  const selectedItems = indexes.map(idx => queue.value[idx]).filter(Boolean);
  if (selectedItems.length < 2) {
    ElMessage.warning('选中内容无效，请重试');
    return;
  }

  const mergedText = mergeTexts(selectedItems);
  if (!mergedText) {
    ElMessage.warning('合并后文本为空，无法重生成');
    return;
  }
  if (mergedText.length > MERGE_PREVIEW_MAX_TEXT_LENGTH) {
    ElMessage.warning(`合并后文本过长（>${MERGE_PREVIEW_MAX_TEXT_LENGTH}字），请减少勾选句数`);
    return;
  }

  const firstIdx = indexes[0];
  const lastIdx = indexes[indexes.length - 1];
  const targetVoice = resolveMergedVoice(selectedItems);
  const allDialogue = selectedItems.every(item => item.segment.type === 'dialogue');
  const firstSpeaker = selectedItems[0].segment.speaker;
  const singleSpeaker = allDialogue && selectedItems.every(item => item.segment.speaker === firstSpeaker);

  mergeRegenerating.value = true;
  try {
    const { audio: mergedAudio, duration } = await previewVoice({
      voice: targetVoice,
      text: mergedText,
    });

    stop();
    const removedItems = queue.value.slice(firstIdx, lastIdx + 1);
    for (const item of removedItems) {
      if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
    }

    const mergedSegment: TTSSegmentData = {
      text: mergedText,
      type: allDialogue ? 'dialogue' : 'narration',
      speaker: singleSpeaker ? firstSpeaker : undefined,
      voice: targetVoice,
      paragraphIndex: selectedItems[0].segment.paragraphIndex,
    };

    queue.value.splice(firstIdx, indexes.length, {
      segment: mergedSegment,
      audio: mergedAudio,
      duration,
    });
    selectedSegmentIndexes.value = [firstIdx];
    playNext(firstIdx);
    ElMessage.success(`已合并 ${indexes.length} 句并完成重生成`);
  } catch (err) {
    const message = err instanceof Error ? err.message : '合并重生成失败';
    ElMessage.error(message || '合并重生成失败');
  } finally {
    mergeRegenerating.value = false;
  }
}

function pushSegment(segment: TTSSegmentData, audioBase64: string, duration: number) {
  const item: QueueItem = { segment, audio: audioBase64, duration };
  queue.value.push(item);
  if (!playing.value && queue.value.length === 1) {
    playNext(0);
  }
}

function scrollToCurrentLyric() {
  nextTick(() => {
    const container = lyricsRef.value;
    if (!container) return;
    const activeEl = container.querySelector('.lyric-line.active') as HTMLElement | null;
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function playNext(idx: number) {
  if (idx >= queue.value.length) {
    if (props.synthesizing) {
      currentIdx.value = idx;
      return;
    }
    playing.value = false;
    currentIdx.value = -1;
    emit('highlight', -1);
    return;
  }

  const item = queue.value[idx];
  currentIdx.value = idx;

  if (!item.blobUrl) {
    const byteChars = atob(item.audio);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i += 1) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: 'audio/mp3' });
    item.blobUrl = URL.createObjectURL(blob);
  }

  if (audio.value) {
    audio.value.pause();
    audio.value.removeAttribute('src');
  }

  const el = new Audio(item.blobUrl);
  el.playbackRate = playbackRate.value;
  audio.value = el;

  el.addEventListener('ended', () => {
    playNext(idx + 1);
  });
  el.addEventListener('error', () => {
    playNext(idx + 1);
  });

  playing.value = true;
  void el.play().catch(() => {
    playNext(idx + 1);
  });
  emit('highlight', item.segment.paragraphIndex);
  scrollToCurrentLyric();
}

watch(() => queue.value.length, (newLen) => {
  if (playing.value && currentIdx.value >= 0 && currentIdx.value < newLen) return;
  if (currentIdx.value >= 0 && currentIdx.value < newLen && !audio.value) {
    playNext(currentIdx.value);
  }
});

watch(() => props.synthesizing, (val) => {
  if (!val && currentIdx.value >= queue.value.length) {
    playing.value = false;
    currentIdx.value = -1;
    emit('highlight', -1);
  }
});

function togglePlay() {
  if (!audio.value) {
    if (queue.value.length > 0) {
      const startIdx = currentIdx.value >= 0 ? currentIdx.value : 0;
      playNext(startIdx);
    }
    return;
  }

  if (playing.value) {
    audio.value.pause();
    playing.value = false;
    return;
  }
  void audio.value.play().then(() => {
    playing.value = true;
  }).catch(() => {
    playing.value = false;
  });
}

function stop() {
  if (audio.value) {
    audio.value.pause();
    audio.value.removeAttribute('src');
    audio.value = null;
  }
  playing.value = false;
  currentIdx.value = -1;
  emit('highlight', -1);
}

function jumpToSegment(idx: number) {
  if (idx < 0 || idx >= queue.value.length) return;
  if (audio.value) {
    audio.value.pause();
    audio.value.removeAttribute('src');
    audio.value = null;
  }
  playNext(idx);
}

function onRateChange(val: number) {
  playbackRate.value = val;
  if (audio.value) {
    audio.value.playbackRate = val;
  }
}

function handleRegenerate() {
  reset();
  emit('regenerate');
}

function handleClose() {
  stop();
  selectedSegmentIndexes.value = [];
  for (const item of queue.value) {
    if (item.blobUrl) {
      URL.revokeObjectURL(item.blobUrl);
      item.blobUrl = undefined;
    }
  }
  emit('close');
}

function reset() {
  stop();
  selectedSegmentIndexes.value = [];
  for (const item of queue.value) {
    if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
  }
  queue.value = [];
}

function startPlayback(fromBeginning = true) {
  if (queue.value.length === 0) return;
  if (fromBeginning) {
    stop();
    playNext(0);
    return;
  }
  togglePlay();
}

function loadQueue(
  items: Array<{ segment: TTSSegmentData; audio: string; duration: number }>,
  autoPlay = true,
) {
  stop();
  selectedSegmentIndexes.value = [];
  for (const item of queue.value) {
    if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
  }
  queue.value = items.map(it => ({ segment: it.segment, audio: it.audio, duration: it.duration }));
  if (autoPlay && queue.value.length > 0) {
    playNext(0);
  }
}

onBeforeUnmount(() => {
  if (audio.value) {
    audio.value.pause();
    audio.value.removeAttribute('src');
  }
  for (const item of queue.value) {
    if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
  }
});

defineExpose({ pushSegment, reset, startPlayback, loadQueue });
</script>

<template>
  <div class="tts-player-wrapper">
    <div v-if="queue.length > 0" ref="lyricsRef" class="lyrics-panel">
      <div v-if="queue.length > 1" class="lyric-select-toolbar">
        <div class="lyric-select-info">
          <span>已选 {{ sortedSelectedIndexes.length }} 句</span>
          <span class="lyric-select-helper">仅支持连续句子合并</span>
        </div>
        <div class="lyric-select-actions">
          <el-button text size="small" @click="selectAllSegments">全选</el-button>
          <el-button
            text
            size="small"
            :disabled="sortedSelectedIndexes.length === 0"
            @click="clearSelectedSegments"
          >
            清空
          </el-button>
          <el-button
            size="small"
            type="primary"
            :title="mergeDisabledReason || '将选中句子合并成一句并重新生成音频'"
            :disabled="!canMergeRegenerate"
            :loading="mergeRegenerating"
            @click="mergeAndRegenerateSelected"
          >
            合并重生成
          </el-button>
        </div>
      </div>
      <div
        v-for="(item, idx) in queue"
        :key="idx"
        class="lyric-line"
        :class="{
          active: idx === currentIdx,
          selected: selectedIndexSet.has(idx),
          played: idx < currentIdx,
          dialogue: item.segment.type === 'dialogue',
          narration: item.segment.type === 'narration',
        }"
        @click="jumpToSegment(idx)"
      >
        <el-checkbox
          class="lyric-select-checkbox"
          :model-value="selectedIndexSet.has(idx)"
          @change="(value: unknown) => toggleSegmentSelection(idx, Boolean(value))"
          @click.stop
        />
        <span class="lyric-tag">
          {{ item.segment.type === 'dialogue' ? (item.segment.speaker || '对话') : '旁白' }}
        </span>
        <span class="lyric-text">{{ item.segment.text }}</span>
      </div>
      <div v-if="synthesizing" class="lyric-loading">
        合成中 {{ progressText }}...
      </div>
    </div>

    <div class="tts-player">
      <div class="player-left">
        <el-button
          circle
          :icon="playing ? VideoPause : VideoPlay"
          :type="playing ? 'warning' : 'primary'"
          size="small"
          @click="togglePlay"
        />
        <el-button
          circle
          text
          size="small"
          title="停止播放"
          @click="stop"
        >
          ■
        </el-button>
      </div>

      <div class="player-center">
        <div class="speaker-info">
          <template v-if="currentItem">
            <el-icon :size="14"><Microphone /></el-icon>
            <span class="speaker-name">{{ currentSpeakerLabel }}</span>
            <el-tag :type="currentTypeTag" size="small" effect="plain">
              {{ currentTypeLabel }}
            </el-tag>
          </template>
          <template v-else-if="synthesizing">
            <span class="speaker-name">正在合成语音...</span>
          </template>
          <template v-else>
            <span class="speaker-name">准备播放</span>
          </template>
        </div>

        <div class="progress-row">
          <span class="progress-label">{{ playProgress }}</span>
          <el-progress
            :percentage="queue.length > 0 ? ((currentIdx + 1) / queue.length) * 100 : 0"
            :show-text="false"
            :stroke-width="6"
            class="progress-bar"
          />
          <span v-if="synthesizing" class="synth-status">合成中 {{ progressText }}</span>
          <span v-else-if="queue.length > 0" class="synth-status">已就绪</span>
        </div>
      </div>

      <div class="player-right">
        <el-select
          :model-value="playbackRate"
          size="small"
          style="width: 80px"
          @change="onRateChange"
        >
          <el-option :value="0.5" label="0.5x" />
          <el-option :value="0.75" label="0.75x" />
          <el-option :value="1" label="1.0x" />
          <el-option :value="1.25" label="1.25x" />
          <el-option :value="1.5" label="1.5x" />
          <el-option :value="2" label="2.0x" />
        </el-select>

        <el-button
          :icon="RefreshRight"
          size="small"
          title="清理缓存并重新合成当前章节"
          :loading="synthesizing"
          @click="handleRegenerate"
        >
          重新合成
        </el-button>

        <el-button
          circle
          text
          :icon="Close"
          size="small"
          @click="handleClose"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.tts-player-wrapper {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--nw-border);
  background: var(--nw-bg-secondary, #f8f9fa);
}

.lyrics-panel {
  max-height: 240px;
  overflow-y: auto;
  padding: 8px 12px;
  scroll-behavior: smooth;
}

.lyric-select-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 2px;
}

.lyric-select-info {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--nw-text-secondary, #666);
}

.lyric-select-helper {
  font-size: 11px;
  color: var(--nw-text-muted, #909399);
}

.lyric-select-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.lyric-select-actions :deep(.el-button.is-text) {
  min-height: 24px;
  padding: 0 8px;
  font-weight: 600;
}

.lyric-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  line-height: 1.6;
  color: var(--nw-text-muted, #999);
}

.lyric-line:hover {
  background: rgba(99, 102, 241, 0.06);
}

.lyric-line.active {
  color: var(--nw-text-primary, #333);
  background: rgba(99, 102, 241, 0.1);
  font-weight: 500;
}

.lyric-line.selected {
  background: rgba(64, 158, 255, 0.09);
}

.lyric-line.active.dialogue {
  border-left-color: var(--el-color-success);
}

.lyric-line.active.narration {
  border-left-color: var(--el-color-info);
}

.lyric-line.played {
  color: var(--nw-text-muted, #bbb);
  opacity: 0.6;
}

.lyric-tag {
  flex-shrink: 0;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.08);
  color: var(--nw-text-secondary, #666);
  white-space: nowrap;
  margin-top: 2px;
}

.lyric-select-checkbox {
  flex-shrink: 0;
  margin-top: 2px;
}

.lyric-select-checkbox :deep(.el-checkbox__label) {
  display: none;
}

.lyric-line.active .lyric-tag {
  background: rgba(99, 102, 241, 0.15);
  color: var(--nw-accent-start, #6366f1);
}

.lyric-text {
  flex: 1;
  word-break: break-all;
}

.lyric-loading {
  text-align: center;
  padding: 8px;
  font-size: 12px;
  color: var(--nw-text-muted, #999);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.tts-player {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--nw-border);
}

.player-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.player-center {
  flex: 1;
  min-width: 0;
}

.speaker-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 4px;
}

.speaker-name {
  font-weight: 500;
  color: var(--nw-text-primary);
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-label {
  font-size: 11px;
  color: var(--nw-text-muted);
  white-space: nowrap;
  min-width: 40px;
}

.progress-bar {
  flex: 1;
}

.synth-status {
  font-size: 11px;
  color: var(--nw-text-muted);
  white-space: nowrap;
}

.player-right {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
