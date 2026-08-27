/**
 * 声音映射模块
 *
 * 根据角色性别、年龄、说话风格为每个角色分配 Edge TTS 声音。
 * 性别判断优先级：gender 字段 > 角色描述推断 > 上下文代词推断
 * 声音选择：性别 + 年龄/语气 → 最佳匹配声音
 * 同性别多角色时从声音池轮换。
 *
 * 声音来源：Edge TTS 免费端点实际可用的中文声音（经测试验证）
 * 包含 zh-CN（普通话 7 个）、zh-CN 方言（2 个）、zh-HK（粤语 3 个）、zh-TW（台湾国语 3 个）
 * 共 15 个声音（6 男 9 女）
 */

import type { TextSegment } from './text-parser.js';
import { getTTSEngineType } from './engine-config.js';

interface CharacterVoiceRef {
  id: string;
  name: string;
  gender?: string;
  age?: string;
  speechStyle?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  /** 用户手动指定的 Edge TTS 声音名称（最高优先级） */
  ttsVoice?: string;
  /** Qwen3-TTS voice clone prompt 数据（Base64） */
  voiceClonePromptData?: string;
  /** Qwen3-TTS 声音设计指令 */
  voiceInstruct?: string;
}

/** 默认声音 */
export const DEFAULT_VOICES = {
  narrator: 'zh-CN-YunyangNeural',
  male: 'zh-CN-YunxiNeural',
  female: 'zh-CN-XiaoxiaoNeural',
  unknown: 'zh-CN-YunjianNeural',
} as const;

function resolveNarratorVoice(voice?: string): string {
  if (!voice) return DEFAULT_VOICES.narrator;
  return VOICE_PROFILES.some((item) => item.name === voice)
    ? voice
    : DEFAULT_VOICES.narrator;
}

/**
 * 声音特征描述，用于按角色特质匹配最佳声音
 */
export interface VoiceProfile {
  name: string;
  gender: 'male' | 'female';
  /** 中文显示标签，如"云希（少年/青年）" */
  label?: string;
  /** 区域标识：zh-CN / zh-HK / zh-TW / zh-CN-liaoning / zh-CN-shaanxi */
  locale?: string;
  /** 适合的年龄段标签 */
  ageTags: string[];
  /** 适合的语气/风格标签 */
  styleTags: string[];
  /** 是否支持 mstts:express-as 情感风格（优先选择） */
  hasStyles: boolean;
}

/**
 * 所有可用的中文声音及其特征
 *
 * 声音来源：Edge TTS 免费端点实际可用的中文声音（经测试验证）
 * 包含 zh-CN（普通话）、zh-CN 方言、zh-HK（粤语）、zh-TW（台湾国语）
 *
 * 共 14 个声音（6 男 8 女），按区域/风格分组。
 * 支持情感风格的声音标记 hasStyles=true，
 * 在评分时获得额外加分，以优先被选中。
 */
