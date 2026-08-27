import type { CharacterProfile } from '../../novel/types.js';
import {
  buildPortraitStyleIndex,
  type PortraitCultureProfile,
  type PortraitStyleOverrides,
} from './portrait-style-index.js';
import { getVisualStyleRule } from './portrait-visual-style.js';
import { getFormatRule } from './portrait-format.js';

const DEFAULT_NEGATIVE_PROMPT = [
  '低清晰度',
  '画面模糊',
  '人体结构错误',
  '手部畸形',
  '多余手指',
  '缺失手指',
  '面部变形',
  '斗鸡眼',
  '重复人物',
  '多人同框',
  '头部被裁切',
  '身体变异',
  '文字',
  '水印',
  '标志',
  '压缩噪点',
  '过度饱和',
  '过曝',
  '欠曝',
];

type PortraitCultureAnchors = {
  profile: PortraitCultureProfile;
  positive: string;
  negative: string[];
};

const CULTURE_ANCHOR_PATTERNS: RegExp[] = [
  /east asian facial/i,
  /han chinese/i,
  /chinese aesthetics/i,
  /european facial/i,
  /middle eastern facial/i,
  /south asian facial/i,
  /african facial/i,
  /latino facial/i,
];

const IDENTITY_PATTERNS: RegExp[] = [
  /identity title|story role|social class|faction identity|professional identity/i,
  /身份|职位|头衔|阵营|阶层|主角|反派|配角|人物|角色|文官|武将|谋士|术士|骑士|法师|学生|医生|警察/,
];

const ATTIRE_PATTERNS: RegExp[] = [
  /attire|robe|costume|outfit|armor|hanfu|uniform|tailoring|clothing/i,
  /衣着|服饰|铠甲|长袍|汉服|制服|朝服|袍|衣|氅|领口|袖口|腰间|玉佩|革带|织锦|缂丝|配饰/,
];

const FACIAL_PATTERNS: RegExp[] = [
  /facial|face|features|anatomy|eyes|brows|nose|complexion/i,
  /面貌|五官|脸部|面容|肤色|颧骨|眼窝|瞳色|双眸|眉|鼻|唇|眼神|眉骨|鼻梁|发髻|鬓角|发丝/,
];

const EXPRESSION_PATTERNS: RegExp[] = [
  /expression|emotion|smile|gaze|micro-emotion|look/i,
  /表情|神态|情绪|眼神/,
];

const VISUAL_STYLE_PATTERNS: RegExp[] = [
  /photorealistic|cinematic|ink wash|sumi-e|anime|cel shading|concept art|3d render|octane|ethereal|chibi/i,
  /oil painting|watercolor|pixel art|comic book|pop art|ukiyo-e|woodblock|dark fantasy|gothic|gouache/i,
  /画风|写实|水墨|动漫|厚涂|渲染|唯美|Q版|萌系|油画|水彩|像素|美漫|浮世绘|暗黑|水粉/,
];

const FORMAT_PATTERNS: RegExp[] = [
  /trading card|tcg|wanted poster|movie poster|classical.*illustration|tarot card|silhouette|heraldic|wallpaper/i,
  /bust statue|scroll painting|stamp|comic cover|album card|polaroid|stained glass|character sheet|design sheet/i,
  /卡牌|通缉令|海报|绣像|塔罗|剪影|纹章|壁纸|雕像|胸像|卷轴|邮票|漫画封面|图鉴|拍立得|彩窗|设定表/,
];

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(re => re.test(text));
}

const ROLE_LABELS: Partial<Record<NonNullable<CharacterProfile['role']>, string>> = {
  protagonist: '主角',
  deuteragonist: '副主角',
  antagonist: '反派角色',
  rival: '宿敌角色',
  love_interest: '感情线角色',
  mentor: '导师角色',
  ally: '盟友角色',
  faction_leader: '势力核心角色',
  supporting: '重要配角',
  family: '亲友角色',
  comic_relief: '气氛担当角色',
  minor: '路人角色',
};

function getRoleLabel(role: CharacterProfile['role']): string {
  return role ? ROLE_LABELS[role] ?? '故事角色' : '故事角色';
}

function appendPromptSegment(base: string, segment: string): string {
  const normalizedBase = base.trim().replace(/[，,\s]+$/, '');
  const normalizedSegment = segment.trim().replace(/^[，,\s]+/, '');
  if (!normalizedBase) return normalizedSegment;
  if (!normalizedSegment) return normalizedBase;
  return `${normalizedBase}，${normalizedSegment}`;
}

