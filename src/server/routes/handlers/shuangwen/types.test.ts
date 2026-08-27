import { describe, expect, it } from 'vitest';
import { DEFAULT_CHAPTER_WORD_TARGET } from '../../../../pipeline/chapter-length-guard.js';
import { CommonBody, GenerateChapterBody } from './types.js';

describe('shuangwen request defaults', () => {
  it('uses the standard chapter target for creation and chapter generation', () => {
    expect(CommonBody.parse({}).maxWordCount).toBe(DEFAULT_CHAPTER_WORD_TARGET);
    expect(GenerateChapterBody.parse({
      novelId: '00000000-0000-4000-8000-000000000001',
      chapterNumber: 1,
    }).maxWordCount).toBe(DEFAULT_CHAPTER_WORD_TARGET);
  });
});
