import { z } from 'zod';
import { NovelGenre } from '../../../../novel/types.js';

export const DnaAnswerSchema = z.object({
  questionId: z.union([z.string(), z.number()]),
  question: z.string().min(1),
  selectedOption: z.string().min(1),
  type: z.string().default('unknown'),
});
export type DnaAnswer = z.infer<typeof DnaAnswerSchema>;

export const DnaRadarSchema = z.record(z.string(), z.number());

export const DnaFateProfileSchema = z.object({
  coreFate: z.string().min(1),
  readerPleasure: z.array(z.string()).default([]),
  themeTraits: z.array(z.string()).default([]),
  protagonistArchetype: z.string().default(''),
  conflictBias: z.string().default(''),
  emotionalTone: z.string().default(''),
  storyKeywords: z.array(z.string()).default([]),
  titleDirection: z.string().default(''),
  openingPromise: z.string().default(''),
  decisionEvidence: z.array(z.object({
    question: z.string().default(''),
    selectedOption: z.string().default(''),
    storyUse: z.string().default(''),
  })).default([]),
  characterDna: z.array(z.string()).default([]),
  worldConstraints: z.array(z.string()).default([]),
  openingObligations: z.array(z.string()).default([]),
});
export type DnaFateProfile = z.infer<typeof DnaFateProfileSchema>;

export const DnaBaseInputSchema = z.object({
  answers: z.array(DnaAnswerSchema).default([]),
  radar: DnaRadarSchema,
  name: z.string().min(1),
  gender: z.enum(['男', '女']),
  theme: z.string().min(1),
  constitutionTags: z.array(z.string()).default([]),
});
export type DnaBaseInput = z.infer<typeof DnaBaseInputSchema>;

export const DnaFateProfileBodySchema = DnaBaseInputSchema;
export type DnaFateProfileBody = z.infer<typeof DnaFateProfileBodySchema>;

export const DnaCreateNovelBodySchema = DnaBaseInputSchema.extend({
  genre: NovelGenre.default('fantasy'),
  title: z.string().trim().optional(),
  fateProfile: DnaFateProfileSchema.optional(),
});
export type DnaCreateNovelBody = z.infer<typeof DnaCreateNovelBodySchema>;

export const DnaSeedIdeaBodySchema = DnaCreateNovelBodySchema;
export type DnaSeedIdeaBody = z.infer<typeof DnaSeedIdeaBodySchema>;

export const DnaSeedIdeaCardSchema = z.object({
  title: z.string().min(1),
  synopsis: z.string().min(1),
  seedIdea: z.string().min(1),
  protagonist: z.string().default(''),
  world: z.string().default(''),
  conflict: z.string().default(''),
  opening: z.string().default(''),
  dnaBrief: z.string().default(''),
});
export type DnaSeedIdeaCard = z.infer<typeof DnaSeedIdeaCardSchema>;

export const DnaStoryDesignSchema = z.object({
  title: z.string().min(1),
  genre: NovelGenre.default('fantasy'),
  synopsis: z.string().min(1),
  sellingPoint: z.string().default(''),
  protagonist: z.object({
    name: z.string().min(1),
    gender: z.string().default(''),
    role: z.literal('protagonist').default('protagonist'),
    personality: z.string().default(''),
    appearance: z.string().default(''),
    backstory: z.string().default(''),
    goal: z.string().default(''),
    dnaTraits: z.array(z.string()).default([]),
    weakness: z.string().default(''),
    belief: z.string().default(''),
  }),
  storyBlueprint: z.object({
    premise: z.string().default(''),
    mainConflict: z.string().default(''),
    worldview: z.string().default(''),
    powerSystem: z.string().default(''),
    backgroundCharter: z.array(z.string()).default([]),
    characterDnaRules: z.array(z.string()).default([]),
    decisionMappings: z.array(z.object({
      source: z.string().default(''),
      novelUse: z.string().default(''),
    })).default([]),
    openingHook: z.string().default(''),
    volumeArc: z.string().default(''),
    chapterOutline: z.array(z.object({
      chapterNumber: z.number().int().positive(),
      title: z.string().default(''),
      summary: z.string().default(''),
    })).default([]),
  }),
});
export type DnaStoryDesign = z.infer<typeof DnaStoryDesignSchema>;
