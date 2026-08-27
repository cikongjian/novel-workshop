import { describe, expect, it } from 'vitest';
import { Chapter } from './types.js';

describe('chapter diagnostics schema', () => {
  it('keeps truth file section diagnostics in memory context audit sources', () => {
    const parsed = Chapter.parse({
      novelId: '724df82c-246f-4bb6-928b-002f2fc90931',
      chapterNumber: 1,
      title: '第1章',
      content: '正文',
      wordCount: 2,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {
        memoryContextAudit: {
          mode: 'observe',
          retriever: 'orchestrator',
          totalChars: 12,
          promptChars: 12,
          reusableAnchorCount: 3,
          reusableAnchorDensity: 250,
          unusedPersistedSources: [],
          emptyPromptSources: [],
          warnings: [],
          sources: [
            {
              source: 'truthFiles',
              chars: 12,
              present: true,
              usedInPrompt: true,
              reusableAnchorCount: 3,
              reusableAnchorKinds: ['character', 'thread'],
              sections: ['currentState', 'pendingHooks', 'characterMatrix'],
            },
          ],
        },
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
      authorNotes: [],
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });

    expect(parsed.diagnostics?.memoryContextAudit?.sources[0]?.sections).toEqual([
      'currentState',
      'pendingHooks',
      'characterMatrix',
    ]);
    expect(parsed.diagnostics?.memoryContextAudit?.reusableAnchorCount).toBe(3);
    expect(parsed.diagnostics?.memoryContextAudit?.sources[0]?.reusableAnchorKinds).toEqual([
      'character',
      'thread',
    ]);
  });

  it('keeps generation lifecycle diagnostics', () => {
    const parsed = Chapter.parse({
      novelId: '724df82c-246f-4bb6-928b-002f2fc90931',
      chapterNumber: 2,
      title: '第2章',
      content: '正文',
      wordCount: 2,
      status: 'edited',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {
        generationLifecycle: {
          mode: 'observe',
          phase: 'draft',
          saveFirstMode: true,
          chapterStatus: 'edited',
          warnings: ['save-first draft persisted; final generation result is not saved yet'],
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
      authorNotes: [],
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });

    expect(parsed.diagnostics?.generationLifecycle).toEqual(expect.objectContaining({
      phase: 'draft',
      saveFirstMode: true,
      chapterStatus: 'edited',
    }));
  });

  it('keeps user direction anchor diagnostics', () => {
    const parsed = Chapter.parse({
      novelId: '724df82c-246f-4bb6-928b-002f2fc90931',
      chapterNumber: 3,
      title: '第3章',
      content: '正文',
      wordCount: 2,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {
        userDirectionAnchorAudit: {
          mode: 'observe',
          anchors: ['公开会议', '验收清单'],
          presentAnchors: ['公开会议'],
          missingAnchors: ['验收清单'],
          coverage: 0.5,
          shouldRepair: true,
          directionChars: 42,
          contentChars: 1200,
          sourceHash: '1234abcd:5678ef90',
          directionPreview: '公开会议推进验收清单',
          stage: 'final',
          warnings: ['user direction anchors missing from final chapter'],
          checkedAt: '2026-07-02T00:00:00.000Z',
        },
        updatedAt: '2026-07-02T00:00:00.000Z',
      },
      authorNotes: [],
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });

    expect(parsed.diagnostics?.userDirectionAnchorAudit).toEqual(expect.objectContaining({
      coverage: 0.5,
      shouldRepair: true,
      missingAnchors: ['验收清单'],
      directionChars: 42,
      contentChars: 1200,
      sourceHash: '1234abcd:5678ef90',
      directionPreview: '公开会议推进验收清单',
      stage: 'final',
    }));
  });

  it('keeps post-save memory persistence diagnostics', () => {
    const parsed = Chapter.parse({
      novelId: '724df82c-246f-4bb6-928b-002f2fc90931',
      chapterNumber: 3,
      title: '第3章',
      content: '正文',
      wordCount: 2,
      status: 'reviewed',
      agentComments: [],
      revisionCount: 0,
      diagnostics: {
        memoryPersistenceAudit: {
          mode: 'observe',
          chapterNumber: 3,
          chapterIndexed: true,
          digestIndexed: true,
          factIndexed: true,
          threadIndexed: true,
          threadIndexStatus: 'indexed',
          threadSnapshotCount: 2,
          truthFilesAligned: true,
          digestFailureStage: 'parse',
          digestOutputChars: 120,
          digestOutputHead: '{"summary":',
          digestOutputTail: 'not json',
          warnings: [],
          updatedAt: '2026-07-03T00:00:00.000Z',
        },
        updatedAt: '2026-07-03T00:00:00.000Z',
      },
      authorNotes: [],
      createdAt: '2026-07-03T00:00:00.000Z',
      updatedAt: '2026-07-03T00:00:00.000Z',
    });

    expect(parsed.diagnostics?.memoryPersistenceAudit).toEqual(expect.objectContaining({
      chapterIndexed: true,
      digestIndexed: true,
      factIndexed: true,
      threadIndexed: true,
      threadIndexStatus: 'indexed',
      truthFilesAligned: true,
      digestFailureStage: 'parse',
      digestOutputChars: 120,
    }));
  });
});
