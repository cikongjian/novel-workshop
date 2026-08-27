import type { Chapter, CharacterProfile } from '../novel/types.js';
import type { CharacterConsistencyReport } from '../novel/character-consistency.js';
import type { StyleDNA } from '../style/style-types.js';
import { buildStyleDNAPrompt } from '../style/style-prompt-builder.js';
import {
  buildTemplatePatternExampleList,
  countTemplatePatternHits,
  templatePatternsByCategory,
} from './template-patterns.js';
export { buildScenePlanFromOutline } from './scene-plan.js';

export const STYLE_PRESET_VALUES = [
  'auto',
  'serious',
  'comedy',
  'wacky',
  'historical',
  'xianxia',
  'wuxia',
  'suspense',
  'horror',
  'campus',
  'workplace',
  'political',
  'hard-scifi',
  'romance-sweet',
  'romance-angst',
] as const;

export type StylePreset = typeof STYLE_PRESET_VALUES[number];

export type ConsistencyGuardrailThresholds = {
  minConflictRate: number;
  minHumanityRate: number;
  minStabilityScore: number;
};

export type AntiTemplateThresholds = {
  repeatedOpenerMinCount: number;
  repeatedClicheMinCount: number;
  lookbackChapters: number;
};

export type AntiAiTellsThresholds = {
  enabled: boolean;
  repeatedMinCount: number;
  maxExamples: number;
  maxFrequentItems: number;
};

export type AntiAiStructureThresholds = {
  enabled: boolean;
  transitionWordsPer1kMax: number;
  repeatedMinCount: number;
  maxExamples: number;
  maxFrequentItems: number;
};

export type ChapterEnhancementThresholds = {
  consistency: ConsistencyGuardrailThresholds;
  antiTemplate: AntiTemplateThresholds;
  antiAiTells: AntiAiTellsThresholds;
  antiAiStructure: AntiAiStructureThresholds;
};

const DEFAULT_THRESHOLDS: ChapterEnhancementThresholds = {
  consistency: {
    minConflictRate: 30,
    minHumanityRate: 45,
    minStabilityScore: 45,
  },
  antiTemplate: {
    repeatedOpenerMinCount: 2,
    repeatedClicheMinCount: 3,
    lookbackChapters: 3,
  },
  antiAiTells: {
    enabled: true,
    repeatedMinCount: 2,
    maxExamples: 18,
    maxFrequentItems: 8,
  },
  antiAiStructure: {
    enabled: true,
    transitionWordsPer1kMax: 8,
    repeatedMinCount: 2,
    maxExamples: 16,
    maxFrequentItems: 8,
  },
};

const STYLE_ALIASES: Record<string, StylePreset> = {
  auto: 'auto',
  serious: 'serious',
  comedy: 'comedy',
  wacky: 'wacky',
  historical: 'historical',
  xianxia: 'xianxia',
  wuxia: 'wuxia',
  suspense: 'suspense',
  horror: 'horror',
  campus: 'campus',
  workplace: 'workplace',
  political: 'political',
  'hard-scifi': 'hard-scifi',
  'romance-sweet': 'romance-sweet',
  'romance-angst': 'romance-angst',
  xuanhuan: 'xianxia',
  detective: 'suspense',
  thriller: 'suspense',
  sci: 'hard-scifi',
  正剧: 'serious',
  搞笑: 'comedy',
  逗比: 'wacky',
  历史: 'historical',
  仙侠: 'xianxia',
  武侠: 'wuxia',
  悬疑: 'suspense',
  惊悚: 'horror',
  校园: 'campus',
  职场: 'workplace',
  权谋: 'political',
  科幻: 'hard-scifi',
  甜宠: 'romance-sweet',
  虐恋: 'romance-angst',
};

