export const NOVEL_CONSTITUTION_TAG_OPTIONS = [
  {
    id: 'fantasy-upgrade',
    label: '玄幻升级',
    description: '突破、机缘、碾压、资源回报优先',
  },
  {
    id: 'showbiz',
    label: '娱乐圈逆袭',
    description: '试镜、热搜、资源、站队优先',
  },
  {
    id: 'collapse-warning',
    label: '塌房预警爆红',
    description: '预警、避雷、截胡、直播翻红优先',
  },
  {
    id: 'rebirth',
    label: '重生改命',
    description: '先知优势必须转成截胡和避坑收益',
  },
  {
    id: 'faceslap',
    label: '打脸反杀',
    description: '围观震惊、翻车和压制感优先',
  },
  {
    id: 'sweet',
    label: '爽甜拉扯',
    description: '心动、护短、偏爱、吃醋优先',
  },
  {
    id: 'female-career',
    label: '大女主事业线',
    description: '项目翻盘、公开反击、独立成长优先',
  },
  {
    id: 'shame-system',
    label: '社死系统',
    description: '任务、惩罚、社死现场、围观反应优先',
  },
] as const;

export type NovelConstitutionTagId = typeof NOVEL_CONSTITUTION_TAG_OPTIONS[number]['id'];

export const NOVEL_CONSTITUTION_TAG_LIMIT = 6;

export function getNovelConstitutionTagLabels(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  const definitions = new Map(NOVEL_CONSTITUTION_TAG_OPTIONS.map(item => [item.id, item]));
  return [...new Set(tags)]
    .map(tag => definitions.get(tag as NovelConstitutionTagId)?.label ?? '')
    .filter(Boolean);
}
