import type { PacingProfile } from '../novel/types.js';

/** 对话检测：中文引号包裹的内容 */
const DIALOGUE_RE = /[\u201c\u300c][\s\S]*?[\u201d\u300d]/g;

/** 动作动词 */
const ACTION_WORDS = [
  '挥', '砍', '刺', '跑', '跳', '冲', '闪', '抓', '推', '拉', '踢', '打',
  '举', '扔', '挡', '躲', '劈', '斩', '射', '飞', '扑', '撞', '滚', '翻',
  '攻', '守', '退', '追', '逃', '挣', '搏', '击', '拔', '握', '捏', '撕',
];

/** 心理词汇 */
const PSYCHOLOGY_WORDS = [
  '想', '觉得', '心中', '暗想', '心道', '意识到', '感到', '心头', '内心',
  '思绪', '念头', '暗忖', '寻思', '琢磨', '犹豫', '纠结', '担忧', '恐惧',
  '期待', '渴望', '回忆', '思索', '沉思', '默想', '心想', '暗道',
];

/** 描写词汇（感官） */
const DESCRIPTION_WORDS = [
  '阳光', '月光', '风', '雨', '雪', '花', '树', '山', '水', '天空',
  '色', '光芒', '气息', '声音', '味道', '香气', '寒意', '暖意', '雾',
  '云', '星', '夜', '晨', '暮', '霞', '影', '波', '浪', '烟',
];

/**
 * 分析章节内容的节奏分布
 */
export function analyzePacing(content: string): PacingProfile {
  const paragraphs = content.split(/\n+/).filter(p => p.trim().length > 10);
  if (paragraphs.length === 0) {
    return { dialogue: 0, action: 0, description: 0, psychology: 0, narration: 0 };
  }

  let dialogueChars = 0;
  let actionChars = 0;
  let descriptionChars = 0;
  let psychologyChars = 0;
  let narrationChars = 0;

  for (const para of paragraphs) {
    const len = para.length;

    // 对话占比
    const dialogueMatches = para.match(DIALOGUE_RE) || [];
    const dialogueLen = dialogueMatches.reduce((sum, m) => sum + m.length, 0);
    dialogueChars += dialogueLen;

    const nonDialogue = len - dialogueLen;
    if (nonDialogue <= 0) continue;

    // 对非对话部分按关键词密度分类
    const actionScore = ACTION_WORDS.filter(w => para.includes(w)).length;
    const psychScore = PSYCHOLOGY_WORDS.filter(w => para.includes(w)).length;
    const descScore = DESCRIPTION_WORDS.filter(w => para.includes(w)).length;
    const total = actionScore + psychScore + descScore;

    if (total === 0) {
      narrationChars += nonDialogue;
    } else {
      actionChars += nonDialogue * (actionScore / total);
      psychologyChars += nonDialogue * (psychScore / total);
      descriptionChars += nonDialogue * (descScore / total);
    }
  }

  const totalChars = dialogueChars + actionChars + descriptionChars + psychologyChars + narrationChars || 1;
  return {
    dialogue: Math.round((dialogueChars / totalChars) * 100) / 100,
    action: Math.round((actionChars / totalChars) * 100) / 100,
    description: Math.round((descriptionChars / totalChars) * 100) / 100,
    psychology: Math.round((psychologyChars / totalChars) * 100) / 100,
    narration: Math.round((narrationChars / totalChars) * 100) / 100,
  };
}

/**
 * 检测连续章节节奏单调性（余弦相似度 > 0.95）
 */
export function detectMonotony(profiles: PacingProfile[]): boolean {
  if (profiles.length < 2) return false;
  const last = profiles[profiles.length - 1];
  const prev = profiles[profiles.length - 2];

  const keys: (keyof PacingProfile)[] = ['dialogue', 'action', 'description', 'psychology', 'narration'];
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const k of keys) {
    dot += last[k] * prev[k];
    magA += last[k] * last[k];
    magB += prev[k] * prev[k];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  const similarity = magA && magB ? dot / (magA * magB) : 0;
  return similarity > 0.95;
}

const PACING_LABELS: Record<string, string> = {
  dialogue: '对话',
  action: '动作',
  description: '描写',
  psychology: '心理',
  narration: '叙述',
};

/**
 * 构建节奏变化提示（注入 Writer 上下文）
 */
export function buildPacingVariationHints(profile: PacingProfile): string {
  const entries = Object.entries(profile) as [keyof PacingProfile, number][];
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0];
  const weak = sorted[sorted.length - 1];
  return `前几章 ${PACING_LABELS[dominant[0]]} 占比偏高（${Math.round(dominant[1] * 100)}%），${PACING_LABELS[weak[0]]} 偏少（${Math.round(weak[1] * 100)}%），本章请适当调整节奏，增加 ${PACING_LABELS[weak[0]]} 内容。`;
}
