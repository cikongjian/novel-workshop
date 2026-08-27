import type { CharacterProfile } from '../novel/types.js';

export type CharacterIdentitySpeechRule = {
  ruleKey: string;
  identityLabel: string;
  preferredSelfRefs: string[];
  forbiddenSelfRefs: string[];
  preferredAddressByOthers: string[];
  forbiddenAddressByOthers: string[];
};

type IdentityRuleTemplate = {
  ruleKey: string;
  keywords: RegExp;
  preferredSelfRefs: string[];
  forbiddenSelfRefs: string[];
  preferredAddressByOthers: string[];
  forbiddenAddressByOthers: string[];
};

const IDENTITY_RULES: IdentityRuleTemplate[] = [
  {
    ruleKey: 'emperor',
    keywords: /(皇帝|天子|陛下|圣上|女帝|帝君|人皇|君王|王上)/,
    preferredSelfRefs: ['朕'],
    forbiddenSelfRefs: ['本王', '本侯', '本宫', '末将', '臣'],
    preferredAddressByOthers: ['陛下', '圣上'],
    forbiddenAddressByOthers: ['殿下', '王爷', '娘娘', '将军', '大人', '侯爷', '公爷'],
  },
  {
    ruleKey: 'empress-dowager',
    keywords: /(太后|皇太后)/,
    preferredSelfRefs: ['哀家', '本宫'],
    forbiddenSelfRefs: ['朕', '本王', '末将'],
    preferredAddressByOthers: ['太后', '娘娘'],
    forbiddenAddressByOthers: ['陛下', '殿下', '王爷', '将军', '大人'],
  },
  {
    ruleKey: 'empress-consort',
    keywords: /(皇后|贵妃|妃|皇贵妃|贵人|嫔|昭仪)/,
    preferredSelfRefs: ['本宫', '妾身', '我'],
    forbiddenSelfRefs: ['朕', '本王', '本侯', '末将'],
    preferredAddressByOthers: ['娘娘'],
    forbiddenAddressByOthers: ['陛下', '殿下', '王爷', '将军', '大人'],
  },
  {
    ruleKey: 'crown-prince',
    keywords: /(太子|皇太子|储君|东宫)/,
    preferredSelfRefs: ['本宫', '孤', '我'],
    forbiddenSelfRefs: ['朕'],
    preferredAddressByOthers: ['殿下', '太子殿下'],
    forbiddenAddressByOthers: ['陛下', '娘娘', '王爷', '将军', '大人'],
  },
  {
    ruleKey: 'royal-prince',
    keywords: /(亲王|郡王|藩王|王爷|王爵|世子)/,
    preferredSelfRefs: ['本王', '我'],
    forbiddenSelfRefs: ['朕', '本宫'],
    preferredAddressByOthers: ['王爷', '殿下'],
    forbiddenAddressByOthers: ['陛下', '娘娘', '将军', '大人'],
  },
  {
    ruleKey: 'princess',
    keywords: /(公主|郡主)/,
    preferredSelfRefs: ['本宫', '本公主', '我'],
    forbiddenSelfRefs: ['朕', '本王', '末将'],
    preferredAddressByOthers: ['殿下', '公主'],
    forbiddenAddressByOthers: ['陛下', '娘娘', '王爷', '将军', '大人'],
  },
  {
    ruleKey: 'nobility',
    keywords: /(侯爷|侯爵|侯|公爵|国公|伯爵|伯|勋爵)/,
    preferredSelfRefs: ['本侯', '本公', '我'],
    forbiddenSelfRefs: ['朕', '本宫', '末将'],
    preferredAddressByOthers: ['侯爷', '公爷'],
    forbiddenAddressByOthers: ['陛下', '殿下', '娘娘', '将军', '大人'],
  },
  {
    ruleKey: 'military',
    keywords: /(大将军|将军|都督|统领|校尉|元帅|军侯|武将)/,
    preferredSelfRefs: ['末将', '卑职', '我'],
    forbiddenSelfRefs: ['朕', '本宫'],
    preferredAddressByOthers: ['将军'],
    forbiddenAddressByOthers: ['陛下', '殿下', '娘娘', '王爷', '侯爷', '公爷'],
  },
  {
    ruleKey: 'civil-official',
    keywords: /(丞相|宰相|相国|尚书|侍郎|太守|知府|县令|御史|学士|大臣|臣子|臣工|内阁|首辅)/,
    preferredSelfRefs: ['臣', '下官', '微臣', '我'],
    forbiddenSelfRefs: ['朕', '本王', '本宫', '本侯'],
    preferredAddressByOthers: ['大人'],
    forbiddenAddressByOthers: ['陛下', '殿下', '娘娘', '王爷', '将军', '侯爷', '公爷'],
  },
  {
    ruleKey: 'servant',
    keywords: /(太监|公公|总管|宫女|嬷嬷|丫鬟|侍女|奴才|奴婢|家丁|仆役|小厮)/,
    preferredSelfRefs: ['奴才', '奴婢', '老奴', '小的'],
    forbiddenSelfRefs: ['朕', '本王', '本宫', '本侯'],
    preferredAddressByOthers: ['公公', '姑姑', '嬷嬷'],
    forbiddenAddressByOthers: ['陛下', '殿下', '娘娘', '王爷', '将军', '大人', '侯爷', '公爷'],
  },
  {
    ruleKey: 'jianghu-commoner',
    keywords: /(江湖|门派|散修|掌柜|商贾|书生|平民|百姓|猎户|郎中|镖师|弟子|晚辈|在下)/,
    preferredSelfRefs: ['在下', '晚辈', '小人', '我'],
    forbiddenSelfRefs: ['朕', '本宫'],
    preferredAddressByOthers: [],
    forbiddenAddressByOthers: ['陛下', '殿下', '娘娘'],
  },
];

