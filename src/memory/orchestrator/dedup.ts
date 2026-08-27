/**
 * 跨源去重
 *
 * 基于文本重叠检测，在所有来源的 MemoryItem 之间去除冗余。
 * 使用 n-gram Jaccard 相似度（轻量级，无需 embedding）。
 */

import type { MemoryItem } from './types.js';
import { DEDUP_SIMILARITY_THRESHOLD } from './types.js';

/** n-gram 分词粒度（中文适合 2-3 字） */
const NGRAM_SIZE = 3;

/** 最少 n-gram 数量，太短的文本跳过去重 */
const MIN_NGRAMS_FOR_DEDUP = 5;

/**
 * 从文本中提取 n-gram 集合（字符级别，适合中文）。
 * 去除空白字符后按固定窗口滑动。
 */
function extractNgrams(text: string, n: number = NGRAM_SIZE): Set<string> {
  const cleaned = text.replace(/\s+/g, '');
  const ngrams = new Set<string>();
  for (let i = 0; i <= cleaned.length - n; i++) {
    ngrams.add(cleaned.slice(i, i + n));
  }
  return ngrams;
}

/**
 * 计算两个 n-gram 集合的 Jaccard 相似度。
 * 返回 [0, 1]，1 表示完全相同。
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  // 遍历较小集合以优化性能
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const gram of smaller) {
    if (larger.has(gram)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 跨源去重。
 *
 * 策略：
 * 1. 条目已按最终分数降序排列（由 scoring.ts 完成）
 * 2. 从最高分开始，逐个检查是否与已保留条目重复
 * 3. 若与任一已保留条目的 Jaccard 相似度超过阈值，则丢弃
 * 4. 同 entityId + 同 source 的条目自动判定为重复（保留高分那个）
 *
 * @param items 按分数降序排列的条目
 * @param threshold Jaccard 相似度阈值，超过则视为重复
 * @returns 去重后的条目列表（保持降序）
 */
export function deduplicateItems(
  items: MemoryItem[],
  threshold: number = DEDUP_SIMILARITY_THRESHOLD,
): { kept: MemoryItem[]; removedCount: number } {
  const kept: MemoryItem[] = [];
  const keptNgrams: Array<{ ngrams: Set<string>; entityKey: string }> = [];
  let removedCount = 0;

  for (const item of items) {
    const entityKey = `${item.source}:${item.entityId}`;
    const ngrams = extractNgrams(item.text);

    // 短文本跳过 n-gram 去重（但仍检查精确 entityId 重复）
    if (ngrams.size < MIN_NGRAMS_FOR_DEDUP) {
      // 仅检查同源同实体的精确重复
      const exactDup = keptNgrams.some(k => k.entityKey === entityKey);
      if (exactDup) {
        removedCount++;
        continue;
      }
      kept.push(item);
      keptNgrams.push({ ngrams, entityKey });
      continue;
    }

    // 检查是否与已保留条目重复
    let isDuplicate = false;
    for (const existing of keptNgrams) {
      // 同源同实体 → 自动判定重复
      if (existing.entityKey === entityKey) {
        isDuplicate = true;
        break;
      }

      // n-gram Jaccard 相似度检查
      if (existing.ngrams.size >= MIN_NGRAMS_FOR_DEDUP) {
        const similarity = jaccardSimilarity(ngrams, existing.ngrams);
        if (similarity >= threshold) {
          isDuplicate = true;
          break;
        }
      }
    }

    if (isDuplicate) {
      removedCount++;
    } else {
      kept.push(item);
      keptNgrams.push({ ngrams, entityKey });
    }
  }

  return { kept, removedCount };
}
