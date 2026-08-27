import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import type { AgentRole, AgentEvent, BatchEvent, BatchJobItem, BatchJobStatus, BatchFinalizeEvent, BatchFinalizeItem } from '../types';
import { fetchBatchStatus } from '../api';

export interface ChapterCostSummary {
  chapterNumber: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  generatedAt: string;
}

type AgentTokenUsage = { input: number; output: number };
type ModelInfo = { provider: string; model: string };

interface NovelGenerationState {
  isGenerating: boolean;
  generatingChapterNumber: number | null;
  activeAgents: AgentRole[];
  agentOutputs: Partial<Record<AgentRole, string>>;
  agentTokenUsage: Partial<Record<AgentRole, AgentTokenUsage>>;
  currentModelInfo: ModelInfo | null;
  lastChapterCost: ChapterCostSummary | null;
  lastCompletedChapter: number | null;
  lastFailedChapter: number | null;
  lastFailureMessage: string;
  lastEventAt: number;
}

function createNovelGenerationState(): NovelGenerationState {
  return {
    isGenerating: false,
    generatingChapterNumber: null,
    activeAgents: [],
    agentOutputs: {},
    agentTokenUsage: {},
    currentModelInfo: null,
    lastChapterCost: null,
    lastCompletedChapter: null,
    lastFailedChapter: null,
    lastFailureMessage: '',
    lastEventAt: 0,
  };
}