const COURT_SIGNAL_KEYWORDS = /(朝廷|宫中|后宫|王府|官场|爵位|宗室|宗亲|皇室|帝国|门阀|世家)/;
const COURT_FORBIDDEN_SELF_REFS = ['朕'];

function compact(value: string | undefined): string {
  return (value ?? '').trim();
}

function previewList(items: string[], maxItems: number): string {
  if (items.length <= maxItems) return items.join(' / ');
  return `${items.slice(0, maxItems).join(' / ')} 等${items.length}项`;
}

function buildIdentityText(character: CharacterProfile): string {
  return [
    character.role,
    compact(character.position),
    compact(character.speechStyle),
    compact(character.socialIdentity?.socialClass),
    compact(character.socialIdentity?.reputation),
  ]
    .filter(Boolean)
    .join(' ');
}

export function inferCharacterIdentitySpeechRule(character: CharacterProfile): CharacterIdentitySpeechRule | null {
  const identityText = buildIdentityText(character);
  if (!identityText) return null;

  const label = compact(character.position) || (compact(character.socialIdentity?.socialClass)) || '既定身份';
  for (const item of IDENTITY_RULES) {
    if (!item.keywords.test(identityText)) continue;
    return {
      ruleKey: item.ruleKey,
      identityLabel: label,
      preferredSelfRefs: item.preferredSelfRefs,
      forbiddenSelfRefs: item.forbiddenSelfRefs,
      preferredAddressByOthers: item.preferredAddressByOthers,
      forbiddenAddressByOthers: item.forbiddenAddressByOthers,
    };
  }

  if (COURT_SIGNAL_KEYWORDS.test(identityText)) {
    return {
      ruleKey: 'court-generic',
      identityLabel: label,
      preferredSelfRefs: ['我'],
      forbiddenSelfRefs: COURT_FORBIDDEN_SELF_REFS,
      preferredAddressByOthers: [],
      forbiddenAddressByOthers: [],
    };
  }

  return null;
}

export function buildIdentitySpeechRuleLine(character: CharacterProfile): string {
  const rule = inferCharacterIdentitySpeechRule(character);
  if (!rule) return '';

  const parts: string[] = [`身份：${rule.identityLabel}`];
  if (rule.preferredSelfRefs.length > 0) {
    parts.push(`优先自称：${previewList(rule.preferredSelfRefs, 2)}`);
  }
  if (rule.forbiddenSelfRefs.length > 0) {
    parts.push(`禁用自称：${previewList(rule.forbiddenSelfRefs, 3)}`);
  }
  if (rule.preferredAddressByOthers.length > 0) {
    parts.push(`他人称呼优先：${previewList(rule.preferredAddressByOthers, 2)}`);
  }
  return parts.join('；');
}

export function normalizeCharacterName(name: string): string {
  return name.trim().toLowerCase();
}

export function getCharacterNameVariants(character: CharacterProfile): string[] {
  const names = [character.name, ...(character.aliases ?? [])]
    .map(item => item.trim())
    .filter(Boolean);
  return [...new Set(names)];
}

export function resolveCharacterBySpeakerName(
  characters: CharacterProfile[],
  speakerName: string,
): CharacterProfile | undefined {
  const normalized = normalizeCharacterName(speakerName);
  return characters.find(character => {
    if (normalizeCharacterName(character.name) === normalized) return true;
    return (character.aliases ?? []).some(alias => normalizeCharacterName(alias) === normalized);
  });
}
