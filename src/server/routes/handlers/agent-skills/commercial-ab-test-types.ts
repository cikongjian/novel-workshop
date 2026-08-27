import type { Request, Response } from 'express';
import { z } from 'zod';

export const SeedCommercialPackModeSchema = z.enum(['classic', 'genre-layered']);

export const RunCommercialAbTestBody = z.object({
  sampleCount: z.number().int().min(1).max(5).optional(),
  seedMode: SeedCommercialPackModeSchema.optional(),
  refreshExisting: z.boolean().optional(),
});

export type RunCommercialAbTestInput = z.infer<typeof RunCommercialAbTestBody>;

export type EnsureAdmin = (req: Request, res: Response) => boolean;

export type AgentSkillAbSample = {
  label: string;
  novelId: string;
  chapterNumber: number;
};

export type AgentSkillAbScore = {
  overall: number;
  structure: number;
  style: number;
  emotion: number;
  summary: string;
};

export type AgentSkillAbComparison = {
  label: string;
  novelId: string;
  chapterNumber: number;
  skillCountBefore: number;
  skillCountAfter: number;
  before: AgentSkillAbScore;
  after: AgentSkillAbScore;
  delta: {
    overall: number;
    structure: number;
    style: number;
    emotion: number;
  };
};

export type AgentSkillCommercialAbTestRouteDeps = {
  ensureAdmin: EnsureAdmin;
};
