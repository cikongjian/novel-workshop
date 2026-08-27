import { stripSpeakerMarkers } from './stripSpeakerMarkers';

const DECORATIVE_SEPARATOR_RE = /^[\s*=_~.\-]{3,}$/;
/** ***bold italic*** — 3 星号必须先于 2 星号处理 */
const BOLD_ITALIC_RE = /\*{3}([^\n*]+?)\*{3}/g;
/** **bold** / __underline__ */
const INLINE_MARKDOWN_EMPHASIS_RE = /(\*\*|__)([^\n]+?)\1/g;
/** *italic* / _italic_ — 单星号/下划线 */
const SINGLE_EMPHASIS_RE = /(?<![*\\])\*([^\n*]+?)\*(?!\*)/g;
const SINGLE_UNDERSCORE_RE = /(?<![_\\])_([^\n_]+?)_(?!_)/g;
/** ~~strikethrough~~ */
const STRIKETHROUGH_RE = /~~([^\n~]+?)~~/g;
/** `inline code` */
const INLINE_CODE_RE = /`([^\n`]+?)`/g;
/** [link text](url) — markdown 链接 → 只保留文字 */
const MARKDOWN_LINK_RE = /\[([^\]]+?)\]\([^)]+?\)/g;
/** > blockquote 前缀 */
const BLOCKQUOTE_PREFIX_RE = /^\s{0,3}>\s?/;
/** - item / * item / + item / 1. item — 列表标记 */
const LIST_MARKER_RE = /^\s{0,3}(?:[-*+]|\d{1,3}\.)\s+/;
const BRACKETED_META_RE = /【([^【】\n]{1,16})】/g;
const HEADING_PREFIX_RE = /^\s{0,3}#{1,6}\s+/;
const BRACKETED_META_PUNCTUATION_RE = /[，。！？；：、”””’’’（）()]/;

function unwrapBracketedMetaTags(content: string): string {
  return content.replace(BRACKETED_META_RE, (full, inner: string) => {
    const text = inner.trim();
    if (!text || BRACKETED_META_PUNCTUATION_RE.test(text)) {
      return full;
    }
    return text;
  });
}

export function cleanReaderContent(content: string): string {
  return unwrapBracketedMetaTags(
    stripSpeakerMarkers(content)
      .replace(MARKDOWN_LINK_RE, '$1')
      .replace(BOLD_ITALIC_RE, '$1')
      .replace(INLINE_MARKDOWN_EMPHASIS_RE, '$2')
      .replace(SINGLE_EMPHASIS_RE, '$1')
      .replace(SINGLE_UNDERSCORE_RE, '$1')
      .replace(STRIKETHROUGH_RE, '$1')
      .replace(INLINE_CODE_RE, '$1'),
  )
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line
      .replace(HEADING_PREFIX_RE, '')
      .replace(BLOCKQUOTE_PREFIX_RE, '')
      .replace(LIST_MARKER_RE, '')
      .replace(/ {2,}/g, ' ')
      .trim())
    .filter((line) => !DECORATIVE_SEPARATOR_RE.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
