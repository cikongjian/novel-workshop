/**
 * CP 化学反应值计算 —— 基于双角色的人设 + 关系数据推算"化学反应分"
 * 纯本地计算，无需 AI，无需服务端
 */
import type { CharacterProfile } from '../types';
import { computeCharacterRadar, type RadarDimension } from './useCharacterRadar';

export interface ChemistryResult {
  score: number;       // 0-100
  label: string;       // 判定标签
  description: string; // 详细描述
  dimsA: RadarDimension[];
  dimsB: RadarDimension[];
}

const LABEL_RULES: Array<{ min: number; max: number; label: string; desc: string }> = [
  { min: 90, max: 100, label: '宿命纠缠', desc: '天命级别的化学反应，注定在大结局里同框' },
  { min: 80, max: 89, label: '相爱相杀', desc: '爱恨交织，每次对手戏都是名场面' },
  { min: 70, max: 79, label: '宿敌变挚友', desc: '从针锋相对到惺惺相惜，教科书级人物弧光' },
  { min: 60, max: 69, label: '张力拉满', desc: '每次同框都让读者手心出汗' },
  { min: 50, max: 59, label: '微妙磁场', desc: '似有若无的氛围感，越品越有意思' },
  { min: 40, max: 49, label: '搭档感', desc: '配合默契但缺一点火花，适合组队搞事业' },
  { min: 20, max: 39, label: '路人感', desc: '剧本里碰过面，但 CP 粉表示嗑不动' },
  { min: 0, max: 19, label: '查无此 CP', desc: '建议作者多安排几场对手戏' },
];

/** 双角色雷达差异度（互补性得分，越高越有趣） */
function complementScore(a: RadarDimension[], b: RadarDimension[]): number {
  const dimMap = new Map(a.map(d => [d.key, d.value]));
  let totalDiff = 0;
  for (const d of b) {
    const va = dimMap.get(d.key) ?? 50;
    totalDiff += Math.abs(va - d.value);
  }
  // 差异度归一化到 0-100
  return Math.round(Math.min(100, totalDiff / (6 * 100) * 100));
}

/** 从双角色的 personalityTraits 重叠找共同点 */
function overlapBonus(a: CharacterProfile, b: CharacterProfile): number {
  const setA = new Set(a.personalityTraits ?? []);
  const setB = new Set(b.personalityTraits ?? []);
  let overlap = 0;
  for (const t of setA) { if (setB.has(t)) overlap++; }
  return Math.min(30, overlap * 10); // 最多 +30
}

/** 关系类型→基础化学反应分 */
function relationBaseScore(a: CharacterProfile, b: CharacterProfile): number {
  const rel = a.relationships?.find(r => r.targetId === b.id)
           ?? b.relationships?.find(r => r.targetId === a.id);
  if (!rel) return 25; // 无预设关系 → 一般般

  const type = rel.type ?? 'other';
  const tension = rel.tensionLevel ?? 50;

  // 关系类型基础分
  const typeScores: Record<string, number> = {
    lover: 85, crush: 75, ex: 80, spouse: 80,
    enemy: 65, rival: 60, nemesis: 70, betrayer: 70,
    friend: 45, childhood: 55, sworn: 50, comrade: 40, ally: 40, partner: 45,
    mentor: 30, classmate: 25, subordinate: 20, servant: 20, protector: 50,
    family: 15, sibling: 15, parent: 10,
  };
  const base = typeScores[type] ?? 25;

  // tensionLevel 加成：张力越大越戏剧性
  const tensionBonus = Math.round(tension * 0.2); // 0-20

  return Math.min(100, base + tensionBonus);
}

/** 计算双角色化学反应得分 */
export function computeChemistry(a: CharacterProfile, b: CharacterProfile): ChemistryResult {
  const dimsA = computeCharacterRadar(a);
  const dimsB = computeCharacterRadar(b);

  const complement = complementScore(dimsA, dimsB);
  const overlap = overlapBonus(a, b);
  const relation = relationBaseScore(a, b);

  // 加权合成：关系基础分(40%) + 互补(35%) + 共同点(25%)
  const raw = Math.round(relation * 0.4 + complement * 0.35 + overlap * 0.25);
  const score = Math.max(0, Math.min(100, raw));

  const rule = LABEL_RULES.find(r => score >= r.min && score <= r.max) ?? LABEL_RULES[LABEL_RULES.length - 1];

  return {
    score,
    label: rule.label,
    description: rule.desc,
    dimsA,
    dimsB,
  };
}

/** 双角色比较雷达 — 合并为 echarts series data */
export function toDualRadarSeries(a: RadarDimension[], b: RadarDimension[], nameA: string, nameB: string) {
  const indicator = a.map(d => ({ name: d.label, max: 100 }));
  const valuesA = a.map(d => d.value);
  const valuesB = b.map(d => d.value);
  return {
    indicator,
    series: [
      { name: nameA, value: valuesA },
      { name: nameB, value: valuesB },
    ],
  };
}
