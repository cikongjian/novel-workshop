import { describe, expect, it, vi } from 'vitest';
import type { OutlineData } from '../novel/types.js';
import { ensureChapterPlotThreadSnapshots } from './plot-thread-snapshot-service.js';

describe('ensureChapterPlotThreadSnapshots', () => {
  it('creates a reusable main thread and a chapter snapshot when the outline has none', async () => {
    const outline: OutlineData = {
      chapters: [{
        chapterNumber: 1,
        title: '第一章',
        summary: '周砚修复故障并发现下一处压力异常。',
        beats: [],
        tensionTarget: 7,
        plotThreadsAdvanced: [],
        keyEvents: ['修复气闸故障', '发现压力异常'],
        notes: '',
      }],
      plotThreads: [],
      foreshadowing: [],
    };
    const novelManager = {
      getOutline: vi.fn().mockResolvedValue(outline),
      getNovel: vi.fn().mockResolvedValue({ title: '星环维修日志', synopsis: '维修员排除空间站故障。' }),
      getCharacters: vi.fn().mockResolvedValue([{ id: 'character-1' }]),
      saveOutline: vi.fn().mockResolvedValue(undefined),
      getPlotThreadSnapshots: vi.fn().mockResolvedValue([]),
      savePlotThreadSnapshots: vi.fn().mockResolvedValue(undefined),
    };

    const snapshots = await ensureChapterPlotThreadSnapshots({
      novelManager: novelManager as never,
      novelId: 'novel-1',
      chapterNumber: 1,
    });

    expect(outline.plotThreads).toHaveLength(1);
    expect(outline.chapters[0].plotThreadsAdvanced).toEqual([outline.plotThreads[0].id]);
    expect(snapshots).toEqual([
      expect.objectContaining({
        threadId: outline.plotThreads[0].id,
        chapterNumber: 1,
        status: 'new',
      }),
    ]);
    expect(novelManager.saveOutline).toHaveBeenCalledTimes(1);
    expect(novelManager.savePlotThreadSnapshots).toHaveBeenCalledWith('novel-1', snapshots);
  });
});
