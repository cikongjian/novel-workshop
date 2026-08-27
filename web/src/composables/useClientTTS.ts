import { onUnmounted, ref } from 'vue';
import {
  hasAndroidNativeTTSBridge,
  readAndroidNativeStatus,
  readAndroidNativeVoices,
  speakAndroidNativeQueue,
  speakAndroidNativeSegment,
  stopAndroidNativeTTS,
  supportsAndroidNativeTTSQueue,
  waitForAndroidNativeVoices,
} from '../utils/android-native-tts';
import {
  createBrowserVoiceLoader,
  isBrowserSpeechSupported,
  primeBrowserSpeech,
  resumeBrowserSpeech,
  speakBrowserSegment,
} from '../utils/browser-client-tts';
import { DEFAULT_LANG, getChineseVoices, type ClientTTSVoiceOptions } from '../utils/client-tts-voice';
import { detectBrowserEnv } from '../utils/browser-env';

const BROWSER_VOICE_LOAD_TIMEOUT_MS = 1200;
const ANDROID_NATIVE_VOICE_LOAD_TIMEOUT_MS = 3000;
const CANCEL_SETTLE_MS = 40;
const SPEECH_START_TIMEOUT_MS = 15000;
const IOS_RESUME_KEEPALIVE_MS = 1500;
const MOBILE_SEGMENT_SETTLE_MS = 120;

export const CLIENT_TTS_STOPPED = 'CLIENT_TTS_STOPPED';
export type ClientTTSBackend = 'android-native' | 'browser' | 'none';

export interface ClientTTSOptions extends ClientTTSVoiceOptions {}

export interface ClientTTSSegment {
  text: string;
  paragraphIndex?: number;
  options?: ClientTTSOptions;
}

export interface ClientTTSQueueOptions {
  onSegmentStart?: (segment: ClientTTSSegment, index: number, total: number) => void;
  onSegmentEnd?: (segment: ClientTTSSegment, index: number, total: number) => void;
}

function stoppedError(): Error {
  return new Error(CLIENT_TTS_STOPPED);
}

