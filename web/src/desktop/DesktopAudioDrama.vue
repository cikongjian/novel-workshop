<script setup lang="ts">
/**
 * 桌面端·AI 广播剧（有声书）
 * 复用 streamTTSSynthesize / fetchAudiobookPage / clearAllTTSCache / fetchCharacters。
 * 左侧：章节列表 + 角色声音；右侧：播放器 + 剧稿同步展示。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  streamTTSSynthesize,
  fetchAudiobookPage,
  clearAllTTSCache,
  designAllVoices,
  previewDesignedVoice,
  type TTSSegmentData,
  type TTSStreamEvent,
  type AudiobookEntry,
} from '../api/tts';
import { fetchCharacters, type CharacterProfile } from '../api/characters';
import { fetchNovel, getCoverUrl } from '../api/novels';
import { extractApiErrorMessage } from '../api/errors';
import StateView from '../components/shared/StateView.vue';
import Icon from '../components/shared/Icon.vue';
import Modal from '../components/shared/Modal.vue';

const props = defineProps<{ novelId: string }>();

// ===== Novel info =====
const novelTitle = ref('');
const novelCover = ref('');
const authorName = ref('');
const chapterCount = ref(0);
const novelLoading = ref(true);

// ===== Audiobook catalog =====
const audioEntries = ref<AudiobookEntry[]>([]);
const catalogLoading = ref(false);
const catalogTotal = ref(0);

const synthesizedCount = computed(() => audioEntries.value.length);
const synthesizedDurationMs = computed(() =>
  audioEntries.value.reduce((sum, e) => sum + e.totalDuration, 0)
);

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatChapterTitle(entry: AudiobookEntry | number): string {
  if (typeof entry === 'number') return `第 ${entry} 章`;
  return entry.title || `第 ${entry.chapterNumber} 章`;
}

function isChapterSynthesized(chapterNumber: number): boolean {
  return audioEntries.value.some((e) => e.chapterNumber === chapterNumber);
}

function getChapterEntry(chapterNumber: number): AudiobookEntry | undefined {
  return audioEntries.value.find((e) => e.chapterNumber === chapterNumber);
}

async function loadCatalog() {
  if (!props.novelId) return;
  catalogLoading.value = true;
  try {
    const result = await fetchAudiobookPage(props.novelId, { page: 1, pageSize: 200, order: 'asc' });
    audioEntries.value = result.entries;
    catalogTotal.value = result.total;
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '加载有声书目录失败'));
  } finally {
    catalogLoading.value = false;
  }
}

// ===== Player state =====
const playingChapter = ref<number | null>(null);
const playing = ref(false);
const synthesizing = ref(false);
const synthProgress = ref('');
const playbackRate = ref(1);
const autoNext = ref(true);

const segments = ref<Array<{ segment: TTSSegmentData; audio: string; duration: number; blobUrl?: string }>>([]);
const currentSegIdx = ref(-1);
let audioEl: HTMLAudioElement | null = null;
let abortTTS: (() => void) | null = null;

const currentChapterEntry = computed(() =>
  playingChapter.value ? getChapterEntry(playingChapter.value) : null
);

const currentSegment = computed(() =>
  currentSegIdx.value >= 0 && currentSegIdx.value < segments.value.length
    ? segments.value[currentSegIdx.value].segment
    : null
);

const progressPercent = computed(() => {
  if (segments.value.length === 0) return 0;
  return Math.round(((currentSegIdx.value + 1) / segments.value.length) * 100);
});

function stopPlayback() {
  if (abortTTS) {
    abortTTS();
    abortTTS = null;
  }
  if (audioEl) {
    audioEl.pause();
    audioEl = null;
  }
  for (const item of segments.value) {
    if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
  }
  segments.value = [];
  currentSegIdx.value = -1;
  playing.value = false;
  synthesizing.value = false;
  synthProgress.value = '';
  playingChapter.value = null;
}

function playSegment(idx: number) {
  if (idx < 0 || idx >= segments.value.length) {
    playing.value = false;
    currentSegIdx.value = -1;
    if (autoNext.value) void playNextChapter();
    return;
  }
  currentSegIdx.value = idx;
  const item = segments.value[idx];
  if (!item.blobUrl) {
    const binary = atob(item.audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    item.blobUrl = URL.createObjectURL(blob);
  }
  const el = new Audio(item.blobUrl);
  el.playbackRate = playbackRate.value;
  el.onended = () => playSegment(idx + 1);
  el.onerror = () => playSegment(idx + 1);
  audioEl = el;
  el.play().catch(() => {});
  playing.value = true;
}

function playChapter(chapterNumber: number) {
  stopPlayback();
  playingChapter.value = chapterNumber;
  synthesizing.value = true;
  synthProgress.value = '准备中…';

  abortTTS = streamTTSSynthesize(
    props.novelId,
    chapterNumber,
    (event: TTSStreamEvent) => {
      if (event.type === 'segment') {
        segments.value.push({ segment: event.segment, audio: event.audio, duration: event.duration });
        synthProgress.value = `${event.index + 1} / ${event.total}`;
        if (segments.value.length === 1) playSegment(0);
      } else if (event.type === 'done') {
        synthesizing.value = false;
        synthProgress.value = '';
        void loadCatalog();
      } else if (event.type === 'error') {
        synthesizing.value = false;
        ElMessage.error(`合成失败: ${event.message}`);
      }
    },
  );
}

async function playNextChapter() {
  if (!playingChapter.value) return;
  const currentIdx = audioEntries.value.findIndex(
    (e) => e.chapterNumber === playingChapter.value
  );
  if (currentIdx >= 0 && currentIdx < audioEntries.value.length - 1) {
    playChapter(audioEntries.value[currentIdx + 1].chapterNumber);
    return;
  }
  stopPlayback();
  ElMessage.info('全部章节播放完毕');
}

function playPrevChapter() {
  if (!playingChapter.value) return;
  const currentIdx = audioEntries.value.findIndex(
    (e) => e.chapterNumber === playingChapter.value
  );
  if (currentIdx > 0) {
    playChapter(audioEntries.value[currentIdx - 1].chapterNumber);
  }
}

function togglePause() {
  if (!audioEl) return;
  if (playing.value) {
    audioEl.pause();
    playing.value = false;
  } else {
    audioEl.play().catch(() => {});
    playing.value = true;
  }
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];
function setSpeed(speed: number) {
  playbackRate.value = speed;
  if (audioEl) audioEl.playbackRate = speed;
}

// ===== Characters =====
const characters = ref<CharacterProfile[]>([]);
const charactersLoading = ref(false);
const previewingCharId = ref<string | null>(null);
const previewLoading = ref(false);
let previewAudioEl: HTMLAudioElement | null = null;

async function loadCharacters() {
  if (!props.novelId) return;
  charactersLoading.value = true;
  try {
    const result = await fetchCharacters(props.novelId);
    characters.value = result || [];
  } catch {
    // 角色列表加载失败不影响主功能
  } finally {
    charactersLoading.value = false;
  }
}

function getCharAvatar(char: CharacterProfile): string {
  if (!char.portraitImagePath) return '';
  return `/api/novels/${props.novelId}/characters/${char.id}/portrait?w=120`;
}

function getCharVoiceLabel(char: CharacterProfile): string {
  if (char.voiceInstruct) return char.voiceInstruct.slice(0, 16);
  if (char.ttsVoice) return char.ttsVoice;
  return '未设置声音';
}

async function playCharacterVoice(char: CharacterProfile) {
  if (previewingCharId.value === char.id) {
    if (previewAudioEl) {
      previewAudioEl.pause();
      previewAudioEl = null;
    }
    previewingCharId.value = null;
    return;
  }
  if (previewAudioEl) {
    previewAudioEl.pause();
    previewAudioEl = null;
  }
  previewingCharId.value = char.id;
  previewLoading.value = true;
  try {
    const result = await previewDesignedVoice(props.novelId, char.id, '你好，我是' + char.name);
    const binary = atob(result.audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    previewAudioEl = new Audio(url);
    previewAudioEl.onended = () => {
      previewingCharId.value = null;
      previewAudioEl = null;
      URL.revokeObjectURL(url);
    };
    previewAudioEl.play().catch(() => {});
  } catch {
    ElMessage.info('角色试听暂不可用');
    previewingCharId.value = null;
  } finally {
    previewLoading.value = false;
  }
}

// ===== 批量设计声音 =====
const designingVoices = ref(false);
async function handleDesignAllVoices() {
  if (designingVoices.value) return;
  designingVoices.value = true;
  try {
    const result = await designAllVoices(props.novelId, false);
    ElMessage.success(result.message || `已设计 ${result.updated} 个角色声音`);
    await loadCharacters();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '设计失败'));
  } finally {
    designingVoices.value = false;
  }
}

// ===== 清空所有合成 =====
async function handleClearAll() {
  try {
    await ElMessageBox.confirm(
      '确定要清空所有已合成的音频吗？此操作不可恢复。',
      '清空所有合成',
      {
        confirmButtonText: '确定清空',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );
  } catch {
    return;
  }
  try {
    stopPlayback();
    const result = await clearAllTTSCache(props.novelId);
    ElMessage.success(result.message || '已清空所有合成');
    void loadCatalog();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '清空失败'));
  }
}

// ===== 播放设置弹窗 =====
const settingsVisible = ref(false);
const sleepTimerMinutes = ref<number | null>(null);
let sleepTimer: ReturnType<typeof setTimeout> | null = null;

const sleepTimerOptions = [
  { label: '不开启', value: null },
  { label: '15 分钟', value: 15 },
  { label: '30 分钟', value: 30 },
  { label: '60 分钟', value: 60 },
];

function setSleepTimer(minutes: number | null) {
  sleepTimerMinutes.value = minutes;
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
  if (minutes && minutes > 0) {
    sleepTimer = setTimeout(() => {
      if (playing.value) {
        togglePause();
      }
      ElMessage.info('定时关闭已触发');
      sleepTimerMinutes.value = null;
    }, minutes * 60 * 1000);
    ElMessage.success(`已设置 ${minutes} 分钟后停止播放`);
  }
}

// ===== Init =====
async function loadNovelInfo() {
  if (!props.novelId) return;
  novelLoading.value = true;
  try {
    const info = await fetchNovel(props.novelId);
    novelTitle.value = info.title || '';
    novelCover.value = info.coverImage
      ? getCoverUrl(info.id, info.coverImage || info.updatedAt || info.createdAt, 200)
      : '';
    authorName.value = info.ownerName || '';
    chapterCount.value = info.chapterCount || 0;
  } catch (err) {
    console.error('[AudioDrama] 加载小说信息失败', err);
  } finally {
    novelLoading.value = false;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

watch(
  () => props.novelId,
  () => {
    stopPlayback();
    audioEntries.value = [];
    void loadNovelInfo();
    void loadCatalog();
    void loadCharacters();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  stopPlayback();
  if (previewAudioEl) {
    previewAudioEl.pause();
    previewAudioEl = null;
  }
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
});
</script>

<template>
  <div class="desktop-audio-drama">
    <StateView :loading="novelLoading">
      <!-- 顶部作品信息 -->
      <div class="nw-panel ad-header">
        <div class="ad-header__cover">
          <img v-if="novelCover" :src="novelCover" :alt="novelTitle" />
          <div v-else class="ad-header__cover-fallback">{{ novelTitle ? novelTitle.slice(0, 2) : '书' }}</div>
        </div>
        <div class="ad-header__meta">
          <div class="ad-header__kicker">
            <Icon name="headset" :size="14" /> AI 广播剧
          </div>
          <h1 class="ad-header__title">{{ novelTitle || '加载中…' }}</h1>
          <div class="ad-header__author">{{ authorName }}</div>
          <div class="ad-header__stats">
            <div class="ad-stat">
              <strong>{{ synthesizedCount }}</strong>
              <span>/ {{ chapterCount || '—' }} 章已合成</span>
            </div>
            <div class="ad-stat" v-if="synthesizedDurationMs > 0">
              <strong>{{ formatDuration(synthesizedDurationMs) }}</strong>
              <span>总时长</span>
            </div>
          </div>
          <div class="ad-header__actions">
            <button
              v-if="audioEntries.length > 0"
              class="desktop-btn desktop-btn--primary"
              @click="playChapter(audioEntries[0].chapterNumber)"
            >
              <Icon name="play" :size="16" /> 从第 1 章开始
            </button>
            <button
              v-else
              class="desktop-btn desktop-btn--primary"
              :disabled="catalogLoading"
              @click="playChapter(1)"
            >
              <Icon name="sparkles" :size="16" /> 立即生成第 1 章
            </button>
            <button class="desktop-btn" @click="settingsVisible = true">
              <Icon name="settings" :size="16" /> 播放设置
            </button>
            <button class="desktop-btn desktop-btn--danger-ghost" @click="handleClearAll">
              <Icon name="trash" :size="16" /> 清空所有
            </button>
          </div>
        </div>
      </div>

      <div class="ad-main-layout">
        <!-- 左侧：章节列表 + 角色 -->
        <div class="ad-left-col">
          <!-- 章节列表 -->
          <div class="nw-panel">
            <div class="nw-panel__head">
              <h2 class="nw-panel__title">章节列表 <span class="desktop-section-count">{{ synthesizedCount }}</span></h2>
            </div>

            <div v-loading="catalogLoading" class="ad-chapter-list">
              <div v-if="!catalogLoading && audioEntries.length === 0" class="ad-empty">
                还没有合成的章节，点击上方按钮开始生成
              </div>

              <button
                v-for="entry in audioEntries"
                :key="entry.chapterNumber"
                class="ad-chapter-item"
                :class="{
                  'is-active': playingChapter === entry.chapterNumber,
                  'is-synthesizing': synthesizing && playingChapter === entry.chapterNumber,
                }"
                type="button"
                @click="playChapter(entry.chapterNumber)"
              >
                <span class="ad-chapter-item__idx">{{ entry.chapterNumber }}</span>
                <div class="ad-chapter-item__body">
                  <span class="ad-chapter-item__title">{{ entry.title }}</span>
                  <div class="ad-chapter-item__meta">
                    <span>{{ formatDuration(entry.totalDuration) }}</span>
                    <span>·</span>
                    <span>{{ entry.segmentCount }} 段</span>
                    <span>·</span>
                    <span>{{ formatBytes(entry.fileSize) }}</span>
                  </div>
                </div>
                <span
                  v-if="synthesizing && playingChapter === entry.chapterNumber"
                  class="ad-chapter-item__status is-synthesizing"
                >
                  合成中 {{ synthProgress }}
                </span>
                <span v-else class="ad-chapter-item__status is-ready">
                  <Icon name="check" :size="12" /> 已合成
                </span>
              </button>

              <!-- 下一章待合成入口 -->
              <button
                v-if="audioEntries.length > 0 && chapterCount > audioEntries.length"
                key="pending-next"
                class="ad-chapter-item is-pending"
                type="button"
                @click="playChapter(audioEntries[audioEntries.length - 1].chapterNumber + 1)"
              >
                <span class="ad-chapter-item__idx">
                  {{ audioEntries[audioEntries.length - 1].chapterNumber + 1 }}
                </span>
                <div class="ad-chapter-item__body">
                  <span class="ad-chapter-item__title">下一章 · 点击生成</span>
                  <div class="ad-chapter-item__meta">
                    <span>未合成</span>
                  </div>
                </div>
                <span class="ad-chapter-item__status">
                  <Icon name="plus" :size="12" /> 待合成
                </span>
              </button>
            </div>
          </div>

          <!-- 角色声音 -->
          <div class="nw-panel">
            <div class="nw-panel__head">
              <h2 class="nw-panel__title">角色声音 <span class="desktop-section-count">{{ characters.length }}</span></h2>
              <button
                class="desktop-btn desktop-btn--sm"
                :disabled="designingVoices || characters.length === 0"
                @click="handleDesignAllVoices"
              >
                <Icon name="sparkles" :size="12" /> {{ designingVoices ? '设计中…' : '批量设计' }}
              </button>
            </div>

            <div v-loading="charactersLoading" class="ad-voice-grid">
              <div v-if="!charactersLoading && characters.length === 0" class="ad-empty" style="grid-column: 1 / -1;">
                暂无角色信息
              </div>

              <div
                v-for="char in characters"
                :key="char.id"
                class="ad-voice-card"
                :class="{ 'is-playing': previewingCharId === char.id }"
              >
                <div class="ad-voice-card__avatar">
                  <img v-if="getCharAvatar(char)" :src="getCharAvatar(char)" :alt="char.name" />
                  <span v-else>{{ char.name?.[0] || '?' }}</span>
                </div>
                <div class="ad-voice-card__body">
                  <div class="ad-voice-card__name">
                    {{ char.name }}
                    <span v-if="char.role" class="ad-voice-card__role">
                      {{ char.role === 'protagonist' ? '主角' : char.role === 'antagonist' ? '反派' : '配角' }}
                    </span>
                  </div>
                  <div class="ad-voice-card__voice">
                    <Icon name="headset" :size="11" />
                    {{ getCharVoiceLabel(char) }}
                  </div>
                </div>
                <button
                  class="ad-voice-card__play"
                  type="button"
                  :disabled="previewLoading && previewingCharId === char.id"
                  @click="playCharacterVoice(char)"
                >
                  <Icon :name="previewingCharId === char.id ? 'pause' : 'play'" :size="14" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：播放器 + 剧稿 -->
        <div class="ad-right-col">
          <!-- 播放器 -->
          <div class="nw-panel ad-player-panel">
            <div class="ad-player-chapter">
              {{ currentChapterEntry ? currentChapterEntry.title : (playingChapter ? `第 ${playingChapter} 章` : '选择章节开始收听') }}
            </div>
            <div class="ad-player-status" :class="{ 'is-synthesizing': synthesizing }">
              <span v-if="synthesizing">合成中 {{ synthProgress }}</span>
              <span v-else-if="segments.length > 0">{{ currentSegIdx + 1 }} / {{ segments.length }} 段</span>
              <span v-else>准备就绪</span>
            </div>

            <div class="ad-player-progress">
              <div class="ad-player-progress-bar">
                <div class="ad-player-progress-fill" :style="{ width: progressPercent + '%' }"></div>
              </div>
            </div>

            <div class="ad-player-controls">
              <button class="ad-player-ctrl" type="button" @click="playPrevChapter">
                <Icon name="skipBack" :size="20" />
              </button>
              <button
                class="ad-player-ctrl is-primary"
                type="button"
                :disabled="segments.length === 0 && !synthesizing"
                @click="togglePause"
              >
                <Icon :name="playing ? 'pause' : 'play'" :size="24" />
              </button>
              <button class="ad-player-ctrl" type="button" @click="playNextChapter">
                <Icon name="skipForward" :size="20" />
              </button>
            </div>

            <div class="ad-player-speed">
              <button
                v-for="s in SPEED_OPTIONS"
                :key="s"
                class="ad-speed-btn"
                :class="{ 'is-active': playbackRate === s }"
                @click="setSpeed(s)"
              >
                {{ s }}x
              </button>
            </div>
          </div>

          <!-- 剧稿同步 -->
          <div class="nw-panel ad-script-panel">
            <div class="nw-panel__head">
              <h2 class="nw-panel__title">剧稿同步</h2>
              <span v-if="segments.length > 0" class="desktop-section-count">
                {{ currentSegIdx + 1 }} / {{ segments.length }}
              </span>
            </div>

            <div v-if="segments.length === 0" class="ad-empty">
              播放章节后，剧稿会在这里同步显示
            </div>

            <div v-else class="ad-script">
              <div
                v-for="(seg, idx) in segments"
                :key="idx"
                class="ad-script-line"
                :class="{
                  'is-active': idx === currentSegIdx,
                  'is-past': idx < currentSegIdx,
                  'is-narration': seg.segment.type === 'narration',
                  'is-dialogue': seg.segment.type === 'dialogue',
                }"
              >
                <div v-if="seg.segment.type === 'dialogue' && seg.segment.speaker" class="ad-script-speaker">
                  {{ seg.segment.speaker }}
                </div>
                <div class="ad-script-text">{{ seg.segment.text }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </StateView>

    <!-- 播放设置弹窗 -->
    <Modal v-model="settingsVisible" title="播放设置" width="420px">
      <div class="nw-field">
        <label class="nw-field-label">播放倍速</label>
        <div class="ad-speed-grid">
          <button
            v-for="s in SPEED_OPTIONS"
            :key="s"
            class="desktop-chip"
            :class="{ 'is-active': playbackRate === s }"
            type="button"
            @click="setSpeed(s)"
          >{{ s }}x</button>
        </div>
      </div>

      <div class="nw-field">
        <label class="nw-field-label">自动连播</label>
        <div class="ad-toggle-row">
          <span>自动播放下一章</span>
          <button
            class="ad-toggle"
            :class="{ 'is-on': autoNext }"
            type="button"
            @click="autoNext = !autoNext"
          >
            <span class="ad-toggle-dot"></span>
          </button>
        </div>
      </div>

      <div class="nw-field">
        <label class="nw-field-label">定时关闭</label>
        <div class="ad-speed-grid">
          <button
            v-for="opt in sleepTimerOptions"
            :key="opt.label"
            class="desktop-chip"
            :class="{ 'is-active': sleepTimerMinutes === opt.value }"
            type="button"
            @click="setSleepTimer(opt.value)"
          >{{ opt.label }}</button>
        </div>
      </div>

      <template #footer>
        <button class="desktop-btn desktop-btn--primary" @click="settingsVisible = false">完成</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.desktop-audio-drama {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

/* Header */
.ad-header {
  display: flex;
  gap: var(--nw-space-5);
  padding: var(--nw-space-5);
}

