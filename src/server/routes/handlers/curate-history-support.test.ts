import { describe, expect, it } from 'vitest';
import {
  buildCurateHistoryInput,
  buildCurateHistoryParsedResult,
} from './curate-history-support.js';

describe('curate history support', () => {
  it('builds history input with timeline constraints and chapter snippets', () => {
    const text = buildCurateHistoryInput({
      chunkIndex: 0,
      chunkCount: 2,
      historyChunk: [{ name: '赤焰立宗', description: '宗门建立' }] as any,
      indexChunk: [{ id: '1', name: '赤焰宗', category: 'faction' }],
      totalHistoryEntries: 9,
      recentChapterSnippets: ['### 第12章\n旧年战碑再次出现。'],
    });

    expect(text).toContain('分片：1/2');
    expect(text).toContain('details.sequence');
    expect(text).toContain('"name": "赤焰立宗"');
    expect(text).toContain('### 第12章');
  });

  it('builds parsed history result from merged entries and summaries', () => {
    const result = buildCurateHistoryParsedResult({
      summaryParts: ['补齐纪年', '重排时间线'],
      mergedCuratedEntries: [
        {
          name: '赤焰立宗',
          description: '赤焰宗正式立宗',
          year: '公元312年',
          era: '赤炎纪',
          sequence: 1,
          details: { year: '公元312年', era: '赤炎纪', sequence: '1' },
          relatedEntries: [],
          tags: ['宗门史'],
        },
      ] as any,
    });

    expect(result.summary).toBe('补齐纪年；重排时间线');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe('赤焰立宗');
  });
});
