import type { AgentContext, AgentRole } from '../agents/types.js';
import { inferStartupStorySignals } from '../novel/startup-story-signals.js';
import { inferTopicProfiles } from '../pipeline/topic-profiles.js';
import type { AgentSkillDefinition } from './types.js';
import { normalizeText } from './skill-utils.js';

type StartupPlatformProfile = NonNullable<AgentContext['startupPlatformProfile']>;

type OpeningDimension =
  | 'first-screen'
  | 'goal'
  | 'obstacle'
  | 'early-payoff'
  | 'ending-hook'
  | 'platform-fit'
  | 'word-count';

type OpeningRuleSource = 'baseline' | 'platform' | 'skill';
type OpeningTempo = 'fast' | 'slow' | 'neutral';

type OpeningRule = {
  dimension: OpeningDimension;
  instruction: string;
  priority: number;
  source: OpeningRuleSource;
  sourceLabel: string;
  sourceSkillId?: string;
  tempo: OpeningTempo;
};

export type StartupOpeningStrategyDigest = {
  enabled: boolean;
  brief: string;
  summary: string;
  conflicts: string[];
  consumedSkillIds: string[];
};

export type CompiledStartupOpeningStrategy = StartupOpeningStrategyDigest & {
  remainingSkills: AgentSkillDefinition[];
};

const OPENING_STRATEGY_ROLES = new Set<AgentRole>(['writer', 'editor', 'opening-supervisor']);
const OPENING_TAGS = new Set(['opening', 'startup', 'cold-start', 'retention', 'chapter-hook']);

const DIMENSION_LABELS: Record<OpeningDimension, string> = {
  'first-screen': '首屏抓力',
  goal: '目标清晰',
  obstacle: '阻碍代价',
  'early-payoff': '早期回报',
  'ending-hook': '章末钩子',
  'platform-fit': '平台范式',
  'word-count': '字数控制',
};

const DIMENSION_ORDER: OpeningDimension[] = [
  'first-screen',
  'goal',
  'obstacle',
  'early-payoff',
  'ending-hook',
  'platform-fit',
  'word-count',
];

export function shouldCompileStartupOpeningStrategy(role: AgentRole, context: AgentContext): boolean {
  return OPENING_STRATEGY_ROLES.has(role) && typeof context.chapterNumber === 'number' && context.chapterNumber > 0 && context.chapterNumber <= 3;
}

export function compileStartupOpeningStrategy(params: {
  role: AgentRole;
  context: AgentContext;
  skills: AgentSkillDefinition[];
}): CompiledStartupOpeningStrategy {
  if (!shouldCompileStartupOpeningStrategy(params.role, params.context)) {
    return {
      enabled: false,
      brief: '',
      summary: '',
      conflicts: [],
      consumedSkillIds: [],
      remainingSkills: params.skills,
    };
  }

  const relevantSkills = params.skills.filter(isOpeningStrategySkill);
  const absorbedSkillIds = new Set(relevantSkills.map(skill => skill.id));
  const candidates = [
    ...buildBaselineRules(params.context),
    ...relevantSkills.flatMap(skill => extractSkillRules(skill)),
  ];
  const rulesByDimension = new Map<OpeningDimension, OpeningRule[]>();
  for (const dimension of DIMENSION_ORDER) rulesByDimension.set(dimension, []);
  for (const rule of candidates) {
    rulesByDimension.get(rule.dimension)?.push(rule);
  }

  const conflicts: string[] = [];
  const bullets: string[] = [
    '## 开篇策略整理结果（已去重）',
    '- 以下规则已合并平台底线与开篇技能，不要重复执行同义要求；以本节为准。',
  ];

  for (const dimension of DIMENSION_ORDER) {
    const rules = sortRules(rulesByDimension.get(dimension) ?? []);
    if (rules.length === 0) continue;
    const conflict = detectTempoConflict(dimension, rules);
    if (conflict) conflicts.push(conflict);
    const primary = rules[0];
    const support = rules.find(rule =>
      rule.source === 'skill'
      && rule.sourceSkillId !== primary.sourceSkillId
      && !isNearDuplicate(rule.instruction, primary.instruction),
    );
    bullets.push(`- ${DIMENSION_LABELS[dimension]}：${renderDimensionGuideline(dimension, params.context, primary, support)}`);
  }

  if (conflicts.length > 0) {
    bullets.push(`- 冲突裁定：${conflicts.join('；')}`);
  }

  const consumedCount = absorbedSkillIds.size;
  const summary = `开篇规则已收敛为 ${Math.max(0, bullets.length - 2)} 条执行指令，吸收 ${consumedCount} 条开篇技能${conflicts.length > 0 ? `，裁定 ${conflicts.length} 处冲突` : ''}`;

  return {
    enabled: true,
    brief: bullets.join('\n'),
    summary,
    conflicts,
    consumedSkillIds: [...absorbedSkillIds],
    remainingSkills: params.skills.filter(skill => !absorbedSkillIds.has(skill.id)),
  };
}