.ad-header__cover {
  width: 120px;
  height: 160px;
  border-radius: var(--nw-radius-lg);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--nw-bg-secondary);
  display: grid;
  place-items: center;
}

.ad-header__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ad-header__cover-fallback {
  font-size: 48px;
  font-weight: 700;
  color: var(--nw-text-muted);
  font-family: var(--nw-font-display);
}

.ad-header__meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
  min-width: 0;
}

.ad-header__kicker {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--nw-accent-strong);
}

.ad-header__title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  font-family: var(--nw-font-display);
  color: var(--nw-text-primary);
  line-height: 1.2;
}

.ad-header__author {
  font-size: 14px;
  color: var(--nw-text-secondary);
}

.ad-header__stats {
  display: flex;
  gap: var(--nw-space-5);
  margin-top: var(--nw-space-2);
}

.ad-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ad-stat strong {
  font-size: 20px;
  font-weight: 700;
  font-family: var(--nw-font-display);
  color: var(--nw-text-primary);
}

.ad-stat span {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.ad-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2);
  margin-top: var(--nw-space-3);
}

/* Main layout */
.ad-main-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--nw-space-5);
  align-items: start;
}

.ad-left-col {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

.ad-right-col {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
  position: sticky;
  top: 20px;
}

/* Chapter list */
.ad-chapter-list {
  display: flex;
  flex-direction: column;
  max-height: 480px;
  overflow-y: auto;
}

.ad-chapter-item {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  padding: var(--nw-space-3);
  border-radius: var(--nw-radius-md);
  cursor: pointer;
  transition: background var(--nw-duration-fast) var(--nw-ease-smooth);
  text-align: left;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
}

.ad-chapter-item:hover {
  background: var(--nw-bg-secondary);
}

.ad-chapter-item.is-active {
  background: color-mix(in srgb, var(--nw-accent-start) 12%, var(--nw-bg-secondary));
}

.ad-chapter-item.is-synthesizing {
  background: color-mix(in srgb, var(--nw-warning) 10%, var(--nw-bg-secondary));
}

.ad-chapter-item__idx {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--nw-radius-sm);
  background: var(--nw-bg-secondary);
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-secondary);
  flex-shrink: 0;
  font-family: var(--nw-font-mono);
}

