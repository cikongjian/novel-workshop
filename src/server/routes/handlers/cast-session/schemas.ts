import { z } from 'zod';
import { CharacterRole } from '../../../../novel/types.js';

export const CastTurnSchema = z.object({
  role: z.enum(['user', 'assistant']).default('user'),
  content: z.string().min(1),
});

export const CastSlotSchema = z.object({
  key: z.string().min(1).max(32),
  role: CharacterRole.default('supporting'),
  required: z.boolean().default(true),
  expectedCount: z.coerce.number().int().min(1).max(3).default(1),
  fixedNames: z.array(z.string().min(1)).optional(),
  description: z.string().max(120).optional(),
});

export const ProposeBody = z.object({
  conversation: z.array(CastTurnSchema).min(1),
  maxCharacters: z.coerce.number().int().min(1).max(12).default(6),
  focus: z.enum(['roles-only', 'roles-and-power']).default('roles-and-power'),
  slots: z.array(CastSlotSchema).max(12).optional(),
});

export const CastCharacterProposalSchema = z.object({
  name: z.string().min(1),
  aliases: z.array(z.string()).optional(),
  role: CharacterRole.default('supporting'),
  age: z.string().optional(),
  gender: z.string().optional(),
  appearance: z.string().optional(),
  personality: z.string().optional(),
  backstory: z.string().optional(),
  motivation: z.string().optional(),
  abilities: z.array(z.string()).optional(),
  speechStyle: z.string().optional(),
  tags: z.array(z.string()).optional(),
  firstAppearance: z.number().int().positive().optional(),
  slot: z.string().optional(),
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

export const PowerEntryProposalSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  constraints: z.array(z.string()).optional(),
  consequences: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  parameters: PowerParametersSchema.optional(),
});

export const RelationshipSeedSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
});

export const CastProposalSchema = z.object({
  characters: z.array(CastCharacterProposalSchema).default([]),
  powerSystem: z.array(PowerEntryProposalSchema).default([]),
  relationshipSeeds: z.array(RelationshipSeedSchema).default([]),
});

export const ConfirmBody = z.object({
  proposal: CastProposalSchema,
  mode: z.enum(['append', 'replace-duplicates']).default('replace-duplicates'),
  slots: z.array(CastSlotSchema).max(12).optional(),
});

export type CastCharacterProposal = z.infer<typeof CastCharacterProposalSchema>;
export type CastProposal = z.infer<typeof CastProposalSchema>;
export type CastSlot = z.infer<typeof CastSlotSchema>;
