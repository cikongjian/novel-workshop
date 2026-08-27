/**
 * 智能门禁提示词增强模块
 *
 * 将智能门禁发现转化为简短提示文本，注入下一章 Writer 提示词。
 * 纯算法实现，零AI调用，零速度损耗。
 *
 * 工作流程：
 * 1. 本章生成完 → auditChapter 检测 → 把发现转为提示文本 → 存到 smart-gate-hints.json
 * 2. 下一章生成 → 读取上一章的提示文件 → 注入到 Writer 的 smartGateHints 字段
 *
 * 设计原则：
 * - 只提供"注意事项"，不触发重写或阻断
 * - 提示文本尽量短（<500字），避免占用提示词预算
 * - 只保留最近一章的提示，不累积历史
 * - 完全容错：读取失败不影响生成
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveNovelStorageDir } from '../novel/data-root.js';
import type { SmartGateReport, SmartGateFinding } from './smart-gate-manager.js';

const HINTS_FILENAME = 'smart-gate-hints.json';

function getHintsFilePath(novelsDir: string, novelId: string): string {
  return path.join(resolveNovelStorageDir(novelsDir, novelId), HINTS_FILENAME);
}

/**
 * 持久化类型：只保留最近一章的提示
 */
type PersistedHints = {
  /** 生成提示时所基于的章节号 */
  sourceChapter: number;
  /** 生成时间戳 */
  generatedAt: string;
  /** 简短提示文本，直接注入 Writer */
  hints: string;
  /** 发现概要（调试用） */
  summary: string;
  /** 错误数 */
  errorCount: number;
  /** 警告数 */
  warnCount: number;
};

/**
 * 把智能门禁报告转化为简短的 Writer 提示文本
 *
 * 转化策略：
 * - 连续性错误（人名突变/数字不一致）→ 直接告诉 Writer 需要纠正什么
 * - 代价感问题 → 提醒本章注意增加战斗代价
 * - 蓝图问题 → 提醒注意场景执行完整性（但不强制）
 * - 同类问题去重，每种 code 只保留一条
 * - 最多取 5 条，每条一句话
 */
export function buildWriterHintsFromReport(report: SmartGateReport, chapterNumber: number): string {
  if (report.totalFindings === 0) return '';

  // 收集所有发现
  const allFindings: SmartGateFinding[] = [
    ...report.continuity.findings,
    ...report.blueprint.findings,
    ...report.cost.findings,
    ...report.dialoguePacing.findings,
    ...report.hook.findings,
  ];

  // 按 code 去重，每种 code 只取第一条（error 优先于 warn）
  const seenCodes = new Set<string>();
  const deduped: SmartGateFinding[] = [];
  // 先放 error，再放 warn
  const sorted = [...allFindings].sort((a, b) => {
    if (a.level === 'error' && b.level !== 'error') return -1;
    if (a.level !== 'error' && b.level === 'error') return 1;
    return 0;
  });
  for (const f of sorted) {
    if (seenCodes.has(f.code)) continue;
    seenCodes.add(f.code);
    deduped.push(f);
  }

  // 生成提示，过滤掉空提示
  const hints: string[] = [];
  for (const f of deduped) {
    const h = _formatHint(f);
    if (h) hints.push(h);
  }

  if (hints.length === 0) return '';

  // 最多 5 条
  const selected = hints.slice(0, 5);
  const lines: string[] = [];
  lines.push(`上一章（第${chapterNumber}章）智能门禁检测到以下问题，请在本章写作中注意避免或纠正：`);
  for (const h of selected) {
    lines.push(`- ${h}`);
  }

  return lines.join('\n');
}

/**
 * 将单个发现格式化为简短提示
 */
