import { describe, expect, it } from 'vitest';
import {
  buildCuratePowerFinalResult,
  buildCuratePowerStageInput,
} from './curate-power-support.js';

describe('curate power support', () => {
  it('builds stage input with progress, chunks, and chapter snippets', () => {
    const text = buildCuratePowerStageInput({
      stageTask: '细化力量梯度层级',
      chunkIndex: 1,
      chunkCount: 3,
      powerChunk: [{ name: '灵火诀', description: '火系修炼法门' }] as any,
      indexChunk: [{ id: '1', name: '赤焰宗', category: 'faction' }],
      totalPowerEntries: 12,
      recentChapterSnippets: ['### 第8章\n主角引爆灵火。'],
    });

    expect(text).toContain('当前阶段：细化力量梯度层级');
    expect(text).toContain('分片：2/3');
    expect(text).toContain('"name": "灵火诀"');
    expect(text).toContain('### 第8章');
  });

  it('builds final result summary from stage reports', () => {
    const result = buildCuratePowerFinalResult({
      stageReports: [
        { role: 'power-gradient-designer', summary: '补齐梯度', producedCount: 4 },
        { role: 'power-world-integrator', summary: '嵌入世界观', producedCount: 4 },
      ],
      stageInputEntries: [
        {
          name: '灵火诀',
          description: '火系修炼法门',
          category: 'power',
          constraints: [],
          consequences: [],
          tags: [],
          relationships: [],
        },
      ] as any,
    });

    expect(result.summary).toBe('补齐梯度；嵌入世界观');
    expect(result.entries).toHaveLength(1);
  });
});
