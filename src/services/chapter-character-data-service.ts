import type { NovelAgent } from '../agents/types.js';
import type { NovelMemory } from '../memory/novel-memory.js';
import type { ModelClient } from '../models/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { CharacterProfile, CharacterStateSnapshot } from '../novel/types.js';
import { extractCharacterEvents } from '../novel/character-event-extractor.js';
import { extractChapterHighlights } from '../novel/character-highlight-extractor.js';
import { extractChapterRelations } from '../novel/character-relation-extractor.js';
import { buildCharacterStateSnapshots } from '../novel/character-state-snapshot.js';
import { extractAndCreateMissingSpeakers } from '../novel/speaker-extractor.js';
import { generateCardBlurbs, touchCharacterCardProgress } from '../pipeline/card-blurb-generator.js';
import { createLogger } from '../utils/logger.js';
import { bootstrapCoreCharacters } from './core-character-bootstrap.js';
import { promoteRecurringCharacters } from './recurring-character-promotion.js';
import {
  applyAutoProtagonistReconciliation,
  loadAutoProtagonistReconciliationPlan,
} from './auto-protagonist-reconciliation.js';
import {
  applyCharacterStatusReconciliation,
  planCharacterStatusReconciliation,
} from './character-status-reconciliation.js';

const logger = createLogger('ChapterCharacterData');

export interface ChapterCharacterDataOptions {
  novelId: string;
  chapterNumber: number;
  chapterContent: string;
  novelTitle?: string;
  novelSynopsis?: string;
  genre?: string;
  agentOutputs?: Array<{ agentRole: string; content: string }>;
}

export interface ChapterCharacterDataDeps {
  novelManager: NovelManager;
  novelMemory?: NovelMemory;
  agents?: Map<string, NovelAgent>;
  modelClient?: ModelClient;
}

export interface ChapterCharacterDataResult {
  pendingNames: string[];
  snapshotCount: number;
  eventCount: number;
  highlightCount: number;
  relationCount: number;
  cardTouched: boolean;
  cardBlurbScheduled: boolean;
}

