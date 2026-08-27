import { z } from 'zod';

export const PlotBranchStatus = z.enum([
  'proposed',    // AI generated, not yet chosen
  'selected',    // user chose this branch
  'explored',    // user did a what-if preview but didn't commit
  'abandoned',   // explicitly abandoned
]);
export type PlotBranchStatus = z.infer<typeof PlotBranchStatus>;

export const PlotBranchNode = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  chapterNumber: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  impactPrediction: z.string().default(''),
  characterImpacts: z.array(z.object({
    name: z.string(),
    impact: z.string(),
  })).default([]),
  riskLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  status: PlotBranchStatus.default('proposed'),
  committedChapterNumber: z.number().int().positive().optional(),
  previewContent: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PlotBranchNode = z.infer<typeof PlotBranchNode>;

export const PlotBranchTree = z.object({
  novelId: z.string().uuid(),
  nodes: z.array(PlotBranchNode).default([]),
  activePath: z.array(z.string().uuid()).default([]),
});
export type PlotBranchTree = z.infer<typeof PlotBranchTree>;
