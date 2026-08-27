import type { CharacterProfile } from '../../novel/types.js';
import type {
  PortraitCultureProfile,
  PortraitEraKey,
  PortraitStyleOptions,
} from './portrait-style-types.js';
import { VISUAL_STYLE_RULES } from './portrait-visual-style.js';
import { FORMAT_RULES } from './portrait-format.js';

type Rule = { key: string; summary: string; prompt: string; patterns: RegExp[] };

type CultureRule = {
  profile: PortraitCultureProfile;
  positive: string;
  negative: string[];
  patterns: RegExp[];
  summary: string;
};

type ExpressionRule = {
  key: string;
  summary: string;
  prompt: string;
};

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

export function buildSignalText(char: CharacterProfile): string {
  return [
    char.name,
    char.role,
    char.gender,
    char.age,
    char.position,
    char.appearance,
    char.personality,
    char.backstory,
    char.socialIdentity?.faction,
    char.socialIdentity?.socialClass,
  ].filter(Boolean).join(' ').toLowerCase();
}

function pickRule(signal: string, rules: Rule[], fallback: Rule): Rule {
  for (const rule of rules) {
    if (includesAny(signal, rule.patterns)) {
      return rule;
    }
  }
  return fallback;
}

const ERA_RULES: Rule[] = [
  {
    key: 'cn-imperial',
    summary: '中式宫廷/王朝',
    prompt: 'historical Chinese imperial aesthetics, strict rank hierarchy visual language',
    patterns: [
      /太子|皇子|皇帝|王爷|郡主|公主|后宫|宫廷|朝堂|丞相|尚书|锦衣卫|王朝|帝国/,
      /imperial|dynasty|court|royal|palace|chancellor|minister/,
    ],
  },
  {
    key: 'cn-fantasy',
    summary: '中式仙侠/玄幻',
    prompt: 'Chinese xianxia fantasy aesthetics, flowing layered robe language',
    patterns: [
      /修仙|仙门|宗门|道门|江湖|武林|剑宗|灵力|渡劫|法器/,
      /xianxia|wuxia|cultivat|daoist|immortal sect|jianghu/,
    ],
  },
  {
    key: 'modern-urban',
    summary: '现代都市',
    prompt: 'modern urban aesthetics, realistic contemporary material and tailoring',
    patterns: [
      /现代|都市|校园|职场|公司|总裁|医生|律师|警察|学生/,
      /modern|urban|office|campus|corporate|ceo|doctor|lawyer|police|student/,
    ],
  },
  {
    key: 'sci-fi',
    summary: '科幻未来',
    prompt: 'futuristic sci-fi aesthetics, functional technical costume language',
    patterns: [
      /星际|机甲|未来|赛博|太空|联邦|舰队|改造人/,
      /sci[- ]?fi|cyberpunk|space|future|mecha|federation/,
    ],
  },
  {
    key: 'western-medieval',
    summary: '西方中世纪',
    prompt: 'medieval european aesthetics, feudal hierarchy visual language, gothic and renaissance costume elements',
    patterns: [
      /骑士|领主|伯爵|公爵|男爵|城堡|教廷|十字军|吟游诗人|中世纪/,
      /knight|lord|duke|baron|castle|medieval|gothic|crusade|feudal|cathedr/,
    ],
  },
  {
    key: 'western-antiquity',
    summary: '西方古典古代',
    prompt: 'ancient classical antiquity aesthetics, greco-roman and egyptian visual language, draped garments and laurel motifs',
    patterns: [
      /希腊|罗马|元老|执政官|斯巴达|角斗士|法老|埃及|雅典|庞贝|古希腊|古罗马|古埃及/,
      /greek|roman|senate|consul|sparta|gladiator|pharaoh|egypt|athen|antiquity|toga|centurion/,
    ],
  },
  {
    key: 'ancient-myth',
    summary: '上古神话',
    prompt: 'primordial mythic aesthetics, ancient tribal and deity visual language, archaic ornament and ritual costume',
    patterns: [
      /洪荒|上古|远古|神话|三皇|五帝|巫|神裔|部落|图腾|伏羲|女娲|神农|轩辕|蚩尤/,
      /primordial|mythic|deity|ancient tribal|shamanic|totem|prehistoric|pantheon|god of/,
    ],
  },
  {
    key: 'japanese-feudal',
    summary: '日本封建',
    prompt: 'japanese feudal aesthetics, edo and sengoku period visual language, samurai and kimono costume tradition',
    patterns: [
      /幕府|武士|大名|浪人|忍者|艺伎|将军|日本战国|江户|和服|阴阳师|妖怪/,
      /samurai|daimyo|ronin|ninja|geisha|shogun|edo|sengoku|kimono|japanese feudal/,
    ],
  },
  {
    key: 'post-apocalyptic',
    summary: '末世废土',
    prompt: 'post-apocalyptic wasteland aesthetics, survivalist and scavenged costume language, weathered utilitarian gear',
    patterns: [
      /末世|废土|末日|幸存者|避难所|辐射|变异|荒原|求生|丧尸|末日生存/,
      /post[- ]?apocalyptic|wasteland|survivor|fallout|doomsday|ruins|scavenger|mutant/,
    ],
  },
];

