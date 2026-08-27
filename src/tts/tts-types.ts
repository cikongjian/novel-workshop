/**
 * TTS 引擎统一接口定义
 *
 * 抽象 Edge TTS 和 Qwen3-TTS 的差异，提供统一的合成、预览、声音列表接口。
 * 各引擎实现此接口后通过 engine-factory.ts 创建实例。
 */

/** 支持的 TTS 引擎类型 */
export type TTSEngineType = 'edge-tts' | 'qwen3-tts' | 'azure-tts' | 'openai-tts' | 'kokoro';

/** 合成参数 */
export interface SynthesizeParams {
  /** 要合成的文本 */
  text: string;
  /** Edge TTS 声音名称（如 zh-CN-YunxiNeural） */
  voice?: string;
  /** 语速调整（如 '+20%'） */
  rate?: string;

  // === Qwen3-TTS 专用参数 ===
  /** Qwen3 voice clone prompt 的序列化数据（Base64），最高优先级 */
  voiceClonePromptData?: string;
  /** Qwen3 预设音色名称（如 Vivian、Uncle_Fu） */
  speaker?: string;
  /** Qwen3 情感/风格指令文本 */
  instruct?: string;
}

/** 合成结果 */
export interface SynthesizeResult {
  /** 音频数据（MP3 格式） */
  buffer: Buffer;
  /** 音频时长（毫秒） */
  duration: number;
}

/** 声音列表项 */
export interface VoiceListItem {
  /** 声音唯一标识（Edge TTS 的 voice name 或 Qwen3 的 speaker name） */
  name: string;
  /** 性别 */
  gender: 'male' | 'female';
  /** 中文显示标签 */
  label: string;
  /** 区域标识 */
  locale: string;
  /** 适合的年龄段标签 */
  ageTags: string[];
  /** 适合的语气/风格标签 */
  styleTags: string[];
  /** 是否支持情感风格 */
  hasStyles: boolean;
  /** 所属引擎 */
  engine: TTSEngineType;
}

/** 预览参数 */
export interface PreviewParams {
  /** 声音标识 */
  voice: string;
  /** 预览文本 */
  text: string;
  /** 语速 */
  rate?: string;

  // === Qwen3-TTS 专用 ===
  voiceClonePromptData?: string;
  speaker?: string;
  instruct?: string;
}

/** TTS 引擎统一接口 */
export interface ITTSEngine {
  /** 引擎类型标识 */
  readonly engine: TTSEngineType;

  /** 合成音频 */
  synthesize(params: SynthesizeParams): Promise<SynthesizeResult>;

  /** 获取可用声音列表 */
  getVoices(): Promise<VoiceListItem[]>;

  /** 预览指定声音 */
  preview(params: PreviewParams): Promise<SynthesizeResult>;

  /** 检查引擎是否可用 */
  isAvailable(): Promise<boolean>;
}
