/**
 * 互动小说（Interactive Novel）类型定义。
 *
 * 本模块定义互动小说相关的数据结构：作者配置、轮次状态、阶段状态机、
 * AI 生成的富投票选项。这些类型是 src/interactive/ 下各模块共享的契约。
 *
 * 设计原则：所有字段持久化到 novel.json 的 interactiveConfig 字段，
 * 调度器进程重启后可从持久化状态恢复。
 */

/** 互动小说推进阶段状态机 */
export type InteractivePhase =
  /** 已开启但未启动（等待作者点"开始第一轮"，或前置条件不满足） */
  | 'idle'
  /** 正在生成本轮章节 */
  | 'generating'
  /** 正在发布本轮章节到书城 */
  | 'publishing'
  /** 投票进行中（voteDeadline 记录截止时刻） */
  | 'vote_open'
  /** 投票已截止，正在计票/判定 */
  | 'vote_closing'
  /** 已采纳胜出走向，准备下一轮生成 */
  | 'advancing'
  /** 停滞（票数不足或生成失败，等待作者干预） */
  | 'stalled';

/** 单轮互动历史记录 */
export interface InteractiveRoundHistory {
  /** 轮次序号（从 1 开始） */
  round: number;
  /** 本轮起始章节号 */
  startChapter: number;
  /** 本轮章节数量 */
  chapterCount: number;
  /** 投票问题 */
  question: string;
  /** 胜出走向描述（未采纳则为空） */
  winningDirection: string;
  /** 总票数 */
  totalVotes: number;
  /** 状态：completed（已完成并推进）/ stalled（停滞）/ manual（作者手动指定走向） */
  outcome: 'completed' | 'stalled' | 'manual';
  /** 完成时间戳（ms） */
  finishedAt: number;
}

/** 互动小说配置（挂在 NovelMetadata.interactiveConfig） */
export interface InteractiveConfig {
  /** 是否启用互动模式（主开关，区别于 paused） */
  enabled: boolean;
  /** 每轮发布的章节数量（1-5） */
  chaptersPerRound: number;
  /** 每轮投票持续时长（小时，12/24/48/72） */
  voteDurationHours: number;
  /** 最低推进票数阈值（低于此值则停止推进） */
  minVotesToAdvance: number;
  /** 是否暂停自动推进（作者手动暂停，enabled 仍为 true） */
  paused: boolean;
  /** 当前推进阶段 */
  phase: InteractivePhase;
  /** 当前轮次序号（从 1 开始，0 表示尚未开始） */
  currentRound: number;
  /** 当前轮次起始章节号 */
  currentRoundStartChapter: number;
  /** 当前轮次投票截止时间戳（ms，仅 vote_open 阶段有效） */
  currentVoteDeadline?: number;
  /** 当前轮次关联的 VotePoint ID（仅 vote_open/vote_closing 阶段有效） */
  currentVotePointId?: string;
  /** 上一轮胜出的走向描述（注入下一轮生成的 userDirection） */
  lastWinningDirection?: string;
  /** 历史轮次记录（最多保留 50 条） */
  history: InteractiveRoundHistory[];
}

/** 互动小说配置的默认值（开启时使用） */
export const DEFAULT_INTERACTIVE_CONFIG: Omit<InteractiveConfig, 'enabled'> = {
  chaptersPerRound: 1,
  voteDurationHours: 24,
  minVotesToAdvance: 3,
  paused: false,
  phase: 'idle',
  currentRound: 0,
  currentRoundStartChapter: 0,
  history: [],
};

/** 章节每轮章节数量合法取值 */
export const CHAPTERS_PER_ROUND_OPTIONS = [1, 2, 3] as const;

/** 投票持续时长合法取值（小时） */
export const VOTE_DURATION_OPTIONS = [12, 24, 48, 72] as const;

/** 最低推进票数阈值合法取值范围 */
export const MIN_VOTES_RANGE = { min: 0, max: 100 } as const;

/** 历史记录保留上限 */
export const MAX_HISTORY_ENTRIES = 50;

/**
 * AI 生成的富投票选项（来自 PlotExplorerAgent）。
 * 与 VoteOption（简单 id+text）一一对应，但额外携带展示用的风险等级、影响预测等。
 */
export interface EnrichedVoteOption {
  /** 对应 VoteOption.id（由 VoteService 生成的 UUID） */
  optionId: string;
  /** 简洁标题（≤20 字，用于投票按钮） */
  title: string;
  /** 详细描述（100-300 字，用于展开说明） */
  description: string;
  /** 风险等级（low/medium/high，提示读者"这个走向风险大"） */
  riskLevel: 'low' | 'medium' | 'high';
  /** 影响预测（可选，告诉读者这个走向会带来什么后果） */
  impactPrediction?: string;
  /** 对角色的影响（可选，{角色名: 影响} 列表） */
  characterImpacts?: Array<{ name: string; impact: string }>;
}

/** 校验章节数配置是否合法 */
export function isValidChaptersPerRound(value: number): boolean {
  return (CHAPTERS_PER_ROUND_OPTIONS as readonly number[]).includes(value);
}

/** 校验投票时长配置是否合法 */
export function isValidVoteDuration(value: number): boolean {
  return (VOTE_DURATION_OPTIONS as readonly number[]).includes(value);
}

/** 校验最低票数配置是否合法 */
export function isValidMinVotes(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_VOTES_RANGE.min && value <= MIN_VOTES_RANGE.max;
}
