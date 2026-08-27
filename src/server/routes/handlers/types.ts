import { z } from 'zod';
import type { NovelManager } from '../../../novel/novel-manager.js';
import type { NovelMemory } from '../../../memory/novel-memory.js';
import type { ChapterPipeline } from '../../../pipeline/chapter-pipeline.js';
import type { RevisionPipeline } from '../../../pipeline/revision-pipeline.js';
import type { FinalizePipeline } from '../../../pipeline/finalize-pipeline.js';
import type { BatchRevisionPipeline } from '../../../pipeline/batch-revision-pipeline.js';
import type { ModelClient } from '../../../models/types.js';
import type { AgentEvent } from '../../../agents/types.js';
import type { NovelAgent } from '../../../agents/types.js';
import type { StoryStateManager } from '../../../novel/story-state-manager.js';
import type { BillingService } from '../../../billing/billing-service.js';
import type { ReferralService } from '../../../referral/referral-service.js';
import type { AuthDb } from '../../../auth/types.js';
import type { MomentsGenerator } from '../../../character-moments/moments-generator.js';
import type { WriterStatsService } from '../../../services/writer-stats-service.js';

/** 路由依赖注入类型 */
export type GenerateDeps = {
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
  chapterPipeline: ChapterPipeline;
  revisionPipeline: RevisionPipeline;
  finalizePipeline?: FinalizePipeline;
  batchRevisionPipeline?: BatchRevisionPipeline;
  modelClient: ModelClient;
  broadcast: (event: AgentEvent) => void;
  broadcastJson?: (frame: Record<string, unknown>) => void;
  agents?: Map<string, NovelAgent>;
  storyStateManager?: StoryStateManager;
  billingService?: BillingService;
  referralService?: ReferralService;
  authDb?: AuthDb;
  notificationService?: import('../../../services/notification-service.js').NotificationService;
  /** 角色朋友圈生成器：章节生成/定稿完成后自动触发剧情动态 */
  momentsGenerator?: MomentsGenerator;
  /** 写作统计服务：记录章节生成的字数统计 */
  writerStatsService?: WriterStatsService;
};

/** 生成章节请求体 schema */
const ChapterStylePreset = z.enum([
  'auto',
  'serious',
  'comedy',
  'wacky',
  'historical',
  'xianxia',
  'wuxia',
  'suspense',
  'horror',
  'campus',
  'workplace',
  'political',
  'hard-scifi',
  'romance-sweet',
  'romance-angst',
]);

export const GenerateChapterBody = z.object({
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  userDirection: z.string().default(''),
  maxWordCount: z.number().int().min(800, '最大字数至少 800').max(20000, '最大字数不超过 20000').optional(),
  stylePreset: ChapterStylePreset.optional(),
  styleNotes: z.string().max(500, '风格补充说明不超过 500 字').optional(),
  startupPlatformProfile: z.enum(['auto', 'fanqie', 'qidian']).optional(),
});

/** 重写章节请求体 schema */
export const RewriteChapterBody = z.object({
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  userDirection: z.string().default(''),
  maxWordCount: z.number().int().min(800, '最大字数至少 800').max(20000, '最大字数不超过 20000').optional(),
  stylePreset: ChapterStylePreset.optional(),
  styleNotes: z.string().max(500, '风格补充说明不超过 500 字').optional(),
});

/** 修订章节请求体 schema */
export const ReviseChapterBody = z.object({
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  feedback: z.string().min(1, '修订反馈不能为空'),
  enableAiMarkerGuard: z.boolean().optional(),
  aiMarkerGuardThreshold: z.number().min(0).max(20).optional(),
  mode: z.enum(['rewrite', 'spot-fix']).optional(),
});

/** 缩写/扩写章节请求体 schema */
export const ResizeChapterBody = z.object({
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  targetWordCount: z.number().int().min(500).max(20000),
  mode: z.enum(['compress', 'expand']),
  preserveNotes: z.string().max(500).optional(),
});

