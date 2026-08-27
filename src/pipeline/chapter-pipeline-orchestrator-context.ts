/**
 * 编排器记忆上下文加载器
 *
 * 将统一记忆编排器的输出映射回 EnhancedMemoryContext 结构，
 * 实现对 loadEnhancedMemoryContext 的无缝替换。
 *
 * 映射策略：
 * - vector:world / world_card / file:world → memoryWorldCtx
 * - vector:character / vector:character_state / character_recap / file:character → memoryCharCtx
 * - 其他所有来源 → mergedPreviousSummary
 */

import { createLogger } from '../utils/logger.js';
import type { PipelineNovelManager } from './types.js';
import {
  createOrchestrator,
  WorldCardBridge,
} from '../memory/orchestrator/index.js';
import type {
  MemoryItem,
  MemorySource,
  RawVectorSearch,
  TruthFileData,
} from '../memory/orchestrator/index.js';
import type { EnhancedMemoryContext } from './chapter-pipeline-memory-context.js';

const log = createLogger('memory:orchestrator-pipeline');

/** 归入 memoryWorldCtx 的来源 */
const WORLD_SOURCES: ReadonlySet<MemorySource> = new Set([
  'vector:world',
  'world_card',
  'file:world',
]);

/** 归入 memoryCharCtx 的来源 */
const CHARACTER_SOURCES: ReadonlySet<MemorySource> = new Set([
  'vector:character',
  'vector:character_state',
  'character_recap',
  'file:character',
]);

/**
 * 使用统一记忆编排器加载上下文，输出兼容 EnhancedMemoryContext 结构。
 *
 * 注意：当前不包含 StoryState 适配器，故事状态仍由管线中
 * storyStateManager.buildStateContext 独立处理。
 */
export async function loadOrchestratorMemoryContext(params: {
  /** 原始向量搜索接口（由 NovelMemorySearchBridge 包装后传入） */
  rawSearch: RawVectorSearch;
  novelManager: PipelineNovelManager;
  novelId: string;
  userDirection: string;
  outlineContent: string;
  chapterNumber: number;
  chapterCount: number;
  previousChapterContext: string;
  focusCharacterIds?: string[];
  characterAliases?: ReadonlyMap<string, readonly string[]>;
  genre?: string;
  sourceWeightOverrides?: Partial<Record<MemorySource, number>>;
  /** 真相文件数据接口（可选，启用后注入 truth file 确定性状态） */
  truthFiles?: TruthFileData;
}): Promise<EnhancedMemoryContext> {
  const {
    rawSearch,
    novelManager,
    novelId,
    userDirection,
    outlineContent,
    chapterNumber,
    chapterCount,
    previousChapterContext,
    focusCharacterIds,
    characterAliases,
    genre,
    sourceWeightOverrides,
  } = params;

  const orchestrator = createOrchestrator({
    rawSearch,
    worldCards: new WorldCardBridge(id => novelManager.getWorldEntries(id)),
    truthFiles: params.truthFiles,
    // 不注入 storyState — 保留由管线独立处理
  });

  const result = await orchestrator.orchestrate({
    novelId,
    userDirection,
    outlineContent,
    chapterNumber,
    chapterCount,
    previousChapterContext,
    focusCharacterIds,
    characterAliases,
    genre,
    sourceWeightOverrides,
  });

  // ────── 按来源分组映射到旧结构 ──────
  const worldParts: string[] = [];
  const charParts: string[] = [];
  const otherParts: string[] = [];

  for (const item of result.items) {
    if (WORLD_SOURCES.has(item.source)) {
      worldParts.push(item.text);
    } else if (CHARACTER_SOURCES.has(item.source)) {
      charParts.push(item.text);
    } else {
      otherParts.push(item.text);
    }
  }

  const memoryWorldCtx = worldParts.join('\n\n');
  const memoryCharCtx = charParts.join('\n\n');
  const mergedPreviousSummary = otherParts.join('\n\n') || undefined;

  log.info('Orchestrator context mapped to legacy fields', {
    novelId,
    chapter: chapterNumber,
    worldChars: memoryWorldCtx.length,
    charChars: memoryCharCtx.length,
    otherChars: mergedPreviousSummary?.length ?? 0,
    totalItems: result.items.length,
    durationMs: result.stats.durationMs,
  });

  return {
    memoryWorldCtx,
    memoryCharCtx,
    mergedPreviousSummary,
    // 下游不使用这些字段，填空串保持类型兼容
    arcCtx: extractBySource(result.items, 'vector:arc'),
    digestCtx: extractBySource(result.items, 'vector:digest'),
    enhancedChapterCtx: extractBySource(result.items, 'vector:chapter'),
    factCtx: extractBySource(result.items, 'vector:fact'),
    threadCtx: extractBySource(result.items, 'vector:thread'),
    characterStateCtx: extractBySource(result.items, 'vector:character_state'),
  };
}

/** 从条目中提取指定来源的文本（用于填充调试字段） */
function extractBySource(items: MemoryItem[], source: MemorySource): string {
  return items
    .filter(item => item.source === source)
    .map(item => item.text)
    .join('\n\n');
}
