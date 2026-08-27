import type { PipelineMemory, MMROption } from './types.js';
import {
  MEMORY_SUMMARY_MAX_CHARS,
  allocateSectionBudget,
  resolveMemoryPriorities,
} from './context-budget.js';
import { extractOutlineEntities } from './context-builders.js';

/** 章节数超过此阈值时自动启用 MMR 多样性重排序 */
const AUTO_MMR_CHAPTER_THRESHOLD = 30;

export type MemoryLogLike = {
  info(message: string): void;
};

export type EnhancedMemoryContext = {
  memoryWorldCtx: string;
  memoryCharCtx: string;
  mergedPreviousSummary?: string;
  arcCtx: string;
  digestCtx: string;
  enhancedChapterCtx: string;
  factCtx: string;
  threadCtx: string;
  characterStateCtx: string;
};

export async function loadEnhancedMemoryContext(params: {
  memory: PipelineMemory;
  novelId: string;
  userDirection: string;
  outlineContent: string;
  chapterNumber: number;
  previousChapterContext: string;
  queries?: string[];
  logger?: MemoryLogLike;
  /** 当前小说章节总数，用于决定是否自动启用 MMR */
  chapterCount?: number;
  /** 本章重点关注的角色 ID 列表，会进行维度聚合检索 */
  focusCharacterIds?: string[];
  /** 小说类型（用于选择记忆优先级预设） */
  genre?: string;
  /** 用户自定义记忆优先级覆盖 */
  memoryPriority?: Record<string, number>;
  /** 角色名 → 别名列表映射，用于查询扩展 */
  characterAliases?: ReadonlyMap<string, readonly string[]>;
}): Promise<EnhancedMemoryContext> {
  const {
    memory,
    novelId,
    userDirection,
    outlineContent,
    chapterNumber,
    previousChapterContext,
    queries,
    logger,
    chapterCount,
    focusCharacterIds,
    genre,
    memoryPriority,
    characterAliases,
  } = params;

  // 长篇小说（30+ 章）自动启用 MMR 去重，减少检索结果冗余
  const autoMMR: MMROption | undefined =
    (chapterCount ?? chapterNumber) > AUTO_MMR_CHAPTER_THRESHOLD
      ? { enabled: true, lambda: 0.7 }
      : undefined;

  const [memoryWorldCtx, memoryCharCtx] = await Promise.all([
    memory.searchWorldContext(novelId, userDirection),
    memory.searchCharacterContext(novelId, userDirection),
  ]);

  const multiQueries = (queries ?? [userDirection, outlineContent])
    .map(item => item.trim())
    .filter(Boolean);

  // 从大纲中提取角色名，用于增强 fact / characterState 的多查询检索
  // 同时展开角色别名（称号、外号等），提高召回率
  const { characterNames } = extractOutlineEntities(outlineContent);
  const expandedNames: string[] = [];
  for (const name of characterNames.slice(0, 3)) {
    expandedNames.push(name);
    if (characterAliases) {
      for (const [mainName, aliases] of characterAliases) {
        if (mainName === name || aliases.includes(name)) {
          expandedNames.push(...aliases.slice(0, 2));
          break;
        }
      }
    }
  }
  const charNameQuery = expandedNames.slice(0, 6).join(' ');

  // 对 fact 和 characterState 构建增强查询（角色名 + 用户指引）
  const factSearchFn = (): Promise<string> => {
    if (!memory.searchFactContext) return Promise.resolve('');
    if (charNameQuery && memory.searchMultiQuery) {
      return memory.searchMultiQuery(novelId, [userDirection, charNameQuery], {
        category: 'fact', limit: 4, currentChapter: chapterNumber,
      });
    }
    return memory.searchFactContext(novelId, userDirection, chapterNumber, autoMMR);
  };
  const charStateSearchFn = (): Promise<string> => {
    if (!memory.searchCharacterStateContext) return Promise.resolve('');
    if (charNameQuery && memory.searchMultiQuery) {
      return memory.searchMultiQuery(novelId, [userDirection, charNameQuery], {
        category: 'character_state', limit: 4, currentChapter: chapterNumber,
      });
    }
    return memory.searchCharacterStateContext(novelId, userDirection, chapterNumber, autoMMR);
  };

  const [enhancedChapterCtx, digestCtx, arcCtx, factCtx, threadCtx, characterStateCtx] = await Promise.all([
    memory.searchMultiQuery
      ? memory.searchMultiQuery(novelId, multiQueries, { category: 'chapter', limit: 5, currentChapter: chapterNumber })
      : Promise.resolve(''),
    memory.searchDigestContext
      ? memory.searchDigestContext(novelId, userDirection, chapterNumber, autoMMR)
      : Promise.resolve(''),
    memory.searchArcContext
      ? memory.searchArcContext(novelId, userDirection, chapterNumber, autoMMR)
      : Promise.resolve(''),
    factSearchFn(),
    memory.searchThreadContext
      ? memory.searchThreadContext(novelId, userDirection, chapterNumber, autoMMR)
      : Promise.resolve(''),
    charStateSearchFn(),
  ]);

  // 角色维度聚合检索：为重点角色获取跨类别的完整状态速览
  let enrichedCharacterStateCtx = characterStateCtx;
  if (focusCharacterIds && focusCharacterIds.length > 0 && memory.getCharacterRecap) {
    const recaps = await Promise.all(
      focusCharacterIds.slice(0, 3).map(cid =>
        memory.getCharacterRecap!(novelId, cid, chapterNumber),
      ),
    );
    const recapText = recaps.filter(Boolean).join('\n');
    if (recapText) {
      enrichedCharacterStateCtx = enrichedCharacterStateCtx
        ? `${enrichedCharacterStateCtx}\n${recapText}`
        : recapText;
    }
  }

  let mergedPreviousSummary: string | undefined;
  if (arcCtx || enhancedChapterCtx || digestCtx || factCtx || threadCtx || enrichedCharacterStateCtx) {
    const rawTotal = arcCtx.length + factCtx.length + threadCtx.length
      + enrichedCharacterStateCtx.length + previousChapterContext.length
      + enhancedChapterCtx.length + digestCtx.length;

    logger?.info(
      `novel=${novelId} chapter=${chapterNumber}`
      + ` arcCtx=${arcCtx.length}chars`
      + ` digestCtx=${digestCtx.length}chars`
      + ` enhancedCtx=${enhancedChapterCtx.length}chars`
      + ` factCtx=${factCtx.length}chars`
      + ` threadCtx=${threadCtx.length}chars`
      + ` charStateCtx=${enrichedCharacterStateCtx.length}chars`
      + ` rawTotal=${rawTotal}chars budget=${MEMORY_SUMMARY_MAX_CHARS}chars`,
    );

    // 按优先级分配预算，避免 7 路检索无限膨胀
    // 优先级根据小说类型自动调整（悬疑优先 fact，言情优先 characterState 等）
    const priorities = resolveMemoryPriorities(genre, memoryPriority);
    const sections = [
      { key: 'previousChapter', content: previousChapterContext, priority: priorities.previousChapter },
      { key: 'characterState', content: enrichedCharacterStateCtx, priority: priorities.characterState },
      { key: 'digestCtx', content: digestCtx, priority: priorities.digestCtx },
      { key: 'enhancedChapter', content: enhancedChapterCtx, priority: priorities.enhancedChapter },
      { key: 'arcCtx', content: arcCtx, priority: priorities.arcCtx },
      { key: 'factCtx', content: factCtx, priority: priorities.factCtx },
      { key: 'threadCtx', content: threadCtx, priority: priorities.threadCtx },
    ];

    const { kept, trimmedKeys } = allocateSectionBudget(sections, MEMORY_SUMMARY_MAX_CHARS);
    if (trimmedKeys.length > 0) {
      logger?.info(`[memory-budget] trimmed: ${trimmedKeys.join(', ')}`);
    }

    mergedPreviousSummary = kept.map(s => s.content).join('\n\n') || undefined;
  }

  return {
    memoryWorldCtx,
    memoryCharCtx,
    mergedPreviousSummary,
    arcCtx,
    digestCtx,
    enhancedChapterCtx,
    factCtx,
    threadCtx,
    characterStateCtx: enrichedCharacterStateCtx,
  };
}
