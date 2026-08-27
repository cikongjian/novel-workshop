import { describe, expect, it, vi } from 'vitest';
import { refreshPersistedChapterDeliveryDiagnostics } from './chapter-delivery-diagnostics.js';

describe('refreshPersistedChapterDeliveryDiagnostics', () => {
  it('recomputes title delivery after a generated title is adopted', async () => {
    const timestamp = new Date().toISOString();
    const chapter = {
      novelId: 'novel-1',
      chapterNumber: 1,
      title: '冷柜里的旧工号',
      content: '周砚推开冷柜门，报警灯立刻亮起。林见月把记录递给他，两人必须在停机前找到故障源。',
      summary: '',
      wordCount: 46,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {
        readerDeliveryAudit: {
          score: 62,
          passed: false,
          issues: ['标题交付偏弱：标题为空。'],
          suggestions: [],
          dimensions: {
            title: 62,
            opening: 80,
            promisePayoff: 80,
            readability: 80,
            endingHook: 80,
            publicSurface: 80,
          },
        },
        generationLifecycle: {
          mode: 'observe',
          phase: 'final',
          chapterStatus: 'reviewed',
          warnings: ['reader-delivery-failed:62'],
          updatedAt: timestamp,
        },
        updatedAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const novelManager = {
      getChapter: vi.fn().mockResolvedValue(chapter),
      getNovel: vi.fn().mockResolvedValue({
        id: 'novel-1',
        title: '凌晨订单',
        synopsis: '维修员追查异常设备。',
        genre: 'modern',
        tags: [],
        constitutionTags: [],
      }),
      saveChapter: vi.fn().mockResolvedValue(undefined),
    };

    const refreshed = await refreshPersistedChapterDeliveryDiagnostics(
      novelManager as any,
      'novel-1',
      1,
    );

    expect(refreshed?.diagnostics?.readerDeliveryAudit?.dimensions.title).toBe(88);
    expect(refreshed?.diagnostics?.readerDeliveryAudit?.issues.join('\n')).not.toContain('标题为空');
    expect(refreshed?.diagnostics?.generationLifecycle?.warnings).not.toContain('reader-delivery-failed:62');
    expect(novelManager.saveChapter).toHaveBeenCalledTimes(1);
  });
});
