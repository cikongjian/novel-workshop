/**
 * 轻量级逐行 diff 算法（基于 LCS）
 * 用于章节版本对比，无外部依赖
 */

export type DiffLine = {
  type: 'equal' | 'add' | 'remove';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
};

/**
 * 计算两段文本的逐行 diff
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // 构建 LCS 表
  const m = oldLines.length;
  const n = newLines.length;

  // 使用滚动数组优化内存（只保留两行）
  let prev = new Uint16Array(n + 1);
  let curr = new Uint16Array(n + 1);

  // 同时记录方向用于回溯
  const directions: Uint8Array[] = [];
  for (let i = 0; i <= m; i++) {
    directions.push(new Uint8Array(n + 1));
  }

  for (let i = 1; i <= m; i++) {
    [prev, curr] = [curr, prev];
    curr.fill(0);
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        directions[i][j] = 1; // diagonal
      } else if (prev[j] >= curr[j - 1]) {
        curr[j] = prev[j];
        directions[i][j] = 2; // up
      } else {
        curr[j] = curr[j - 1];
        directions[i][j] = 3; // left
      }
    }
  }

  // 回溯生成 diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && directions[i][j] === 1) {
      result.push({ type: 'equal', content: oldLines[i - 1], oldLineNumber: i, newLineNumber: j });
      i--;
      j--;
    } else if (i > 0 && (j === 0 || directions[i][j] === 2)) {
      result.push({ type: 'remove', content: oldLines[i - 1], oldLineNumber: i });
      i--;
    } else {
      result.push({ type: 'add', content: newLines[j - 1], newLineNumber: j });
      j--;
    }
  }

  return result.reverse();
}

/**
 * 生成紧凑的 diff 摘要（用于 API 响应）
 */
export function diffSummary(diff: DiffLine[]): { added: number; removed: number; unchanged: number } {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const line of diff) {
    if (line.type === 'add') added++;
    else if (line.type === 'remove') removed++;
    else unchanged++;
  }
  return { added, removed, unchanged };
}
