import { describe, expect, it } from 'vitest';
import {
  allocateContextBudget,
  CONTEXT_PRIORITIES,
  DEFAULT_MAX_CHARS,
  EDITOR_MAX_CHARS,
  MEMORY_SUMMARY_MAX_CHARS,
} from './context-budget.js';
import {
  EARLIER_CHAPTER_MAX_CHARS,
  PREV_CHAPTER_MAX_CHARS,
} from './pipeline-constants.js';

describe('long-context budgets', () => {
  it('defaults to long-context model budgets for generation quality', () => {
    expect(DEFAULT_MAX_CHARS).toBeGreaterThanOrEqual(64000);
    expect(EDITOR_MAX_CHARS).toBeGreaterThanOrEqual(48000);
    expect(MEMORY_SUMMARY_MAX_CHARS).toBeGreaterThanOrEqual(24000);
    expect(PREV_CHAPTER_MAX_CHARS).toBeGreaterThanOrEqual(6000);
    expect(EARLIER_CHAPTER_MAX_CHARS).toBeGreaterThanOrEqual(1500);
  });

  it('keeps chapter advice ahead of low-priority context when budget is tight', () => {
    expect(CONTEXT_PRIORITIES.chapterAdviceContext).toBeGreaterThan(CONTEXT_PRIORITIES.relationshipEvolutionHints);
    expect(CONTEXT_PRIORITIES.chapterAdviceContext).toBeLessThan(CONTEXT_PRIORITIES.characterStallHints);
    expect(CONTEXT_PRIORITIES.chapterAdviceContext).toBeLessThan(CONTEXT_PRIORITIES.outlineContract);

    const { kept, trimmed } = allocateContextBudget([
      {
        key: 'chapterAdviceContext',
        label: 'chapter advice',
        content: '上一章记忆落库审计提示：摘要未成功入库，下章要自然承接。',
        priority: CONTEXT_PRIORITIES.chapterAdviceContext,
      },
      {
        key: 'seriesContext',
        label: 'series context',
        content: '系列背景'.repeat(600),
        priority: CONTEXT_PRIORITIES.seriesContext,
      },
      {
        key: 'antiTemplateRules',
        label: 'anti template',
        content: '去模板约束'.repeat(600),
        priority: CONTEXT_PRIORITIES.antiTemplateRules,
      },
    ], 900);

    expect(kept.map(section => section.key)).toContain('chapterAdviceContext');
    expect(trimmed).toContain('seriesContext');
  });
});