.ad-chapter-item.is-active .ad-chapter-item__idx {
  background: var(--nw-accent-gradient);
  color: #fff;
}

.ad-chapter-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ad-chapter-item__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--nw-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ad-chapter-item__meta {
  font-size: 12px;
  color: var(--nw-text-muted);
  display: flex;
  gap: 6px;
}

.ad-chapter-item__status {
  font-size: 12px;
  color: var(--nw-text-muted);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ad-chapter-item__status.is-ready {
  color: var(--nw-success);
}

.ad-chapter-item__status.is-synthesizing {
  color: var(--nw-warning);
}

.ad-empty {
  padding: var(--nw-space-6);
  text-align: center;
  color: var(--nw-text-muted);
  font-size: 13px;
}

/* Voice grid */
.ad-voice-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--nw-space-2);
  max-height: 360px;
  overflow-y: auto;
}

.ad-voice-card {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  padding: var(--nw-space-3);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-secondary);
  transition: background var(--nw-duration-fast) var(--nw-ease-smooth);
}

.ad-voice-card.is-playing {
  background: color-mix(in srgb, var(--nw-accent-start) 15%, var(--nw-bg-secondary));
}

.ad-voice-card__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--nw-accent-gradient);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 600;
  font-size: 16px;
  flex-shrink: 0;
}

