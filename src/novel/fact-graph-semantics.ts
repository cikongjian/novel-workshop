import type { CharacterAppearance, CharacterStateChange } from './fact-graph-types.js';

export const SENTENCE_SPLIT_RE = /[。！？!?…\n]+/;
export const FLASHBACK_CUES = /回忆|忆起|忆及|想起|当年|昔年|那一年|那时候|彼时|曾经|往昔/;
export const MEMORY_CUES = /回忆|记忆|忆起|忆及|想起|记得|曾经|往昔|旧事|当年|残像|影像|意识残留|遗言/;
export const DREAM_CUES = /梦见|梦到|梦中|幻觉|幻象|仿佛看见|好似看见/;
export const CORPSE_CUES = /尸体|尸首|遗体|棺|墓|坟|灵位|牌位/;
export const REFERENCE_CUES = /提到|提及|说起|谈起|听闻|据说|传闻|传言|得知|听说|有人说/;
export const DIALOGUE_CUES = /说道|问道|答道|开口|低声|冷笑|怒喝|喝道|应道|喃喃/;
export const ONSTAGE_CUES = /来到|到达|抵达|进入|走进|踏入|回到|出现|现身|站在|坐在|跪在|看向|望向|抬头|回头|转身|伸手|挥剑|施法|冲出|奔向|启程|出发|醒来|倒下/;
export const CONFIRMED_DEATH_CUES = /当场身亡|当场毙命|断气|气绝|咽气|身死|尸体|遗体|确认死亡|已死|死透|再无声息|不动了|没了动静|再无动静/;
export const SUSPECTED_DEATH_CUES = /似乎死了|像是死了|没了气息|生死不知|以为.{0,4}死|恐怕活不成|(?:如果|假如|若是?|要是).{0,12}死/;
export const RUMORED_DEATH_CUES = /传闻.{0,8}死|据说.{0,8}死|听闻.{0,8}死|听说.{0,8}死|有人说.{0,8}死|所有人都以为.{0,8}死/;
export const LOCATION_ARRIVAL_RE = /(来到|到达|抵达|进入|走进|踏入|回到)[了]?[「『""]?([^\s，。！？「『""]{2,10})/g;
export const LOCATION_AT_RE = /在([^\s，。！？]{2,10})[中里内上]/g;

const APPEARANCE_PRIORITY: Record<CharacterAppearance['mentionType'], number> = {
  onstage: 5,
  dialogue: 4,
  corpse: 3,
  memory: 2,
  dream: 1,
  reference: 0,
};

export type CharacterMention = {
  name: string;
  index: number;
};

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT_RE)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findCharacterMentions(sentence: string, characterNames: string[]): CharacterMention[] {
  const mentions: CharacterMention[] = [];
  for (const name of characterNames) {
    let fromIndex = 0;
    while (fromIndex < sentence.length) {
      const index = sentence.indexOf(name, fromIndex);
      if (index < 0) break;
      mentions.push({ name, index });
      fromIndex = index + name.length;
    }
  }
  return mentions.sort((a, b) => a.index - b.index);
}

export function findNearestCharacter(
  sentence: string,
  characterNames: string[],
  anchorIndex?: number,
): string {
  const mentions = findCharacterMentions(sentence, characterNames);
  if (mentions.length === 0) return '';
  if (anchorIndex === undefined) return mentions[0]?.name ?? '';

  let winner = mentions[0]!;
  let bestDistance = Math.abs(winner.index - anchorIndex);
  for (const mention of mentions.slice(1)) {
    const distance = Math.abs(mention.index - anchorIndex);
    if (distance < bestDistance) {
      winner = mention;
      bestDistance = distance;
    }
  }
  return winner.name;
}

