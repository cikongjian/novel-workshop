import { computed, type Ref } from 'vue';
import { AGENT_COLORS, AGENT_NAMES, type AgentRole } from '../types';
import { extractProgressLines } from '../utils/agent-progress';
import type { PolledAgentStatus } from './useNovelGenerationStatusPolling';

/**
 * 移动端「沉浸式 Agent 直播流」的数据源。
 *
 * 与早期版本的根本差异：不再硬编码"标准管线 6 节点"，而是**基于后端真实
 * agentStatuses 动态构建节点**，从而忠实反映当前实际触发的管线
 * （chapter / shuangwen / short-story / revision / finalize / batch-revision / rebirth 等）。
 *
 * 排序策略：内置一张覆盖 7 种管线所有出现过的 Agent 的"典型执行优先级表"，
 * 命中的按表排序，未命中的（未来扩展的 Agent）按后端返回顺序兜底追加。
 */

export type AgentNodeStatus = 'idle' | 'working' | 'done' | 'error';

export interface AgentLiveBubble {
  role: AgentRole;
  label: string;
  color: string;
  status: AgentNodeStatus;
  /** 从 Agent 流式输出中抽取的人类可读进度文案（最多 2 条，已去噪） */
  progressLines: string[];
  /** 该 Agent 本轮的 token 用量（若可获取） */
  tokenUsage?: { input: number; output: number };
}

export interface AgentLiveFeed {
  /** 当前生成章节号（未开始时为 null） */
  chapterNumber: number | null;
  isGenerating: boolean;
  /** 任务已提交但首个 Agent 尚未启动 */
  pendingStart: boolean;
  /** 推断出的管线类型 */
  pipelineKind: PipelineKind;
  /** 当前实际参与本轮管线的所有节点（按典型执行顺序排序） */
  nodes: AgentLiveBubble[];
  /** 当前正在工作的 Agent（用于头部高亮） */
  activeRole: AgentRole | null;
  /** 已完成节点数 / 总节点数 */
  completedCount: number;
  totalCount: number;
  /** 最近一次失败信息（无失败则为 null） */
  failureMessage: string | null;
}

export type PipelineKind =
  | 'unknown'
  | 'chapter'
  | 'shuangwen-blueprint'
  | 'shuangwen-chapter'
  | 'short-story'
  | 'revision'
  | 'finalize-full'
  | 'batch-revision'
  | 'rebirth';

/**
 * 全管线 Agent 典型执行优先级表（数值越小越靠前）。
 * 汇总自后端 7 种管线的实际调用顺序：
 *  - chapter-pipeline / shuangwen-pipeline / short-story-pipeline
 *  - revision-pipeline / finalize-pipeline / batch-revision-pipeline / rebirth-pipeline
 * 占位角色 writing-assistant 排最前（它往往是管线启动前的衔接播报）。
 */
const AGENT_PRIORITY: Partial<Record<AgentRole, number>> = {
  // 占位 / 启动播报
  'writing-assistant': 0,
  'shuangwen-planner': 1,
  'novel-blueprint-extractor': 2,
  // 策划 / 大纲阶段
  'outline-generator': 10,
  outline: 11,
  'opening-supervisor': 12,
  'foreshadowing-scheduler': 13,
  // 世界 / 角色 / 力量 / 势力（并行组）
  'world-builder': 20,
  character: 21,
  'character-merger': 22,
  'world-merger': 23,
  'plot-analyst': 24,
  // 正文
  writer: 30,
  'batch-reviser': 31,
  // 润色
  editor: 40,
  'dialogue-polisher': 41,
  'plot-explorer': 42,
  'plot-line-extractor': 43,
  // 质检
  reader: 50,
  // 营销 / 周边
  'marketing-writer': 60,
  'author-note-writer': 61,
};

/** 进度文案最大展示条数（控制气泡高度） */
const MAX_PROGRESS_LINES = 2;

/** 后端 agentStatuses 中的伪角色（非真实 Agent，仅作阶段播报） */
const PSEUDO_ROLES = new Set<AgentRole>(['writing-assistant', 'shuangwen-planner']);

/** 各管线特征角色，用于推断管线类型 */
const PIPELINE_SIGNATURES: Array<{ kind: PipelineKind; roles: AgentRole[] }> = [
  { kind: 'shuangwen-blueprint', roles: ['outline-generator', 'marketing-writer'] },
  { kind: 'finalize-full', roles: ['character-merger', 'world-merger', 'plot-analyst'] },
  { kind: 'batch-revision', roles: ['batch-reviser', 'plot-line-extractor'] },
  { kind: 'rebirth', roles: ['novel-blueprint-extractor'] },
  { kind: 'short-story', roles: ['outline', 'writer', 'editor'] },
  { kind: 'revision', roles: ['writer', 'editor', 'reader'] },
  { kind: 'shuangwen-chapter', roles: ['outline', 'world-builder', 'writer'] },
  { kind: 'chapter', roles: ['outline', 'world-builder', 'character', 'writer', 'editor', 'reader'] },
];

