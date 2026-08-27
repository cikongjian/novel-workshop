import type { ModelClient, StreamCallback } from '../models/types.js';

export type AgentRole =
  | 'world-builder'
  | 'character'
  | 'outline'
  | 'opening-supervisor'
  | 'writer'
  | 'editor'
  | 'reader'
  | 'character-merger'
  | 'world-merger'
  | 'plot-analyst'
  | 'voice-designer'
  | 'foreshadowing-curator'
  | 'culture-curator'
  | 'history-curator'
  | 'power-gradient-designer'
  | 'power-correlation-analyst'
  | 'power-world-integrator'
  | 'faction-culture-architect'
  | 'faction-inheritance-designer'
  | 'faction-motive-mission-planner'
  | 'outline-generator'
  | 'plot-explorer'
  | 'dialogue-polisher'
  | 'marketing-writer'
  | 'writing-assistant'
  | 'title-generator'
  | 'chapter-digest'
  | 'arc-summary'
  | 'foreshadowing-scheduler'
  | 'resizer'
  | 'story-state-tracker'
  | 'plot-line-extractor'
  | 'batch-reviser'
  | 'novel-blueprint-extractor'
  | 'anchor-curator'
  | 'shuangwen-planner'
  | 'outline-analyzer'
  | 'book-title-recommender'
  | 'author-note-writer'
  | 'synopsis-generator'
  | 'name-generator'
  | 'character-moments'
  | 'constitution-master'
  | 'card-blurb-writer'
  | 'comic-beat-extractor'
  | 'comic-storyboard-designer'
  | 'comic-prompt-engineer'
  | 'character-dna-extractor';

export const AGENT_NAMES: Record<AgentRole, string> = {
  'world-builder': '世界构建师',
  'character': '角色塑造师',
  'outline': '故事架构师',
  'opening-supervisor': '开篇三章总监',
  'writer': '写手',
  'editor': '编辑',
  'reader': '读者',
  'character-merger': '角色档案专家',
  'world-merger': '世界观专家',
  'plot-analyst': '剧情分析师',
  'voice-designer': 'AI 音效师',
  'foreshadowing-curator': '伏笔梳理师',
  'culture-curator': '文化设定梳理师',
  'history-curator': '历史线梳理师',
  'power-gradient-designer': '力量梯度细化师',
  'power-correlation-analyst': '力量相关性分析师',
  'power-world-integrator': '力量世界嵌入师',
  'faction-culture-architect': '势力文化架构师',
  'faction-inheritance-designer': '势力传承设计师',
  'faction-motive-mission-planner': '势力动机任务策划师',
  'outline-generator': '大纲生成师',
  'plot-explorer': '剧情探索师',
  'dialogue-polisher': '对话打磨师',
  'marketing-writer': '营销文案师',
  'writing-assistant': '写作助手',
  'title-generator': '标题策划师',
  'chapter-digest': '章节摘要师',
  'arc-summary': '弧线摘要师',
  'foreshadowing-scheduler': '伏笔编排大师',
  'resizer': '缩写扩写大师',
  'story-state-tracker': '故事状态追踪师',
  'plot-line-extractor': '主线提取师',
  'batch-reviser': '批量修订师',
  'novel-blueprint-extractor': '蓝本提取师',
  'anchor-curator': '宇宙锚点策展师',
  'shuangwen-planner': '爽文策划师',
  'outline-analyzer': '大纲分析师',
  'book-title-recommender': '书名推荐师',
  'author-note-writer': '作者有话说助手',
  'synopsis-generator': '作品介绍生成器',
  'name-generator': '角色命名大师',
  'character-moments': '角色朋友圈生成器',
  'constitution-master': '世界观宪章大师',
  'card-blurb-writer': '卡牌标签写手',
  'comic-beat-extractor': '漫画剧情挖掘师',
  'comic-storyboard-designer': '漫画分镜师',
  'comic-prompt-engineer': '漫画出图提示词工程师',
  'character-dna-extractor': '角色DNA提取师',
};

