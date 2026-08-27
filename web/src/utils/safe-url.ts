/**
 * 前端 URL 安全校验 —— 纵深防御，与后端 url-safety.ts 互为补充。
 */

const SAFE_IMAGE_PROTOCOL_RE = /^https?:\/\//i;

/**
 * 校验图片 URL 是否安全。
 * 仅允许 http/https 协议和同源相对路径，拒绝 javascript: / data: 等。
 */
export function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  // 同源相对路径（/api/novels/cover/xxx）
  if (url.startsWith('/')) return true;
  return SAFE_IMAGE_PROTOCOL_RE.test(url);
}

/**
 * 返回安全的图片 URL，不安全时返回空字符串（img 标签不加载）。
 */
export function safeImageUrl(url: string | null | undefined): string {
  return isSafeImageUrl(url) ? url! : '';
}
