import { describe, expect, it } from 'vitest';
import {
  buildCurateCultureInput,
  buildCurateCultureParsedResult,
} from './curate-culture-support.js';

describe('curate culture support', () => {
  it('builds culture input with chunk progress and chapter snippets', () => {
    const text = buildCurateCultureInput({
      chunkIndex: 1,
      chunkCount: 3,
      cultureChunk: [{ name: '祭火礼', description: '火祭礼制' }] as any,
      indexChunk: [{ id: '1', name: '赤焰宗', category: 'faction' }],
      totalCultureEntries: 12,
      recentChapterSnippets: ['### 第8章\n祭坛火种被夺。'],
    });

    expect(text).toContain('分片：2/3');
    expect(text).toContain('"name": "祭火礼"');
    expect(text).toContain('文化条目总数：12');
    expect(text).toContain('### 第8章');
  });

  it('builds parsed culture result from merged entries and summaries', () => {
    const result = buildCurateCultureParsedResult({
      summaryParts: ['补齐禁忌', '补齐后果'],
      mergedCuratedEntries: [
        {
          name: '祭火礼',
          description: '以火焰完成成年仪式',
          constraints: ['禁忌：不得中断'],
          consequences: ['后果：中断者逐出宗门'],
          details: { taboo: '不得中断' },
          relatedEntries: [],
          tags: ['礼制'],
        },
      ] as any,
    });

    expect(result.summary).toBe('补齐禁忌；补齐后果');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe('祭火礼');
  });
});