const ERA_FALLBACK: Rule = {
  key: 'generic-novel',
  summary: '通用小说视觉',
  prompt: 'coherent novel visual design language, role-first costume logic',
  patterns: [],
};

const ERA_RULE_POOL: Rule[] = [...ERA_RULES, ERA_FALLBACK];

const CULTURE_RULES: CultureRule[] = [
  {
    profile: 'han-chinese',
    positive: '汉文化语境下的自然面部特征，符合角色出身与时代审美',
    negative: ['西式中世纪面部模板', '无依据的异域化面孔'],
    patterns: [
      /hanfu|xianxia|wuxia|jianghu|daoist|cultivat/i,
      /太子|皇子|皇帝|王爷|郡主|尚书|丞相|宗门|修仙|江湖|门派|仙门/,
    ],
    summary: '汉文化面容锚点',
  },
  {
    profile: 'east-asian',
    positive: '东亚文化语境下的自然面部特征，符合角色姓名、出身与服饰线索',
    negative: ['无依据的西式面部模板'],
    patterns: [/japanese|samurai|edo|kimono/i, /korean|joseon|hanbok/i, /east asian/i],
    summary: '东亚面容锚点',
  },
  {
    profile: 'middle-eastern',
    positive: '中东文化语境下的自然面部特征，符合角色出身与服饰线索',
    negative: ['无依据的西化面孔漂移'],
    patterns: [/arab|persian|middle east|ottoman|levant/i],
    summary: '中东面容锚点',
  },
  {
    profile: 'south-asian',
    positive: '南亚文化语境下的自然面部特征，符合角色出身与服饰线索',
    negative: ['无依据的西化面孔漂移'],
    patterns: [/india|indian|south asian|mughal|bollywood/i],
    summary: '南亚面容锚点',
  },
  {
    profile: 'african',
    positive: '非洲文化语境下的自然面部特征，符合角色出身与服饰线索',
    negative: ['无依据的西化面孔漂移'],
    patterns: [/african|ethiopian|nigerian|kenyan/i],
    summary: '非洲面容锚点',
  },
  {
    profile: 'latino',
    positive: '拉美文化语境下的自然面部特征，符合角色出身与服饰线索',
    negative: ['无依据的西化面孔漂移'],
    patterns: [/latino|latin american|mexican|brazilian|argentinian|peruvian/i],
    summary: '拉美面容锚点',
  },
  {
    profile: 'western',
    positive: '西方文化语境下的自然面部特征，符合角色出身与服饰线索',
    negative: ['无依据的东亚面部模板'],
    patterns: [/western|european|caucasian|nordic|slavic|medieval europe/i, /knight|lord|duke|baron|crusade|gothic/i, /greek|roman|spartan|centurion|toga|pharaoh|egyptian/i],
    summary: '西方面容锚点',
  },
];

const IDENTITY_RULES: Rule[] = [
  {
    key: 'royal-noble',
    summary: '皇室/贵族',
    prompt: 'high-status noble identity markers, ceremonial authority details',
    patterns: [/太子|皇子|皇帝|王爷|郡主|公主|贵族|王室/, /prince|princess|emperor|royal|duke|noble/],
  },
  {
    key: 'civil-official',
    summary: '文官/智囊',
    prompt: 'scholarly official identity, refined accessories and disciplined bearing',
    patterns: [/丞相|尚书|太傅|祭酒|学士|文官|谋士/, /chancellor|minister|official|scholar|strategist/],
  },
  {
    key: 'military',
    summary: '军武/护卫',
    prompt: 'military identity details, disciplined posture, battle-ready accessories',
    patterns: [/将军|侍卫|护卫|武将|骑士|军官|战士|锦衣卫/, /general|guard|warrior|knight|soldier|military/],
  },
  {
    key: 'mystic',
    summary: '术法/修行',
    prompt: 'mystic practitioner identity, symbolic artifacts and ritual accents',
    patterns: [/修仙|道士|法师|术士|祭司|灵师|巫/, /cultivat|daoist|mage|sorcer|priest|shaman/],
  },
  {
    key: 'modern-profession',
    summary: '现代职业',
    prompt: 'clear modern profession identity, practical and status-consistent details',
    patterns: [/医生|律师|警察|学生|总裁|白领|记者|教师/, /doctor|lawyer|police|student|ceo|office|journalist|teacher/],
  },
];

