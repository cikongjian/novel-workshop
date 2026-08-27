<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  MoreFilled,
  VideoPlay,
  VideoPause,
  DArrowLeft,
  DArrowRight,
  Headset,
  Setting,
  Delete,
  Timer,
  Switch,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { useThemeMode } from '../composables/useThemeMode';
import {
  streamTTSSynthesize,
  fetchAudiobookPage,
  fetchNovel,
  fetchCharacters,
  clearAllTTSCache,
  designAllVoices,
  type TTSSegmentData,
  type TTSStreamEvent,
  type AudiobookEntry,
} from '../api';
import type { CharacterProfile } from '../api/characters';
import { getCoverUrl } from '../api/novels';
import CharacterVoiceSettingSheet from '../components/mobile-entry/CharacterVoiceSettingSheet.vue';
import '../styles/mobile-audio-drama.css';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const novelId = computed(() => String(route.params.id || ''));

// ===== Novel info =====
const novelTitle = ref('');
const novelCover = ref('');
const authorName = ref('');
const chapterCount = ref(0);

// ===== Audiobook catalog =====
const audioEntries = ref<AudiobookEntry[]>([]);
const catalogLoading = ref(false);
const catalogTotal = ref(0);
let catalogPage = 0;
const catalogPageSize = 50;
let catalogSerial = 0;

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
  const id = novelId.value;
  if (!id) return;
  const serial = ++catalogSerial;
  catalogLoading.value = true;
  try {
    const result = await fetchAudiobookPage(id, { page: 1, pageSize: catalogPageSize, order: 'asc' });
    if (serial !== catalogSerial || id !== novelId.value) return;
    audioEntries.value = result.entries;
    catalogTotal.value = result.total;
    catalogPage = result.page;
  } catch {
    if (serial === catalogSerial) {
      ElMessage.error('加载有声书目录失败');
    }
  } finally {
    if (serial === catalogSerial) catalogLoading.value = false;
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

const currentSpeakerChar = computed(() => {
  const seg = currentSegment.value;
  if (!seg || seg.type !== 'dialogue' || !seg.speaker) return null;
  const name = seg.speaker.trim();
  const char = characters.value.find(
    (c) => c.name?.trim() === name,
  );
  return char || null;
});

const currentSpeakerAvatar = computed(() => {
  const char = currentSpeakerChar.value;
  if (!char) return '';
  return getCharAvatar(char);
});

const currentSpeakerLabel = computed(() => {
  const seg = currentSegment.value;
  if (!seg) return '';
  if (seg.type === 'narration') return '旁白';
  return seg.speaker || '角色';
});

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
    novelId.value,
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

function cycleSpeed() {
  const speeds = [1, 1.25, 1.5, 2, 0.75];
  const idx = speeds.indexOf(playbackRate.value);
  playbackRate.value = speeds[(idx + 1) % speeds.length];
  if (audioEl) audioEl.playbackRate = playbackRate.value;
}

// ===== Characters =====
const characters = ref<CharacterProfile[]>([]);
const charactersLoading = ref(false);
const previewingCharId = ref<string | null>(null);
let previewAudioEl: HTMLAudioElement | null = null;

async function loadCharacters() {
  if (!novelId.value) return;
  charactersLoading.value = true;
  try {
    const result = await fetchCharacters(novelId.value);
    characters.value = result || [];
  } catch {
    // 角色列表加载失败不影响主功能
  } finally {
    charactersLoading.value = false;
  }
}

function getCharAvatar(char: CharacterProfile): string {
  if (!char.portraitImagePath) return '';
  return `/api/novels/${novelId.value}/characters/${char.id}/portrait?w=120`;
}

function getCharVoiceLabel(char: CharacterProfile): string {
  if (char.voiceInstruct) return char.voiceInstruct.slice(0, 12);
  if (char.ttsVoice) return char.ttsVoice;
  return '未设置声音';
}

function playCharacterVoice(char: CharacterProfile) {
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
  // 这里调用预览 API，但为了 MVP 先用占位逻辑
  ElMessage.info('角色试听功能开发中');
  setTimeout(() => {
    previewingCharId.value = null;
  }, 1500);
}

// ===== 声音设置 =====
const voiceSettingVisible = ref(false);
const settingCharacterId = ref<string | null>(null);
const settingCharacter = ref<CharacterProfile | null>(null);

function openVoiceSetting(char: CharacterProfile) {
  settingCharacterId.value = char.id;
  settingCharacter.value = char;
  voiceSettingVisible.value = true;
}

async function onVoiceSettingUpdated() {
  voiceSettingVisible.value = false;
  // 刷新角色列表
  if (novelId.value) {
    await loadCharacters();
  }
}

// ===== Navigation =====
function goBack() {
  stopPlayback();
  router.back();
}

// ===== More menu =====
const showMoreMenu = ref(false);
const showPlaySettings = ref(false);
const sleepTimerMinutes = ref<number | null>(null);
let sleepTimer: ReturnType<typeof setTimeout> | null = null;

const sleepTimerOptions = [
  { label: '不开启', value: null },
  { label: '15 分钟', value: 15 },
  { label: '30 分钟', value: 30 },
  { label: '60 分钟', value: 60 },
  { label: '播完本章', value: -1 },
];

function openMore() {
  showMoreMenu.value = !showMoreMenu.value;
}

function closeMoreMenu() {
  showMoreMenu.value = false;
}

async function handleClearAll() {
  closeMoreMenu();
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
    const result = await clearAllTTSCache(novelId.value);
    ElMessage.success(result.message || '已清空所有合成');
    void loadCatalog();
  } catch {
    ElMessage.error('清空失败，请稍后重试');
  }
}

