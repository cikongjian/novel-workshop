import { describe, expect, it } from 'vitest';
import {
  buildQuoteCleanupSummary,
  buildQuoteEditId,
  buildSelectedEditMap,
  cleanNonDialogueQuotes,
  normalizeQuoteTextForFeedback,
  resolveQuoteCleanupTargets,
} from './quote-cleanup-heuristics.js';
import { CleanQuoteUsageBody } from './quote-route-support.js';

describe('quote route support', () => {
  it('validates chapter range and resolves existing targets', () => {
    const parsed = CleanQuoteUsageBody.parse({
      fromChapter: 2,
      toChapter: 4,
    });

    expect(resolveQuoteCleanupTargets([1, 2, 4, 5], parsed)).toEqual([2, 4]);
  });

  it('builds selected edit map and normalized feedback tokens', () => {
    expect(buildSelectedEditMap([
      {
        chapterNumber: 3,
        editIds: ['a', 'b'],
      },
    ]).get(3)).toEqual(new Set(['a', 'b']));
    expect(normalizeQuoteTextForFeedback('  剑阁  ')).toBe('剑阁');
  });

  it('detects non-dialogue quotes and removes only selected edits', () => {
    const content = '牌匾上写着"天机阁"。林清风说道，"进来。"\n';
    const editId = buildQuoteEditId(5, 10, '天机阁');
    const result = cleanNonDialogueQuotes(content, new Set([editId]));

    expect(result.replacements).toBe(1);
    expect(result.content).toContain('牌匾上写着天机阁。');
    expect(result.content).toContain('林清风说道，"进来。"');
  });

  it('summarizes preview and applied results', () => {
    expect(buildQuoteCleanupSummary({
      applied: false,
      totalScanned: 12,
      affected: 2,
      replacements: 3,
    })).toBe('预览发现 2 章，共处理 3 处非台词引号。');

    expect(buildQuoteCleanupSummary({
      applied: true,
      totalScanned: 5,
      affected: 0,
      replacements: 0,
    })).toBe('已扫描 5 章，未发现需要清洗的非台词引号。');
  });
});
