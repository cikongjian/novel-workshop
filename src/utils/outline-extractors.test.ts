import { describe, expect, it } from 'vitest';
import { extractChapterTitle } from './outline-extractors.js';

describe('extractChapterTitle', () => {
  it('sanitizes decorative title wrappers from outline headings', () => {
    expect(extractChapterTitle('# 第6章：《策反与反噬》')).toBe('策反与反噬');
    expect(extractChapterTitle('# 第7章：：青石谷的第一场雨')).toBe('青石谷的第一场雨');
  });

  it('does not persist outline labels as chapter titles', () => {
    expect(extractChapterTitle('# 第2章 章节大纲「一斤面粉和几根葱」')).toBe('一斤面粉和几根葱');
  });

  it('does not use summary-like chapter themes as saved titles', () => {
    expect(extractChapterTitle([
      '# 第6章章节大纲',
      '',
      '## 章节主题',
      '**加桌卖三十碗：钱不够时，用碗数和口味凑**',
      '',
      '## 场景列表',
    ].join('\n'))).toBe('');
  });

  it('allows concrete chapter themes when no explicit title exists', () => {
    expect(extractChapterTitle([
      '# 第6章章节大纲',
      '',
      '## 章节主题',
      '**小碗一文**',
    ].join('\n'))).toBe('小碗一文');
  });
});
