import { z } from 'zod';

export const WorldBibleDomain = z.enum([
  'geography',
  'power',
  'faction',
  'history',
  'culture',
  'economy',
  'rule',
  'knowledge',
]);

export const WorldBibleCoverageItem = z.object({
  status: z.enum(['covered', 'partial', 'missing']),
  note: z.string().max(500).default(''),
});

export const WorldBibleCoverage = z.object({
  geography: WorldBibleCoverageItem,
  power: WorldBibleCoverageItem,
  faction: WorldBibleCoverageItem,
  history: WorldBibleCoverageItem,
  culture: WorldBibleCoverageItem,
  economy: WorldBibleCoverageItem,
  rule: WorldBibleCoverageItem,
  knowledge: WorldBibleCoverageItem,
});

export const WorldBibleProposalEntry = z.object({
  tempId: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  category: z.enum(['geography', 'history', 'faction', 'power', 'culture', 'rule', 'other']),
  description: z.string().trim().min(10).max(1600),
  storyRole: z.enum(['anchor', 'conflict', 'mystery', 'resource', 'constraint']).optional(),
  canonStatus: z.enum(['supported', 'proposal']).default('proposal'),
  sourceBasis: z.array(z.string().trim().min(1).max(200)).max(8).default([]),
  constraints: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  consequences: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  details: z.record(z.string(), z.string()).default({}),
  relatedNames: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
});

export const WorldBiblePreviewResult = z.object({
  summary: z.string().trim().min(1).max(2000),
  coverage: WorldBibleCoverage,
  entries: z.array(WorldBibleProposalEntry).min(1).max(30),
});

export const WorldBiblePreviewBody = z.object({
  novelId: z.string().uuid(),
  maxItems: z.number().int().min(12).max(30).default(20),
});

export const WorldBibleApplyBody = z.object({
  novelId: z.string().uuid(),
  entries: z.array(WorldBibleProposalEntry).min(1).max(30),
  summary: z.string().trim().max(2000).default(''),
});

export type WorldBibleProposal = z.infer<typeof WorldBibleProposalEntry>;
export type WorldBiblePreview = z.infer<typeof WorldBiblePreviewResult>;