const IDENTITY_FALLBACK: Rule = {
  key: 'generic-identity',
  summary: '通用身份',
  prompt: 'clear professional identity design, coherent social status markers',
  patterns: [],
};

export function resolveEraRule(
  signal: string,
  overrideEraKey?: PortraitEraKey,
): { rule: Rule; manual: boolean } {
  if (!overrideEraKey) {
    return { rule: pickRule(signal, ERA_RULES, ERA_FALLBACK), manual: false };
  }

  const manualRule = ERA_RULE_POOL.find(rule => rule.key === overrideEraKey);
  if (manualRule) {
    return { rule: manualRule, manual: true };
  }

  return { rule: pickRule(signal, ERA_RULES, ERA_FALLBACK), manual: false };
}

export function buildPortraitStyleOptions(
  roleAttireOptions: PortraitStyleOptions['roleAttireOptions'],
): PortraitStyleOptions {
  return {
    eraOptions: ERA_RULE_POOL.map(rule => ({
      key: rule.key as PortraitEraKey,
      label: rule.summary,
    })),
    roleAttireOptions,
    visualStyleOptions: VISUAL_STYLE_RULES.map(rule => ({
      key: rule.key,
      label: rule.label,
      summary: rule.summary,
    })),
    formatOptions: FORMAT_RULES.map(rule => ({
      key: rule.key,
      label: rule.label,
      summary: rule.summary,
    })),
  };
}

export function pickIdentityRule(signal: string): Rule {
  return pickRule(signal, IDENTITY_RULES, IDENTITY_FALLBACK);
}

export function deriveAttirePrompt(eraRule: Rule, identityRule: Rule): string {
  if (eraRule.key === 'cn-imperial' && identityRule.key === 'royal-noble') {
    return 'historical Chinese noble attire, layered hanfu robes, brocade embroidery, jade accessories, rank-appropriate ornaments';
  }
  if (eraRule.key === 'cn-imperial' && identityRule.key === 'civil-official') {
    return 'historical Chinese official robes, formal collar structure, restrained color hierarchy, rank insignia details';
  }
  if (eraRule.key === 'cn-fantasy' && identityRule.key === 'mystic') {
    return 'xianxia cultivation attire, flowing layered robes, symbolic talisman ornaments, elegant fabric motion';
  }
  if (identityRule.key === 'military') {
    return 'combat-ready costume, structured layers, practical belts and bracers, identity-matched weapon accessories';
  }
  if (eraRule.key === 'modern-urban' && identityRule.key === 'modern-profession') {
    return 'modern profession-consistent outfit, clean tailoring, practical material and accessory logic';
  }
  if (eraRule.key === 'sci-fi') {
    return 'futuristic functional costume, modular layers, technical texture details, profession-matched gear';
  }
  if (eraRule.key === 'western-medieval' && identityRule.key === 'royal-noble') {
    return 'medieval noble attire, embroidered surcoat over mail, heraldic tabard, fur-trimmed cloak, jeweled circlet';
  }
  if (eraRule.key === 'western-medieval' && identityRule.key === 'military') {
    return 'medieval knight armor, chainmail hauberk, plated gauntlets, heraldic surcoat, longsword belt';
  }
  if (eraRule.key === 'western-medieval') {
    return 'medieval european costume, layered tunics and cloaks, leather belts, period-appropriate headwear';
  }
  if (eraRule.key === 'western-antiquity' && identityRule.key === 'royal-noble') {
    return 'ancient regal attire, draped toga with purple border, golden laurel wreath, jeweled fibula brooch';
  }
  if (eraRule.key === 'western-antiquity' && identityRule.key === 'military') {
    return 'roman centurion or greek hoplite armor, lorica segmentata, crested helmet, gladius or spear';
  }
  if (eraRule.key === 'western-antiquity') {
    return 'classical antiquity draped garments, chiton or toga, leather sandals, minimal but elegant accessories';
  }
  if (eraRule.key === 'ancient-myth' && identityRule.key === 'mystic') {
    return 'archaic shamanic ritual attire, animal pelt mantle, bone and jade ornaments, totemic emblems, primal ceremonial garb';
  }
  if (eraRule.key === 'ancient-myth' && identityRule.key === 'royal-noble') {
    return 'primordial deity-king attire, mythic dragon-patterned robes, ancient jade ceremonial axe, divine aura motifs';
  }
  if (eraRule.key === 'ancient-myth') {
    return 'ancient tribal costume, woven hemp and hide garments, primitive bronze ornaments, ritualistic body markings';
  }
  if (eraRule.key === 'japanese-feudal' && identityRule.key === 'military') {
    return 'samurai armor with lamellar plates, kabuto helmet, sashimono banner, katana and wakizashi daisho';
  }
  if (eraRule.key === 'japanese-feudal' && identityRule.key === 'royal-noble') {
    return 'edo-period noble attire, formal kimono with kamon crests, hakama trousers, lacquered court cap';
  }
  if (eraRule.key === 'japanese-feudal') {
    return 'japanese feudal costume, layered kimono and obi sash, traditional footwear, period-appropriate hair ornaments';
  }
  if (eraRule.key === 'post-apocalyptic') {
    return 'post-apocalyptic survival outfit, scavenged layered clothing, patched fabrics, makeshift armor plates, utility pouches and gas mask';
  }
  return 'identity-consistent clothing design, fabrics and ornaments matching status and profession';
}

