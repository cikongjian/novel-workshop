import { onUnmounted, ref } from 'vue';
import { fetchVoices, previewVoice, type VoiceInfo } from '../api/tts';
import {
  CLIENT_TTS_STOPPED,
  type ClientTTSOptions,
  type ClientTTSSegment,
  type ClientTTSQueueOptions,
} from './useClientTTS';
import { getCachedAudio, makeCacheKey, setCachedAudio } from '../utils/tts-audio-cache';

function stoppedError(): Error {
  return new Error(CLIENT_TTS_STOPPED);
}

/**
 * 把数值语速（0.75 / 1 / 1.25 / 1.5 / 2）转换成 Edge TTS 的 SSML 百分比字符串。
 * 1 倍速返回空串（后端按默认处理），其余形如 +25% / -25% / +100%。
 */
function formatEdgeRate(rate?: number): string {
  if (!rate || rate === 1) return '';
  const percent = Math.round((rate - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}

type AudioResult = { audio: string; duration: number };

/** 缓冲阈值：先合成这么多段再开始播放（像视频播放器的缓冲条） */
const BUFFER_THRESHOLD = 5;
/** 最小缓冲时间：即使达到段数阈值，也至少等这么久让 producer 多合成几段 */
const MIN_BUFFER_MS = 8000;

/**
 * Edge 在线 TTS 播放器（生产-消费模型）：
 *
 * - Producer：串行合成所有段（优先读 IndexedDB 缓存），放入 readyQueue
 * - Consumer：等 readyQueue 达到阈值后开始顺序播放
 * - 两路并行运行，通过 readyQueue 通信
 *
 * 这样首次点击会先缓冲几段（带进度条），达到阈值后开始播放，
 * 播放过程中 producer 继续在后台合成补充缓冲，实现流畅连续播放。
 * 缓存命中时秒开，无需等待合成。
 */
export function useEdgeOnlineTTS() {
  const speaking = ref(false);
  const paused = ref(false);
  const currentText = ref('');
  const progress = ref(0);
  const total = ref(0);
  const currentSegmentIndex = ref(-1);
  const currentParagraphIndex = ref(-1);
  const currentVoiceName = ref('');
  const availableVoices = ref<VoiceInfo[]>([]);

  // 缓冲状态：'buffering' 表示正在合成初始批次，'playing' 表示已进入播放阶段
  const buffering = ref(false);
  const bufferProgress = ref(0);

  let activeRunId = 0;
  let voicesLoaded = false;
  let currentAudio: HTMLAudioElement | null = null;
  let activePlaybackAbort: (() => void) | null = null;

  function isSupported(): boolean {
    return typeof window !== 'undefined' && typeof Audio !== 'undefined';
  }

  function prime(): void {
    // 在线引擎不依赖 speechSynthesis，无需预热
  }

  async function loadVoices(): Promise<VoiceInfo[]> {
    if (voicesLoaded) return availableVoices.value;
    try {
      const voices = await fetchVoices();
      availableVoices.value = voices;
      voicesLoaded = true;
      return voices;
    } catch {
      return [];
    }
  }

  function getVoices(): VoiceInfo[] {
    return availableVoices.value;
  }

  /** 合成音频，带缓存查询、base64 校验和重试 */
  async function fetchAudio(
    text: string,
    voice: string,
    rate: string,
    novelId: string,
    novelTitle: string,
  ): Promise<AudioResult> {
    const cacheKey = makeCacheKey(novelId, voice, rate, text);
    const cached = await getCachedAudio(cacheKey);
    if (cached && cached.audio.length > 200) {
      console.log('[EdgeTTS] 缓存命中', cacheKey.slice(0, 40));
      return { audio: cached.audio, duration: cached.duration };
    }

    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const result = await previewVoice({ voice, text, rate: rate || undefined });
      if (result.audio && result.audio.length > 200) {
        // 写入缓存并等待落盘（确保刷新后仍可用）
        await setCachedAudio(cacheKey, {
          audio: result.audio,
          duration: result.duration,
          novelId,
          novelTitle,
        });
        return result;
      }
      console.warn(`[EdgeTTS] 合成结果可能损坏 (base64 length: ${result.audio?.length ?? 0})`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      } else {
        return result;
      }
    }
    return previewVoice({ voice, text, rate: rate || undefined });
  }

  function stopCurrentAudio(): void {
    if (activePlaybackAbort) {
      const abort = activePlaybackAbort;
      activePlaybackAbort = null;
      abort();
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.removeAttribute('src');
      try {
        currentAudio.load();
      } catch {
        // ignore
      }
      currentAudio = null;
    }
  }

  /** 播放一段 base64 mp3 */
  async function playAudioBuffer(audioBase64: string, runId: number): Promise<void> {
    if (runId !== activeRunId) throw stoppedError();

    const byteChars = atob(audioBase64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i += 1) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    currentAudio = audio;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        if (currentAudio === audio) currentAudio = null;
        if (activePlaybackAbort === abort) activePlaybackAbort = null;
        window.setTimeout(() => URL.revokeObjectURL(url), 3000);
        if (err) reject(err);
        else resolve();
      };
      const onEnded = () => finish();
      const onError = (e: Event) => {
        const mediaError = (e.target as HTMLAudioElement)?.error;
        const dur = audio.duration;
        if (dur > 0 && audio.currentTime >= dur - 0.3) {
          finish();
          return;
        }
        console.error('[EdgeTTS] audio error', { code: mediaError?.code, message: mediaError?.message });
        finish(new Error('在线音频播放失败，请检查网络或稍后重试'));
      };
      const abort = () => finish(stoppedError());
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      activePlaybackAbort = abort;
      audio.play().catch((err) => {
        console.error('[EdgeTTS] play() rejected', err);
        finish(err instanceof Error ? err : new Error('无法播放在线音频，请稍后重试'));
      });
    });
  }

  function resetPlaybackState(): void {
    speaking.value = false;
    paused.value = false;
    currentText.value = '';
    progress.value = 0;
    total.value = 0;
    currentSegmentIndex.value = -1;
    currentParagraphIndex.value = -1;
    currentVoiceName.value = '';
    buffering.value = false;
    bufferProgress.value = 0;
  }

  async function speak(text: string, options: ClientTTSOptions = {}): Promise<void> {
    await speakQueue([{ text, options }]);
  }

  async function speakQueue(
    segments: ClientTTSSegment[],
    queueOptions: ClientTTSQueueOptions = {},
    novelContext?: { novelId: string; novelTitle: string },
  ): Promise<void> {
    const normalized = segments
      .map((segment) => ({ ...segment, text: segment.text.trim() }))
      .filter((segment) => segment.text.length > 0);

    if (normalized.length === 0) {
      throw new Error('文本队列为空');
    }

    activeRunId += 1;
    const runId = activeRunId;
    paused.value = false;
    stopCurrentAudio();

    total.value = normalized.length;
    progress.value = 0;
    currentSegmentIndex.value = -1;
    currentParagraphIndex.value = -1;
    buffering.value = true;
    bufferProgress.value = 0;

    // 生产-消费共享队列
    const readyQueue: { segment: ClientTTSSegment; audio: AudioResult; index: number }[] = [];
    let producerDone = false;

    /** Producer：串行合成，优先读缓存 */
    const producer = async () => {
      for (let i = 0; i < normalized.length; i += 1) {
        if (runId !== activeRunId) return;

        const segment = normalized[i];
        const voice = segment.options?.voiceName || currentVoiceName.value || '';
        if (!voice) {
          producerDone = true;
          return;
        }
        const rate = formatEdgeRate(segment.options?.rate);

        try {
          const audio = await fetchAudio(
            segment.text,
            voice,
            rate,
            novelContext?.novelId ?? 'preview',
            novelContext?.novelTitle ?? '试听',
          );
          if (runId !== activeRunId) return;
          readyQueue.push({ segment, audio, index: i });
          // 更新缓冲进度
          bufferProgress.value = Math.round((readyQueue.length / normalized.length) * 100);
        } catch (err) {
          if (runId !== activeRunId) return;
          console.error(`[EdgeTTS] 第 ${i + 1} 段合成失败，跳过`, err);
        }
      }
      producerDone = true;
    };

    /** 等待 readyQueue 有数据，返回是否还有数据可消费 */
    const waitForReady = async (): Promise<boolean> => {
      while (readyQueue.length === 0) {
        if (producerDone) return false;
        if (runId !== activeRunId) throw stoppedError();
        await new Promise((r) => setTimeout(r, 50));
      }
      return true;
    };

    try {
      // 启动 producer
      const producerPromise = producer();

      // Consumer：等缓冲达到阈值 且 最小缓冲时间已过（或 producer 全部完成）
      // 这样首次听书会多缓冲几段，后续播放更流畅；缓存命中时 producer 秒完，无需死等
      const threshold = Math.min(BUFFER_THRESHOLD, normalized.length);
      const bufferStartTime = Date.now();
      while (true) {
        if (runId !== activeRunId) throw stoppedError();
        const elapsed = Date.now() - bufferStartTime;
        // producer 已完成 → 不用再等（缓存命中或全部合成完）
        if (producerDone) break;
        // 达到段数阈值 且 最小缓冲时间已过 → 开始播放
        if (readyQueue.length >= threshold && elapsed >= MIN_BUFFER_MS) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      if (runId !== activeRunId) throw stoppedError();

      // 缓冲完成，进入播放阶段
      buffering.value = false;
      bufferProgress.value = 100;

      while (true) {
        if (runId !== activeRunId) throw stoppedError();

        const hasData = await waitForReady();
        if (!hasData) break;

        const item = readyQueue.shift()!;
        const { segment, audio, index } = item;

        progress.value = index + 1;
        currentSegmentIndex.value = index;
        currentParagraphIndex.value = segment.paragraphIndex ?? index;
        currentText.value = segment.text;
        currentVoiceName.value = segment.options?.voiceName || currentVoiceName.value || '';
        queueOptions.onSegmentStart?.(segment, index, normalized.length);

        speaking.value = true;
        try {
          await playAudioBuffer(audio.audio, runId);
        } catch (playErr) {
          if (runId !== activeRunId) throw stoppedError();
          console.error(`[EdgeTTS] 第 ${index + 1} 段播放失败，跳过`, playErr);
          speaking.value = false;
        }
        if (runId !== activeRunId) throw stoppedError();

        queueOptions.onSegmentEnd?.(segment, index, normalized.length);
      }

      // 等 producer 完全结束（处理未捕获的 rejection）
      await producerPromise;
    } finally {
      if (runId === activeRunId) {
        resetPlaybackState();
      }
    }
  }

  function pause(): void {
    if (!speaking.value) return;
    if (currentAudio) currentAudio.pause();
    paused.value = true;
    speaking.value = false;
  }

  function resume(): void {
    if (!paused.value || !currentAudio) return;
    paused.value = false;
    speaking.value = true;
    void currentAudio.play().catch(() => {});
  }

  function stop(): void {
    activeRunId += 1;
    stopCurrentAudio();
    resetPlaybackState();
  }

  onUnmounted(() => {
    stop();
  });

  return {
    speaking,
    paused,
    currentText,
    progress,
    total,
    currentSegmentIndex,
    currentParagraphIndex,
    currentVoiceName,
    availableVoices,
    buffering,
    bufferProgress,
    isSupported,
    getVoices,
    loadVoices,
    prime,
    speak,
    speakQueue,
    pause,
    resume,
    stop,
  };
}
