import { describe, expect, it } from 'vitest';
import { estimateChapterOutputMaxTokens } from './chapter-output-budget.js';

describe('estimateChapterOutputMaxTokens', () => {
  it('gives writer and editor enough headroom for a 3000-char chapter target', () => {
    expect(estimateChapterOutputMaxTokens({ targetChars: 3000, stage: 'writer' })).toBeGreaterThan(5000);
    expect(estimateChapterOutputMaxTokens({ targetChars: 3000, stage: 'editor' })).toBeGreaterThan(5000);
  });

  it('keeps compress budgets lower than fresh-writing budgets', () => {
    const writer = estimateChapterOutputMaxTokens({ targetChars: 3000, stage: 'writer' });
    const compress = estimateChapterOutputMaxTokens({ targetChars: 3000, stage: 'resizer-compress' });
    expect(compress).toBeLessThan(writer);
    expect(compress).toBeGreaterThanOrEqual(1800);
  });

  it('respects the hard cap for very long targets', () => {
    expect(estimateChapterOutputMaxTokens({ targetChars: 12000, stage: 'writer' })).toBe(8192);
    expect(estimateChapterOutputMaxTokens({ targetChars: 12000, stage: 'editor' })).toBe(8192);
  });

  it('falls back to the hard cap when no target is provided', () => {
    expect(estimateChapterOutputMaxTokens({ stage: 'writer' })).toBe(8192);
    expect(estimateChapterOutputMaxTokens({ stage: 'editor', hardCap: 4096 })).toBe(4096);
  });
});