function buildChinesePortraitAnchors(char: CharacterProfile, overrides?: PortraitStyleOverrides): {
  identity: string;
  attire: string;
  facial: string;
  expression: string;
  format: string;
  style: string;
  tail: string;
} {
  const index = buildPortraitStyleIndex(char, overrides);
  const eraSummary = index.layerHits.find(hit => hit.layer === 'era')?.summary ?? '当前题材时代';
  const roleLabel = getRoleLabel(char.role);
  const identityParts = [
    roleLabel,
    char.position?.trim(),
    char.socialIdentity?.faction?.trim(),
    char.socialIdentity?.socialClass?.trim(),
  ].filter(Boolean);
  const attireBase = index.roleAttire.label === '通用角色'
    ? roleLabel
    : index.roleAttire.label;

  return {
    style: index.visualStyle.label,
    format: index.format.label === '标准立绘' ? '标准半身角色立绘' : index.format.label,
    identity: identityParts.join('，') || roleLabel,
    attire: `${eraSummary}服饰，${attireBase}装束`,
    facial: char.appearance?.trim()
      ? char.appearance.trim()
      : '符合角色出身与题材语境的自然五官，避免模板化面孔',
    expression: `${char.personality || roleLabel}气质，眼神与微表情有辨识度`,
    tail: '单人物半身构图，干净背景，画面无文字，无人群',
  };
}

function getPortraitCultureAnchors(char: CharacterProfile): PortraitCultureAnchors {
  const index = buildPortraitStyleIndex(char);
  return {
    profile: index.cultureProfile,
    positive: index.culturePositive,
    negative: index.cultureNegative,
  };
}

function enforcePortraitCultureAnchor(
  positivePrompt: string,
  char: CharacterProfile,
  overrides?: PortraitStyleOverrides,
): string {
  const trimmed = positivePrompt.trim();
  if (!trimmed) return trimmed;
  if (includesAny(trimmed.toLowerCase(), CULTURE_ANCHOR_PATTERNS)) return trimmed;
  const index = buildPortraitStyleIndex(char, overrides);
  return index.cultureProfile === 'unspecified'
    ? trimmed
    : `${index.culturePositive}，${trimmed}`;
}

function cleanPortraitPromptText(text: string): string {
  return text
    .replace(/(?:^|[，,。\s])(?:身份定位|呈现形式|面部特征|服饰设计|神态气质|画风)\s*[：:]/g, '，')
    .replace(/，?(?:人物定位清晰|造型服务其剧情身份|材质、层次与配饰统一可信|服饰逻辑统一|面部特征依据姓名、年龄、性别、出身背景与题材语境自然生成|避免固定族裔模板)/g, '')
    .replace(/服饰符合([^，。]+?)语境和([^，。]+?)身份/g, '$1服饰，$2装束')
    .replace(/\b(?:protagonist|antagonist|supporting)\b/gi, match => {
      if (/protagonist/i.test(match)) return '主角';
      if (/antagonist/i.test(match)) return '反派角色';
      return '重要配角';
    })
    .replace(/不预设亚洲或西方面孔/g, '')
    .replace(/，{2,}/g, '，')
    .replace(/^[，,。\s]+/, '')
    .replace(/[，,。\s]+$/, '')
    .trim();
}

export function enrichPortraitPromptWithCharacterConsistency(
  positivePrompt: string,
  char: CharacterProfile,
  overrides?: PortraitStyleOverrides,
): string {
  const anchors = buildChinesePortraitAnchors(char, overrides);
  let result = enforcePortraitCultureAnchor(positivePrompt, char, overrides);
  const lower = result.toLowerCase();

  if (!includesAny(lower, VISUAL_STYLE_PATTERNS)) {
    result = `${anchors.style}，${result}`;
  }

  if (!includesAny(lower, FORMAT_PATTERNS)) {
    result = `${anchors.format}，${result}`;
  }

  if (!includesAny(lower, IDENTITY_PATTERNS)) {
    result = appendPromptSegment(result, anchors.identity);
  }
  if (!includesAny(lower, ATTIRE_PATTERNS)) {
    result = appendPromptSegment(result, anchors.attire);
  }
  if (!includesAny(lower, FACIAL_PATTERNS)) {
    result = appendPromptSegment(result, anchors.facial);
  }
  if (!includesAny(lower, EXPRESSION_PATTERNS)) {
    result = appendPromptSegment(result, anchors.expression);
  }

  if (!/单人物|半身|干净背景|无人群/.test(result)) {
    result = appendPromptSegment(result, anchors.tail);
  }
  return cleanPortraitPromptText(result.replace(/，{2,}/g, '，').replace(/。，/g, '，'));
}

export function buildPortraitCharacterContext(
  char: CharacterProfile,
  overrides?: PortraitStyleOverrides,
): string {
  const index = buildPortraitStyleIndex(char, overrides);
  const anchors = buildChinesePortraitAnchors(char, overrides);
  return [
    `姓名：${char.name}`,
    char.gender ? `性别：${char.gender}` : '',
    char.age ? `年龄：${char.age}` : '',
    char.role ? `故事角色：${char.role}` : '',
    char.position ? `身份职位：${char.position}` : '',
    char.appearance ? `外貌描述：${char.appearance}` : '',
    char.personality ? `性格气质：${char.personality}` : '',
    char.backstory ? `背景线索：${char.backstory}` : '',
    char.socialIdentity?.faction ? `所属阵营：${char.socialIdentity.faction}` : '',
    char.socialIdentity?.socialClass ? `社会阶层：${char.socialIdentity.socialClass}` : '',
    anchors.style,
    anchors.format,
    `文化面部锚点：${index.culturePositive}`,
    anchors.identity,
    anchors.attire,
    anchors.facial,
    anchors.expression,
    `规则命中：${index.layerHits.map(hit => `${hit.layer}：${hit.summary}`).join('；')}`,
  ].filter(Boolean).join('\n');
}

