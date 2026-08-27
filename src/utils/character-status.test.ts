import { describe, expect, it } from 'vitest';
import { sanitizeSuspiciousExitMarkers } from './character-status.js';

describe('sanitizeSuspiciousExitMarkers', () => {
  it('removes stray exit markers when the character only leaves the current scene', () => {
    const result = sanitizeSuspiciousExitMarkers('王维转身走出休息室，脚步很快。(#退场:王维)');

    expect(result.sanitizedText).not.toContain('(#退场:王维)');
    expect(result.removedMarkers).toEqual([{ name: '王维', status: 'exited' }]);
  });

  it('removes the inverted hash-parenthesis marker emitted by some models', () => {
    const result = sanitizeSuspiciousExitMarkers('雾瘴卷过来，把周元吞没。#(退场:周元)');

    expect(result.sanitizedText).toBe('雾瘴卷过来，把周元吞没。');
    expect(result.removedMarkers).toEqual([{ name: '周元', status: 'exited' }]);
  });

  it('keeps valid exit markers when the paragraph states permanent departure', () => {
    const result = sanitizeSuspiciousExitMarkers('李四头也不回地离开了京城，从此再无音讯。(#退场:李四)');

    expect(result.sanitizedText).toContain('(#退场:李四)');
    expect(result.removedMarkers).toHaveLength(0);
  });
});
