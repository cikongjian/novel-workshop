import { z } from 'zod';

export const CangjieChecklistGroupSchema = z.enum([
  'premise',
  'protagonist',
  'world',
  'conflict',
  'relationship',
  'opening',
  'payoff',
  'boundary',
]);
export type CangjieChecklistGroup = z.infer<typeof CangjieChecklistGroupSchema>;

export const CangjieConversationTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1),
});
export type CangjieConversationTurn = z.infer<typeof CangjieConversationTurnSchema>;

export const CangjieChatBodySchema = z.object({
  messages: z.array(CangjieConversationTurnSchema).max(40).default([]),
});
export type CangjieChatBody = z.infer<typeof CangjieChatBodySchema>;

export const CangjieChatReplySchema = z.object({
  message: z.object({
    role: z.literal('assistant'),
    content: z.string().trim().min(1),
  }),
});
export type CangjieChatReply = z.infer<typeof CangjieChatReplySchema>;

export const CangjieChecklistItemSchema = z.object({
  id: z.string().trim().min(1),
  group: CangjieChecklistGroupSchema,
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  selected: z.boolean().default(true),
});
export type CangjieChecklistItem = z.infer<typeof CangjieChecklistItemSchema>;

export const CangjieChecklistDraftItemSchema = z.object({
  id: z.string().trim().min(1).optional(),
  group: CangjieChecklistGroupSchema,
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  selected: z.boolean().optional(),
});
export type CangjieChecklistDraftItem = z.infer<typeof CangjieChecklistDraftItemSchema>;

export const CangjieOrganizeBodySchema = z.object({
  messages: z.array(CangjieConversationTurnSchema).max(60).default([]),
});
export type CangjieOrganizeBody = z.infer<typeof CangjieOrganizeBodySchema>;

export const CangjieOrganizeReplySchema = z.object({
  checklist: z.array(CangjieChecklistItemSchema).min(1),
});
export type CangjieOrganizeReply = z.infer<typeof CangjieOrganizeReplySchema>;

export const CangjieOrganizeDraftReplySchema = z.object({
  checklist: z.array(CangjieChecklistDraftItemSchema).min(1),
});
export type CangjieOrganizeDraftReply = z.infer<typeof CangjieOrganizeDraftReplySchema>;

export const CangjieSeedIdeaBodySchema = z.object({
  messages: z.array(CangjieConversationTurnSchema).max(60).default([]),
  checklist: z.array(CangjieChecklistItemSchema).min(1).max(20),
});
export type CangjieSeedIdeaBody = z.infer<typeof CangjieSeedIdeaBodySchema>;

export const CangjieSeedIdeaCardSchema = z.object({
  title: z.string().trim().min(1),
  synopsis: z.string().trim().min(1),
  seedIdea: z.string().trim().min(1),
  protagonist: z.string().trim().min(1),
  world: z.string().trim().min(1),
  conflict: z.string().trim().min(1),
  opening: z.string().trim().min(1),
  storyCoreBrief: z.string().trim().min(1),
});
export type CangjieSeedIdeaCard = z.infer<typeof CangjieSeedIdeaCardSchema>;