export async function generateChapterCharacterData(
  deps: ChapterCharacterDataDeps,
  options: ChapterCharacterDataOptions,
): Promise<ChapterCharacterDataResult> {
  const emptyResult: ChapterCharacterDataResult = {
    pendingNames: [],
    snapshotCount: 0,
    eventCount: 0,
    highlightCount: 0,
    relationCount: 0,
    cardTouched: false,
    cardBlurbScheduled: false,
  };

  if (!options.chapterContent.trim()) {
    return emptyResult;
  }

  const characterAnalysisText = buildCharacterAnalysisText(options.agentOutputs);
  const pendingNames = await detectPendingCharacters(deps, options, characterAnalysisText);
  await bootstrapCoreCharacters({
    novelManager: deps.novelManager,
    novelMemory: deps.novelMemory,
    novelId: options.novelId,
    chapterNumber: options.chapterNumber,
    chapterContent: options.chapterContent,
    candidateNames: pendingNames,
    novelContext: [options.novelTitle, options.novelSynopsis].filter(Boolean).join('\n'),
  }).catch((err) => {
    logger.warn('核心角色自动建档失败', { error: err instanceof Error ? err.message : String(err) });
  });
  const promotedCharacters = await promoteRecurringCharacters({
    novelManager: deps.novelManager,
    novelMemory: deps.novelMemory,
    novelId: options.novelId,
    chapterNumber: options.chapterNumber,
  }).catch((err) => {
    logger.warn('常驻配角自动建档失败', { error: err instanceof Error ? err.message : String(err) });
    return [];
  });
  if (promotedCharacters.length > 0 && options.chapterNumber >= 3) {
    const rolePlan = await loadAutoProtagonistReconciliationPlan({
      novelManager: deps.novelManager,
      novelId: options.novelId,
    }).catch(() => null);
    if (rolePlan) {
      await applyAutoProtagonistReconciliation({
        novelManager: deps.novelManager,
        novelMemory: deps.novelMemory,
        novelId: options.novelId,
        plan: rolePlan,
      }).catch((err) => {
        logger.warn('自动主角身份纠偏失败', { error: err instanceof Error ? err.message : String(err) });
      });
    }
  }
  let characters = await deps.novelManager.getCharacters(options.novelId);
  const statusPlans = planCharacterStatusReconciliation({
    characters,
    chapters: [{
      novelId: options.novelId,
      chapterNumber: options.chapterNumber,
      title: '',
      summary: '',
      content: options.chapterContent,
      wordCount: options.chapterContent.length,
      status: 'finalized',
      agentComments: [],
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
  });
  if (statusPlans.length > 0) {
    await applyCharacterStatusReconciliation({
      novelManager: deps.novelManager,
      novelMemory: deps.novelMemory,
      novelId: options.novelId,
      plans: statusPlans,
    });
    characters = await deps.novelManager.getCharacters(options.novelId);
  }
  const snapshots = await persistStateSnapshots(deps, options, characters);
  const eventCount = await persistCharacterEvents(deps, options, characters, characterAnalysisText);
  const highlightCount = await persistHighlights(deps, options, characters, snapshots);
  const relationCount = await persistRelations(deps, options, characters, snapshots);
  const cardTouched = await touchCharacterCardProgress(deps.novelManager, options)
    .then((touched) => touched.length > 0)
    .catch((err) => {
      logger.warn('角色卡基础状态更新失败', { error: err instanceof Error ? err.message : String(err) });
      return false;
    });

  const cardBlurbScheduled = scheduleCardBlurbGeneration(deps, options);

  return {
    pendingNames,
    snapshotCount: snapshots.length,
    eventCount,
    highlightCount,
    relationCount,
    cardTouched,
    cardBlurbScheduled,
  };
}

export function scheduleChapterCharacterData(
  deps: ChapterCharacterDataDeps,
  options: ChapterCharacterDataOptions,
): void {
  void generateChapterCharacterData(deps, options).catch((err) => {
    logger.warn('章节角色数据生成失败', {
      novelId: options.novelId,
      chapterNumber: options.chapterNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

function buildCharacterAnalysisText(agentOutputs?: Array<{ agentRole: string; content: string }>): string {
  return (agentOutputs ?? [])
    .filter(output => output.agentRole === 'character' || output.agentRole === 'character-merger')
    .map(output => output.content)
    .filter(Boolean)
    .join('\n\n');
}

async function detectPendingCharacters(
  deps: ChapterCharacterDataDeps,
  options: ChapterCharacterDataOptions,
  characterAnalysisText: string,
): Promise<string[]> {
  try {
    const pendingNames = await extractAndCreateMissingSpeakers(
      deps.novelManager,
      options.novelId,
      options.chapterNumber,
      options.chapterContent,
      characterAnalysisText,
    );
    await indexNewlyApprovedCharacters(deps, options.novelId, pendingNames);
    return pendingNames;
  } catch (err) {
    logger.warn('候选角色提取失败', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function indexNewlyApprovedCharacters(
  deps: ChapterCharacterDataDeps,
  novelId: string,
  names: string[],
): Promise<void> {
  if (!deps.novelMemory || names.length === 0) return;
  const createdNameSet = new Set(names.map(name => name.trim()));
  const characters = await deps.novelManager.getCharacters(novelId);
  const toIndex = characters.filter(c => createdNameSet.has(c.name.trim()));
  await Promise.all(toIndex.map(c =>
    deps.novelMemory?.indexCharacter(novelId, c).catch((err) => {
      logger.warn('角色索引失败', { name: c.name, error: err instanceof Error ? err.message : String(err) });
    }),
  ));
}

async function persistStateSnapshots(
  deps: ChapterCharacterDataDeps,
  options: ChapterCharacterDataOptions,
  characters: CharacterProfile[],
): Promise<CharacterStateSnapshot[]> {
  try {
    const characterNameMap = new Map(characters.map(ch => [ch.id, ch.name]));
    const snapshots = buildCharacterStateSnapshots({
      novelId: options.novelId,
      chapterNumber: options.chapterNumber,
      chapterContent: options.chapterContent,
      characters,
    });
    for (const snapshot of snapshots) {
      await deps.novelManager.saveCharacterStateSnapshot(options.novelId, snapshot);
      if (deps.novelMemory) {
        await deps.novelMemory.indexCharacterStateSnapshot(
          options.novelId,
          snapshot,
          characterNameMap.get(snapshot.characterId),
        ).catch((err) => {
          logger.warn('角色状态快照索引失败', { error: err instanceof Error ? err.message : String(err) });
        });
      }
    }
    return snapshots;
  } catch (err) {
    logger.warn('角色状态快照写入失败', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function persistCharacterEvents(
  deps: ChapterCharacterDataDeps,
  options: ChapterCharacterDataOptions,
  characters: CharacterProfile[],
  characterAnalysisText: string,
): Promise<number> {
  try {
    const events = extractCharacterEvents({
      novelId: options.novelId,
      chapterNumber: options.chapterNumber,
      chapterContent: options.chapterContent,
      characters,
      charMergerOutput: characterAnalysisText,
      plotAnalystOutput: '',
    });
    if (events.length > 0) {
      await deps.novelManager.appendCharacterEvents(options.novelId, events);
    }
    return events.length;
  } catch (err) {
    logger.warn('角色事件提取失败', { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

async function persistHighlights(
  deps: ChapterCharacterDataDeps,
  options: ChapterCharacterDataOptions,
  characters: CharacterProfile[],
  snapshots: CharacterStateSnapshot[],
): Promise<number> {
  try {
    const highlights = extractChapterHighlights({
      chapterContent: options.chapterContent,
      characters,
      snapshots,
      chapterNumber: options.chapterNumber,
    });
    if (highlights.length > 0) {
      await deps.novelManager.appendCharacterHighlights(options.novelId, highlights);
    }
    return highlights.length;
  } catch (err) {
    logger.warn('角色高光提取失败', { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

async function persistRelations(
  deps: ChapterCharacterDataDeps,
  options: ChapterCharacterDataOptions,
  characters: CharacterProfile[],
  snapshots: CharacterStateSnapshot[],
): Promise<number> {
  try {
    const relations = extractChapterRelations({
      chapterContent: options.chapterContent,
      characters,
      snapshots,
      chapterNumber: options.chapterNumber,
    });
    if (relations.length > 0) {
      await deps.novelManager.appendCharacterRelations(options.novelId, relations);
    }
    return relations.length;
  } catch (err) {
    logger.warn('角色关系提取失败', { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

function scheduleCardBlurbGeneration(
  deps: ChapterCharacterDataDeps,
  options: ChapterCharacterDataOptions,
): boolean {
  if (!deps.agents || !deps.modelClient) return false;
  const blurbAgent = deps.agents.get('card-blurb-writer');
  if (!blurbAgent) return false;

  void generateCardBlurbs(
    {
      novelManager: deps.novelManager,
      agents: deps.agents,
      modelClient: deps.modelClient,
    },
    {
      novelId: options.novelId,
      chapterNumber: options.chapterNumber,
      chapterContent: options.chapterContent,
      genre: options.genre ?? '',
      novelTitle: options.novelTitle ?? '',
      novelSynopsis: options.novelSynopsis ?? '',
    },
  ).catch((err) => {
    logger.warn('卡牌标签生成失败', {
      novelId: options.novelId,
      chapterNumber: options.chapterNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return true;
}