export const VOICE_PROFILES: VoiceProfile[] = [
  // ==================== 普通话男声（4 个）====================
  {
    name: 'zh-CN-YunxiNeural',
    label: '云希（少年/青年）',
    locale: 'zh-CN',
    gender: 'male',
    ageTags: ['少年', '青年', '年轻'],
    styleTags: ['温和', '温柔', '阳光', '活泼', '俏皮', '轻快', '开朗'],
    hasStyles: true,  // 支持 11 种情感风格 + 角色扮演
  },
  {
    name: 'zh-CN-YunjianNeural',
    label: '云健（中年/壮年）',
    locale: 'zh-CN',
    gender: 'male',
    ageTags: ['中年', '成年', '壮年'],
    styleTags: ['沉稳', '有力', '粗犷', '豪放', '威严', '严肃', '冷酷', '阴沉', '刚毅'],
    hasStyles: true,  // 支持 9 种情感风格
  },
  {
    name: 'zh-CN-YunyangNeural',
    label: '云扬（播音/专业）',
    locale: 'zh-CN',
    gender: 'male',
    ageTags: ['中年', '成年', '青年'],
    styleTags: ['专业', '正式', '新闻', '播音', '客服', '正经'],
    hasStyles: true,  // 支持 4 种风格（偏新闻/专业）
  },
  {
    name: 'zh-CN-YunxiaNeural',
    label: '云夏（幼童/少年）',
    locale: 'zh-CN',
    gender: 'male',
    ageTags: ['幼童', '少年', '小孩'],
    styleTags: ['稚嫩', '天真', '童声', '可爱', '活泼'],
    hasStyles: false,
  },
  // ==================== 普通话女声（3 个）====================
  {
    name: 'zh-CN-XiaoxiaoNeural',
    label: '晓晓（温柔/甜美）',
    locale: 'zh-CN',
    gender: 'female',
    ageTags: ['青年', '成年', '年轻'],
    styleTags: ['温柔', '细腻', '柔和', '甜美', '亲切', '温和', '抒情'],
    hasStyles: true,  // 支持 17 种情感风格（最丰富）
  },
  {
    name: 'zh-CN-XiaoyiNeural',
    label: '晓伊（活泼/天真）',
    locale: 'zh-CN',
    gender: 'female',
    ageTags: ['少女', '幼童', '少年', '年轻'],
    styleTags: ['活泼', '俏皮', '天真', '可爱', '轻快', '明亮'],
    hasStyles: false,
  },
  {
    name: 'zh-CN-XiaoxuanNeural',
    label: '晓萱（自信/干练）',
    locale: 'zh-CN',
    gender: 'female',
    ageTags: ['青年', '成年', '中年'],
    styleTags: ['自信', '干练', '爽朗', '大方', '利落', '豪爽'],
    hasStyles: true,  // 支持 9 种情感风格 + 角色扮演
  },
  // ==================== 方言声音（2 个）====================
  {
    name: 'zh-CN-liaoning-XiaobeiNeural',
    label: '晓北（东北方言）',
    locale: 'zh-CN-liaoning',
    gender: 'female',
    ageTags: ['青年', '成年', '年轻'],
    styleTags: ['爽朗', '直率', '活泼', '热情', '东北', '方言', '豪爽'],
    hasStyles: false,
  },
  {
    name: 'zh-CN-shaanxi-XiaoniNeural',
    label: '晓妮（陕西方言）',
    locale: 'zh-CN-shaanxi',
    gender: 'female',
    ageTags: ['青年', '成年', '年轻'],
    styleTags: ['质朴', '温厚', '西北', '方言', '淳朴', '亲切'],
    hasStyles: false,
  },
  // ==================== 粤语声音（3 个）====================
  {
    name: 'zh-HK-WanLungNeural',
    label: '云龙（粤语男声）',
    locale: 'zh-HK',
    gender: 'male',
    ageTags: ['中年', '成年', '壮年', '老年'],
    styleTags: ['沉稳', '浑厚', '粤语', '港风', '大气', '深沉'],
    hasStyles: false,
  },
  {
    name: 'zh-HK-HiuGaaiNeural',
    label: '晓佳（粤语·温柔）',
    locale: 'zh-HK',
    gender: 'female',
    ageTags: ['青年', '成年', '年轻'],
    styleTags: ['温柔', '粤语', '港风', '柔和', '甜美', '亲切'],
    hasStyles: false,
  },
  {
    name: 'zh-HK-HiuMaanNeural',
    label: '晓曼（粤语·知性）',
    locale: 'zh-HK',
    gender: 'female',
    ageTags: ['青年', '成年'],
    styleTags: ['知性', '粤语', '港风', '干练', '自信', '清晰'],
    hasStyles: false,
  },
  // ==================== 台湾国语声音（3 个）====================
  {
    name: 'zh-TW-YunJheNeural',
    label: '云哲（台湾国语）',
    locale: 'zh-TW',
    gender: 'male',
    ageTags: ['青年', '成年', '中年'],
    styleTags: ['温和', '台湾', '国语', '儒雅', '亲切', '平和'],
    hasStyles: false,
  },
  {
    name: 'zh-TW-HsiaoChenNeural',
    label: '晓辰（台湾国语·温柔）',
    locale: 'zh-TW',
    gender: 'female',
    ageTags: ['青年', '成年', '年轻'],
    styleTags: ['温柔', '台湾', '国语', '甜美', '细腻', '亲切'],
    hasStyles: false,
  },
  {
    name: 'zh-TW-HsiaoYuNeural',
    label: '晓雨（台湾国语·活泼）',
    locale: 'zh-TW',
    gender: 'female',
    ageTags: ['青年', '成年', '年轻'],
    styleTags: ['活泼', '台湾', '国语', '明亮', '轻快', '开朗'],
    hasStyles: false,
  },
];

