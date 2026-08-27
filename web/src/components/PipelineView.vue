<script setup lang="ts">
import { computed } from 'vue';
import { useAgentsStore } from '../stores/agents';
import type { AgentRole } from '../types';
import { AGENT_NAMES, AGENT_COLORS } from '../types';

const props = defineProps<{
  novelId?: string;
}>();

const agentsStore = useAgentsStore();

/** 管线节点定义 */
interface PipelineNode {
  role: AgentRole;
  x: number;
  y: number;
  label: string;
  color: string;
}

/** 管线连线定义 */
interface PipelineEdge {
  from: AgentRole;
  to: AgentRole;
}

const standardNodes: PipelineNode[] = [
  { role: 'outline',       x: 80,  y: 60,  label: AGENT_NAMES['outline'],       color: AGENT_COLORS['outline'] },
  { role: 'world-builder', x: 240, y: 30,  label: AGENT_NAMES['world-builder'], color: AGENT_COLORS['world-builder'] },
  { role: 'character',     x: 240, y: 90,  label: AGENT_NAMES['character'],     color: AGENT_COLORS['character'] },
  { role: 'writer',        x: 400, y: 60,  label: AGENT_NAMES['writer'],        color: AGENT_COLORS['writer'] },
  { role: 'editor',        x: 540, y: 60,  label: AGENT_NAMES['editor'],        color: AGENT_COLORS['editor'] },
  { role: 'reader',        x: 660, y: 60,  label: AGENT_NAMES['reader'],        color: AGENT_COLORS['reader'] },
];

const standardEdges: PipelineEdge[] = [
  { from: 'outline', to: 'world-builder' },
  { from: 'outline', to: 'character' },
  { from: 'world-builder', to: 'writer' },
  { from: 'character', to: 'writer' },
  { from: 'writer', to: 'editor' },
  { from: 'editor', to: 'reader' },
];

const kickstartBaseNodes: PipelineNode[] = [
  { role: 'writing-assistant', x: 70,  y: 60, label: '开书助手', color: AGENT_COLORS['writing-assistant'] },
  { role: 'outline-generator', x: 220, y: 60, label: AGENT_NAMES['outline-generator'], color: AGENT_COLORS['outline-generator'] },
  { role: 'writer',            x: 380, y: 60, label: AGENT_NAMES['writer'], color: AGENT_COLORS['writer'] },
  { role: 'editor',            x: 530, y: 60, label: AGENT_NAMES['editor'], color: AGENT_COLORS['editor'] },
];

const kickstartMarketingNode: PipelineNode = {
  role: 'marketing-writer',
  x: 680,
  y: 60,
  label: AGENT_NAMES['marketing-writer'],
  color: AGENT_COLORS['marketing-writer'],
};

const kickstartBaseEdges: PipelineEdge[] = [
  { from: 'writing-assistant', to: 'outline-generator' },
  { from: 'outline-generator', to: 'writer' },
  { from: 'writer', to: 'editor' },
];

const useKickstartLayout = computed(() => {
  const kickstartRoles: AgentRole[] = ['writing-assistant', 'outline-generator', 'marketing-writer'];
  return kickstartRoles.some((role) => resolveAgentStatus(role) !== 'idle');
});

const showKickstartMarketing = computed(() => resolveAgentStatus('marketing-writer') !== 'idle');

const nodes = computed<PipelineNode[]>(() => (
  useKickstartLayout.value
    ? [
        ...kickstartBaseNodes,
        ...(showKickstartMarketing.value ? [kickstartMarketingNode] : []),
      ]
    : standardNodes
));

const edges = computed<PipelineEdge[]>(() => (
  useKickstartLayout.value
    ? [
        ...kickstartBaseEdges,
        ...(showKickstartMarketing.value ? [{ from: 'editor', to: 'marketing-writer' } satisfies PipelineEdge] : []),
      ]
    : standardEdges
));

function getNode(role: AgentRole): PipelineNode {
  return nodes.value.find((n) => n.role === role)!;
}

