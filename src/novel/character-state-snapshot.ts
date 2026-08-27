import { randomUUID } from 'node:crypto';
import type { CharacterProfile, CharacterStateSnapshot } from './types.js';
import { isCriticalInfo } from '../pipeline/memory-decay.js';

type EmotionLabel = 'anger' | 'fear' | 'sadness' | 'joy' | 'calm' | 'determined';

type CharacterEvidenceContext = {
  paragraphIndices: Set<number>;
  evidenceMap: Map<number, Set<string>>;
};

const MAX_EVIDENCE_ITEMS = 5;
const TRUST_DELTA_LIMIT = 30;
const TRUST_POSITIVE_WEIGHT = 10;
const TRUST_NEGATIVE_WEIGHT = 12;
const GOAL_SUCCESS_WEIGHT = 12;
const GOAL_SETBACK_WEIGHT = 15;
const GOAL_DRIVE_WEIGHT = 8;
const GOAL_DETERMINED_WEIGHT = 6;

const EMOTION_RULES: Array<{ label: EmotionLabel; keywords: string[]; weight: number }> = [
  { label: 'anger', weight: 1.2, keywords: ['愤怒', '怒火', '暴怒', '恼火', '咬牙', '冷笑', '斥责', '拍桌', '怒视'] },
  { label: 'fear', weight: 1.2, keywords: ['恐惧', '害怕', '发抖', '颤抖', '惊慌', '胆寒', '后退', '窒息'] },
  { label: 'sadness', weight: 1, keywords: ['难过', '悲伤', '失落', '绝望', '哽咽', '落泪', '沉默', '低落'] },
  { label: 'joy', weight: 1, keywords: ['喜悦', '欣慰', '轻松', '雀跃', '兴奋', '大笑', '微笑'] },
  { label: 'calm', weight: 0.8, keywords: ['平静', '冷静', '镇定', '从容', '克制'] },
  { label: 'determined', weight: 1.1, keywords: ['决定', '必须', '坚持', '发誓', '下定决心', '无论如何'] },
];

const CONFLICT_KEYWORDS = ['冲突', '争执', '争吵', '对峙', '威胁', '质问', '敌意', '对抗'];
const GOAL_SUCCESS_KEYWORDS = ['成功', '达成', '突破', '完成', '获得', '说服', '赢下', '掌控'];
const GOAL_SETBACK_KEYWORDS = ['失败', '受挫', '失去', '错过', '拒绝', '受伤', '失控', '被迫'];
const RELATION_POSITIVE_KEYWORDS = ['信任', '依赖', '支持', '合作', '感激', '保护', '安慰', '拥抱'];
const RELATION_NEGATIVE_KEYWORDS = ['怀疑', '背叛', '欺骗', '敌视', '威胁', '冲突', '争吵', '冷漠'];
const BELIEF_SHIFT_KEYWORDS = ['意识到', '明白', '终于懂得', '不再', '改变主意', '开始相信', '开始怀疑'];

const EMOTION_LABELS: EmotionLabel[] = ['anger', 'fear', 'sadness', 'joy', 'calm', 'determined'];