export const useAgentsStore = defineStore('agents', () => {
  const activeAgents = ref<Set<AgentRole>>(new Set());
  const agentOutputs = ref<Map<AgentRole, string>>(new Map());
  const isGenerating = ref(false);
  const generatingNovelId = ref<string | null>(null);
  const generatingChapterNumber = ref<number | null>(null);
  /** 最近一次管线完成的章节编号（用于通知前端刷新） */
  const lastCompletedChapter = ref<number | null>(null);
  /** 最近一次完成管线的小说 ID（用于按作品范围刷新） */
  const lastCompletedNovelId = ref<string | null>(null);
  /** 最近一次生成失败的章节编号（用于保留失败提示） */
  const lastFailedChapter = ref<number | null>(null);
  /** 最近一次生成失败的小说 ID */
  const lastFailedNovelId = ref<string | null>(null);
  /** 最近一次生成失败的错误信息 */
  const lastFailureMessage = ref('');
  const novelGenerationStates = ref<Record<string, NovelGenerationState>>({});

  // ===== Token/Cost 实时追踪 =====
  const agentTokenUsage = ref<Map<AgentRole, { input: number; output: number }>>(new Map());
  const lastChapterCost = ref<ChapterCostSummary | null>(null);
  /** 当前生成周期检测到的模型供应商/模型名（取自首个 agent:complete 携带的 usage） */
  const currentModelInfo = ref<{ provider: string; model: string } | null>(null);

  /** 当前生成周期的累计 token 数 */
  const totalTokensThisRun = computed(() => {
    let input = 0;
    let output = 0;
    for (const usage of agentTokenUsage.value.values()) {
      input += usage.input;
      output += usage.output;
    }
    return { input, output, total: input + output };
  });

  // ===== 批量生成状态 =====
  const batchRunning = ref(false);
  const batchId = ref<string | null>(null);
  const batchNovelId = ref<string | null>(null);
  const batchItems = ref<BatchJobItem[]>([]);
  const batchCurrentIndex = ref(0);
  const batchTotalItems = ref(0);
  const batchStatus = ref<BatchJobStatus | null>(null);
  const isPaused = ref(false);
  const lastBatchEventAt = ref<number | null>(null);

  // ===== 批量定稿状态 =====
  const batchFinalizing = ref(false);
  const batchFinalizeNovelId = ref<string | null>(null);
  const batchFinalizeItems = ref<BatchFinalizeItem[]>([]);
  const batchFinalizeTotalItems = ref(0);
  const batchFinalizeStatus = ref<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const batchFinalizeSucceeded = ref(0);
  const batchFinalizeFailed = ref(0);

  const batchProgress = computed(() => {
    if (batchTotalItems.value === 0) return 0;
    const completed = batchItems.value.filter(
      i => i.status === 'completed' || i.status === 'failed' || i.status === 'cancelled',
    ).length;
    return Math.round((completed / batchTotalItems.value) * 100);
  });

  const activeAgentList = computed(() => Array.from(activeAgents.value));

  function ensureNovelGenerationState(novelId: string): NovelGenerationState {
    const existing = novelGenerationStates.value[novelId];
    if (existing) return existing;
    const created = createNovelGenerationState();
    novelGenerationStates.value[novelId] = created;
    return created;
  }

  function readNovelGenerationState(novelId: string): NovelGenerationState {
    return novelGenerationStates.value[novelId] ?? createNovelGenerationState();
  }

  function buildOutputMap(outputs: Partial<Record<AgentRole, string>>): Map<AgentRole, string> {
    const mapped = new Map<AgentRole, string>();
    for (const role of Object.keys(outputs) as AgentRole[]) {
      const value = outputs[role];
      if (typeof value === 'string') {
        mapped.set(role, value);
      }
    }
    return mapped;
  }

  function buildTokenUsageMap(tokenUsage: Partial<Record<AgentRole, AgentTokenUsage>>): Map<AgentRole, AgentTokenUsage> {
    const mapped = new Map<AgentRole, AgentTokenUsage>();
    for (const role of Object.keys(tokenUsage) as AgentRole[]) {
      const value = tokenUsage[role];
      if (value) {
        mapped.set(role, value);
      }
    }
    return mapped;
  }

  function syncGlobalGenerationState(preferredNovelId?: string | null) {
    const stateEntries = Object.entries(novelGenerationStates.value);
    if (stateEntries.length === 0) {
      activeAgents.value.clear();
      agentOutputs.value.clear();
      agentTokenUsage.value.clear();
      lastChapterCost.value = null;
      isGenerating.value = false;
      generatingNovelId.value = null;
      generatingChapterNumber.value = null;
      currentModelInfo.value = null;
      return;
    }

    const preferredState = preferredNovelId ? novelGenerationStates.value[preferredNovelId] : null;
    const preferredGenerating = preferredNovelId && preferredState?.isGenerating ? [preferredNovelId, preferredState] as const : null;
    const latestGenerating = stateEntries
      .filter(([, state]) => state.isGenerating)
      .sort((a, b) => b[1].lastEventAt - a[1].lastEventAt)[0];
    const latestTouched = stateEntries
      .sort((a, b) => b[1].lastEventAt - a[1].lastEventAt)[0];
    const focus = preferredGenerating ?? latestGenerating ?? latestTouched;

    if (!focus) {
      activeAgents.value.clear();
      agentOutputs.value.clear();
      agentTokenUsage.value.clear();
      lastChapterCost.value = null;
      isGenerating.value = false;
      generatingNovelId.value = null;
      generatingChapterNumber.value = null;
      currentModelInfo.value = null;
      return;
    }

    const [focusNovelId, focusState] = focus;
    activeAgents.value = new Set(focusState.activeAgents);
    agentOutputs.value = buildOutputMap(focusState.agentOutputs);
    agentTokenUsage.value = buildTokenUsageMap(focusState.agentTokenUsage);
    lastChapterCost.value = focusState.lastChapterCost ? { ...focusState.lastChapterCost } : null;
    currentModelInfo.value = focusState.currentModelInfo ? { ...focusState.currentModelInfo } : null;
    isGenerating.value = focusState.isGenerating;
    generatingNovelId.value = focusState.isGenerating ? focusNovelId : null;
    generatingChapterNumber.value = focusState.isGenerating ? focusState.generatingChapterNumber : null;
  }

  function resetActiveGenerationState(match?: { novelId?: string | null; chapterNumber?: number | null }) {
    const shouldResetGlobal = !match
      || (
        (!match.novelId || !generatingNovelId.value || generatingNovelId.value === match.novelId)
        && (
          match.chapterNumber == null
          || generatingChapterNumber.value == null
          || generatingChapterNumber.value === match.chapterNumber
        )
      );

    if (shouldResetGlobal) {
      activeAgents.value.clear();
      agentOutputs.value.clear();
      agentTokenUsage.value.clear();
      isGenerating.value = false;
      generatingNovelId.value = null;
      generatingChapterNumber.value = null;
      currentModelInfo.value = null;
    }

    if (match?.novelId) {
      const novelState = novelGenerationStates.value[match.novelId];
      if (novelState) {
        if (
          match.chapterNumber != null
          && novelState.generatingChapterNumber != null
          && novelState.generatingChapterNumber !== match.chapterNumber
        ) {
          return;
        }
        novelState.activeAgents = [];
        novelState.agentOutputs = {};
        novelState.agentTokenUsage = {};
        novelState.isGenerating = false;
        novelState.generatingChapterNumber = null;
        novelState.currentModelInfo = null;
        novelState.lastChapterCost = null;
        novelState.lastEventAt = Date.now();
      }
    } else {
      novelGenerationStates.value = {};
    }

    syncGlobalGenerationState();
  }

  function handleEvent(event: AgentEvent) {
    const { type, agentRole, data } = event;

    switch (type) {
      case 'agent:start':
        // 新的生成周期开始时清空上一轮的 token 和输出数据
        if (!isGenerating.value) {
          agentOutputs.value.clear();
          agentTokenUsage.value.clear();
          lastChapterCost.value = null;
          currentModelInfo.value = null;
          lastFailedChapter.value = null;
          lastFailedNovelId.value = null;
          lastFailureMessage.value = '';
        }
        if (event.novelId) {
          const novelState = ensureNovelGenerationState(event.novelId);
          if (!novelState.isGenerating) {
            novelState.agentOutputs = {};
            novelState.agentTokenUsage = {};
            novelState.lastChapterCost = null;
            novelState.currentModelInfo = null;
            novelState.lastFailedChapter = null;
            novelState.lastFailureMessage = '';
          }
          if (!novelState.activeAgents.includes(agentRole)) {
            novelState.activeAgents = [...novelState.activeAgents, agentRole];
          }
          novelState.agentOutputs = {
            ...novelState.agentOutputs,
            [agentRole]: '',
          };
          novelState.isGenerating = true;
          novelState.generatingChapterNumber = event.chapterNumber ?? null;
          novelState.lastEventAt = Date.now();
          if (!novelState.currentModelInfo && event.usage?.provider) {
            novelState.currentModelInfo = {
              provider: event.usage.provider,
              model: event.usage.model ?? '',
            };
          }
        }
        activeAgents.value.add(agentRole);
        agentOutputs.value.set(agentRole, '');
        isGenerating.value = true;
        generatingNovelId.value = event.novelId;
        generatingChapterNumber.value = event.chapterNumber ?? null;
        // 首个 agent:start 即可获取模型信息，无需等 complete
        if (!currentModelInfo.value && event.usage?.provider) {
          currentModelInfo.value = {
            provider: event.usage.provider,
            model: event.usage.model ?? '',
          };
        }
        syncGlobalGenerationState(event.novelId);
        break;

      case 'agent:chunk': {
        if (event.novelId) {
          const novelState = ensureNovelGenerationState(event.novelId);
          const currentScoped = novelState.agentOutputs[agentRole] ?? '';
          novelState.agentOutputs = {
            ...novelState.agentOutputs,
            [agentRole]: currentScoped + data,
          };
          novelState.lastEventAt = Date.now();
        }
        const current = agentOutputs.value.get(agentRole) ?? '';
        agentOutputs.value.set(agentRole, current + data);
        syncGlobalGenerationState(event.novelId);
        break;
      }

      case 'agent:complete':
        if (event.novelId) {
          const novelState = ensureNovelGenerationState(event.novelId);
          novelState.activeAgents = novelState.activeAgents.filter(role => role !== agentRole);
          if (data) {
            novelState.agentOutputs = {
              ...novelState.agentOutputs,
              [agentRole]: data,
            };
          }
          if (event.usage) {
            novelState.agentTokenUsage = {
              ...novelState.agentTokenUsage,
              [agentRole]: {
                input: event.usage.inputTokens,
                output: event.usage.outputTokens,
              },
            };
            if (!novelState.currentModelInfo && event.usage.provider) {
              novelState.currentModelInfo = {
                provider: event.usage.provider,
                model: event.usage.model ?? '',
              };
            }
          }
          if (novelState.activeAgents.length === 0) {
            novelState.isGenerating = false;
            novelState.generatingChapterNumber = null;
          }
          novelState.lastEventAt = Date.now();
        }
        activeAgents.value.delete(agentRole);
        if (data) {
          agentOutputs.value.set(agentRole, data);
        }
        // 累计 token 用量
        if (event.usage) {
          agentTokenUsage.value.set(agentRole, {
            input: event.usage.inputTokens,
            output: event.usage.outputTokens,
          });
          // 首次收到时记录模型信息
          if (!currentModelInfo.value && event.usage.provider) {
            currentModelInfo.value = {
              provider: event.usage.provider,
              model: event.usage.model ?? '',
            };
          }
        }
        if (activeAgents.value.size === 0) {
          isGenerating.value = false;
          generatingNovelId.value = null;
          generatingChapterNumber.value = null;
        }
        syncGlobalGenerationState(event.novelId);
        break;

      case 'agent:error':
        if (event.novelId) {
          const novelState = ensureNovelGenerationState(event.novelId);
          novelState.activeAgents = novelState.activeAgents.filter(role => role !== agentRole);
          novelState.agentOutputs = {
            ...novelState.agentOutputs,
            [agentRole]: `[错误] ${data}`,
          };
          if (novelState.activeAgents.length === 0) {
            novelState.isGenerating = false;
            novelState.generatingChapterNumber = null;
          }
          novelState.lastEventAt = Date.now();
        }
        activeAgents.value.delete(agentRole);
        agentOutputs.value.set(agentRole, `[错误] ${data}`);
        if (activeAgents.value.size === 0) {
          isGenerating.value = false;
          generatingNovelId.value = null;
          generatingChapterNumber.value = null;
        }
        syncGlobalGenerationState(event.novelId);
        break;

      case 'finalize:mode': {
        try {
          const { mode } = JSON.parse(data);
          const modeLabels: Record<string, string> = {
            skip: '内容无变化，已直接定稿',
            quick: '仅有少量文字修改，已快速定稿（跳过 Agent 管线）',
            full: '检测到内容涉及故事元素，启动完整定稿管线...',
          };
          const msgType = mode === 'full' ? 'info' : 'success';
          ElMessage({ type: msgType, message: modeLabels[mode] || `定稿模式: ${mode}`, duration: 4000 });
        } catch { /* ignore */ }
        break;
      }

      case 'pipeline:complete':
        if (event.novelId) {
          const novelState = ensureNovelGenerationState(event.novelId);
          novelState.isGenerating = false;
          novelState.activeAgents = [];
          novelState.generatingChapterNumber = null;
          novelState.lastEventAt = Date.now();
          if (data) {
            try {
              const parsed = JSON.parse(data) as { cost?: ChapterCostSummary; error?: string };
              if (parsed.error) {
                novelState.lastFailedChapter = event.chapterNumber ?? null;
                novelState.lastFailureMessage = parsed.error;
                novelState.lastChapterCost = null;
                syncGlobalGenerationState(event.novelId);
                lastFailedNovelId.value = event.novelId;
                lastFailedChapter.value = event.chapterNumber ?? null;
                lastFailureMessage.value = parsed.error;
                break;
              }
              if (parsed.cost) {
                novelState.lastChapterCost = parsed.cost as ChapterCostSummary;
              }
            } catch {
              // ignore
            }
          }
          novelState.lastFailedChapter = null;
          novelState.lastFailureMessage = '';
          novelState.lastCompletedChapter = event.chapterNumber ?? null;
        }
        isGenerating.value = false;
        activeAgents.value.clear();
        generatingNovelId.value = null;
        generatingChapterNumber.value = null;
        if (data) {
          try {
            const parsed = JSON.parse(data) as { cost?: ChapterCostSummary; error?: string };
            if (parsed.error) {
              lastFailedNovelId.value = event.novelId;
              lastFailedChapter.value = event.chapterNumber ?? null;
              lastFailureMessage.value = parsed.error;
              break;
            }
            if (parsed.cost) {
              lastChapterCost.value = parsed.cost as ChapterCostSummary;
            }
          } catch { /* ignore */ }
        }
        lastFailedChapter.value = null;
        lastFailedNovelId.value = null;
        lastFailureMessage.value = '';
        lastCompletedNovelId.value = event.novelId;
        lastCompletedChapter.value = event.chapterNumber ?? null;
        syncGlobalGenerationState(event.novelId);
        break;
    }
  }

  function handleBatchEvent(event: BatchEvent) {
    lastBatchEventAt.value = Date.now();
    switch (event.type) {
      case 'batch:start':
        batchRunning.value = true;
        batchId.value = event.batchId;
        batchNovelId.value = event.novelId;
        batchCurrentIndex.value = 0;
        batchTotalItems.value = event.totalItems;
        batchStatus.value = 'running';
        // 初始化 items（如果尚未设置）
        if (batchItems.value.length === 0) {
          batchItems.value = Array.from({ length: event.totalItems }, (_, i) => ({
            chapterNumber: i + 1,
            status: 'pending' as BatchJobStatus,
            retryCount: 0,
          }));
        }
        break;

      case 'batch:progress':
        batchCurrentIndex.value = event.currentIndex;
        if (event.chapterNumber != null) {
          const item = batchItems.value.find(i => i.chapterNumber === event.chapterNumber);
          if (item) item.status = 'running';
        }
        break;

      case 'batch:item-complete':
        if (event.chapterNumber != null) {
          const item = batchItems.value.find(i => i.chapterNumber === event.chapterNumber);
          if (item) item.status = 'completed';
        }
        break;

      case 'batch:item-failed':
        if (event.chapterNumber != null) {
          const item = batchItems.value.find(i => i.chapterNumber === event.chapterNumber);
          if (item) {
            item.status = 'failed';
            item.error = event.error;
          }
        }
        resetActiveGenerationState({ novelId: event.novelId, chapterNumber: event.chapterNumber ?? null });
        break;

      case 'batch:item-retry':
        if (event.chapterNumber != null) {
          const item = batchItems.value.find(i => i.chapterNumber === event.chapterNumber);
          if (item) {
            item.status = 'running';
            item.retryCount = (item.retryCount || 0) + 1;
            item.error = event.error;
          }
        }
        break;

      case 'batch:complete':
        batchRunning.value = false;
        batchStatus.value = 'completed';
        resetActiveGenerationState({ novelId: event.novelId });
        break;

      case 'batch:failed':
        batchRunning.value = false;
        batchStatus.value = 'failed';
        isPaused.value = false;
        resetActiveGenerationState({ novelId: event.novelId });
        for (const item of batchItems.value) {
          if (item.status === 'pending') item.status = 'cancelled';
        }
        break;

      case 'batch:cancelled':
        batchRunning.value = false;
        batchStatus.value = 'cancelled';
        isPaused.value = false;
        resetActiveGenerationState({ novelId: event.novelId });
        // 标记剩余 pending 为 cancelled
        for (const item of batchItems.value) {
          if (item.status === 'pending') item.status = 'cancelled';
        }
        break;

      case 'batch:paused':
        isPaused.value = true;
        break;

      case 'batch:resumed':
        isPaused.value = false;
        break;

      case 'batch:retry':
        batchRunning.value = true;
        batchStatus.value = 'running';
        isPaused.value = false;
        break;
    }
  }

  function handleBatchFinalizeEvent(event: BatchFinalizeEvent) {
    switch (event.type) {
      case 'batch-finalize:start':
        batchFinalizing.value = true;
        batchFinalizeNovelId.value = event.novelId;
        batchFinalizeStatus.value = 'running';
        batchFinalizeTotalItems.value = event.totalItems;
        batchFinalizeSucceeded.value = 0;
        batchFinalizeFailed.value = 0;
        batchFinalizeItems.value = [];
        break;

      case 'batch-finalize:progress':
        if (event.chapterNumber != null) {
          batchFinalizeItems.value.push({
            chapterNumber: event.chapterNumber,
            status: 'running',
          });
        }
        break;

      case 'batch-finalize:item-complete':
        if (event.chapterNumber != null) {
          const item = batchFinalizeItems.value.find(i => i.chapterNumber === event.chapterNumber);
          if (item) item.status = 'completed';
        }
        batchFinalizeSucceeded.value = event.succeeded ?? batchFinalizeSucceeded.value;
        break;

      case 'batch-finalize:item-failed':
        if (event.chapterNumber != null) {
          const item = batchFinalizeItems.value.find(i => i.chapterNumber === event.chapterNumber);
          if (item) {
            item.status = 'failed';
            item.error = event.error;
          }
        }
        batchFinalizeFailed.value = event.failed ?? batchFinalizeFailed.value;
        break;

      case 'batch-finalize:complete':
        batchFinalizing.value = false;
        batchFinalizeStatus.value = (event.failed ?? 0) > 0 ? 'failed' : 'completed';
        batchFinalizeSucceeded.value = event.succeeded ?? 0;
        batchFinalizeFailed.value = event.failed ?? 0;
        break;
    }
  }

  function clearBatchFinalize() {
    batchFinalizing.value = false;
    batchFinalizeNovelId.value = null;
    batchFinalizeItems.value = [];
    batchFinalizeTotalItems.value = 0;
    batchFinalizeStatus.value = 'idle';
    batchFinalizeSucceeded.value = 0;
    batchFinalizeFailed.value = 0;
  }

  function initBatchItems(items: BatchJobItem[]) {
    batchItems.value = items;
    batchTotalItems.value = items.length;
  }

  function clearBatch() {
    batchRunning.value = false;
    batchId.value = null;
    batchNovelId.value = null;
    batchItems.value = [];
    batchCurrentIndex.value = 0;
    batchTotalItems.value = 0;
    batchStatus.value = null;
    lastBatchEventAt.value = null;
    clearBatchFinalize();
  }

  function markNovelGenerationPending(params: {
    novelId: string;
    chapterNumber: number;
    message?: string;
  }) {
    const { novelId, chapterNumber, message } = params;
    const pendingMessage = message?.trim() || `第 ${chapterNumber} 章已提交，正在准备生成流程…`;
    const novelState = ensureNovelGenerationState(novelId);
    novelState.isGenerating = true;
    novelState.generatingChapterNumber = chapterNumber;
    novelState.activeAgents = ['writing-assistant'];
    novelState.agentOutputs = {
      ...novelState.agentOutputs,
      'writing-assistant': pendingMessage,
    };
    novelState.agentTokenUsage = {};
    novelState.currentModelInfo = null;
    novelState.lastChapterCost = null;
    novelState.lastFailedChapter = null;
    novelState.lastFailureMessage = '';
    novelState.lastEventAt = Date.now();

    activeAgents.value = new Set<AgentRole>(['writing-assistant']);
    agentOutputs.value = new Map<AgentRole, string>([['writing-assistant', pendingMessage]]);
    agentTokenUsage.value.clear();
    currentModelInfo.value = null;
    lastChapterCost.value = null;
    lastFailedChapter.value = null;
    lastFailedNovelId.value = null;
    lastFailureMessage.value = '';
    isGenerating.value = true;
    generatingNovelId.value = novelId;
    generatingChapterNumber.value = chapterNumber;
    syncGlobalGenerationState(novelId);
  }

  function getOutput(role: AgentRole): string {
    return agentOutputs.value.get(role) ?? '';
  }

  function isGeneratingNovel(novelId: string): boolean {
    return readNovelGenerationState(novelId).isGenerating;
  }

  function getGeneratingChapterNumberForNovel(novelId: string): number | null {
    return readNovelGenerationState(novelId).generatingChapterNumber;
  }

  function getNovelActiveAgentList(novelId: string): AgentRole[] {
    return readNovelGenerationState(novelId).activeAgents;
  }

  function getNovelOutput(novelId: string, role: AgentRole): string {
    return readNovelGenerationState(novelId).agentOutputs[role] ?? '';
  }

  function isNovelAgentActive(novelId: string, role: AgentRole): boolean {
    return readNovelGenerationState(novelId).activeAgents.includes(role);
  }

  function isActive(role: AgentRole): boolean {
    return activeAgents.value.has(role);
  }

  /** Consolidated agent status for pipeline progress surfaces. */
  function getAgentStatus(role: AgentRole): 'idle' | 'working' | 'done' {
    if (activeAgents.value.has(role)) return 'working';
    if (agentOutputs.value.has(role) && agentOutputs.value.get(role) !== '') return 'done';
    return 'idle';
  }

  function getNovelAgentStatus(novelId: string, role: AgentRole): 'idle' | 'working' | 'done' {
    const state = readNovelGenerationState(novelId);
    if (state.activeAgents.includes(role)) return 'working';
    if (state.agentOutputs[role]) return 'done';
    return 'idle';
  }

  function getLastCompletedChapterForNovel(novelId: string): number | null {
    return readNovelGenerationState(novelId).lastCompletedChapter;
  }

  function getLastFailedStateForNovel(novelId: string): { chapterNumber: number | null; message: string } {
    const state = readNovelGenerationState(novelId);
    return {
      chapterNumber: state.lastFailedChapter,
      message: state.lastFailureMessage,
    };
  }

  function clearAll() {
    activeAgents.value.clear();
    agentOutputs.value.clear();
    agentTokenUsage.value.clear();
    lastChapterCost.value = null;
    isGenerating.value = false;
    generatingNovelId.value = null;
    generatingChapterNumber.value = null;
    currentModelInfo.value = null;
    lastCompletedChapter.value = null;
    lastCompletedNovelId.value = null;
    lastFailedChapter.value = null;
    lastFailedNovelId.value = null;
    lastFailureMessage.value = '';
    novelGenerationStates.value = {};
  }

  async function restoreBatch(novelId?: string): Promise<void> {
    try {
      const { job } = await fetchBatchStatus(novelId);
      if (!job || job.status === 'completed' || job.status === 'cancelled') {
        clearBatch();
        resetActiveGenerationState({ novelId: novelId ?? null });
        isPaused.value = false;
        return;
      }
      batchRunning.value = job.status === 'running';
      batchId.value = job.id;
      batchNovelId.value = job.novelId;
      batchItems.value = job.items;
      batchCurrentIndex.value = job.currentIndex;
      batchTotalItems.value = job.items.length;
      batchStatus.value = job.status;
      lastBatchEventAt.value = Date.now();
      // 优先使用服务端返回的 paused 字段，回退到启发式推断
      isPaused.value = typeof job.paused === 'boolean'
        ? job.paused
        : (job.status === 'running' && batchItems.value.every(i => i.status !== 'running'));
    } catch {
      // 服务端不可用时静默忽略
    }
  }

  // ===== 批量作者有话说 =====
  const authorNoteBatchRunning = ref(false);
  const authorNoteBatchCurrent = ref(0);
  const authorNoteBatchTotal = ref(0);
  const authorNoteBatchChapter = ref<number | null>(null);
  const authorNoteBatchGenerated = ref(0);
  const authorNoteBatchFailed = ref(0);

  function handleAuthorNoteBatchEvent(event: string, payload: Record<string, unknown>) {
    switch (event) {
      case 'start':
        authorNoteBatchRunning.value = true;
        authorNoteBatchTotal.value = (payload.total as number) ?? 0;
        authorNoteBatchCurrent.value = 0;
        authorNoteBatchGenerated.value = 0;
        authorNoteBatchFailed.value = 0;
        break;
      case 'progress':
        authorNoteBatchCurrent.value = (payload.current as number) ?? 0;
        authorNoteBatchChapter.value = (payload.chapterNumber as number) ?? null;
        break;
      case 'item-complete':
        authorNoteBatchCurrent.value = (payload.current as number) ?? authorNoteBatchCurrent.value;
        break;
      case 'complete':
        authorNoteBatchRunning.value = false;
        authorNoteBatchGenerated.value = (payload.generated as number) ?? 0;
        authorNoteBatchFailed.value = (payload.failed as number) ?? 0;
        break;
    }
  }

  function clearAuthorNoteBatch() {
    authorNoteBatchRunning.value = false;
    authorNoteBatchCurrent.value = 0;
    authorNoteBatchTotal.value = 0;
    authorNoteBatchChapter.value = null;
    authorNoteBatchGenerated.value = 0;
    authorNoteBatchFailed.value = 0;
  }

  return {
    activeAgents,
    agentOutputs,
    isGenerating,
    generatingNovelId,
    generatingChapterNumber,
    activeAgentList,
    novelGenerationStates,
    lastCompletedChapter,
    lastCompletedNovelId,
    lastFailedChapter,
    lastFailedNovelId,
    lastFailureMessage,
    // batch
    batchRunning,
    batchId,
    batchNovelId,
    batchItems,
    batchCurrentIndex,
    batchTotalItems,
    batchStatus,
    batchProgress,
    isPaused,
    lastBatchEventAt,
    // batch finalize
    batchFinalizing,
    batchFinalizeNovelId,
    batchFinalizeItems,
    batchFinalizeTotalItems,
    batchFinalizeStatus,
    batchFinalizeSucceeded,
    batchFinalizeFailed,
    // token/cost tracking
    agentTokenUsage,
    lastChapterCost,
    totalTokensThisRun,
    currentModelInfo,
    // methods
    handleEvent,
    handleBatchEvent,
    handleBatchFinalizeEvent,
    initBatchItems,
    clearBatch,
    clearBatchFinalize,
    markNovelGenerationPending,
    getOutput,
    isGeneratingNovel,
    getGeneratingChapterNumberForNovel,
    getNovelActiveAgentList,
    getNovelOutput,
    isNovelAgentActive,
    isActive,
    getAgentStatus,
    getNovelAgentStatus,
    getLastCompletedChapterForNovel,
    getLastFailedStateForNovel,
    clearAll,
    resetActiveGenerationState,
    restoreBatch,
    // batch author notes
    authorNoteBatchRunning,
    authorNoteBatchCurrent,
    authorNoteBatchTotal,
    authorNoteBatchChapter,
    authorNoteBatchGenerated,
    authorNoteBatchFailed,
    handleAuthorNoteBatchEvent,
    clearAuthorNoteBatch,
  };
});
