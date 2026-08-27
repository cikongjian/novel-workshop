/**
 * 事实归因（Fact Attribution）
 *
 * 为事实图谱中的每一条记录标注来源章节、提取方式和置信度，
 * 类似 git blame 追溯每一行代码的来源。
 */

import { z } from 'zod';

// ── 类型 ──────────────────────────────────────────────────────────

export const FactAttribution = z.object({
  /** 事实来源章节 */
  sourceChapter: z.number().int().positive(),
  /** 提取方式 */
  sourceType: z.enum(['extracted', 'inferred', 'declared']),
  /** 置信度 0-1 */
  confidence: z.number().min(0).max(1),
});
export type FactAttribution = z.infer<typeof FactAttribution>;

// ── 工厂函数 ──────────────────────────────────────────────────────

export function createAttribution(
  sourceChapter: number,
  sourceType: FactAttribution['sourceType'],
  confidence: number,
): FactAttribution {
  return { sourceChapter, sourceType, confidence };
}

/**
 * 合并两条归因信息，保留置信度更高的那一条。
 * 相同置信度时优先保留更新（章节号更大）的归因。
 */
export function mergeAttributions(
  existing: FactAttribution,
  newer: FactAttribution,
): FactAttribution {
  if (newer.confidence > existing.confidence) return newer;
  if (newer.confidence === existing.confidence && newer.sourceChapter > existing.sourceChapter) {
    return newer;
  }
  return existing;
}

/**
 * 从 certainty/sourceType 等已有字段推断归因信息。
 * 用于向后兼容——旧的 fact-graph 记录没有 attribution 字段时，
 * 可以从其他字段大致重建。
 */
export function inferAttributionFromContext(
  chapterNumber: number,
  opts: {
    certainty?: 'confirmed' | 'suspected' | 'rumored';
    sourceType?: 'direct' | 'reference' | 'memory' | 'dream';
    confidence?: number;
  } = {},
): FactAttribution {
  const CERTAINTY_CONFIDENCE: Record<string, number> = {
    confirmed: 0.95,
    suspected: 0.7,
    rumored: 0.4,
  };

  const SOURCE_TYPE_MAP: Record<string, FactAttribution['sourceType']> = {
    direct: 'extracted',
    reference: 'extracted',
    memory: 'inferred',
    dream: 'inferred',
  };

  const confidence = opts.confidence
    ?? CERTAINTY_CONFIDENCE[opts.certainty ?? '']
    ?? 0.5;

  const sourceType = SOURCE_TYPE_MAP[opts.sourceType ?? ''] ?? 'extracted';

  return { sourceChapter: chapterNumber, sourceType, confidence };
}
