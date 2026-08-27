import { describe, expect, it } from 'vitest';
import { buildRebirthResponse, getRebirthBatchQueue } from './rebirth-support.js';

describe('rebirth support', () => {
  it('builds rebirth response with aggregated blueprint counts', () => {
    const response = buildRebirthResponse({
      result: { newNovelId: 'novel-2', totalChapters: 24 },
      blueprint: {
        title: '赤焰重生录',
        synopsis: '旧案重开，命线重织',
        characters: [{}, {}],
        worldEntries: [{}, {}, {}],
        qualityNotes: '强化主线',
        rewriteDirection: '加强复仇张力',
      },
      autoGenerate: true,
    });

    expect(response.newNovelId).toBe('novel-2');
    expect(response.blueprint.characterCount).toBe(2);
    expect(response.blueprint.worldEntryCount).toBe(3);
    expect(response.autoGenerate).toBe(true);
  });

  it('reads batch queue from router extension safely', () => {
    const router = { __batchQueue: { isRunning: () => false } } as any;
    expect(getRebirthBatchQueue(router)).toBe(router.__batchQueue);
  });
});
