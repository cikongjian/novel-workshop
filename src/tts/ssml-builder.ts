/**
 * SSML 构建器
 *
 * 为 Edge TTS 生成自定义 SSML，支持：
 * - mstts:express-as 情感表达（如 angry, cheerful, whisper）
 * - 角色扮演（XiaomoNeural/YunxiNeural 等支持的 role 属性）
 * - break 停顿控制
 * - prosody 语速/音高/音量控制
 */

// ==================== 类型定义 ====================

/** Edge TTS 支持的情感风格 */
export type EmotionStyle =
  | 'affectionate' | 'angry' | 'calm' | 'cheerful'
  | 'depressed' | 'disgruntled' | 'embarrassed' | 'envious'
  | 'fearful' | 'gentle' | 'sad' | 'serious'
  | 'whisper' | 'lyrical' | 'newscast' | 'narration-relaxed'
  | 'customerservice' | 'chat' | 'assistant'
  | 'poetry-reading' | 'sorry' | 'documentary-narration'
  | 'newscast-casual' | 'newscast-formal' | 'narration-professional';

/** 角色扮演类型 */
export type SpeakingRole =
  | 'YoungAdultFemale' | 'YoungAdultMale'
  | 'OlderAdultFemale' | 'OlderAdultMale'
  | 'SeniorFemale' | 'SeniorMale'
  | 'Girl' | 'Boy';

// ==================== 声音能力注册表 ====================

/** 每个声音支持的情感风格列表（仅包含 Edge TTS 免费端点实际可用的声音） */
const VOICE_STYLES: Record<string, EmotionStyle[]> = {
  'zh-CN-XiaoxiaoNeural': [
    'affectionate', 'angry', 'assistant', 'calm', 'chat', 'cheerful',
    'customerservice', 'disgruntled', 'fearful', 'gentle', 'lyrical',
    'newscast', 'poetry-reading', 'sad', 'serious', 'sorry', 'whisper',
  ],
  'zh-CN-XiaoxuanNeural': [
    'angry', 'calm', 'cheerful', 'depressed', 'disgruntled',
    'embarrassed', 'fearful', 'gentle', 'serious',
  ],
  'zh-CN-YunxiNeural': [
    'angry', 'assistant', 'chat', 'cheerful', 'depressed',
    'disgruntled', 'embarrassed', 'fearful', 'narration-relaxed', 'sad', 'serious',
  ],
  'zh-CN-YunjianNeural': [
    'angry', 'cheerful', 'depressed', 'disgruntled', 'fearful',
    'sad', 'serious', 'documentary-narration', 'narration-relaxed',
  ],
  'zh-CN-YunyangNeural': [
    'customerservice', 'narration-professional', 'newscast-casual', 'newscast-formal',
  ],
};

/** 支持角色扮演的声音（仅包含 Edge TTS 免费端点实际可用的声音） */
const VOICE_ROLES: Record<string, SpeakingRole[]> = {
  'zh-CN-XiaoxuanNeural': [
    'YoungAdultFemale', 'YoungAdultMale', 'OlderAdultFemale', 'OlderAdultMale',
    'SeniorFemale', 'SeniorMale', 'Girl', 'Boy',
  ],
  'zh-CN-YunxiNeural': [
    'YoungAdultFemale', 'YoungAdultMale', 'OlderAdultFemale', 'OlderAdultMale',
    'SeniorFemale', 'SeniorMale', 'Girl', 'Boy',
  ],
};

// ==================== 能力查询 ====================

/** 检查声音是否支持指定的情感风格 */
function supportsStyle(voice: string, style: EmotionStyle): boolean {
  return VOICE_STYLES[voice]?.includes(style) ?? false;
}

/** 检查声音是否支持角色扮演 */
function supportsRole(voice: string, role: SpeakingRole): boolean {
  return VOICE_ROLES[voice]?.includes(role) ?? false;
}

// ==================== SSML 构建 ====================

export interface SSMLOptions {
  voice: string;
  rate?: string;
  pitch?: string;
  volume?: string;
  style?: EmotionStyle;
  styleDegree?: number;   // 0.01 ~ 2.0，默认 1.0
  role?: SpeakingRole;
  breakBefore?: number;   // 前置停顿（毫秒）
  breakAfter?: number;    // 后置停顿（毫秒）
}

