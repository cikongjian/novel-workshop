/**
 * 将 markdown 文本转为可读的纯文本摘录。
 * content 为正文（纯文本优先），fallback 为 AI 生成的 markdown 摘要。
 */
export function buildMobileChapterExcerpt(content?: string, fallback?: string): string {
  const source = (content || fallback || '').trim();
  if (!source) return '点击继续阅读';

  const normalized = source
    // 去掉标题标记
    .replace(/^#{1,6}\s+/gm, '')
    // 去掉列表标记
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // 去掉引用标记
    .replace(/^>\s*/gm, '')
    // 去掉行内格式标记
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    // 去掉链接，保留文字
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    // 合并空白
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '点击继续阅读';
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 120)}...`;
}
