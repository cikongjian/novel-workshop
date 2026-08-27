<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import type { EChartsOption, EChartsInstance } from 'echarts';
import { loadECharts } from '../../utils/echarts-loader';
import type { CharacterProfile, CharacterRelationship } from '../../types';

const props = defineProps<{
  characters: CharacterProfile[];
  selectedCharacterId?: string;
  highlightRelationPath?: [string, string] | null;
  dark?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', character: CharacterProfile): void;
  (e: 'relationClick', relation: { source: CharacterProfile; target: CharacterProfile; relationship: CharacterRelationship }): void;
}>();

const containerRef = ref<HTMLDivElement>();
const chart = ref<EChartsInstance | null>(null);

const RELATION_TYPE_COLORS: Record<string, string> = {
  lover: '#ec4899', crush: '#f472b6', ex: '#f9a8d4', spouse: '#db2777',
  enemy: '#ef4444', rival: '#f97316', nemesis: '#dc2626', betrayer: '#b91c1c',
  friend: '#22c55e', childhood: '#86efac', sworn: '#4ade80', comrade: '#4ade80',
  ally: '#22c55e', partner: '#22c55e',
  mentor: '#6366f1', classmate: '#a5b4fc', subordinate: '#818cf8',
  servant: '#818cf8', protector: '#3b82f6',
  family: '#fbbf24', sibling: '#fcd34d', parent: '#f59e0b',
  other: '#94a3b8',
};

const RELATION_TYPE_LABELS: Record<string, string> = {
  lover: '恋人', crush: '暗恋', ex: '前任', spouse: '配偶',
  enemy: '敌人', rival: '对手', nemesis: '宿敌', betrayer: '背叛者',
  friend: '朋友', childhood: '青梅竹马', sworn: '结拜', comrade: '战友',
  ally: '盟友', partner: '搭档',
  mentor: '导师', classmate: '同学', subordinate: '下属',
  servant: '仆人', protector: '守护者',
  family: '家人', sibling: '兄弟姐妹', parent: '父母',
  other: '其他',
};

function getCharacterById(id: string): CharacterProfile | undefined {
  return props.characters.find(c => c.id === id);
}

function buildGraphData() {
  const nodes: EChartsOption['series'][0]['data'] = props.characters.map(char => {
    const isSelected = char.id === props.selectedCharacterId;
    const roleColors: Record<string, string> = {
      protagonist: '#6366f1',
      antagonist: '#ef4444',
      supporting: '#22c55e',
      minor: '#94a3b8',
    };
    const baseColor = roleColors[char.role] || '#6366f1';
    
    return {
      id: char.id,
      name: char.name,
      symbolSize: isSelected ? 60 : 45,
      itemStyle: {
        color: baseColor,
        borderColor: isSelected ? '#fff' : 'transparent',
        borderWidth: isSelected ? 3 : 0,
        shadowBlur: isSelected ? 20 : 0,
        shadowColor: isSelected ? baseColor : 'transparent',
      },
      label: {
        show: true,
        fontSize: isSelected ? 14 : 12,
        fontWeight: isSelected ? 'bold' : 'normal',
        color: props.dark ? '#e2e8f0' : '#1e293b',
      },
      data: char,
    };
  });

  const edges: EChartsOption['series'][0]['links'] = [];
  const addedPairs = new Set<string>();

  for (const char of props.characters) {
    for (const rel of char.relationships) {
      const pairKey = [char.id, rel.targetId].sort().join('-');
      if (addedPairs.has(pairKey)) continue;
      addedPairs.add(pairKey);

      const targetChar = getCharacterById(rel.targetId);
      if (!targetChar) continue;

      const tension = rel.tensionLevel ?? 50;
      const lineWidth = Math.max(1, Math.min(8, (tension / 100) * 6 + 2));
      const color = RELATION_TYPE_COLORS[rel.type] || '#94a3b8';
      const opacity = Math.max(0.3, Math.min(1, tension / 100));

      const isHighlighted = props.highlightRelationPath && (
        (props.highlightRelationPath[0] === char.id && props.highlightRelationPath[1] === rel.targetId) ||
        (props.highlightRelationPath[1] === char.id && props.highlightRelationPath[0] === rel.targetId)
      );

      edges.push({
        source: char.id,
        target: rel.targetId,
        lineStyle: {
          color,
          width: isHighlighted ? lineWidth + 3 : lineWidth,
          opacity: isHighlighted ? 1 : opacity,
          curveness: 0.2,
        },
        label: {
          show: isHighlighted,
          formatter: RELATION_TYPE_LABELS[rel.type] || rel.type,
          fontSize: 11,
          color,
        },
        data: { source: char, target: targetChar, relationship: rel },
      });
    }
  }

  return { nodes, edges };
}

