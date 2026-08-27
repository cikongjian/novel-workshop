/**
 * 设定漂移门禁（Setting Drift Gate）
 *
 * 检测章节正文是否漂移到系统化/数据库化术语体系（坐标/碎片/覆写/祭坛/传送门/上界等），
 * 偏离创作宪法（设定基线）。四信号：术语簇密度（进度自适应）、系统日志腔比例、
 * 禁止方向命中、核心力量体系被侵蚀。
 *
 * 模式：off / warn（默认，仅记录）/ strict（error 级 finding 决定 passed）。
 * 纯字符串/正则检测，无 LLM 调用。模板参考 power-rule-gate.ts。
 */
import type { SettingBaseline } from './setting-baseline/types.js';
import { evaluateWorldRuleEvidence } from './world-rule-evidence.js';

export type SettingDriftGateMode = 'off' | 'warn' | 'strict';

export type SettingDriftFindingCode =
  | 'drift-term-cluster'
  | 'manual-log-style'
  | 'forbidden-direction'
  | 'baseline-power-eroded'
  | 'baseline-world-rule-conflict';

export type SettingDriftFinding = {
  code: SettingDriftFindingCode;
  level: 'warn' | 'error';
  message: string;
};

export type SettingDriftGateReport = {
  gateMode: SettingDriftGateMode;
  findings: SettingDriftFinding[];
  /** 0-100，越高漂移越严重 */
  driftScore: number;
  passed: boolean;
  summary: string;
};

type EvaluateSettingDriftGateParams = {
  chapterContent: string;
  baseline?: SettingBaseline | null;
  chapterNumber: number;
  gateMode: SettingDriftGateMode;
};

/** 漂移术语簇：系统化/IT 化 + 跨界上界 + 玄幻系统流标志词（导出供蓝图源头过滤/CLI 共用） */
export const SETTING_DRIFT_TERMS = [
  '坐标', '锚点', '碎片', '覆写', '重写', '备份',
  '加密段', '链路', '扫描', '校准', '协议', '基座',
  '传送门', '传送阵', '跨界', '上界', '神族', '神罚',
  '祭坛', '符文', '阵法', '令牌',
];

/** 系统日志腔（说明书化叙事）正则 */
const MANUAL_LOG_PATTERNS = [
  /浮现[一了]*[行串]*[一-龥]{0,2}字[迹纹]?/g,
  /显示[一了]*[行串]*[一-龥]{0,2}字/g,
  /表面浮[现示][^\n。，！？]{0,14}字/g,
];

/** 创作宪法禁止方向关键词（固定漂移标志词集） */
const FORBIDDEN_KEYWORD_RE = /(上界|神明|神罚|跨界传送|传送阵|坐标|碎片|覆写|加密段|祭坛)/g;

const DRIFT_PROGRESS_CHAPTER = 30;
const DRIFT_DENSITY_THRESHOLD_LOOSE = 8; // 每千字，30 章前
const DRIFT_DENSITY_THRESHOLD_STRICT = 4; // 30 章后
const MANUAL_RATIO_THRESHOLD = 0.12; // 系统日志腔句占比
const PER_TERM_COUNT_CAP = 30; // 单词计数封顶，防一个词刷屏
const DRIFT_SCORE_MAX = 100;

function countTerm(content: string, term: string): number {
  if (!term) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = content.indexOf(term, idx)) !== -1) {
    count += 1;
    idx += term.length;
    if (count >= PER_TERM_COUNT_CAP) break;
  }
  return count;
}

function countRegex(content: string, re: RegExp): number {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let count = 0;
  while (global.exec(content)) {
    count += 1;
    if (count >= 100) break;
  }
  return count;
}

function levelFor(mode: SettingDriftGateMode): 'warn' | 'error' {
  return mode === 'strict' ? 'error' : 'warn';
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(DRIFT_SCORE_MAX, Math.round(value)));
}

/** 从文本中剥离漂移术语（用于蓝图 constraints/forbidden 注入 writer 前过滤，从源头切断） */
export function stripDriftTerms(text: string): string {
  if (!text) return '';
  let cleaned = text;
  for (const term of SETTING_DRIFT_TERMS) {
    cleaned = cleaned.split(term).join('');
  }
  return cleaned.replace(/\s{2,}/g, ' ').trim();
}