/** 男声声音池（轮换用） */
const MALE_VOICES = VOICE_PROFILES.filter(v => v.gender === 'male').map(v => v.name);

/** 女声声音池（轮换用） */
const FEMALE_VOICES = VOICE_PROFILES.filter(v => v.gender === 'female').map(v => v.name);

/** 男性关键词（用于 gender 字段和描述文本匹配） */
const MALE_KEYWORDS = [
  '男', '男性', '男生', '少年', '青年', '老年', '老头', '老者', '汉子',
  '男子', '公子', '大叔', '大爷', '爷爷', '父亲', '爸爸', '哥哥', '弟弟',
  '叔叔', '伯伯', '王爷', '皇帝', '国王', '王子', '少爷', '先生',
  '将军', '元帅', '太监', '公公', '侠客', '道士', '和尚', '僧人', '法师',
  '壮汉', '书生', '郎君', '郎', '夫君', '相公', '官人', '老爹',
  'male', 'm',
];

/** 女性关键词（用于 gender 字段和描述文本匹配） */
const FEMALE_KEYWORDS = [
  '女', '女性', '女生', '少女', '姑娘', '女子', '小姐', '夫人', '娘子',
  '美女', '丫鬟', '丫头', '婆婆', '奶奶', '母亲', '妈妈', '姐姐', '妹妹',
  '阿姨', '嫂子', '公主', '皇后', '王妃', '娘娘', '仙子', '女侠',
  '嬷嬷', '太后', '贵妃', '嫔妃', '妃子', '宫女', '侍女', '女仆', '乳母',
  '女尼', '尼姑', '道姑', '女巫', '巫女', '媳妇', '老婆', '妻子',
  '小娘', '娘', '姥姥', '外婆', '大娘', '婶', '姨', '嫂',
  'female', 'f',
];

/**
 * 角色名称/称谓中的性别标志模式
 *
 * 这些模式用于从角色名字本身推断性别，
 * 优先级高于描述文本关键词匹配。
 *
 * 例如："嬷嬷" 一定是女性，"公子" 一定是男性
 */
const NAME_FEMALE_PATTERNS = [
  '嬷嬷', '婆婆', '奶奶', '姥姥', '外婆', '大娘', '婶婶',
  '姑姑', '姨母', '姨娘', '嫂嫂', '嫂子', '姐姐', '妹妹',
  '夫人', '小姐', '娘子', '娘娘', '太后', '皇后', '贵妃',
  '公主', '王妃', '仙子', '女侠', '女王',
  '丫鬟', '丫头', '侍女', '宫女', '女仆', '乳母',
  '尼姑', '道姑', '女巫', '巫女',
  '妈妈', '母亲', '阿姨',
];

const NAME_MALE_PATTERNS = [
  '爷爷', '大爷', '老爷', '王爷', '太爷',
  '叔叔', '伯伯', '伯父', '叔父',
  '哥哥', '弟弟', '大哥', '师兄', '师弟',
  '公子', '少爷', '先生', '大人', '老爹',
  '皇帝', '国王', '王子', '太子', '殿下',
  '将军', '元帅', '统领', '总兵',
  '公公', '太监',
  '和尚', '僧人', '法师', '道士', '道长',
  '爸爸', '父亲',
];