/** 聊天请求体 schema */
export const ChatBody = z.object({
  novelId: z.string().uuid().optional(),
  message: z.string().min(1, '消息不能为空'),
  maxTokens: z.number().int().min(64).max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

/** 灵感扩写请求体 */
export const ExpandIdeaBody = z.object({
  novelId: z.string().uuid(),
  text: z.string().min(1, '输入不能为空').max(500),
  field: z.enum(['direction', 'styleNotes']).default('direction'),
  chapterNumber: z.number().int().positive().optional(),
});

/** 内联 AI 操作类型 */
export const InlineOperation = z.enum([
  'continue',
  'rewrite',
  'expand',
  'polish',
  'compress',
  'dialogue',
  'describe',
  'custom',
]);

/** 内联 AI 请求体 schema */
export const InlineAIBody = z.object({
  novelId: z.string().uuid().optional(),
  chapterNumber: z.number().int().positive().optional(),
  operation: InlineOperation,
  text: z.string().min(1, '文本不能为空'),
  context: z.string().default(''),
  instruction: z.string().default(''),
});

/** 操作对应的系统提示词 */
export const INLINE_PROMPTS = {
  continue: '你是一位资深小说作家。请根据给定的上下文，自然地续写接下来的内容。保持与前文一致的风格、语气和叙事节奏。直接输出续写内容，不要加任何前缀说明。',
  rewrite: '你是一位资深小说编辑。请仅改写用户给出的目标片段本身，保持核心语义与剧情事实不变，不得擅自续写前后文，不得改动人物身份、称谓/自称、时间地点、数字关系。若存在“(#角色名)”标记必须原样保留。禁止使用“（动作/情绪/声线）+台词”或“台词+（动作）”写法，改为直述。直接输出改写后的片段正文，不要加任何前缀说明。',
  expand: '你是一位资深小说作家。请对以下文本进行扩写，补充更多细节描写（环境、动作、心理、感官等），使场景更加丰满立体。保持原有剧情方向不变。直接输出扩写后的内容，不要加任何前缀说明。',
  polish: '你是一位资深文学编辑。请润色以下文本，提升文学性和可读性。改进句式、词汇选择、节奏感，但不改变原意和情节。禁止使用“（动作/情绪/声线）+台词”或“台词+（动作）”写法，改为读者可直接感知的叙述。直接输出润色后的内容，不要加任何前缀说明。',
  compress: '你是一位精通文字精炼的编辑。请精简以下文本，去除冗余描写和重复表达，保留核心信息和关键描写，使行文更加紧凑有力。直接输出精简后的内容，不要加任何前缀说明。',
  dialogue: '你是一位擅长人物塑造的小说家。请优化以下对话，让每个角色的语言更有个人特色和辨识度，对话更加自然真实。注意语气、用词习惯、性格体现。禁止使用“（动作/情绪/声线）+台词”或“台词+（动作）”写法，表达要直给。直接输出优化后的内容，不要加任何前缀说明。',
  describe: '你是一位擅长描写的小说家。请为以下文本补充感官描写（视觉、听觉、触觉、嗅觉、味觉），增加画面感和沉浸感。直接输出补充后的内容，不要加任何前缀说明。',
  custom: '你是一位专业的小说创作助手。请按照用户的具体要求处理以下文本。若文本包含对话，禁止使用“（动作/情绪/声线）+台词”或“台词+（动作）”写法，改为直述。直接输出处理后的内容，不要加任何前缀说明。',
};

export const REVISION_MIN_EXPECTED_DELTA = 5;
export const REVISION_AUTO_POLISH_MAX_ROUNDS = 2;

/** 补全标记请求体 schema */
export const BackfillSpeakersBody = z.object({
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
});

/** 批量生成请求体 schema */
export const BatchBody = z.object({
  novelId: z.string().uuid(),
  fromChapter: z.number().int().positive(),
  toChapter: z.number().int().positive(),
  autoFinalize: z.boolean().default(false),
  userDirection: z.string().default(''),
  maxWordCount: z.number().int().min(800, '最大字数至少 800').max(20000, '最大字数不超过 20000').optional(),
});

/** 批量修订请求体 schema */
export const BatchReviseBody = z.object({
  novelId: z.string().uuid(),
  fromChapter: z.number().int().positive(),
  toChapter: z.number().int().positive(),
  userDirection: z.string().default(''),
});

/** 批量重写请求体 schema */
export const BatchRewriteBody = z.object({
  novelId: z.string().uuid(),
  chapterNumbers: z.array(z.number().int().positive()).min(1, '至少选择一个章节').max(100, '单次最多重写 100 章'),
  userDirection: z.string().default(''),
  maxWordCount: z.number().int().min(800, '最大字数至少 800').max(20000, '最大字数不超过 20000').optional(),
  stylePreset: ChapterStylePreset.optional(),
  styleNotes: z.string().max(500, '风格补充说明不超过 500 字').optional(),
});

/** 批量摘要请求体 schema */
export const BatchDigestBody = z.object({
  novelId: z.string().uuid(),
  chapterNumbers: z.array(z.number().int().positive()).optional(),
  force: z.boolean().default(false),
});

/** 重生请求体 schema */
export const RebirthBody = z.object({
  novelId: z.string().uuid(),
  userDirection: z.string().default(''),
  autoGenerate: z.boolean().default(true),
  autoFinalize: z.boolean().default(false),
  maxWordCount: z.number().int().min(800).max(20000).optional(),
});

/** 章节级干预指令请求体 schema */
export const ChapterDirectionBody = z.object({
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  direction: z.string().min(1, '干预指令不能为空'),
});