function _formatHint(finding: SmartGateFinding): string {
  const code = finding.code;
  const msg = finding.message;

  switch (code) {
    case 'name-mutation':
      // 提取具体的人名信息
      return _extractNameHint(msg);

    case 'number-inconsistency':
      return _extractNumberHint(msg);

    case 'item-resurrection':
      return `前文已毁/已失的物品疑似被重新使用，请检查物品状态是否一致`;

    case 'identity-conflict':
      return `角色身份信息可能存在前后矛盾，请核实角色身份设定`;

    case 'faction-conflict':
      return `角色势力归属可能存在前后矛盾，请核实势力关系`;

    case 'setting-leak':
      return `可能存在未到时机就提前泄露的设定信息，请控制信息揭示节奏`;

    case 'no-cost-combat':
      return `上一章战斗场景缺少代价描写（受伤/资源消耗），本章如有战斗请注意体现代价`;

    case 'overpowered-protagonist':
      return `上一章主角表现过强（敌人攻击但主角未受伤），本章请注意增加战斗难度或限制`;

    case 'missing-consequences':
      return `上一章提及了资源但未展示消耗，本章请注意体现资源压力`;

    case 'unearned-victory':
      return `上一章胜利来得太容易，本章请注意增加获胜的难度和代价`;

    case 'scene-not-executed':
      // 蓝图未执行只做轻微提醒，且只取 error 级别
      // 注意：蓝图追踪误报率较高，所以只做参考性提示
      return finding.level === 'error'
        ? `上一章部分大纲规划的场景可能未充分展开，本章如有相关场景请注意落实`
        : '';

    case 'scene-partial-execution':
      // 场景部分执行：提示价值低，不提示
      return '';

    case 'foreshadowing-not-recovered':
      return `存在未回收的伏笔，请考虑在本章自然推进回收`;

    case 'contract-violation':
      return `上一章可能存在违反题材承诺的内容，请本章注意回到主线`;

    case 'dialogue-ratio-high':
      return `上一章对话占比偏高，本章请注意增加动作描写和环境烘托，避免全章对话`;

    case 'dialogue-ratio-low':
      return `上一章对话偏少，本章请适当增加角色对话互动，让角色更鲜活`;

    case 'dialogue-monologue':
      return `上一章有多处连续大段对话，本章请穿插动作、神态和心理描写，打破对话流的单调感`;

    case 'said-bookism':
      return `上一章对话标签过于密集（"XX道""XX说"重复），本章请通过动作、神态暗示说话人，减少标签使用`;

    case 'pacing-monotony':
      return `连续几章节奏分布相似，本章请调整节奏配比（如增加动作戏、减少对话），避免阅读疲劳`;

    case 'paragraph-too-short':
      return `上一章段落偏碎片化，本章请适当合并相关段落，增加叙事连贯性`;

    case 'paragraph-too-long':
      return `上一章段落偏长，本章请注意拆分长段落，增加呼吸感`;

    case 'action-ratio-low':
      return `上一章动作描写偏少，本章请增加角色动作细节，让场景更有画面感`;

    case 'description-ratio-high':
      return `上一章环境描写偏多，本章请精简环境描写，把笔墨集中在推动剧情和刻画角色上`;

    case 'hook-none':
      return `上一章章末缺少钩子，本章结尾请设置悬念、危机或期待，吸引读者继续阅读`;

    case 'hook-weak':
      return `上一章章末钩子强度较弱，本章结尾请增强张力（如增加危机感、悬念感或期待感）`;

    case 'hook-poor-position':
      return `上一章钩子不在章节最末尾，本章结尾请将最有张力的内容放在最后两段，强化收尾冲击力`;

    case 'hook-low-tension':
      return `上一章章末钩子情感张力一般，本章结尾请增加紧迫感词汇或直接抛出核心疑问`;

    default:
      // 对于未识别的发现类型，从 finding 获取 level
      return _isErrorLevel(finding) ? msg.slice(0, 80) : '';
  }
}

/**
 * 类型安全的 level 检查（绕过 switch 穷尽后的 never 类型）
 */
function _isErrorLevel(finding: SmartGateFinding): boolean {
  return (finding as { level: string }).level === 'error';
}

/**
 * 从人名突变消息中提取关键信息
 * 消息格式类似："检测到新角色"何苗"，若为已有角色的别名请确认命名一致性"
 *
 * 过滤策略：
 * - 排除包含冒号的非人名（如"击杀:NR-07矿坑变异体·幼体1"、"退场:..."）
 * - 排除过长（>10字）或过短（<2字）的名字
 * - 排除包含数字+字母组合的代号类名字
 */
