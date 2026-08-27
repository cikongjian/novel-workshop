import { z } from 'zod';

export const AiUsageKind = z.enum([
  'chat',
  'chat-stream',
  'embedding-query',
  'embedding-batch',
  'image-generate',
  'tts',
]);
export type AiUsageKind = z.infer<typeof AiUsageKind>;

export const AiUsageRecord = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  scope: z.enum(['http', 'system', 'script']),
  operationKey: z.string(),
  operationLabel: z.string(),
  operationRegistered: z.boolean().default(false),
  requestPath: z.string().default(''),
  requestMethod: z.string().default(''),
  userId: z.string().default(''),
  username: z.string().default(''),
  userRole: z.string().default(''),
  novelId: z.string().default(''),
  chapterNumber: z.number().int().positive().nullable().default(null),
  agentRole: z.string().default(''),
  usageKind: AiUsageKind,
  provider: z.string(),
  model: z.string(),
  requestCount: z.number().int().nonnegative().default(1),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  inputCost: z.number().nonnegative().default(0),
  outputCost: z.number().nonnegative().default(0),
  totalCost: z.number().nonnegative().default(0),
  promptChars: z.number().int().nonnegative().default(0),
  outputChars: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});
export type AiUsageRecord = z.infer<typeof AiUsageRecord>;

export type AiUsageOperationSummary = {
  operationKey: string;
  operationLabel: string;
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  deepSeekTokens: number;
  deepSeekCost: number;
  lastUsedAt: string | null;
  usageKinds: AiUsageKind[];
};
