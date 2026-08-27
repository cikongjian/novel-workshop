import { z } from 'zod';
import { ShortStoryBlueprint } from './short-story-types.js';
import { NOVEL_CONSTITUTION_TAG_IDS } from '../config/novel-constitution-tags.js';
import { NovelConstitution } from './constitution-types.js';

// ==================== 小说元数据 ====================

export const NovelGenre = z.enum([
  'fantasy',    // 玄幻/奇幻
  'mystery',    // 悬疑/推理
  'modern',     // 都市/现代
  'scifi',      // 科幻
  'historical', // 历史
  'romance',    // 言情
  'custom',     // 自定义
]);
export type NovelGenre = z.infer<typeof NovelGenre>;

export const NovelStatus = z.enum([
  'planning',   // 构思中
  'writing',    // 连载中
  'paused',     // 暂停
  'completed',  // 完结
  'published',  // 已发布
]);
export type NovelStatus = z.infer<typeof NovelStatus>;

export const NovelMetadata = z.object({
  id: z.string().uuid(),
  /** 跨实例同步标识，创建时等于 id，导入/同步时保留原值 */
  syncId: z.string().uuid().optional(),
  title: z.string().min(1),
  genre: NovelGenre,
  status: NovelStatus,
  synopsis: z.string().default(''),
  description: z.string().default(''),
  /** 小说级 Edge-TTS 旁白音色（按小说独立配置） */
  edgeNarratorVoice: z.string().default('zh-CN-YunyangNeural'),
  /** 封面图片文件名（相对于小说目录，如 cover.jpg） */
  coverImage: z.string().optional(),
  targetChapters: z.number().int().positive().optional(),
  /** 是否启用标题点题引导（开启后 Writer/Editor 会被提示围绕标题主题写作） */
  titleGuidance: z.boolean().default(false),
  /** 首三章上架平台范式（用于强制约束开篇写法） */
  startupPlatformProfile: z.enum(['auto', 'fanqie', 'qidian']).default('auto'),
  chapterCount: z.number().int().nonnegative().optional(),
  finalizedChapterCount: z.number().int().nonnegative().optional(),
  wordCount: z.number().int().nonnegative().default(0),
  modelConfig: z.object({
    provider: z.enum([
      'anthropic', 'openai', 'custom-openai', 'ollama', 'deepseek', 'qwen', 'zhipu',
      'moonshot', 'doubao', 'baichuan', 'stepfun', 'minimax', 'siliconflow',
    ]),
    source: z.enum(['platform', 'user-profile']).default('platform'),
    userApiProfileId: z.string().uuid().optional(),
    userApiProfileStorageMode: z.enum(['server', 'local']).optional(),
    userApiProfileName: z.string().max(80).optional(),
    apiKey: z.string().default(''),
    model: z.string().default(''),
    baseUrl: z.string().default(''),
    temperature: z.number().min(0).max(2).default(0.7),
  }).optional(),
  /** 小说级 Embedding 配置（覆盖全局 Embedding 设置） */
  embeddingConfig: z.object({
    provider: z.enum(['openai', 'ollama', 'qwen', 'zhipu', 'siliconflow']),
    apiKey: z.string().default(''),
    model: z.string().default(''),
    baseUrl: z.string().default(''),
  }).optional(),
  /** 记忆检索优先级覆盖（key 为 section 名，value 为优先级数值，越高越优先保留） */
  memoryPriority: z.record(z.string(), z.number()).optional(),
  /** 爽文管线蓝图（仅爽文模式小说持有） */
  shuangwenBlueprint: z.object({
    audience: z.enum(['male', 'female']),
    genre: z.string(),
    titleCandidates: z.array(z.string()).default([]),
    logline: z.string().default(''),
    synopsis: z.string().default(''),
    tags: z.array(z.string()).default([]),
    hook: z.object({
      openingScene: z.string(),
      incitingIncident: z.string(),
      firstPayoff: z.string(),
      chapterEndHookRule: z.string(),
    }),
    protagonist: z.object({
      name: z.string().default(''),
      archetype: z.string().default(''),
      goal: z.string().default(''),
      flaw: z.string().default(''),
    }).default({}),
    antagonist: z.object({
      name: z.string().default(''),
      archetype: z.string().default(''),
      threat: z.string().default(''),
    }).default({}),
    engine: z.object({
      cycleFormula: z.string(),
      escalationRule: z.string(),
      constraints: z.array(z.string()).default([]),
    }),
    styleGuide: z.string().default(''),
    forbidden: z.array(z.string()).default([]),
  }).optional(),
  /** 短篇小说蓝图（仅短篇模式小说持有） */
  shortStoryBlueprint: z.lazy(() => ShortStoryBlueprint).optional(),
  /** AI 书名 & 简介推荐历史 */
  titleRecommendations: z.array(z.object({
    id: z.string().uuid(),
    platform: z.enum(['qidian', 'fanqie', 'general']),
    titles: z.array(z.object({
      title: z.string(),
      reasoning: z.string().default(''),
    })),
    shortSynopsis: z.string().default(''),
    longSynopsis: z.string().default(''),
    tags: z.array(z.string()).default([]),
    marketingInsight: z.string().default(''),
    createdAt: z.string().datetime(),
  })).default([]),
  /** 营销包装生成历史 */
  marketingPackages: z.array(z.object({
    id: z.string().uuid(),
    titles: z.array(z.string()).default([]),
    oneLiner: z.string().default(''),
    shortSynopsis: z.string().default(''),
    longSynopsis: z.string().default(''),
    characterCards: z.array(z.object({
      name: z.string(),
      tagline: z.string(),
      description: z.string(),
    })).default([]),
    socialPosts: z.array(z.string()).default([]),
    raw: z.string().default(''),
    createdAt: z.string().datetime(),
  })).default([]),
  /** 所有者用户 ID（多用户隔离，开发模式下为 'dev'，缺省视为 'dev'） */
  ownerId: z.string().default('dev'),
  /** 分叉溯源信息：若本作品是从另一作品分叉而来，记录源作品与分叉章节 */
  forkedFrom: z.object({
    originalNovelId: z.string(),
    originalTitle: z.string().default(''),
    chapter: z.number().int().positive(),
    forkedBy: z.string().default(''),
  }).optional(),
  /** 用户自定义分类标签（如 "重点项目"、"练习"、"修仙系列"） */
  tags: z.array(z.string()).default([]),
  /** 题材宪章标签（强约束，优先于通用悬念模板） */
  constitutionTags: z.array(z.enum(NOVEL_CONSTITUTION_TAG_IDS as [string, ...string[]])).default([]),
  /** 当前小说最近一次上架平台推荐结果（持久化缓存） */
  publishingRecommendation: z.unknown().optional(),
  /** 小说宪章（结构化创作约束，Agent 提示词 + 门禁检测共用） */
  constitution: NovelConstitution.optional(),
  /** 互动小说配置（仅当作者开启互动模式时存在；结构由 InteractiveConfig 定义） */
  interactiveConfig: z.unknown().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type NovelMetadata = z.infer<typeof NovelMetadata>;

/** 单条书名推荐记录类型 */
export type TitleRecommendation = NovelMetadata['titleRecommendations'][number];

/** 单条营销包装记录类型 */
export type MarketingPackage = NovelMetadata['marketingPackages'][number];

// ==================== 世界观 ====================

export const WorldCategory = z.enum([
  'geography',  // 地理
  'history',    // 历史
  'faction',    // 势力/阵营
  'power',      // 力量体系
  'culture',    // 文化/风俗
  'rule',       // 世界法则
  'other',      // 其他
]);
export type WorldCategory = z.infer<typeof WorldCategory>;

export const WorldEntryState = z.enum([
  'active',
  'resolved',
  'deprecated',
]);
export type WorldEntryState = z.infer<typeof WorldEntryState>;

export const WorldStoryRole = z.enum([
  'anchor',
  'conflict',
  'mystery',
  'resource',
  'constraint',
]);
export type WorldStoryRole = z.infer<typeof WorldStoryRole>;

export const WorldEntrySource = z.enum([
  'manual',
  'auto-extracted',
  'auto-generated',
  'merged',
]);
export type WorldEntrySource = z.infer<typeof WorldEntrySource>;

export const WorldEntry = z.object({
  id: z.string().uuid(),
  category: WorldCategory,
  name: z.string().min(1),
  description: z.string(),
  aliases: z.array(z.string()).optional(),
  state: WorldEntryState.optional(),
  storyRole: WorldStoryRole.optional(),
  constraints: z.array(z.string()).optional(),
  consequences: z.array(z.string()).optional(),
  introducedIn: z.number().int().positive().optional(),
  lastUsedIn: z.number().int().positive().optional(),
  useCount: z.number().int().nonnegative().optional(),
  qualityScore: z.number().min(0).max(1).optional(),
  /** 是否为设定基线条目（人工冻结：merge 时不被覆盖，检索强制保留）。见 setting-baseline。 */
  baseline: z.boolean().optional(),
  /** 设定漂移风险分 0-1（漂移检测器写入；检索时降权，1=高危）。 */
  driftRisk: z.number().min(0).max(1).optional(),
  source: WorldEntrySource.optional(),
  details: z.record(z.string(), z.string()).default({}),
  /** 依赖的其他世界条目ID（如：魔法体系依赖某种矿石资源） */
  dependencies: z.array(z.string().uuid()).optional().default([]),
  /** 与之冲突的世界条目ID（如：两个互斥的法则） */
  conflicts: z.array(z.string().uuid()).optional().default([]),
  relatedEntries: z.array(z.string().uuid()).default([]),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WorldEntry = z.infer<typeof WorldEntry>;

// ==================== 角色 ====================

export const CharacterRoleValues = [
  'protagonist', // 主角
  'deuteragonist', // 副主角
  'antagonist', // 反派
  'rival', // 宿敌
  'love_interest', // 感情线
  'mentor', // 导师
  'ally', // 盟友
  'faction_leader', // 势力核心
  'supporting', // 配角
  'family', // 亲友
  'comic_relief', // 气氛担当
  'minor', // 路人
] as const;

export const CharacterRole = z.enum(CharacterRoleValues);
export type CharacterRole = z.infer<typeof CharacterRole>;

export const CharacterRelationship = z.object({
  targetId: z.string().uuid(),
  type: z.string(),
  description: z.string().default(''),
  /** 权力关系：dominant=主导 / equal=对等 / submissive=从属 */
  powerDynamic: z.enum(['dominant', 'equal', 'submissive']).optional(),
  /** 情感债务/恩怨（如"救命之恩"、"杀父之仇"） */
  emotionalDebt: z.string().optional(),
  /** 共同经历/秘密 */
  sharedHistory: z.string().optional(),
  /** 关系紧张度 0-100 */
  tensionLevel: z.number().min(0).max(100).optional(),
  /** 表面关系 vs 真实关系（如"表面忠臣，实为卧底"） */
  publicVsPrivate: z.string().optional(),
});
export type CharacterRelationship = z.infer<typeof CharacterRelationship>;

export const CharacterDrives = z.object({
  want: z.string().default(''),
  need: z.string().default(''),
  fear: z.string().optional(),
  secret: z.string().optional(),
  taboo: z.array(z.string()).default([]),
});
export type CharacterDrives = z.infer<typeof CharacterDrives>;

export const CharacterPersonalityV2 = z.object({
  traits: z.array(z.string()).default([]),
  innerContradictions: z.array(z.string()).default([]),
  moralBoundary: z.array(z.string()).default([]),
});
export type CharacterPersonalityV2 = z.infer<typeof CharacterPersonalityV2>;

export const CharacterSpeechDNA = z.object({
  lexicon: z.array(z.string()).default([]),
  tempo: z.enum(['slow', 'mid', 'fast']).default('mid'),
  tone: z.array(z.string()).default([]),
  tics: z.array(z.string()).default([]),
});
export type CharacterSpeechDNA = z.infer<typeof CharacterSpeechDNA>;

/** 公私面具 */
export const CharacterPersona = z.object({
  /** 公众形象（别人眼中的他） */
  publicPersona: z.string().default(''),
  /** 私下面目（独处时的他） */
  privatePersona: z.string().default(''),
  /** 什么情况下面具会裂开 */
  maskTrigger: z.string().default(''),
});
export type CharacterPersona = z.infer<typeof CharacterPersona>;

/** 心理画像 */
export const CharacterPsychology = z.object({
  /** 世界观/核心信念 */
  worldview: z.string().default(''),
  /** 应对压力的方式（逃避、攻击、自嘲、沉默等） */
  copingMechanisms: z.array(z.string()).default([]),
  /** 情绪触发点 */
  emotionalTriggers: z.array(z.string()).default([]),
});
export type CharacterPsychology = z.infer<typeof CharacterPsychology>;

/** 社会身份 */
export const CharacterSocialIdentity = z.object({
  /** 所属阵营/组织/家族 */
  faction: z.string().default(''),
  /** 社会阶层 */
  socialClass: z.string().default(''),
  /** 在不同群体中的名声 */
  reputation: z.string().default(''),
});
export type CharacterSocialIdentity = z.infer<typeof CharacterSocialIdentity>;

/** 象征系统 */
export const CharacterSymbolism = z.object({
  /** 象征物品 */
  symbolObject: z.string().default(''),
  /** 反复出现的习惯动作/意象 */
  recurringMotif: z.string().default(''),
  /** 角色主题词 */
  themeWord: z.string().default(''),
});
export type CharacterSymbolism = z.infer<typeof CharacterSymbolism>;

/** 成长里程碑 */
export const CharacterGrowthMilestone = z.object({
  chapter: z.number().int(),
  event: z.string(),
  insight: z.string().default(''),
});
export type CharacterGrowthMilestone = z.infer<typeof CharacterGrowthMilestone>;

/** 成长轨迹 */
export const CharacterGrowthTrack = z.object({
  milestones: z.array(CharacterGrowthMilestone).default([]),
  /** 超出上限后自动归档的早期里程碑摘要 */
  archivedMilestonesSummary: z.string().default(''),
  /** 未解决的创伤 */
  unresolvedTrauma: z.array(z.string()).default([]),
  /** 未兑现的承诺/誓言 */
  pendingPromises: z.array(z.string()).default([]),
});
export type CharacterGrowthTrack = z.infer<typeof CharacterGrowthTrack>;

export const CharacterIdentityLabelCategory = z.enum([
  'structural',
  'social',
  'relationship',
  'growth',
  'reader',
]);
export type CharacterIdentityLabelCategory = z.infer<typeof CharacterIdentityLabelCategory>;

export const CharacterIdentityLabel = z.object({
  /** 稳定键，用于自动投影时幂等更新。 */
  key: z.string().min(1),
  label: z.string().min(1),
  category: CharacterIdentityLabelCategory,
  source: z.enum(['derived', 'ai', 'user']),
  confidence: z.number().min(0).max(1),
  evidenceChapter: z.number().int().positive().optional(),
  /** 用户锁定后，自动投影不得覆盖。 */
  userLocked: z.boolean().optional(),
});
export type CharacterIdentityLabel = z.infer<typeof CharacterIdentityLabel>;

export const CharacterTTSProsodyRange = z.object({
  rate: z.tuple([z.number(), z.number()]).default([0.9, 1.1]),
  pitch: z.tuple([z.number(), z.number()]).default([-2, 2]),
});
export type CharacterTTSProsodyRange = z.infer<typeof CharacterTTSProsodyRange>;

export const CharacterTTSProfile = z.object({
  baseVoice: z.string().default('default'),
  prosodyRange: CharacterTTSProsodyRange.default({
    rate: [0.9, 1.1],
    pitch: [-2, 2],
  }),
  emotionMap: z.record(z.string(), z.string()).default({}),
});
export type CharacterTTSProfile = z.infer<typeof CharacterTTSProfile>;

export const CharacterProfile = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  role: CharacterRole,
  /** 职位/头衔（如"尚膳监太监"、"丞相"） */
  position: z.string().default(''),
  age: z.string().optional(),
  gender: z.string().optional(),
  appearance: z.string().default(''),
  personality: z.string().default(''),
  personalityTraits: z.array(z.string()).default([]),
  speechStyle: z.string().default(''),
  speechExamples: z.array(z.string()).default([]),
  backstory: z.string().default(''),
  motivation: z.string().default(''),
  abilities: z.array(z.string()).default([]),
  relationships: z.array(CharacterRelationship).default([]),
  arc: z.string().default(''),
  currentState: z.string().default(''),
  firstAppearance: z.number().int().optional(),
  ttsVoice: z.string().optional(),
  /** AI 音效师生成的声音描述指令（Qwen3-TTS VoiceDesign 用） */
  voiceInstruct: z.string().optional(),
  /** 参考音频文件路径（相对于小说目录） */
  voiceRefAudioPath: z.string().optional(),
  /** Python 服务端缓存的 voice clone prompt ID */
  voiceClonePromptId: z.string().optional(),
  /** 序列化的 voice clone prompt 数据（Base64，持久化） */
  voiceClonePromptData: z.string().optional(),
  /** 声音设计状态 */
  voiceDesignStatus: z.enum(['none', 'designed', 'cloned']).default('none'),
  /** 角色立绘图片路径（相对于小说目录，如 portraits/char-id.png） */
  portraitImagePath: z.string().optional(),
  /** 生成立绘时使用的提示词 */
  portraitPrompt: z.string().optional(),
  /** 是否开启角色信箱（读者可给该角色写信） */
  mailboxEnabled: z.boolean().optional(),
  /** 是否开启角色朋友圈（角色可发动态、互评） */
  momentsEnabled: z.boolean().optional(),
  drives: CharacterDrives.optional(),
  personalityModel: CharacterPersonalityV2.optional(),
  speechDNA: CharacterSpeechDNA.optional(),
  ttsProfile: CharacterTTSProfile.optional(),
  /** 公私面具 */
  persona: CharacterPersona.optional(),
  /** 心理画像 */
  psychology: CharacterPsychology.optional(),
  /** 社会身份 */
  socialIdentity: CharacterSocialIdentity.optional(),
  /** 象征系统 */
  symbolism: CharacterSymbolism.optional(),
  /** 成长轨迹 */
  growthTrack: CharacterGrowthTrack.optional(),
  /** 从结构化档案自动投影的角色身份标签。 */
  identityLabels: z.array(CharacterIdentityLabel).optional(),
  tags: z.array(z.string()).default([]),
  status: z.enum(['active', 'dead', 'exited']).optional(),
  /** 卡牌封面展示的读者友好状态摘要（AI 每章生成，20 字内） */
  cardBlurb: z.string().optional(),
  /** 是否自动触发卡牌进化（默认 true，作者可关闭改为手动确认） */
  autoEvolve: z.boolean().optional(),
  /** 是否为基线角色（人工冻结：核心人设字段 merge 时不被覆盖）。见 setting-baseline。 */
  baseline: z.boolean().optional(),
  /** 设定漂移风险分 0-1（核心人设被改写时升高；检索降权）。 */
  driftRisk: z.number().min(0).max(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CharacterProfile = z.infer<typeof CharacterProfile>;
export const CharacterEmotionState = z.object({
  primary: z.string().default('neutral'),
  intensity: z.number().min(0).max(100).default(0),
  trigger: z.string().optional(),
});
export type CharacterEmotionState = z.infer<typeof CharacterEmotionState>;

export const CharacterTrustChange = z.object({
  targetId: z.string().uuid(),
  delta: z.number().min(-100).max(100),
  reason: z.string().default(''),
});
export type CharacterTrustChange = z.infer<typeof CharacterTrustChange>;

export const CharacterStateEvidence = z.object({
  paragraphIdx: z.number().int().nonnegative(),
  reason: z.string().default(''),
});
export type CharacterStateEvidence = z.infer<typeof CharacterStateEvidence>;

export const CharacterStateSnapshot = z.object({
  id: z.string().uuid(),
  novelId: z.string().uuid(),
  characterId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  emotionState: CharacterEmotionState.default({
    primary: 'neutral',
    intensity: 0,
  }),
  goalProgress: z.number().min(0).max(100).default(0),
  stress: z.number().min(0).max(100).default(0),
  trustChanges: z.array(CharacterTrustChange).default([]),
  beliefShift: z.string().default(''),
  evidence: z.array(CharacterStateEvidence).default([]),
  /** 是否包含关键事件（死亡/突破/背叛等），标记后搜索时不被衰减 */
  isCritical: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CharacterStateSnapshot = z.infer<typeof CharacterStateSnapshot>;

// ==================== 大纲/情节 ====================

export const PlotThreadStatus = z.enum([
  'planted',    // 已埋下
  'developing', // 发展中
  'climax',     // 高潮
  'resolved',   // 已收束
  'abandoned',  // 已弃用
]);
export type PlotThreadStatus = z.infer<typeof PlotThreadStatus>;

export const PlotThread = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string(),
  status: PlotThreadStatus,
  plantedInChapter: z.number().int().optional(),
  resolvedInChapter: z.number().int().optional(),
  relatedCharacters: z.array(z.string().uuid()).default([]),
  notes: z.string().default(''),
  /** 前置情节线ID（必须先推进/解决才能推进本线） */
  prerequisites: z.array(z.string().uuid()).default([]),
  /** 并行情节线ID（应同步推进的姊妹线） */
  parallelThreads: z.array(z.string().uuid()).default([]),
  /** 合流目标情节线ID（本线最终汇入的主线） */
  mergeTarget: z.string().uuid().optional(),
});
export type PlotThread = z.infer<typeof PlotThread>;

export const Foreshadowing = z.object({
  id: z.string().uuid(),
  hint: z.string(),
  plantedInChapter: z.number().int(),
  plantedInParagraph: z.number().int().optional(),
  resolution: z.string().default(''),
  resolvedInChapter: z.number().int().optional(),
  isResolved: z.boolean().default(false),
  relatedPlotThreads: z.array(z.string().uuid()).default([]),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  scope: z.enum(['scene', 'arc', 'saga']).optional(),
  /** 计划回收章节（由伏笔路径规划器自动生成，作者可手动覆盖） */
  plannedResolveChapter: z.number().int().optional(),
  /** 前置伏笔ID（必须先回收这些伏笔才能回收本伏笔，形成依赖链） */
  prerequisites: z.array(z.string().uuid()).optional(),
  /** 回收路径描述（如"通过XX角色在XX场景揭示"），由规划器生成 */
  recoveryPath: z.string().optional(),
  /** 路径规划版本号，用于幂等更新（每次重规划 +1） */
  planVersion: z.number().int().optional(),
});
export type Foreshadowing = z.infer<typeof Foreshadowing>;

export const SceneBeat = z.object({
  id: z.string().uuid(),
  summary: z.string(),
  characters: z.array(z.string().uuid()).default([]),
  location: z.string().default(''),
  tension: z.number().min(0).max(10).default(5),
  notes: z.string().default(''),
});
export type SceneBeat = z.infer<typeof SceneBeat>;

export const SceneStatus = z.enum([
  'planned',
  'generating',
  'drafted',
  'edited',
  'finalized',
]);
export type SceneStatus = z.infer<typeof SceneStatus>;

export const Scene = z.object({
  id: z.string().uuid(),
  sceneNumber: z.number().int().positive(),
  title: z.string().default(''),
  summary: z.string().default(''),
  characters: z.array(z.string()).default([]),
  location: z.string().default(''),
  tension: z.number().min(0).max(10).default(5),
  wordTarget: z.number().int().nonnegative().default(0),
  wordCount: z.number().int().nonnegative().default(0),
  content: z.string().default(''),
  status: SceneStatus.default('planned'),
  notes: z.string().default(''),
  readerScore: z.number().min(0).max(10).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Scene = z.infer<typeof Scene>;

export const ChapterOutline = z.object({
  chapterNumber: z.number().int().positive(),
  title: z.string().default(''),
  summary: z.string().default(''),
  beats: z.array(SceneBeat).default([]),
  tensionTarget: z.number().min(0).max(10).default(5),
  plotThreadsAdvanced: z.array(z.string().uuid()).default([]),
  keyEvents: z.array(z.string()).default([]),
  notes: z.string().default(''),
});
export type ChapterOutline = z.infer<typeof ChapterOutline>;

export const OutlineData = z.object({
  chapters: z.array(ChapterOutline).default([]),
  plotThreads: z.array(PlotThread).default([]),
  foreshadowing: z.array(Foreshadowing).default([]),
});
export type OutlineData = z.infer<typeof OutlineData>;

// ==================== IP 改编 ====================

export const AdaptationMode = z.enum([
  'audio',
  'comic',
  'short-drama',
]);
export type AdaptationMode = z.infer<typeof AdaptationMode>;

export const AdaptationPackageStatus = z.enum([
  'draft',
  'passed',
  'failed',
  'published',
]);
export type AdaptationPackageStatus = z.infer<typeof AdaptationPackageStatus>;

export const SceneCardCharacter = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  objective: z.string().default(''),
});
export type SceneCardCharacter = z.infer<typeof SceneCardCharacter>;

export const SceneCardEmotionBeat = z.object({
  beat: z.string().min(1),
  intensity: z.number().min(0).max(10),
});
export type SceneCardEmotionBeat = z.infer<typeof SceneCardEmotionBeat>;

export const SceneCard = z.object({
  id: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  sceneIndex: z.number().int().nonnegative(),
  title: z.string().min(1),
  time: z.string().default(''),
  location: z.string().default(''),
  characters: z.array(SceneCardCharacter).default([]),
  conflict: z.string().default(''),
  turningPoint: z.string().default(''),
  outcome: z.string().default(''),
  emotionCurve: z.array(SceneCardEmotionBeat).default([]),
  continuityRefs: z.array(z.string()).default([]),
  rawExcerpt: z.string().min(1),
});
export type SceneCard = z.infer<typeof SceneCard>;

export const AdaptationPackage = z
  .object({
    id: z.string().uuid(),
    novelId: z.string().uuid(),
    chapterNumberStart: z.number().int().positive(),
    chapterNumberEnd: z.number().int().positive(),
    mode: AdaptationMode,
    version: z.number().int().positive(),
    status: AdaptationPackageStatus.default('draft'),
    payloadPath: z.string().min(1),
    qaReportPath: z.string().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
  })
  .refine((pkg) => pkg.chapterNumberEnd >= pkg.chapterNumberStart, {
    message: 'chapterNumberEnd 必须大于等于 chapterNumberStart',
    path: ['chapterNumberEnd'],
  });
export type AdaptationPackage = z.infer<typeof AdaptationPackage>;

// ==================== 支线进度板 ====================

export const SubplotProgressEntry = z.object({
  threadId: z.string().uuid(),
  threadName: z.string(),
  status: PlotThreadStatus,
  plantedInChapter: z.number().int().positive().optional(),
  lastAdvancedInChapter: z.number().int().positive().optional(),
  chaptersStalled: z.number().int().nonnegative(),
  isStalled: z.boolean(),
  relatedCharacters: z.array(z.string()).default([]),
  nextMilestone: z.string().default(''),
});
export type SubplotProgressEntry = z.infer<typeof SubplotProgressEntry>;

export const SubplotBoard = z.object({
  novelId: z.string().uuid(),
  currentChapter: z.number().int().positive(),
  entries: z.array(SubplotProgressEntry).default([]),
  updatedAt: z.string().datetime(),
});
export type SubplotBoard = z.infer<typeof SubplotBoard>;

// ==================== 章节 ====================

export const ChapterStatus = z.enum([
  'outlined',   // 仅有大纲
  'drafted',    // 初稿
  'edited',     // 已润色
  'reviewed',   // 已审读
  'finalized',  // 定稿
]);
export type ChapterStatus = z.infer<typeof ChapterStatus>;

export const AgentComment = z.object({
  agentRole: z.string(),
  comment: z.string(),
  paragraph: z.number().int().optional(),
  timestamp: z.string().datetime(),
});
export type AgentComment = z.infer<typeof AgentComment>;

export const StartupOpeningGateFinding = z.object({
  code: z.enum([
    'weak-first-screen',
    'unclear-goal',
    'unclear-obstacle',
    'weak-early-payoff',
    'weak-ending-hook',
    'heavy-exposition',
    'weak-platform-fit',
    'missing-promise-payoff',
    'suspense-drift',
    'overloaded-opening',
    'word-count-overrun',
  ]),
  level: z.enum(['warn']),
  message: z.string(),
});
export type StartupOpeningGateFinding = z.infer<typeof StartupOpeningGateFinding>;

export const StartupOpeningOverloadReport = z.object({
  overloaded: z.boolean(),
  reason: z.string().optional(),
  firstPayoffParagraphIndex: z.number().int(),
  payoffParagraphCount: z.number().int().nonnegative(),
  tailCharsAfterFirstPayoff: z.number().int().nonnegative(),
  tailShareAfterFirstPayoff: z.number().min(0),
  lateTurnCount: z.number().int().nonnegative(),
  latePayoffCount: z.number().int().nonnegative(),
  lateSystemBurstCount: z.number().int().nonnegative(),
});
export type StartupOpeningOverloadReport = z.infer<typeof StartupOpeningOverloadReport>;

export const PromiseDriftReport = z.object({
  active: z.boolean(),
  promiseHits: z.number().int().nonnegative(),
  sceneHits: z.number().int().nonnegative(),
  suspenseHits: z.number().int().nonnegative(),
  suspenseShare: z.number().min(0),
  missingPrimaryPayoff: z.boolean(),
  drifting: z.boolean(),
  summary: z.string(),
});
export type PromiseDriftReport = z.infer<typeof PromiseDriftReport>;

export const GenreDriftAudit = z.object({
  active: z.boolean(),
  genre: z.string(),
  constitutionTags: z.array(z.string()).default([]),
  suspenseGenre: z.boolean(),
  promiseDrift: PromiseDriftReport,
  qualityFloorPassed: z.boolean(),
  issues: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
});
export type GenreDriftAudit = z.infer<typeof GenreDriftAudit>;

export const StartupOpeningGateReport = z.object({
  enabled: z.boolean(),
  chapterNumber: z.number().int(),
  gateMode: z.enum(['warn', 'strict']),
  platformProfile: z.enum(['auto', 'fanqie', 'qidian']),
  openingScore: z.number(),
  clarityScore: z.number(),
  payoffScore: z.number(),
  endingHookScore: z.number(),
  platformFitScore: z.number(),
  promiseConsistencyScore: z.number(),
  overallScore: z.number(),
  passed: z.boolean(),
  overrunChars: z.number().int().nonnegative(),
  promiseDrift: PromiseDriftReport.optional(),
  overload: StartupOpeningOverloadReport.optional(),
  findings: z.array(StartupOpeningGateFinding).default([]),
  summary: z.string(),
});
export type StartupOpeningGateReport = z.infer<typeof StartupOpeningGateReport>;

export const StartupOpeningGateRewrite = z.object({
  attempted: z.boolean(),
  applied: z.boolean(),
  reason: z.string(),
  before: StartupOpeningGateReport,
  after: StartupOpeningGateReport,
});
export type StartupOpeningGateRewrite = z.infer<typeof StartupOpeningGateRewrite>;

export const StartupOpeningStrategyDigest = z.object({
  enabled: z.boolean(),
  brief: z.string(),
  summary: z.string(),
  conflicts: z.array(z.string()).default([]),
  consumedSkillIds: z.array(z.string()).default([]),
});
export type StartupOpeningStrategyDigest = z.infer<typeof StartupOpeningStrategyDigest>;

export const ChapterLengthGuard = z.object({
  triggered: z.boolean(),
  targetWordCount: z.number().int().optional(),
  actualWordCount: z.number().int().nonnegative(),
  allowedMin: z.number().int().nonnegative().optional(),
  allowedMax: z.number().int().nonnegative(),
  direction: z.enum(['under', 'over', 'ok']).optional(),
  summary: z.string(),
  attemptedCompression: z.boolean(),
  attemptedExpansion: z.boolean().optional(),
  usedFallbackTrim: z.boolean(),
  finalWordCount: z.number().int().nonnegative(),
});
export type ChapterLengthGuard = z.infer<typeof ChapterLengthGuard>;

export const AgentTraceEntry = z.object({
  agentRole: z.string(),
  inputChars: z.number().int().nonnegative().optional(),
  systemPromptChars: z.number().int().nonnegative().optional(),
  outputChars: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  skillIds: z.array(z.string()).default([]),
  droppedByBudget: z.number().int().nonnegative().optional(),
  timestamp: z.string().datetime(),
});
export type AgentTraceEntry = z.infer<typeof AgentTraceEntry>;

export const ChapterTitleTrace = z.object({
  candidateTitle: z.string(),
  adopted: z.boolean(),
  currentScore: z.number().nullable().optional(),
  generatedScore: z.number().optional(),
  reasons: z.array(z.string()).default([]),
  fullContentChars: z.number().int().nonnegative(),
  recentTitles: z.array(z.string()).default([]),
  model: z.string().optional(),
  provider: z.string().optional(),
  source: z.enum(['editor', 'title-generator', 'fallback']).optional(),
  updatedAt: z.string().datetime(),
});
export type ChapterTitleTrace = z.infer<typeof ChapterTitleTrace>;

export const ChapterNarrativeAudit = z.object({
  worldMentions: z.array(z.object({
    name: z.string(),
    category: WorldCategory,
    storyRole: WorldStoryRole,
    matchedTerms: z.array(z.string()).default([]),
    usageLevel: z.enum(['mention', 'constraint', 'conflict', 'cost']),
    usedAsConstraint: z.boolean(),
    usedAsConflict: z.boolean(),
    usedAsConsequence: z.boolean(),
    evidence: z.array(z.object({
      kind: z.enum(['constraint', 'conflict', 'cost', 'pressure']),
      term: z.string(),
      signal: z.string(),
      position: z.number().int().nonnegative().optional(),
      snippet: z.string(),
    })).default([]),
  })).default([]),
  characterMentions: z.array(z.object({
    name: z.string(),
    role: CharacterRole,
    hasWantSignal: z.boolean(),
    hasFearSignal: z.boolean(),
    hasPressureSignal: z.boolean(),
    hasChoiceSignal: z.boolean(),
  })).default([]),
  worldPressureScore: z.number().min(0).max(100),
  characterPressureScore: z.number().min(0).max(100),
  effectiveUsageScore: z.number().min(0).max(100),
  issues: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
});
export type ChapterNarrativeAudit = z.infer<typeof ChapterNarrativeAudit>;

export const ChapterReadabilityAudit = z.object({
  readerScore: z.number().min(0).max(10).optional(),
  previousReaderScore: z.number().min(0).max(10).optional(),
  readerScoreDelta: z.number().optional(),
  wordCount: z.number().int().nonnegative(),
  speakerMarkerCount: z.number().int().nonnegative(),
  dialogueCount: z.number().int().nonnegative(),
  paragraphCount: z.number().int().nonnegative(),
  averageParagraphLength: z.number().int().nonnegative(),
  sceneBreakCount: z.number().int().nonnegative(),
  silentReactionCount: z.number().int().nonnegative().optional(),
  silentReactionPer1k: z.number().nonnegative().optional(),
  explanationContrastCount: z.number().int().nonnegative().optional(),
  explanationContrastPer1k: z.number().nonnegative().optional(),
  qualityGateOverall: z.number().min(0).max(100).optional(),
  qualityGateStructure: z.number().min(0).max(100).optional(),
  qualityGateEmotion: z.number().min(0).max(100).optional(),
  genreDrift: GenreDriftAudit.optional(),
  qualityFloorPassed: z.boolean(),
  issues: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
});
export type ChapterReadabilityAudit = z.infer<typeof ChapterReadabilityAudit>;

export const ChapterReaderDeliveryAudit = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  readerScore: z.number().min(0).max(10).optional(),
  previousReaderScore: z.number().min(0).max(10).optional(),
  issues: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  dimensions: z.object({
    title: z.number().min(0).max(100),
    opening: z.number().min(0).max(100),
    promisePayoff: z.number().min(0).max(100),
    readability: z.number().min(0).max(100),
    endingHook: z.number().min(0).max(100),
    publicSurface: z.number().min(0).max(100),
  }),
});
export type ChapterReaderDeliveryAudit = z.infer<typeof ChapterReaderDeliveryAudit>;

export const ChapterMemoryContextAudit = z.object({
  mode: z.literal('observe'),
  retriever: z.enum(['legacy', 'orchestrator']),
  totalChars: z.number().int().nonnegative(),
  promptChars: z.number().int().nonnegative(),
  reusableAnchorCount: z.number().int().nonnegative().optional(),
  reusableAnchorDensity: z.number().nonnegative().optional(),
  unusedPersistedSources: z.array(z.string()).default([]),
  emptyPromptSources: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  sources: z.array(z.object({
    source: z.string(),
    chars: z.number().int().nonnegative(),
    present: z.boolean(),
    usedInPrompt: z.boolean(),
    reusableAnchorCount: z.number().int().nonnegative().optional(),
    reusableAnchorKinds: z.array(z.string()).optional(),
    note: z.string().optional(),
    sections: z.array(z.string()).optional(),
  })).default([]),
});
export type ChapterMemoryContextAudit = z.infer<typeof ChapterMemoryContextAudit>;

export const ChapterTruthFileHealth = z.object({
  mode: z.literal('observe'),
  chapterNumber: z.number().int().positive(),
  hasCurrentState: z.boolean(),
  hasPendingHooks: z.boolean(),
  hasCharacterMatrix: z.boolean(),
  currentStateChapter: z.number().int().positive().nullable(),
  pendingHooksChapter: z.number().int().positive().nullable(),
  aligned: z.boolean(),
  warnings: z.array(z.string()).default([]),
  checkedAt: z.string().datetime(),
});
export type ChapterTruthFileHealth = z.infer<typeof ChapterTruthFileHealth>;

export const ChapterStoryStateTrackerDiagnostic = z.object({
  mode: z.literal('observe'),
  chapterNumber: z.number().int().positive(),
  parsed: z.boolean(),
  outputChars: z.number().int().nonnegative(),
  hasSeparator: z.boolean(),
  hasFence: z.boolean(),
  firstObjectOffset: z.number().int().nullable(),
  extractedJsonChars: z.number().int().nonnegative().optional(),
  failureReason: z.string().optional(),
  headExcerpt: z.string().optional(),
  tailExcerpt: z.string().optional(),
  checkedAt: z.string().datetime(),
});
export type ChapterStoryStateTrackerDiagnostic = z.infer<typeof ChapterStoryStateTrackerDiagnostic>;

export const ChapterMemoryPersistenceAudit = z.object({
  mode: z.literal('observe'),
  chapterNumber: z.number().int().positive(),
  chapterIndexed: z.boolean().optional(),
  digestIndexed: z.boolean().optional(),
  factIndexed: z.boolean().optional(),
  threadIndexed: z.boolean().optional(),
  threadIndexStatus: z.enum(['indexed', 'no-snapshots', 'failed']).optional(),
  threadSnapshotCount: z.number().int().nonnegative().optional(),
  truthFilesAligned: z.boolean().optional(),
  digestFailureStage: z.enum(['parse', 'generation', 'index']).optional(),
  digestOutputChars: z.number().int().nonnegative().optional(),
  digestOutputHead: z.string().optional(),
  digestOutputTail: z.string().optional(),
  warnings: z.array(z.string()).default([]),
  updatedAt: z.string().datetime(),
});
export type ChapterMemoryPersistenceAudit = z.infer<typeof ChapterMemoryPersistenceAudit>;

export const ChapterQualityGateDigest = z.object({
  overallScore: z.number().min(0).max(100).optional(),
  structureScore: z.number().min(0).max(100).optional(),
  styleScore: z.number().min(0).max(100).optional(),
  emotionScore: z.number().min(0).max(100).optional(),
  passed: z.boolean().optional(),
  summary: z.string().optional(),
  findings: z.array(z.object({
    code: z.string(),
    level: z.enum(['warn', 'error']),
    message: z.string(),
  })).default([]),
});
export type ChapterQualityGateDigest = z.infer<typeof ChapterQualityGateDigest>;

export const ChapterWorldGateDigest = z.object({
  gateMode: z.enum(['off', 'warn', 'strict']),
  requiredTotal: z.number().int().nonnegative(),
  requiredHit: z.number().int().nonnegative(),
  missingRequired: z.array(z.string()).default([]),
  unsourcedTerms: z.array(z.string()).default([]),
  hasViolations: z.boolean(),
  passed: z.boolean(),
  summary: z.string(),
  findings: z.array(z.object({
    code: z.enum(['missing-required', 'unsourced-world-term', 'shallow-required', 'contradicted-rule']),
    level: z.enum(['warn', 'error']),
    message: z.string(),
    entryName: z.string().optional(),
    term: z.string().optional(),
  })).default([]),
  repairAttempted: z.boolean(),
  repairApplied: z.boolean(),
  checkedAt: z.string().datetime(),
});
export type ChapterWorldGateDigest = z.infer<typeof ChapterWorldGateDigest>;

export const ChapterAutoRevisionDigest = z.object({
  triggered: z.boolean(),
  rounds: z.number().int().nonnegative(),
  initialScore: z.number(),
  finalScore: z.number(),
  accepted: z.boolean().optional(),
  reason: z.string().optional(),
  selectedRound: z.number().int().nonnegative().optional(),
  readerDeliveryInitialScore: z.number().optional(),
  readerDeliveryFinalScore: z.number().optional(),
  readerDeliveryPassed: z.boolean().optional(),
});
export type ChapterAutoRevisionDigest = z.infer<typeof ChapterAutoRevisionDigest>;

export const ChapterGenerationLifecycle = z.object({
  mode: z.literal('observe'),
  phase: z.enum(['draft', 'final', 'failed']),
  saveFirstMode: z.boolean().optional(),
  chapterStatus: ChapterStatus.optional(),
  warnings: z.array(z.string()).default([]),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  retryable: z.boolean().optional(),
  updatedAt: z.string().datetime(),
});
export type ChapterGenerationLifecycle = z.infer<typeof ChapterGenerationLifecycle>;

export const ChapterUserDirectionAnchorAudit = z.object({
  mode: z.literal('observe'),
  anchors: z.array(z.string()).default([]),
  presentAnchors: z.array(z.string()).default([]),
  missingAnchors: z.array(z.string()).default([]),
  coverage: z.number().min(0).max(1),
  shouldRepair: z.boolean(),
  directionChars: z.number().int().nonnegative().optional(),
  contentChars: z.number().int().nonnegative().optional(),
  sourceHash: z.string().optional(),
  directionPreview: z.string().optional(),
  stage: z.enum(['outline', 'draft', 'final', 'revision']).optional(),
  warnings: z.array(z.string()).default([]),
  checkedAt: z.string().datetime(),
});
export type ChapterUserDirectionAnchorAudit = z.infer<typeof ChapterUserDirectionAnchorAudit>;

export const ChapterDiagnostics = z.object({
  startupOpeningStrategy: StartupOpeningStrategyDigest.optional(),
  startupOpeningReport: StartupOpeningGateReport.optional(),
  startupOpeningGateRewrite: StartupOpeningGateRewrite.optional(),
  chapterLengthGuard: ChapterLengthGuard.optional(),
  agentTrace: z.array(AgentTraceEntry).default([]).optional(),
  titleTrace: ChapterTitleTrace.optional(),
  narrativeAudit: ChapterNarrativeAudit.optional(),
  readabilityAudit: ChapterReadabilityAudit.optional(),
  readerDeliveryAudit: ChapterReaderDeliveryAudit.optional(),
  memoryContextAudit: ChapterMemoryContextAudit.optional(),
  truthFileHealth: ChapterTruthFileHealth.optional(),
  storyStateTracker: ChapterStoryStateTrackerDiagnostic.optional(),
  memoryPersistenceAudit: ChapterMemoryPersistenceAudit.optional(),
  qualityGate: ChapterQualityGateDigest.optional(),
  worldGate: ChapterWorldGateDigest.optional(),
  autoRevision: ChapterAutoRevisionDigest.optional(),
  generationLifecycle: ChapterGenerationLifecycle.optional(),
  userDirectionAnchorAudit: ChapterUserDirectionAnchorAudit.optional(),
  updatedAt: z.string().datetime(),
});
export type ChapterDiagnostics = z.infer<typeof ChapterDiagnostics>;

export const Chapter = z.object({
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  title: z.string().default(''),
  content: z.string().default(''),
  wordCount: z.number().int().default(0),
  status: ChapterStatus.default('outlined'),
  outline: ChapterOutline.optional(),
  agentComments: z.array(AgentComment).default([]),
  readerScore: z.number().min(0).max(10).optional(),
  revisionCount: z.number().int().default(0),
  /** 定稿时 LLM 生成的 200-300 字前情提要 */
  summary: z.string().default(''),
  scenes: z.array(Scene).optional(),
  sceneMode: z.boolean().optional(),
  diagnostics: ChapterDiagnostics.optional(),
  /** 作者有话说（章末互动短文，最多保留 20 条） */
  authorNotes: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Chapter = z.infer<typeof Chapter>;

// ==================== 宪章版本历史 ====================

export const ConstitutionVersionSource = z.enum([
  'generate',
  'manual-save',
  'auto-bootstrap',
  'kickstart',
  'rollback',
]);
export type ConstitutionVersionSource = z.infer<typeof ConstitutionVersionSource>;

export const ConstitutionVersion = z.object({
  version: z.number().int().positive(),
  source: ConstitutionVersionSource,
  constitution: NovelConstitution,
  createdAt: z.string().datetime(),
});
export type ConstitutionVersion = z.infer<typeof ConstitutionVersion>;

export const ConstitutionVersionHistory = z.object({
  novelId: z.string().uuid(),
  versions: z.array(ConstitutionVersion).default([]),
  maxVersions: z.number().int().default(20),
});
export type ConstitutionVersionHistory = z.infer<typeof ConstitutionVersionHistory>;

// ==================== 章节版本历史 ====================

export const VersionSource = z.enum([
  'generate',     // AI 生成
  'revise',       // AI 修订
  'resize',       // 缩写/扩写
  'manual-save',  // 用户手动保存
  'finalize',     // 定稿
  'rollback',     // 回滚操作
  'delete',       // 删除前备份
]);
export type VersionSource = z.infer<typeof VersionSource>;

export const ChapterVersion = z.object({
  version: z.number().int().positive(),
  content: z.string(),
  title: z.string().default(''),
  wordCount: z.number().int().default(0),
  status: ChapterStatus,
  readerScore: z.number().min(0).max(10).optional(),
  revisionCount: z.number().int().default(0),
  source: VersionSource,
  createdAt: z.string().datetime(),
});
export type ChapterVersion = z.infer<typeof ChapterVersion>;

export const ChapterVersionHistory = z.object({
  novelId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  versions: z.array(ChapterVersion).default([]),
  maxVersions: z.number().int().default(20),
});
export type ChapterVersionHistory = z.infer<typeof ChapterVersionHistory>;

// ==================== 角色事件记忆链 ====================

export const CharacterEventType = z.enum([
  'action',       // 主动行为
  'encounter',    // 遭遇/被动事件
  'relationship', // 关系变化
  'revelation',   // 认知/发现
  'achievement',  // 成就/突破
  'loss',         // 失去/挫折
]);
export type CharacterEventType = z.infer<typeof CharacterEventType>;

export const CharacterEvent = z.object({
  id: z.string().uuid(),
  characterId: z.string().uuid(),
  chapterNumber: z.number().int().positive(),
  summary: z.string(),
  type: CharacterEventType,
  relatedCharacterIds: z.array(z.string().uuid()).default([]),
  importance: z.number().int().min(1).max(5).default(3),
  createdAt: z.string().datetime(),
});
export type CharacterEvent = z.infer<typeof CharacterEvent>;

// ==================== 章节事实快照（连贯性检查）====================

export const ItemStatus = z.enum(['obtained', 'used', 'lost', 'destroyed', 'mentioned']);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const ChapterFact = z.object({
  timeOfDay: z.string().default(''),
  weather: z.string().default(''),
  locations: z.array(z.string()).default([]),
  characterPositions: z.array(z.object({
    characterId: z.string().uuid(),
    characterName: z.string(),
    location: z.string(),
  })).default([]),
  items: z.array(z.object({
    name: z.string(),
    status: ItemStatus,
  })).default([]),
  timelineMarker: z.string().default(''),
});
export type ChapterFact = z.infer<typeof ChapterFact>;

// ==================== 章节节奏分析 ====================

export const PacingProfile = z.object({
  dialogue: z.number().min(0).max(1).default(0),
  action: z.number().min(0).max(1).default(0),
  description: z.number().min(0).max(1).default(0),
  psychology: z.number().min(0).max(1).default(0),
  narration: z.number().min(0).max(1).default(0),
});
export type PacingProfile = z.infer<typeof PacingProfile>;

export const ChapterPacing = z.object({
  chapterNumber: z.number().int().positive(),
  profile: PacingProfile,
  dominantType: z.string(),
  monotonyWarning: z.boolean().default(false),
  analyzedAt: z.string().datetime(),
});
export type ChapterPacing = z.infer<typeof ChapterPacing>;

// ==================== 情节线追踪快照 ====================

export const PlotThreadSnapshotStatus = z.enum([
  'new',         // 本章新开
  'advanced',    // 本章推进
  'mentioned',   // 本章提及但未推进
  'dormant',     // 本章未出现
  'resolved',    // 本章收束
]);
export type PlotThreadSnapshotStatus = z.infer<typeof PlotThreadSnapshotStatus>;

export const PlotThreadSnapshot = z.object({
  threadId: z.string(),
  threadName: z.string(),
  chapterNumber: z.number().int().positive(),
  status: PlotThreadSnapshotStatus,
  detail: z.string().default(''),
  dormantChapters: z.number().int().nonnegative().default(0),
});
export type PlotThreadSnapshot = z.infer<typeof PlotThreadSnapshot>;

// ==================== 角色弧线追踪 ====================

export const CharacterArcPoint = z.object({
  characterId: z.string(),
  characterName: z.string(),
  chapterNumber: z.number().int().positive(),
  emotionalState: z.number().min(-5).max(5).default(0),
  powerLevel: z.number().min(0).max(10).default(0),
  relationshipDelta: z.number().min(-3).max(3).default(0),
  keyEvent: z.string().default(''),
  eventType: CharacterEventType.optional(),
});
export type CharacterArcPoint = z.infer<typeof CharacterArcPoint>;

// ==================== 大纲偏离度检测 ====================

export const OutlineDeviation = z.object({
  chapterNumber: z.number().int().positive(),
  alignmentScore: z.number().min(0).max(100).default(100),
  keyEventHits: z.number().int().nonnegative().default(0),
  keyEventTotal: z.number().int().nonnegative().default(0),
  missedEvents: z.array(z.string()).default([]),
  unexpectedElements: z.array(z.string()).default([]),
  summary: z.string().default(''),
});
export type OutlineDeviation = z.infer<typeof OutlineDeviation>;