function openPlaySettings() {
  closeMoreMenu();
  showPlaySettings.value = true;
}

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
  } else if (minutes === -1) {
    ElMessage.info('播完本章后停止');
  }
}

// ===== Init =====
async function loadNovelInfo() {
  if (!novelId.value) return;
  try {
    const info = await fetchNovel(novelId.value);
    novelTitle.value = info.title || '';
    novelCover.value = info.coverImage
      ? getCoverUrl(info.id, info.coverImage || info.updatedAt || info.createdAt, 200)
      : '';
    authorName.value = info.ownerName || '';
    chapterCount.value = info.chapterCount || 0;
  } catch (err) {
    console.error('[AudioDrama] 加载小说信息失败', err);
  }
}

watch(
  () => route.params.id,
  () => {
    stopPlayback();
    catalogSerial++;
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
  <div
    class="mobile-audio-drama mobile-focus-page"
    :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }"
  >
    <div class="mobile-focus-shell">
      <!-- Top bar -->
      <header class="mad-topbar">
        <button class="mad-topbar__back" type="button" aria-label="返回" @click="goBack">
          <el-icon :size="18"><ArrowLeft /></el-icon>
        </button>
        <span class="mad-topbar__title">AI 广播剧</span>
        <div class="mad-topbar__more-wrap">
          <button class="mad-topbar__more" type="button" aria-label="更多" @click="openMore">
            <el-icon :size="18"><MoreFilled /></el-icon>
          </button>
          <Transition name="mad-dropdown">
            <div v-if="showMoreMenu" class="mad-dropdown" @click.stop>
              <button class="mad-dropdown__item" type="button" @click="openPlaySettings">
                <el-icon :size="16"><Setting /></el-icon>
                <span>播放设置</span>
              </button>
              <button class="mad-dropdown__item is-danger" type="button" @click="handleClearAll">
                <el-icon :size="16"><Delete /></el-icon>
                <span>清空所有合成</span>
              </button>
            </div>
          </Transition>
        </div>
      </header>
      <div v-if="showMoreMenu" class="mad-dropdown-backdrop" @click="closeMoreMenu"></div>

      <!-- Hero -->
      <section class="mad-hero">
        <div class="mad-hero__row">
          <div class="mad-hero__cover">
            <img v-if="novelCover" :src="novelCover" :alt="novelTitle" @error="novelCover = ''" />
            <div v-else class="mad-hero__cover-fallback">{{ novelTitle ? novelTitle.slice(0, 2) : '书' }}</div>
          </div>
          <div class="mad-hero__meta">
            <span class="mad-hero__kicker">
              <span class="mad-hero__kicker-dot"></span>
              AI 广播剧
            </span>
            <h1 class="mad-hero__title">{{ novelTitle || '加载中…' }}</h1>
            <span class="mad-hero__author">{{ authorName }}</span>
            <div class="mad-hero__stats">
              <span class="mad-hero__stat">
                <strong>{{ synthesizedCount }}</strong> / {{ chapterCount || '—' }} 章
              </span>
              <span class="mad-hero__stat" v-if="synthesizedDurationMs > 0">
                <strong>{{ formatDuration(synthesizedDurationMs) }}</strong>
              </span>
            </div>
          </div>
        </div>
        <button
          v-if="audioEntries.length > 0"
          class="mad-hero__play"
          type="button"
          @click="playChapter(audioEntries[0].chapterNumber)"
        >
          <el-icon :size="18"><VideoPlay /></el-icon>
          从第 1 章开始收听
        </button>
        <button
          v-else
          class="mad-hero__play"
          type="button"
          :disabled="catalogLoading"
          @click="playChapter(1)"
        >
          <el-icon :size="18"><Headset /></el-icon>
          立即生成第 1 章
        </button>
      </section>

      <!-- Chapter list -->
      <section class="mad-section">
        <div class="mad-section__head">
          <div>
            <div class="mad-section__kicker">CHAPTERS</div>
            <h2 class="mad-section__title">章节列表</h2>
          </div>
          <span class="mad-section__hint">
            已合成 {{ synthesizedCount }} 章
          </span>
        </div>

        <div v-loading="catalogLoading" class="mad-chapter-list">
          <div v-if="!catalogLoading && audioEntries.length === 0" class="mad-empty">
            还没有合成的章节，点击上方按钮开始生成
          </div>

          <button
            v-for="entry in audioEntries"
            :key="entry.chapterNumber"
            class="mad-chapter-item"
            :class="{
              'is-active': playingChapter === entry.chapterNumber,
              'is-synthesizing': synthesizing && playingChapter === entry.chapterNumber,
            }"
            type="button"
            @click="playChapter(entry.chapterNumber)"
          >
            <span class="mad-chapter-item__idx">{{ entry.chapterNumber }}</span>
            <div class="mad-chapter-item__body">
              <span class="mad-chapter-item__title">{{ entry.title }}</span>
              <div class="mad-chapter-item__meta">
                <span>{{ formatDuration(entry.totalDuration) }}</span>
                <span>{{ entry.segmentCount }} 段</span>
              </div>
            </div>
            <span
              v-if="synthesizing && playingChapter === entry.chapterNumber"
              class="mad-chapter-item__status is-synthesizing"
            >
              合成中 {{ synthProgress }}
            </span>
            <span v-else class="mad-chapter-item__status is-ready">
              已合成
            </span>
          </button>

          <!-- Pending chapters (placeholder) -->
          <button
            v-if="audioEntries.length > 0 && chapterCount > audioEntries.length"
            key="pending-next"
            class="mad-chapter-item"
            type="button"
            @click="playChapter(audioEntries[audioEntries.length - 1].chapterNumber + 1)"
          >
            <span class="mad-chapter-item__idx">
              {{ audioEntries[audioEntries.length - 1].chapterNumber + 1 }}
            </span>
            <div class="mad-chapter-item__body">
              <span class="mad-chapter-item__title">下一章 · 点击生成</span>
              <div class="mad-chapter-item__meta">
                <span>未合成</span>
              </div>
            </div>
            <span class="mad-chapter-item__status is-pending">待合成</span>
          </button>
        </div>

        <div v-if="audioEntries.length > 0" class="mad-chapter-bulk">
          <button class="mad-chapter-bulk__btn" type="button" @click="designAllVoices">
            <el-icon :size="14"><MagicStick /></el-icon>
            批量合成更多章节
          </button>
        </div>
      </section>

      <!-- Script preview -->
      <section v-if="currentSegment && segments.length > 0" class="mad-section">
        <div class="mad-section__head">
          <div>
            <div class="mad-section__kicker">SCRIPT</div>
            <h2 class="mad-section__title">剧稿</h2>
          </div>
          <span class="mad-section__hint">
            第 {{ currentSegIdx + 1 }} / {{ segments.length }} 段
          </span>
        </div>

        <div class="mad-script">
          <div
            v-for="(seg, idx) in segments.slice(Math.max(0, currentSegIdx - 2), currentSegIdx + 5)"
            :key="idx"
            class="mad-script-line"
            :class="{
              'is-active': idx + Math.max(0, currentSegIdx - 2) === currentSegIdx,
              'is-narration': seg.segment.type === 'narration',
              'is-dialogue': seg.segment.type === 'dialogue',
            }"
          >
            <div v-if="seg.segment.type === 'dialogue' && seg.segment.speaker" class="mad-script-line__speaker">
              {{ seg.segment.speaker }}
            </div>
            <div class="mad-script-line__text">{{ seg.segment.text }}</div>
          </div>
        </div>
      </section>

      <!-- Character voices -->
      <section class="mad-section">
        <div class="mad-section__head">
          <div>
            <div class="mad-section__kicker">CAST</div>
            <h2 class="mad-section__title">角色声音</h2>
          </div>
          <span class="mad-section__hint">
            {{ characters.length }} 位角色
          </span>
        </div>

        <div v-loading="charactersLoading" class="mad-voice-grid">
          <div v-if="!charactersLoading && characters.length === 0" class="mad-empty" style="grid-column: 1 / -1;">
            暂无角色信息
          </div>

          <button
            v-for="char in characters.slice(0, 4)"
            :key="char.id"
            class="mad-voice-card"
            type="button"
            @click="playCharacterVoice(char)"
          >
            <div class="mad-voice-card__avatar">
              <img v-if="getCharAvatar(char)" :src="getCharAvatar(char)" :alt="char.name" />
            </div>
            <div class="mad-voice-card__body">
              <div class="mad-voice-card__name">
                {{ char.name }}
                <span v-if="char.role" class="mad-voice-card__role-tag">
                  {{ char.role === 'protagonist' ? '主角' : char.role === 'antagonist' ? '反派' : '配角' }}
                </span>
              </div>
              <div class="mad-voice-card__voice">
                <el-icon :size="11"><Headset /></el-icon>
                {{ getCharVoiceLabel(char) }}
              </div>
            </div>
            <div class="mad-voice-card__actions">
              <button
                class="mad-voice-card__set-btn"
                type="button"
                @click.stop="openVoiceSetting(char)"
              >
                <el-icon :size="12"><Setting /></el-icon>
              </button>
              <div class="mad-voice-card__play-btn">
                <el-icon :size="12">
                  <VideoPlay v-if="previewingCharId !== char.id" />
                  <VideoPause v-else />
                </el-icon>
              </div>
            </div>
          </button>
        </div>
      </section>

      <!-- Bottom player -->
      <div v-if="playingChapter !== null" class="mad-player">
        <div
          v-if="currentSegment && segments.length > 0"
          class="mad-player__speaker"
          :class="{ 'is-dialogue': currentSegment.type === 'dialogue' }"
        >
          <div class="mad-player__speaker-avatar">
            <img
              v-if="currentSpeakerAvatar"
              :src="currentSpeakerAvatar"
              :alt="currentSpeakerLabel"
            />
            <span v-else class="mad-player__speaker-avatar-fallback">
              {{ currentSpeakerLabel.slice(0, 1) }}
            </span>
          </div>
          <div class="mad-player__speaker-body">
            <div class="mad-player__speaker-name">{{ currentSpeakerLabel }}</div>
            <div class="mad-player__speaker-text">{{ currentSegment.text }}</div>
          </div>
        </div>

        <div class="mad-player__info">
          <span class="mad-player__chapter">
            {{ currentChapterEntry ? currentChapterEntry.title : `第 ${playingChapter} 章` }}
          </span>
          <span
            class="mad-player__status"
            :class="{ 'is-synthesizing': synthesizing }"
          >
            {{ synthesizing ? `合成中 ${synthProgress}` : `${currentSegIdx + 1}/${segments.length}` }}
          </span>
        </div>

        <div class="mad-player__controls">
          <button class="mad-player__ctrl" type="button" aria-label="上一章" @click="playPrevChapter">
            <el-icon :size="18"><DArrowLeft /></el-icon>
          </button>
          <button
            class="mad-player__ctrl is-primary"
            type="button"
            :aria-label="playing ? '暂停' : '播放'"
            @click="togglePause"
          >
            <el-icon :size="20">
              <VideoPause v-if="playing" />
              <VideoPlay v-else />
            </el-icon>
          </button>
          <button class="mad-player__ctrl" type="button" aria-label="下一章" @click="playNextChapter">
            <el-icon :size="18"><DArrowRight /></el-icon>
          </button>
        </div>

        <div class="mad-player__progress">
          <div class="mad-player__bar">
            <div class="mad-player__bar-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <span class="mad-player__speed" @click="cycleSpeed">{{ playbackRate }}x</span>
        </div>
      </div>
    </div>

    <!-- 角色声音设置面板 -->
    <CharacterVoiceSettingSheet
      :visible="voiceSettingVisible"
      :novel-id="novelId"
      :character-id="settingCharacterId"
      :character="settingCharacter"
      @close="voiceSettingVisible = false"
      @updated="onVoiceSettingUpdated"
    />

    <!-- 播放设置弹窗 -->
    <Transition name="mad-overlay">
      <div v-if="showPlaySettings" class="mad-play-settings-overlay" @click="showPlaySettings = false">
        <div class="mad-play-settings-sheet" @click.stop>
          <div class="mad-play-settings__header">
            <span class="mad-play-settings__title">播放设置</span>
            <button class="mad-play-settings__close" type="button" @click="showPlaySettings = false">
              <el-icon :size="18"><ArrowLeft /></el-icon>
            </button>
          </div>

          <div class="mad-play-settings__body">
            <!-- 播放倍速 -->
            <div class="mad-play-settings__section">
              <div class="mad-play-settings__section-title">播放倍速</div>
              <div class="mad-play-settings__speed-grid">
                <button
                  v-for="speed in [0.75, 1, 1.25, 1.5, 2]"
                  :key="speed"
                  class="mad-play-settings__speed-btn"
                  :class="{ 'is-active': playbackRate === speed }"
                  type="button"
                  @click="playbackRate = speed; audioEl && (audioEl.playbackRate = speed)"
                >
                  {{ speed }}x
                </button>
              </div>
            </div>

            <!-- 自动连播 -->
            <div class="mad-play-settings__row">
              <div class="mad-play-settings__row-label">
                <el-icon :size="16"><Switch /></el-icon>
                <span>自动连播下一章</span>
              </div>
              <button
                class="mad-play-settings__toggle"
                :class="{ 'is-on': autoNext }"
                type="button"
                @click="autoNext = !autoNext"
              >
                <span class="mad-play-settings__toggle-dot"></span>
              </button>
            </div>

            <!-- 定时关闭 -->
            <div class="mad-play-settings__section">
              <div class="mad-play-settings__section-title">
                <el-icon :size="16"><Timer /></el-icon>
                <span>定时关闭</span>
              </div>
              <div class="mad-play-settings__timer-grid">
                <button
                  v-for="opt in sleepTimerOptions"
                  :key="opt.label"
                  class="mad-play-settings__timer-btn"
                  :class="{ 'is-active': sleepTimerMinutes === opt.value }"
                  type="button"
                  @click="setSleepTimer(opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
