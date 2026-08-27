import type { WorldEntry } from '../novel/types.js';
import { readPowerParamsFromDetails } from '../novel/power-params.js';

export type PowerRuleGateMode = 'off' | 'warn' | 'strict';

export type PowerRuleFinding = {
  code: 'missing-cost-signal' | 'missing-cooldown-signal' | 'missing-risk-signal';
  level: 'warn' | 'error';
  entryName: string;
  message: string;
};

export type PowerRuleGateReport = {
  gateMode: PowerRuleGateMode;
  findings: PowerRuleFinding[];
  usedPowerEntries: string[];
  passed: boolean;
  summary: string;
};

type EvaluatePowerRuleGateParams = {
  chapterContent: string;
  worldEntries: WorldEntry[];
  gateMode: PowerRuleGateMode;
};

const ACTION_HINT_RE = /(施展|发动|催动|运转|祭出|爆发|使出|出招|引动|突破|越级|禁术|透支|燃烧)/;
const COST_HINT_RE = /(消耗|代价|损耗|真气|灵力|内力|法力|血气|寿元|本源|体力|气血)/;
const COOLDOWN_HINT_RE = /(冷却|反噬|虚弱|后遗症|经脉受损|负荷|恢复|调息|回气)/;
const RISK_TRIGGER_RE = /(越级|强行|透支|禁术|燃烧本源|极限爆发|搏命|拼死)/;
const RISK_HINT_RE = /(风险|失败|失控|反噬|走火入魔|伤及|代价|崩溃|副作用|后遗症)/;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of items) {
    const value = raw.trim();
    if (!value) continue;
    const key = normalize(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function countTerm(content: string, term: string): number {
  if (!term.trim()) return 0;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'gi');
  let count = 0;
  while (re.exec(content)) {
    count += 1;
    if (count >= 20) break;
  }
  return count;
}

function extractMentionWindows(content: string, names: string[], radius = 48): string[] {
  const windows: string[] = [];
  for (const name of names) {
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'gi');
    let match: RegExpExecArray | null = re.exec(content);
    while (match) {
      const idx = match.index ?? 0;
      const start = Math.max(0, idx - radius);
      const end = Math.min(content.length, idx + name.length + radius);
      windows.push(content.slice(start, end));
      if (windows.length >= 30) return windows;
      match = re.exec(content);
    }
  }
  return windows;
}

function anyMatch(texts: string[], re: RegExp): boolean {
  return texts.some(text => re.test(text));
}

function includesAny(texts: string[], hints: string[]): boolean {
  if (hints.length === 0) return false;
  return texts.some((text) => {
    const normalizedText = text.toLowerCase();
    return hints.some(hint => normalizedText.includes(hint.toLowerCase()));
  });
}

function levelFor(mode: PowerRuleGateMode): 'warn' | 'error' {
  return mode === 'strict' ? 'error' : 'warn';
}

function normalizeTextHints(values: string[]): string[] {
  return dedupe(values.map(value => value.trim()).filter(Boolean));
}

export function evaluatePowerRuleGate(params: EvaluatePowerRuleGateParams): PowerRuleGateReport {
  const { chapterContent, worldEntries, gateMode } = params;
  if (gateMode === 'off') {
    return {
      gateMode,
      findings: [],
      usedPowerEntries: [],
      passed: true,
      summary: 'power rule gate is off',
    };
  }

  const findings: PowerRuleFinding[] = [];
  const usedPowerEntries: string[] = [];
  const level = levelFor(gateMode);
  const powerEntries = worldEntries.filter(entry => entry.category === 'power');

  for (const entry of powerEntries) {
    const names = dedupe([entry.name, ...(entry.aliases ?? [])]);
    const mentionCount = names.reduce((total, name) => total + countTerm(chapterContent, name), 0);
    if (mentionCount <= 0) continue;

    usedPowerEntries.push(entry.name);
    const windows = extractMentionWindows(chapterContent, names);
    if (!anyMatch(windows, ACTION_HINT_RE)) continue;

    const paramsV2 = readPowerParamsFromDetails(entry.details ?? {});
    const costHints = normalizeTextHints([
      paramsV2?.resourceName ?? '',
      paramsV2?.defaultCost ?? '',
      ...((entry.constraints ?? []).filter(item => /(消耗|代价|损耗|真气|灵力|内力|法力|寿元|血气)/.test(item))),
    ]);
    if (costHints.length > 0 && !anyMatch(windows, COST_HINT_RE) && !includesAny(windows, costHints)) {
      findings.push({
        code: 'missing-cost-signal',
        level,
        entryName: entry.name,
        message: `力量条目「${entry.name}」出现施展动作，但未体现消耗或代价信号`,
      });
    }

    if (
      paramsV2?.cooldownRule
      && !anyMatch(windows, COOLDOWN_HINT_RE)
      && !includesAny(windows, [paramsV2.cooldownRule])
    ) {
      findings.push({
        code: 'missing-cooldown-signal',
        level,
        entryName: entry.name,
        message: `力量条目「${entry.name}」配置了冷却/负荷规则，但正文未体现`,
      });
    }

    const riskHints = normalizeTextHints([
      paramsV2?.riskRule ?? '',
      paramsV2?.breakthroughRule ?? '',
      ...((entry.consequences ?? []).filter(item => /(风险|失败|反噬|失控|副作用|后遗症|走火入魔)/.test(item))),
    ]);
    const hasRiskTrigger = anyMatch(windows, RISK_TRIGGER_RE);
    if (hasRiskTrigger && riskHints.length > 0 && !anyMatch(windows, RISK_HINT_RE) && !includesAny(windows, riskHints)) {
      findings.push({
        code: 'missing-risk-signal',
        level,
        entryName: entry.name,
        message: `力量条目「${entry.name}」触发高风险动作，但未体现风险后果`,
      });
    }
  }

  const dedupedUsed = dedupe(usedPowerEntries);
  if (findings.length === 0) {
    return {
      gateMode,
      findings: [],
      usedPowerEntries: dedupedUsed,
      passed: true,
      summary: dedupedUsed.length > 0
        ? `power rule check passed on ${dedupedUsed.length} used entries`
        : 'no power entry is used in this chapter',
    };
  }

  return {
    gateMode,
    findings,
    usedPowerEntries: dedupedUsed,
    passed: false,
    summary: `power rule findings=${findings.length} entries=${dedupedUsed.length}`,
  };
}

