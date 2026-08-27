/**
 * 用户输入净化工具 —— 用于所有公开展示的文本字段。
 * 剥离 HTML / script 标签、零宽字符等，防止 XSS 和视觉欺骗。
 */

/** HTML 标签（含自闭合 / 注释 / CDATA） */
const HTML_TAG_RE = /<\/?[a-z][^>]*>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/gi;

/** HTML 实体编码的尖括号（&#60; / &#x3c; / &lt; 等混淆变体） */
const HTML_ENTITY_ANGLE_RE = /&(?:#0*60|#x0*3c|lt);/gi;

/** 常见零宽/不可见 Unicode 字符（用于视觉欺骗或隐藏载荷） */
const INVISIBLE_CHARS_RE = /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD\u2060\u2061\u2062\u2063\u2064\u2066\u2067\u2068\u2069\u202A-\u202E]/g;

/**
 * 剥离所有 HTML 标签和不可见字符，返回纯文本。
 * 适用于 title / description / penName / comment 等短文本字段。
 */
function stripHtmlTags(input: string): string {
  return input
    .replace(HTML_TAG_RE, '')
    .replace(HTML_ENTITY_ANGLE_RE, '<')
    .replace(INVISIBLE_CHARS_RE, '')
    .trim();
}

/**
 * Zod `.transform()` 适配器 —— 直接链入 schema。
 * 用法：z.string().transform(sanitizeTextField)
 */
export function sanitizeTextField(val: string): string {
  return stripHtmlTags(val);
}