function buildBaselineRules(context: AgentContext): OpeningRule[] {
  const profile = context.startupPlatformProfile ?? 'auto';
  const storySignals = inferStartupStorySignals({
    genre: context.genre,
    novelTitle: context.novelTitle,
    novelSynopsis: context.novelSynopsis,
    novelTags: context.novelTags,
    constitutionTags: context.constitutionTags,
  });
  const topicProfiles = inferTopicProfiles({
    genre: context.genre,
    novelTitle: context.novelTitle,
    novelSynopsis: context.novelSynopsis,
    novelTags: context.novelTags,
    constitutionTags: context.constitutionTags,
  });
  const wordCountTarget = context.maxWordCount != null && context.maxWordCount > 0
    ? Math.trunc(context.maxWordCount)
    : null;
  const rules: OpeningRule[] = [
    createBaselineRule('first-screen', '前 300-500 字必须出现异常、冲突、损失或倒计时，禁止纯背景/纯氛围起手。', 100),
    createBaselineRule('goal', '前 1000 字内要让读者看清主角眼下要做什么、为什么必须做。', 100),
    createBaselineRule('obstacle', '目标刚立住就要给阻碍、代价或更大威胁，不能让推进空转。', 98),
    createBaselineRule('early-payoff', '前 3000 字内必须交付一次明确回报：能力展示、局势反转、情绪兑现或关键信息收益。', 100),
    createBaselineRule('ending-hook', '章末必须新增一个会逼读者点下一章的东西，例如新决策、倒计时、可见回报后的更大代价，或更大的麻烦。', 99),
    createBaselineRule('platform-fit', '前三章不允许慢热空转，平台范式优先于个人习惯。', 97),
    createBaselineRule(
      'word-count',
      wordCountTarget
        ? `围绕 ${wordCountTarget} 字目标组织信息，优先保留冲突、目标、回报，砍掉大段解释与重复铺垫。`
        : '优先保留冲突、目标、回报，删除大段解释与重复铺垫，避免开篇失速。',
      96,
    ),
  ];

  if (profile === 'fanqie') {
    rules.push(
      createPlatformRule('platform-fit', profile, '番茄范式：冲突要直给，情绪要前置，少解释、多结果，尽快给读者爽点或情绪刺激。', 105),
      createPlatformRule('early-payoff', profile, '番茄前三章要更早兑现回报，最好在首章就给到一次明确的赢、打脸或强情绪反转。', 104),
    );
  } else if (profile === 'qidian') {
    rules.push(
      createPlatformRule('platform-fit', profile, '起点范式：尽快立住主角身份、优势切口和世界规则，用事件带出升级方向，不要靠长说明灌设定。', 105),
      createPlatformRule('early-payoff', profile, '起点前三章尽快验证主角能力、资源或规则优势，让读者看到后续升级空间。', 104),
    );
  } else {
    rules.push(createPlatformRule('platform-fit', profile, '自动范式：优先保留最强钩子与可读性，但前三章仍必须快进主线，不做慢热试探。', 101));
  }

  for (const topicProfile of topicProfiles) {
    for (const rule of topicProfile.openingRules ?? []) {
      rules.push(createBaselineRule(rule.dimension, rule.instruction, rule.priority));
    }
  }

  if (storySignals.has('food-business') || storySignals.has('farming-survival')) {
    rules.push(
      createBaselineRule('first-screen', '美食/种田求生首章要尽快让主角动手活命：找食材、生火、和面、开灶、摆摊等动作必须靠前，苦情回忆只准点到为止。', 103),
      createBaselineRule('early-payoff', '美食/经营首章的第一次大回报必须是闻香围拢、当场试吃、第一笔铜板、开张或口碑起量，不能只让某个神秘人物私下注意主角。', 104),
      createBaselineRule('platform-fit', '这类题材首章要先让读者看到“她靠手艺活下来并开始翻身”，不能把篇幅主要耗在寒冷、饥饿和来历不凡的路人身上。', 102),
    );
  }

  if (storySignals.has('romance-rivals')) {
    rules.push(
      createBaselineRule('first-screen', '死对头/欢喜冤家题材首章前段必须尽快把双方推到同一现场，正面碰撞早于身份猜测和旁人转述。', 103),
      createBaselineRule('early-payoff', '这类题材首章主回报应是互怼火花、强制同框、护短失控、关系站位变化或被迫合作，不要用“他/她很神秘”代替关系回报。', 104),
      createBaselineRule('platform-fit', '如果书名卖的是死对头，就先写针锋相对和拉扯，不要先让两人长期分开各自筹备。', 102),
    );
  }

  return rules;
}

