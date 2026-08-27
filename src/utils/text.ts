/**
 * 统计中文文本字数（排除空格和标点的影响）
 */
export function countWords(text: string): number {
  // 移除空白字符后计算长度
  return text.replace(/\s/g, '').length;
}

/**
 * 生成文本的简单哈希（用于去重）
 */
export function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * 获取当前 ISO 时间字符串
 */
export function now(): string {
  return new Date().toISOString();
}