function _extractNameHint(msg: string): string {
  // 尝试提取引号中的名字
  const match = msg.match(/["""]([^"""]+)["""]/);
  if (match) {
    const name = match[1];

    // 过滤非人名：包含冒号的（如"击杀:XXX"、"退场:XXX"）
    if (/[:：]/.test(name)) return '';

    // 过滤过长的名字（>10字，可能是描述而非名字）
    if (name.length > 10) return '';

    // 过滤过短的名字（<2字）
    if (name.length < 2) return '';

    // 过滤包含数字+字母组合的代号（如"NR-07"）
    if (/\d.*[A-Za-z]|[A-Za-z].*\d/.test(name)) return '';

    return `上一章检测到角色名"${name}"可能为突变，请确认是否为已有角色的别名，保持命名一致`;
  }
  return `上一章检测到角色名可能突变，请确认命名一致性`;
}

/**
 * 从数字不一致消息中提取关键信息
 * 消息格式类似："数字不一致：本章出现"13.7MHz"，但同单位历史值为"16.7MHz""
 *
 * 优化策略：
 * - 过滤时间/百分比等高频变化的数字（不是真正的连续性错误）
 * - 只提示有明确单位且历史值不超过3个的情况（避免堆砌）
 * - 如果历史值太多（>3），说明该数字本身就是动态变化的，不提示
 */
function _extractNumberHint(msg: string): string {
  // 过滤掉章节号误报
  if (msg.includes('章') && /\d+章/.test(msg)) return '';

  const match = msg.match(/["""]([^"""]+)["""]/g);
  if (match && match.length >= 2) {
    const current = match[0].replace(/["""]/g, '');
    const historyStr = match[1].replace(/["""]/g, '');

    // 如果历史值列表太长（包含逗号分隔的多个值），说明是动态数字，不提示
    const historyValues = historyStr.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (historyValues.length > 3) return '';

    // 过滤掉纯时间/百分比类数字（这些在小说中本就会变化）
    // 只有当数字带明确单位（如 MHz、公里、元 等）且不是纯时间/百分比时才提示
    const hasMeaningfulUnit = /\d+\s*(MHz|GHz|km|公里|米|元|块|岁|名|个|只|台|辆|栋|层|楼|号)/.test(current);
    const isTimeOrPercent = /^\d+(\.\d+)?(秒|分|分钟|小时|天|周|月|年|%|%)$/.test(current);

    if (!hasMeaningfulUnit || isTimeOrPercent) return '';

    return `上一章数字"${current}"与历史值"${historyStr}"不一致，请核实并保持前后统一`;
  }
  return '';
}

/**
 * 持久化智能门禁提示到文件
 */
export async function saveSmartGateHints(
  novelId: string,
  novelsDir: string,
  chapterNumber: number,
  report: SmartGateReport,
): Promise<void> {
  const hints = buildWriterHintsFromReport(report, chapterNumber);

  const data: PersistedHints = {
    sourceChapter: chapterNumber,
    generatedAt: new Date().toISOString(),
    hints,
    summary: report.summary,
    errorCount: report.errorCount,
    warnCount: report.warnCount,
  };

  const filePath = getHintsFilePath(novelsDir, novelId);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 读取上一章的智能门禁提示
 *
 * @param novelsDir 小说目录
 * @param novelId 小说ID
 * @param currentChapter 当前章节号
 * @returns 提示文本，如果没有则返回 undefined
 */
export async function loadPrevChapterSmartGateHints(
  novelsDir: string,
  novelId: string,
  currentChapter: number,
): Promise<string | undefined> {
  const filePath = getHintsFilePath(novelsDir, novelId);

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw) as PersistedHints;

    // 只使用上一章的提示，更早的不算
    if (data.sourceChapter !== currentChapter - 1) {
      return undefined;
    }

    if (!data.hints || data.hints.trim().length === 0) {
      return undefined;
    }

    return data.hints;
  } catch {
    // 文件不存在或解析失败，静默返回
    return undefined;
  }
}
