import { z } from 'zod';

/** 伏笔策展请求体 */
export const CurateForeshadowingBody = z.object({
  novelId: z.string().uuid(),
  apply: z.boolean().default(true),
  maxItems: z.number().int().min(10).max(120).default(60),
});

export const CuratedForeshadowingItem = z.object({
  id: z.string().uuid().optional(),
  hint: z.string().min(1),
  plantedInChapter: z.number().int().positive(),
  resolution: z.string().default(''),
  resolvedInChapter: z.number().int().positive().optional(),
  isResolved: z.boolean().default(false),
  relatedPlotThreads: z.array(z.string().uuid()).default([]),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
});

export const CurateForeshadowingResult = z.object({
  summary: z.string().default(''),
  foreshadowing: z.array(CuratedForeshadowingItem).default([]),
});

export const ApplyCuratedForeshadowingBody = z.object({
  novelId: z.string().uuid(),
  foreshadowing: z.array(CuratedForeshadowingItem).min(1),
  maxItems: z.number().int().min(10).max(120).default(60),
  summary: z.string().default(''),
});

/** 文化策展请求体 */
export const CurateCultureBody = z.object({
  novelId: z.string().uuid(),
  apply: z.boolean().default(false),
  maxItems: z.number().int().min(10).max(120).default(60),
});

export const CuratedCultureItem = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  constraints: z.array(z.string()).default([]),
  consequences: z.array(z.string()).default([]),
  details: z.record(z.string(), z.string()).default({}),
  relatedEntries: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export const CurateCultureResult = z.object({
  summary: z.string().default(''),
  entries: z.array(CuratedCultureItem).default([]),
});

export const ApplyCuratedCultureBody = z.object({
  novelId: z.string().uuid(),
  entries: z.array(CuratedCultureItem).min(1),
  maxItems: z.number().int().min(10).max(120).default(60),
  summary: z.string().default(''),
});

/** 历史策展请求体 */
export const CurateHistoryBody = z.object({
  novelId: z.string().uuid(),
  apply: z.boolean().default(false),
  maxItems: z.number().int().min(10).max(120).default(80),
});

export const CuratedHistoryItem = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  year: z.union([z.string(), z.number()]).optional(),
  era: z.string().optional(),
  sequence: z.number().int().nonnegative().optional(),
  details: z.record(z.string(), z.string()).default({}),
  relatedEntries: z.array(z.string().uuid()).default([]),
  tags: z.array(z.string()).default([]),
});

export const CurateHistoryResult = z.object({
  summary: z.string().default(''),
  entries: z.array(CuratedHistoryItem).default([]),
});

export const ApplyCuratedHistoryBody = z.object({
  novelId: z.string().uuid(),
  entries: z.array(CuratedHistoryItem).min(1),
  maxItems: z.number().int().min(10).max(120).default(80),
  summary: z.string().default(''),
});

/** 力量体系策展请求体 */
export const CuratePowerBody = z.object({
  novelId: z.string().uuid(),
  apply: z.boolean().default(false),
  maxItems: z.number().int().min(10).max(160).default(100),
});

export const PowerParametersSchema = z.object({
  systemType: z.string().optional(),
  tierNames: z.array(z.string()).optional(),
  maxTier: z.coerce.number().int().min(1).max(99).optional(),
  resourceName: z.string().optional(),
  recoveryPerChapter: z.string().optional(),
  defaultCost: z.string().optional(),
  cooldownRule: z.string().optional(),
  riskRule: z.string().optional(),
  breakthroughRule: z.string().optional(),
  forbiddenActions: z.array(z.string()).optional(),
  keyVerbs: z.array(z.string()).optional(),
});

export const CuratedPowerItem = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  dimensions: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  consequences: z.array(z.string()).default([]),
  details: z.record(z.string(), z.string()).default({}),
  relatedEntries: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  parameters: PowerParametersSchema.optional(),
});

export const CuratePowerResult = z.object({
  summary: z.string().default(''),
  entries: z.array(CuratedPowerItem).default([]),
});

export const ApplyCuratedPowerBody = z.object({
  novelId: z.string().uuid(),
  entries: z.array(CuratedPowerItem).min(1),
  maxItems: z.number().int().min(10).max(160).default(100),
  summary: z.string().default(''),
});

/** 势力策展请求体 */
export const CurateFactionBody = z.object({
  novelId: z.string().uuid(),
  apply: z.boolean().default(false),
  maxItems: z.number().int().min(10).max(140).default(90),
});

export const CuratedFactionItem = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  cultureAnchors: z.array(z.string()).default([]),
  inheritanceChain: z.array(z.string()).default([]),
  motives: z.array(z.string()).default([]),
  coreMissions: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  consequences: z.array(z.string()).default([]),
  details: z.record(z.string(), z.string()).default({}),
  relatedEntries: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export const CurateFactionResult = z.object({
  summary: z.string().default(''),
  entries: z.array(CuratedFactionItem).default([]),
});

export const ApplyCuratedFactionBody = z.object({
  novelId: z.string().uuid(),
  entries: z.array(CuratedFactionItem).min(1),
  maxItems: z.number().int().min(10).max(140).default(90),
  summary: z.string().default(''),
});