const chartOption = computed<EChartsOption>(() => {
  const { nodes, edges } = buildGraphData();

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: { dataType?: string; data?: unknown }) => {
        if (params.dataType === 'node') {
          const char = params.data as CharacterProfile;
          return `
            <div style="font-weight:bold;margin-bottom:4px;font-size:14px;">${char.name}</div>
            <div style="color:#64748b;font-size:12px;">${char.role || '角色'}</div>
            ${char.personality ? `<div style="margin-top:4px;color:#94a3b8;font-size:11px;">${char.personality}</div>` : ''}
          `;
        } else if (params.dataType === 'edge') {
          const relData = params.data as { source: CharacterProfile; target: CharacterProfile; relationship: CharacterRelationship };
          return `
            <div style="font-weight:bold;margin-bottom:4px;">${RELATION_TYPE_LABELS[relData.relationship.type] || relData.relationship.type}</div>
            <div style="color:#64748b;font-size:12px;">${relData.source.name} ↔ ${relData.target.name}</div>
            ${relData.relationship.description ? `<div style="margin-top:4px;color:#94a3b8;font-size:11px;">${relData.relationship.description}</div>` : ''}
            <div style="margin-top:4px;font-size:11px;">张力: ${relData.relationship.tensionLevel ?? 50}/100</div>
          `;
        }
        return '';
      },
      backgroundColor: props.dark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255,255,255,0.95)',
      borderColor: props.dark ? '#334155' : '#e2e8f0',
      borderWidth: 1,
      padding: [12, 16],
      textStyle: { color: props.dark ? '#e2e8f0' : '#1e293b' },
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      emphasis: {
        focus: 'adjacency',
        lineStyle: {
          width: 6,
        },
      },
      force: {
        repulsion: 300,
        gravity: 0.1,
        edgeLength: [80, 200],
        friction: 0.6,
      },
      data: nodes,
      links: edges,
    }],
  };
});

async function initChart() {
  if (!containerRef.value) return;
  const echarts = await loadECharts();
  if (!containerRef.value) return;
  chart.value = echarts.init(containerRef.value);
  chart.value.setOption(chartOption.value);
  chart.value.on('click', (params: { dataType?: string; data?: unknown }) => {
    if (params.dataType === 'node') {
      const char = params.data as CharacterProfile;
      emit('select', char);
    } else if (params.dataType === 'edge') {
      const relData = params.data as { source: CharacterProfile; target: CharacterProfile; relationship: CharacterRelationship };
      emit('relationClick', relData);
    }
  });
}

function resize() {
  chart.value?.resize();
}

watch(() => props.characters, () => {
  if (chart.value) {
    chart.value.setOption(chartOption.value, true);
  } else {
    void initChart();
  }
}, { deep: true });

watch(() => props.selectedCharacterId, () => {
  chart.value?.setOption(chartOption.value, true);
});

watch(() => props.highlightRelationPath, () => {
  chart.value?.setOption(chartOption.value, true);
});

watch(() => props.dark, () => {
  chart.value?.setOption(chartOption.value, true);
});

if (typeof window !== 'undefined') {
  window.addEventListener('resize', resize);
}

onMounted(() => {
  void initChart();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  chart.value?.dispose();
  chart.value = null;
});
</script>

<template>
  <div ref="containerRef" class="relation-graph" />
</template>

<style scoped>
.relation-graph {
  width: 100%;
  height: 100%;
  min-height: 400px;
}
</style>
