/**
 * Reader 反馈结构化解析器
 *
 * 将 Reader 的自由文本反馈拆分为可执行的修复指令，
 * 让 Writer 在修订时能精准定位问题。
 */

export type FeedbackDimension =
  | 'dialogue'      // 对话问题
  | 'pacing'        // 节奏问题
  | 'description'   // 描写问题
  | 'character'     // 角色塑造问题
  | 'plot'          // 情节逻辑问题
  | 'worldbuilding' // 世界观问题
  | 'style'         // 文风问题
  | 'emotion'       // 情感表达问题
  | 'continuity'    // 连贯性问题
  | 'general';      // 通用

export type StructuredFeedbackItem = {
  dimension: FeedbackDimension;
  severity: 'critical' | 'major' | 'minor';
  problem: string;
  suggestion: string;
};

export type StructuredFeedback = {
  items: StructuredFeedbackItem[];
  overallScore: number;
  /** Top 3 most critical issues to fix */
  topPriorities: StructuredFeedbackItem[];
};

/** Keyword patterns for dimension classification */
const DIMENSION_PATTERNS: Array<{ dimension: FeedbackDimension; keywords: string[] }> = [
  { dimension: 'dialogue', keywords: ['对话', '台词', '说话', '口吻', '语气', '对白'] },
  { dimension: 'pacing', keywords: ['节奏', '拖沓', '仓促', '过快', '过慢', '冗长', '紧凑'] },
  { dimension: 'description', keywords: ['描写', '环境', '场景', '画面', '细节', '感官'] },
  { dimension: 'character', keywords: ['角色', '人物', '性格', '动机', '行为', '形象', '塑造'] },
  { dimension: 'plot', keywords: ['情节', '剧情', '逻辑', '合理', '突兀', '转折', '冲突'] },
  { dimension: 'worldbuilding', keywords: ['世界观', '设定', '体系', '规则', '背景'] },
  { dimension: 'style', keywords: ['文风', '文笔', '用词', '修辞', '表达', '语言'] },
  { dimension: 'emotion', keywords: ['情感', '感情', '共鸣', '感染力', '代入感', '张力'] },
  { dimension: 'continuity', keywords: ['连贯', '矛盾', '前后', '一致', '衔接', '承接'] },
];

/** Severity keywords */
const SEVERITY_CRITICAL = ['严重', '致命', '重大', '必须', '急需', '不可接受'];
const SEVERITY_MAJOR = ['明显', '较大', '需要', '应该', '建议改进'];

function classifyDimension(text: string): FeedbackDimension {
  let bestDim: FeedbackDimension = 'general';
  let bestScore = 0;
  for (const { dimension, keywords } of DIMENSION_PATTERNS) {
    const score = keywords.filter(k => text.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      bestDim = dimension;
    }
  }
  return bestDim;
}

function classifySeverity(text: string): 'critical' | 'major' | 'minor' {
  if (SEVERITY_CRITICAL.some(k => text.includes(k))) return 'critical';
  if (SEVERITY_MAJOR.some(k => text.includes(k))) return 'major';
  return 'minor';
}

/**
 * Parse Reader feedback text into structured items.
 * Splits on common delimiters (numbered lists, bullet points, paragraphs).
 */
export function parseReaderFeedback(
  feedbackText: string,
  overallScore: number = 70,
): StructuredFeedback {
  // Split into individual feedback points
  const segments = feedbackText
    .split(/(?:\n\s*[-•*]\s*|\n\s*\d+[.、）)]\s*|\n{2,})/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  const items: StructuredFeedbackItem[] = segments.map(segment => {
    const dimension = classifyDimension(segment);
    const severity = classifySeverity(segment);

    // Try to split into problem + suggestion
    const suggestionMarkers = ['建议', '可以', '应该', '不妨', '试试', '改为', '调整'];
    let problem = segment;
    let suggestion = '';

    for (const marker of suggestionMarkers) {
      const idx = segment.indexOf(marker);
      if (idx > 10) { // marker should not be at the very start
        problem = segment.slice(0, idx).trim();
        suggestion = segment.slice(idx).trim();
        break;
      }
    }

    if (!suggestion) {
      suggestion = '请针对此问题进行修改';
    }

    return { dimension, severity, problem, suggestion };
  });

  // Sort by severity
  const severityOrder = { critical: 0, major: 1, minor: 2 };
  items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const topPriorities = items.slice(0, 3);

  return { items, overallScore, topPriorities };
}

const DIMENSION_LABELS: Record<FeedbackDimension, string> = {
  dialogue: '对话',
  pacing: '节奏',
  description: '描写',
  character: '角色',
  plot: '情节',
  worldbuilding: '世界观',
  style: '文风',
  emotion: '情感',
  continuity: '连贯性',
  general: '综合',
};

function getDimensionLabel(dim: FeedbackDimension): string {
  return DIMENSION_LABELS[dim] ?? '综合';
}

/**
 * Build structured revision instructions for the Writer
 */
export function buildRevisionInstructions(feedback: StructuredFeedback): string {
  if (feedback.items.length === 0) return '';

  const lines: string[] = [];
  lines.push(`Reader 评分：${feedback.overallScore}/100`);
  lines.push('');

  if (feedback.topPriorities.length > 0) {
    lines.push('### 优先修复（按严重程度排序）：');
    for (let i = 0; i < feedback.topPriorities.length; i++) {
      const item = feedback.topPriorities[i];
      const severityLabel = item.severity === 'critical' ? '🔴'
        : item.severity === 'major' ? '🟡' : '🟢';
      const dimLabel = getDimensionLabel(item.dimension);
      lines.push(`${i + 1}. ${severityLabel} [${dimLabel}] ${item.problem}`);
      lines.push(`   → ${item.suggestion}`);
    }
  }

  // Additional issues beyond top 3
  if (feedback.items.length > 3) {
    lines.push('');
    lines.push(`另有 ${feedback.items.length - 3} 个次要问题，修订时如有余力可一并处理。`);
  }

  return lines.join('\n');
}
