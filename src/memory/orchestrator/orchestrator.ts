/**
 * 统一记忆编排器
 *
 * 将所有来源适配器的检索结果汇聚、打分、去重、裁剪后，
 * 输出单一上下文文本，替代现有的 loadEnhancedMemoryContext + storyState + worldV2 三路合并。
 *
 * 使用方式：
 * 1. 创建 MemoryOrchestrator 实例，注入来源适配器
 * 2. 调用 orchestrate(params) 获取统一上下文
 * 3. 将 result.mergedContext 注入 Writer Agent 的 previousChapterSummary
 */

import { createLogger } from '../../utils/logger.js';
import type {
  MemoryItem,
  MemorySource,
  MemorySourceAdapter,
  OrchestratorParams,
  OrchestratorResult,
  OrchestratorStats,
  ScoringWeights,
} from './types.js';
import {
  DEFAULT_SCORING_WEIGHTS,
  ORCHESTRATOR_BUDGET_CHARS,
  MAX_ITEM_CHARS,
} from './types.js';
import { resolveSourceWeights, scoreAndSort } from './scoring.js';
import { deduplicateItems } from './dedup.js';

const log = createLogger('memory:orchestrator');

export class MemoryOrchestrator {
  private readonly adapters: MemorySourceAdapter[];
  private readonly scoringWeights: ScoringWeights;
  private readonly budgetChars: number;

  constructor(params: {
    adapters: MemorySourceAdapter[];
    scoringWeights?: ScoringWeights;
    budgetChars?: number;
  }) {
    this.adapters = params.adapters;
    this.scoringWeights = params.scoringWeights ?? DEFAULT_SCORING_WEIGHTS;
    this.budgetChars = params.budgetChars ?? ORCHESTRATOR_BUDGET_CHARS;
  }

  /**
   * 执行完整编排流程：检索 → 打分 → 去重 → 预算裁剪 → 渲染。
   */
  async orchestrate(params: OrchestratorParams): Promise<OrchestratorResult> {
    const startTime = Date.now();

    // ────── 1. 并行检索所有来源 ──────
    const adapterResults = await Promise.allSettled(
      this.adapters.map(adapter =>
        adapter.retrieve(params).then(items => ({
          name: adapter.name,
          items,
        })),
      ),
    );

    const allItems: MemoryItem[] = [];
    const retrievedCounts: Partial<Record<MemorySource, number>> = {};

    for (const result of adapterResults) {
      if (result.status === 'fulfilled') {
        for (const item of result.value.items) {
          allItems.push(item);
          retrievedCounts[item.source] = (retrievedCounts[item.source] ?? 0) + 1;
        }
      } else {
        log.warn('Adapter retrieval failed', {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    log.info(`Retrieved ${allItems.length} items from ${this.adapters.length} adapters`, {
      novelId: params.novelId,
      chapter: params.chapterNumber,
      counts: retrievedCounts,
    });

    // ────── 2. 统一打分 ──────
    const sourceWeights = resolveSourceWeights(params.genre, params.sourceWeightOverrides);
    const scored = scoreAndSort(allItems, sourceWeights, this.scoringWeights);

    // ────── 3. 跨源去重 ──────
    const { kept: deduped, removedCount: deduplicatedCount } = deduplicateItems(scored);

    if (deduplicatedCount > 0) {
      log.info(`Deduplicated ${deduplicatedCount} items`, {
        novelId: params.novelId,
        before: scored.length,
        after: deduped.length,
      });
    }

    // ────── 4. 预算裁剪 ──────
    const { kept: budgeted, droppedCount } = this.applyBudget(deduped);

    // ────── 5. 渲染上下文 ──────
    const mergedContext = this.renderContext(budgeted);

    const durationMs = Date.now() - startTime;
    const stats: OrchestratorStats = {
      retrievedCounts,
      deduplicatedCount,
      keptCount: budgeted.length,
      droppedCount,
      totalChars: mergedContext.length,
      budgetChars: this.budgetChars,
      durationMs,
    };

    log.info('Orchestration complete', {
      novelId: params.novelId,
      chapter: params.chapterNumber,
      kept: stats.keptCount,
      dropped: stats.droppedCount,
      chars: stats.totalChars,
      budget: stats.budgetChars,
      durationMs: stats.durationMs,
    });

    return {
      items: budgeted,
      mergedContext,
      stats,
    };
  }

  /**
   * 预算裁剪：按分数从高到低保留条目，直到总字符数达到上限。
   * 最后一个条目若超限则截断而非丢弃。
   */
  private applyBudget(
    items: MemoryItem[],
  ): { kept: MemoryItem[]; droppedCount: number } {
    const kept: MemoryItem[] = [];
    let usedChars = 0;
    let droppedCount = 0;

    for (const item of items) {
      const chars = Math.min(item.charCount, MAX_ITEM_CHARS);

      if (usedChars + chars <= this.budgetChars) {
        kept.push(item);
        usedChars += chars;
      } else {
        const remaining = this.budgetChars - usedChars;
        if (remaining > 200) {
          // 截断最后一个条目
          const truncatedText = item.text.slice(0, remaining - 10) + '…';
          kept.push({
            ...item,
            text: truncatedText,
            charCount: truncatedText.length,
          });
          usedChars = this.budgetChars;
          droppedCount++;
        } else {
          droppedCount++;
        }
        // 后续条目全部丢弃
        droppedCount += items.length - items.indexOf(item) - 1;
        break;
      }
    }

    return { kept, droppedCount };
  }

  /**
   * 渲染最终上下文文本。
   * 按来源分组，添加分隔标题，便于 Writer Agent 理解各段的用途。
   */
  private renderContext(items: MemoryItem[]): string {
    if (items.length === 0) return '';

    // 按来源大类分组
    const groups = new Map<string, MemoryItem[]>();
    for (const item of items) {
      const groupKey = this.getGroupKey(item.source);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(item);
    }

    // 按预定义顺序渲染
    const sections: string[] = [];
    for (const [groupKey, groupLabel] of RENDER_ORDER) {
      const groupItems = groups.get(groupKey);
      if (!groupItems || groupItems.length === 0) continue;

      sections.push(`## ${groupLabel}`);
      for (const item of groupItems) {
        sections.push(item.text);
      }
    }

    return sections.join('\n\n');
  }

  /**
   * 将 MemorySource 映射为渲染分组键。
   */
  private getGroupKey(source: MemorySource): string {
    if (source.startsWith('story_state:')) return 'story_state';
    if (source.startsWith('truth_file:')) return 'truth_file';
    if (source.startsWith('vector:')) return 'vector';
    if (source.startsWith('file:')) return 'file';
    return source;
  }
}

/** 渲染分组顺序 */
const RENDER_ORDER: Array<[string, string]> = [
  ['story_state', '故事状态'],
  ['truth_file', '确定性状态'],
  ['file', '前文上下文'],
  ['character_recap', '角色速览'],
  ['vector', '记忆检索'],
  ['world_card', '世界设定'],
  ['pipeline_hint', '管线提示'],
];
