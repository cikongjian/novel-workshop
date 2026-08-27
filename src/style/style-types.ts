import { z } from 'zod';

export const SentenceLengthDistribution = z.object({
  short: z.number().min(0).max(1),    // <= 10 chars
  medium: z.number().min(0).max(1),   // 11-30 chars
  long: z.number().min(0).max(1),     // 31-60 chars
  veryLong: z.number().min(0).max(1), // > 60 chars
  avgLength: z.number(),
  stdDev: z.number(),
});
export type SentenceLengthDistribution = z.infer<typeof SentenceLengthDistribution>;

export const ParagraphStructure = z.object({
  avgSentencesPerParagraph: z.number(),
  avgParagraphLength: z.number(),
  shortParagraphRatio: z.number(),
  longParagraphRatio: z.number(),
});
export type ParagraphStructure = z.infer<typeof ParagraphStructure>;

export const DialogueProfile = z.object({
  dialogueRatio: z.number().min(0).max(1),
  narrationRatio: z.number().min(0).max(1),
  avgDialogueLength: z.number(),
  dialogueDensityPerParagraph: z.number(),
});
export type DialogueProfile = z.infer<typeof DialogueProfile>;

export const RhetoricProfile = z.object({
  metaphorFrequency: z.number(),
  simileFrequency: z.number(),
  parallelismFrequency: z.number(),
  rhetoricQuestionFrequency: z.number(),
  exclamationFrequency: z.number(),
  ellipsisFrequency: z.number(),
});
export type RhetoricProfile = z.infer<typeof RhetoricProfile>;

export const VocabularyProfile = z.object({
  uniqueWordRatio: z.number(),
  topBigrams: z.array(z.object({ bigram: z.string(), count: z.number() })).max(30),
  favoredAdjectives: z.array(z.string()).max(20),
  favoredVerbs: z.array(z.string()).max(20),
  classicalChineseRatio: z.number(),
});
export type VocabularyProfile = z.infer<typeof VocabularyProfile>;

export const ToneProfile = z.object({
  formality: z.number().min(0).max(1),
  emotionIntensity: z.number().min(0).max(1),
  humorIndex: z.number().min(0).max(1),
  darknessTendency: z.number().min(0).max(1),
  lyricalTendency: z.number().min(0).max(1),
});
export type ToneProfile = z.infer<typeof ToneProfile>;

export const StyleDNA = z.object({
  id: z.string().uuid(),
  novelId: z.string().uuid(),
  name: z.string().default('默认风格'),
  sentenceLength: SentenceLengthDistribution,
  paragraphStructure: ParagraphStructure,
  dialogue: DialogueProfile,
  rhetoric: RhetoricProfile,
  vocabulary: VocabularyProfile,
  tone: ToneProfile,
  userNotes: z.string().default(''),
  samples: z.array(z.object({
    name: z.string(),
    charCount: z.number(),
    addedAt: z.string().datetime(),
  })).default([]),
  totalSampleChars: z.number().default(0),
  enabled: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** 统计指纹（从参考文本提取） */
  fingerprint: z.object({
    sentenceLengthStats: z.object({
      mean: z.number(),
      stdDev: z.number(),
      min: z.number(),
      max: z.number(),
      distribution: z.record(z.string(), z.number()),
    }),
    paragraphLengthStats: z.object({
      mean: z.number(),
      stdDev: z.number(),
    }),
    ttr: z.number(),
    rhetoricalDensity: z.object({
      metaphorCount: z.number(),
      simileCount: z.number(),
      parallelismCount: z.number(),
    }),
  }).optional(),
  /** LLM 生成的风格指南 */
  styleGuide: z.string().optional(),
});
export type StyleDNA = z.infer<typeof StyleDNA>;
