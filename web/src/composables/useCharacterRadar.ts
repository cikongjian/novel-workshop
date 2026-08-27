/**
 * 角色人设雷达 —— 把 CharacterProfile 的 personalityTraits 映射为 6 维雷达数据
 * 纯规则映射，无需 AI、无需服务端
 */
import type { CharacterProfile } from '../types';

export interface RadarDimension {
  key: string;
  label: string;
  value: number; // 0-100
}

const DIM_LABELS: Record<string, string> = {
  personality: '性格',
  decisiveness: '决断',
  empathy: '共情',
  ambition: '野心',
  darkSide: '阴暗面',
  humor: '幽默感',
};

// ── 关键词→维度映射表 ──

const POSITIVE_KEYWORDS: Record<string, string[]> = {
  personality: ['强势', '霸道', '坚韧', '倔强', '固执', '刚烈', '强硬', '不屈'],
  decisiveness: ['果断', '决绝', '果敢', '雷厉风行', '杀伐果断', '毫不犹豫', '当机立断', '敢作敢当'],
  empathy: ['善良', '温柔', '体贴', '慈悲', '同理心', '心软', '关怀', '共情', '善解人意', '怜悯', '仁厚'],
  ambition: ['野心', '雄心', '权力', '征服', '主宰', '称霸', '一统', '不甘', '向上', '逆袭', '逐鹿'],
  darkSide: ['腹黑', '阴险', '狠毒', '算计', '残忍', '冷酷', '嗜血', '狡诈', '城府', '偏执', '疯狂', '病娇'],
  humor: ['幽默', '风趣', '诙谐', '搞笑', '乐观', '开朗', '活泼', '俏皮', '贫嘴', '嘴贱', '段子手'],
};

const NEGATIVE_KEYWORDS: Record<string, string[]> = {
  personality: ['软弱', '懦弱', '自卑', '随波逐流'],
  decisiveness: ['犹豫', '优柔寡断', '瞻前顾后', '患得患失', '畏首畏尾'],
  empathy: ['冷漠', '无情', '自私', '铁石心肠', '麻木', '冷血'],
  ambition: ['淡泊', '佛系', '随遇而安', '无欲无求', '躺平'],
  darkSide: ['单纯', '天真', '善良', '坦荡', '光明磊落', '赤子之心'],
  humor: ['严肃', '沉闷', '不苟言笑', '冷面', '古板', '刻板'],
};

/** 基于 personalityTraits + personality/persona/psychology 文本计算 6 维得分 */
export function computeCharacterRadar(char: CharacterProfile): RadarDimension[] {
  const traits = char.personalityTraits ?? [];
  const allText = [
    char.personality ?? '',
    char.persona?.publicPersona ?? '',
    char.persona?.privatePersona ?? '',
    char.psychology?.worldview ?? '',
    ...(char.psychology?.emotionalTriggers ?? []),
    ...(char.psychology?.copingMechanisms ?? []),
  ].join(' ');

  const scores: Record<string, number> = {};
  const dims = Object.keys(DIM_LABELS);

  for (const dim of dims) {
    let score = 50; // 基线

    // 正向关键词加分
    for (const kw of POSITIVE_KEYWORDS[dim] ?? []) {
      if (traits.includes(kw)) { score += 25; }
      else if (traits.some(t => t.includes(kw))) { score += 15; }
      else if (allText.includes(kw)) { score += 10; }
    }

    // 负向关键词减分
    for (const kw of NEGATIVE_KEYWORDS[dim] ?? []) {
      if (traits.includes(kw)) { score -= 25; }
      else if (traits.some(t => t.includes(kw))) { score -= 15; }
      else if (allText.includes(kw)) { score -= 10; }
    }

    // role 加成
    const role = char.role;
    if (dim === 'ambition' && (role === 'antagonist' || role === 'protagonist')) { score += 10; }
    if (dim === 'darkSide' && role === 'antagonist') { score += 15; }
    if (dim === 'empathy' && role === 'protagonist') { score += 10; }
    if (dim === 'decisiveness' && role === 'protagonist') { score += 8; }

    // 性格模型 V2 的 innerContradictions 增加复杂感 → 人格/阴暗面各 +5
    if ((dim === 'personality' || dim === 'darkSide') && (char.personalityModel?.innerContradictions?.length ?? 0) > 0) {
      score += 5;
    }

    // speechDNA tempo 影响决断
    if (dim === 'decisiveness' && char.speechDNA?.tempo === 'fast') { score += 8; }
    if (dim === 'decisiveness' && char.speechDNA?.tempo === 'slow') { score -= 5; }

    scores[dim] = Math.max(5, Math.min(100, Math.round(score)));
  }

  return dims.map(key => ({ key, label: DIM_LABELS[key], value: scores[key] }));
}

/** 生成该角色的最佳判定标签（1-2 个） */
export function getRadarLabel(dims: RadarDimension[]): string[] {
  const sorted = [...dims].sort((a, b) => b.value - a.value);
  const labels: string[] = [];

  const top1 = sorted[0];
  if (top1.value >= 75) {
    const labelMap: Record<string, string> = {
      personality: '强势人格',
      decisiveness: '决断如神',
      empathy: '共情满格',
      ambition: '野心勃勃',
      darkSide: '暗藏锋芒',
      humor: '幽默担当',
    };
    labels.push(labelMap[top1.key] ?? top1.label);
  }

  const top2 = sorted[1];
  if (top2 && top2.value >= 70 && labels.length < 2) {
    const labelMap: Record<string, string> = {
      personality: '性格鲜明',
      decisiveness: '行动派',
      empathy: '温柔底色',
      ambition: '志在四方',
      darkSide: '城府深沉',
      humor: '气氛组',
    };
    labels.push(labelMap[top2.key] ?? top2.label);
  }

  if (labels.length === 0) labels.push('均衡型人格');
  return labels;
}
