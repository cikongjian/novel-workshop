/**
 * 爽文管线专属门禁
 * 三个纯函数门禁 + 对应 fix hint builder，遵循 quality-gate.ts 模式
 */

import type { ShuangwenBlueprint } from './shuangwen-types.js';
import type {
  ShuangwenHookGateReport,
  ShuangwenCycleGateReport,
  ShuangwenForbiddenGateReport,
} from './types.js';

export type ShuangwenGateMode = 'off' | 'warn' | 'strict';

// ==================== 钩子门禁 ====================

const MALE_HOOK_KEYWORDS = [
  '悬念', '反转', '威胁', '危机', '更强', '更大', '目标',
  '敌人', '挑战', '秘密', '真相', '阴谋', '突然', '竟然',
  '没想到', '不可能', '震惊', '意外', '来者不善', '杀意',
  '暗中', '潜伏', '伏兵', '陷阱', '下一个',
];

const FEMALE_HOOK_KEYWORDS = [
  '误会', '身份', '秘密', '真相', '选择', '离开', '回来',
  '心意', '告白', '反转', '竟然', '没想到', '不可能',
  '突然', '意外', '另一个', '过去', '隐瞒', '发现',
  '关系', '变化', '转折', '抉择',
];

const MALE_PAYOFF_KEYWORDS = [
  '打脸', '震惊', '不敢相信', '跪', '臣服', '认输',
  '变强', '突破', '升级', '获得', '觉醒', '逆转',
  '反击', '碾压', '秒杀', '一招', '轻松', '不过如此',
  '后悔', '求饶', '刮目相看', '高攀不起',
];

const FEMALE_PAYOFF_KEYWORDS = [
  '偏爱', '心疼', '守护', '温柔', '独一无二', '只有你',
  '在乎', '紧张', '吃醋', '表白', '承诺', '选择了',
  '甜', '暖', '感动', '眼眶', '红了眼', '拥入怀',
  '牵手', '亲吻', '回应', '兑现',
];

function countKeywordHits(text: string, keywords: string[]): string[] {
  return keywords.filter(kw => text.includes(kw));
}

export function evaluateHookGate(params: {
  chapterContent: string;
  chapterNumber: number;
  blueprint: ShuangwenBlueprint;
  gateMode: ShuangwenGateMode;
}): ShuangwenHookGateReport {
  const { chapterContent, chapterNumber, blueprint, gateMode } = params;
  if (gateMode === 'off') {
    return { passed: true, hasEndHook: true, hasPayoff: true, findings: [], summary: 'off' };
  }

  const findings: string[] = [];
  const audience = blueprint.audience;
  const hookKw = audience === 'male' ? MALE_HOOK_KEYWORDS : FEMALE_HOOK_KEYWORDS;
  const payoffKw = audience === 'male' ? MALE_PAYOFF_KEYWORDS : FEMALE_PAYOFF_KEYWORDS;

  // 检查章末 500 字的钩子
  const tail = chapterContent.slice(-500);
  const hookHits = countKeywordHits(tail, hookKw);
  const hasEndHook = hookHits.length >= 1;
  if (!hasEndHook) {
    findings.push(`章末 500 字未检测到钩子信号（期望：${blueprint.hook.chapterEndHookRule}）`);
  }

  // 检查全章爽点/甜点兑现
  const payoffHits = countKeywordHits(chapterContent, payoffKw);
  const hasPayoff = payoffHits.length >= 1;
  if (!hasPayoff) {
    findings.push(`全章未检测到${audience === 'male' ? '爽点' : '甜点'}兑现信号`);
  }

  // 前 3 章额外检查 firstPayoff
  if (chapterNumber <= 3 && blueprint.hook.firstPayoff) {
    const fpKeywords = blueprint.hook.firstPayoff.split(/[，,、；;。\s]+/).filter(s => s.length >= 2);
    const fpHits = countKeywordHits(chapterContent, fpKeywords);
    if (fpHits.length === 0 && chapterNumber === 3) {
      findings.push(`前 3 章承诺的首次兑现"${blueprint.hook.firstPayoff}"未在第 ${chapterNumber} 章检测到`);
    }
  }

  const passed = findings.length === 0;
  const summary = passed
    ? `钩子门禁通过（钩子命中：${hookHits.join('/')}，兑现命中：${payoffHits.join('/')}）`
    : `钩子门禁发现 ${findings.length} 个问题`;

  return { passed, hasEndHook, hasPayoff, findings, summary };
}

