/**
 * Kokoro TTS 引擎封装
 *
 * 通过 HTTP 调用本地 Kokoro FastAPI 服务实现旁白 TTS 合成。
 * 仅用于混合模式下的旁白合成，替代 Edge TTS。
 *
 * 特点：
 * - 纯 CPU 推理，82M 参数，极快（5-10x 实时率）
 * - 不占用 GPU，可与 Qwen3-TTS 并行工作
 * - 多种中文音色可选
 */

import type {
  ITTSEngine, SynthesizeParams, SynthesizeResult,
  VoiceListItem, PreviewParams,
} from '../tts-types.js';
import { getKokoroTTSUrl } from '../engine-config.js';
import { recordAiUsage } from '../../ai/usage-recorder.js';

/** 合成超时（毫秒）：Kokoro CPU 推理很快，30 秒足够 */
const SYNTHESIZE_TIMEOUT = 30_000;

/**
 * 将语速字符串转为 speed 浮点数
 * '+20%' → 1.2, '-10%' → 0.9, '' → 1.0
 */
function parseRateToSpeed(rate: string): number {
  const trimmed = rate.trim();
  if (!trimmed.endsWith('%')) return 1.0;
  const numericPart = trimmed.slice(0, -1);
  const digits = numericPart[0] === '+' || numericPart[0] === '-'
    ? numericPart.slice(1)
    : numericPart;
  if (!digits || [...digits].some((char) => char < '0' || char > '9')) return 1.0;
  return 1.0 + Number.parseInt(numericPart, 10) / 100;
}

export class KokoroTTSEngine implements ITTSEngine {
  readonly engine = 'kokoro' as const;

  private get baseUrl(): string {
    return getKokoroTTSUrl();
  }

  async synthesize(params: SynthesizeParams): Promise<SynthesizeResult> {
    const { text, voice, rate } = params;
    const speed = rate ? parseRateToSpeed(rate) : 1.0;

    const resp = await fetch(`${this.baseUrl}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: voice || '',
        speed,
      }),
      signal: AbortSignal.timeout(SYNTHESIZE_TIMEOUT),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` })) as { detail: string };
      throw new Error(`Kokoro synthesize 失败: ${err.detail}`);
    }

    const data = await resp.json() as { audio: string; duration: number };
    await recordAiUsage({
      usageKind: 'tts',
      provider: 'kokoro',
      model: 'kokoro-fastapi',
      requestCount: 1,
      promptChars: text.length,
      outputChars: 0,
      metadata: {
        voice: voice || '',
        speed,
      },
    });
    return {
      buffer: Buffer.from(data.audio, 'base64'),
      duration: data.duration,
    };
  }

  async getVoices(): Promise<VoiceListItem[]> {
    try {
      const resp = await fetch(`${this.baseUrl}/voices`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return [];
      const data = await resp.json() as {
        voices: Array<{ name: string; gender: string; label: string; lang: string }>;
      };
      return data.voices
        .filter(v => v.lang === 'z') // 只返回中文音色
        .map(v => ({
          name: v.name,
          gender: v.gender as 'male' | 'female',
          label: v.label,
          locale: 'zh-CN',
          ageTags: ['青年', '成年'],
          styleTags: [],
          hasStyles: false,
          engine: 'kokoro' as const,
        }));
    } catch {
      return [];
    }
  }

  async preview(params: PreviewParams): Promise<SynthesizeResult> {
    return this.synthesize({ text: params.text, voice: params.voice, rate: params.rate });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return false;
      const data = await resp.json() as { status: string };
      return data.status === 'ok';
    } catch {
      return false;
    }
  }
}
