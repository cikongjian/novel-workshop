import type { StyleDNA } from './style-types.js';

/**
 * Converts a StyleDNA into a human-readable Chinese prompt for Writer/Editor agents.
 */
export function buildStyleDNAPrompt(dna: StyleDNA): string {
  const sections: string[] = [];

  sections.push(`## 风格DNA指导：${dna.name}`);
  if (dna.userNotes) {
    sections.push(`> 作者备注：${dna.userNotes}`);
  }

  // Sentence rhythm
  const sl = dna.sentenceLength;
  const dominant = getDominantBucket(sl);
  sections.push(
    `### 句式节奏`,
    `- 句子平均长度约 ${sl.avgLength} 字，标准差 ${sl.stdDev}`,
    `- 句长分布：短句(≤10字) ${pct(sl.short)}、中句(11-30字) ${pct(sl.medium)}、长句(31-60字) ${pct(sl.long)}、超长句(>60字) ${pct(sl.veryLong)}`,
    `- 偏好${dominant}，注意长短句交替营造节奏感`,
  );

  // Paragraph structure
  const ps = dna.paragraphStructure;
  sections.push(
    `### 段落结构`,
    `- 每段平均 ${ps.avgSentencesPerParagraph} 句，平均段落长度 ${ps.avgParagraphLength} 字`,
    `- 短段落(< 50字)占比 ${pct(ps.shortParagraphRatio)}，长段落(> 200字)占比 ${pct(ps.longParagraphRatio)}`,
  );

  // Dialogue style
  const dl = dna.dialogue;
  sections.push(
    `### 对话风格`,
    `- 对话占比 ${pct(dl.dialogueRatio)}，叙述占比 ${pct(dl.narrationRatio)}`,
    `- 平均对话长度 ${dl.avgDialogueLength} 字`,
    `- 含对话段落密度 ${pct(dl.dialogueDensityPerParagraph)}`,
  );
  // Rhetoric preferences
  const rh = dna.rhetoric;
  const rhetoricItems: string[] = [];
  if (rh.simileFrequency > 0.5) rhetoricItems.push(`比喻(${rh.simileFrequency}/千字)`);
  if (rh.metaphorFrequency > 0.3) rhetoricItems.push(`暗喻(${rh.metaphorFrequency}/千字)`);
  if (rh.parallelismFrequency > 0.2) rhetoricItems.push(`排比(${rh.parallelismFrequency}/千字)`);
  if (rh.rhetoricQuestionFrequency > 0.3) rhetoricItems.push(`反问(${rh.rhetoricQuestionFrequency}/千字)`);
  if (rh.ellipsisFrequency > 0.3) rhetoricItems.push(`省略号(${rh.ellipsisFrequency}/千字)`);
  if (rh.exclamationFrequency > 0.5) rhetoricItems.push(`感叹(${rh.exclamationFrequency}/千字)`);
  sections.push(
    `### 修辞偏好`,
    rhetoricItems.length > 0
      ? `- 常用修辞：${rhetoricItems.join('、')}`
      : `- 修辞手法使用较少，文风朴实`,
  );

  // Vocabulary
  const vc = dna.vocabulary;
  sections.push(`### 词汇特征`);
  sections.push(`- 用词丰富度(TTR)：${pct(vc.uniqueWordRatio)}`);
  if (vc.favoredAdjectives.length > 0) {
    sections.push(`- 偏好形容词：${vc.favoredAdjectives.slice(0, 10).join('、')}`);
  }
  if (vc.favoredVerbs.length > 0) {
    sections.push(`- 偏好动词：${vc.favoredVerbs.slice(0, 10).join('、')}`);
  }
  if (vc.classicalChineseRatio > 0.005) {
    sections.push(`- 文言用词倾向：${pct(vc.classicalChineseRatio)}，适当使用文言虚词`);
  }

  // Tone
  const tn = dna.tone;
  const toneDescriptors: string[] = [];
  if (tn.formality > 0.6) toneDescriptors.push('偏正式/书面');
  else if (tn.formality < 0.4) toneDescriptors.push('偏口语/轻松');
  else toneDescriptors.push('正式与口语均衡');
  if (tn.emotionIntensity > 0.5) toneDescriptors.push('情感浓烈');
  else if (tn.emotionIntensity < 0.2) toneDescriptors.push('情感克制');
  if (tn.humorIndex > 0.3) toneDescriptors.push('带有幽默感');
  if (tn.darknessTendency > 0.3) toneDescriptors.push('偏暗黑/沉重');
  if (tn.lyricalTendency > 0.3) toneDescriptors.push('富有诗意/抒情');
  sections.push(
    `### 基调与氛围`,
    `- ${toneDescriptors.join('，')}`,
    `- 正式度 ${pct(tn.formality)} | 情感强度 ${pct(tn.emotionIntensity)} | 幽默 ${pct(tn.humorIndex)} | 暗黑 ${pct(tn.darknessTendency)} | 抒情 ${pct(tn.lyricalTendency)}`,
  );

  sections.push('', `> 基于 ${dna.totalSampleChars} 字样本分析，共 ${dna.samples.length} 个样本。`);

  return sections.join('\n');
}

// ==================== Helpers ====================

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function getDominantBucket(sl: { short: number; medium: number; long: number; veryLong: number }): string {
  const entries: [string, number][] = [
    ['短句', sl.short],
    ['中等句', sl.medium],
    ['长句', sl.long],
    ['超长句', sl.veryLong],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}