export function deriveFacialPrompt(char: CharacterProfile, signal: string): string {
  if (char.appearance?.trim()) {
    return `facial structure and features based on appearance: ${char.appearance.trim()}`;
  }
  if (includesAny(signal, [/青年|young|teen|少年/])) {
    return 'youthful facial structure, clean skin texture, vivid eyes';
  }
  if (includesAny(signal, [/中年|middle-aged/])) {
    return 'mature facial structure, subtle age lines, composed features';
  }
  if (includesAny(signal, [/老年|elder|aged|senior/])) {
    return 'elderly facial features, realistic wrinkles, experienced expression';
  }
  return 'highly detailed facial anatomy, clear eyes, defined brows and nose bridge';
}

export function deriveExpressionPrompt(signal: string): ExpressionRule {
  if (includesAny(signal, [/温柔|善良|亲和|治愈|gentle|kind|warm/])) {
    return { key: 'gentle', summary: '温和亲和', prompt: 'gentle expression, warm eyes, subtle friendly smile' };
  }
  if (includesAny(signal, [/冷静|理性|沉稳|克制|calm|composed|reserved/])) {
    return { key: 'composed', summary: '冷静克制', prompt: 'composed expression, steady gaze, restrained emotion' };
  }
  if (includesAny(signal, [/阴狠|狠厉|狡诈|腹黑|villain|cunning|ruthless|calculating/])) {
    return { key: 'calculating', summary: '危险算计', prompt: 'calculating eyes, restrained smirk, dangerous undertone in expression' };
  }
  if (includesAny(signal, [/傲慢|高傲|狂妄|arrogant|proud/])) {
    return { key: 'proud', summary: '傲慢强势', prompt: 'slightly raised chin, confident and proud expression, piercing gaze' };
  }
  if (includesAny(signal, [/活泼|阳光|开朗|cheerful|lively/])) {
    return { key: 'lively', summary: '活泼明亮', prompt: 'bright energetic expression, lively eyes, natural smile' };
  }
  return { key: 'balanced', summary: '性格一致', prompt: 'expression and micro-emotion aligned with personality and current mood' };
}

export function inferCulture(signal: string, char: CharacterProfile): CultureRule {
  for (const rule of CULTURE_RULES) {
    if (rule.patterns.some(re => re.test(signal) || re.test(char.name))) {
      return rule;
    }
  }
  return {
    profile: 'unspecified',
    positive: '符合角色姓名、外貌描述、出身背景与题材语境的自然面部特征，不预设亚洲或西方面孔',
    negative: ['与角色姓名和设定不符的固定族裔模板'],
    patterns: [],
    summary: '按角色线索自适应面容',
  };
}
