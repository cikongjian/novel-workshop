<script setup lang="ts">
import { computed, ref, toRef, watch, nextTick } from 'vue';
import type { Ref } from 'vue';
import MobileAgentLiveHeader from './MobileAgentLiveHeader.vue';
import MobileAgentLiveBubble from './MobileAgentLiveBubble.vue';
import { useAgentLiveFeed } from '../../composables/useAgentLiveFeed';
import type { PolledAgentStatus } from '../../composables/useNovelGenerationStatusPolling';

const props = defineProps<{
  novelId: string;
  chapterNumber: number;
  pendingStart?: boolean;
  /**
   * 后端真实 agentStatuses（来自 generation-status 轮询的 latestStatus.agentStatuses）。
   * 这是节点列表的唯一权威来源，决定显示哪些 Agent 及其状态。
   */
  agentStatuses: Record<string, PolledAgentStatus> | null;
  /** writing-assistant 占位角色的流式输出（可选，用于衔接播报文案） */
  writingAssistantOutput?: string | null;
  /** 最近一次失败信息（可选） */
  failureMessage?: string | null;
}>();

const novelIdRef = toRef(props, 'novelId') as Ref<string>;
const pendingStartRef = toRef(props, 'pendingStart');
const agentStatusesRef = toRef(props, 'agentStatuses') as Ref<Record<string, PolledAgentStatus> | null>;
const chapterNumberRef = toRef(props, 'chapterNumber') as Ref<number>;
const failureMessageRef = toRef(props, 'failureMessage') as Ref<string | null | undefined>;
const writingAssistantOutputRef = toRef(props, 'writingAssistantOutput') as Ref<string | null | undefined>;

const { feed } = useAgentLiveFeed({
  novelId: novelIdRef,
  pendingStart: pendingStartRef,
  agentStatuses: agentStatusesRef,
  chapterNumber: chapterNumberRef,
  failureMessage: failureMessageRef,
  writingAssistantOutput: writingAssistantOutputRef,
});

// 完成时的滚动与反馈
const streamRef = ref<HTMLElement | null>(null);
const completedSet = ref<Set<string>>(new Set());

function handleBubbleCompleted(role: string) {
  completedSet.value.add(role);
  void nextTick(() => {
    const container = streamRef.value;
    if (!container) return;
    const activeEl = container.querySelector('.mobile-live-bubble.is-working');
    if (activeEl && 'scrollIntoView' in activeEl) {
      (activeEl as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
}

// 切换小说或章节时重置完成记录
watch(
  () => [props.novelId, props.chapterNumber] as const,
  () => {
    completedSet.value = new Set();
  },
);

const visibleNodes = computed(() => feed.value.nodes);

const summary = computed(() => {
  if (feed.value.failureMessage) return feed.value.failureMessage;
  if (feed.value.pendingStart) return '任务已提交，正在拉起第一个 Agent…';
  if (feed.value.nodes.length === 0) return '等待管线启动，Agent 状态即将回传…';
  if (!feed.value.isGenerating && feed.value.completedCount === feed.value.totalCount) {
    return '本轮管线已全部完成。';
  }
  return '可以直接关闭窗口，后台会继续生成，稍后回来继续看进度。';
});
</script>

<template>
  <section class="mobile-live-stream mobile-focus-light-vars" aria-label="Agent 生成直播">
    <MobileAgentLiveHeader :feed="feed" :chapter-number="chapterNumber" />

    <div ref="streamRef" class="mobile-live-stream__list" role="feed">
      <MobileAgentLiveBubble
        v-for="node in visibleNodes"
        :key="node.role"
        :bubble="node"
        :active="feed.activeRole === node.role"
        @completed="handleBubbleCompleted"
      />
    </div>

    <p class="mobile-live-stream__footnote">{{ summary }}</p>
  </section>
</template>

<style scoped>
.mobile-live-stream {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 18%, var(--nw-border));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent), transparent 32%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--mobile-focus-accent) 5%, var(--nw-bg-secondary)),
      color-mix(in srgb, var(--mobile-focus-accent) 8%, var(--nw-bg-primary))
    );
}

.mobile-live-stream__list {
  display: grid;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 2px;
  margin: -2px;
}

.mobile-live-stream__list::-webkit-scrollbar {
  width: 3px;
}

.mobile-live-stream__list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--nw-text-muted) 32%, transparent);
  border-radius: 999px;
}

.mobile-live-stream__footnote {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
  text-align: center;
  padding-top: 2px;
}

@media (max-width: 360px) {
  .mobile-live-stream {
    padding: 12px;
  }
}
</style>