export function buildPortraitTemplatePrompt(
  char: CharacterProfile,
  overrides?: PortraitStyleOverrides,
): string {
  const anchors = buildChinesePortraitAnchors(char, overrides);
  const segments = [
    anchors.style,
    anchors.format,
    anchors.identity,
    anchors.attire,
    anchors.facial,
    anchors.expression,
    char.gender ? `${char.gender}` : '',
    char.age ? `${char.age}年龄感` : '',
    anchors.tail,
  ].filter(Boolean);
  return enrichPortraitPromptWithCharacterConsistency(segments.join('，'), char, overrides);
}

export function buildPortraitNegativePrompt(
  char?: CharacterProfile,
  _overrides?: PortraitStyleOverrides,
): string {
  if (!char) return DEFAULT_NEGATIVE_PROMPT.join('，');
  const culture = getPortraitCultureAnchors(char);
  const cultureNegative = culture.negative.length > 0
    ? culture.negative
    : ['与角色姓名和设定不符的固定族裔模板'];
  return [
    ...DEFAULT_NEGATIVE_PROMPT,
    ...cultureNegative,
    '画风混乱',
    '版式跑偏',
  ].join('，');
}

export function composePortraitPromptBlock(
  positivePrompt: string,
  negativePrompt: string,
): string {
  return `正向提示词：\n${positivePrompt.trim()}\n\n负向提示词：\n${negativePrompt.trim()}`;
}

export function parsePortraitPromptBlock(rawPrompt: string): {
  positivePrompt: string;
  negativePrompt: string;
} {
  const trimmed = rawPrompt.trim();
  if (!trimmed) return { positivePrompt: '', negativePrompt: '' };

  const lines = trimmed.split(/\r?\n/);
  const negativeIdx = lines.findIndex(line => /^(?:negative prompt|负向提示词)\s*[：:]/i.test(line.trim()));
  const positiveIdx = lines.findIndex(line => /^(?:positive prompt|正向提示词)\s*[：:]/i.test(line.trim()));

  if (negativeIdx === -1 && positiveIdx === -1) {
    return { positivePrompt: trimmed, negativePrompt: '' };
  }

  let positive = '';
  let negative = '';

  if (positiveIdx !== -1) {
    const firstLine = lines[positiveIdx].replace(/^(?:positive prompt|正向提示词)\s*[：:]/i, '').trim();
    const end = negativeIdx === -1 ? lines.length : negativeIdx;
    const tail = lines.slice(positiveIdx + 1, end).join('\n').trim();
    positive = [firstLine, tail].filter(Boolean).join('\n').trim();
  } else if (negativeIdx > 0) {
    positive = lines.slice(0, negativeIdx).join('\n').trim();
  }

  if (negativeIdx !== -1) {
    const firstLine = lines[negativeIdx].replace(/^(?:negative prompt|负向提示词)\s*[：:]/i, '').trim();
    const tail = lines.slice(negativeIdx + 1).join('\n').trim();
    negative = [firstLine, tail].filter(Boolean).join('\n').trim();
  }

  if (!positive) positive = trimmed;
  return { positivePrompt: positive, negativePrompt: negative };
}

/**
 * 构建带画风和形式约束的 AI 立绘提示词系统消息
 */
export function buildPortraitPromptSystem(
  char: CharacterProfile,
  overrides?: PortraitStyleOverrides,
): string {
  const index = buildPortraitStyleIndex(char, overrides);
  const visualStyleRule = getVisualStyleRule(index.visualStyle.key);
  const formatRule = getFormatRule(index.format.key);

  const constraints = [
    visualStyleRule.aiConstraint,
    formatRule.key !== 'standard' ? formatRule.aiConstraint : '',
    '聚焦面部特征、服饰细节、气质神态。',
    '明确保留角色线索中的民族文化特征；没有明确线索时，不要默认亚洲面孔，也不要默认西方面孔。',
    '必须根据角色姓名、外貌、身份、时代背景和题材语境综合判断面部特征。',
    '只写可直接用于生图的画面描述，不要写规则说明、字段名、冒号标签或推理过程。',
    '不要输出“身份定位”“呈现形式”“面部特征”“服饰设计”等字段化标签。',
    '适合单人物立绘生成。',
    '只能输出中文提示词，不要夹杂英文单词、英文标签、markdown 或解释。',
  ].filter(Boolean);

  return `你是一位专业的角色立绘提示词工程师，为小说角色图生成中文提示词。
请生成一条中文正向提示词。
要求：
- ${constraints.join('\n- ')}`;
}