/** 转义 XML 特殊字符 */
function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 构建完整的 SSML
 *
 * 根据声音能力自动决定是否使用 mstts:express-as 和 role。
 * 不支持的风格会被忽略，降级为普通 prosody。
 */
export function buildSSML(text: string, options: SSMLOptions): string {
  const { voice, rate, pitch, volume, style, styleDegree, role, breakBefore, breakAfter } = options;

  const escapedText = escapeXML(text);

  // prosody 属性
  const prosodyAttrs: string[] = [];
  if (pitch) prosodyAttrs.push(`pitch="${pitch}"`);
  if (rate) prosodyAttrs.push(`rate="${rate}"`);
  if (volume) prosodyAttrs.push(`volume="${volume}"`);

  let content = '';

  // 前置停顿
  if (breakBefore && breakBefore > 0) {
    content += `<break time="${breakBefore}ms"/>`;
  }

  // 判断是否使用高级 SSML 特性
  const useStyle = style && supportsStyle(voice, style);
  const useRole = role && supportsRole(voice, role);

  if (useStyle || useRole) {
    const expressAttrs: string[] = [];
    if (useStyle) expressAttrs.push(`style="${style}"`);
    if (styleDegree !== undefined && useStyle) expressAttrs.push(`styledegree="${styleDegree}"`);
    if (useRole) expressAttrs.push(`role="${role}"`);

    if (prosodyAttrs.length > 0) {
      content += `<mstts:express-as ${expressAttrs.join(' ')}><prosody ${prosodyAttrs.join(' ')}>${escapedText}</prosody></mstts:express-as>`;
    } else {
      content += `<mstts:express-as ${expressAttrs.join(' ')}>${escapedText}</mstts:express-as>`;
    }
  } else if (prosodyAttrs.length > 0) {
    content += `<prosody ${prosodyAttrs.join(' ')}>${escapedText}</prosody>`;
  } else {
    content += escapedText;
  }

  // 后置停顿
  if (breakAfter && breakAfter > 0) {
    content += `<break time="${breakAfter}ms"/>`;
  }

  return [
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="zh-CN">',
    `<voice name="${voice}">`,
    content,
    '</voice>',
    '</speak>',
  ].join('');
}

// ==================== 说话动词 → 情感映射 ====================

/**
 * 说话动词到情感风格的映射
 *
 * 从 text-parser.ts 的 SPEAKER_RE 中提取的说话动词，
 * 映射到 Edge TTS 支持的 mstts:express-as 风格。
 */
const VERB_EMOTION_MAP: Record<string, EmotionStyle> = {
  // 愤怒系列
  '怒道': 'angry',
  '咆哮道': 'angry',
  '厉声道': 'angry',
  '冷声道': 'angry',
  '威胁道': 'angry',
  '警告道': 'angry',
  '质问道': 'angry',

  // 欢快/开心系列
  '笑道': 'cheerful',
  '微笑道': 'cheerful',
  '打趣道': 'cheerful',
  '调侃道': 'cheerful',
  '赞叹道': 'cheerful',
  '惊叹道': 'cheerful',

  // 悲伤/低落系列
  '叹道': 'sad',
  '感叹道': 'sad',
  '哽咽道': 'sad',
  '颤声道': 'sad',
  '央求道': 'sad',
  '恳求道': 'sad',
  '苦笑道': 'sad',

  // 轻柔/温和系列
  '低声道': 'gentle',
  '低语道': 'gentle',
  '耳语道': 'whisper',
  '呢喃道': 'whisper',
  '轻声道': 'gentle',
  '柔声道': 'gentle',
  '安慰道': 'affectionate',
  '鼓励道': 'affectionate',

  // 嘲讽/不满系列
  '冷笑道': 'disgruntled',
  '嘲讽道': 'disgruntled',
  '讥讽道': 'disgruntled',
  '嗤笑道': 'disgruntled',

  // 严肃/沉稳系列
  '沉声道': 'serious',
  '淡淡道': 'calm',
  '命令道': 'serious',
  '吩咐道': 'serious',

  // 惊讶/恐惧系列
  '惊呼道': 'fearful',

  // 嘟囔/不满
  '嘟囔道': 'disgruntled',
  '咕哝道': 'disgruntled',
  '嘀咕道': 'disgruntled',
};

// ==================== 角色年龄 → 扮演角色 ====================