export function inferMentionType(sentence: string, name: string): CharacterAppearance['mentionType'] {
  if (DREAM_CUES.test(sentence)) return 'dream';
  if (MEMORY_CUES.test(sentence)) return 'memory';
  if (CORPSE_CUES.test(sentence)) return 'corpse';
  const escapedName = escapeRegExp(name);
  const singleMention = sentence.indexOf(name, sentence.indexOf(name) + name.length) < 0;
  const archivalReferencePattern = new RegExp(
    `${escapedName}(?:的|在)?[^，。！？；：:“”"'「」『』]{0,14}`
    + '(?:日记|消息|记录|指令|照片|画像|录音|录像|遗言|遗物|旧居|住处|房子)',
  );
  const historicalReferencePattern = new RegExp(
    `${escapedName}[^，。！？；：:“”"'「」『』]{0,16}(?:年前|当年|曾经|那时候)`,
  );
  if ((singleMention && archivalReferencePattern.test(sentence)) || historicalReferencePattern.test(sentence)) {
    return 'memory';
  }
  if (REFERENCE_CUES.test(sentence) && !ONSTAGE_CUES.test(sentence) && !DIALOGUE_CUES.test(sentence)) {
    return 'reference';
  }
  const clauseText = '[^，。！？；：:“”"\'「」『』]';
  const dialoguePattern = new RegExp(`${escapedName}${clauseText}{0,8}(?:${DIALOGUE_CUES.source})`);
  if (dialoguePattern.test(sentence)) {
    return 'dialogue';
  }
  const onstagePattern = new RegExp(
    `(?:${escapedName}${clauseText}{0,10}(?:${ONSTAGE_CUES.source})|(?:${ONSTAGE_CUES.source})${clauseText}{0,10}${escapedName})`,
  );
  if (onstagePattern.test(sentence)) {
    return 'onstage';
  }
  return 'reference';
}

export function mentionConfidence(mentionType: CharacterAppearance['mentionType']): number {
  switch (mentionType) {
    case 'onstage':
      return 0.92;
    case 'dialogue':
      return 0.86;
    case 'corpse':
      return 0.72;
    case 'memory':
      return 0.6;
    case 'dream':
      return 0.48;
    default:
      return 0.44;
  }
}

export function sourceTypeFromMention(mentionType: CharacterAppearance['mentionType']): CharacterStateChange['sourceType'] {
  if (mentionType === 'memory') return 'memory';
  if (mentionType === 'dream') return 'dream';
  if (mentionType === 'reference') return 'reference';
  return 'direct';
}

export function inferStateCertainty(
  state: CharacterStateChange['newState'],
  sentence: string,
  sourceType: CharacterStateChange['sourceType'],
): CharacterStateChange['certainty'] {
  if (state === 'dead') {
    if (sourceType === 'dream') return 'suspected';
    if (RUMORED_DEATH_CUES.test(sentence)) return 'rumored';
    if (SUSPECTED_DEATH_CUES.test(sentence)) return 'suspected';
    if (CONFIRMED_DEATH_CUES.test(sentence)) return 'confirmed';
    return sourceType === 'direct' ? 'confirmed' : 'suspected';
  }
  if (sourceType === 'reference') return 'rumored';
  if (sourceType === 'memory' || sourceType === 'dream') return 'suspected';
  return 'confirmed';
}

export function extractLocationFromSentence(sentence: string): string {
  LOCATION_ARRIVAL_RE.lastIndex = 0;
  const arrival = LOCATION_ARRIVAL_RE.exec(sentence);
  if (arrival) {
    LOCATION_ARRIVAL_RE.lastIndex = 0;
    return arrival[2] ?? '';
  }
  LOCATION_ARRIVAL_RE.lastIndex = 0;
  const locMatch = sentence.match(/在([^\s，。！？]{2,10})[中里内上]/);
  return locMatch?.[1] ?? '';
}

export function extractActionFromSentence(
  sentence: string,
  name: string,
  mentionType: CharacterAppearance['mentionType'],
): string {
  const clauseText = '[^，。！？；：:“”"\'「」『』]';
  const patterns = [
    new RegExp(`${escapeRegExp(name)}${clauseText}{0,8}((?:${ONSTAGE_CUES.source}|${DIALOGUE_CUES.source}))`),
    new RegExp(`((?:${ONSTAGE_CUES.source}|${DIALOGUE_CUES.source}))${clauseText}{0,8}${escapeRegExp(name)}`),
  ];
  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    if (match?.[1]) return match[1];
  }
  if (mentionType === 'dialogue') return '开口';
  return '';
}

export function isBetterAppearance(candidate: CharacterAppearance, current?: CharacterAppearance): boolean {
  if (!current) return true;
  const candidatePriority = APPEARANCE_PRIORITY[candidate.mentionType];
  const currentPriority = APPEARANCE_PRIORITY[current.mentionType];
  if (candidatePriority !== currentPriority) return candidatePriority > currentPriority;
  return candidate.confidence > current.confidence;
}
