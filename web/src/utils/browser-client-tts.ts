import {
  DEFAULT_LANG,
  normalizeSpeechRate,
  selectPreferredVoice,
  type ClientTTSVoiceOptions,
} from './client-tts-voice';

export function isBrowserSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function createBrowserVoiceLoader(
  timeoutMs: number,
  updateVoices: (voices: SpeechSynthesisVoice[]) => void,
) {
  let voicesLoadingPromise: Promise<SpeechSynthesisVoice[]> | null = null;

  const readVoices = (): SpeechSynthesisVoice[] => {
    if (!isBrowserSpeechSupported()) return [];
    const voices = window.speechSynthesis.getVoices();
    updateVoices(voices);
    return voices;
  };

  const ensureVoices = async (): Promise<SpeechSynthesisVoice[]> => {
    if (!isBrowserSpeechSupported()) return [];

    const immediate = readVoices();
    if (immediate.length > 0) return immediate;
    if (voicesLoadingPromise) return voicesLoadingPromise;

    voicesLoadingPromise = new Promise((resolve) => {
      const finish = () => {
        if (typeof speechSynthesis.removeEventListener === 'function') {
          speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
        }
        window.clearTimeout(timer);
        const voices = readVoices();
        voicesLoadingPromise = null;
        resolve(voices);
      };

      const handleVoicesChanged = () => finish();
      const timer = window.setTimeout(finish, timeoutMs);

      if (typeof speechSynthesis.addEventListener === 'function') {
        speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged, { once: true });
      }
    });

    return voicesLoadingPromise;
  };

  return {
    readVoices,
    ensureVoices,
  };
}

export function resumeBrowserSpeech(): void {
  if (!isBrowserSpeechSupported()) return;

  try {
    window.speechSynthesis.resume();
  } catch {
    // Ignore resume errors from browser/runtime edge cases.
  }
}

export function primeBrowserSpeech(): void {
  if (!isBrowserSpeechSupported()) return;

  try {
    resumeBrowserSpeech();
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance('。');
    utterance.volume = 0;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.lang = DEFAULT_LANG;
    window.speechSynthesis.speak(utterance);
    window.setTimeout(() => {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancellation errors from inconsistent browser implementations.
      }
    }, 0);
  } catch {
    // Ignore priming failures and let normal speak flow surface the actual error.
  }
}

export function speakBrowserSegment(input: {
  text: string;
  voices: SpeechSynthesisVoice[];
  options?: ClientTTSVoiceOptions;
  runId: number;
  getActiveRunId: () => number;
  startTimeoutMs: number;
  onStart: (voiceName: string) => void;
  onBeforeSpeak: () => void;
  onAfterSpeak: () => void;
}): Promise<'done' | 'stopped'> {
  const text = input.text.trim();
  if (!text) {
    return Promise.resolve('done');
  }

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    let started = false;
    let settled = false;
    let startTimer: number | null = null;

    const cleanup = () => {
      if (startTimer != null && typeof window !== 'undefined') {
        window.clearTimeout(startTimer);
        startTimer = null;
      }
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

    const options = input.options ?? {};
    utterance.rate = normalizeSpeechRate(options.rate);
    utterance.pitch = options.pitch ?? 1.0;
    utterance.volume = options.volume ?? 1.0;
    utterance.lang = options.lang ?? DEFAULT_LANG;

    const selectedVoice = selectPreferredVoice(options, input.voices);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang || utterance.lang;
      input.onStart(selectedVoice.name);
    } else {
      input.onStart(utterance.lang);
    }

    utterance.onstart = () => {
      if (input.runId !== input.getActiveRunId()) return;
      started = true;
      input.onBeforeSpeak();
      cleanup();
    };

    utterance.onend = () => {
      input.onAfterSpeak();
      if (!started) {
        settleReject(new Error('语音输出未启动，请检查浏览器声音权限或系统语音服务'));
        return;
      }
      settleResolve(input.runId === input.getActiveRunId() ? 'done' : 'stopped');
    };

    utterance.onerror = (event) => {
      input.onAfterSpeak();
      if (
        input.runId !== input.getActiveRunId() ||
        event.error === 'canceled' ||
        event.error === 'interrupted'
      ) {
        settleResolve('stopped');
        return;
      }
      settleReject(new Error(`语音合成失败: ${event.error}`));
    };

    resumeBrowserSpeech();
    if (typeof window !== 'undefined') {
      startTimer = window.setTimeout(() => {
        if (started || input.runId !== input.getActiveRunId()) return;
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore cancellation errors from inconsistent browser implementations.
        }
        settleReject(new Error('本地语音没有成功启动，可能是当前手机浏览器不支持或未安装系统语音'));
      }, input.startTimeoutMs);
    }
    window.speechSynthesis.speak(utterance);
  });
}
