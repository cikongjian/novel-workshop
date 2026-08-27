export function formatBookWordCount(value: number): string {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  if (safeValue >= 10000) {
    return `${stripTrailingZero((safeValue / 10000).toFixed(1))} 万字`;
  }
  return `${safeValue} 字`;
}

export function formatPublishedChapterText(value: number): string {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return `已公开 ${safeValue} 章`;
}

function stripTrailingZero(value: string): string {
  return value.replace(/\.0$/, '');
}
