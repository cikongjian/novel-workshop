/**
 * Azure Cognitive Services TTS 引擎
 *
 * 通过 REST API 调用 Azure TTS 服务，支持 SSML 请求。
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

/** Azure TTS 配置 */
export interface AzureTTSConfig {
  /** Azure Cognitive Services 订阅密钥 */
  azureKey: string;
  /** Azure 区域（如 eastus, westus2, eastasia） */
  azureRegion: string;
  /** 默认声音名称 */
  voice?: string;
}

/** 输出格式：24kHz 96kbps MP3（与 Edge TTS 保持一致） */
const OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
const OUTPUT_BITRATE_KBPS = 96;

/** XML 特殊字符转义 */
function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 根据 MP3 Buffer 大小估算时长 */
function durationFromBufferSize(buffer: Buffer): number {
  if (buffer.length === 0) return 0;
  return Math.round((buffer.length * 8) / OUTPUT_BITRATE_KBPS);
}

/** 根据文本长度估算时长（降级方案） */
function estimateDuration(text: string): number {
  return Math.max(500, Math.round((text.length / 4) * 1000));
}

/** 构建 SSML 请求体 */
function buildSSML(text: string, voice: string, rate?: string): string {
  const escapedText = escapeXML(text);
  const rateAttr = rate ? ` rate="${rate}"` : '';
  const prosodyOpen = rate ? `<prosody${rateAttr}>` : '';
  const prosodyClose = rate ? '</prosody>' : '';

  return [
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">',
    `<voice name="${voice}">`,
    prosodyOpen,
    escapedText,
    prosodyClose,
    '</voice>',
    '</speak>',
  ].join('');
}

/** 从环境变量读取 Azure TTS 配置 */
function getAzureConfig(): AzureTTSConfig {
  return {
    azureKey: process.env.TTS_AZURE_KEY ?? '',
    azureRegion: process.env.TTS_AZURE_REGION ?? 'eastasia',
    voice: process.env.TTS_AZURE_VOICE ?? 'zh-CN-YunxiNeural',
  };
}

/** Azure 中文声音预设列表 */
const AZURE_VOICES: VoiceListItem[] = [
  { name: 'zh-CN-XiaoxiaoNeural', gender: 'female', label: '晓晓（女，温柔）', locale: 'zh-CN', ageTags: ['青年'], styleTags: ['温柔', '新闻'], hasStyles: true, engine: 'azure-tts' },
  { name: 'zh-CN-YunxiNeural', gender: 'male', label: '云希（男，少年）', locale: 'zh-CN', ageTags: ['少年', '青年'], styleTags: ['活泼', '叙述'], hasStyles: true, engine: 'azure-tts' },
  { name: 'zh-CN-YunjianNeural', gender: 'male', label: '云健（男，阳刚）', locale: 'zh-CN', ageTags: ['青年', '中年'], styleTags: ['阳刚', '纪录片'], hasStyles: true, engine: 'azure-tts' },
  { name: 'zh-CN-XiaoyiNeural', gender: 'female', label: '晓伊（女，活泼）', locale: 'zh-CN', ageTags: ['青年'], styleTags: ['活泼'], hasStyles: false, engine: 'azure-tts' },
  { name: 'zh-CN-YunyangNeural', gender: 'male', label: '云扬（男，新闻）', locale: 'zh-CN', ageTags: ['中年'], styleTags: ['新闻', '专业'], hasStyles: true, engine: 'azure-tts' },
  { name: 'zh-CN-XiaochenNeural', gender: 'female', label: '晓辰（女，沉稳）', locale: 'zh-CN', ageTags: ['青年', '中年'], styleTags: ['沉稳'], hasStyles: false, engine: 'azure-tts' },
];

export class AzureTTSEngine implements ITTSEngine {
  readonly engine = 'azure-tts' as const;

  async synthesize(params: SynthesizeParams): Promise<SynthesizeResult> {
    const { text, voice, rate } = params;
    const config = getAzureConfig();

    if (!config.azureKey) {
      throw new Error('Azure TTS 未配置：缺少 TTS_AZURE_KEY');
    }

    const voiceName = voice || config.voice || 'zh-CN-YunxiNeural';
    const ssml = buildSSML(text, voiceName, rate);
    const endpoint = `https://${config.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.azureKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
        'User-Agent': 'novel-workshop',
      },
      body: ssml,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Azure TTS 请求失败 (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await recordAiUsage({
      usageKind: 'tts',
      provider: 'azure-tts',
      model: 'azure-standard',
      requestCount: 1,
      promptChars: text.length,
      outputChars: 0,
      metadata: {
        voice: voiceName,
        region: config.azureRegion,
      },
    });

    return {
      buffer,
      duration: durationFromBufferSize(buffer) || estimateDuration(text),
    };
  }

  async getVoices(): Promise<VoiceListItem[]> {
    return AZURE_VOICES;
  }

  async preview(params: PreviewParams): Promise<SynthesizeResult> {
    return this.synthesize({
      text: params.text,
      voice: params.voice,
      rate: params.rate,
    });
  }

  async isAvailable(): Promise<boolean> {
    const config = getAzureConfig();
    if (!config.azureKey || !config.azureRegion) return false;

    try {
      const result = await this.synthesize({ text: '测试', voice: config.voice });
      return result.buffer.length > 0;
    } catch {
      return false;
    }
  }
}
