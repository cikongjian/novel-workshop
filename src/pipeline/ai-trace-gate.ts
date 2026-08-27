/**
 * AI 痕迹门禁 — 遵循 quality-gate / continuity-gate 的统一门禁模式
 *
 * 在章节管线中作为后处理门禁运行（Writer → Editor → AI Trace Gate → Reader）。
 * strict 模式下未通过会触发 Editor 重写。
 */

import { evaluateAiTrace, type AiTraceReport, type GenreTraceOverrides } from './ai-trace-detector.js';

// ==================== 类型 ====================

export type AiTraceGateMode = 'off' | 'warn' | 'strict';

export type AiTraceGateReport = AiTraceReport & {
  gateMode: AiTraceGateMode;
  passed: boolean;
  /** 门禁通过阈值 (0-100) */
  passThreshold: number;
  summary: string;
};

export type AiTraceGateParams = {
  /** 待检测的章节文本 */
  text: string;
  /** 门禁模式 */
  gateMode: AiTraceGateMode;
  /** 通过阈值，默认 60 */
  passThreshold?: number;
  /** 类型特定规则覆盖 */
  genreOverrides?: GenreTraceOverrides;
  /** 自学习模式（运行时动态注入） */
  learnedPatterns?: RegExp[];
};

// ==================== 常量 ====================

const DEFAULT_PASS_THRESHOLD = 60;

// ==================== 门禁评估 ====================

/**
 * 评估 AI 痕迹门禁
 */
export function evaluateAiTraceGate(params: AiTraceGateParams): AiTraceGateReport {
  const { text, gateMode, genreOverrides, learnedPatterns } = params;
  const passThreshold = params.passThreshold ?? DEFAULT_PASS_THRESHOLD;

  const report = evaluateAiTrace(text, genreOverrides, learnedPatterns);
  const passed = gateMode !== 'strict' || report.score >= passThreshold;

  const summaryParts: string[] = [];
  if (report.violations.length > 0) {
    const errorCount = report.violations.filter(v => v.severity === 'error').length;
    const warnCount = report.violations.filter(v => v.severity === 'warn').length;
    if (errorCount > 0) summaryParts.push(`${errorCount} 项严重`);
    if (warnCount > 0) summaryParts.push(`${warnCount} 项警告`);
  }
  const summary = report.violations.length === 0
    ? `AI 痕迹检测通过 (${report.score}分)`
    : `AI 痕迹分数 ${report.score}/100 — ${summaryParts.join('、')} (阈值${passThreshold})`;

  return {
    ...report,
    gateMode,
    passed,
    passThreshold,
    summary,
  };
}

// ==================== 修复提示生成 ====================

/**
 * 根据 AI 痕迹检测结果生成 Editor 修复提示
 */
export function buildAiTraceFixHints(report: AiTraceGateReport): string {
  if (report.violations.length === 0) return '';

  const lines: string[] = [
    '以下是 AI 痕迹门禁检测到的问题，请做最小必要改写修复：',
    '',
  ];

  // 按严重程度排序
  const sorted = [...report.violations].sort((a, b) => {
    const severityOrder: Record<string, number> = { error: 0, warn: 1, info: 2 };
    return (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
  });

  for (const v of sorted) {
    const tag = v.severity === 'error' ? '【严重】' : v.severity === 'warn' ? '【警告】' : '【提示】';
    lines.push(`${tag} ${v.ruleName}：${v.details}`);

    // 根据规则给出具体修复指导
    switch (v.ruleId) {
      case 'forbidden-phrases':
        lines.push('  → 删除或替换上述结构性短语，使用具体事件/动作/对话代替总结腔。');
        break;
      case 'marker-word-density':
        lines.push('  → 减少标记词出现频次，用具体动作或环境描写替代。');
        break;
      case 'em-dash-overuse':
        lines.push('  → 减少破折号使用，改用逗号、分句或换行。');
        break;
      case 'paragraph-prefix-repetition':
        lines.push('  → 变换段落开头句式，使用不同的叙事角度或主语。');
        break;
      case 'cliche-density':
        lines.push('  → 替换套路化表达为更具体、独特的描写。');
        break;
      case 'meta-narrative':
        lines.push('  → 删除所有 AI/作者/写作元语言，这些在小说正文中绝不能出现。');
        break;
      case 'micro-action-clustering':
        lines.push('  → 同段微动作模板最多保留一个，改用"事件→反应→后果"结构。');
        break;
      case 'excessive-hedging':
        lines.push('  → 减少对冲词使用，用确定性表述替代模糊描写。');
        break;
      case 'parallel-structure-repetition':
        lines.push('  → 打破连续排比句式，变换句子长度和结构。');
        break;
      case 'sensory-monotony':
        lines.push('  → 加入听觉/触觉/嗅觉/味觉描写，丰富感官层次。');
        break;
      case 'emotion-tell-show-ratio':
        lines.push('  → 用角色行为、生理反应、环境变化来展示情感，而非直接标签。');
        break;
      case 'markdown-formatting':
        lines.push('  → 删除所有 Markdown 格式标记，小说正文是纯文本，不是 Markdown 文档。');
        break;
      case 'connector-density':
        lines.push('  → 减少段首过渡连接词（然而/此外/与此同时等），用动作、感官细节或时间变化自然过渡场景。');
        break;
      case 'sentence-length-uniformity':
        lines.push('  → 句子长度太均匀。穿插使用短句（3-8字制造节奏感）和长句（20-40字营造沉浸感），制造长短交错的阅读节奏。');
        break;
      case 'gesture-tag-dialogue':
        lines.push('  → 删除括号动作标签如（冷笑）、（压低声音），将语气和神态融入叙述句中。');
        break;
      case 'paragraph-length-uniformity':
        lines.push('  → 段落长度太均匀。穿插单句段（强调/停顿）和长段（沉浸描写），打破机械的段落节奏。');
        break;
      case 'weak-modifiers':
        lines.push('  → 删除很/非常/十分+情感形容词的弱修饰组合，用角色行为和具体细节展示情感强度。');
        break;
      case 'ellipsis-overuse':
        lines.push('  → 减少省略号使用，大部分可用逗号或句号替代，只在真正需要表达犹豫/中断时使用。');
        break;
      case 'perception-opening':
        lines.push('  → 减少"他看到/发现/感觉到"等感知动词句式，改为直接描写被感知的对象，让读者自己"看到"。');
        break;
      case 'sentence-ending-monotony':
        lines.push('  → 变换句尾结构，避免连续多句以相同助词（了/着/的）结尾，混用不同句式增加节奏感。');
        break;
      case 'contrast-phrasing':
        lines.push('  → 删除“不是X，而是Y / 并非X，而是Y / 与其说X，不如说Y”这类纠偏对照句，直接写判断、动作、后果或场面变化。');
        break;
      case 'learned-patterns':
        lines.push('  → 删除或替换这些通过历史数据学习到的 AI 痕迹表达，用更自然的写法代替。');
        break;
    }
  }

  lines.push('');
  lines.push('【改写边界】');
  lines.push('- 保持剧情内容不变，只修改表达方式。');
  lines.push('- 输出格式仍为"润色后的正文 + ---EDITOR_NOTES--- + 修改说明"。');

  return lines.join('\n');
}
