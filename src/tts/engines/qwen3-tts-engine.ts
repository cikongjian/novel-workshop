/**
 * Qwen3-TTS 引擎封装
 *
 * 通过 HTTP 调用本地 Python FastAPI 服务实现 TTS 合成。
 *
 * 合成优先级：
 * 1. voiceClonePromptData（角色专属克隆声音）
 * 2. speaker + instruct（预设音色 + 情感指令）
 * 3. speaker（预设音色默认风格）
 */

import type {
  ITTSEngine, SynthesizeParams, SynthesizeResult,
  VoiceListItem, PreviewParams,
} from '../tts-types.js';
import { getQwen3TTSUrl } from '../engine-config.js';
import { recordAiUsage } from '../../ai/usage-recorder.js';

/** Qwen3-TTS 预设音色 */
const QWEN3_PRESETS: VoiceListItem[] = [
  {
    name: 'Vivian', gender: 'female', label: 'Vivian（女·明亮清晰）',
    locale: 'zh-CN', ageTags: ['青年', '成年'], styleTags: ['明亮', '清晰', '活泼'],
    hasStyles: true, engine: 'qwen3-tts',
  },
  {
    name: 'Serena', gender: 'female', label: 'Serena（女·温柔知性）',
    locale: 'zh-CN', ageTags: ['青年', '成年'], styleTags: ['温柔', '知性', '柔和'],
    hasStyles: true, engine: 'qwen3-tts',
  },
  {
    name: 'Uncle_Fu', gender: 'male', label: 'Uncle Fu（男·老练低沉）',
    locale: 'zh-CN', ageTags: ['中年', '老年', '壮年'], styleTags: ['低沉', '老练', '沉稳', '苍老'],
    hasStyles: true, engine: 'qwen3-tts',
  },
  {
    name: 'Dylan', gender: 'male', label: 'Dylan（男·北京口音）',
    locale: 'zh-CN', ageTags: ['青年', '成年'], styleTags: ['北京', '方言', '爽朗', '活泼'],
    hasStyles: true, engine: 'qwen3-tts',
  },
  {
    name: 'Eric', gender: 'male', label: 'Eric（男·成都口音）',
    locale: 'zh-CN', ageTags: ['青年', '成年'], styleTags: ['成都', '方言', '亲切', '温和'],
    hasStyles: true, engine: 'qwen3-tts',
  },
  {
    name: 'Ryan', gender: 'male', label: 'Ryan（男·英语）',
    locale: 'en', ageTags: ['青年', '成年'], styleTags: ['英语', '专业'],
    hasStyles: true, engine: 'qwen3-tts',
  },
  {
    name: 'Aiden', gender: 'male', label: 'Aiden（男·英语）',
    locale: 'en', ageTags: ['青年', '成年'], styleTags: ['英语', '温和'],
    hasStyles: true, engine: 'qwen3-tts',
  },
  {
    name: 'Ono_Anna', gender: 'female', label: 'Ono Anna（女·日语）',
    locale: 'ja', ageTags: ['青年', '成年'], styleTags: ['日语', '温柔'],
    hasStyles: true, engine: 'qwen3-tts',
  },
  {
    name: 'Sohee', gender: 'female', label: 'Sohee（女·韩语）',
    locale: 'ko', ageTags: ['青年', '成年'], styleTags: ['韩语', '清晰'],
    hasStyles: true, engine: 'qwen3-tts',
  },
];

/** 中文预设音色（筛除英/日/韩语音色） */

/** Qwen3-TTS 语言参数：内部使用英文标识 */
const QWEN3_LANGUAGE = 'Chinese';

/** Qwen3 默认回退音色：统一男声，避免无参时落到女声 */
const DEFAULT_QWEN3_SPEAKER = 'Uncle_Fu';

/** 合成超时（毫秒）：本地 GPU 推理较慢，分句合成长文本需要更多时间 */
const SYNTHESIZE_TIMEOUT = 600_000;

export class Qwen3TTSEngine implements ITTSEngine {
  readonly engine = 'qwen3-tts' as const;

  private get baseUrl(): string {
    return getQwen3TTSUrl();
  }

  async synthesize(params: SynthesizeParams): Promise<SynthesizeResult> {
    const { text, voiceClonePromptData, speaker, instruct } = params;

    // 优先级 1：使用 voice clone prompt 合成
    if (voiceClonePromptData) {
      return this._callSynthesize(text, voiceClonePromptData);
    }

    // 优先级 2：使用预设音色 + 情感指令
    const resolvedSpeaker = speaker || params.voice || DEFAULT_QWEN3_SPEAKER;
    return this._callCustomVoice(text, resolvedSpeaker, instruct);
  }

  async getVoices(): Promise<VoiceListItem[]> {
    // 返回中文预设音色（前端选择用）
    // 注意：Qwen3-TTS 真正的价值在于 VoiceDesign + VoiceClone，
    // 预设音色仅作为降级选项
    return QWEN3_PRESETS;
  }

  async preview(params: PreviewParams): Promise<SynthesizeResult> {
    const { voice, text, voiceClonePromptData, instruct } = params;

    if (voiceClonePromptData) {
      return this._callSynthesize(text, voiceClonePromptData);
    }

    return this._callCustomVoice(text, voice || DEFAULT_QWEN3_SPEAKER, instruct);
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

  // ==================== 内部方法 ====================

  private async _callSynthesize(text: string, promptData: string, promptId?: string): Promise<SynthesizeResult> {
    const resp = await fetch(`${this.baseUrl}/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        prompt_data: promptData,
        prompt_id: promptId,
        language: QWEN3_LANGUAGE,
      }),
      signal: AbortSignal.timeout(SYNTHESIZE_TIMEOUT),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` })) as { detail: string };
      throw new Error(`Qwen3-TTS synthesize 失败: ${err.detail}`);
    }

    const data = await resp.json() as { audio: string; duration: number };
    await recordAiUsage({
      usageKind: 'tts',
      provider: 'qwen3-tts',
      model: 'voice-clone',
      requestCount: 1,
      promptChars: text.length,
      outputChars: 0,
      metadata: {
        hasPromptId: Boolean(promptId),
      },
    });
    return {
      buffer: Buffer.from(data.audio, 'base64'),
      duration: data.duration,
    };
  }

  private async _callCustomVoice(text: string, speaker: string, instruct?: string): Promise<SynthesizeResult> {
    const resp = await fetch(`${this.baseUrl}/custom-voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        speaker,
        instruct: instruct || '',
        language: QWEN3_LANGUAGE,
      }),
      signal: AbortSignal.timeout(SYNTHESIZE_TIMEOUT),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` })) as { detail: string };
      throw new Error(`Qwen3-TTS custom-voice 失败: ${err.detail}`);
    }

    const data = await resp.json() as { audio: string; duration: number };
    await recordAiUsage({
      usageKind: 'tts',
      provider: 'qwen3-tts',
      model: 'custom-voice',
      requestCount: 1,
      promptChars: text.length,
      outputChars: 0,
      metadata: {
        speaker,
        hasInstruct: Boolean(instruct),
      },
    });
    return {
      buffer: Buffer.from(data.audio, 'base64'),
      duration: data.duration,
    };
  }
}
