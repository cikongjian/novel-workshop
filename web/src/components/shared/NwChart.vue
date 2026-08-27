<script setup lang="ts">
/**
 * NwChart —— 跨设备共享的 ECharts 包装组件
 * 懒加载 echarts（loadECharts），封装 init / setOption / resize / dispose。
 * 桌面端与移动端共用，避免每个图表重复样板代码。
 */
import { onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { EChartsOption, ECharts } from 'echarts';
import { loadECharts } from '../../utils/echarts-loader';

const props = defineProps<{ option: EChartsOption; height?: string }>();

const containerRef = ref<HTMLDivElement>();
const chart = shallowRef<ECharts | null>(null);

async function ensureChart(): Promise<void> {
  if (chart.value || !containerRef.value) return;
  const echarts = await loadECharts();
  // await 期间可能已卸载
  if (!containerRef.value) return;
  chart.value = echarts.init(containerRef.value);
  chart.value.setOption(props.option);
}

function applyOption(): void {
  chart.value?.setOption(props.option, true);
}

function resize(): void {
  chart.value?.resize();
}

onMounted(() => {
  void ensureChart();
  window.addEventListener('resize', resize);
});

watch(
  () => props.option,
  () => {
    if (chart.value) applyOption();
    else void ensureChart();
  },
  { deep: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  chart.value?.dispose();
  chart.value = null;
});
</script>

<template>
  <div ref="containerRef" class="nw-chart" :style="{ height: height || '280px' }" />
</template>

<style scoped>
.nw-chart {
  width: 100%;
}
</style>