export function useClientTTS() {
  const speaking = ref(false);
  const paused = ref(false);
  const currentText = ref('');
  const progress = ref(0);
  const total = ref(0);
  const currentSegmentIndex = ref(-1);
  const currentParagraphIndex = ref(-1);
  const currentVoiceName = ref('');
  const availableVoices = ref<SpeechSynthesisVoice[]>([]);

  let activeRunId = 0;
  let activeBackend: ClientTTSBackend = 'none';
  let nativeResumeResolver: (() => void) | null = null;
  let resumeKeepAliveTimer: number | null = null;
  const env = detectBrowserEnv();
  const browserVoiceLoader = createBrowserVoiceLoader(BROWSER_VOICE_LOAD_TIMEOUT_MS, (voices) => {
    availableVoices.value = voices;
  });

  function resolvePreferredBackend(): ClientTTSBackend {
    if (hasAndroidNativeTTSBridge() && readAndroidNativeStatus().available) {
      return 'android-native';
    }
    if (isBrowserSpeechSupported()) {
      return 'browser';
    }
    if (hasAndroidNativeTTSBridge()) {
      return 'android-native';
    }
    return 'none';
  }

  function getCurrentBackend(): ClientTTSBackend {
    return activeBackend !== 'none' ? activeBackend : resolvePreferredBackend();
  }

  function isUsingAndroidNativeTTS(): boolean {
    return getCurrentBackend() === 'android-native';
  }

  function isSupported(): boolean {
    return resolvePreferredBackend() !== 'none';
  }

  function getVoices(): SpeechSynthesisVoice[] {
    const voices = getCurrentBackend() === 'android-native'
      ? readAndroidNativeVoices()
      : browserVoiceLoader.readVoices();
    availableVoices.value = voices;
    return voices;
  }

  function getChineseVoiceList(): SpeechSynthesisVoice[] {
    return getChineseVoices(getVoices());
  }

  async function ensureVoices(): Promise<SpeechSynthesisVoice[]> {
    const voices = getCurrentBackend() === 'android-native'
      ? await waitForAndroidNativeVoices(ANDROID_NATIVE_VOICE_LOAD_TIMEOUT_MS)
      : await browserVoiceLoader.ensureVoices();
    availableVoices.value = voices;
    return voices;
  }

  function stopResumeKeepAlive() {
    if (resumeKeepAliveTimer == null || typeof window === 'undefined') return;
    window.clearInterval(resumeKeepAliveTimer);
    resumeKeepAliveTimer = null;
  }

  function startResumeKeepAlive() {
    if (!(env.isIOS || env.isWeChat) || typeof window === 'undefined') return;
    stopResumeKeepAlive();
    resumeKeepAliveTimer = window.setInterval(() => {
      if (!speaking.value && !paused.value) return;
      resumeBrowserSpeech();
    }, IOS_RESUME_KEEPALIVE_MS);
  }

  function resetPlaybackState(clearQueue = true) {
    stopResumeKeepAlive();
    speaking.value = false;
    paused.value = false;
    currentText.value = '';
    currentSegmentIndex.value = -1;
    currentParagraphIndex.value = -1;
    currentVoiceName.value = '';

    if (clearQueue) {
      progress.value = 0;
      total.value = 0;
    }

    activeBackend = 'none';
  }

  function clearNativeResumeWaiter() {
    if (!nativeResumeResolver) return;
    const resolver = nativeResumeResolver;
    nativeResumeResolver = null;
    resolver();
  }

  function prime() {
    if (getCurrentBackend() === 'android-native') return;
    primeBrowserSpeech();
  }

  async function speakSegment(segment: ClientTTSSegment, runId: number): Promise<'done' | 'stopped'> {
    if (!isSupported()) {
      throw new Error('浏览器不支持语音合成');
    }

    const text = segment.text.trim();
    if (!text) return 'done';

    const voices = await ensureVoices();
    if (runId !== activeRunId) return 'stopped';
    if (voices.length === 0) {
      throw new Error(
        getCurrentBackend() === 'android-native'
          ? '未检测到可用系统语音，请先在安卓系统里安装中文语音引擎'
          : '未检测到可用系统语音，请先安装系统语音包后重试',
      );
    }

    currentText.value = text;

    if (getCurrentBackend() === 'android-native') {
      return speakAndroidNativeSegment({
        text,
        voices,
        options: segment.options,
        runId,
        getActiveRunId: () => activeRunId,
        startTimeoutMs: SPEECH_START_TIMEOUT_MS,
        onStart: (voiceName) => {
          currentVoiceName.value = voiceName || DEFAULT_LANG;
        },
        onEventStateChange: (state) => {
          if (state === 'start') {
            speaking.value = true;
            paused.value = false;
            return;
          }
          speaking.value = false;
        },
      });
    }

    return speakBrowserSegment({
      text,
      voices,
      options: segment.options,
      runId,
      getActiveRunId: () => activeRunId,
      startTimeoutMs: SPEECH_START_TIMEOUT_MS,
      onStart: (voiceName) => {
        currentVoiceName.value = voiceName || DEFAULT_LANG;
      },
      onBeforeSpeak: () => {
        speaking.value = true;
        paused.value = false;
        startResumeKeepAlive();
      },
      onAfterSpeak: () => {
        speaking.value = false;
        stopResumeKeepAlive();
      },
    });
  }

  async function waitForNativeResume(runId: number): Promise<void> {
    if (!paused.value) return;

    await new Promise<void>((resolve) => {
      nativeResumeResolver = () => {
        nativeResumeResolver = null;
        resolve();
      };
    });

    if (runId !== activeRunId) {
      throw stoppedError();
    }
  }

  async function speak(text: string, options: ClientTTSOptions = {}): Promise<void> {
    await speakQueue([{ text, options }]);
  }

  async function speakQueue(
    segments: ClientTTSSegment[],
    queueOptions: ClientTTSQueueOptions = {},
  ): Promise<void> {
    if (!isSupported()) {
      throw new Error('浏览器不支持语音合成');
    }

    const normalizedSegments = segments
      .map((segment) => ({
        ...segment,
        text: segment.text.trim(),
      }))
      .filter((segment) => segment.text.length > 0);

    if (normalizedSegments.length === 0) {
      throw new Error('文本队列为空');
    }

    activeRunId += 1;
    const runId = activeRunId;
    activeBackend = resolvePreferredBackend();
    paused.value = false;
    clearNativeResumeWaiter();

    if (activeBackend === 'none') {
      throw new Error('浏览器不支持语音合成');
    }

    if (activeBackend === 'android-native') {
      stopAndroidNativeTTS();
    } else {
      resumeBrowserSpeech();
      window.speechSynthesis.cancel();
      await new Promise((resolve) => window.setTimeout(resolve, CANCEL_SETTLE_MS));
    }

    total.value = normalizedSegments.length;
    progress.value = 0;
    currentSegmentIndex.value = -1;
    currentParagraphIndex.value = -1;

    try {
      if (activeBackend === 'android-native' && supportsAndroidNativeTTSQueue()) {
        const voices = await ensureVoices();
        if (runId !== activeRunId) throw stoppedError();
        if (voices.length === 0) {
          throw new Error('Android native TTS has no available voice');
        }

        const firstOptions = normalizedSegments[0]?.options;
        const result = await speakAndroidNativeQueue({
          segments: normalizedSegments,
          voices,
          options: firstOptions,
          runId,
          getActiveRunId: () => activeRunId,
          startTimeoutMs: SPEECH_START_TIMEOUT_MS,
          onStart: (voiceName) => {
            currentVoiceName.value = voiceName || DEFAULT_LANG;
          },
          onEventStateChange: (state) => {
            if (state === 'start') {
              speaking.value = true;
              paused.value = false;
              return;
            }
            speaking.value = false;
          },
          onSegmentStart: (segment, index, segmentTotal) => {
            if (runId !== activeRunId) return;
            progress.value = index + 1;
            total.value = segmentTotal;
            currentSegmentIndex.value = index;
            currentParagraphIndex.value = segment.paragraphIndex ?? index;
            currentText.value = segment.text;
            queueOptions.onSegmentStart?.(segment, index, segmentTotal);
          },
          onSegmentEnd: (segment, index, segmentTotal) => {
            if (runId !== activeRunId) return;
            queueOptions.onSegmentEnd?.(segment, index, segmentTotal);
          },
        });

        if (result !== 'done') {
          throw stoppedError();
        }
        return;
      }

      for (let index = 0; index < normalizedSegments.length; index += 1) {
        if (runId !== activeRunId) {
          throw stoppedError();
        }

        const segment = normalizedSegments[index];
        progress.value = index + 1;
        currentSegmentIndex.value = index;
        currentParagraphIndex.value = segment.paragraphIndex ?? index;
        queueOptions.onSegmentStart?.(segment, index, normalizedSegments.length);

        while (true) {
          const result = await speakSegment(segment, runId);
          if (result === 'done') break;
          if (runId !== activeRunId) throw stoppedError();
          if (!paused.value || activeBackend !== 'android-native') throw stoppedError();
          await waitForNativeResume(runId);
        }

        if ((env.isIOS || env.isWeChat) && index < normalizedSegments.length - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, MOBILE_SEGMENT_SETTLE_MS));
        }

        queueOptions.onSegmentEnd?.(segment, index, normalizedSegments.length);
      }
    } finally {
      if (runId === activeRunId) {
        resetPlaybackState();
      }
    }
  }

  function pause() {
    if (!isSupported() || !speaking.value) return;

    if (getCurrentBackend() === 'android-native') {
      paused.value = true;
      speaking.value = false;
      stopAndroidNativeTTS();
      return;
    }

    window.speechSynthesis.pause();
    paused.value = true;
  }

  function resume() {
    if (!isSupported() || !paused.value) return;

    if (getCurrentBackend() === 'android-native') {
      paused.value = false;
      clearNativeResumeWaiter();
      return;
    }

    window.speechSynthesis.resume();
    paused.value = false;
  }

  function stop() {
    if (!isSupported()) return;

    activeRunId += 1;
    stopResumeKeepAlive();
    clearNativeResumeWaiter();

    if (getCurrentBackend() === 'android-native') {
      stopAndroidNativeTTS();
    } else {
      resumeBrowserSpeech();
      window.speechSynthesis.cancel();
    }

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
    isSupported,
    getPreferredBackend: resolvePreferredBackend,
    loadVoices: ensureVoices,
    getVoices,
    getChineseVoices: getChineseVoiceList,
    prime,
    speak,
    speakQueue,
    pause,
    resume,
    stop,
  };
}
