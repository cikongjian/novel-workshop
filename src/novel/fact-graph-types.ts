import { z } from 'zod';
import { FactAttribution as FactAttributionSchema } from './fact-attribution.js';

// ==================== 角色出场 ====================

export const CharacterAppearance = z.object({
  characterName: z.string(),
  chapterNumber: z.number().int().positive(),
  location: z.string().default(''),
  action: z.string().default(''),
  mentionType: z.enum(['onstage', 'dialogue', 'reference', 'memory', 'dream', 'corpse']).default('reference'),
  confidence: z.number().min(0).max(1).default(0.5),
  evidence: z.string().default(''),
  sentenceIndex: z.number().int().min(0).default(0),
});
export type CharacterAppearance = z.infer<typeof CharacterAppearance>;

// ==================== 物品状态 ====================

export const ItemStatusEntry = z.object({
  itemName: z.string(),
  status: z.enum(['obtained', 'used', 'lost', 'destroyed', 'mentioned', 'transferred']),
  holderName: z.string().default(''),
  chapterNumber: z.number().int().positive(),
  detail: z.string().default(''),
});
export type ItemStatusEntry = z.infer<typeof ItemStatusEntry>;

// ==================== 地点访问 ====================

export const LocationVisit = z.object({
  characterName: z.string(),
  location: z.string(),
  chapterNumber: z.number().int().positive(),
  arrivalMethod: z.string().default(''),
});
export type LocationVisit = z.infer<typeof LocationVisit>;

// ==================== 时间线事件 ====================

export const TimelineEvent = z.object({
  id: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  timeMarker: z.string().default(''),
  dayNumber: z.number().int().optional(),
  summary: z.string(),
  involvedCharacterNames: z.array(z.string()).default([]),
  location: z.string().default(''),
  importance: z.number().int().min(1).max(5).default(3),
  isFlashback: z.boolean().default(false),
  evidence: z.string().default(''),
  sentenceIndex: z.number().int().min(0).default(0),
  attribution: FactAttributionSchema.optional(),
  /** Typed milestone classification for events with lasting narrative impact */
  milestoneType: z.enum([
    'plot_twist', 'character_death', 'revelation', 'power_shift',
    'alliance_change', 'world_change', 'betrayal', 'reunion',
  ]).optional(),
});
export type TimelineEvent = z.infer<typeof TimelineEvent>;

// ==================== 关系变化 ====================

export const RelationshipChange = z.object({
  sourceCharacterName: z.string(),
  targetCharacterName: z.string(),
  chapterNumber: z.number().int().positive(),
  previousRelation: z.string().default(''),
  newRelation: z.string(),
  trigger: z.string().default(''),
  attribution: FactAttributionSchema.optional(),
});
export type RelationshipChange = z.infer<typeof RelationshipChange>;

// ==================== 角色状态变化 ====================

export const CharacterStateChange = z.object({
  characterName: z.string(),
  chapterNumber: z.number().int().positive(),
  previousState: z.string().default(''),
  newState: z.enum([
    'alive', 'dead', 'injured', 'healed', 'missing',
    'imprisoned', 'transformed', 'powerup', 'powerdown',
  ]),
  detail: z.string().default(''),
  certainty: z.enum(['confirmed', 'suspected', 'rumored']).default('suspected'),
  sourceType: z.enum(['direct', 'reference', 'memory', 'dream']).default('direct'),
  evidence: z.string().default(''),
  sentenceIndex: z.number().int().min(0).default(0),
  attribution: FactAttributionSchema.optional(),
});
export type CharacterStateChange = z.infer<typeof CharacterStateChange>;

export const FactEvent = z.object({
  id: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  sentenceIndex: z.number().int().min(0).default(0),
  eventType: z.enum(['character-mention', 'item-status', 'location-visit', 'timeline-marker', 'state-change']),
  entityType: z.enum(['character', 'item', 'location', 'timeline']),
  entityName: z.string(),
  detail: z.string().default(''),
  evidence: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.5),
  relatedCharacterNames: z.array(z.string()).default([]),
  mentionType: z.enum(['onstage', 'dialogue', 'reference', 'memory', 'dream', 'corpse']).optional(),
  state: z.enum([
    'alive', 'dead', 'injured', 'healed', 'missing',
    'imprisoned', 'transformed', 'powerup', 'powerdown',
  ]).optional(),
  itemStatus: z.enum(['obtained', 'used', 'lost', 'destroyed', 'mentioned', 'transferred']).optional(),
  timeMarker: z.string().default(''),
  isFlashback: z.boolean().default(false),
  location: z.string().default(''),
});
export type FactEvent = z.infer<typeof FactEvent>;

// ==================== 事实图谱 ====================

export const FactGraph = z.object({
  novelId: z.string().uuid(),
  lastUpdatedChapter: z.number().int().nonnegative().default(0),
  characterAppearances: z.array(CharacterAppearance).default([]),
  itemTimeline: z.array(ItemStatusEntry).default([]),
  locationVisits: z.array(LocationVisit).default([]),
  timelineEvents: z.array(TimelineEvent).default([]),
  relationshipChanges: z.array(RelationshipChange).default([]),
  characterStateChanges: z.array(CharacterStateChange).default([]),
  factEvents: z.array(FactEvent).default([]),
  updatedAt: z.string().datetime(),
});
export type FactGraph = z.infer<typeof FactGraph>;

// ==================== 矛盾检测 ====================

export const ContradictionSeverity = z.enum(['critical', 'warning', 'info']);
export type ContradictionSeverity = z.infer<typeof ContradictionSeverity>;

export const ContradictionEvidence = z.object({
  chapterNumber: z.number().int().positive(),
  label: z.string(),
  text: z.string(),
  sourceType: z.enum(['appearance', 'state-change', 'timeline-event', 'semantic-support', 'semantic-counterevidence']).default('appearance'),
});
export type ContradictionEvidence = z.infer<typeof ContradictionEvidence>;

export const Contradiction = z.object({
  id: z.string().uuid(),
  type: z.enum([
    'character-resurrection',
    'item-reuse-after-destroy',
    'location-teleport',
    'timeline-regression',
    'state-contradiction',
    'relationship-contradiction',
    'temporal-constraint-violation',
  ]),
  severity: ContradictionSeverity,
  chapterNumbers: z.array(z.number().int().positive()),
  description: z.string(),
  evidence: z.array(z.string()).default([]),
  evidenceDetails: z.array(ContradictionEvidence).default([]),
  suggestion: z.string().default(''),
  resolved: z.boolean().default(false),
  confidence: z.number().min(0).max(1).default(0.5),
  entityName: z.string().default(''),
  anchorChapterNumber: z.number().int().positive().optional(),
});
export type Contradiction = z.infer<typeof Contradiction>;
