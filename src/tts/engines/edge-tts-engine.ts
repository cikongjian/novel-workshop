/**
 * Edge TTS 引擎封装
 *
 * 将现有 Edge TTS 合成逻辑封装为 ITTSEngine 接口实现。
 * 行为与重构前完全一致，仅在结构上进行了抽象。
 */

import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import type { ITTSEngine, SynthesizeParams, SynthesizeResult, VoiceListItem, PreviewParams } from '../tts-types.js';
import { VOICE_PROFILES } from '../voice-mapper.js';
import { recordAiUsage } from '../../ai/usage-recorder.js';

/** 高码率输出格式（96kbps，比默认 48kbps 质量更高） */
const EDGE_OUTPUT_FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;

/** 输出比特率（kbps），与 OUTPUT_FORMAT 对应 */
const OUTPUT_BITRATE_KBPS = 96;
const RATE_PATTERN = /^(?:default|x-slow|slow|medium|fast|x-fast|[+-]?\d+(?:\.\d+)?%?)$/;

function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeRate(rate: string | undefined): string | undefined {
  if (!rate) return undefined;
  if (!RATE_PATTERN.test(rate)) {
    throw new Error('Edge TTS 语速格式无效');
  }
  return rate;
}

async function readAudioStream(stream: AsyncIterable<Buffer | string>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * 根据 MP3 音频 Buffer 大小计算时长（毫秒）
 * duration_ms = (bytes * 8) / bitrate_kbps
 */
function durationFromBufferSize(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  return Math.round((buffer.length * 8) / OUTPUT_BITRATE_KBPS);
}

/**
 * 根据文本长度估算时长（毫秒）
 * 中文约 4 字/秒，作为最后的降级方案
 */
function estimateDuration(text: string): number {
  const charCount = text.length;
  return Math.max(500, Math.round((charCount / 4) * 1000));
}

export class EdgeTTSEngine implements ITTSEngine {
  readonly engine = 'edge-tts' as const;

  async synthesize(params: SynthesizeParams): Promise<SynthesizeResult> {
    const { text, voice } = params;

    if (!voice) {
      throw new Error('Edge TTS 引擎需要指定 voice 参数');
    }
    const rate = normalizeRate(params.rate);

    // 重试机制：微软 Edge TTS 在高频调用时限速会返回空/截断数据，
    // 自动重试 + 指数退避能恢复大部分情况
    const MAX_RETRIES = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }

      try {
        const tts = new MsEdgeTTS();
        let buffer: Buffer;
        try {
          await tts.setMetadata(voice, EDGE_OUTPUT_FORMAT);
          const { audioStream } = tts.toStream(escapeXmlText(text), { rate });
          buffer = await readAudioStream(audioStream);
        } finally {
          tts.close();
        }

        // 校验 buffer 有效性：有效 mp3 至少几百字节，空或太小说明被限速截断
        if (!buffer || buffer.length < 100) {
          throw new Error(`合成结果为空或损坏 (buffer size: ${buffer?.length ?? 0})`);
        }

        await recordAiUsage({
          usageKind: 'tts',
          provider: 'edge-tts',
          model: voice,
          requestCount: 1,
          promptChars: text.length,
          outputChars: 0,
          metadata: {
            rate: params.rate ?? '',
          },
        });

        return {
          buffer,
          duration: durationFromBufferSize(buffer) || estimateDuration(text),
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES) {
          console.warn(`[EdgeTTS] synthesize 第 ${attempt + 1} 次失败，将重试: ${lastError.message}`);
        }
      }
    }

    throw lastError ?? new Error('Edge TTS 合成失败');
  }

  async getVoices(): Promise<VoiceListItem[]> {
    return VOICE_PROFILES.map(v => ({
      name: v.name,
      gender: v.gender,
      label: v.label ?? v.name,
      locale: v.locale ?? 'zh-CN',
      ageTags: v.ageTags,
      styleTags: v.styleTags,
      hasStyles: v.hasStyles,
      engine: 'edge-tts' as const,
    }));
  }

  async preview(params: PreviewParams): Promise<SynthesizeResult> {
    const { voice, text, rate } = params;

    // 验证声音名称有效
    const validVoice = VOICE_PROFILES.some(v => v.name === voice);
    if (!validVoice) {
      throw new Error(`无效的 Edge TTS 声音名称: ${voice}`);
    }

    return this.synthesize({ text, voice, rate });
  }

  async isAvailable(): Promise<boolean> {
    // 仅建立连接验证可用性，避免健康检查触发实际的文本合成请求。
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata('zh-CN-YunyangNeural', EDGE_OUTPUT_FORMAT);
      tts.close();
      return true;
    } catch {
      return false;
    }
  }
}
