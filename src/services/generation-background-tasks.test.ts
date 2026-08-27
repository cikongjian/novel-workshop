import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateTitleWithRetry: vi.fn(),
  getRecentChapterTitles: vi.fn(),
  shouldAdoptGeneratedChapterTitle: vi.fn(),
  generateChapterCharacterData: vi.fn(),
  updateTruthFiles: vi.fn(),
  verifyTruthFilesHealth: vi.fn(),
  ensureChapterPlotThreadSnapshots: vi.fn(),
  reconcileConfirmedCharacterStatusesFromChapter: vi.fn(),
}));

vi.mock('../server/routes/handlers/shared/chapter-title-generation.js', () => ({
  generateTitleWithRetry: mocks.generateTitleWithRetry,
  getRecentChapterTitles: mocks.getRecentChapterTitles,
}));

vi.mock('../agents/title-audit.js', () => ({
  shouldAdoptGeneratedChapterTitle: mocks.shouldAdoptGeneratedChapterTitle,
}));

vi.mock('./chapter-character-data-service.js', () => ({
  generateChapterCharacterData: mocks.generateChapterCharacterData,
}));

vi.mock('../memory/truth-files/index.js', () => ({
  updateTruthFiles: mocks.updateTruthFiles,
  verifyTruthFilesHealth: mocks.verifyTruthFilesHealth,
}));

vi.mock('./plot-thread-snapshot-service.js', () => ({
  ensureChapterPlotThreadSnapshots: mocks.ensureChapterPlotThreadSnapshots,
}));

vi.mock('./character-status-reconciliation.js', () => ({
  reconcileConfirmedCharacterStatusesFromChapter: mocks.reconcileConfirmedCharacterStatusesFromChapter,
}));

describe('schedulePostSaveBackgroundTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateTitleWithRetry.mockResolvedValue('第1章：不应采用的标题');
    mocks.getRecentChapterTitles.mockResolvedValue([]);
    mocks.shouldAdoptGeneratedChapterTitle.mockReturnValue({ accept: false, reasons: ['bad title'] });
    mocks.generateChapterCharacterData.mockResolvedValue({
      pendingNames: [],
      snapshotCount: 0,
      eventCount: 0,
      highlightCount: 0,
      relationCount: 0,
      cardTouched: false,
      cardBlurbScheduled: false,
    });
    mocks.updateTruthFiles.mockResolvedValue({
      currentState: {},
      pendingHooks: {},
      characterMatrix: {},
    });
    mocks.verifyTruthFilesHealth.mockResolvedValue({
      mode: 'observe',
      chapterNumber: 2,
      hasCurrentState: true,
      hasPendingHooks: true,
      hasCharacterMatrix: true,
      currentStateChapter: 2,
      pendingHooksChapter: 2,
      aligned: true,
      warnings: [],
      checkedAt: new Date().toISOString(),
    });
    mocks.ensureChapterPlotThreadSnapshots.mockResolvedValue([]);
    mocks.reconcileConfirmedCharacterStatusesFromChapter.mockResolvedValue([]);
  });

  it('continues character data generation when generated title is rejected', async () => {
    const { schedulePostSaveBackgroundTasks } = await import('./generation-background-tasks.js');
    const chapter = {
      novelId: 'novel-1',
      chapterNumber: 1,
      title: '原题',
      content: '林渊说道："这一次我来。"',
      summary: '',
      wordCount: 12,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const novel = {
      id: 'novel-1',
      title: '测试小说',
      synopsis: '测试简介',
      genre: 'fantasy',
      tags: [],
    };
    const novelManager = {
      syncNovelMetadataByChapters: vi.fn().mockResolvedValue(undefined),
      getNovel: vi.fn().mockResolvedValue(novel),
      getChapter: vi.fn().mockResolvedValue(chapter),
      saveChapter: vi.fn().mockResolvedValue(undefined),
      getOutline: vi.fn().mockResolvedValue({ chapters: [], plotThreads: [], foreshadowing: [] }),
      getFactGraph: vi.fn().mockResolvedValue({}),
      getPlotThreadSnapshots: vi.fn().mockResolvedValue([]),
    };
    const agents = new Map([
      ['title-generator', { role: 'title-generator', name: 'title', description: '' }],
    ]);

    await schedulePostSaveBackgroundTasks(
      novelManager as any,
      undefined,
      'novel-1',
      1,
      {
        chapterContent: chapter.content,
        outline: '',
        worldNotes: '',
        characterNotes: '',
        draft: '',
        editedContent: chapter.content,
        readerFeedback: '',
        agentOutputs: [],
      },
      agents as any,
      { provider: 'test', model: 'test' } as any,
    );

    expect(mocks.generateChapterCharacterData).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileConfirmedCharacterStatusesFromChapter).toHaveBeenCalledWith(expect.objectContaining({
      novelId: 'novel-1',
      chapterNumber: 1,
      chapterContent: chapter.content,
    }));
    expect(novelManager.saveChapter).not.toHaveBeenCalled();
  }, 15_000);

  it('records truth file health after story-state truth files are updated', async () => {
    const { schedulePostSaveBackgroundTasks } = await import('./generation-background-tasks.js');
    const chapter = {
      novelId: 'novel-2',
      chapterNumber: 2,
      title: '原题',
      content: '林上把合同推回桌面。',
      summary: '',
      wordCount: 12,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {
        memoryContextAudit: {
          mode: 'observe',
          retriever: 'legacy',
          totalChars: 10,
          promptChars: 10,
          unusedPersistedSources: [],
          emptyPromptSources: [],
          warnings: [],
          sources: [],
        },
        updatedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const novel = {
      id: 'novel-2',
      title: '测试小说',
      synopsis: '测试简介',
      genre: 'modern',
      tags: [],
    };
    const snapshot = {
      chapterNumber: 2,
      characters: [],
      world: {
        timelineMarker: '',
        environment: '',
        factionChanges: [],
        geographyChanges: [],
        powerSystemChanges: [],
        socialChanges: [],
      },
      factions: [],
      plot: {
        activeThreads: [],
        pendingForeshadowing: [],
        tensionLevel: 5,
        readerQuestions: [],
      },
      causalChains: [],
      chapterSummary: '合同僵局升级。',
      nextChapterConstraints: [],
    };
    const novelManager = {
      syncNovelMetadataByChapters: vi.fn().mockResolvedValue(undefined),
      getNovel: vi.fn().mockResolvedValue(novel),
      getChapter: vi.fn().mockResolvedValue(chapter),
      saveChapter: vi.fn().mockResolvedValue(undefined),
      getOutline: vi.fn().mockResolvedValue({ chapters: [], plotThreads: [], foreshadowing: [] }),
      getCharacters: vi.fn().mockResolvedValue([]),
      getFactGraph: vi.fn().mockResolvedValue({}),
      getPlotThreadSnapshots: vi.fn().mockResolvedValue([]),
    };
    const storyStateManager = {
      getLatestSnapshot: vi.fn().mockResolvedValue(null),
      buildTrackerInput: vi.fn().mockReturnValue('tracker input'),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      compressIfNeeded: vi.fn().mockResolvedValue(undefined),
    };
    const agents = new Map([
      ['story-state-tracker', {
        execute: vi.fn().mockResolvedValue({
          content: `---STATE_SNAPSHOT---\n${JSON.stringify(snapshot)}`,
        }),
      }],
    ]);

    schedulePostSaveBackgroundTasks(
      novelManager as any,
      undefined,
      'novel-2',
      2,
      {
        chapterContent: chapter.content,
        outline: '',
        worldNotes: '',
        characterNotes: '',
        draft: '',
        editedContent: chapter.content,
        readerFeedback: '',
        agentOutputs: [],
      },
      agents as any,
      { provider: 'test', model: 'test' } as any,
      storyStateManager as any,
    );

    await vi.waitFor(() => {
      expect(mocks.verifyTruthFilesHealth).toHaveBeenCalledWith(
        'novel-2',
        expect.any(String),
        2,
      );
    });

    expect(novelManager.saveChapter).toHaveBeenCalledWith('novel-2', expect.objectContaining({
      diagnostics: expect.objectContaining({
        memoryContextAudit: chapter.diagnostics.memoryContextAudit,
        truthFileHealth: expect.objectContaining({
          aligned: true,
          chapterNumber: 2,
        }),
      }),
    }));
  });

  it('records post-save memory persistence after vector indexing succeeds', async () => {
    const { schedulePostSaveBackgroundTasks } = await import('./generation-background-tasks.js');
    const chapter = {
      novelId: 'novel-memory-1',
      chapterNumber: 3,
      title: '原题',
      content: '许知夏把招新名单压在活动室桌上。',
      summary: '',
      wordCount: 18,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const novelManager = {
      syncNovelMetadataByChapters: vi.fn().mockResolvedValue(undefined),
      getNovel: vi.fn().mockResolvedValue({
        id: 'novel-memory-1',
        title: '测试小说',
        synopsis: '测试简介',
        genre: 'modern',
        tags: [],
      }),
      getChapter: vi.fn().mockResolvedValue(chapter),
      saveChapter: vi.fn().mockResolvedValue(undefined),
      getOutline: vi.fn().mockResolvedValue({ chapters: [], plotThreads: [], foreshadowing: [] }),
      getFactGraph: vi.fn().mockResolvedValue({ facts: [] }),
      getPlotThreadSnapshots: vi.fn().mockResolvedValue([
        { id: 't1', chapterNumber: 3, title: '招新人数压力' },
      ]),
    };
    const novelMemory = {
      indexChapter: vi.fn().mockResolvedValue(undefined),
      indexFactChapter: vi.fn().mockResolvedValue(undefined),
      indexPlotThreadSnapshots: vi.fn().mockResolvedValue(undefined),
    };

    schedulePostSaveBackgroundTasks(
      novelManager as any,
      novelMemory as any,
      'novel-memory-1',
      3,
      {
        chapterContent: chapter.content,
        outline: '',
        worldNotes: '',
        characterNotes: '',
        draft: '',
        editedContent: chapter.content,
        readerFeedback: '',
        agentOutputs: [],
      },
    );

    await vi.waitFor(() => {
      expect(novelMemory.indexChapter).toHaveBeenCalledWith('novel-memory-1', 3, chapter.content);
      expect(novelMemory.indexFactChapter).toHaveBeenCalled();
      expect(novelMemory.indexPlotThreadSnapshots).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(novelManager.saveChapter).toHaveBeenCalledWith('novel-memory-1', expect.objectContaining({
        diagnostics: expect.objectContaining({
          memoryPersistenceAudit: expect.objectContaining({
            chapterNumber: 3,
            chapterIndexed: true,
            factIndexed: true,
            threadIndexed: true,
            threadIndexStatus: 'indexed',
            threadSnapshotCount: 1,
          }),
        }),
      }));
    });
  });

  it('records no-snapshots when there are no plot thread snapshots for the chapter', async () => {
    const { schedulePostSaveBackgroundTasks } = await import('./generation-background-tasks.js');
    const chapter = {
      novelId: 'novel-memory-no-thread',
      chapterNumber: 5,
      title: '原题',
      content: '林澄把复测时间表推到会议桌中央。',
      summary: '',
      wordCount: 18,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const novelManager = {
      syncNovelMetadataByChapters: vi.fn().mockResolvedValue(undefined),
      getNovel: vi.fn().mockResolvedValue({
        id: 'novel-memory-no-thread',
        title: '测试小说',
        synopsis: '测试简介',
        genre: 'modern',
        tags: [],
      }),
      getChapter: vi.fn().mockResolvedValue(chapter),
      saveChapter: vi.fn().mockResolvedValue(undefined),
      getOutline: vi.fn().mockResolvedValue({ chapters: [], plotThreads: [], foreshadowing: [] }),
      getFactGraph: vi.fn().mockResolvedValue({ facts: [] }),
      getPlotThreadSnapshots: vi.fn().mockResolvedValue([]),
    };
    const novelMemory = {
      indexChapter: vi.fn().mockResolvedValue(undefined),
      indexFactChapter: vi.fn().mockResolvedValue(undefined),
      indexPlotThreadSnapshots: vi.fn().mockResolvedValue(undefined),
    };

    schedulePostSaveBackgroundTasks(
      novelManager as any,
      novelMemory as any,
      'novel-memory-no-thread',
      5,
      {
        chapterContent: chapter.content,
        outline: '',
        worldNotes: '',
        characterNotes: '',
        draft: '',
        editedContent: chapter.content,
        readerFeedback: '',
        agentOutputs: [],
      },
    );

    await vi.waitFor(() => {
      expect(novelManager.saveChapter).toHaveBeenCalledWith('novel-memory-no-thread', expect.objectContaining({
        diagnostics: expect.objectContaining({
          memoryPersistenceAudit: expect.objectContaining({
            chapterNumber: 5,
            threadIndexed: false,
            threadIndexStatus: 'no-snapshots',
            threadSnapshotCount: 0,
          }),
        }),
      }));
    });
    expect(novelMemory.indexPlotThreadSnapshots).not.toHaveBeenCalled();
  });

  it('records digest persistence when chapter digest is generated and indexed', async () => {
    const { schedulePostSaveBackgroundTasks } = await import('./generation-background-tasks.js');
    const chapter = {
      novelId: 'novel-memory-2',
      chapterNumber: 4,
      title: '原题',
      content: '林栀把星星吊饰放回顾砚掌心。',
      summary: '',
      wordCount: 16,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const novelManager = {
      syncNovelMetadataByChapters: vi.fn().mockResolvedValue(undefined),
      getNovel: vi.fn().mockResolvedValue({
        id: 'novel-memory-2',
        title: '测试小说',
        synopsis: '测试简介',
        genre: 'romance',
        tags: [],
      }),
      getChapter: vi.fn().mockResolvedValue(chapter),
      saveChapter: vi.fn().mockResolvedValue(undefined),
      getOutline: vi.fn().mockResolvedValue({ chapters: [{ chapterNumber: 4 }], plotThreads: [], foreshadowing: [] }),
      saveOutline: vi.fn().mockResolvedValue(undefined),
      getCharacters: vi.fn().mockResolvedValue([{ name: '林栀' }, { name: '顾砚' }]),
      getFactGraph: vi.fn().mockResolvedValue({ facts: [] }),
      getPlotThreadSnapshots: vi.fn().mockResolvedValue([]),
    };
    const novelMemory = {
      indexChapter: vi.fn().mockResolvedValue(undefined),
      indexFactChapter: vi.fn().mockResolvedValue(undefined),
      indexPlotThreadSnapshots: vi.fn().mockResolvedValue(undefined),
      indexChapterDigest: vi.fn().mockResolvedValue(undefined),
    };
    const agents = new Map([
      ['chapter-digest', {
        execute: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            plotSummary: '林栀把星星吊饰放回顾砚掌心，两人的误会开始松动。',
            keyEvents: ['林栀归还星星吊饰'],
            characterStateChanges: [{ name: '林栀', change: '主动归还旧物' }],
            worldStateChanges: [],
            unresolvedThreads: ['顾砚是否承认心动'],
            causalLinks: [{ event: '归还吊饰', effect: '关系缓和' }],
          }),
        }),
      }],
    ]);

    schedulePostSaveBackgroundTasks(
      novelManager as any,
      novelMemory as any,
      'novel-memory-2',
      4,
      {
        chapterContent: chapter.content,
        outline: '',
        worldNotes: '',
        characterNotes: '',
        draft: '',
        editedContent: chapter.content,
        readerFeedback: '',
        agentOutputs: [],
      },
      agents as any,
      { provider: 'test', model: 'test' } as any,
    );

    await vi.waitFor(() => {
      expect(novelMemory.indexChapterDigest).toHaveBeenCalled();
    });
    expect(novelManager.saveChapter).toHaveBeenCalledWith('novel-memory-2', expect.objectContaining({
      diagnostics: expect.objectContaining({
        memoryPersistenceAudit: expect.objectContaining({
          digestIndexed: true,
        }),
      }),
    }));
  });

  it('records digest parse diagnostics when chapter digest output cannot be parsed', async () => {
    const { schedulePostSaveBackgroundTasks } = await import('./generation-background-tasks.js');
    const chapter = {
      novelId: 'novel-memory-bad-digest',
      chapterNumber: 6,
      title: '原题',
      content: '林栀看着卧室门缝，没有关灯。',
      summary: '',
      wordCount: 16,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const rawDigestOutput = '摘要如下：没有任何 JSON 对象，只有说明文字。'.repeat(30);
    const novelManager = {
      syncNovelMetadataByChapters: vi.fn().mockResolvedValue(undefined),
      getNovel: vi.fn().mockResolvedValue({
        id: 'novel-memory-bad-digest',
        title: '测试小说',
        synopsis: '测试简介',
        genre: 'romance',
        tags: [],
      }),
      getChapter: vi.fn().mockResolvedValue(chapter),
      saveChapter: vi.fn().mockResolvedValue(undefined),
      getOutline: vi.fn().mockResolvedValue({ chapters: [], plotThreads: [], foreshadowing: [] }),
      getFactGraph: vi.fn().mockResolvedValue({ facts: [] }),
      getPlotThreadSnapshots: vi.fn().mockResolvedValue([]),
    };
    const novelMemory = {
      indexChapter: vi.fn().mockResolvedValue(undefined),
      indexFactChapter: vi.fn().mockResolvedValue(undefined),
      indexPlotThreadSnapshots: vi.fn().mockResolvedValue(undefined),
      indexChapterDigest: vi.fn().mockResolvedValue(undefined),
    };
    const agents = new Map([
      ['chapter-digest', {
        execute: vi.fn().mockResolvedValue({
          content: rawDigestOutput,
        }),
      }],
    ]);

    schedulePostSaveBackgroundTasks(
      novelManager as any,
      novelMemory as any,
      'novel-memory-bad-digest',
      6,
      {
        chapterContent: chapter.content,
        outline: '',
        worldNotes: '',
        characterNotes: '',
        draft: '',
        editedContent: chapter.content,
        readerFeedback: '',
        agentOutputs: [],
      },
      agents as any,
      { provider: 'test', model: 'test' } as any,
    );

    await vi.waitFor(() => {
      expect(novelManager.saveChapter).toHaveBeenCalledWith('novel-memory-bad-digest', expect.objectContaining({
        diagnostics: expect.objectContaining({
          memoryPersistenceAudit: expect.objectContaining({
            digestIndexed: false,
            digestFailureStage: 'parse',
            digestOutputChars: Array.from(rawDigestOutput).length,
            digestOutputHead: expect.stringContaining('摘要如下'),
            digestOutputTail: expect.stringContaining('说明文字'),
            warnings: expect.arrayContaining(['chapter digest parse failed']),
          }),
        }),
      }));
    });
    expect(novelMemory.indexChapterDigest).not.toHaveBeenCalled();
  });

  it('records stale truth file health when story-state parsing fails', async () => {
    const { schedulePostSaveBackgroundTasks } = await import('./generation-background-tasks.js');
    mocks.verifyTruthFilesHealth.mockResolvedValueOnce({
      mode: 'observe',
      chapterNumber: 8,
      hasCurrentState: true,
      hasPendingHooks: true,
      hasCharacterMatrix: true,
      currentStateChapter: 7,
      pendingHooksChapter: 7,
      aligned: false,
      warnings: [
        'current-state chapter mismatch: expected 8, got 7',
        'pending-hooks chapter mismatch: expected 8, got 7',
      ],
      checkedAt: new Date().toISOString(),
    });
    const chapter = {
      novelId: 'novel-3',
      chapterNumber: 8,
      title: '原题',
      content: '散热风扇又抖了一下。',
      summary: '',
      wordCount: 10,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const novelManager = {
      syncNovelMetadataByChapters: vi.fn().mockResolvedValue(undefined),
      getNovel: vi.fn().mockResolvedValue({
        id: 'novel-3',
        title: '测试小说',
        synopsis: '测试简介',
        genre: 'sci-fi',
        tags: [],
      }),
      getChapter: vi.fn().mockResolvedValue(chapter),
      saveChapter: vi.fn().mockResolvedValue(undefined),
      getOutline: vi.fn().mockResolvedValue({ chapters: [], plotThreads: [], foreshadowing: [] }),
      getCharacters: vi.fn().mockResolvedValue([]),
      getFactGraph: vi.fn().mockResolvedValue({}),
      getPlotThreadSnapshots: vi.fn().mockResolvedValue([]),
    };
    const storyStateManager = {
      getLatestSnapshot: vi.fn().mockResolvedValue(null),
      buildTrackerInput: vi.fn().mockReturnValue('tracker input'),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      compressIfNeeded: vi.fn().mockResolvedValue(undefined),
    };
    const agents = new Map([
      ['story-state-tracker', {
        execute: vi.fn().mockResolvedValue({
          content: 'not json',
        }),
      }],
    ]);

    schedulePostSaveBackgroundTasks(
      novelManager as any,
      undefined,
      'novel-3',
      8,
      {
        chapterContent: chapter.content,
        outline: '',
        worldNotes: '',
        characterNotes: '',
        draft: '',
        editedContent: chapter.content,
        readerFeedback: '',
        agentOutputs: [],
      },
      agents as any,
      { provider: 'test', model: 'test' } as any,
      storyStateManager as any,
    );

    await vi.waitFor(() => {
      expect(mocks.verifyTruthFilesHealth).toHaveBeenCalledWith(
        'novel-3',
        expect.any(String),
        8,
      );
    });

    expect(mocks.updateTruthFiles).not.toHaveBeenCalled();
    expect(novelManager.saveChapter).toHaveBeenCalledWith('novel-3', expect.objectContaining({
      diagnostics: expect.objectContaining({
        storyStateTracker: expect.objectContaining({
          parsed: false,
          failureReason: 'parse returned null',
          outputChars: expect.any(Number),
        }),
      }),
    }));
    expect(novelManager.saveChapter).toHaveBeenCalledWith('novel-3', expect.objectContaining({
      diagnostics: expect.objectContaining({
        truthFileHealth: expect.objectContaining({
          aligned: false,
          currentStateChapter: 7,
          pendingHooksChapter: 7,
          warnings: expect.arrayContaining([
            'story-state snapshot parse failed',
          ]),
        }),
      }),
    }));
  });

  it('records stale truth file health when truth-file update fails after a valid story-state snapshot', async () => {
    const { schedulePostSaveBackgroundTasks } = await import('./generation-background-tasks.js');
    mocks.updateTruthFiles.mockRejectedValueOnce(new Error('disk write failed'));
    mocks.verifyTruthFilesHealth.mockResolvedValueOnce({
      mode: 'observe',
      chapterNumber: 6,
      hasCurrentState: true,
      hasPendingHooks: true,
      hasCharacterMatrix: true,
      currentStateChapter: 5,
      pendingHooksChapter: 5,
      aligned: false,
      warnings: [
        'current-state chapter mismatch: expected 6, got 5',
        'pending-hooks chapter mismatch: expected 6, got 5',
      ],
      checkedAt: new Date().toISOString(),
    });
    const chapter = {
      novelId: 'novel-4',
      chapterNumber: 6,
      title: '原题',
      content: '她把星星吊饰放回掌心。',
      summary: '',
      wordCount: 13,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const snapshot = {
      chapterNumber: 6,
      characters: [],
      world: {
        timelineMarker: '',
        environment: '',
        factionChanges: [],
        geographyChanges: [],
        powerSystemChanges: [],
        socialChanges: [],
      },
      factions: [],
      plot: {
        activeThreads: [],
        pendingForeshadowing: [],
        tensionLevel: 5,
        readerQuestions: [],
      },
      causalChains: [],
      chapterSummary: '吊饰误会推进。',
      nextChapterConstraints: [],
    };
    const novelManager = {
      syncNovelMetadataByChapters: vi.fn().mockResolvedValue(undefined),
      getNovel: vi.fn().mockResolvedValue({
        id: 'novel-4',
        title: '测试小说',
        synopsis: '测试简介',
        genre: 'romance',
        tags: [],
      }),
      getChapter: vi.fn().mockResolvedValue(chapter),
      saveChapter: vi.fn().mockResolvedValue(undefined),
      getOutline: vi.fn().mockResolvedValue({ chapters: [], plotThreads: [], foreshadowing: [] }),
      getCharacters: vi.fn().mockResolvedValue([]),
      getFactGraph: vi.fn().mockResolvedValue({}),
      getPlotThreadSnapshots: vi.fn().mockResolvedValue([]),
    };
    const storyStateManager = {
      getLatestSnapshot: vi.fn().mockResolvedValue(null),
      buildTrackerInput: vi.fn().mockReturnValue('tracker input'),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      compressIfNeeded: vi.fn().mockResolvedValue(undefined),
    };
    const agents = new Map([
      ['story-state-tracker', {
        execute: vi.fn().mockResolvedValue({
          content: `---STATE_SNAPSHOT---\n${JSON.stringify(snapshot)}`,
        }),
      }],
    ]);

    schedulePostSaveBackgroundTasks(
      novelManager as any,
      undefined,
      'novel-4',
      6,
      {
        chapterContent: chapter.content,
        outline: '',
        worldNotes: '',
        characterNotes: '',
        draft: '',
        editedContent: chapter.content,
        readerFeedback: '',
        agentOutputs: [],
      },
      agents as any,
      { provider: 'test', model: 'test' } as any,
      storyStateManager as any,
    );

    await vi.waitFor(() => {
      expect(mocks.verifyTruthFilesHealth).toHaveBeenCalledWith(
        'novel-4',
        expect.any(String),
        6,
      );
    });

    expect(storyStateManager.saveSnapshot).toHaveBeenCalled();
    expect(novelManager.saveChapter).toHaveBeenCalledWith('novel-4', expect.objectContaining({
      diagnostics: expect.objectContaining({
        truthFileHealth: expect.objectContaining({
          aligned: false,
          currentStateChapter: 5,
          pendingHooksChapter: 5,
          warnings: expect.arrayContaining([
            'truth files update after story-state failed',
          ]),
        }),
      }),
    }));
  });
});
