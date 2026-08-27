/**
 * OpenAI TTS 引擎
 *
 * 通过 OpenAI /v1/audio/speech 端点合成语音。
 * 支持 tts-1 和 tts-1-hd 模型，6 种内置声音。
 * 流式返回音频数据（MP3 格式）。
 */

import type {
  ITTSEngine,
  SynthesizeParams,
  SynthesizeResult,
  VoiceListItem,
  PreviewParams,
} from '../tts-types.js';
import { recordAiUsage } from '../../ai/usage-recorder.js';

/** OpenAI TTS 支持的声音 */
type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/** OpenAI TTS 支持的模型 */
type OpenAITTSModel = 'tts-1' | 'tts-1-hd';

/** 输出比特率（kbps），用于估算时长 */
const OUTPUT_BITRATE_KBPS = 96;

/** 根据 MP3 Buffer 大小估算时长 */
function durationFromBufferSize(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  return Math.round((buffer.length * 8) / OUTPUT_BITRATE_KBPS);
}

/** 根据文本长度估算时长（降级方案） */
function estimateDuration(text: string): number {
  return Math.max(500, Math.round((text.length / 4) * 1000));
}

/** 从环境变量读取 OpenAI TTS 配置 */
function getOpenAITTSConfig() {
  return {
    apiKey: process.env.TTS_OPENAI_KEY ?? '',
    baseUrl: (process.env.TTS_OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: (process.env.TTS_OPENAI_MODEL ?? 'tts-1') as OpenAITTSModel,
    voice: (process.env.TTS_OPENAI_VOICE ?? 'alloy') as OpenAIVoice,
  };
}

/** OpenAI 声音预设列表 */
const OPENAI_VOICES: VoiceListItem[] = [
  { name: 'alloy', gender: 'female', label: 'Alloy（中性）', locale: 'multi', ageTags: ['青年'], styleTags: ['中性', '平衡'], hasStyles: false, engine: 'openai-tts' },
  { name: 'echo', gender: 'male', label: 'Echo（男，沉稳）', locale: 'multi', ageTags: ['中年'], styleTags: ['沉稳', '低沉'], hasStyles: false, engine: 'openai-tts' },
  { name: 'fable', gender: 'male', label: 'Fable（男，叙事）', locale: 'multi', ageTags: ['青年'], styleTags: ['叙事', '故事'], hasStyles: false, engine: 'openai-tts' },
  { name: 'onyx', gender: 'male', label: 'Onyx（男，深沉）', locale: 'multi', ageTags: ['中年'], styleTags: ['深沉', '权威'], hasStyles: false, engine: 'openai-tts' },
  { name: 'nova', gender: 'female', label: 'Nova（女，活泼）', locale: 'multi', ageTags: ['青年'], styleTags: ['活泼', '温暖'], hasStyles: false, engine: 'openai-tts' },
  { name: 'shimmer', gender: 'female', label: 'Shimmer（女，柔和）', locale: 'multi', ageTags: ['青年'], styleTags: ['柔和', '清澈'], hasStyles: false, engine: 'openai-tts' },
];

/** 验证声音名称是否有效 */
const VALID_VOICES = new Set<string>(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);

export class OpenAITTSEngine implements ITTSEngine {
  readonly engine = 'openai-tts' as const;

  async synthesize(params: SynthesizeParams): Promise<SynthesizeResult> {
    const { text, voice } = params;
    const config = getOpenAITTSConfig();

    if (!config.apiKey) {
      throw new Error('OpenAI TTS 未配置：缺少 TTS_OPENAI_KEY');
    }

    const voiceName = voice && VALID_VOICES.has(voice) ? voice : config.voice;
    const endpoint = `${config.baseUrl}/audio/speech`;

    const requestBody = {
      model: config.model,
      input: text,
      voice: voiceName,
      response_format: 'mp3',
      speed: params.rate ? parseSpeedRate(params.rate) : 1.0,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`OpenAI TTS 请求失败 (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await recordAiUsage({
      usageKind: 'tts',
      provider: 'openai-tts',
      model: config.model,
      requestCount: 1,
      promptChars: text.length,
      outputChars: 0,
      metadata: {
        voice: voiceName,
      },
    });

    return {
      buffer,
      duration: durationFromBufferSize(buffer) || estimateDuration(text),
    };
  }

  async getVoices(): Promise<VoiceListItem[]> {
    return OPENAI_VOICES;
  }

  async preview(params: PreviewParams): Promise<SynthesizeResult> {
    return this.synthesize({
      text: params.text,
      voice: params.voice,
      rate: params.rate,
    });
  }

  async isAvailable(): Promise<boolean> {
    const config = getOpenAITTSConfig();
    if (!config.apiKey) return false;

    try {
      const result = await this.synthesize({ text: 'test', voice: config.voice });
      return result.buffer.length > 0;
    } catch {
      return false;
    }
  }
}

/**
 * 将 Edge TTS 格式的语速字符串（如 '+20%', '-10%'）转换为 OpenAI speed 数值（0.25-4.0）
 * OpenAI speed: 1.0 = 正常，2.0 = 两倍速
 */
function parseSpeedRate(rate: string): number {
  const match = rate.match(/^([+-]?\d+)%$/);
  if (!match) return 1.0;
  const percent = parseInt(match[1], 10);
  // +20% → 1.2, -10% → 0.9
  const speed = 1.0 + percent / 100;
  return Math.max(0.25, Math.min(4.0, speed));
}
