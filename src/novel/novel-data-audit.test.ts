import { describe, expect, it } from 'vitest';
import { buildAuditReport } from './novel-data-audit.js';

describe('buildAuditReport structural readiness', () => {
  it('includes externally detected continuity conflicts in health scoring', () => {
    const report = buildAuditReport({
      novel: {
        id: 'novel-conflict',
        title: '冲突样本',
        status: 'writing',
        ownerId: 'owner-1',
        chapterCount: 0,
        finalizedChapterCount: 0,
        wordCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      persistedMetadataStats: { chapterCount: 0, finalizedChapterCount: 0, wordCount: 0 },
      chapters: [],
      rawCharacters: [],
      charactersSource: '[]',
      characters: [],
      invalidCharacters: [],
      pendingCharacters: [],
      pendingCharactersSource: '[]',
      outline: null,
      outlineSource: '',
      characterStates: [],
      invalidCharacterStates: [],
      characterEvents: [],
      worldEntries: [],
      plotThreadSnapshots: [],
      invalidPlotThreadSnapshots: [],
    } as any, [{
      code: 'character_resurrection_conflict',
      severity: 'error',
      message: '王厉死亡后再次主动在场',
      entityType: 'character',
      entityId: 'wang-li',
      repairable: false,
    }]);

    expect(report.issues.map(issue => issue.code)).toContain('character_resurrection_conflict');
    expect(report.summary.healthScore).toBeLessThan(100);
  });

  it('does not report perfect health when written chapters lack characters and world canon', () => {
    const report = buildAuditReport({
      novel: {
        id: 'novel-1',
        title: '测试小说',
        synopsis: '',
        genre: 'modern',
        status: 'writing',
        ownerId: 'owner-1',
        tags: [],
        chapterCount: 1,
        finalizedChapterCount: 0,
        wordCount: 1200,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      persistedMetadataStats: { chapterCount: 1, finalizedChapterCount: 0, wordCount: 1200 },
      chapters: [{ chapterNumber: 1, title: '第一夜', status: 'reviewed', wordCount: 1200 }],
      rawCharacters: [],
      charactersSource: '[]',
      characters: [],
      invalidCharacters: [],
      outline: {
        chapters: [{
          chapterNumber: 1,
          title: '第一夜',
          summary: '主角开始调查。',
          beats: [],
          tensionTarget: 5,
          plotThreadsAdvanced: [],
          keyEvents: ['开始调查'],
          notes: '',
        }],
        plotThreads: [],
        foreshadowing: [],
      },
      outlineSource: '{}',
      characterStates: [],
      invalidCharacterStates: [],
      characterEvents: [],
      worldEntries: [],
    } as any);

    expect(report.summary.healthScore).toBeLessThan(100);
    expect(report.summary.worldEntryCount).toBe(0);
    expect(report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'character_profiles_missing',
      'world_canon_missing',
      'task_assignments_missing',
      'chapters_not_finalized',
    ]));
    expect(report.capabilities.worldCanon).toBe(false);
  });

  it('reports missing plot threads after a multi-chapter story has started', () => {
    const chapters = [1, 2, 3].map(chapterNumber => ({
      chapterNumber,
      title: `第${chapterNumber}章`,
      status: 'finalized',
      wordCount: 1200,
    }));
    const report = buildAuditReport({
      novel: {
        id: 'novel-2',
        title: '测试小说',
        status: 'writing',
        ownerId: 'owner-1',
        chapterCount: 3,
        finalizedChapterCount: 3,
        wordCount: 3600,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      persistedMetadataStats: { chapterCount: 3, finalizedChapterCount: 3, wordCount: 3600 },
      chapters,
      rawCharacters: [],
      charactersSource: '[]',
      characters: [],
      invalidCharacters: [],
      outline: { chapters: [], plotThreads: [], foreshadowing: [] },
      outlineSource: '{}',
      characterStates: [],
      invalidCharacterStates: [],
      characterEvents: [],
      worldEntries: [],
    } as any);

    expect(report.issues.map(issue => issue.code)).toContain('plot_threads_missing');
    expect(report.summary.healthScore).toBeLessThan(100);
  });
});
