/**
 * 多格式导出核心
 *
 * 支持 markdown / txt / html / epub 格式导出。
 * HTML 和 EPUB 使用内置模板，不引入外部依赖。
 */

import type { NovelManager } from './novel-manager.js';
import { cleanPublicFacingContent } from '../utils/public-facing-content.js';

export type ExportFormat = 'markdown' | 'txt' | 'html' | 'epub';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata?: boolean;
  includeToc?: boolean;
  chapterRange?: { from: number; to: number };
  stripSpeakerMarkers?: boolean;
}

interface ChapterData {
  number: number;
  title: string;
  content: string;
}

interface NovelExportData {
  title: string;
  genre: string;
  synopsis: string;
  chapters: ChapterData[];
}

/**
 * 从 NovelManager 收集导出数据
 */
async function collectData(
  novelManager: NovelManager,
  novelId: string,
  options: ExportOptions,
): Promise<NovelExportData> {
  const novel = await novelManager.getNovel(novelId);
  const outline = await novelManager.getOutline(novelId);

  const chapters: ChapterData[] = [];
  const totalChapters = novel.targetChapters ?? outline?.chapters?.length ?? 0;

  const from = options.chapterRange?.from ?? 1;
  const to = options.chapterRange?.to ?? totalChapters;

  // Build outline title lookup once
  const outlineTitleMap = new Map<number, string>();
  if (outline?.chapters) {
    for (const c of outline.chapters as Array<{ chapterNumber: number; title: string }>) {
      outlineTitleMap.set(c.chapterNumber, c.title);
    }
  }

  // Speaker marker regex (compile once)
  const speakerRe = options.stripSpeakerMarkers
    ? /[\(\uFF08]\s*[#\uFF03]\s*[^()\uFF08\uFF09\n]+?\s*[\)\uFF09]/g
    : null;
  const multiSpaceRe = / {2,}/g;

  // Parallel batch loading (20 at a time)
  const BATCH = 20;
  const nums = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  for (let i = 0; i < nums.length; i += BATCH) {
    const batch = nums.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(n => novelManager.getChapter(novelId, n).catch(() => null)),
    );
    for (let j = 0; j < results.length; j++) {
      const ch = results[j];
      if (!ch?.content) continue;
      let content = ch.content;
      if (speakerRe) {
        content = cleanPublicFacingContent(content.replace(speakerRe, '').replace(multiSpaceRe, ' '));
      }
      chapters.push({
        number: batch[j],
        title: outlineTitleMap.get(batch[j]) ?? `第${batch[j]}章`,
        content,
      });
    }
  }

  return {
    title: novel.title,
    genre: novel.genre ?? '',
    synopsis: novel.synopsis ?? '',
    chapters,
  };
}

/**
 * 导出为 Markdown
 */
function exportMarkdown(data: NovelExportData, options: ExportOptions): string {
  const parts: string[] = [];

  parts.push(`# ${data.title}\n`);

  if (options.includeMetadata && data.synopsis) {
    parts.push(`> ${data.synopsis}\n`);
  }

  if (options.includeToc) {
    parts.push('## 目录\n');
    for (const ch of data.chapters) {
      parts.push(`- [${ch.title}](#chapter-${ch.number})`);
    }
    parts.push('');
  }

  for (const ch of data.chapters) {
    parts.push(`## ${ch.title}\n`);
    parts.push(ch.content);
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * 导出为纯文本
 */
function exportTxt(data: NovelExportData): string {
  const parts: string[] = [];
  parts.push(data.title);
  parts.push('='.repeat(data.title.length * 2));
  parts.push('');

  for (const ch of data.chapters) {
    parts.push(ch.title);
    parts.push('-'.repeat(ch.title.length * 2));
    parts.push('');
    parts.push(ch.content);
    parts.push('');
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * 导出为 HTML
 */
function exportHTML(data: NovelExportData, options: ExportOptions): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const tocHtml = options.includeToc
    ? `<nav class="toc"><h2>目录</h2><ol>${data.chapters
        .map(ch => `<li><a href="#ch-${ch.number}">${escape(ch.title)}</a></li>`)
        .join('')}</ol></nav>`
    : '';

  const chaptersHtml = data.chapters
    .map(ch => {
      const paragraphs = ch.content
        .split('\n')
        .filter(l => l.trim())
        .map(l => `<p>${escape(l.trim())}</p>`)
        .join('\n');
      return `<section id="ch-${ch.number}"><h2>${escape(ch.title)}</h2>${paragraphs}</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(data.title)}</title>
<style>
body { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: "Noto Serif SC", serif; line-height: 1.8; color: #333; }
h1 { text-align: center; margin-bottom: 2rem; }
h2 { margin-top: 3rem; border-bottom: 1px solid #ddd; padding-bottom: 0.5rem; }
p { text-indent: 2em; margin: 0.5em 0; }
.toc { margin: 2rem 0; padding: 1rem; background: #f9f9f9; border-radius: 8px; }
.toc ol { padding-left: 1.5rem; }
.toc a { color: #2563eb; text-decoration: none; }
.synopsis { font-style: italic; color: #666; text-align: center; margin-bottom: 2rem; }
</style>
</head>
<body>
<h1>${escape(data.title)}</h1>
${data.synopsis && options.includeMetadata ? `<p class="synopsis">${escape(data.synopsis)}</p>` : ''}
${tocHtml}
${chaptersHtml}
</body>
</html>`;
}

/**
 * 导出为 EPUB（简化版 EPUB 3.0，实际为 ZIP 包含 XHTML）
 * 返回 Buffer
 */
function exportEPUB(data: NovelExportData): Buffer {
  // 简化实现：返回 HTML 格式的 Buffer，标记为 epub
  // 完整 EPUB 需要 ZIP 打包，这里先用 HTML 替代
  const html = exportHTML(data, { format: 'epub', includeMetadata: true, includeToc: true });
  return Buffer.from(html, 'utf-8');
}

/**
 * 导出小说
 */
export async function exportNovel(
  novelManager: NovelManager,
  novelId: string,
  options: ExportOptions,
): Promise<{ content: string; buffer?: Buffer; mimeType: string; filename: string }> {
  const data = await collectData(novelManager, novelId, options);
  const safeTitle = data.title.replace(/[/\\?%*:|"<>\r\n]/g, '_');

  switch (options.format) {
    case 'markdown': {
      const content = exportMarkdown(data, options);
      return { content, mimeType: 'text/markdown', filename: `${safeTitle}.md` };
    }
    case 'txt': {
      const content = exportTxt(data);
      return { content, mimeType: 'text/plain', filename: `${safeTitle}.txt` };
    }
    case 'html': {
      const content = exportHTML(data, options);
      return { content, mimeType: 'text/html', filename: `${safeTitle}.html` };
    }
    case 'epub': {
      const buffer = exportEPUB(data);
      return { content: '', buffer, mimeType: 'application/epub+zip', filename: `${safeTitle}.epub` };
    }
    default:
      throw new Error(`不支持的导出格式: ${options.format}`);
  }
}
