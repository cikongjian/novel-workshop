import { z } from 'zod';
import type { OutlineData as OutlineDataType } from '../novel/types.js';

export const ShuangwenAudience = z.enum(['male', 'female']);
export type ShuangwenAudience = z.infer<typeof ShuangwenAudience>;

export function inferShuangwenAudienceFromGenre(genre: string): ShuangwenAudience {
  const cleaned = (genre ?? '').trim().toLowerCase();
  if (!cleaned) return 'male';
  if (cleaned === 'romance' || cleaned.startsWith('romance-')) return 'female';
  return 'male';
}

export const ShuangwenBlueprintSchema = z.object({
  audience: ShuangwenAudience,
  genre: z.string().min(1),
  identifiedSellingPoint: z.string().default(''),
  titleCandidates: z.array(z.string().min(1)).min(1).max(12),
  logline: z.string().min(1),
  synopsis: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  hook: z.object({
    openingScene: z.string().min(1),
    incitingIncident: z.string().min(1),
    firstPayoff: z.string().min(1),
    chapterEndHookRule: z.string().min(1),
  }),
  protagonist: z.object({
    name: z.string().default(''),
    archetype: z.string().default(''),
    goal: z.string().default(''),
    flaw: z.string().default(''),
  }).default({}),
  antagonist: z.object({
    name: z.string().default(''),
    archetype: z.string().default(''),
    threat: z.string().default(''),
  }).default({}),
  engine: z.object({
    cycleFormula: z.string().min(1),
    escalationRule: z.string().min(1),
    constraints: z.array(z.string().min(1)).default([]),
  }),
  styleGuide: z.string().min(1),
  forbidden: z.array(z.string().min(1)).default([]),
});
export type ShuangwenBlueprint = z.infer<typeof ShuangwenBlueprintSchema>;

export const MarketingPayloadSchema = z.object({
  titleCandidates: z.array(z.string()).default([]),
  titles: z.array(z.string()).default([]),
  sellingPoints: z.array(z.string()).default([]),
  oneLiner: z.string().default(''),
  shortIntro: z.string().default(''),
  shortSynopsis: z.string().default(''),
  longIntro: z.string().default(''),
  longSynopsis: z.string().default(''),
  characterCards: z.array(z.object({
    name: z.string().min(1),
    tagline: z.string().default(''),
    highlights: z.array(z.string()).default([]),
    description: z.string().default(''),
  })).default([]),
  hookTeasers: z.array(z.string()).default([]),
  socialPosts: z.array(z.string()).default([]),
}).transform(data => ({
  titleCandidates: data.titleCandidates.length > 0 ? data.titleCandidates : data.titles,
  sellingPoints: data.sellingPoints,
  oneLiner: data.oneLiner,
  shortIntro: data.shortIntro || data.shortSynopsis,
  longIntro: data.longIntro || data.longSynopsis,
  characterCards: data.characterCards,
  hookTeasers: data.hookTeasers.length > 0 ? data.hookTeasers : data.socialPosts,
}));
export type ShuangwenMarketingPayload = z.infer<typeof MarketingPayloadSchema>;

export type ShuangwenSampleChapter = {
  chapterNumber: number;
  title: string;
  draftText: string;
  polishedText: string;
  editorNotes: string;
};

export type ShuangwenPipelineRunResult = {
  blueprint: ShuangwenBlueprint;
  outline: OutlineDataType;
  marketing: { raw: string; parsed: boolean; payload?: ShuangwenMarketingPayload };
  sampleChapter?: ShuangwenSampleChapter;
};