/**
 * 从 gender 字段判断性别
 */
function classifyGenderField(gender?: string): 'male' | 'female' | 'unknown' {
  if (!gender) return 'unknown';
  const g = gender.toLowerCase().trim();
  if (MALE_KEYWORDS.some(k => g.includes(k))) return 'male';
  if (FEMALE_KEYWORDS.some(k => g.includes(k))) return 'female';
  return 'unknown';
}

/**
 * 从角色名称/称谓推断性别
 *
 * 检查角色名字是否包含明确的性别标志称谓，
 * 如"嬷嬷"、"公主"、"将军"等。
 *
 * 这比通用关键词匹配更可靠，因为称谓本身就是确定性的。
 */
function inferGenderFromName(char: CharacterVoiceRef): 'male' | 'female' | 'unknown' {
  const name = char.name;
  if (!name) return 'unknown';

  // 检查名称中是否包含明确的性别称谓
  for (const pattern of NAME_FEMALE_PATTERNS) {
    if (name.includes(pattern)) return 'female';
  }
  for (const pattern of NAME_MALE_PATTERNS) {
    if (name.includes(pattern)) return 'male';
  }

  // 也检查别名（aliases 在 CharacterVoiceRef 中不直接存在，但名称本身已足够）
  return 'unknown';
}

/**
 * 从角色描述文本中推断性别
 * 扫描 appearance、personality、backstory 中的性别线索词
 *
 * 使用加权评分：
 * - 精确匹配的称谓权重更高（如"她是一位公主"中的"公主"）
 * - 通用关键词权重较低
 */
function inferGenderFromDescription(char: CharacterVoiceRef): 'male' | 'female' | 'unknown' {
  const texts = [char.appearance, char.personality, char.backstory]
    .filter(Boolean)
    .join(' ');

  if (!texts) return 'unknown';

  let maleScore = 0;
  let femaleScore = 0;

  // 代词是强信号
  const sheCount = (texts.match(/她/g) ?? []).length;
  const heCount = (texts.match(/他/g) ?? []).length;
  femaleScore += sheCount * 3;
  maleScore += heCount * 3;

  for (const kw of MALE_KEYWORDS) {
    if (texts.includes(kw)) maleScore++;
  }
  for (const kw of FEMALE_KEYWORDS) {
    if (texts.includes(kw)) femaleScore++;
  }

  // 需要有一定差距才下判断，避免边缘误判
  if (femaleScore > maleScore && femaleScore >= 2) return 'female';
  if (maleScore > femaleScore && maleScore >= 2) return 'male';
  return 'unknown';
}

/**
 * 综合判断角色性别
 *
 * 优先级（从高到低）：
 * 1. gender 字段（用户手动填写或 AI 补全的值）
 * 2. 角色名称/称谓模式（如"嬷嬷"→女、"将军"→男）
 * 3. 描述文本关键词推断
 */
function resolveCharacterGender(char: CharacterVoiceRef): 'male' | 'female' | 'unknown' {
  // 1. gender 字段优先
  const fromField = classifyGenderField(char.gender);
  if (fromField !== 'unknown') return fromField;

  // 2. 名称/称谓推断
  const fromName = inferGenderFromName(char);
  if (fromName !== 'unknown') return fromName;

  // 3. 描述文本推断
  return inferGenderFromDescription(char);
}

/**
 * 根据角色特征（年龄、说话风格）从同性别声音中选择最佳匹配
 *
 * 评分机制：
 * - age 匹配：+2 分
 * - speechStyle 匹配：+1 分
 * - 支持情感风格的声音：+1 分（微弱加分，同等条件下优先选择）
 */
