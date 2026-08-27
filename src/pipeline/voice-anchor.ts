import type { CharacterProfile } from '../novel/types.js';

const SPEAKER_DIALOGUE_RE = /(?:\(|（)\s*#\s*([^)）\n]{1,24})\s*(?:\)|）)\s*[“"「『]([^”"」』\n]{1,120})[”"」』]/g;
const MODAL_PARTICLES = ['啊', '呢', '吧', '嘛', '哼', '呀', '呗', '喂', '唉'];

type AnchorFeature = {
  avgLength: number;
  questionRatio: number;
  modalTop: string[];
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function buildNameToCharacterMap(characters: CharacterProfile[]): Map<string, CharacterProfile> {
  const map = new Map<string, CharacterProfile>();
  for (const character of characters) {
    map.set(normalizeName(character.name), character);
    for (const alias of character.aliases ?? []) {
      map.set(normalizeName(alias), character);
    }
  }
  return map;
}

function extractDialoguesByCharacter(
  contents: string[],
  characters: CharacterProfile[],
): Map<string, string[]> {
  const nameMap = buildNameToCharacterMap(characters);
  const buckets = new Map<string, string[]>();
  for (const character of characters) {
    buckets.set(character.id, []);
  }

  for (const content of contents) {
    const matcher = new RegExp(SPEAKER_DIALOGUE_RE.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(content)) !== null) {
      const speaker = normalizeName(match[1] ?? '');
      const line = (match[2] ?? '').trim();
      if (!speaker || !line) continue;
      const character = nameMap.get(speaker);
      if (!character) continue;
      buckets.get(character.id)?.push(line);
    }
  }

  return buckets;
}

function computeAnchorFeature(dialogues: string[]): AnchorFeature | null {
  if (dialogues.length < 4) return null;
  const avgLength = dialogues.reduce((sum, item) => sum + item.length, 0) / dialogues.length;
  const questions = dialogues.filter(item => /[?？]/.test(item)).length;

  const modalCounter = new Map<string, number>();
  for (const line of dialogues) {
    for (const particle of MODAL_PARTICLES) {
      if (line.includes(particle)) {
        modalCounter.set(particle, (modalCounter.get(particle) ?? 0) + 1);
      }
    }
  }

  const modalTop = [...modalCounter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(item => item[0]);

  return {
    avgLength: Math.round(avgLength * 10) / 10,
    questionRatio: Math.round((questions / dialogues.length) * 1000) / 10,
    modalTop,
  };
}

export function buildVoiceAnchorHints(params: {
  characters: CharacterProfile[];
  recentChapterContents: string[];
}): string {
  const { characters, recentChapterContents } = params;
  if (recentChapterContents.length === 0 || characters.length === 0) return '';

  const majorRoles = new Set(['protagonist', 'deuteragonist', 'antagonist', 'rival', 'love_interest', 'mentor', 'ally', 'faction_leader', 'supporting']);
  const majorChars = characters.filter(item => majorRoles.has(item.role));
  if (majorChars.length === 0) return '';

  const dialogueMap = extractDialoguesByCharacter(recentChapterContents, majorChars);
  const lines: string[] = [];
  for (const character of majorChars.slice(0, 5)) {
    const dialogues = dialogueMap.get(character.id) ?? [];
    const feature = computeAnchorFeature(dialogues);
    if (!feature) continue;

    const lengthLabel = feature.avgLength <= 10 ? '短句偏多' : feature.avgLength >= 18 ? '长句偏多' : '中句为主';
    const modalLabel = feature.modalTop.length > 0
      ? `语气词锚点：${feature.modalTop.join(' / ')}`
      : '语气词锚点：尽量维持既有克制表达';
    lines.push(`- 【${character.name}】${lengthLabel}（均长${feature.avgLength}字），反问率约${feature.questionRatio}%；${modalLabel}`);
  }

  if (lines.length === 0) return '';
  return [
    '角色口吻锚点（来自近期高质量对话，优先保持）',
    ...lines,
  ].join('\n');
}
