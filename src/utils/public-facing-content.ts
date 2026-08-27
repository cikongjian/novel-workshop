const SPEAKER_MARKER_RE = /[\(\uFF08]\s*[#\uFF03]\s*[^()\uFF08\uFF09\n]+?\s*[\)\uFF09]/g;
const EXIT_STATUS_MARKER_RE = /(?:\([#\uFF03]|[#\uFF03]\()(?:死亡|退场):([^)]+)\)/g;
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
const LEADING_CHAPTER_TITLE_RE = /^第\s*[零〇一二三四五六七八九十百千万\d]+\s*章(?:\s+|[：:、.．-]).{0,80}$/u;
const LEADING_CHAPTER_NUMBER_RE = /^第\s*[零〇一二三四五六七八九十百千万\d]+\s*章$/u;
const EDITOR_NOTES_SEPARATOR_RE = /^---\s*EDITOR_NOTES\s*---$/i;
const EDITOR_NOTE_LABEL_RE = /^[\[【](?:节奏|压缩|修改|强化|优化|删减|对话|自然度|心迹揭露|关系转折|整体评价|评价|说明|修改说明|节奏\/压缩|心迹揭露\/关系转折)[^\]】]{0,30}[\]】][：:]/u;
const LEADING_MODEL_META_RE = /^(?:润色后正文|改写后正文|修改后正文|优化后正文|正文|以下是(?:润色|改写|修改|优化)?后?正文)[：:。.\s]*$/u;
const INLINE_LEADING_MODEL_META_RE = /^(?:润色后正文|改写后正文|修改后正文|优化后正文|以下是(?:润色|改写|修改|优化)?后?正文)[：:。.\s]+/u;
const BRACKETED_META_PUNCTUATION_RE = /[，。！？；：、”””’’’（）()]/;
const REPETITIVE_CONFIRMATION_RE =
  /([我你他她它][^。！？\n]{0,12}?是在(?:确定|确认))[^。！？\n]{1,24}?是在(?:确定|确认)([^。！？\n]{1,80})/g;
const AWKWARD_CHOICE_REASON_RE = /是选你这件事本身就不需要/g;
const DASH_THIS_ACTION_RE = /——这是((?:皱|换|动|停|转|响|按|坐|站|走|进|出|从|她进来|你出去|皮肤|灰线|左臂)[^。！？\n]{1,48})/g;
const DASH_THIS_COLOR_RE = /——这是(青黑色[^。！？\n]{0,40})/g;
const NARRATIVE_CHAPTER_REFERENCE_RE = /第\s*[0-9０-９]+\s*章(中|里|内|时)?/gu;
const IN_WORLD_CHAPTER_SOURCE_RE = /(?:》|手册|法典|经书|功法|秘笈|典籍|条例|卷册|小说|报告)$/u;
const PUBLIC_ROLE_PLACEHOLDER_RE =
  /(^|[\n。！？!?；;：:“”"「『])(?<label>主角|男主|女主)(?!光环|权限|剧本|身份|人设|名字|设定|待遇|命格|气运|标签|定位|视角|叙事|模板|故事|意识|系统|任务|团|们)/gu;

function inferNarrativePronoun(content: string): '他' | '她' {
  const sheHits = (content.match(/她/g)?.length ?? 0) + (content.match(/女主/g)?.length ?? 0) * 2;
  const heHits = (content.match(/他/g)?.length ?? 0) + (content.match(/男主/g)?.length ?? 0) * 2;
  return sheHits > heHits ? '她' : '他';
}

function normalizePublicRolePlaceholders(content: string): string {
  const fallbackPronoun = inferNarrativePronoun(content);
  return content.replace(PUBLIC_ROLE_PLACEHOLDER_RE, (_full, prefix: string, label: string) => {
    const pronoun = label === '女主' ? '她' : label === '男主' ? '他' : fallbackPronoun;
    return `${prefix}${pronoun}`;
  });
}

function unwrapBracketedMetaTags(content: string): string {
  return content.replace(BRACKETED_META_RE, (full, inner: string) => {
    const text = inner.trim();
    if (!text || BRACKETED_META_PUNCTUATION_RE.test(text)) {
      return full;
    }
    return text;
  });
}

function normalizeAwkwardLocalPhrasing(content: string): string {
  return content
    .replace(REPETITIVE_CONFIRMATION_RE, '$1$2')
    .replace(AWKWARD_CHOICE_REASON_RE, '是我自己要选')
    .replace(DASH_THIS_ACTION_RE, '——$1')
    .replace(DASH_THIS_COLOR_RE, '——$1');
}

function isInWorldChapterReference(content: string, offset: number): boolean {
  return IN_WORLD_CHAPTER_SOURCE_RE.test(content.slice(Math.max(0, offset - 16), offset));
}

export function collectNarrativeChapterReferenceLeaks(content: string): string[] {
  const matches = new Set<string>();
  for (const match of content.matchAll(NARRATIVE_CHAPTER_REFERENCE_RE)) {
    if (!isInWorldChapterReference(content, match.index)) matches.add(match[0]);
  }
  return [...matches];
}

function normalizeNarrativeChapterReferences(content: string): string {
  return content.replace(NARRATIVE_CHAPTER_REFERENCE_RE, (match, scope: string | undefined, offset: number) => {
    if (isInWorldChapterReference(content, offset)) return match;
    return scope === '时' ? '上次' : '此前';
  });
}

export function cleanPublicFacingContent(content: string): string {
  const normalizedLines: string[] = [];
  for (const rawLine of unwrapBracketedMetaTags(
    normalizePublicRolePlaceholders(normalizeAwkwardLocalPhrasing(content))
      .replace(SPEAKER_MARKER_RE, '')
      .replace(EXIT_STATUS_MARKER_RE, '')
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
    .filter((line) => !DECORATIVE_SEPARATOR_RE.test(line))) {
    let line = rawLine;
    if (EDITOR_NOTES_SEPARATOR_RE.test(line) || EDITOR_NOTE_LABEL_RE.test(line)) {
      break;
    }
    if (normalizedLines.length === 0) {
      if (LEADING_MODEL_META_RE.test(line)) {
        continue;
      }
      line = line.replace(INLINE_LEADING_MODEL_META_RE, '').trim();
      if (!line) {
        continue;
      }
    }
    normalizedLines.push(line);
  }
  if (normalizedLines[0] && (LEADING_CHAPTER_TITLE_RE.test(normalizedLines[0]) || LEADING_CHAPTER_NUMBER_RE.test(normalizedLines[0]))) {
    normalizedLines.shift();
  }
  return normalizeNarrativeChapterReferences(normalizedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim());
}

export function makePublicFacingExcerpt(content: string, maxLength = 140): string {
  const normalized = cleanPublicFacingContent(content).replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '该章节已发布，但暂未生成可展示摘要。';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
