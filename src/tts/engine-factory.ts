/**
 * TTS 引擎工厂
 *
 * 根据配置创建对应的 TTS 引擎实例。
 * 默认使用 Edge TTS，可通过配置切换到 Qwen3-TTS。
 *
 * 混合模式：当主引擎为 Qwen3-TTS 时，旁白仍可使用 Edge TTS 加速。
 */

import type { ITTSEngine, TTSEngineType } from './tts-types.js';
import {
  getKokoroTTSUrl,
  getNarrationEngineType,
  getQwen3TTSUrl,
  getTTSEngineType,
  type NarrationEngineType,
} from './engine-config.js';
import { EdgeTTSEngine } from './engines/edge-tts-engine.js';
import { Qwen3TTSEngine } from './engines/qwen3-tts-engine.js';
import { AzureTTSEngine } from './engines/azure-tts-engine.js';
import { OpenAITTSEngine } from './engines/openai-tts-engine.js';
import { KokoroTTSEngine } from './engines/kokoro-tts-engine.js';

/** 已创建的引擎实例缓存（单例） */
let cachedEngine: ITTSEngine | null = null;
let cachedEngineType: TTSEngineType | null = null;

/** Edge TTS 引擎单例（混合模式下旁白专用） */
let edgeEngineInstance: EdgeTTSEngine | null = null;

/** Kokoro 引擎单例（混合模式下旁白专用） */
let kokoroEngineInstance: KokoroTTSEngine | null = null;
export {
  getKokoroTTSUrl,
  getNarrationEngineType,
  getQwen3TTSUrl,
  getTTSEngineType,
};
export type { NarrationEngineType };

/**
 * 创建 TTS 引擎实例
 *
 * 使用工厂模式，根据引擎类型创建对应实例。
 * 引擎实例会被缓存，相同类型只创建一次。
 */
export function getTTSEngine(): ITTSEngine {
  const engineType = getTTSEngineType();

  // 如果引擎类型没变，返回缓存实例
  if (cachedEngine && cachedEngineType === engineType) {
    return cachedEngine;
  }

  switch (engineType) {
    case 'qwen3-tts': {
      cachedEngine = new Qwen3TTSEngine();
      cachedEngineType = engineType;
      return cachedEngine;
    }
    case 'azure-tts': {
      cachedEngine = new AzureTTSEngine();
      cachedEngineType = engineType;
      return cachedEngine;
    }
    case 'openai-tts': {
      cachedEngine = new OpenAITTSEngine();
      cachedEngineType = engineType;
      return cachedEngine;
    }
    case 'edge-tts':
    default: {
      cachedEngine = new EdgeTTSEngine();
      cachedEngineType = engineType;
      return cachedEngine;
    }
  }
}

/**
 * 获取 Edge TTS 引擎实例（混合模式专用）
 *
 * 当主引擎为 Qwen3-TTS 时，旁白段落仍使用 Edge TTS 合成以节省 GPU 时间。
 * 此方法返回独立的 Edge TTS 实例，不影响主引擎。
 */
export function getEdgeTTSEngine(): EdgeTTSEngine {
  if (!edgeEngineInstance) {
    edgeEngineInstance = new EdgeTTSEngine();
  }
  return edgeEngineInstance;
}

/**
 * 获取 Kokoro TTS 引擎实例（混合模式旁白专用）
 *
 * 纯 CPU 推理，82M 参数，极快，不占 GPU。
 */
export function getKokoroTTSEngine(): KokoroTTSEngine {
  if (!kokoroEngineInstance) {
    kokoroEngineInstance = new KokoroTTSEngine();
  }
  return kokoroEngineInstance;
}

/**
 * 获取混合模式下的旁白引擎实例
 *
 * 根据 TTS_NARRATION_ENGINE 配置返回 Edge TTS 或 Kokoro 引擎。
 */
export function getNarrationEngine(): ITTSEngine {
  const type = getNarrationEngineType();
  if (type === 'kokoro') return getKokoroTTSEngine();
  return getEdgeTTSEngine();
}

/**
 * 清除引擎缓存，下次调用 getTTSEngine() 将重新创建
 * 用于设置页面切换引擎后刷新实例
 */
export function resetTTSEngine(): void {
  cachedEngine = null;
  cachedEngineType = null;
  kokoroEngineInstance = null;
}
