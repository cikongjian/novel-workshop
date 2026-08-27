/**
 * 角色语言漂移检测器
 *
 * 对比角色的 SpeechDNA / speechStyle 设定与近期章节中的实际对话，
 * 当检测到风格偏离时向 Writer 发出提醒。
 */

import type { CharacterProfile } from '../novel/types.js';

/** 中文对话正则：匹配「」或""包裹的内容 */
const DIALOGUE_RE = /(?:[\u201c\u300c])([^\u201d\u300d]+)(?:[\u201d\u300d])/g;

/** 说话人标记：XX说/道/喊/叫/笑道/冷哼 等 */
const SPEAKER_RE = /([\u4e00-\u9fff]{1,6})(?:说|道|喊|叫|笑道|冷笑|冷哼|低声|轻声|大声|怒道|叹道|问道|答道|喃喃|嘟囔|嘀咕|吼道|哼道|淡淡道|沉声道|开口道|接口道)/;

export type VoiceDriftWarning = {
  characterName: string;
  characterId: string;
  /** 设定中的语言特征摘要 */
  expectedVoice: string;
  /** 检测到的偏离描述 */
  driftDescription: string;
};

export type VoiceDriftAnalysis = {
  warnings: VoiceDriftWarning[];
};

/**
 * 从章节正文中提取角色对话
 */
function extractDialogueByCharacter(
  content: string,
  characterNames: string[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const name of characterNames) result.set(name, []);

  const lines = content.split('\n');
  for (const line of lines) {
    // 尝试匹配说话人
    const speakerMatch = line.match(SPEAKER_RE);
    if (!speakerMatch) continue;
    const speaker = speakerMatch[1];
    const matched = characterNames.find(n => n === speaker || n.includes(speaker) || speaker.includes(n));
    if (!matched) continue;

    // 提取该行所有对话内容
    const dialogues: string[] = [];
    let m: RegExpExecArray | null;
    DIALOGUE_RE.lastIndex = 0;
    while ((m = DIALOGUE_RE.exec(line)) !== null) {
      if (m[1].length > 2) dialogues.push(m[1]);
    }
    if (dialogues.length > 0) {
      result.get(matched)!.push(...dialogues);
    }
  }
  return result;
}

/**
 * 构建角色的语言指纹摘要（从 SpeechDNA + speechStyle）
 */
function buildVoiceFingerprint(char: CharacterProfile): string | null {
  const parts: string[] = [];
  if (char.speechStyle) parts.push(char.speechStyle);
  if (char.speechDNA) {
    const dna = char.speechDNA;
    if (dna.lexicon?.length) parts.push(`常用词汇：${dna.lexicon.join('、')}`);
    if (dna.tempo) parts.push(`语速：${dna.tempo}`);
    if (dna.tone?.length) parts.push(`语气：${dna.tone.join('、')}`);
    if (dna.tics?.length) parts.push(`口癖：${dna.tics.join('、')}`);
  }
  return parts.length > 0 ? parts.join('；') : null;
}

/** 简单特征：平均句长、问句比例、感叹比例 */
type DialogueFeatures = {
  avgLength: number;
  questionRatio: number;
  exclamationRatio: number;
  shortSentenceRatio: number; // 句子 <= 6 字
};

