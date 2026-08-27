export const SPEECH_RATE_MIN = 0.5;
export const SPEECH_RATE_MAX = 2.0;
export const SPEECH_RATE_DEFAULT = 1.0;
export const DEFAULT_LANG = 'zh-CN';

export interface ClientTTSVoiceOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
  voiceName?: string;
}

export function normalizeSpeechRate(rate?: number): number {
  return Math.max(SPEECH_RATE_MIN, Math.min(SPEECH_RATE_MAX, rate ?? SPEECH_RATE_DEFAULT));
}

export function getChineseVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((voice) => {
    const lang = voice.lang.toLowerCase();
    return lang.startsWith('zh') || lang.startsWith('cmn');
  });
}

function scoreVoice(voice: SpeechSynthesisVoice, options: ClientTTSVoiceOptions): number {
  const preferredLang = (options.lang ?? DEFAULT_LANG).toLowerCase();
  const baseLang = preferredLang.split('-')[0];
  const lang = voice.lang.toLowerCase();
  let score = 0;

  if (options.voiceName && voice.name === options.voiceName) score += 100;
  if (lang === preferredLang) score += 40;
  else if (lang.startsWith(baseLang)) score += 24;
  if (voice.localService) score += 8;
  if (voice.default) score += 6;
  if (/microsoft/i.test(voice.name)) score += 5;
  if (/xiaoxiao|xiaoyi|yunxi|yunyang|huihui|yaoyao/i.test(voice.name)) score += 4;
  if (/zh-cn/i.test(lang)) score += 3;

  return score;
}

export function selectPreferredVoice(
  options: ClientTTSVoiceOptions,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  if (options.voiceName) {
    const exact = voices.find((voice) => voice.name === options.voiceName);
    if (exact) return exact;
  }

  const preferredLang = (options.lang ?? DEFAULT_LANG).toLowerCase();
  const preferredVoices = voices
    .filter((voice) => voice.lang.toLowerCase().startsWith(preferredLang.split('-')[0]))
    .sort((a, b) => scoreVoice(b, options) - scoreVoice(a, options));

  if (preferredVoices.length > 0) {
    return preferredVoices[0];
  }

  const fallbackVoices = [...voices].sort((a, b) => scoreVoice(b, options) - scoreVoice(a, options));
  return fallbackVoices[0] ?? null;
}