const STYLE_GUIDE_MAP: Record<Exclude<StylePreset, 'auto'>, string[]> = {
  serious: [
    '叙事克制，不喊口号；关键行动必须交代动机与代价。',
    '保证因果闭环，避免“事件发生但没有后果”。',
    '对话短句高信息密度，减少空泛情绪宣告。',
  ],
  comedy: [
    '笑点服务人物关系与剧情推进，不堆段子。',
    '优先使用“铺垫 -> 反差 -> 回扣”结构，避免重复包袱。',
    '笑点后补一拍情绪或信息，保持章节重心。',
  ],
  wacky: [
    '允许夸张和荒诞，但角色底层动机必须可信。',
    '段落更短、节奏更快，每个场景都要有事件推进。',
    '控制无效玩梗，避免脱离主线。',
  ],
  historical: [
    '语言保持时代质感但可读，避免生僻词堆砌。',
    '制度、礼法、地名保持一致，不随意漂移。',
    '决策符合身份边界与时代约束，避免现代思维硬套。',
  ],
  xianxia: [
    '境界、法则、代价要可追踪，避免无成本变强。',
    '奇观描写必须服务人物选择，而非名词展示。',
    '升级与突破要有风险、牺牲或关系变化。',
  ],
  wuxia: [
    '动作场景突出招式因果与地形利用，不空转描写。',
    '江湖关系网持续推进，恩怨与信誉要有后果。',
    '对话保留江湖气，减少现代口头禅。',
  ],
  suspense: [
    '每个场景至少投放一条线索或误导，并保证可回收。',
    '信息披露分层推进，避免一次性抛完答案。',
    '章节结尾保留明确待解问题，驱动续读。',
  ],
  horror: [
    '先建立秩序，再逐步引入异常并升级威胁。',
    '恐惧来源可解释，避免纯跳吓堆砌。',
    '感官描写优先听觉与触觉，减少冗长说明。',
  ],
  campus: [
    '围绕学业、关系与身份认同推进冲突。',
    '日常细节具体可感，不空泛抒情。',
    '每章至少推进一次关系状态。',
  ],
  workplace: [
    '冲突聚焦目标、资源、职责边界，不灌鸡汤。',
    '业务术语适量且准确，体现决策链。',
    '成长通过能力迁移与代价体现，不靠突然开挂。',
  ],
  political: [
    '决策要交代利益结构、约束条件与风险收益。',
    '对话强调试探、交换、让渡与博弈。',
    '每次胜负都改变权力格局并留下后果。',
  ],
  'hard-scifi': [
    '核心设定遵守自洽规则，边界与副作用清晰。',
    '科学解释点到为止，优先服务冲突与选择。',
    '保持“问题 -> 实验 -> 反馈 -> 修正”的推进链。',
  ],
  'romance-sweet': [
    '情感推进分层：升温、确认、承诺兑现。',
    '甜点必须绑定主线事件，不孤立撒糖。',
    '人物表达保持差异化语气，避免同质化对白。',
  ],
  'romance-angst': [
    '冲突来自价值观或现实约束，不靠误会拖时长。',
    '高压情绪后必须给出修复动作或新信息。',
    '虐点应服务成长或关系重构，避免空耗。',
  ],
};

const CLICHE_PATTERNS: Array<{ pattern: RegExp; label: string }> = templatePatternsByCategory('cliche')
  .map(item => ({ pattern: item.pattern, label: item.label }));

function scoreRole(character: CharacterProfile): number {
  if (character.role === 'protagonist') return 100;
  if (character.role === 'deuteragonist') return 90;
  if (character.role === 'antagonist' || character.role === 'rival') return 80;
  if (character.role === 'love_interest' || character.role === 'mentor' || character.role === 'ally' || character.role === 'faction_leader') return 70;
  if (character.role === 'supporting' || character.role === 'family' || character.role === 'comic_relief') return 60;
  return 40;
}

function extractFirstSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const match = cleaned.match(/^(.{1,60}?[。！？!?])/);
  if (match) return match[1].trim();
  return cleaned.slice(0, 60).trim();
}

function normalizeStylePreset(input?: string): StylePreset {
  if (!input) return 'auto';
  const normalized = input.trim().toLowerCase();
  return STYLE_ALIASES[normalized] ?? STYLE_ALIASES[input.trim()] ?? 'auto';
}