export type SynopsisChapterSummary = {
  chapterNumber: number;
  title: string;
  summary: string;
};

export type SynopsisCharacter = {
  name: string;
  role: string;
  backstory?: string;
  motivation?: string;
  abilities?: string[];
};

export type SynopsisWorldEntry = {
  name: string;
  category: string;
  description: string;
};

export type SynopsisOutlineThread = {
  name: string;
  description: string;
  status: string;
};

export type SynopsisOutlineContext = {
  plotThreads?: SynopsisOutlineThread[];
};

export type AgentContext = {
  novelId: string;
  genre: string;
  novelTitle: string;
  novelSynopsis: string;
  novelTags?: string[];
  constitutionTags?: string[];
  /** synopsis-generator 兼容字段 */
  synopsis?: string;
  chapterNumber?: number;
  worldContext?: string;
  /** 世界构建师提供的单章执行参考，不属于正史硬约束。 */
  worldBuilderGuidance?: string;
  characterContext?: string;
  outlineContext?: string;
  /** synopsis-generator 使用的结构化上下文 */
  chapterSummaries?: SynopsisChapterSummary[];
  characters?: SynopsisCharacter[];
  worldEntries?: SynopsisWorldEntry[];
  outline?: SynopsisOutlineContext;
  previousChapterSummary?: string;
  unresolvedForeshadowing?: string;
  userDirection?: string;
  stylePreset?: string;
  startupPlatformProfile?: 'auto' | 'fanqie' | 'qidian';
  /** 题材承诺合同摘要（告诉 Agent 这本书真正卖什么） */
  promiseContractSummary?: string;
  /** 开头阶段必须兑现的题材提示 */
  promiseOpeningHints?: string;
  /** 前段必须出现的题材回报提示 */
  promisePayoffHints?: string;
  /** 防止写偏成悬疑/解谜的约束 */
  promiseAntiDriftHints?: string;
  /** 章节承诺卡（章节级硬约束，优先于通用节奏模板） */
  chapterPromiseCard?: string;
  /** 章节承诺门禁修复提示 */
  chapterPromiseGateFixHints?: string;
  /** 开篇三章规则整理结果（已去重后的统一 brief） */
  startupOpeningStrategyBrief?: string;
  /** 章节正文最大字数（可选） */
  maxWordCount?: number;
  styleGuide?: string;
  scenePlan?: string;
  outlineContract?: string;
  worldContract?: string;
  worldGateFixHints?: string;
  outlineGateFixHints?: string;
  qualityGateFixHints?: string;
  commercialGateFixHints?: string;
  startupOpeningGateFixHints?: string;
  consistencyGuardrails?: string;
  antiTemplateRules?: string;
  /** Editor/Reader Agent 使用：需要处理的原始文本 */
  inputText?: string;
  /** 角色事件时间线上下文 */
  characterEventContext?: string;
  /** 连贯性门禁修复提示 */
  continuityGateFixHints?: string;
  /** AI 痕迹门禁修复提示 */
  aiTraceFixHints?: string;
  /** 逾期伏笔提醒 */
  foreshadowingHints?: string;
  /** 节奏变化提示 */
  pacingHints?: string;
  /** 文化设定的剧情钩子提示 */
  cultureStoryHooks?: string;
  /** 势力动态（长期未出场势力的主动议程推进） */
  factionFronts?: string;
  /** 情节线依赖图提示（前置/并行/合流关系） */
  plotThreadGraphHints?: string;
  /** Reader 反馈（用于自动修订闭环） */
  readerFeedback?: string;
  /** 爽文蓝图规则（循环公式/钩子规则/禁区/文风） */
  shuangwenRules?: string;
  /** 爽文门禁修复提示（注入 Editor） */
  shuangwenGateFixHints?: string;
  /** 对话打磨的目标角色列表 */
  dialogueTargetCharacters?: string;
  /** 缩写/扩写模式（影响字数约束措辞） */
  resizeMode?: 'compress' | 'expand';
  /** 缩写/扩写前的原文字数 */
  originalWordCount?: number;
  /** 温度覆盖（自适应温度） */
  temperatureOverride?: number;
  /** Scene-level generation context */
  sceneNumber?: number;
  sceneSummary?: string;
  sceneCharacters?: string;
  sceneLocation?: string;
  sceneTensionTarget?: number;
  sceneWordTarget?: number;
  previousSceneContent?: string;
  fullScenePlan?: string;
  /** 故事状态机上下文（硬约束） */
  storyStateContext?: string;
  /** 因果链优先级提示（紧急待兑现的因果） */
  causalChainHints?: string;
  /** 角色信念演化提示 */
  beliefEvolutionHints?: string;
  /** 张力曲线规划提示 */
  tensionCurveHints?: string;
  /** 角色弧线停滞提示 */
  characterStallHints?: string;
  /** 系列作品上下文（跨书传递） */
  seriesContext?: string;
  /** 宇宙作品上下文（跨作品关系） */
  universeContext?: string;
  /** 宇宙锚点上下文（共享宇宙设定） */
  anchorContext?: string;
  /** 角色关系演化提示 */
  relationshipEvolutionHints?: string;
  /** 角色语言漂移警告 */
  voiceDriftHints?: string;
  /** 章节规划顾问建议 */
  chapterAdviceContext?: string;
  /** 直接交付给写手和编辑的正文验收合同 */
  readerDeliveryContract?: string;
  /** 目标总章数（用户设定后才有值） */
  totalPlannedChapters?: number;
  /** 是否启用标题点题引导 */
  titleGuidance?: boolean;
  /** 重复感知描写多样化提示 */
  recurringDescriptionHints?: string;
  /** 章节开头多样化提示 */
  chapterOpeningHints?: string;
  /** 爽点/情绪高潮密度提示 */
  payoffDensityHints?: string;
  /** 智能门禁提示（来自上一章的检测发现，指导本章避免同类问题） */
  smartGateHints?: string;
  /** 反套路化提示（数据驱动，从历史章节统计得出） */
  antiClicheHints?: string;
  /** 创作宪法（设定基线，confirmed 后注入）：不可漂移的设定骨架 */
  baselineContext?: string;
  /** 角色命名约束（AI模板黑名单 + 跨小说避让名单 + 姓氏建议），由智能取名系统注入 */
  namingConstraints?: string;
  /** 已有的"作者有话说"条目（用于反重复） */
  existingAuthorNotes?: string[];
  /** 章节重要性类型（高潮/转折/解决等，由 key-chapter-scorer 判定） */
  chapterKeyType?: string;
  /** 自定义指令（Agent Skills 系统注入） */
  customInstructions?: string;
  /** 启用结构化审计维度输出（Reader Agent） */
  useStructuredAudit?: boolean;
  /** Spot-Fix 模式：只修改用户指出的问题句/段落 */
  spotFixMode?: boolean;
};

export type AgentOutput = {
  agentRole: AgentRole;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
};

export type AgentEvent = {
  type: 'agent:start' | 'agent:chunk' | 'agent:complete' | 'agent:error' | 'pipeline:complete' | 'revision:start' | 'revision:complete' | 'curator:auto-trigger' | 'finalize:mode' | 'novel:metadata-updated';
  agentRole: AgentRole;
  novelId: string;
  chapterNumber?: number;
  data: string;
  timestamp: string;
  /** Token usage for agent:complete events (when available) */
  usage?: { inputTokens: number; outputTokens: number; provider?: string; model?: string };
};

export interface NovelAgent {
  readonly role: AgentRole;
  readonly name: string;
  readonly description: string;

  execute(
    context: AgentContext,
    model: ModelClient,
    onChunk?: StreamCallback,
    signal?: AbortSignal,
  ): Promise<AgentOutput>;
}
