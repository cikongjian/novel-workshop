import {
  DEFAULT_LANG,
  normalizeSpeechRate,
  selectPreferredVoice,
  type ClientTTSVoiceOptions,
} from './client-tts-voice';

const ANDROID_NATIVE_TTS_EVENT = 'nw-android-tts';

interface AndroidNativeTTSVoice {
  name: string;
  lang: string;
  default?: boolean;
  localService?: boolean;
  voiceURI?: string;
}

interface AndroidNativeTTSEventDetail {
  type:
    | 'ready'
    | 'voices'
    | 'queue-start'
    | 'segment-start'
    | 'segment-end'
    | 'start'
    | 'end'
    | 'error'
    | 'stop';
  requestId?: string;
  message?: string;
  voiceName?: string;
  voices?: AndroidNativeTTSVoice[];
  queueIndex?: number;
  queueTotal?: number;
  paragraphIndex?: number;
  text?: string;
  ready?: boolean;
  available?: boolean;
  voiceCount?: number;
  needsInstall?: boolean;
  needsSettings?: boolean;
  preferredSetupAction?: 'none' | 'settings' | 'install' | string;
}

interface AndroidNativeTTSStatus {
  engineId: string;
  ready: boolean;
  available: boolean;
  voiceCount: number;
  needsInstall: boolean;
  needsSettings: boolean;
  message: string;
  preferredSetupAction: 'none' | 'settings' | 'install' | string;
}

interface AndroidNativeTTSBridge {
  isAvailable?: () => boolean | string | number;
  getVoicesJson?: () => string;
  getStatusJson?: () => string;
  speak?: (
    requestId: string,
    text: string,
    rate: number,
    pitch: number,
    voiceName: string,
  ) => boolean | string | number;
  speakQueue?: (
    requestId: string,
    segmentsJson: string,
    rate: number,
    pitch: number,
    voiceName: string,
  ) => boolean | string | number;
  supportsQueue?: () => boolean | string | number;
  stop?: (requestId?: string) => void;
  openTtsSettings?: () => boolean | string | number;
  installTtsData?: () => boolean | string | number;
  canOpenTtsSettings?: () => boolean | string | number;
  canInstallTtsData?: () => boolean | string | number;
  getPreferredSetupAction?: () => string;
}

declare global {
  interface Window {
    AndroidTTS?: AndroidNativeTTSBridge;
  }
}

function getBridge(): AndroidNativeTTSBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.AndroidTTS;
  if (!bridge || typeof bridge.speak !== 'function') return null;
  return bridge;
}

function parseBoolean(value: boolean | string | number | null | undefined, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (normalized === 'true' || normalized === '1' || normalized === 'ok') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return fallback;
}

function toSpeechSynthesisVoice(voice: AndroidNativeTTSVoice): SpeechSynthesisVoice {
  return {
    default: voice.default ?? false,
    lang: voice.lang || 'zh-CN',
    localService: voice.localService ?? true,
    name: voice.name,
    voiceURI: voice.voiceURI || `android:${voice.name}`,
  };
}

export function hasAndroidNativeTTSBridge(): boolean {
  return getBridge() != null;
}

export function supportsAndroidNativeTTSQueue(): boolean {
  const bridge = getBridge();
  if (!bridge || typeof bridge.speakQueue !== 'function') return false;
  if (typeof bridge.supportsQueue !== 'function') return true;
  try {
    return parseBoolean(bridge.supportsQueue(), false);
  } catch {
    return false;
  }
}

export function readAndroidNativeVoices(): SpeechSynthesisVoice[] {
  const bridge = getBridge();
  if (!bridge || typeof bridge.getVoicesJson !== 'function') return [];

  try {
    const payload = bridge.getVoicesJson();
    if (!payload) return [];
    const voices = JSON.parse(payload) as AndroidNativeTTSVoice[];
    if (!Array.isArray(voices)) return [];
    return voices
      .filter((voice) => typeof voice?.name === 'string' && voice.name.trim().length > 0)
      .map((voice) => toSpeechSynthesisVoice(voice));
  } catch {
    return [];
  }
}

