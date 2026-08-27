import type { AgentSkillTriggerCondition } from './types.js';
import type { ChapterOutline } from '../novel/types.js';

/**
 * 触发条件评估上下文
 */
export type TriggerEvaluationContext = {
  /** 当前章节号 */
  chapterNumber?: number;
  /** 章节类型（由外部推断或用户标注） */
  chapterType?: string;
  /** 本章推进的情节线 ID 列表 */
  plotThreadsAdvanced?: string[];
  /** 章节张力目标 */
  tensionTarget?: number;
  /** 平台配置 */
  platformProfile?: 'auto' | 'fanqie' | 'qidian';
  /** 目标字数 */
  maxWordCount?: number;
  /** 章节大纲（可选，用于提取更多上下文） */
  chapterOutline?: ChapterOutline;
};

/**
 * 评估触发条件是否满足
 */
export function evaluateTriggerCondition(
  condition: AgentSkillTriggerCondition,
  context: TriggerEvaluationContext,
): boolean {
  switch (condition.type) {
    case 'chapter-range':
      return evaluateChapterRange(condition, context);
    case 'chapter-type':
      return evaluateChapterType(condition, context);
    case 'plot-thread':
      return evaluatePlotThread(condition, context);
    case 'tension-range':
      return evaluateTensionRange(condition, context);
    case 'platform':
      return evaluatePlatform(condition, context);
    case 'word-count-range':
      return evaluateWordCountRange(condition, context);
    case 'and':
      return evaluateAnd(condition, context);
    case 'or':
      return evaluateOr(condition, context);
    case 'not':
      return evaluateNot(condition, context);
    default:
      // 未知条件类型，默认不触发
      return false;
  }
}

function evaluateChapterRange(
  condition: { type: 'chapter-range'; min?: number; max?: number },
  context: TriggerEvaluationContext,
): boolean {
  if (context.chapterNumber == null) return false;
  const { min, max } = condition;
  if (min != null && context.chapterNumber < min) return false;
  if (max != null && context.chapterNumber > max) return false;
  return true;
}

function evaluateChapterType(
  condition: { type: 'chapter-type'; values: string[] },
  context: TriggerEvaluationContext,
): boolean {
  if (!context.chapterType) return false;
  return condition.values.includes(context.chapterType);
}

function evaluatePlotThread(
  condition: { type: 'plot-thread'; values: string[] },
  context: TriggerEvaluationContext,
): boolean {
  if (!context.plotThreadsAdvanced || context.plotThreadsAdvanced.length === 0) {
    return false;
  }
  // 只要有任一情节线匹配即可
  return condition.values.some(threadId =>
    context.plotThreadsAdvanced!.includes(threadId),
  );
}

function evaluateTensionRange(
  condition: { type: 'tension-range'; min?: number; max?: number },
  context: TriggerEvaluationContext,
): boolean {
  if (context.tensionTarget == null) return false;
  const { min, max } = condition;
  if (min != null && context.tensionTarget < min) return false;
  if (max != null && context.tensionTarget > max) return false;
  return true;
}

function evaluatePlatform(
  condition: { type: 'platform'; values: ('fanqie' | 'qidian' | 'auto')[] },
  context: TriggerEvaluationContext,
): boolean {
  if (!context.platformProfile) return false;
  return condition.values.includes(context.platformProfile);
}

function evaluateWordCountRange(
  condition: { type: 'word-count-range'; min?: number; max?: number },
  context: TriggerEvaluationContext,
): boolean {
  if (context.maxWordCount == null) return false;
  const { min, max } = condition;
  if (min != null && context.maxWordCount < min) return false;
  if (max != null && context.maxWordCount > max) return false;
  return true;
}

function evaluateAnd(
  condition: { type: 'and'; conditions: AgentSkillTriggerCondition[] },
  context: TriggerEvaluationContext,
): boolean {
  // 所有子条件都必须满足
  return condition.conditions.every(subCondition =>
    evaluateTriggerCondition(subCondition, context),
  );
}

function evaluateOr(
  condition: { type: 'or'; conditions: AgentSkillTriggerCondition[] },
  context: TriggerEvaluationContext,
): boolean {
  // 任一子条件满足即可
  return condition.conditions.some(subCondition =>
    evaluateTriggerCondition(subCondition, context),
  );
}

function evaluateNot(
  condition: { type: 'not'; condition: AgentSkillTriggerCondition },
  context: TriggerEvaluationContext,
): boolean {
  // 子条件不满足时触发
  return !evaluateTriggerCondition(condition.condition, context);
}

/**
 * 生成触发条件的人类可读描述
 */
export function describeTriggerCondition(condition: AgentSkillTriggerCondition): string {
  switch (condition.type) {
    case 'chapter-range': {
      const { min, max } = condition;
      if (min != null && max != null) return `第 ${min}-${max} 章`;
      if (min != null) return `第 ${min} 章及以后`;
      if (max != null) return `第 ${max} 章及以前`;
      return '任意章节';
    }
    case 'chapter-type':
      return `章节类型为：${condition.values.join('、')}`;
    case 'plot-thread':
      return `推进情节线：${condition.values.length} 条`;
    case 'tension-range': {
      const { min, max } = condition;
      if (min != null && max != null) return `张力 ${min}-${max}`;
      if (min != null) return `张力 ≥ ${min}`;
      if (max != null) return `张力 ≤ ${max}`;
      return '任意张力';
    }
    case 'platform':
      return `平台：${condition.values.join('、')}`;
    case 'word-count-range': {
      const { min, max } = condition;
      if (min != null && max != null) return `字数 ${min}-${max}`;
      if (min != null) return `字数 ≥ ${min}`;
      if (max != null) return `字数 ≤ ${max}`;
      return '任意字数';
    }
    case 'and':
      return `(${condition.conditions.map(describeTriggerCondition).join(' 且 ')})`;
    case 'or':
      return `(${condition.conditions.map(describeTriggerCondition).join(' 或 ')})`;
    case 'not':
      return `非 ${describeTriggerCondition(condition.condition)}`;
    default:
      return '未知条件';
  }
}
