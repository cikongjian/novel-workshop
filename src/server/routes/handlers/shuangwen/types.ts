import { z } from 'zod';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelMemory } from '../../../../memory/novel-memory.js';
import type { NovelAgent, AgentEvent } from '../../../../agents/types.js';
import type { PipelineMemory } from '../../../../pipeline/types.js';
import type { ChapterPipeline } from '../../../../pipeline/chapter-pipeline.js';
import type { BillingService } from '../../../../billing/billing-service.js';
import type { AuthDb } from '../../../../auth/types.js';
import type { StoryStateManager } from '../../../../novel/story-state-manager.js';
import { ShuangwenAudience, ShuangwenPipeline, inferShuangwenAudienceFromGenre } from '../../../../pipeline/shuangwen-pipeline.js';
import { NOVEL_CONSTITUTION_TAG_IDS } from '../../../../config/novel-constitution-tags.js';
import { DEFAULT_CHAPTER_WORD_TARGET } from '../../../../pipeline/chapter-length-guard.js';

export const ShuangwenGenreSchema = z.enum(['fantasy', 'mystery', 'modern', 'scifi', 'historical', 'romance', 'custom']);

export const CommonBody = z.object({
  /** 可选：不填则根据 genre 自动推断（当前规则：romance => female，其它 => male） */
  audience: ShuangwenAudience.optional(),
  genre: ShuangwenGenreSchema.default('modern'),
  seedIdea: z.string().max(800).default(''),

  /** 可选：用于更稳定地控风（不写入数据，除非 apply/create 且 overwriteMeta=true） */
  titleHint: z.string().max(80).optional(),
  synopsisHint: z.string().max(1200).optional(),

  targetChapters: z.number().int().min(10).max(2000).default(100),
  outlineChapters: z.number().int().min(10).max(60).default(20),
  includeMarketing: z.boolean().default(true),
  sampleChapter: z.boolean().default(true),
  maxWordCount: z.number().int().min(800).max(6000).default(DEFAULT_CHAPTER_WORD_TARGET),

  temperatureOverride: z.number().min(0).max(1.5).optional(),
});

export const PreviewBody = CommonBody.extend({
  /** 可选：仅用于读取现有小说作为提示词参考（不会写入） */
  novelId: z.string().uuid().optional(),
});

export const ApplyBody = CommonBody.extend({
  /** 必填：将爽文管线结果写入这本小说 */
  novelId: z.string().uuid(),
  overwriteMeta: z.boolean().default(false),
  overwriteChapter1: z.boolean().default(false),
  createChapterShells: z.boolean().default(false),
});

export const CreateBody = CommonBody.extend({
  /** 可选：指定新建小说标题（默认用蓝图 titleCandidates[0]） */
  title: z.string().max(80).optional(),
  synopsis: z.string().max(1200).optional(),
  constitutionTags: z.array(z.enum(NOVEL_CONSTITUTION_TAG_IDS as [string, ...string[]])).max(6).default([]),
  overwriteChapter1: z.boolean().default(false),
  createChapterShells: z.boolean().default(false),
});

export const GenerateChapterBody = z.object({
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  userDirection: z.string().max(2000).default(''),
  maxWordCount: z.number().int().min(800).max(6000).default(DEFAULT_CHAPTER_WORD_TARGET),
  hookGateMode: z.enum(['off', 'warn', 'strict']).default('warn'),
  cycleGateMode: z.enum(['off', 'warn', 'strict']).default('warn'),
  forbiddenGateMode: z.enum(['off', 'warn', 'strict']).default('warn'),
  scoreThreshold: z.number().min(1).max(10).default(6.0),
  maxRevisionRounds: z.number().int().min(0).max(5).default(2),
  temperatureOverride: z.number().min(0).max(1.5).optional(),
});

export type ShuangwenDeps = {
  novelManager: NovelManager;
  modelClient?: ModelClient;
  agents?: Map<string, NovelAgent>;
  memory?: PipelineMemory;
  novelMemory?: NovelMemory;
  storyStateManager?: StoryStateManager;
  chapterPipeline?: ChapterPipeline;
  broadcast?: (event: AgentEvent) => void;
  billingService?: BillingService;
  authDb?: AuthDb;
  notificationService?: import('../../../../services/notification-service.js').NotificationService;
};

// Re-export types from shuangwen-pipeline for convenience
export { ShuangwenAudience, ShuangwenPipeline, inferShuangwenAudienceFromGenre };
export type { ShuangwenBlueprint, ShuangwenMarketingPayload, ShuangwenSampleChapter, ShuangwenPipelineRunResult } from '../../../../pipeline/shuangwen-pipeline.js';
