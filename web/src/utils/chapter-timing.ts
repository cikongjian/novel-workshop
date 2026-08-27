/**
 * 章节生成耗时预估（基于生产环境实测：deepseek-chat 每章 4~6 分钟，取保守上界）
 * 用于前端"预计 X 分钟"提示，避免用户傻等。
 */
export const ESTIMATED_MIN_PER_CHAPTER = 5;

/** 批量生成预估分钟数 */
export function estimateBatchMinutes(chapterCount: number): number {
  return Math.max(1, chapterCount) * ESTIMATED_MIN_PER_CHAPTER;
}

/** 格式化预计时间文案 */
export function formatEstimatedTime(chapterCount = 1): string {
  const min = estimateBatchMinutes(chapterCount);
  return `预计约 ${min} 分钟`;
}