function createBaselineRule(dimension: OpeningDimension, instruction: string, priority: number): OpeningRule {
  return {
    dimension,
    instruction,
    priority,
    source: 'baseline',
    sourceLabel: '开篇底线',
    tempo: inferTempo(instruction),
  };
}

function createPlatformRule(
  dimension: OpeningDimension,
  profile: StartupPlatformProfile,
  instruction: string,
  priority: number,
): OpeningRule {
  return {
    dimension,
    instruction,
    priority,
    source: 'platform',
    sourceLabel: `平台范式:${profile}`,
    tempo: inferTempo(instruction),
  };
}

function isOpeningStrategySkill(skill: AgentSkillDefinition): boolean {
  const tags = new Set(skill.tags.map(item => item.toLowerCase()));
  if ([...OPENING_TAGS].some(tag => tags.has(tag))) return true;
  const haystack = `${skill.name}\n${skill.description}\n${skill.instruction}`;
  return /(开篇|前三章|首章|首屏|黄金三章|冷启动|留存|章末钩子|前\s*(300|500|800|1000|1500|3000)\s*字)/.test(haystack);
}

function extractSkillRules(skill: AgentSkillDefinition): OpeningRule[] {
  const lines = skill.instruction
    .split(/\r?\n+/)
    .map(line => normalizeText(line.replace(/^[\d一二三四五六七八九十]+[\.、:：)\]]\s*/, '').replace(/^-+\s*/, '')))
    .filter(line => line.length >= 6)
    .filter(line => !/^【.+】$/.test(line));

  const rules: OpeningRule[] = [];
  for (const line of lines) {
    const dimensions = classifyDimensions(line);
    const resolvedDimensions: OpeningDimension[] = dimensions.length > 0 ? dimensions : ['platform-fit'];
    for (const dimension of resolvedDimensions) {
      rules.push({
        dimension,
        instruction: line,
        priority: Math.max(1, Math.trunc(skill.priority ?? 50)),
        source: 'skill',
        sourceLabel: skill.name,
        sourceSkillId: skill.id,
        tempo: inferTempo(line),
      });
    }
  }
  return rules;
}