function resolveAgentStatus(role: AgentRole): 'idle' | 'working' | 'done' {
  if (props.novelId) {
    return agentsStore.getNovelAgentStatus(props.novelId, role);
  }
  const statusGetter = (agentsStore as { getAgentStatus?: (r: AgentRole) => 'idle' | 'working' | 'done' }).getAgentStatus;
  if (typeof statusGetter === 'function') return statusGetter(role);
  if (agentsStore.isActive(role)) return 'working';
  return agentsStore.getOutput(role) ? 'done' : 'idle';
}

function getNodeStatus(role: AgentRole): 'idle' | 'working' | 'done' {
  return resolveAgentStatus(role);
}

function getEdgePath(edge: PipelineEdge): string {
  const from = getNode(edge.from);
  const to = getNode(edge.to);
  const startX = from.x + 40;
  const endX = to.x - 40;
  const midX = (startX + endX) / 2;
  return `M ${startX} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${endX} ${to.y}`;
}

function getEdgeColor(edge: PipelineEdge): string {
  const fromStatus = getNodeStatus(edge.from);
  const toStatus = getNodeStatus(edge.to);
  if (toStatus === 'working' || toStatus === 'done') return '#6366f1';
  if (fromStatus === 'done') return 'rgba(99, 102, 241, 0.5)';
  return 'rgba(100, 116, 139, 0.3)';
}

function getEdgeClass(edge: PipelineEdge): string {
  const fromStatus = getNodeStatus(edge.from);
  const toStatus = getNodeStatus(edge.to);
  if (toStatus === 'working' || (fromStatus === 'done' && toStatus === 'done')) return 'edge-flow';
  return '';
}

function getNodeClass(role: AgentRole): string {
  const status = getNodeStatus(role);
  if (status === 'done') return 'node-done';
  if (status === 'working') return 'node-working';
  return '';
}

const completedCount = computed(() =>
  nodes.value.filter((n) => getNodeStatus(n.role) === 'done').length,
);

const totalNodeCount = computed(() => nodes.value.length);

const isActive = computed(() => (
  props.novelId ? agentsStore.isGeneratingNovel(props.novelId) : agentsStore.isGenerating
));
</script>

<template>
  <div class="pipeline-view" :class="{ active: isActive }">
    <div class="pipeline-header">
      <span class="pipeline-title">Agent 管线</span>
      <span v-if="isActive" class="pipeline-status working">运行中</span>
      <span v-else-if="completedCount === totalNodeCount" class="pipeline-status done">已完成</span>
      <span v-else class="pipeline-status idle">就绪</span>
    </div>
    <svg class="pipeline-svg" viewBox="0 0 740 120" preserveAspectRatio="xMidYMid meet">
      <defs>
        <!-- 箭头标记 -->
        <marker
          id="arrowhead"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="rgba(99, 102, 241, 0.5)" />
        </marker>
        <marker
          id="arrowhead-active"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#6366f1" />
        </marker>
      </defs>

      <!-- 连线 -->
      <path
        v-for="(edge, idx) in edges"
        :key="'edge-' + idx"
        :d="getEdgePath(edge)"
        fill="none"
        :stroke="getEdgeColor(edge)"
        stroke-width="2"
        stroke-dasharray="8 4"
        :class="getEdgeClass(edge)"
        :marker-end="
          getEdgeColor(edge) === '#6366f1'
            ? 'url(#arrowhead-active)'
            : 'url(#arrowhead)'
        "
      />

      <!-- 节点 -->
      <g v-for="node in nodes" :key="node.role">
        <!-- 工作中发光效果 -->
        <circle
          v-if="getNodeStatus(node.role) === 'working'"
          :cx="node.x"
          :cy="node.y"
          r="26"
          :fill="node.color"
          opacity="0.15"
          class="glow-ring"
        />

        <!-- 节点圆圈 -->
        <circle
          :cx="node.x"
          :cy="node.y"
          r="20"
          :fill="
            getNodeStatus(node.role) === 'idle'
              ? 'rgba(17, 24, 39, 0.8)'
              : getNodeStatus(node.role) === 'working'
                ? 'rgba(17, 24, 39, 0.9)'
                : 'rgba(17, 24, 39, 0.7)'
          "
          :stroke="
            getNodeStatus(node.role) === 'working'
              ? node.color
              : getNodeStatus(node.role) === 'done'
                ? '#10b981'
                : 'rgba(100, 116, 139, 0.3)'
          "
          stroke-width="2"
        />

        <!-- 状态图标 -->
        <text
          v-if="getNodeStatus(node.role) === 'done'"
          :x="node.x"
          :y="node.y + 1"
          text-anchor="middle"
          dominant-baseline="central"
          font-size="14"
          fill="#10b981"
          class="check-icon"
        >
          &#10003;
        </text>
        <circle
          v-else-if="getNodeStatus(node.role) === 'working'"
          :cx="node.x"
          :cy="node.y"
          r="4"
          :fill="node.color"
          class="working-dot"
        />
        <circle
          v-else
          :cx="node.x"
          :cy="node.y"
          r="3"
          fill="rgba(100, 116, 139, 0.4)"
        />

        <!-- 标签 -->
        <text
          :x="node.x"
          :y="node.y + 32"
          text-anchor="middle"
          font-size="11"
          :fill="
            getNodeStatus(node.role) === 'idle'
              ? 'rgba(148, 163, 184, 0.6)'
              : getNodeStatus(node.role) === 'working'
                ? node.color
                : '#10b981'
          "
          font-weight="500"
        >
          {{ node.label }}
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.pipeline-view {
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  border: 1px solid var(--nw-glass-border);
  transition: all 0.4s var(--nw-ease-smooth);
  position: relative;
  overflow: hidden;
}

