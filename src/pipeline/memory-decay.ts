/**
 * 记忆衰减策略
 *
 * 对超长篇小说（50+章），按距离衰减非关键信息的权重。
 * 关键信息（角色死亡、重大事件、世界规则变更）永不衰减。
 * 非关键信息（情绪状态、临时位置、小冲突）随距离衰减。
 */

/** Keywords that mark critical, non-decayable information */
const CRITICAL_MARKERS = [
  // 死亡与陨落
  '死亡', '殒命', '牺牲', '阵亡', '身亡', '陨落', '自爆', '灰飞烟灭',
  // 修炼与境界突破
  '突破', '晋级', '觉醒', '进化', '渡劫', '飞升', '斩杀',
  // 背叛与阵营变动
  '背叛', '叛变', '反水', '黑化', '洗白', '谋反',
  // 真相与揭露
  '真相', '秘密揭露', '身份揭露',
  // 联盟与政治
  '结盟', '联盟破裂', '登基', '废帝', '夺权',
  // 战争
  '战争', '开战', '停战',
  // 规则与世界变更
  '规则变更', '法则',
  // 重大获得与传承
  '获得神器', '传承', '血脉', '绑定系统',
  // 人生大事
  '婚', '怀孕', '诞生', '表白', '分手', '离婚', '认亲',
  // 封印与解放
  '封印', '解封',
  // 灭绝与毁灭
  '灭门', '灭族', '覆灭', '毁灭',
  // 穿越与重生
  '穿越', '重生',
];

/**
 * Check if a piece of information is critical (should never decay)
 */
export function isCriticalInfo(text: string): boolean {
  return CRITICAL_MARKERS.some(marker => text.includes(marker));
}

/**
 * Calculate decay factor based on chapter distance.
 * Returns a value between 0 and 1.
 * - Distance 0-10: no decay (1.0)
 * - Distance 10-30: gradual decay
 * - Distance 30-50: significant decay
 * - Distance 50+: heavy decay (0.2 minimum)
 *
 * If milestoneType is provided, a higher floor is applied based on the
 * narrative significance of the event (e.g. character_death never decays).
 */

type MilestoneType =
  | 'plot_twist' | 'character_death' | 'revelation' | 'power_shift'
  | 'alliance_change' | 'world_change' | 'betrayal' | 'reunion';

/** Minimum decay floor per milestone type — higher = more resistant to decay */
const MILESTONE_DECAY_FLOORS: Record<MilestoneType, number> = {
  character_death: 1.0,   // never decays
  betrayal: 0.95,
  revelation: 0.90,
  plot_twist: 0.90,
  power_shift: 0.85,
  alliance_change: 0.80,
  world_change: 0.80,
  reunion: 0.70,
};

export function calculateDecayFactor(
  currentChapter: number,
  entryChapter: number,
  milestoneType?: MilestoneType,
): number {
  const distance = currentChapter - entryChapter;
  let base: number;
  if (distance <= 10) base = 1.0;
  else if (distance <= 30) base = 1.0 - (distance - 10) * 0.02; // 1.0 → 0.6
  else if (distance <= 50) base = 0.6 - (distance - 30) * 0.015; // 0.6 → 0.3
  else base = 0.2; // minimum floor

  if (milestoneType) {
    const floor = MILESTONE_DECAY_FLOORS[milestoneType] ?? 0.2;
    return Math.max(base, floor);
  }

  return base;
}