function pickBestVoice(
  gender: 'male' | 'female',
  char: CharacterVoiceRef | undefined,
  fallbackIdx: number,
): string {
  const pool = gender === 'male' ? MALE_VOICES : FEMALE_VOICES;
  const profiles = VOICE_PROFILES.filter(v => v.gender === gender);

  // 没有角色信息，直接轮换
  if (!char) {
    return pool[fallbackIdx % pool.length];
  }

  const ageText = (char.age ?? '').toLowerCase();
  const styleText = (char.speechStyle ?? '').toLowerCase();

  // 如果没有 age 和 speechStyle 信息，直接轮换
  if (!ageText && !styleText) {
    return pool[fallbackIdx % pool.length];
  }

  // 对每个声音评分
  let bestScore = -1;
  let bestVoice = pool[fallbackIdx % pool.length];

  for (const profile of profiles) {
    let score = 0;

    // 年龄匹配
    if (ageText) {
      for (const tag of profile.ageTags) {
        if (ageText.includes(tag)) score += 2;
      }
    }

    // 说话风格匹配
    if (styleText) {
      for (const tag of profile.styleTags) {
        if (styleText.includes(tag)) score += 1;
      }
    }

    // 支持情感风格的声音微弱加分（同等条件下优先选择）
    if (profile.hasStyles) score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestVoice = profile.name;
    }
  }

  return bestVoice;
}

/**
 * 为 segments 中出现的角色分配声音
 *
 * @returns characterId/speaker → voiceName 映射表
 *          特殊 key "__narrator__" 表示旁白声音
 */
export function mapVoices(
  segments: TextSegment[],
  characters: CharacterVoiceRef[],
  options?: { narratorVoice?: string },
): Map<string, string> {
  const voiceMap = new Map<string, string>();

  // 旁白固定声音（允许按小说覆盖）
  voiceMap.set('__narrator__', resolveNarratorVoice(options?.narratorVoice));

  // 收集所有出现的角色 ID 和未匹配的 speaker（附带 genderHint）
  const seenCharIds = new Set<string>();
  const speakerGenderHints = new Map<string, 'male' | 'female'>();

  for (const seg of segments) {
    if (seg.type === 'dialogue') {
      if (seg.characterId) {
        seenCharIds.add(seg.characterId);
        if (seg.genderHint && seg.characterId) {
          speakerGenderHints.set(seg.characterId, seg.genderHint);
        }
      } else if (seg.speaker) {
        if (seg.genderHint) {
          speakerGenderHints.set(seg.speaker, seg.genderHint);
        }
      }
    }
  }

  // 按性别分组分配声音，记录已使用的声音避免重复
  let maleIdx = 0;
  let femaleIdx = 0;
  const usedVoices = new Set<string>();

  // 所有可用声音名的 Set，用于验证手动指定的 ttsVoice 是否有效
  const allVoiceNames = new Set(VOICE_PROFILES.map(v => v.name));

  // 为已匹配角色分配声音
  for (const charId of seenCharIds) {
    const char = characters.find(c => c.id === charId);

    // 最高优先级：用户手动指定的 ttsVoice
    if (char?.ttsVoice && allVoiceNames.has(char.ttsVoice)) {
      voiceMap.set(charId, char.ttsVoice);
      usedVoices.add(char.ttsVoice);
      continue;
    }

    let genderType: 'male' | 'female' | 'unknown' = 'unknown';

    if (char) {
      genderType = resolveCharacterGender(char);
    }

    // 如果角色信息无法判断，使用上下文代词推断
    if (genderType === 'unknown' && speakerGenderHints.has(charId)) {
      genderType = speakerGenderHints.get(charId)!;
    }

    let voice: string;
    if (genderType === 'male' || genderType === 'female') {
      voice = pickBestVoice(genderType, char ?? undefined, genderType === 'male' ? maleIdx : femaleIdx);
      // 如果最佳声音已被占用，尝试轮换到下一个
      if (usedVoices.has(voice)) {
        const pool = genderType === 'male' ? MALE_VOICES : FEMALE_VOICES;
        const idx = genderType === 'male' ? maleIdx : femaleIdx;
        voice = pool[idx % pool.length];
      }
    } else {
      // unknown 默认分配男声
      voice = MALE_VOICES[maleIdx % MALE_VOICES.length];
    }

    usedVoices.add(voice);
    if (genderType === 'male') maleIdx++;
    else if (genderType === 'female') femaleIdx++;
    else maleIdx++;

    voiceMap.set(charId, voice);
  }

  // 为未匹配的 speaker 统一回退旁白，避免错误人声风格
  const unmatchedSpeakers = new Set<string>();
  for (const seg of segments) {
    if (seg.type === 'dialogue' && !seg.characterId && seg.speaker) {
      unmatchedSpeakers.add(seg.speaker);
    }
  }

  for (const speaker of unmatchedSpeakers) {
    if (voiceMap.has(speaker)) continue;
    voiceMap.set(speaker, DEFAULT_VOICES.narrator);
  }

  return voiceMap;
}