function computeDialogueFeatures(dialogues: string[]): DialogueFeatures | null {
  if (dialogues.length < 3) return null;
  const lengths = dialogues.map(d => d.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const questions = dialogues.filter(d => d.includes('？') || d.includes('?')).length;
  const exclamations = dialogues.filter(d => d.includes('！') || d.includes('!')).length;
  const shortOnes = dialogues.filter(d => d.length <= 6).length;
  return {
    avgLength,
    questionRatio: questions / dialogues.length,
    exclamationRatio: exclamations / dialogues.length,
    shortSentenceRatio: shortOnes / dialogues.length,
  };
}

/**
 * 检测语言漂移：对比设定中的 tempo/tics 与实际对话特征
 */
function detectDrift(
  char: CharacterProfile,
  dialogues: string[],
  _fingerprint: string,
): string | null {
  const features = computeDialogueFeatures(dialogues);
  if (!features) return null;

  const drifts: string[] = [];
  const dna = char.speechDNA;

  // 语速漂移检测
  if (dna?.tempo) {
    if (dna.tempo === 'slow' && features.avgLength < 8 && features.shortSentenceRatio > 0.5) {
      drifts.push(`设定语速"慢"（长句为主），但近期对话短句过多（${Math.round(features.shortSentenceRatio * 100)}%≤6字）`);
    }
    if (dna.tempo === 'fast' && features.avgLength > 20 && features.shortSentenceRatio < 0.1) {
      drifts.push(`设定语速"快"（短促为主），但近期对话偏长（均${Math.round(features.avgLength)}字/句）`);
    }
  }

  // 口癖缺失检测
  if (dna?.tics?.length) {
    const allText = dialogues.join('');
    const missingTics = dna.tics.filter(tic => !allText.includes(tic));
    if (missingTics.length === dna.tics.length && dialogues.length >= 5) {
      drifts.push(`口癖完全消失：设定有「${dna.tics.join('」「')}」，但近期对话中一个都没出现`);
    }
  }

  // 语气漂移：设定冷淡但感叹号过多，或设定热情但问句/感叹极少
  if (dna?.tone?.length) {
    const coldTones = ['冷淡', '冷漠', '平淡', '沉稳', '寡言'];
    const hotTones = ['热情', '活泼', '张扬', '暴躁', '激动'];
    const isCold = dna.tone.some(t => coldTones.some(c => t.includes(c)));
    const isHot = dna.tone.some(t => hotTones.some(h => t.includes(h)));

    if (isCold && features.exclamationRatio > 0.4) {
      drifts.push(`设定语气偏冷淡，但近期对话感叹句过多（${Math.round(features.exclamationRatio * 100)}%）`);
    }
    if (isHot && features.exclamationRatio < 0.05 && features.questionRatio < 0.05) {
      drifts.push(`设定语气热情/激动，但近期对话过于平淡，缺少感叹和反问`);
    }
  }

  return drifts.length > 0 ? drifts.join('；') : null;
}

/**
 * 分析角色语言漂移
 *
 * @param characters 角色档案列表
 * @param recentChapterContents 近期章节正文（按章节顺序）
 */
export function analyzeVoiceDrift(
  characters: CharacterProfile[],
  recentChapterContents: string[],
): VoiceDriftAnalysis {
  const warnings: VoiceDriftWarning[] = [];
  if (recentChapterContents.length === 0) return { warnings };

  // 只分析有语言设定的主要角色
  const majorRoles = new Set(['protagonist', 'deuteragonist', 'antagonist', 'rival', 'love_interest', 'mentor', 'ally', 'faction_leader', 'supporting']);
  const targetChars = characters.filter(c =>
    majorRoles.has(c.role) &&
    (c.speechStyle || c.speechDNA),
  );
  if (targetChars.length === 0) return { warnings };

  const charNames = targetChars.map(c => c.name);
  const combinedContent = recentChapterContents.join('\n');
  const dialogueMap = extractDialogueByCharacter(combinedContent, charNames);

  for (const char of targetChars) {
    const fingerprint = buildVoiceFingerprint(char);
    if (!fingerprint) continue;

    const dialogues = dialogueMap.get(char.name) ?? [];
    if (dialogues.length < 3) continue; // 对话太少无法判断

    const drift = detectDrift(char, dialogues, fingerprint);
    if (drift) {
      warnings.push({
        characterName: char.name,
        characterId: char.id,
        expectedVoice: fingerprint,
        driftDescription: drift,
      });
    }
  }

  return { warnings };
}

/**
 * 构建 Writer 注入的语言漂移提示
 */
export function buildVoiceDriftContext(analysis: VoiceDriftAnalysis): string {
  if (analysis.warnings.length === 0) return '';

  const lines = analysis.warnings.map(w =>
    `【${w.characterName}】${w.driftDescription}\n  设定语言特征：${w.expectedVoice}`,
  );
  return lines.join('\n\n');
}
