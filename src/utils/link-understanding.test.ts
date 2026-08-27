import { describe, expect, it } from 'vitest';
import { extractTextFromHtml } from './link-understanding.js';

describe('extractTextFromHtml', () => {
  it('extracts decoded text from the main content', () => {
    const result = extractTextFromHtml(`
      <html><head><title>Example &amp; Test</title></head><body>
        <nav>navigation</nav>
        <main><h1>Heading</h1><p>A &lt; B &amp; C</p></main>
        <footer>footer</footer>
      </body></html>
    `);

    expect(result).toEqual({ title: 'Example & Test', text: 'HeadingA < B & C' });
  });

  it('drops executable and non-content elements even when nested', () => {
    const result = extractTextFromHtml(
      '<article>before<script><script>alert(1)</script></script><style>.x{}</style>after</article>',
    );
    expect(result.text).toBe('beforeafter');
  });
});