/**
 * 根据 segment 获取对应的声音名称
 */
export function getVoiceForSegment(
  segment: TextSegment,
  voiceMap: Map<string, string>,
): string {
  if (segment.type === 'narration') {
    return voiceMap.get('__narrator__') ?? DEFAULT_VOICES.narrator;
  }

  if (segment.characterId && voiceMap.has(segment.characterId)) {
    return voiceMap.get(segment.characterId)!;
  }

  if (segment.speaker && voiceMap.has(segment.speaker)) {
    return voiceMap.get(segment.speaker)!;
  }

  // 最后 fallback：统一旁白，防止误分配奇怪人声
  return DEFAULT_VOICES.narrator;
}

// ==================== Qwen3-TTS 声音配置 ====================

/**
 * Qwen3-TTS 默认预设映射（按性别）
 * 当角色无 voiceClonePromptData 时，按性别映射到预设 speaker
 *
 * 可用中文预设：Uncle_Fu（男·低沉）、Dylan（男·北京）、Eric（男·成都）
 *              Vivian（女·明亮）、Serena（女·温柔）
 */
const QWEN3_GENDER_PRESETS: Record<string, string> = {
  male: 'Uncle_Fu',      // 中文男声（沉稳低沉）
  female: 'Vivian',      // 中文女声（明亮清晰）
  unknown: 'Uncle_Fu',
};

/** Qwen3 旁白固定声线：统一男声，避免叙事段落性别漂移 */
const QWEN3_NARRATOR_PRESET = 'Uncle_Fu';

/**
 * 获取 segment 对应角色的 Qwen3-TTS 扩展配置
 *
 * 在 Qwen3-TTS 引擎下调用，返回 clone prompt 数据或预设 speaker。
 * Edge TTS 引擎下返回 undefined（不需要额外配置）。
 */
export function getQwen3VoiceConfig(
  segment: TextSegment,
  characters: CharacterVoiceRef[],
): { voiceClonePromptData?: string; speaker?: string; instruct?: string } | undefined {
  if (getTTSEngineType() !== 'qwen3-tts') return undefined;

  // 旁白：无 clone prompt，固定男声
  if (segment.type === 'narration') {
    return { speaker: QWEN3_NARRATOR_PRESET };
  }

  // 查找角色
  const charId = segment.characterId;
  const char = charId ? characters.find(c => c.id === charId) : undefined;

  if (char?.voiceClonePromptData) {
    // 已有 clone prompt，优先使用
    return { voiceClonePromptData: char.voiceClonePromptData };
  }

  if (char?.voiceInstruct) {
    // 有声音描述但无 clone prompt（仅设计未克隆），使用预设 + instruct
    const gender = char.gender ? resolveCharacterGender(char) : 'unknown';
    return {
      speaker: QWEN3_GENDER_PRESETS[gender] ?? QWEN3_GENDER_PRESETS.unknown,
      instruct: char.voiceInstruct,
    };
  }

  // 无声音设计，按性别映射到预设
  if (char) {
    const gender = resolveCharacterGender(char);
    return { speaker: QWEN3_GENDER_PRESETS[gender] ?? QWEN3_GENDER_PRESETS.unknown };
  }

  // 未匹配到角色档案时，统一回退旁白声线，避免强调词/术语被误读成角色对话音色
  return { speaker: QWEN3_NARRATOR_PRESET };
}