export function readAndroidNativeStatus(): AndroidNativeTTSStatus {
  const bridge = getBridge();
  if (!bridge) {
    return {
      engineId: 'none',
      ready: false,
      available: false,
      voiceCount: 0,
      needsInstall: false,
      needsSettings: false,
      message: '',
      preferredSetupAction: 'none',
    };
  }

  if (typeof bridge.getStatusJson === 'function') {
    try {
      const payload = bridge.getStatusJson();
      if (payload) {
        const parsed = JSON.parse(payload) as Partial<AndroidNativeTTSStatus>;
        return {
          engineId: typeof parsed.engineId === 'string' ? parsed.engineId : 'system',
          ready: parseBoolean(parsed.ready as boolean | string | number | undefined, false),
          available: parseBoolean(parsed.available as boolean | string | number | undefined, false),
          voiceCount: typeof parsed.voiceCount === 'number' ? parsed.voiceCount : 0,
          needsInstall: parseBoolean(parsed.needsInstall as boolean | string | number | undefined, false),
          needsSettings: parseBoolean(parsed.needsSettings as boolean | string | number | undefined, false),
          message: typeof parsed.message === 'string' ? parsed.message : '',
          preferredSetupAction:
            typeof parsed.preferredSetupAction === 'string' ? parsed.preferredSetupAction : 'none',
        };
      }
    } catch {
      // Ignore JSON parsing failures and fall through to legacy checks.
    }
  }

  const available = typeof bridge.isAvailable === 'function'
    ? parseBoolean(bridge.isAvailable(), false)
    : true;
  return {
    engineId: 'system',
    ready: available,
    available,
    voiceCount: readAndroidNativeVoices().length,
    needsInstall: !available,
    needsSettings: !available,
    message: available ? '' : '未检测到可用中文语音，请先在系统文字转语音设置里安装或切换中文语音',
    preferredSetupAction: available ? 'none' : 'settings',
  };
}

export function openAndroidNativeTtsSettings(): boolean {
  const bridge = getBridge();
  if (!bridge || typeof bridge.openTtsSettings !== 'function') return false;
  try {
    return parseBoolean(bridge.openTtsSettings(), false);
  } catch {
    return false;
  }
}

export function installAndroidNativeTtsData(): boolean {
  const bridge = getBridge();
  if (!bridge || typeof bridge.installTtsData !== 'function') return false;
  try {
    return parseBoolean(bridge.installTtsData(), false);
  } catch {
    return false;
  }
}

export function waitForAndroidNativeVoices(timeoutMs: number): Promise<SpeechSynthesisVoice[]> {
  const immediate = readAndroidNativeVoices();
  if (immediate.length > 0) {
    return Promise.resolve(immediate);
  }
  if (!hasAndroidNativeTTSBridge() || typeof window === 'undefined') {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener(ANDROID_NATIVE_TTS_EVENT, handleEvent as EventListener);
      window.clearTimeout(timer);
    };

    const finish = () => {
      cleanup();
      resolve(readAndroidNativeVoices());
    };

    const handleEvent = (event: Event) => {
      const detail = (event as CustomEvent<AndroidNativeTTSEventDetail>).detail;
      if (!detail || (detail.type !== 'ready' && detail.type !== 'voices')) return;
      finish();
    };

    timer = window.setTimeout(finish, timeoutMs);
    window.addEventListener(ANDROID_NATIVE_TTS_EVENT, handleEvent as EventListener);
  });
}

export function onAndroidNativeTTSEvent(
  listener: (detail: AndroidNativeTTSEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<AndroidNativeTTSEventDetail>).detail;
    if (!detail) return;
    listener(detail);
  };

  window.addEventListener(ANDROID_NATIVE_TTS_EVENT, handleEvent as EventListener);
  return () => {
    window.removeEventListener(ANDROID_NATIVE_TTS_EVENT, handleEvent as EventListener);
  };
}

export function speakWithAndroidNativeTTS(input: {
  requestId: string;
  text: string;
  rate: number;
  pitch: number;
  voiceName?: string;
}): boolean {
  const bridge = getBridge();
  if (!bridge || typeof bridge.speak !== 'function') return false;

  try {
    return parseBoolean(
      bridge.speak(input.requestId, input.text, input.rate, input.pitch, input.voiceName ?? ''),
      true,
    );
  } catch {
    return false;
  }
}

