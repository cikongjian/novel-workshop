import { describe, expect, it } from 'vitest';
import {
  buildCurateForeshadowingInput,
  buildCurateForeshadowingParsedResult,
} from './curate-foreshadowing-support.js';

describe('curate foreshadowing support', () => {
  it('builds foreshadowing input with counts and chapter snippets', () => {
    const text = buildCurateForeshadowingInput({
      limitedForeshadowing: [{ hint: '血色令牌', plantedInChapter: 3 }] as any,
      totalForeshadowingCount: 12,
      resolvedCount: 4,
      overdueCount: 2,
      recentChapterSnippets: ['### 第9章\n令牌再度发光。'],
    });

    expect(text).toContain('伏笔总数：12（本次处理 1 条）');
    expect(text).toContain('已回收：4');
    expect(text).toContain('"hint": "血色令牌"');
    expect(text).toContain('### 第9章');
  });

  it('builds parsed foreshadowing result from raw json', () => {
    const result = buildCurateForeshadowingParsedResult(JSON.stringify({
      summary: '清理重复伏笔并修正状态',
      foreshadowing: [
        {
          hint: '血色令牌',
          plantedInChapter: 3,
          resolution: '指向旧案真凶',
          isResolved: false,
          relatedPlotThreads: [],
          priority: 'high',
        },
      ],
    }));

    expect(result.summary).toBe('清理重复伏笔并修正状态');
    expect(result.foreshadowing).toHaveLength(1);
    expect(result.foreshadowing[0].hint).toBe('血色令牌');
  });
});