.ad-voice-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ad-voice-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ad-voice-card__name {
  font-size: 13px;
  font-weight: 500;
  color: var(--nw-text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.ad-voice-card__role {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nw-accent-start) 20%, transparent);
  color: var(--nw-accent-strong);
  font-weight: 500;
}

.ad-voice-card__voice {
  font-size: 11px;
  color: var(--nw-text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ad-voice-card__play {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--nw-accent-gradient);
  color: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: transform var(--nw-duration-fast) var(--nw-ease-smooth);
}

.ad-voice-card__play:hover {
  transform: scale(1.08);
}

.ad-voice-card__play:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Player panel */
.ad-player-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--nw-space-4);
  padding: var(--nw-space-6);
}

.ad-player-chapter {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
  text-align: center;
}

.ad-player-status {
  font-size: 13px;
  color: var(--nw-text-muted);
}

.ad-player-status.is-synthesizing {
  color: var(--nw-warning);
}

.ad-player-progress {
  width: 100%;
}

.ad-player-progress-bar {
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  overflow: hidden;
}

.ad-player-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--nw-accent-gradient);
  transition: width 0.3s ease;
}

.ad-player-controls {
  display: flex;
  align-items: center;
  gap: var(--nw-space-4);
}

.ad-player-ctrl {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: var(--nw-bg-secondary);
  color: var(--nw-text-primary);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background var(--nw-duration-fast) var(--nw-ease-smooth);
}