export function speakWithAndroidNativeTTSQueue(input: {
  requestId: string;
  segments: Array<{ text: string; paragraphIndex?: number }>;
  rate: number;
  pitch: number;
  voiceName?: string;
}): boolean {
  const bridge = getBridge();
  if (!bridge || typeof bridge.speakQueue !== 'function') return false;

  try {
    return parseBoolean(
      bridge.speakQueue(
        input.requestId,
        JSON.stringify(input.segments),
        input.rate,
        input.pitch,
        input.voiceName ?? '',
      ),
      true,
    );
  } catch {
    return false;
  }
}

export function stopAndroidNativeTTS(requestId = ''): void {
  const bridge = getBridge();
  if (!bridge || typeof bridge.stop !== 'function') return;

  try {
    bridge.stop(requestId);
  } catch {
    // Ignore bridge stop failures and let the caller reset local state.
  }
}

export function speakAndroidNativeSegment(input: {
  text: string;
  voices: SpeechSynthesisVoice[];
  options?: ClientTTSVoiceOptions;
  runId: number;
  getActiveRunId: () => number;
  startTimeoutMs: number;
  onStart: (voiceName: string) => void;
  onEventStateChange: (state: 'start' | 'end' | 'stop') => void;
}): Promise<'done' | 'stopped'> {
  const text = input.text.trim();
  if (!text) {
    return Promise.resolve('done');
  }

  return new Promise((resolve, reject) => {
    const options = input.options ?? {};
    const selectedVoice = options.voiceName
      ? selectPreferredVoice(options, input.voices)
      : null;
    const requestId = `android-${input.runId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let started = false;
    let settled = false;
    let startTimer: number | null = null;
    let unlisten = () => undefined;

    const cleanup = () => {
      if (startTimer != null && typeof window !== 'undefined') {
        window.clearTimeout(startTimer);
        startTimer = null;
      }
      unlisten();
    };

    const settleResolve = (value: 'done' | 'stopped') => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    input.onStart(selectedVoice?.name ?? options.lang ?? DEFAULT_LANG);
    unlisten = onAndroidNativeTTSEvent((detail) => {
      if (detail.requestId !== requestId) return;

      if (detail.type === 'start') {
        started = true;
        input.onEventStateChange('start');
        input.onStart(detail.voiceName || selectedVoice?.name || DEFAULT_LANG);
        return;
      }

      if (detail.type === 'end') {
        input.onEventStateChange('end');
        settleResolve(input.runId === input.getActiveRunId() ? 'done' : 'stopped');
        return;
      }

      if (detail.type === 'stop') {
        input.onEventStateChange('stop');
        settleResolve('stopped');
        return;
      }

      if (detail.type === 'error') {
        input.onEventStateChange('stop');
        settleReject(new Error(detail.message || '安卓本地语音合成失败'));
      }
    });

    if (typeof window !== 'undefined') {
      startTimer = window.setTimeout(() => {
        if (started || input.runId !== input.getActiveRunId()) return;
        stopAndroidNativeTTS(requestId);
        settleReject(new Error('安卓本地语音没有成功启动，请检查系统文字转语音设置'));
      }, input.startTimeoutMs);
    }

    const accepted = speakWithAndroidNativeTTS({
      requestId,
      text,
      rate: normalizeSpeechRate(options.rate),
      pitch: options.pitch ?? 1.0,
      voiceName: options.voiceName || selectedVoice?.name,
    });

    if (!accepted) {
      cleanup();
      reject(new Error('安卓本地语音桥接调用失败'));
    }
  });
}

export function speakAndroidNativeQueue(input: {
  segments: Array<{ text: string; paragraphIndex?: number; options?: ClientTTSVoiceOptions }>;
  voices: SpeechSynthesisVoice[];
  options?: ClientTTSVoiceOptions;
  runId: number;
  getActiveRunId: () => number;
  startTimeoutMs: number;
  onSegmentStart: (segment: { text: string; paragraphIndex?: number }, index: number, total: number) => void;
  onSegmentEnd: (segment: { text: string; paragraphIndex?: number }, index: number, total: number) => void;
  onStart: (voiceName: string) => void;
  onEventStateChange: (state: 'start' | 'end' | 'stop') => void;
}): Promise<'done' | 'stopped'> {
  const segments = input.segments
    .map((segment) => ({
      text: segment.text.trim(),
      paragraphIndex: segment.paragraphIndex,
    }))
    .filter((segment) => segment.text.length > 0);

  if (segments.length === 0) {
    return Promise.resolve('done');
  }

  return new Promise((resolve, reject) => {
    const options = input.options ?? input.segments[0]?.options ?? {};
    const selectedVoice = options.voiceName
      ? selectPreferredVoice(options, input.voices)
      : null;
    const requestId = `android-queue-${input.runId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let started = false;
    let settled = false;
    let lastSegmentStartIndex = -1;
    let startTimer: number | null = null;
    let unlisten = () => undefined;

    const cleanup = () => {
      if (startTimer != null && typeof window !== 'undefined') {
        window.clearTimeout(startTimer);
        startTimer = null;
      }
      unlisten();
    };

    const settleResolve = (value: 'done' | 'stopped') => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const emitSegmentStart = (
      segment: { text: string; paragraphIndex?: number },
      index: number,
      total: number,
    ) => {
      if (index === lastSegmentStartIndex) return;
      lastSegmentStartIndex = index;
      input.onSegmentStart(segment, index, total);
    };

    input.onStart(selectedVoice?.name ?? options.lang ?? DEFAULT_LANG);
    unlisten = onAndroidNativeTTSEvent((detail) => {
      if (detail.requestId !== requestId) return;

      if (detail.type === 'queue-start') {
        started = true;
        input.onEventStateChange('start');
        input.onStart(detail.voiceName || selectedVoice?.name || DEFAULT_LANG);
        return;
      }

      if (detail.type === 'start') {
        started = true;
        input.onEventStateChange('start');
        input.onStart(detail.voiceName || selectedVoice?.name || DEFAULT_LANG);
        return;
      }

      if (detail.type === 'segment-start') {
        const index = typeof detail.queueIndex === 'number' ? detail.queueIndex : 0;
        const total = typeof detail.queueTotal === 'number' ? detail.queueTotal : segments.length;
        const segment = segments[index] ?? {
          text: detail.text ?? '',
          paragraphIndex: detail.paragraphIndex,
        };
        emitSegmentStart(segment, index, total);
        return;
      }

      if (detail.type === 'segment-end') {
        const index = typeof detail.queueIndex === 'number' ? detail.queueIndex : 0;
        const total = typeof detail.queueTotal === 'number' ? detail.queueTotal : segments.length;
        input.onSegmentEnd(segments[index] ?? { text: detail.text ?? '', paragraphIndex: detail.paragraphIndex }, index, total);
        return;
      }

      if (detail.type === 'end') {
        input.onEventStateChange('end');
        settleResolve(input.runId === input.getActiveRunId() ? 'done' : 'stopped');
        return;
      }

      if (detail.type === 'stop') {
        input.onEventStateChange('stop');
        settleResolve('stopped');
        return;
      }

      if (detail.type === 'error') {
        input.onEventStateChange('stop');
        settleReject(new Error(detail.message || 'Android native TTS queue failed'));
      }
    });

    if (typeof window !== 'undefined') {
      startTimer = window.setTimeout(() => {
        if (started || input.runId !== input.getActiveRunId()) return;
        stopAndroidNativeTTS(requestId);
        settleReject(new Error('Android native TTS did not start'));
      }, input.startTimeoutMs);
    }

    const accepted = speakWithAndroidNativeTTSQueue({
      requestId,
      segments,
      rate: normalizeSpeechRate(options.rate),
      pitch: options.pitch ?? 1.0,
      voiceName: options.voiceName || selectedVoice?.name,
    });

    if (!accepted) {
      cleanup();
      reject(new Error('Android native TTS queue bridge call failed'));
    }
  });
}