.pipeline-view::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg,
    rgba(99, 102, 241, 0.05) 0%,
    transparent 50%,
    rgba(139, 92, 246, 0.05) 100%);
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

.pipeline-view.active::before {
  opacity: 1;
}

.pipeline-view.active {
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow: 0 0 30px rgba(99, 102, 241, 0.2),
              inset 0 0 20px rgba(99, 102, 241, 0.05);
  animation: pipeline-active-glow 3s ease-in-out infinite;
}

@keyframes pipeline-active-glow {
  0%, 100% {
    box-shadow: 0 0 20px rgba(99, 102, 241, 0.15),
                inset 0 0 15px rgba(99, 102, 241, 0.03);
  }
  50% {
    box-shadow: 0 0 35px rgba(99, 102, 241, 0.25),
                inset 0 0 25px rgba(99, 102, 241, 0.08);
  }
}

.pipeline-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.pipeline-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--nw-text-secondary);
}

.pipeline-status {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: auto;
}

.pipeline-status.idle {
  color: var(--nw-text-muted);
}

.pipeline-status.working {
  color: var(--nw-warning);
  background: rgba(245, 158, 11, 0.1);
}

.pipeline-status.done {
  color: var(--nw-success);
  background: rgba(16, 185, 129, 0.1);
}

.pipeline-svg {
  width: 100%;
  height: auto;
  max-height: 120px;
}

.glow-ring {
  animation: glow-pulse 2s ease-in-out infinite;
}

@keyframes glow-pulse {
  0%, 100% { opacity: 0.15; r: 26; }
  50% { opacity: 0.25; r: 28; }
}

.working-dot {
  animation: dot-pulse 1.5s ease-in-out infinite;
}

@keyframes dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* 连线流动动画 - 增强版 */
.edge-flow {
  animation: flow-dash 1s linear infinite;
  filter: drop-shadow(0 0 3px rgba(99, 102, 241, 0.5));
}

@keyframes flow-dash {
  to {
    stroke-dashoffset: -12;
  }
}

/* 激活状态的节点边缘发光 */
circle[stroke="#6366f1"] {
  filter: drop-shadow(0 0 6px rgba(99, 102, 241, 0.6));
  animation: node-edge-glow 2s ease-in-out infinite;
}

@keyframes node-edge-glow {
  0%, 100% {
    filter: drop-shadow(0 0 6px rgba(99, 102, 241, 0.6));
  }
  50% {
    filter: drop-shadow(0 0 12px rgba(99, 102, 241, 0.9));
  }
}

/* 节点完成动画 */
.node-done {
  animation: node-complete 0.5s var(--nw-ease-spring);
}

@keyframes node-complete {
  0% { transform: scale(1); }
  40% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

/* 成功勾选图标动画 */
.check-icon {
  animation: check-pop 0.6s var(--nw-ease-spring);
  transform-origin: center;
}

@keyframes check-pop {
  0% { transform: scale(0) rotate(-45deg); opacity: 0; }
  50% { transform: scale(1.3) rotate(10deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
</style>
