import { describe, expect, it } from 'vitest';
import type { Chapter } from '../novel/types.js';
import {
  buildMemoryPersistenceForwardHints,
  evaluateMemoryPersistenceForwardRisk,
} from './memory-persistence-forward-hints.js';

function makeChapter(
  memoryPersistenceAudit: NonNullable<Chapter['diagnostics']>['memoryPersistenceAudit'],
): Chapter {
  return {
    novelId: '00000000-0000-4000-8000-000000000001',
    chapterNumber: 16,
    title: 'previous',
    content: 'chapter content',
    wordCount: 15,
    status: 'reviewed',
    agentComments: [],
    readerScore: 7.8,
    revisionCount: 0,
    summary: '',
    diagnostics: {
      memoryPersistenceAudit,
      updatedAt: '2026-07-03T00:00:00.000Z',
    },
    createdAt: '2026-07-03T00:00:00.000Z',
    updatedAt: '2026-07-03T00:00:00.000Z',
  };
}

describe('buildMemoryPersistenceForwardHints', () => {
  it('returns empty hints when persistence audit is healthy', () => {
    const hints = buildMemoryPersistenceForwardHints(makeChapter({
      mode: 'observe',
      chapterNumber: 16,
      chapterIndexed: true,
      digestIndexed: true,
      factIndexed: true,
      threadIndexed: true,
      threadIndexStatus: 'no-snapshots',
      threadSnapshotCount: 0,
      truthFilesAligned: true,
      warnings: [],
      updatedAt: '2026-07-03T00:00:00.000Z',
    }));

    expect(hints).toBe('');
  });

  it('builds forward hints for failed digest and truth file alignment', () => {
    const hints = buildMemoryPersistenceForwardHints(makeChapter({
      mode: 'observe',
      chapterNumber: 16,
      chapterIndexed: true,
      digestIndexed: false,
      factIndexed: true,
      threadIndexed: true,
      threadIndexStatus: 'indexed',
      threadSnapshotCount: 2,
      truthFilesAligned: false,
      digestFailureStage: 'parse',
      warnings: ['chapter digest parse failed'],
      updatedAt: '2026-07-03T00:00:00.000Z',
    }));

    expect(hints).toContain('上一章记忆落库审计提示');
    expect(hints).toContain('章节摘要未成功入库');
    expect(hints).toContain('parse');
    expect(hints).toContain('真相文件健康检查未对齐');
    expect(hints).toContain('chapter digest parse failed');
    expect(hints).toContain('读者交付优先');
  });

  it('does not treat no-snapshots as a thread indexing failure', () => {
    const hints = buildMemoryPersistenceForwardHints(makeChapter({
      mode: 'observe',
      chapterNumber: 16,
      chapterIndexed: true,
      digestIndexed: true,
      factIndexed: true,
      threadIndexed: true,
      threadIndexStatus: 'no-snapshots',
      threadSnapshotCount: 0,
      truthFilesAligned: true,
      warnings: [],
      updatedAt: '2026-07-03T00:00:00.000Z',
    }));

    expect(hints).not.toContain('伏笔/线程快照索引失败');
  });

  it('builds forward hints when vector or thread indexing failed', () => {
    const hints = buildMemoryPersistenceForwardHints(makeChapter({
      mode: 'observe',
      chapterNumber: 16,
      chapterIndexed: false,
      digestIndexed: true,
      factIndexed: false,
      threadIndexed: false,
      threadIndexStatus: 'failed',
      truthFilesAligned: true,
      warnings: [],
      updatedAt: '2026-07-03T00:00:00.000Z',
    }));

    expect(hints).toContain('章节正文向量未成功入库');
    expect(hints).toContain('事实图索引未成功入库');
    expect(hints).toContain('伏笔/线程快照索引失败');
  });
});

describe('evaluateMemoryPersistenceForwardRisk', () => {
  it('returns no risk when persistence audit is healthy', () => {
    const risk = evaluateMemoryPersistenceForwardRisk(makeChapter({
      mode: 'observe',
      chapterNumber: 16,
      chapterIndexed: true,
      digestIndexed: true,
      factIndexed: true,
      threadIndexed: true,
      threadIndexStatus: 'indexed',
      threadSnapshotCount: 1,
      truthFilesAligned: true,
      warnings: [],
      updatedAt: '2026-07-03T00:00:00.000Z',
    }));

    expect(risk).toEqual({
      severity: 'none',
      codes: [],
      shouldPromoteToUserDirection: false,
    });
  });

  it('promotes critical persistence risks to user direction', () => {
    const risk = evaluateMemoryPersistenceForwardRisk(makeChapter({
      mode: 'observe',
      chapterNumber: 16,
      chapterIndexed: false,
      digestIndexed: false,
      factIndexed: true,
      threadIndexed: true,
      threadIndexStatus: 'indexed',
      threadSnapshotCount: 1,
      truthFilesAligned: false,
      warnings: ['chapter vector indexing failed'],
      updatedAt: '2026-07-03T00:00:00.000Z',
    }));

    expect(risk.severity).toBe('critical');
    expect(risk.shouldPromoteToUserDirection).toBe(true);
    expect(risk.codes).toEqual(expect.arrayContaining([
      'chapter-vector-missing',
      'chapter-digest-and-summary-missing',
      'truth-files-misaligned',
    ]));
  });

  it('keeps isolated secondary index failures as advice-only warnings', () => {
    const risk = evaluateMemoryPersistenceForwardRisk(makeChapter({
      mode: 'observe',
      chapterNumber: 16,
      chapterIndexed: true,
      digestIndexed: true,
      factIndexed: false,
      threadIndexed: false,
      threadIndexStatus: 'failed',
      truthFilesAligned: true,
      warnings: [],
      updatedAt: '2026-07-03T00:00:00.000Z',
    }));

    expect(risk).toEqual({
      severity: 'warning',
      codes: ['fact-index-missing', 'thread-index-missing'],
      shouldPromoteToUserDirection: false,
    });
  });

  it('does not promote digest index failure when chapter summary is still available', () => {
    const chapter = makeChapter({
      mode: 'observe',
      chapterNumber: 16,
      chapterIndexed: true,
      digestIndexed: false,
      factIndexed: true,
      threadIndexed: true,
      threadIndexStatus: 'indexed',
      threadSnapshotCount: 1,
      truthFilesAligned: true,
      warnings: ['chapter digest parse failed'],
      updatedAt: '2026-07-03T00:00:00.000Z',
    });
    chapter.summary = 'usable previous chapter summary';

    const risk = evaluateMemoryPersistenceForwardRisk(chapter);

    expect(risk).toEqual({
      severity: 'warning',
      codes: ['chapter-digest-index-missing', 'memory-persistence-warnings'],
      shouldPromoteToUserDirection: false,
    });
  });
});