export function evaluateSettingDriftGate(params: EvaluateSettingDriftGateParams): SettingDriftGateReport {
  const { chapterContent, baseline, chapterNumber, gateMode } = params;
  if (gateMode === 'off' || !chapterContent) {
    return { gateMode, findings: [], driftScore: 0, passed: true, summary: 'setting drift gate is off' };
  }

  const level = levelFor(gateMode);
  const findings: SettingDriftFinding[] = [];
  const chars = Math.max(1, chapterContent.length);
  const thousandChars = chars / 1000;

  // 信号 1：漂移术语簇密度（进度自适应阈值，30 章后收紧）
  let driftTermHits = 0;
  for (const term of SETTING_DRIFT_TERMS) {
    driftTermHits += countTerm(chapterContent, term);
  }
  const density = driftTermHits / thousandChars;
  const densityThreshold = chapterNumber >= DRIFT_PROGRESS_CHAPTER
    ? DRIFT_DENSITY_THRESHOLD_STRICT
    : DRIFT_DENSITY_THRESHOLD_LOOSE;
  if (density > densityThreshold) {
    findings.push({
      code: 'drift-term-cluster',
      level,
      message: `漂移术语簇密度 ${density.toFixed(1)}/千字 超过阈值 ${densityThreshold}/千字（命中 ${driftTermHits} 次：坐标/碎片/覆写/祭坛等），疑似系统化设定漂移。`,
    });
  }

  // 信号 2：系统日志腔（说明书化）比例
  let manualHits = 0;
  for (const re of MANUAL_LOG_PATTERNS) {
    manualHits += countRegex(chapterContent, re);
  }
  const sentences = Math.max(1, (chapterContent.match(/[。！？\n]/g) ?? []).length);
  const manualRatio = manualHits / sentences;
  if (manualRatio > MANUAL_RATIO_THRESHOLD) {
    findings.push({
      code: 'manual-log-style',
      level,
      message: `系统日志腔（"浮现字迹/显示一行字"）句占比 ${(manualRatio * 100).toFixed(0)}% 超过阈值 ${(MANUAL_RATIO_THRESHOLD * 100).toFixed(0)}%，正文说明书化。`,
    });
  }

  // 信号 3 & 4：需创作宪法（baseline）作为对比基准
  const activeBaseline = baseline?.status === 'confirmed' ? baseline : null;
  if (activeBaseline) {
    const forbiddenHits = countRegex(chapterContent, FORBIDDEN_KEYWORD_RE);
    if (forbiddenHits >= 3) {
      findings.push({
        code: 'forbidden-direction',
        level,
        message: `正文命中创作宪法禁止的漂移方向（上界/跨界传送/坐标-碎片系统等）${forbiddenHits} 次。`,
      });
    }

    if (activeBaseline.powerSystems.length > 0) {
      let powerHits = 0;
      for (const p of activeBaseline.powerSystems) {
        powerHits += countTerm(chapterContent, p.name);
      }
      if (driftTermHits > powerHits * 3 && driftTermHits >= 10) {
        findings.push({
          code: 'baseline-power-eroded',
          level,
          message: `漂移术语（${driftTermHits}）远超创作宪法核心力量体系词（${powerHits}），设定骨架被侵蚀。`,
        });
      }
    }

    for (const entry of activeBaseline.canonicalWorldEntries ?? []) {
      if (!chapterContent.includes(entry.name)) continue;
      const evidence = evaluateWorldRuleEvidence({
        chapterContent,
        names: [entry.name],
        constraints: entry.constraints,
        consequences: entry.consequences,
      });
      if (!evidence.contradicted) continue;
      findings.push({
        code: 'baseline-world-rule-conflict',
        level,
        message: `正文反向描述了世界正史“${entry.name}”：${entry.constraints.join('；') || entry.description}`,
      });
      if (findings.filter(finding => finding.code === 'baseline-world-rule-conflict').length >= 6) break;
    }
  }

  const driftScore = clampScore(density * 5 + manualRatio * 100 + findings.length * 8);
  const errorCount = findings.filter(f => f.level === 'error').length;
  const passed = gateMode !== 'strict' ? true : errorCount === 0;

  return {
    gateMode,
    findings,
    driftScore,
    passed,
    summary: `setting drift score=${driftScore} findings=${findings.length} density=${density.toFixed(1)}/千字`,
  };
}

export function buildSettingDriftGateFixHints(report: SettingDriftGateReport): string {
  if (report.gateMode === 'off' || report.findings.length === 0) return '';
  const lines = [
    '## 设定漂移门禁修复（高于普通润色）',
    '- 本章检测到设定漂移：出现了与创作宪法冲突的系统化/数据库化术语体系（坐标/碎片/覆写/祭坛/传送门/上界等）。',
    '- 必须删除或改写这些术语，把情节拉回创作宪法设定的力量体系与世界框架。',
    '- 禁止"浮现字迹/显示一行字"这类系统日志腔，改用角色行动、对话、环境描写传递信息。',
    '- 传承/力量进阶必须用本作既有体系名词（见创作宪法），不得新造"坐标基座/碎片编号/加密段"这类结构。',
  ];
  for (const f of report.findings.slice(0, 4)) {
    lines.push(`- ${f.message}`);
  }
  lines.push('- 输出仍保持"润色后的正文 + ---EDITOR_NOTES--- + 修改说明"。');
  return lines.join('\n');
}
