import type { CharacterProfile } from '../../../novel/types.js';

const TITLE_PREFIXES = [
  '大元帅', '元帅', '将军', '统领', '总兵', '都督',
  '皇帝', '国王', '太子', '王子', '王爷', '公主', '皇后', '太后', '贵妃',
  '少年', '青年', '老年', '婴儿', '幼年',
  '丞相', '宰相', '太师', '太傅', '尚书', '侍郎',
] as const;

export type SpeakerBackfillCharacter = Pick<CharacterProfile, 'name' | 'aliases'>;

export function buildCharacterAliasMap(characters: SpeakerBackfillCharacter[]): {
  nameNormMap: Map<string, string>;
  charInfoLines: string[];
} {
  const nameNormMap = new Map<string, string>();
  const charInfoLines = characters.map(character => {
    const allAliases = [...character.aliases];
    for (const prefix of TITLE_PREFIXES) {
      if (character.name.startsWith(prefix) && character.name.length > prefix.length) {
        const shortName = character.name.slice(prefix.length);
        if (shortName.length >= 2 && !allAliases.includes(shortName)) {
          allAliases.push(shortName);
        }
      }
    }
    for (const alias of allAliases) {
      if (!nameNormMap.has(alias)) {
        nameNormMap.set(alias, character.name);
      }
    }
    const aliasStr = allAliases.length > 0 ? `（别名/简称：${allAliases.join('、')}）` : '';
    return `- ${character.name}${aliasStr}`;
  });
  return { nameNormMap, charInfoLines };
}
