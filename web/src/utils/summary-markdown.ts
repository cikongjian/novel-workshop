function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeMarkdownLink(url: string): string | null {
  const normalized = url.trim();
  if (!normalized) return null;
  if (/^(https?:\/\/|mailto:)/i.test(normalized)) {
    return normalized;
  }
  return null;
}

function renderInlineMarkdown(rawLine: string): string {
  const tokens: string[] = [];
  const pushToken = (html: string): string => {
    const idx = tokens.push(html) - 1;
    return `\u0000${idx}\u0000`;
  };

  let text = rawLine;
  text = text.replace(/`([^`\n]+)`/g, (_match, code: string) => (
    pushToken(`<code>${escapeHtml(code)}</code>`)
  ));

  text = text.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, (_match, label: string, url: string) => {
    const safeUrl = sanitizeMarkdownLink(url);
    if (!safeUrl) return label;
    return pushToken(
      `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
    );
  });

  let html = escapeHtml(text);
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  return html.replace(/\u0000(\d+)\u0000/g, (_match, idx: string) => tokens[Number(idx)] ?? '');
}

export function renderSummaryMarkdown(rawSummary: string): string {
  const source = rawSummary.replace(/\r\n/g, '\n').trim();
  if (!source) return '';

  const lines = source.split('\n');
  const htmlParts: string[] = [];
  const paragraphLines: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  const closeList = () => {
    if (!listType) return;
    htmlParts.push(listType === 'ul' ? '</ul>' : '</ol>');
    listType = null;
  };

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    htmlParts.push(`<p>${paragraphLines.map(line => renderInlineMarkdown(line)).join('<br>')}</p>`);
    paragraphLines.length = 0;
  };

  const flushCodeBlock = () => {
    htmlParts.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
    codeBuffer = [];
  };

  for (const originalLine of lines) {
    const line = originalLine.trimEnd();
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      flushParagraph();
      closeList();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBuffer = [];
      } else {
        flushCodeBlock();
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(originalLine);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = headingMatch[1].length;
      htmlParts.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const unorderedItemMatch = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (unorderedItemMatch) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        htmlParts.push('<ul>');
        listType = 'ul';
      }
      htmlParts.push(`<li>${renderInlineMarkdown(unorderedItemMatch[1])}</li>`);
      continue;
    }

    const orderedItemMatch = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (orderedItemMatch) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        htmlParts.push('<ol>');
        listType = 'ol';
      }
      htmlParts.push(`<li>${renderInlineMarkdown(orderedItemMatch[1])}</li>`);
      continue;
    }

    const quoteMatch = /^>\s*(.+)$/.exec(trimmed);
    if (quoteMatch) {
      flushParagraph();
      closeList();
      htmlParts.push(`<blockquote>${renderInlineMarkdown(quoteMatch[1])}</blockquote>`);
      continue;
    }

    paragraphLines.push(trimmed);
  }

  if (inCodeBlock) {
    flushCodeBlock();
  }
  flushParagraph();
  closeList();
  return htmlParts.join('');
}