export function buildCharacterStateSnapshots(params: {
  novelId: string;
  chapterNumber: number;
  chapterContent: string;
  characters: CharacterProfile[];
  timestamp?: string;
}): CharacterStateSnapshot[] {
  const { novelId, chapterNumber, chapterContent, characters } = params;
  if (!chapterContent.trim() || characters.length === 0) {
    return [];
  }

  const timestamp = params.timestamp ?? new Date().toISOString();
  const paragraphs = splitChapterParagraphs(chapterContent);
  if (paragraphs.length === 0) {
    return [];
  }

  const characterById = new Map<string, CharacterProfile>();
  const normalizedNameToCharacterId = new Map<string, string>();
  const characterNames = new Map<string, string[]>();

  for (const character of characters) {
    characterById.set(character.id, character);
    const names = [character.name, ...character.aliases]
      .map((name) => name.trim())
      .filter(Boolean);
    characterNames.set(character.id, names);
    for (const name of names) {
      const normalized = normalizeName(name);
      if (!normalizedNameToCharacterId.has(normalized)) {
        normalizedNameToCharacterId.set(normalized, character.id);
      }
    }
  }

  const contexts = new Map<string, CharacterEvidenceContext>();
  const paragraphCharacters = new Map<number, Set<string>>();

  paragraphs.forEach((paragraph, paragraphIdx) => {
    const participantIds = new Set<string>();

    const speakerNames = extractSpeakerNames(paragraph);
    for (const speakerName of speakerNames) {
      const characterId = normalizedNameToCharacterId.get(normalizeName(speakerName));
      if (!characterId) continue;
      participantIds.add(characterId);
      addEvidence(contexts, characterId, paragraphIdx, 'speaker marker');
    }

    for (const [characterId, names] of characterNames) {
      if (paragraphMentionsCharacter(paragraph, names)) {
        participantIds.add(characterId);
      }
    }

    if (participantIds.size === 0) return;

    paragraphCharacters.set(paragraphIdx, participantIds);
    for (const characterId of participantIds) {
      addEvidence(contexts, characterId, paragraphIdx, 'name mention');
    }
  });

  const snapshots: CharacterStateSnapshot[] = [];
  for (const character of characters) {
    const context = contexts.get(character.id);
    if (!context || context.paragraphIndices.size === 0) continue;

    const paragraphIds = [...context.paragraphIndices].sort((a, b) => a - b);
    const emotionScores: Record<EmotionLabel, number> = {
      anger: 0,
      fear: 0,
      sadness: 0,
      joy: 0,
      calm: 0,
      determined: 0,
    };

    const trustByTarget = new Map<string, number>();
    const trustReasonByTarget = new Map<string, string>();
    let successHits = 0;
    let setbackHits = 0;
    let conflictHits = 0;
    let determinedHits = 0;
    let driveHits = 0;
    let exclamationHits = 0;
    let triggerKeyword: string | undefined;
    let beliefShift = '';

    for (const paragraphIdx of paragraphIds) {
      const paragraph = paragraphs[paragraphIdx] ?? '';
      exclamationHits += countPunctuation(paragraph, /[!！]/g);

      for (const rule of EMOTION_RULES) {
        const hits = countKeywordHits(paragraph, rule.keywords);
        if (hits > 0) {
          emotionScores[rule.label] += hits * rule.weight;
          if (!triggerKeyword) {
            triggerKeyword = findFirstKeyword(paragraph, rule.keywords);
          }
          const cue = findFirstKeyword(paragraph, rule.keywords);
          if (cue) {
            addEvidence(contexts, character.id, paragraphIdx, `emotion:${cue}`);
          }
        }
      }

      const conflictCue = findFirstKeyword(paragraph, CONFLICT_KEYWORDS);
      if (conflictCue) {
        conflictHits += countKeywordHits(paragraph, CONFLICT_KEYWORDS);
        addEvidence(contexts, character.id, paragraphIdx, `conflict:${conflictCue}`);
      }

      const successCue = findFirstKeyword(paragraph, GOAL_SUCCESS_KEYWORDS);
      if (successCue) {
        successHits += countKeywordHits(paragraph, GOAL_SUCCESS_KEYWORDS);
        addEvidence(contexts, character.id, paragraphIdx, `goal:+${successCue}`);
      }

      const setbackCue = findFirstKeyword(paragraph, GOAL_SETBACK_KEYWORDS);
      if (setbackCue) {
        setbackHits += countKeywordHits(paragraph, GOAL_SETBACK_KEYWORDS);
        addEvidence(contexts, character.id, paragraphIdx, `goal:-${setbackCue}`);
      }

      const determinedCue = findFirstKeyword(paragraph, EMOTION_RULES.find((item) => item.label === 'determined')?.keywords ?? []);
      if (determinedCue) {
        determinedHits += countKeywordHits(
          paragraph,
          EMOTION_RULES.find((item) => item.label === 'determined')?.keywords ?? [],
        );
      }

      const drive = character.drives?.want?.trim();
      if (drive && drive.length >= 2 && paragraph.includes(drive)) {
        driveHits += 1;
        addEvidence(contexts, character.id, paragraphIdx, 'goal:drive reference');
      }

      if (!beliefShift) {
        const shiftCue = findFirstKeyword(paragraph, BELIEF_SHIFT_KEYWORDS);
        if (shiftCue) {
          beliefShift = `${shiftCue}: ${truncateText(paragraph, 40)}`;
          addEvidence(contexts, character.id, paragraphIdx, `belief:${shiftCue}`);
        }
      }

      const participants = paragraphCharacters.get(paragraphIdx);
      if (!participants || participants.size <= 1) continue;

      const positiveHits = countKeywordHits(paragraph, RELATION_POSITIVE_KEYWORDS);
      const negativeHits = countKeywordHits(paragraph, RELATION_NEGATIVE_KEYWORDS);
      if (positiveHits === 0 && negativeHits === 0) continue;

      for (const targetId of participants) {
        if (targetId === character.id) continue;
        const delta = clamp(
          (positiveHits * TRUST_POSITIVE_WEIGHT) - (negativeHits * TRUST_NEGATIVE_WEIGHT),
          -TRUST_DELTA_LIMIT,
          TRUST_DELTA_LIMIT,
        );
        if (delta === 0) continue;
        const prev = trustByTarget.get(targetId) ?? 0;
        trustByTarget.set(targetId, clamp(prev + delta, -100, 100));
        if (!trustReasonByTarget.has(targetId)) {
          trustReasonByTarget.set(targetId, truncateText(paragraph, 36));
        }
        const targetName = characterById.get(targetId)?.name ?? 'unknown';
        addEvidence(contexts, character.id, paragraphIdx, `relationship:${targetName}`);
      }
    }

    const dominant = EMOTION_LABELS
      .map((label) => ({ label, score: emotionScores[label] }))
      .sort((a, b) => b.score - a.score)[0];
    const primaryEmotion = dominant && dominant.score >= 1 ? dominant.label : 'neutral';
    const emotionIntensity = clamp(
      Math.round((Object.values(emotionScores).reduce((sum, value) => sum + value, 0) * 16)
        + (conflictHits * 8)
        + (exclamationHits * 4)),
      0,
      100,
    );

    const goalProgress = clamp(
      Math.round(45
        + (successHits * GOAL_SUCCESS_WEIGHT)
        - (setbackHits * GOAL_SETBACK_WEIGHT)
        + (driveHits * GOAL_DRIVE_WEIGHT)
        + (determinedHits * GOAL_DETERMINED_WEIGHT)),
      0,
      100,
    );

    const negativeEmotion = emotionScores.anger + emotionScores.fear + emotionScores.sadness;
    const positiveEmotion = emotionScores.joy + emotionScores.calm;
    const stress = clamp(
      Math.round(30
        + (negativeEmotion * 12)
        + (conflictHits * 8)
        + (setbackHits * 6)
        - (positiveEmotion * 8)),
      0,
      100,
    );

    const trustChanges = [...trustByTarget.entries()].map(([targetId, delta]) => ({
      targetId,
      delta,
      reason: trustReasonByTarget.get(targetId) ?? '',
    }));

    const evidence = buildEvidence(context.evidenceMap);

    // 检查角色相关段落是否包含关键事件标记
    const characterText = paragraphIds.map(i => paragraphs[i] ?? '').join('');
    const critical = isCriticalInfo(characterText);

    snapshots.push({
      id: randomUUID(),
      novelId,
      characterId: character.id,
      chapterNumber,
      emotionState: {
        primary: primaryEmotion,
        intensity: emotionIntensity,
        trigger: triggerKeyword,
      },
      goalProgress,
      stress,
      trustChanges,
      beliefShift,
      evidence,
      isCritical: critical,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return snapshots;
}

function splitChapterParagraphs(content: string): string[] {
  const byBlankLine = content
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;
  return content
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractSpeakerNames(paragraph: string): string[] {
  const markerRe = /[\(\uFF08]\s*#\s*([^()\uFF08\uFF09\n]+?)\s*[\)\uFF09]/g;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(paragraph)) !== null) {
    const name = match[1]?.trim();
    if (name) names.push(name);
  }
  return names;
}

function paragraphMentionsCharacter(paragraph: string, names: string[]): boolean {
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (trimmed.length < 2) continue;
    if (paragraph.includes(trimmed)) return true;
  }
  return false;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s\u3000·•]/g, '');
}

function addEvidence(
  contexts: Map<string, CharacterEvidenceContext>,
  characterId: string,
  paragraphIdx: number,
  reason: string,
): void {
  const context = contexts.get(characterId) ?? {
    paragraphIndices: new Set<number>(),
    evidenceMap: new Map<number, Set<string>>(),
  };

  context.paragraphIndices.add(paragraphIdx);
  const reasons = context.evidenceMap.get(paragraphIdx) ?? new Set<string>();
  reasons.add(reason);
  context.evidenceMap.set(paragraphIdx, reasons);
  contexts.set(characterId, context);
}

function buildEvidence(evidenceMap: Map<number, Set<string>>): CharacterStateSnapshot['evidence'] {
  return [...evidenceMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(0, MAX_EVIDENCE_ITEMS)
    .map(([paragraphIdx, reasons]) => ({
      paragraphIdx,
      reason: truncateText([...reasons].join('; '), 120),
    }));
}

function countKeywordHits(text: string, keywords: string[]): number {
  let hits = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword)) hits += 1;
  }
  return hits;
}

function findFirstKeyword(text: string, keywords: string[]): string | undefined {
  for (const keyword of keywords) {
    if (text.includes(keyword)) return keyword;
  }
  return undefined;
}

function countPunctuation(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