.ad-player-ctrl:hover {
  background: var(--nw-bg-tertiary);
}

.ad-player-ctrl.is-primary {
  width: 56px;
  height: 56px;
  background: var(--nw-accent-gradient);
  color: #fff;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--nw-accent-start) 40%, transparent);
}

.ad-player-ctrl.is-primary:hover {
  transform: scale(1.05);
}

.ad-player-ctrl:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ad-player-speed {
  display: flex;
  gap: var(--nw-space-1);
}

.ad-speed-btn {
  padding: 4px 10px;
  border-radius: 999px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--nw-text-muted);
  cursor: pointer;
  transition: all var(--nw-duration-fast) var(--nw-ease-smooth);
}

.ad-speed-btn:hover {
  background: var(--nw-bg-secondary);
  color: var(--nw-text-primary);
}

.ad-speed-btn.is-active {
  background: var(--nw-accent-gradient);
  color: #fff;
}

/* Script panel */
.ad-script-panel {
  flex: 1;
  min-height: 300px;
}

.ad-script {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
  max-height: 500px;
  overflow-y: auto;
  padding: var(--nw-space-2);
}

.ad-script-line {
  padding: var(--nw-space-3);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-secondary);
  opacity: 0.5;
  transition: all var(--nw-duration-fast) var(--nw-ease-smooth);
}