function classifyDimensions(line: string): OpeningDimension[] {
  const text = line.replace(/\s+/g, '');
  const found = new Set<OpeningDimension>();

  if (/(首屏|开头|开篇|前300字|前500字|前800字|第一章.*冲突|500字内进入冲突)/.test(text)) {
    found.add('first-screen');
  }
  if (/(目标|动机|求生|崛起|复仇|短期目标|要做什么|必须做)/.test(text)) {
    found.add('goal');
  }
  if (/(阻碍|阻力|威胁|代价|困境|危机|倒计时|压迫|风险)/.test(text)) {
    found.add('obstacle');
  }
  if (/(回报|爽点|反转|能力展示|金手指|打脸|翻身|首次胜利|收益|兑现)/.test(text)) {
    found.add('early-payoff');
  }
  if (/(章末|结尾|收尾|钩子|最后2-4段|最后.*揭示|最后.*决策)/.test(text)) {
    found.add('ending-hook');
  }
  if (/(番茄|起点|平台|短平快|情绪|设定|世界规则|升级|无线风|免费阅读)/.test(text)) {
    found.add('platform-fit');
  }
  if (/(字数|篇幅|压缩|精简|禁止大段|不要大段|长说明|铺垫过长|砍掉)/.test(text)) {
    found.add('word-count');
  }

  return [...found];
}

function inferTempo(text: string): OpeningTempo {
  if (/(快|立刻|立即|尽快|迅速|直接|短平快|前300字|前500字|前1000字|首章就|前三章内必须)/.test(text)) {
    return 'fast';
  }
  if (/(慢热|徐徐|铺垫优先|氛围先行|克制|后置|延后|压后)/.test(text)) {
    return 'slow';
  }
  return 'neutral';
}

function sortRules(rules: OpeningRule[]): OpeningRule[] {
  return [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.source !== b.source) {
      const rank = sourceRank(b.source) - sourceRank(a.source);
      if (rank !== 0) return rank;
    }
    return a.instruction.localeCompare(b.instruction, 'zh-CN');
  });
}

function sourceRank(source: OpeningRuleSource): number {
  if (source === 'platform') return 3;
  if (source === 'baseline') return 2;
  return 1;
}

function detectTempoConflict(dimension: OpeningDimension, rules: OpeningRule[]): string | null {
  const hasFast = rules.some(rule => rule.tempo === 'fast');
  const hasSlow = rules.some(rule => rule.tempo === 'slow');
  if (!hasFast || !hasSlow) return null;
  const winner = rules.find(rule => rule.tempo === 'fast') ?? rules[0];
  return `${DIMENSION_LABELS[dimension]}已按「平台底线 > 平台范式 > 技能优先级」裁定，保留更快推进的要求（当前优先来源：${winner.sourceLabel}）`;
}

function renderDimensionGuideline(
  dimension: OpeningDimension,
  context: AgentContext,
  primary: OpeningRule,
  support?: OpeningRule,
): string {
  const base = synthesizeDimensionBase(dimension, context, primary.instruction);
  if (!support || support.source !== 'skill') return base;
  const supportText = truncateSupportInstruction(support.instruction);
  if (!supportText || isNearDuplicate(base, supportText)) return base;
  return `${base} 补充：${supportText}`;
}

function synthesizeDimensionBase(
  dimension: OpeningDimension,
  context: AgentContext,
  instruction: string,
): string {
  if (dimension === 'word-count') {
    const target = context.maxWordCount != null && context.maxWordCount > 0 ? Math.trunc(context.maxWordCount) : null;
    return target
      ? `围绕 ${target} 字目标取舍信息，优先保留冲突、目标、回报，删掉大段解释。`
      : '优先保留冲突、目标、回报，删除大段解释与重复铺垫。';
  }

  if (dimension === 'platform-fit') {
    const profile = context.startupPlatformProfile ?? 'auto';
    if (profile === 'fanqie') {
      return '按番茄范式写，矛盾直给、情绪前置、结果优先，别把关键刺激拖后。';
    }
    if (profile === 'qidian') {
      return '按起点范式写，尽快立住主角切口、规则入口和升级空间，用事件带设定。';
    }
    return truncateSupportInstruction(instruction) || '按当前平台范式保留最强钩子，不做慢热空转。';
  }

  const compact = truncateSupportInstruction(instruction);
  if (compact) return compact;

  return instruction;
}

function truncateSupportInstruction(value: string): string {
  const compact = normalizeText(value.replace(/（.*?）/g, '').replace(/\(.+?\)/g, '').replace(/\s+/g, ' '));
  return compact.length > 56 ? `${compact.slice(0, 56)}…` : compact;
}

function isNearDuplicate(left: string, right: string): boolean {
  const a = left.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  const b = right.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}
