import { z } from 'zod';
import { NovelStatus, NovelGenre } from './types.js';

export const UniverseRelationType = z.enum([
  'mainline-next',
  'side-story',
  'parallel',
  'prequel',
  'sequel',
  'alt-branch',
]);
export type UniverseRelationType = z.infer<typeof UniverseRelationType>;

export const UniverseNovelRef = z.object({
  novelId: z.string(),
  title: z.string(),
  genre: NovelGenre.optional(),
  status: NovelStatus.optional(),
  notes: z.string().default(''),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UniverseNovelRef = z.infer<typeof UniverseNovelRef>;

export const UniverseRelation = z.object({
  id: z.string().uuid(),
  fromNovelId: z.string(),
  toNovelId: z.string(),
  type: UniverseRelationType,
  anchorChapterNumber: z.number().int().positive().optional(),
  timelineSpan: z.string().default(''),
  spoilerCeiling: z.string().default(''),
  inheritWorld: z.boolean().default(true),
  inheritCharacters: z.boolean().default(true),
  inheritForeshadowing: z.boolean().default(true),
  notes: z.string().default(''),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UniverseRelation = z.infer<typeof UniverseRelation>;

export const UniverseMetadata = z.object({
  id: z.string().uuid(),
  ownerId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().default(''),
  corePremise: z.string().default(''),
  sharedWorldRules: z.string().default(''),
  timelineBaseline: z.string().default(''),
  novels: z.array(UniverseNovelRef).default([]),
  relations: z.array(UniverseRelation).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UniverseMetadata = z.infer<typeof UniverseMetadata>;