.ad-script-line.is-past {
  opacity: 0.7;
}

.ad-script-line.is-active {
  opacity: 1;
  background: color-mix(in srgb, var(--nw-accent-start) 12%, var(--nw-bg-secondary));
  border-left: 3px solid var(--nw-accent-strong);
}

.ad-script-line.is-dialogue {
  background: color-mix(in srgb, var(--nw-accent-end) 8%, var(--nw-bg-secondary));
}

.ad-script-line.is-active.is-dialogue {
  background: color-mix(in srgb, var(--nw-accent-end) 18%, var(--nw-bg-secondary));
  border-left-color: var(--nw-accent-end);
}

.ad-script-speaker {
  font-size: 12px;
  font-weight: 600;
  color: var(--nw-accent-strong);
  margin-bottom: 4px;
}

.ad-script-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--nw-text-primary);
}

/* Speed grid in modal */
.ad-speed-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nw-space-2);
}

.ad-toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--nw-space-2) 0;
}

.ad-toggle {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: var(--nw-bg-tertiary);
  border: none;
  cursor: pointer;
  position: relative;
  transition: background var(--nw-duration-fast) var(--nw-ease-smooth);
}

.ad-toggle.is-on {
  background: var(--nw-accent-gradient);
}

.ad-toggle-dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform var(--nw-duration-fast) var(--nw-ease-smooth);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.ad-toggle.is-on .ad-toggle-dot {
  transform: translateX(20px);
}

.desktop-btn--danger-ghost {
  color: var(--nw-danger);
  border: 1px solid color-mix(in srgb, var(--nw-danger) 30%, transparent);
  background: transparent;
}

.desktop-btn--danger-ghost:hover {
  background: color-mix(in srgb, var(--nw-danger) 8%, transparent);
  border-color: var(--nw-danger);
}

@media (max-width: 1024px) {
  .ad-main-layout {
    grid-template-columns: 1fr;
  }

  .ad-right-col {
    position: static;
  }
}
</style>