function inferAutoStylePreset(params: {
  genre: string;
  userDirection?: string;
  styleNotes?: string;
}): Exclude<StylePreset, 'auto'> {
  const haystack = `${params.genre} ${params.userDirection ?? ''} ${params.styleNotes ?? ''}`.toLowerCase();
  const has = (keywords: string[]): boolean => keywords.some(keyword => haystack.includes(keyword));

  if (has(['仙侠', '修仙', '宗门', '飞升', '灵根'])) return 'xianxia';
  if (has(['武侠', '江湖', '门派', '侠客'])) return 'wuxia';
  if (has(['悬疑', '推理', '破案', '线索', '谜案'])) return 'suspense';
  if (has(['惊悚', '恐怖', '怪谈', '诡异'])) return 'horror';
  if (has(['校园', '青春', '高三', '大学'])) return 'campus';
  if (has(['职场', '公司', '项目', 'kpi', '汇报'])) return 'workplace';
  if (has(['权谋', '朝堂', '党争', '内阁', '政变'])) return 'political';
  if (has(['科幻', '星舰', '太空', '量子', '实验'])) return 'hard-scifi';
  if (has(['甜宠', '恋爱', '双向奔赴', '撒糖'])) return 'romance-sweet';
  if (has(['虐恋', '追妻火葬场', 'be', '虐心'])) return 'romance-angst';

  if (params.genre === 'historical') return 'historical';
  if (params.genre === 'mystery') return 'suspense';
  if (params.genre === 'scifi') return 'hard-scifi';
  if (params.genre === 'romance') return 'romance-sweet';
  return 'serious';
}

export function buildStyleGuide(params: {
  genre: string;
  stylePreset?: string;
  userDirection?: string;
  styleNotes?: string;
  styleDna?: StyleDNA | null;
}): { resolvedPreset: StylePreset; styleGuide: string } {
  const normalized = normalizeStylePreset(params.stylePreset);
  const resolvedPreset = normalized === 'auto'
    ? inferAutoStylePreset({
      genre: params.genre,
      userDirection: params.userDirection,
      styleNotes: params.styleNotes,
    })
    : normalized;
  const guideLines = STYLE_GUIDE_MAP[resolvedPreset];
  const custom = (params.styleNotes ?? '').trim();
  const lines = [
    `目标文风：${resolvedPreset}`,
    ...guideLines.map(line => `- ${line}`),
    '- 对话表达禁止“括号状态标签+台词”写法（例如：`（冷笑）“……”`、`“……”（咬牙）`）。',
    '- 需要表达语气、声线、动作时，改为读者可直接感知的叙述或直给台词，不使用括号注释。',
    '- 括号仅用于系统元数据标记（如 `(#角色名)` / `(#死亡:角色名)` / `(#退场:角色名)`）。',
  ];
  if (custom) {
    lines.push(`- 用户补充风格要求：${custom}`);
  }

  if (params.styleDna?.enabled) {
    const dnaPrompt = buildStyleDNAPrompt(params.styleDna);
    let finalGuide = lines.join('\n') + '\n\n' + dnaPrompt;

    // 如果有 LLM 生成的风格指南，追加到最后
    if (params.styleDna.styleGuide) {
      finalGuide += '\n\n## 参考文本风格指南（严格遵循）\n\n' + params.styleDna.styleGuide;
    }

    return {
      resolvedPreset,
      styleGuide: finalGuide,
    };
  }

  return {
    resolvedPreset,
    styleGuide: lines.join('\n'),
  };
}

