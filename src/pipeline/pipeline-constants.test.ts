import { describe, expect, it } from 'vitest';
import { resolveChapterLengthGuardSkip } from './pipeline-constants.js';

describe('resolveChapterLengthGuardSkip', () => {
  it('enables the guard when the environment setting is absent', () => {
    expect(resolveChapterLengthGuardSkip(undefined, undefined)).toBe(false);
  });

  it('respects explicit environment and request overrides', () => {
    expect(resolveChapterLengthGuardSkip(undefined, 'false')).toBe(true);
    expect(resolveChapterLengthGuardSkip(undefined, 'true')).toBe(false);
    expect(resolveChapterLengthGuardSkip(true, 'true')).toBe(true);
    expect(resolveChapterLengthGuardSkip(false, 'false')).toBe(false);
  });
});
