import { describe, expect, it } from 'vitest';
import { sanitizeContrastPhrasing } from './localized-anti-ai-rewriter.js';

describe('sanitizeContrastPhrasing', () => {
  it('keeps action outcomes natural when reducing contrast phrasing', () => {
    const result = sanitizeContrastPhrasing('人影动了一下——不是站起来，是换了换右手按珠子的位置。');

    expect(result.rewrittenText).toContain('换了换右手按珠子的位置');
    expect(result.rewrittenText).not.toContain('这是换了换右手按珠子的位置');
  });

  it('keeps concrete noun outcomes natural', () => {
    const result = sanitizeContrastPhrasing('粉末不是药粉，是石灰粉。');

    expect(result.rewrittenText).toContain('粉末是石灰粉。');
    expect(result.rewrittenText).not.toContain('粉末这是石灰粉');
  });
});
