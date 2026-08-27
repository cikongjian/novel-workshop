import type { TTSEngineType } from './tts-types.js';

/** 旁白引擎类型 */
export type NarrationEngineType = 'edge-tts' | 'kokoro';

/**
 * 获取当前配置的 TTS 引擎类型
 */
export function getTTSEngineType(): TTSEngineType {
  const envEngine = process.env.TTS_ENGINE;
  if (envEngine === 'qwen3-tts') return 'qwen3-tts';
  if (envEngine === 'azure-tts') return 'azure-tts';
  if (envEngine === 'openai-tts') return 'openai-tts';
  return 'edge-tts';
}

/**
 * 获取 Qwen3-TTS 服务地址
 */
export function getQwen3TTSUrl(): string {
  return process.env.QWEN3_TTS_URL || 'http://127.0.0.1:8765';
}

/**
 * 获取 Kokoro TTS 服务地址
 */
export function getKokoroTTSUrl(): string {
  return process.env.KOKORO_URL || 'http://127.0.0.1:8767';
}

/**
 * 获取混合模式下旁白引擎类型
 */
export function getNarrationEngineType(): NarrationEngineType {
  const env = process.env.TTS_NARRATION_ENGINE;
  if (env === 'kokoro') return 'kokoro';
  return 'edge-tts';
}
