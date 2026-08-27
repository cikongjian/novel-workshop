<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { EChartsInstance, EChartsOption } from 'echarts';
import { loadECharts } from '../../utils/echarts-loader';
import type { StoryTaskGraph, StoryTaskNode } from '../../api/outline';

const props = defineProps<{
  graph: StoryTaskGraph;
  selectedTaskId?: string;
}>();

const emit = defineEmits<{
  selectTask: [task: StoryTaskNode];
}>();

const containerRef = ref<HTMLDivElement>();
const chart = ref<EChartsInstance | null>(null);

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function resolveToken(name: string): string | undefined {
  if (!containerRef.value) return undefined;
  return getComputedStyle(containerRef.value).getPropertyValue(name).trim() || undefined;
}

function buildOption(): EChartsOption {
  const accent = resolveToken('--mobile-focus-accent');
  const accentStrong = resolveToken('--mobile-focus-accent-strong');
  const teal = resolveToken('--star-brand-teal');
  const textPrimary = resolveToken('--nw-text-primary');
  const textSecondary = resolveToken('--nw-text-secondary');
  const textMuted = resolveToken('--nw-text-muted');
  const border = resolveToken('--nw-border');
  const surface = resolveToken('--nw-bg-primary');
  const taskById = new Map(props.graph.tasks.map(task => [task.id, task]));
  const characterByNodeId = new Map(props.graph.characters.map(character => [`character:${character.id}`, character]));

  const statusColor = (task: StoryTaskNode) => {
    if (task.status === 'completed' || task.status === 'abandoned') return textMuted;
    if (task.status === 'critical' || task.status === 'blocked') return accentStrong;
    if (task.status === 'active') return accent;
    return textSecondary;
  };

  const taskNodes = props.graph.tasks.map(task => ({
    id: task.id,
    name: task.title,
    symbol: task.kind === 'arc' ? 'roundRect' : 'circle',
    symbolSize: task.id === props.selectedTaskId
      ? (task.kind === 'arc' ? [94, 42] : 48)
      : (task.kind === 'arc' ? [82, 36] : 38),
    itemStyle: {
      color: statusColor(task),
      borderColor: task.id === props.selectedTaskId ? textPrimary : border,
      borderWidth: task.id === props.selectedTaskId ? 3 : 1,
    },
    label: {
      show: true,
      color: textPrimary,
      fontSize: 10,
      width: task.kind === 'arc' ? 72 : 48,
      overflow: 'truncate',
    },
    payloadType: 'task',
    payload: task,
  }));

  const characterNodes = props.graph.characters.map(character => ({
    id: `character:${character.id}`,
    name: character.name,
    symbol: 'circle',
    symbolSize: 32,
    itemStyle: { color: teal, borderColor: surface, borderWidth: 2 },
    label: { show: true, color: textPrimary, fontSize: 10 },
    payloadType: 'character',
    payload: character,
  }));

  const links = props.graph.edges.map(edge => ({
    source: edge.sourceId,
    target: edge.targetId,
    value: edge.label,
    lineStyle: {
      color: edge.type === 'assigned' ? teal : edge.type === 'advances' ? accent : border,
      width: edge.type === 'requires' || edge.type === 'converges' ? 2 : 1,
      type: edge.type === 'parallel' || edge.type === 'assigned' ? 'dashed' : 'solid',
      opacity: edge.type === 'assigned' ? 0.55 : 0.8,
      curveness: edge.type === 'parallel' ? 0.18 : 0.06,
    },
    label: {
      show: edge.type !== 'assigned',
      formatter: edge.label,
      color: textMuted,
      fontSize: 9,
    },
  }));

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: surface,
      borderColor: border,
      textStyle: { color: textPrimary },
      formatter: (params: { dataType?: string; data?: Record<string, unknown> }) => {
        if (params.dataType !== 'node' || !params.data) return '';
        const id = String(params.data.id ?? '');
        const task = taskById.get(id);
        if (task) {
          return `<strong>${escapeHtml(task.title)}</strong><br/><span>${escapeHtml(task.objective)}</span>`;
        }
        const character = characterByNodeId.get(id);
        return character ? `<strong>${escapeHtml(character.name)}</strong>` : '';
      },
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      zoom: 0.62,
      scaleLimit: { min: 0.5, max: 2.5 },
      draggable: true,
      data: [...taskNodes, ...characterNodes],
      links,
      force: {
        repulsion: 460,
        gravity: 0.05,
        edgeLength: [96, 180],
        friction: 0.65,
      },
      emphasis: { focus: 'adjacency' },
    }],
  };
}

const optionVersion = computed(() => JSON.stringify({
  tasks: props.graph.tasks,
  characters: props.graph.characters,
  edges: props.graph.edges,
  selectedTaskId: props.selectedTaskId,
}));

async function initChart() {
  if (!containerRef.value) return;
  const echarts = await loadECharts();
  if (!containerRef.value) return;
  chart.value?.dispose();
  chart.value = echarts.init(containerRef.value);
  chart.value.setOption(buildOption());
  chart.value.on('click', (params: { dataType?: string; data?: Record<string, unknown> }) => {
    if (params.dataType !== 'node' || params.data?.payloadType !== 'task') return;
    emit('selectTask', params.data.payload as unknown as StoryTaskNode);
  });
}

function resize() {
  chart.value?.resize();
}

watch(optionVersion, () => {
  if (chart.value) chart.value.setOption(buildOption(), true);
});

onMounted(() => {
  window.addEventListener('resize', resize);
  void initChart();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  chart.value?.dispose();
  chart.value = null;
});
</script>

<template>
  <div ref="containerRef" class="story-task-chart" />
</template>
