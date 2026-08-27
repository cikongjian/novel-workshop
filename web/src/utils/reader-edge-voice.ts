import type { VoiceInfo } from '../api/tts';
import { formatReaderVoiceDisplay } from './reader-voice-display';

/** 在线音色在统一选项值中的前缀，用于和系统音色区分 */
export const EDGE_VOICE_PREFIX = 'edge:';
export const EDGE_ENGINE_MODE_STORAGE_KEY = 'nw-reader-tts:engine-mode';
export const EDGE_VOICE_STORAGE_KEY = 'nw-reader-tts:edge-voice';

/** 听书音色选项（在线 / 系统两组共用同一结构） */
export interface ReaderVoiceOption {
  value: string;
  label: string;
  title: string;
  detail: string;
  region: string;
  tone: string;
  isKnown: boolean;
  group: 'edge' | 'system';
}

export function isEdgeVoiceValue(value: string): boolean {
  return value.startsWith(EDGE_VOICE_PREFIX);
}

export function stripEdgePrefix(value: string): string {
  return value.slice(EDGE_VOICE_PREFIX.length);
}

export function buildEdgeVoiceValue(name: string): string {
  return `${EDGE_VOICE_PREFIX}${name}`;
}

/** 把后端在线音色映射成面板用的统一选项（group 标记为 edge） */
export function mapEdgeVoiceToOption(voice: VoiceInfo): ReaderVoiceOption {
  const display = formatReaderVoiceDisplay(voice.name, voice.locale);
  return {
    value: buildEdgeVoiceValue(voice.name),
    label: display.label,
    title: display.title,
    detail: display.detail,
    region: display.region,
    tone: display.tone,
    isKnown: display.isKnown,
    group: 'edge',
  };
}
