/**
 * 修订策略选择器
 *
 * 根据 Reader 结构化反馈，决定修订范围和方式：
 * - 如果只有对话问题 → 只重写对话部分
 * - 如果只有节奏问题 → 调整段落分布
 * - 如果多维度失败 → 全面修订但标注优先级
 */

import type { StructuredFeedback, FeedbackDimension } from './structured-feedback.js';

export type RevisionScope =
  | 'dialogue-only'    // 只改对话
  | 'pacing-only'      // 只调节奏
  | 'description-only' // 只改描写
  | 'emotion-only'     // 只改情感表达
  | 'plot-fix'         // 修复情节逻辑
  | 'full-revision'    // 全面修订
  | 'style-polish';    // 文风润色

export type RevisionStrategy = {
  scope: RevisionScope;
  focusDimensions: FeedbackDimension[];
  instructions: string;
  /** Whether to preserve the overall structure */
  preserveStructure: boolean;
};

const SCOPE_MAP: Record<FeedbackDimension, RevisionScope> = {
  dialogue: 'dialogue-only',
  pacing: 'pacing-only',
  description: 'description-only',
  emotion: 'emotion-only',
  plot: 'plot-fix',
  character: 'full-revision',
  worldbuilding: 'full-revision',
  style: 'style-polish',
  continuity: 'plot-fix',
  general: 'full-revision',
};

const RELATED_PAIRS: FeedbackDimension[][] = [
  ['dialogue', 'character'],
  ['pacing', 'description'],
  ['plot', 'continuity'],
  ['emotion', 'description'],
  ['style', 'dialogue'],
];

export function selectRevisionStrategy(feedback: StructuredFeedback): RevisionStrategy {
  const criticalDims = new Set(
    feedback.items
      .filter(i => i.severity === 'critical')
      .map(i => i.dimension),
  );
  const majorDims = new Set(
    feedback.items
      .filter(i => i.severity === 'major')
      .map(i => i.dimension),
  );

  const allProblemDims = new Set([...criticalDims, ...majorDims]);

  // If only one dimension has issues, use targeted revision
  if (allProblemDims.size === 1) {
    const dim = [...allProblemDims][0];
    const scope = SCOPE_MAP[dim];
    return {
      scope,
      focusDimensions: [dim],
      instructions: buildScopedInstructions(scope, feedback),
      preserveStructure: scope !== 'full-revision' && scope !== 'plot-fix',
    };
  }

  // If 2 related dimensions, try targeted
  if (allProblemDims.size === 2) {
    const dims = [...allProblemDims];
    const isRelated = RELATED_PAIRS.some(
      pair => dims.includes(pair[0]) && dims.includes(pair[1]),
    );
    if (isRelated) {
      return {
        scope: SCOPE_MAP[dims[0]],
        focusDimensions: dims,
        instructions: buildScopedInstructions(SCOPE_MAP[dims[0]], feedback),
        preserveStructure: true,
      };
    }
  }

  // Multiple unrelated dimensions → full revision
  return {
    scope: 'full-revision',
    focusDimensions: [...allProblemDims],
    instructions: buildFullRevisionInstructions(feedback),
    preserveStructure: false,
  };
}

const SCOPE_INSTRUCTIONS: Record<RevisionScope, string> = {
  'dialogue-only': '本次修订聚焦于对话部分。保持情节结构和描写不变，只修改角色对话：',
  'pacing-only': '本次修订聚焦于节奏调整。保持核心情节不变，调整段落长度和场景切换：',
  'description-only': '本次修订聚焦于描写部分。保持对话和情节不变，增强或精简描写：',
  'emotion-only': '本次修订聚焦于情感表达。保持情节框架不变，深化角色情感和读者共鸣：',
  'plot-fix': '本次修订聚焦于情节逻辑修复。需要调整事件因果关系和连贯性：',
  'style-polish': '本次修订聚焦于文风润色。保持内容不变，优化用词和表达：',
  'full-revision': '本次进行全面修订：',
};

function buildScopedInstructions(scope: RevisionScope, feedback: StructuredFeedback): string {
  const lines: string[] = [SCOPE_INSTRUCTIONS[scope]];

  for (const item of feedback.topPriorities) {
    lines.push(`- ${item.problem}`);
    if (item.suggestion !== '请针对此问题进行修改') {
      lines.push(`  → ${item.suggestion}`);
    }
  }

  return lines.join('\n');
}

function buildFullRevisionInstructions(feedback: StructuredFeedback): string {
  const lines: string[] = ['本次需要全面修订，按优先级处理以下问题：'];

  const severityLabels: Record<string, string> = {
    critical: '必修',
    major: '重要',
    minor: '次要',
  };

  for (let i = 0; i < feedback.topPriorities.length; i++) {
    const item = feedback.topPriorities[i];
    const label = severityLabels[item.severity] ?? '次要';
    lines.push(`${i + 1}. [${label}] ${item.problem}`);
    if (item.suggestion !== '请针对此问题进行修改') {
      lines.push(`   → ${item.suggestion}`);
    }
  }

  if (feedback.items.length > 3) {
    lines.push(`\n另有 ${feedback.items.length - 3} 个次要问题可一并处理。`);
  }

  return lines.join('\n');
}

/**
 * Build the revision mode hint for the Writer context
 */
export function buildRevisionModeHint(strategy: RevisionStrategy): string {
  if (strategy.preserveStructure) {
    return `【修订模式：${strategy.scope}】请保持整体结构不变，只修改指定部分。`;
  }
  return `【修订模式：全面修订】可以调整结构和内容。`;
}
