import { computed } from 'vue';
import type { Ref } from 'vue';
import { useWebSocket } from './useWebSocket';
import { useAgentsStore } from '../stores/agents';
import { AGENT_NAMES, type AgentRole } from '../types';
import {
  extractProgressLines,
  resolvePreferredActiveRole,
} from '../utils/agent-progress';

const STAGE_DESCRIPTION: Partial<Record<AgentRole, string>> = {
  outline: '故事架构师正在梳理本章骨架，确定这一章的推进重点。',
  'world-builder': '世界构建师正在补齐场景、规则和环境约束。',
  character: '角色塑造师正在校准人物动机、关系和出场状态。',
  writer: '写手正在起草正文，当前以章节内容生成为主。',
  editor: '编辑正在润色正文，统一节奏、文风和表达。',
  reader: '读者审校中，正在做收尾检查和入库前确认。',
  'writing-assistant': '写作助手正在整理整体流程，准备切换下一步。',
};

export function useNovelRealtimeStatus(novelId: Ref<string>) {
  const agentsStore = useAgentsStore();

  const { isConnected } = useWebSocket({
    subscription: {
      novelId,
    },
    onEvent: (event) => {
      if (event.novelId === novelId.value) {
        agentsStore.handleEvent(event);
      }
    },
    onBatchEvent: (event) => {
      if (event.novelId === novelId.value) {
        agentsStore.handleBatchEvent(event);
      }
    },
    onBatchFinalizeEvent: (event) => {
      if (event.novelId === novelId.value) {
        agentsStore.handleBatchFinalizeEvent(event);
      }
    },
  });

  const isGeneratingHere = computed(() => (
    agentsStore.isGeneratingNovel(novelId.value)
  ));

  const generatingChapterNumber = computed(() => (
    isGeneratingHere.value ? agentsStore.getGeneratingChapterNumberForNovel(novelId.value) : null
  ));

  const activeRole = computed<AgentRole | null>(() => {
    if (!isGeneratingHere.value) return null;
    return resolvePreferredActiveRole(agentsStore.getNovelActiveAgentList(novelId.value) as AgentRole[]);
  });

  const activeAgentLabel = computed(() => (
    activeRole.value ? (AGENT_NAMES[activeRole.value] ?? activeRole.value) : '写作助手'
  ));

  const writingAssistantOutput = computed(() => agentsStore.getNovelOutput(novelId.value, 'writing-assistant'));
  const activeAgentOutput = computed(() => (
    activeRole.value ? agentsStore.getNovelOutput(novelId.value, activeRole.value) : ''
  ));

  const writingAssistantLines = computed(() => extractProgressLines(writingAssistantOutput.value));
  const chapterLabel = computed(() => generatingChapterNumber.value ?? 1);
  const stageSummaryLine = computed(() => writingAssistantLines.value[writingAssistantLines.value.length - 1] ?? '');

  const progressPreview = computed(() => {
    return '';
  });

  const progressDescription = computed(() => {
    if (activeRole.value) {
      return STAGE_DESCRIPTION[activeRole.value] ?? `${activeAgentLabel.value} 正在处理中…`;
    }
    if (stageSummaryLine.value) return stageSummaryLine.value;
    if (activeRole.value) return `${activeAgentLabel.value} 正在处理中…`;
    return `正在准备第 ${chapterLabel.value} 章内容…`;
  });

  const lastCompletedChapterHere = computed(() => (
    agentsStore.getLastCompletedChapterForNovel(novelId.value)
  ));
  const lastFailedStateHere = computed(() => agentsStore.getLastFailedStateForNovel(novelId.value));
  const lastFailedChapterHere = computed(() => lastFailedStateHere.value.chapterNumber);
  const lastFailureMessageHere = computed(() => lastFailedStateHere.value.message);

  return {
    isConnected,
    isGeneratingHere,
    generatingChapterNumber,
    activeRole,
    activeAgentLabel,
    progressDescription,
    progressPreview,
    lastCompletedChapterHere,
    lastFailedChapterHere,
    lastFailureMessageHere,
  };
}
