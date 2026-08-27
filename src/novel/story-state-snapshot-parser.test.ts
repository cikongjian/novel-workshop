import { describe, expect, it } from 'vitest';
import {
  buildStoryStateTrackerDiagnostic,
  extractStoryStateSnapshotJson,
  parseStoryStateSnapshotCandidate,
} from './story-state-snapshot-parser.js';

describe('story-state-snapshot-parser', () => {
  it('extracts fenced JSON after the state separator', () => {
    const raw = [
      'brief analysis',
      '---STATE_SNAPSHOT---',
      '```json',
      '{"chapterNumber":7,"characters":[]}',
      '```',
      'extra note',
    ].join('\n');

    expect(extractStoryStateSnapshotJson(raw)).toBe('{"chapterNumber":7,"characters":[]}');
    expect(parseStoryStateSnapshotCandidate<{ chapterNumber: number }>(raw)?.chapterNumber).toBe(7);
  });

  it('extracts the first balanced JSON object before trailing prose', () => {
    const raw = [
      '---STATE_SNAPSHOT---',
      '{"chapterNumber":8,"chapterSummary":"done","characters":[]}',
      'This extra sentence should not break parsing.',
    ].join('\n');

    expect(parseStoryStateSnapshotCandidate<{ chapterNumber: number }>(raw)?.chapterNumber).toBe(8);
  });

  it('falls back to repaired truncated JSON when no balanced object exists', () => {
    const raw = [
      '---STATE_SNAPSHOT---',
      '{"chapterNumber":9,"characters":[]',
    ].join('\n');

    expect(parseStoryStateSnapshotCandidate<{ chapterNumber: number }>(raw)?.chapterNumber).toBe(9);
  });

  it('repairs smart-quoted array strings from tracker output', () => {
    const raw = [
      'analysis',
      '---STATE_SNAPSHOT---',
      '{',
      '  "chapterNumber": 12,',
      '  "chapterSummary": "done",',
      '  "nextChapterConstraints": [',
      '    “林栀和顾砚舟同在公寓内，下一章必须紧接次日推拿场景“，',
      '    ”刻Z星星吊饰在茶几上没有收起”',
      '  ]',
      '}',
    ].join('\n');

    const parsed = parseStoryStateSnapshotCandidate<{
      chapterNumber: number;
      nextChapterConstraints: string[];
    }>(raw);

    expect(parsed?.chapterNumber).toBe(12);
    expect(parsed?.nextChapterConstraints).toHaveLength(2);
    expect(parsed?.nextChapterConstraints[0]).toContain('推拿场景');
  });

  it('builds compact diagnostics for failed tracker output', () => {
    const raw = [
      '分析：本章关系推进。',
      '---STATE_SNAPSHOT---',
      '{"chapterNumber":10,"characters":[}',
    ].join('\n');

    const diagnostic = buildStoryStateTrackerDiagnostic({
      rawContent: raw,
      chapterNumber: 10,
      parsed: false,
      failureReason: 'parse returned null',
    });

    expect(diagnostic.parsed).toBe(false);
    expect(diagnostic.hasSeparator).toBe(true);
    expect(diagnostic.firstObjectOffset).toBeGreaterThan(0);
    expect(diagnostic.extractedJsonChars).toBeGreaterThan(0);
    expect(diagnostic.headExcerpt).toContain('STATE_SNAPSHOT');
  });
});
