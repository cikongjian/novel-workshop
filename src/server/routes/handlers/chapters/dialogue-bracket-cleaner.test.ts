import { describe, expect, it } from 'vitest';

import {
  buildDialogueBracketCleanupSummary,
  cleanDialogueBracketTags,
} from './dialogue-bracket-cleaner.js';

describe('dialogue bracket cleaner facade', () => {
  it('cleans bracketed prefix and suffix tags through facade exports', () => {
    const input = '（低声）“别出声。”（咬牙）';
    const result = cleanDialogueBracketTags(input, undefined, false, 'rewrite');

    expect(result.replacements).toBe(2);
    expect(result.content).toContain('低声道：“别出声。”');
    expect(result.content).toContain('”，咬牙道。');
  });

  it('builds cleanup summary through facade exports', () => {
    expect(buildDialogueBracketCleanupSummary({
      applied: false,
      totalScanned: 3,
      affected: 1,
      replacements: 2,
      mode: 'rewrite',
    })).toBe('预览发现可改写 1 章，共处理 2 处括号动作标签。');
  });
});
