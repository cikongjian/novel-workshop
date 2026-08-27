import { describe, expect, it } from 'vitest';
import { sanitizeTextField } from './sanitize-input.js';

describe('sanitizeTextField', () => {
  it('removes nested and malformed HTML tags', () => {
    expect(sanitizeTextField('safe <b>bold <i>nested</i></b> text')).toBe('safe bold nested text');
    expect(sanitizeTextField('<scr<script>ipt>alert(1)</scr</script>ipt>')).not.toContain('<');
  });

  it('removes tags revealed by entity decoding', () => {
    expect(sanitizeTextField('&lt;script&gt;alert(1)&lt;/script&gt; visible')).toBe('alert(1) visible');
    expect(sanitizeTextField('&amp;lt;b&amp;gt;deep&amp;lt;/b&amp;gt;')).toBe('deep');
  });

  it('removes invisible direction and zero-width characters', () => {
    expect(sanitizeTextField('ab\u200Bcd\u202Eef')).toBe('abcdef');
  });
});
