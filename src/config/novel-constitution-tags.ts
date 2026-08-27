export const NOVEL_CONSTITUTION_TAG_DEFINITIONS = [
  {
    id: 'fantasy-upgrade',
    label: '玄幻升级',
    description: '优先兑现突破、机缘、碾压和资源回报。',
  },
  {
    id: 'showbiz',
    label: '娱乐圈逆袭',
    description: '优先兑现试镜、热搜、资源、站队和翻红。',
  },
  {
    id: 'collapse-warning',
    label: '塌房预警爆红',
    description: '优先兑现预警、避雷、截胡、直播和翻红起量。',
  },
  {
    id: 'rebirth',
    label: '重生改命',
    description: '先把先知优势写成截胡、避坑、反抢的收益。',
  },
  {
    id: 'faceslap',
    label: '打脸反杀',
    description: '必须出现压制、翻车、围观震惊等即时情绪回报。',
  },
  {
    id: 'sweet',
    label: '爽甜拉扯',
    description: '优先写心动、护短、偏爱、吃醋和关系推进。',
  },
  {
    id: 'female-career',
    label: '大女主事业线',
    description: '优先写公开反击、项目归属、职场翻盘和独立成长。',
  },
  {
    id: 'shame-system',
    label: '社死系统',
    description: '优先写任务触发、社死现场、惩罚升级和围观反应。',
  },
  {
    id: 'war-statecraft',
    label: '战争权谋建国',
    description: '优先写攻城练兵、兵权政令、制度落地和旧贵族反扑。',
  },
] as const;

export type NovelConstitutionTagId = typeof NOVEL_CONSTITUTION_TAG_DEFINITIONS[number]['id'];

export const NOVEL_CONSTITUTION_TAG_IDS = NOVEL_CONSTITUTION_TAG_DEFINITIONS.map(item => item.id);

export const NOVEL_CONSTITUTION_TAG_KEYWORDS: Record<NovelConstitutionTagId, string[]> = {
  'fantasy-upgrade': ['玄幻', '修仙', '升级', '突破', '机缘', '碾压', '秘境', '宗门'],
  showbiz: ['娱乐圈', '试镜', '热搜', '资源', '站队', '翻红', '顶流', '剧组'],
  'collapse-warning': ['塌房预警', '塌房', '预警', '避雷', '截胡', '直播', '爆红', '预警者'],
  rebirth: ['重生', '改命', '先知', '截胡', '避坑', '抢先', '改写', '前世'],
  faceslap: ['打脸', '反杀', '翻车', '碾压', '震惊', '后悔', '压制', '围观'],
  sweet: ['爽甜', '甜宠', '心动', '护短', '偏爱', '吃醋', '拉扯', '靠近'],
  'female-career': ['大女主', '事业线', '项目', '签约', '升职', '反击', '独立成长', '客户'],
  'shame-system': ['羞耻系统', '社死系统', '任务', '惩罚', '社死', '公开处刑', '围观', '脸红'],
  'war-statecraft': ['战争', '权谋', '建国', '攻城', '兵权', '军功爵', '废奴', '科举', '天朝', '旧贵族'],
};

function isNovelConstitutionTagId(value: string): value is NovelConstitutionTagId {
  return NOVEL_CONSTITUTION_TAG_IDS.includes(value as NovelConstitutionTagId);
}

export function normalizeNovelConstitutionTags(tags?: string[]): NovelConstitutionTagId[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.filter(isNovelConstitutionTagId))];
}

export function getNovelConstitutionTagLabels(tags?: string[]): string[] {
  const definitions = new Map(NOVEL_CONSTITUTION_TAG_DEFINITIONS.map(item => [item.id, item]));
  return normalizeNovelConstitutionTags(tags)
    .map(tag => definitions.get(tag)?.label ?? '')
    .filter(Boolean);
}

export function getNovelConstitutionSignalTexts(tags?: string[]): string[] {
  const definitions = new Map(NOVEL_CONSTITUTION_TAG_DEFINITIONS.map(item => [item.id, item]));
  const signals = normalizeNovelConstitutionTags(tags).flatMap((tag) => {
    const definition = definitions.get(tag);
    if (!definition) return [];
    return [definition.label, definition.description, ...(NOVEL_CONSTITUTION_TAG_KEYWORDS[tag] ?? [])];
  });
  return [...new Set(signals.filter(Boolean))];
}