function detectPipelineKind(activeRoles: readonly AgentRole[], statuses: ReadonlyMap<AgentRole, PolledAgentStatus>): PipelineKind {
  const allRoles = new Set<AgentRole>([...activeRoles, ...statuses.keys()]);
  for (const sig of PIPELINE_SIGNATURES) {
    if (sig.roles.every((r) => allRoles.has(r))) {
      return sig.kind;
    }
  }
  return 'unknown';
}

function mapStatus(s: PolledAgentStatus | undefined): AgentNodeStatus {
  if (s === 'active') return 'working';
  if (s === 'done') return 'done';
  if (s === 'error') return 'error';
  return 'idle';
}

function sortByPriority(roles: AgentRole[]): AgentRole[] {
  // 稳定排序：命中优先级表的按优先级排，未命中的保持原顺序追加在末尾
  const indexed = roles.map((role, idx) => ({ role, idx, p: AGENT_PRIORITY[role] }));
  indexed.sort((a, b) => {
    const pa = a.p;
    const pb = b.p;
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return a.idx - b.idx;
  });
  return indexed.map((x) => x.role);
}

export interface UseAgentLiveFeedOptions {
  /** 当前小说 ID（响应式） */
  novelId: Ref<string>;
  /** 任务已提交但首个 Agent 尚未启动（用于展示"拉起中"占位） */
  pendingStart?: Ref<boolean> | boolean;
  /**
   * 后端真实 agentStatuses（来自 generation-status 轮询）。
   * 这是节点列表的唯一权威来源。
   */
  agentStatuses: Ref<Record<string, PolledAgentStatus> | null | undefined>;
  /** 当前生成中的章节号（可选，来自外部上下文） */
  chapterNumber?: Ref<number | null>;
  /** 最近一次失败信息（可选） */
  failureMessage?: Ref<string | null>;
  /**
   * writing-assistant 占位角色的流式输出（后端单独字段），
   * 用于在伪角色气泡里展示衔接播报文案。
   */
  writingAssistantOutput?: Ref<string | null | undefined>;
}

/**
 * @param opts - 见 UseAgentLiveFeedOptions
 */
export function useAgentLiveFeed(opts: UseAgentLiveFeedOptions) {
  const pendingStart = computed(() =>
    typeof opts.pendingStart === 'object' ? opts.pendingStart.value : (opts.pendingStart ?? false),
  );

  const feed = computed<AgentLiveFeed>(() => {
    const statusesMap = opts.agentStatuses.value ?? {};
    const statusesEntries = Object.entries(statusesMap) as Array<[AgentRole, PolledAgentStatus]>;
    const statusesOrderedMap = new Map<AgentRole, PolledAgentStatus>(statusesEntries);

    // 节点 = 真实出现过的所有角色，按典型执行顺序排序
    const roles = sortByPriority(statusesEntries.map(([r]) => r));

    const isPseudoOnly = roles.length > 0 && roles.every((r) => PSEUDO_ROLES.has(r));
    const assistantOutput = opts.writingAssistantOutput?.value ?? '';
    const nodes: AgentLiveBubble[] = roles.map((role) => {
      const status = mapStatus(statusesOrderedMap.get(role));
      // 仅 writing-assistant 占位角色用 writingAssistantOutput 填充进度文案；
      // 真实 Agent 的逐 token 输出在移动端轮询模式下不可见（后端只透传 assistant 的聚合输出）
      const progressLines = role === 'writing-assistant' && assistantOutput
        ? extractProgressLines(assistantOutput).slice(-MAX_PROGRESS_LINES)
        : [];
      return {
        role,
        label: AGENT_NAMES[role] ?? role,
        color: AGENT_COLORS[role] ?? '#0ea5e9',
        status,
        progressLines,
      };
    });

    // 当前活跃角色：优先选非伪角色，避免占位角色覆盖真实 Agent
    const activeRoles = roles.filter((r) => statusesOrderedMap.get(r) === 'active');
    const activeRole = activeRoles.find((r) => !PSEUDO_ROLES.has(r)) ?? activeRoles[0] ?? null;

    const completedCount = nodes.filter((n) => n.status === 'done').length;
    const pipelineKind = detectPipelineKind(roles, statusesOrderedMap);
    const hasActive = statusesEntries.some(([, s]) => s === 'active');

    return {
      chapterNumber: opts.chapterNumber?.value ?? null,
      isGenerating: hasActive || (!isPseudoOnly && nodes.length > 0),
      pendingStart: pendingStart.value && nodes.length === 0,
      pipelineKind,
      nodes,
      activeRole,
      completedCount,
      totalCount: nodes.length,
      failureMessage: opts.failureMessage?.value ?? null,
    };
  });

  return { feed };
}
