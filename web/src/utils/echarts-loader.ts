import type * as EChartsModule from 'echarts';

let echartsLoader: Promise<typeof EChartsModule> | null = null;

export function loadECharts(): Promise<typeof EChartsModule> {
  if (!echartsLoader) {
    echartsLoader = import('echarts');
  }
  return echartsLoader;
}