export function selectKeyCharacters(characters: CharacterProfile[]): CharacterProfile[] {
  return [...characters]
    .sort((a, b) => {
      const roleDiff = scoreRole(b) - scoreRole(a);
      if (roleDiff !== 0) return roleDiff;
      return (a.firstAppearance ?? Number.MAX_SAFE_INTEGER)
        - (b.firstAppearance ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, 5);
}

export function buildConsistencyGuardrails(
  reports: Array<{ character: CharacterProfile; report: CharacterConsistencyReport }>,
  thresholds: ConsistencyGuardrailThresholds = DEFAULT_THRESHOLDS.consistency,
): string {
  const lines: string[] = [];
  for (const { character, report } of reports) {
    if (report.chapterCount < 2) continue;
    if (report.conflictRate < thresholds.minConflictRate) {
      lines.push(`- ${character.name}：本章至少安排 1 次显性冲突（外部阻力或关系拉扯）。`);
    }
    if (report.humanityRate < thresholds.minHumanityRate) {
      lines.push(`- ${character.name}：补一处“欲望与代价”矛盾，避免工具人化。`);
    }
    if (report.stabilityScore < thresholds.minStabilityScore) {
      lines.push(`- ${character.name}：重大情绪或立场变化必须写出触发事件与证据。`);
    }
    if (report.alerts.some(alert => alert.type === 'abrupt-shift')) {
      lines.push(`- ${character.name}：避免无铺垫突变，先铺垫再转向。`);
    }
  }
  if (lines.length === 0) return '';
  return ['角色一致性门禁（优先满足）', ...lines].join('\n');
}

export function buildAntiTemplateRules(
  previousChapters: Chapter[],
  thresholds: AntiTemplateThresholds = DEFAULT_THRESHOLDS.antiTemplate,
): string {
  if (previousChapters.length === 0) return '';

  const rules: string[] = [];
  const openerCounter = new Map<string, number>();
  for (const chapter of previousChapters) {
    const opener = extractFirstSentence(chapter.content);
    if (!opener) continue;
    openerCounter.set(opener, (openerCounter.get(opener) ?? 0) + 1);
  }

  const repeatedOpeners = [...openerCounter.entries()]
    .filter(([, count]) => count >= thresholds.repeatedOpenerMinCount)
    .map(([opener]) => opener)
    .slice(0, 2);
  if (repeatedOpeners.length > 0) {
    rules.push(`- 避免重复以下开场句式：${repeatedOpeners.join(' / ')}`);
  }

  const merged = previousChapters.map(ch => ch.content).join('\n');
  const clicheHits = CLICHE_PATTERNS
    .map(item => ({ ...item, count: (merged.match(item.pattern) ?? []).length }))
    .filter(item => item.count >= thresholds.repeatedClicheMinCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  if (clicheHits.length > 0) {
    rules.push(`- 降低高频套话：${clicheHits.map(item => item.label).join('、')}`);
  }

  if (rules.length === 0) return '';
  return [
    '去模板化写作约束',
    ...rules,
    '- 相邻三段避免同构句式，至少做一次叙事节奏变化。',
  ].join('\n');
}

export function buildAntiAiTellsRules(
  previousChapters: Chapter[],
  thresholds: AntiAiTellsThresholds = DEFAULT_THRESHOLDS.antiAiTells,
): string {
  if (!thresholds.enabled) return '';

  const baseExamples = buildTemplatePatternExampleList({
    categories: ['ai-tell'],
    maxItems: thresholds.maxExamples,
  });

  const rules: string[] = [
    'AI 痕迹规避（负面清单，宁缺勿滥）',
    baseExamples
      ? `- 尽量不要直接使用以下“通用微动作/氛围模板句”（必须表达时，请改写为更具体、更贴合人物与场景的独特细节）：${baseExamples}`
      : '- 尽量不要用“通用微动作/氛围模板句”直接代替情绪与信息（示例展示已关闭）。',
    '- 同一段落不要叠加多个“情绪=微动作”的模板反应（如 呼吸一滞/心头一紧/指节发白 这类），最多保留一个，并让它与因果链绑定。',
    '- 命中高频模板句时，强制改写为“触发事件 → 角色反应动作 → 可见后果”，禁止只写抽象情绪词。',
    '- 若出现“发白/发紧/一滞/一沉”等微动作词，同段落其余同类表达必须替换为可观测行为（如停笔错字、打翻茶盏、脚步停顿）。',
  ];

  if (previousChapters.length > 0) {
    const merged = previousChapters.map(ch => ch.content).join('\n');
    const frequent = countTemplatePatternHits(merged, ['ai-tell'])
      .filter(item => item.count >= thresholds.repeatedMinCount)
      .slice(0, thresholds.maxFrequentItems);
    if (frequent.length > 0) {
      rules.push(`- 你近期高频使用（本章优先替换）：${frequent.map(item => item.label).join('、')}`);
    }
  }

  return rules.join('\n');
}

const TRANSITION_WORD_RE = /然而|但是|不过|却|与此同时|忽然|下一刻|随即|旋即|直到|最终|就在这时/g;

export function buildAntiAiStructureRules(
  previousChapters: Chapter[],
  thresholds: AntiAiStructureThresholds = DEFAULT_THRESHOLDS.antiAiStructure,
): string {
  if (!thresholds.enabled) return '';

  const baseExamples = buildTemplatePatternExampleList({
    categories: ['ai-structure', 'ai-meta'],
    maxItems: thresholds.maxExamples,
  });

  const rules: string[] = [
    '结构性 AI 痕迹规避（负面清单）',
    baseExamples
      ? `- 避免“总结腔/条理腔/写作meta”口吻（小说正文里会显得像分析报告）：${baseExamples}`
      : '- 避免“总结腔/条理腔/写作meta”口吻（示例展示已关闭）。',
    '- 不要用“首先/其次/最后/总而言之/不难发现/值得一提”等词来组织段落；用事件推进、动作因果、对话潜台词来完成“逻辑”。',
    `- 转折连接词不要高密度堆叠（目标：每 1000 字 ≤ ${thresholds.transitionWordsPer1kMax} 次；相邻两句避免重复同一转折词）。`,
  ];

  if (previousChapters.length > 0) {
    const merged = previousChapters.map(ch => ch.content).join('\n');
    const frequent = countTemplatePatternHits(merged, ['ai-structure', 'ai-meta'])
      .filter(item => item.count >= thresholds.repeatedMinCount)
      .slice(0, thresholds.maxFrequentItems);
    if (frequent.length > 0) {
      rules.push(`- 你近期高频使用（本章优先替换）：${frequent.map(item => item.label).join('、')}`);
    }

    const transitionCount = (merged.match(TRANSITION_WORD_RE) ?? []).length;
    const per1k = merged.length > 0 ? Math.round((transitionCount / (merged.length / 1000)) * 10) / 10 : 0;
    if (per1k > thresholds.transitionWordsPer1kMax) {
      rules.push(`- 你近期转折词密度偏高（约 ${per1k}/千字），本章请用“动作/信息增量/因果”替代部分转折词。`);
    }
  }

  return rules.join('\n');
}

// ── 章节开头多样化检测 ──────────────────────────────────

/** 开头类型分类模式 */
const OPENING_TYPE_PATTERNS: { type: string; patterns: RegExp[] }[] = [
  {
    type: '环境/天气开头',
    patterns: [
      /^[^\n]{0,20}(阳光|月光|晨光|暮色|夜色|天色|风|雨|雪|雾|云|霞|星)/,
      /^[^\n]{0,20}(清晨|黄昏|傍晚|深夜|拂晓|正午)/,
    ],
  },
  {
    type: '回顾前情开头',
    patterns: [
      /^[^\n]{0,30}(自从|自那以后|距离|过去了|已经.*天|上次)/,
      /^[^\n]{0,30}(回想|想起|记得|昨天|前几日)/,
    ],
  },
  {
    type: '动作切入',
    patterns: [
      /^[^\n]{0,10}(猛地|一把|飞身|拔出|冲|扑|闪|挡|砸|踢|抓)/,
    ],
  },
  {
    type: '对话切入',
    patterns: [
      /^[^\n]{0,5}(#[^\n)]+\))?"/,
    ],
  },
  {
    type: '感官冲击',
    patterns: [
      /^[^\n]{0,20}(刺痛|灼热|冰冷|腥味|恶臭|轰鸣|尖啸|刺耳)/,
    ],
  },
];

function classifyOpening(content: string): string {
  const firstLine = content.slice(0, 200);
  for (const { type, patterns } of OPENING_TYPE_PATTERNS) {
    if (patterns.some(p => p.test(firstLine))) return type;
  }
  return '其他';
}

export function buildChapterOpeningRules(
  previousChapters: Chapter[],
  lookback = 3,
): string {
  const recent = previousChapters.slice(-lookback);
  if (recent.length === 0) return '';

  const recentTypes = recent
    .filter(ch => ch.content)
    .map(ch => ({ num: ch.chapterNumber, type: classifyOpening(ch.content) }));

  if (recentTypes.length === 0) return '';

  const lines: string[] = [];

  // 检测弱开头模式
  const weakTypes = new Set(['环境/天气开头', '回顾前情开头']);
  const lastType = recentTypes[recentTypes.length - 1]?.type;

  // 检测连续相同开头类型
  const typeCount = new Map<string, number>();
  for (const { type } of recentTypes) {
    typeCount.set(type, (typeCount.get(type) ?? 0) + 1);
  }

  const repeated = [...typeCount.entries()].filter(([, c]) => c >= 2);
  if (repeated.length > 0) {
    lines.push('章节开头多样化约束（避免读者疲劳）');
    for (const [type, count] of repeated) {
      lines.push(`- 近 ${recentTypes.length} 章中「${type}」已使用 ${count} 次，本章禁止再用此类型`);
    }
  }

  if (lastType && weakTypes.has(lastType)) {
    if (lines.length === 0) lines.push('章节开头多样化约束（避免读者疲劳）');
    lines.push(`- 上一章使用了「${lastType}」（弱开头），本章请使用强力开头：动作切入/对话切入/反常切入/感官冲击切入/悬念切入`);
  }

  if (lines.length > 0) {
    lines.push('- 前 3 句必须制造阅读惯性——用悬念、冲突、反常或感官冲击开场');
    lines.push('- 前 500 字内必须出现至少一个微钩子（未解答的问题或未完成的动作）');
  }

  return lines.join('\n');
}

// ── 爽点/情绪高潮密度检测 ──────────────────────────────────

const PAYOFF_SIGNAL_PATTERNS: { pattern: RegExp; label: string; category: string }[] = [
  // 爽点信号
  { pattern: /震惊|不敢相信|目瞪口呆|倒吸.*凉气|瞳孔.*缩/g, label: '围观震惊', category: '爽点' },
  { pattern: /碾压|秒杀|一招|轻松|不过如此|不堪一击/g, label: '碾压', category: '爽点' },
  { pattern: /逆转|反转|反击|翻盘|扭转/g, label: '逆转', category: '爽点' },
  { pattern: /突破|升级|觉醒|进化|蜕变/g, label: '升级', category: '爽点' },
  { pattern: /打脸|后悔|求饶|跪|臣服|认输|刮目相看/g, label: '打脸', category: '爽点' },
  // 虐点信号
  { pattern: /失去|牺牲|背叛|死.*了|永远.*离开/g, label: '失去', category: '虐点' },
  { pattern: /绝望|崩溃|无力|心如死灰/g, label: '绝望', category: '虐点' },
  // 燃点信号
  { pattern: /拼死|不退|死战|豁出去|最后.*力量/g, label: '燃战', category: '燃点' },
  { pattern: /守护|为了.*必须|就算.*也要/g, label: '信念', category: '燃点' },
  // 甜点信号
  { pattern: /心疼|温柔|守护|偏爱|在乎|紧张/g, label: '温情', category: '甜点' },
];

const HOOK_TYPE_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: '回报', pattern: /打脸|拿下|签约|爆了|翻红|社死|奖励|晋级|突破|站队|官宣/ },
  { type: '悬念', pattern: /悬念|秘密|真相|谜|线索|未解/ },
  { type: '反转', pattern: /反转|竟然|没想到|原来|出乎意料/ },
  { type: '危机', pattern: /威胁|危机|危险|追杀|倒计时|失控/ },
  { type: '抉择', pattern: /选择|抉择|取舍|站队|必须决定/ },
];

function detectHookType(text: string): string {
  for (const item of HOOK_TYPE_PATTERNS) {
    if (item.pattern.test(text)) return item.type;
  }
  return '无明显钩子';
}

export function buildPayoffDensityHints(
  previousChapters: Chapter[],
  lookback = 3,
): string {
  const recent = previousChapters.slice(-lookback);
  if (recent.length === 0) return '';

  // 统计近几章的爽点密度
  const chapterStats = recent.filter(ch => ch.content).map(ch => {
    const content = ch.content;
    const wordCount = content.length;
    let totalHits = 0;
    const categoryHits = new Map<string, number>();
    for (const { pattern, category } of PAYOFF_SIGNAL_PATTERNS) {
      const matches = content.match(pattern) ?? [];
      totalHits += matches.length;
      categoryHits.set(category, (categoryHits.get(category) ?? 0) + matches.length);
    }
    return {
      num: ch.chapterNumber,
      wordCount,
      totalHits,
      density: wordCount > 0 ? totalHits / (wordCount / 1000) : 0,
      categoryHits,
    };
  });

  if (chapterStats.length === 0) return '';

  const lines: string[] = [];
  const avgDensity = chapterStats.reduce((s, c) => s + c.density, 0) / chapterStats.length;

  // 检测爽点稀疏
  if (avgDensity < 2.0) {
    lines.push('情绪高潮密度提示（近几章爽点偏少）');
    lines.push(`- 近 ${chapterStats.length} 章平均每千字仅 ${avgDensity.toFixed(1)} 个情绪信号，建议本章提升至 3+ 个`);
    lines.push('- 每章至少需要 2 个明确的情绪高潮点（爽点/虐点/燃点/甜点）');
    lines.push('- 高潮写法：放慢节奏、拉长镜头、短句堆叠、给足细节和围观反应');
  }

  // 检测类型单一
  const allCategories = new Map<string, number>();
  for (const stat of chapterStats) {
    for (const [cat, count] of stat.categoryHits) {
      allCategories.set(cat, (allCategories.get(cat) ?? 0) + count);
    }
  }
  const usedCategories = [...allCategories.entries()].filter(([, c]) => c > 0);
  if (usedCategories.length <= 1) {
    if (lines.length === 0) lines.push('情绪高潮密度提示（类型单一）');
    const dominant = usedCategories[0]?.[0] ?? '无';
    lines.push(`- 近几章情绪高潮集中在「${dominant}」类型，本章建议加入其他类型（爽点/虐点/燃点/甜点轮换）`);
    lines.push('- 情绪类型多样化能防止读者产生「套路感」');
  }

  // 检测最近一章是否缺少章末钩子信号
  const lastChapter = recent[recent.length - 1];
  if (lastChapter?.content) {
    const tail = lastChapter.content.slice(-300);
    const hookSignals = /悬念|反转|威胁|危机|震惊|竟然|没想到|不可能|突然|意外|秘密|真相|选择|抉择|打脸|拿下|签约|爆了|翻红|社死|奖励|晋级|突破|站队/;
    if (!hookSignals.test(tail)) {
      if (lines.length === 0) lines.push('情绪高潮密度提示');
      lines.push(`- 上一章（第 ${lastChapter.chapterNumber} 章）章末 300 字缺少钩子信号，本章开头需要用强力开场弥补`);
    }
  }

  const hookWindows = recent
    .filter(ch => ch.content)
    .map(ch => ({
      chapterNumber: ch.chapterNumber,
      hookType: detectHookType(ch.content.slice(-220)),
    }));
  const hookTypeCounter = new Map<string, number>();
  for (const item of hookWindows) {
    if (item.hookType === '无明显钩子') continue;
    hookTypeCounter.set(item.hookType, (hookTypeCounter.get(item.hookType) ?? 0) + 1);
  }
  const repeatedHookTypes = [...hookTypeCounter.entries()].filter(([, count]) => count >= 2);
  if (repeatedHookTypes.length > 0) {
    if (lines.length === 0) lines.push('情绪高潮密度提示');
    lines.push(`- 最近章节章末钩子类型重复偏高：${repeatedHookTypes.map(([type, count]) => `${type}×${count}`).join('、')}`);
    lines.push('- 本章章末请换用不同钩子形态（悬念/反转/危机/抉择轮换），避免“同套路连章”。');
  }

  return lines.join('\n');
}

// ── 重复感知/动作描写检测 ──────────────────────────────────

/** 高频出现的力量感知与身体反应短语模式 */
const RECURRING_DESCRIPTION_PATTERNS: { pattern: RegExp; label: string; category: string }[] = [
  // 触觉类感知
  { pattern: /掌心[^\n]{0,4}刺痛/g, label: '掌心刺痛', category: '触觉' },
  { pattern: /掌心[^\n]{0,4}温热/g, label: '掌心温热', category: '触觉' },
  { pattern: /掌心[^\n]{0,4}发烫/g, label: '掌心发烫', category: '触觉' },
  { pattern: /掌心[^\n]{0,4}滚烫/g, label: '掌心滚烫', category: '触觉' },
  { pattern: /针扎般/g, label: '针扎般', category: '触觉' },
  { pattern: /冰针/g, label: '冰针', category: '触觉' },
  { pattern: /指节[^\n]{0,4}泛白/g, label: '指节泛白', category: '身体反应' },
  { pattern: /额角[^\n]{0,4}冷汗/g, label: '额角冷汗', category: '身体反应' },
  { pattern: /冷汗浸透/g, label: '冷汗浸透', category: '身体反应' },
  { pattern: /头痛欲裂/g, label: '头痛欲裂', category: '身体反应' },
  { pattern: /眼前发黑/g, label: '眼前发黑', category: '身体反应' },
  { pattern: /鼻血/g, label: '鼻血', category: '身体反应' },
  // 视觉类感知
  { pattern: /金光[^\n]{0,4}涌现/g, label: '金光涌现', category: '视觉' },
  { pattern: /微光[^\n]{0,4}黯淡/g, label: '微光黯淡', category: '视觉' },
  { pattern: /风中残烛/g, label: '风中残烛', category: '比喻' },
  // 结构性重复
  { pattern: /星髓[^\n]{0,6}传来/g, label: '星髓传来…', category: '句式' },
  { pattern: /破碎的[^\n]{0,4}涌入/g, label: '破碎的…涌入', category: '句式' },
  { pattern: /苍老的[^\n]{0,4}响起/g, label: '苍老的…响起', category: '句式' },
];

const SENSORY_ALTERNATIVES: Record<string, string[]> = {
  '触觉': ['听觉（耳鸣、低频嗡响、骨传导震颤）', '味觉（嘴里泛铁锈味、舌根发苦）', '嗅觉（闻到焦糊/臭氧气息）', '环境反应（烛火无风自颤、杯中水泛涟漪、墙上影子扭曲）'],
  '身体反应': ['不同部位反应（后颈汗毛竖起、牙根发酸、耳后发烫、脊椎骨发凉）', '行为反应（不自觉后退一步、手指收紧又松开、呼吸节奏改变）'],
  '视觉': ['通感（光芒带有温度/声音/气味）', '间接表现（周围人的反应、动物的异常行为）'],
  '比喻': ['换用新鲜比喻，避免同一意象反复出现'],
  '句式': ['改变句式结构，用不同的主语或叙述角度来表达同类信息'],
};

/**
 * 扫描前文章节，检测高频重复的感知/动作描写短语，
 * 生成提示让写手在本章中使用替代表达。
 */
export function buildRecurringDescriptionRules(
  previousChapters: Chapter[],
  minCount = 4,
  maxItems = 6,
): string {
  if (previousChapters.length === 0) return '';

  const merged = previousChapters.map(ch => ch.content).join('\n');
  const hits = RECURRING_DESCRIPTION_PATTERNS
    .map(item => ({ ...item, count: (merged.match(item.pattern) ?? []).length }))
    .filter(item => item.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, maxItems);

  if (hits.length === 0) return '';

  const rules: string[] = [
    '感知描写多样化约束（避免读者审美疲劳）',
    `- 以下描写在前文中出现频率过高，本章请使用替代表达：`,
  ];

  // 按 category 分组
  const byCategory = new Map<string, typeof hits>();
  for (const hit of hits) {
    const list = byCategory.get(hit.category) ?? [];
    list.push(hit);
    byCategory.set(hit.category, list);
  }

  for (const [category, items] of byCategory) {
    const labels = items.map(i => `${i.label}(${i.count}次)`).join('、');
    const alts = SENSORY_ALTERNATIVES[category];
    rules.push(`  - [${category}] ${labels}`);
    if (alts) {
      rules.push(`    → 替代方案：${alts.join('；')}`);
    }
  }

  rules.push('- 本章中同一类感知描写最多使用相同表述2次，超过则必须换写法');

  return rules.join('\n');
}

export function defaultChapterEnhancementThresholds(): ChapterEnhancementThresholds {
  return {
    consistency: { ...DEFAULT_THRESHOLDS.consistency },
    antiTemplate: { ...DEFAULT_THRESHOLDS.antiTemplate },
    antiAiTells: { ...DEFAULT_THRESHOLDS.antiAiTells },
    antiAiStructure: { ...DEFAULT_THRESHOLDS.antiAiStructure },
  };
}
