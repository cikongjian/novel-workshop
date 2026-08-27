import { describe, expect, it } from 'vitest';
import { buildMemorySourceReadiness } from './novel-memory.js';

describe('buildMemorySourceReadiness', () => {
  it('does not treat absent structural source domains as complete', () => {
    const readiness = buildMemorySourceReadiness({
      worldCount: 0,
      characterCount: 0,
      chapterCount: 10,
      factChapterCount: 8,
      threadSnapshotCount: 0,
      characterStateCount: 0,
    });

    expect(readiness.sourceDomainsReady).toBe(false);
    expect(readiness.warnings).toEqual(expect.arrayContaining([
      'world source data is empty',
      'character source data is empty',
      'character state source data is empty',
      'plot thread source data is empty',
      'chapter fact source coverage is incomplete: 8/10',
      'plot thread source coverage is incomplete: 0/10',
    ]));
  });

  it('rejects partial fact and plot-thread coverage even when both domains are non-empty', () => {
    const readiness = buildMemorySourceReadiness({
      worldCount: 8,
      characterCount: 2,
      chapterCount: 10,
      factChapterCount: 9,
      threadSnapshotCount: 9,
      characterStateCount: 10,
    });

    expect(readiness.sourceDomainsReady).toBe(false);
    expect(readiness.warnings).toEqual([
      'chapter fact source coverage is incomplete: 9/10',
      'plot thread source coverage is incomplete: 9/10',
    ]);
  });

  it('allows an empty new novel before chapters exist', () => {
    expect(buildMemorySourceReadiness({
      worldCount: 0,
      characterCount: 0,
      chapterCount: 0,
      factChapterCount: 0,
      threadSnapshotCount: 0,
      characterStateCount: 0,
    }).sourceDomainsReady).toBe(true);
  });
});
