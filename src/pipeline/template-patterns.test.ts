import { describe, expect, it } from 'vitest';
import { countTemplatePatternHits } from './template-patterns.js';

describe('AI meta template patterns', () => {
  it('detects chapter-number references in public prose', () => {
    const hits = countTemplatePatternHits('他把第9章拆下的垫片放到桌上。', ['ai-meta']);
    expect(hits.some(hit => hit.label.includes('第N章'))).toBe(true);
  });

  it('does not flag an in-world library announcement to readers', () => {
    const hits = countTemplatePatternHits(
      '广播响起：“各位读者请注意，本图书馆将在十五分钟后闭馆。”',
      ['ai-meta'],
    );
    expect(hits).toEqual([]);
  });
});
