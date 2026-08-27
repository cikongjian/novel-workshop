import type { StyleDNA } from './style-types.js';
import type { StyleAnalysisResult } from './style-analyzer.js';

/**
 * Weighted-average merge of a new analysis into an existing StyleDNA.
 * Weights are proportional to character counts.
 */
export function mergeStyleProfiles(
  existing: StyleDNA,
  newAnalysis: StyleAnalysisResult,
  newSampleChars: number,
): StyleDNA {
  const oldWeight = existing.totalSampleChars;
  const totalWeight = oldWeight + newSampleChars;
  if (totalWeight === 0) return existing;

  const wOld = oldWeight / totalWeight;
  const wNew = newSampleChars / totalWeight;

  const r = (a: number, b: number) => Math.round((a * wOld + b * wNew) * 10000) / 10000;

  const sentenceLength = {
    short: r(existing.sentenceLength.short, newAnalysis.sentenceLength.short),
    medium: r(existing.sentenceLength.medium, newAnalysis.sentenceLength.medium),
    long: r(existing.sentenceLength.long, newAnalysis.sentenceLength.long),
    veryLong: r(existing.sentenceLength.veryLong, newAnalysis.sentenceLength.veryLong),
    avgLength: r(existing.sentenceLength.avgLength, newAnalysis.sentenceLength.avgLength),
    stdDev: r(existing.sentenceLength.stdDev, newAnalysis.sentenceLength.stdDev),
  };

  const paragraphStructure = {
    avgSentencesPerParagraph: r(existing.paragraphStructure.avgSentencesPerParagraph, newAnalysis.paragraphStructure.avgSentencesPerParagraph),
    avgParagraphLength: r(existing.paragraphStructure.avgParagraphLength, newAnalysis.paragraphStructure.avgParagraphLength),
    shortParagraphRatio: r(existing.paragraphStructure.shortParagraphRatio, newAnalysis.paragraphStructure.shortParagraphRatio),
    longParagraphRatio: r(existing.paragraphStructure.longParagraphRatio, newAnalysis.paragraphStructure.longParagraphRatio),
  };

  const dialogue = {
    dialogueRatio: r(existing.dialogue.dialogueRatio, newAnalysis.dialogue.dialogueRatio),
    narrationRatio: r(existing.dialogue.narrationRatio, newAnalysis.dialogue.narrationRatio),
    avgDialogueLength: r(existing.dialogue.avgDialogueLength, newAnalysis.dialogue.avgDialogueLength),
    dialogueDensityPerParagraph: r(existing.dialogue.dialogueDensityPerParagraph, newAnalysis.dialogue.dialogueDensityPerParagraph),
  };

  const rhetoric = {
    metaphorFrequency: r(existing.rhetoric.metaphorFrequency, newAnalysis.rhetoric.metaphorFrequency),
    simileFrequency: r(existing.rhetoric.simileFrequency, newAnalysis.rhetoric.simileFrequency),
    parallelismFrequency: r(existing.rhetoric.parallelismFrequency, newAnalysis.rhetoric.parallelismFrequency),
    rhetoricQuestionFrequency: r(existing.rhetoric.rhetoricQuestionFrequency, newAnalysis.rhetoric.rhetoricQuestionFrequency),
    exclamationFrequency: r(existing.rhetoric.exclamationFrequency, newAnalysis.rhetoric.exclamationFrequency),
    ellipsisFrequency: r(existing.rhetoric.ellipsisFrequency, newAnalysis.rhetoric.ellipsisFrequency),
  };

  const tone = {
    formality: r(existing.tone.formality, newAnalysis.tone.formality),
    emotionIntensity: r(existing.tone.emotionIntensity, newAnalysis.tone.emotionIntensity),
    humorIndex: r(existing.tone.humorIndex, newAnalysis.tone.humorIndex),
    darknessTendency: r(existing.tone.darknessTendency, newAnalysis.tone.darknessTendency),
    lyricalTendency: r(existing.tone.lyricalTendency, newAnalysis.tone.lyricalTendency),
  };

  // Merge array fields: combine bigrams, re-sort, take top N
  const bigramMap = new Map<string, number>();
  for (const b of existing.vocabulary.topBigrams) bigramMap.set(b.bigram, (bigramMap.get(b.bigram) || 0) + b.count);
  for (const b of newAnalysis.vocabulary.topBigrams) bigramMap.set(b.bigram, (bigramMap.get(b.bigram) || 0) + b.count);
  const topBigrams = [...bigramMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([bigram, count]) => ({ bigram, count }));

  // Merge adjective/verb lists: combine, deduplicate, keep order by first appearance
  const mergeStringArrays = (a: string[], b: string[], max: number): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const s of [...a, ...b]) {
      if (!seen.has(s)) { seen.add(s); result.push(s); }
      if (result.length >= max) break;
    }
    return result;
  };

  const vocabulary = {
    uniqueWordRatio: r(existing.vocabulary.uniqueWordRatio, newAnalysis.vocabulary.uniqueWordRatio),
    topBigrams,
    favoredAdjectives: mergeStringArrays(existing.vocabulary.favoredAdjectives, newAnalysis.vocabulary.favoredAdjectives, 20),
    favoredVerbs: mergeStringArrays(existing.vocabulary.favoredVerbs, newAnalysis.vocabulary.favoredVerbs, 20),
    classicalChineseRatio: r(existing.vocabulary.classicalChineseRatio, newAnalysis.vocabulary.classicalChineseRatio),
  };

  return {
    ...existing,
    sentenceLength,
    paragraphStructure,
    dialogue,
    rhetoric,
    vocabulary,
    tone,
    totalSampleChars: totalWeight,
    updatedAt: new Date().toISOString(),
  };
}