export function buildHookFixHints(
  report: ShuangwenHookGateReport,
  blueprint: ShuangwenBlueprint,
): string {
  const lines: string[] = ['以下是爽文钩子门禁修复要求，请对正文做最小必要改写：'];

  if (!report.hasEndHook) {
    lines.push('');
    lines.push('【章末钩子缺失】');
    lines.push(`- 章末钩子规则：${blueprint.hook.chapterEndHookRule}`);
    lines.push('- 请在章末 300 字内加入明确的悬念/反转/新威胁/选择题');
    lines.push('- 不要平铺直叙收尾');
  }

  if (!report.hasPayoff) {
    lines.push('');
    lines.push(`【${blueprint.audience === 'male' ? '爽点' : '甜点'}兑现缺失】`);
    lines.push(`- 循环公式：${blueprint.engine.cycleFormula}`);
    lines.push('- 本章必须有至少一个可感知的兑现时刻');
  }

  lines.push('');
  lines.push('【改写边界】');
  lines.push('- 保持主剧情顺序，不做整章重写');
  lines.push('- 输出格式仍为"润色后的正文 + ---EDITOR_NOTES--- + 修改说明"');
  return lines.join('\n');
}

// ==================== 循环门禁 ====================

function parseCyclePhases(formula: string): string[] {
  return formula
    .split(/[→➡>→\-]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

const CYCLE_PHASE_KEYWORDS: Record<string, string[]> = {
  '受挫': ['受挫', '失败', '被打', '落败', '输了', '被轻视', '嘲笑', '看不起', '羞辱', '挫折'],
  '被轻视': ['轻视', '看不起', '嘲笑', '不屑', '蔑视', '小看', '瞧不上'],
  '得挂': ['获得', '觉醒', '传承', '秘籍', '宝物', '突破', '领悟', '机缘', '信息差'],
  '获得优势': ['获得', '优势', '秘密', '发现', '掌握', '知道', '信息差'],
  '反击': ['反击', '打脸', '碾压', '逆转', '还击', '报复', '证明'],
  '打脸': ['打脸', '震惊', '不敢相信', '刮目相看', '后悔', '求饶'],
  '围观震惊': ['震惊', '不敢相信', '议论', '围观', '哗然', '沸腾'],
  '留坑': ['更大', '更强', '下一个', '新的', '目标', '敌人', '挑战'],
  '误会': ['误会', '误解', '以为', '不知道', '隐瞒', '秘密'],
  '压抑': ['压抑', '忍耐', '委屈', '隐忍', '不甘'],
  '触发': ['触发', '爆发', '忍不住', '终于', '关键时刻'],
  '偏爱': ['偏爱', '心疼', '守护', '温柔', '在乎', '紧张'],
  '反转': ['反转', '竟然', '没想到', '原来', '真相'],
  '情绪回落': ['平静', '安心', '释然', '温暖', '依偎'],
  '更强张力': ['但是', '然而', '可是', '不过', '新的', '另一个'],
};

export function evaluateCycleGate(params: {
  chapterContent: string;
  chapterNumber: number;
  blueprint: ShuangwenBlueprint;
  gateMode: ShuangwenGateMode;
}): ShuangwenCycleGateReport {
  const { chapterContent, chapterNumber, blueprint, gateMode } = params;
  if (gateMode === 'off') {
    return { passed: true, phaseDetected: '', findings: [], summary: 'off' };
  }

  const findings: string[] = [];
  const phases = parseCyclePhases(blueprint.engine.cycleFormula);
  const detectedPhases: string[] = [];

  for (const phase of phases) {
    const keywords = CYCLE_PHASE_KEYWORDS[phase] ?? [phase];
    const hits = countKeywordHits(chapterContent, keywords);
    if (hits.length > 0) {
      detectedPhases.push(phase);
    }
  }

  const phaseDetected = detectedPhases.join(' → ');
  const coverageRatio = phases.length > 0 ? detectedPhases.length / phases.length : 1;

  // 至少覆盖 40% 的循环阶段
  if (coverageRatio < 0.4 && phases.length > 0) {
    const missing = phases.filter(p => !detectedPhases.includes(p));
    findings.push(`循环公式覆盖不足（${detectedPhases.length}/${phases.length}），缺失阶段：${missing.join('、')}`);
  }

  // 检查升级规则（每 N 章应有升级信号）
  const escalationMatch = blueprint.engine.escalationRule.match(/(\d+)/);
  const escalationInterval = escalationMatch ? Number(escalationMatch[1]) : 5;
  if (chapterNumber > 1 && chapterNumber % escalationInterval === 0) {
    const escalationKw = ['升级', '更强', '进化', '突破', '新阶段', '加码', '更大'];
    const escalationHits = countKeywordHits(chapterContent, escalationKw);
    if (escalationHits.length === 0) {
      findings.push(`第 ${chapterNumber} 章应有升级/加码信号（规则：${blueprint.engine.escalationRule}）`);
    }
  }

  const passed = findings.length === 0;
  const summary = passed
    ? `循环门禁通过（检测到阶段：${phaseDetected || '无'}）`
    : `循环门禁发现 ${findings.length} 个问题`;

  return { passed, phaseDetected, findings, summary };
}

export function buildCycleFixHints(
  report: ShuangwenCycleGateReport,
  blueprint: ShuangwenBlueprint,
): string {
  const lines: string[] = ['以下是爽文循环门禁修复要求，请对正文做最小必要改写：'];

  lines.push('');
  lines.push(`【循环公式】${blueprint.engine.cycleFormula}`);
  lines.push(`【升级规则】${blueprint.engine.escalationRule}`);

  for (const finding of report.findings) {
    lines.push(`- ${finding}`);
  }

  lines.push('');
  lines.push('【改写边界】');
  lines.push('- 通过事件、冲突、抉择体现循环阶段，不要只做关键词点缀');
  lines.push('- 输出格式仍为"润色后的正文 + ---EDITOR_NOTES--- + 修改说明"');
  return lines.join('\n');
}

// ==================== 禁区门禁 ====================

export function evaluateForbiddenGate(params: {
  chapterContent: string;
  forbidden: string[];
  gateMode: ShuangwenGateMode;
}): ShuangwenForbiddenGateReport {
  const { chapterContent, forbidden, gateMode } = params;
  if (gateMode === 'off' || forbidden.length === 0) {
    return { passed: true, violations: [], summary: 'off' };
  }

  const violations: string[] = [];
  for (const item of forbidden) {
    const keywords = item.split(/[，,、；;。\s]+/).filter(s => s.length >= 2);
    for (const kw of keywords) {
      if (chapterContent.includes(kw)) {
        violations.push(`禁区命中："${kw}"（来自规则"${item}"）`);
        break; // 每条规则只报一次
      }
    }
  }

  const passed = violations.length === 0;
  const summary = passed
    ? '禁区门禁通过'
    : `禁区门禁发现 ${violations.length} 个违规`;

  return { passed, violations, summary };
}

export function buildForbiddenFixHints(
  report: ShuangwenForbiddenGateReport,
): string {
  const lines: string[] = ['以下是爽文禁区门禁修复要求，请对正文做最小必要改写：'];

  lines.push('');
  lines.push('【违规内容】');
  for (const v of report.violations) {
    lines.push(`- ${v}`);
  }

  lines.push('');
  lines.push('【改写边界】');
  lines.push('- 删除或替换违规内容，保持剧情连贯');
  lines.push('- 输出格式仍为"润色后的正文 + ---EDITOR_NOTES--- + 修改说明"');
  return lines.join('\n');
}

