import fsp from 'node:fs/promises';
import path from 'node:path';
import { VectorStore } from './vector-store.js';
import type { SearchResult } from './vector-store.js';
import type { EmbeddingClient } from '../models/types.js';
import { createLogger } from '../utils/logger.js';
import { mmrRerank } from './mmr-rerank.js';
import { calculateDecayFactor } from '../pipeline/memory-decay.js';
import { resolveNovelStorageDir } from '../novel/data-root.js';

const LANCE_DIR_NAME = 'memory-lance';
const memoryLog = createLogger('memory:novel-memory');

/** 按小说 ID 解析 Embedding 客户端，返回 null 则回退到全局默认客户端 */
export type EmbeddingClientResolver = (novelId: string) => Promise<EmbeddingClient | null> | EmbeddingClient | null;

type CachedStore = {
  store: VectorStore;
  embeddingModel: string;
  embeddingDimensions: number;
};
import type {
  WorldEntry,
  CharacterProfile,
  CharacterStateSnapshot,
  PlotThreadSnapshot,
} from '../novel/types.js';
import type { FactGraph } from '../novel/fact-graph-types.js';
import type { ChapterDigest } from './digest-types.js';
import type { ArcSummary } from './arc-types.js';
import {
  buildThreadEntityId,
  collectFactChapterNumbers,
  readJsonIds,
  readCharacterStateEntityIds,
  readChapterNumbers,
  readFactChapterNumbers,
  readPlotThreadEntityIds,
  resolveNovelContentDir,
} from './source-readers.js';

export type RetrievalLogEntry = {
  query: string;
  category: string;
  resultCount: number;
  topScores: number[];
  durationMs: number;
  timestamp: string;
};

export type MemoryCoverage = {
  novelId: string;
  source: {
    worldCount: number;
    characterCount: number;
    chapterCount: number;
    factChapterCount: number;
    threadSnapshotCount: number;
    characterStateCount: number;
  };
  indexed: {
    worldCount: number;
    characterCount: number;
    chapterCount: number;
    digestCount: number;
    arcCount: number;
    factCount: number;
    threadCount: number;
    characterStateCount: number;
    chunkStats: {
      totalChunks: number;
      categories: Record<string, number>;
    };
  };
  missing: {
    chapterNumbers: number[];
    worldIds: string[];
    characterIds: string[];
    factChapterNumbers: number[];
    threadEntityIds: string[];
    characterStateIds: string[];
  };
  stale: {
    worldIds: string[];
    characterIds: string[];
    factChapterNumbers: number[];
    threadEntityIds: string[];
    characterStateIds: string[];
  };
  readiness: {
    sourceDomainsReady: boolean;
    warnings: string[];
  };
  complete: boolean;
};

export function buildMemorySourceReadiness(source: MemoryCoverage['source']): MemoryCoverage['readiness'] {
  const warnings: string[] = [];
  if (source.chapterCount > 0 && source.worldCount === 0) {
    warnings.push('world source data is empty');
  }
  if (source.chapterCount > 0 && source.characterCount === 0) {
    warnings.push('character source data is empty');
  }
  if (source.chapterCount >= 2 && source.characterStateCount === 0) {
    warnings.push('character state source data is empty');
  }
  if (source.chapterCount >= 3 && source.threadSnapshotCount === 0) {
    warnings.push('plot thread source data is empty');
  }
  if (source.factChapterCount < source.chapterCount) {
    warnings.push(`chapter fact source coverage is incomplete: ${source.factChapterCount}/${source.chapterCount}`);
  }
  if (source.chapterCount >= 3 && source.threadSnapshotCount < source.chapterCount) {
    warnings.push(`plot thread source coverage is incomplete: ${source.threadSnapshotCount}/${source.chapterCount}`);
  }
  return { sourceDomainsReady: warnings.length === 0, warnings };
}

const MAX_RETRIEVAL_LOG = 200;

/** 各记忆类别的时间衰减因子（值越大衰减越快） */
const CATEGORY_DECAY_FACTORS: Record<string, number> = {
  arc: 0.02,
  fact: 0.04,
  thread: 0.04,
  digest: 0.05,
  chapter: 0.05,
  character_state: 0.05,
};

function getLanceDir(novelsDir: string, novelId: string): string {
  return path.join(resolveNovelStorageDir(novelsDir, novelId), LANCE_DIR_NAME);
}

/**
 * 小说记忆管理器
 * 提供世界观、角色、章节的索引和上下文检索能力
 * 在向量存储之上封装业务语义
 */
export class NovelMemory {
  private readonly novelsDir: string;
  private readonly defaultEmbeddingClient: EmbeddingClient;
  private readonly embeddingClientResolver?: EmbeddingClientResolver;
  private readonly stores = new Map<string, CachedStore>();
  private readonly retrievalLogs = new Map<string, RetrievalLogEntry[]>();
  private readonly options: { hybridSearchEnabled?: boolean };

  constructor(
    novelsDir: string,
    embeddingClient: EmbeddingClient,
    options?: {
      hybridSearchEnabled?: boolean;
      embeddingClientResolver?: EmbeddingClientResolver;
    },
  ) {
    this.novelsDir = novelsDir;
    this.defaultEmbeddingClient = embeddingClient;
    this.embeddingClientResolver = options?.embeddingClientResolver;
    this.options = options ?? {};
  }

  private logRetrieval(novelId: string, entry: RetrievalLogEntry): void {
    if (!this.retrievalLogs.has(novelId)) {
      this.retrievalLogs.set(novelId, []);
    }
    const logs = this.retrievalLogs.get(novelId)!;
    logs.push(entry);
    if (logs.length > MAX_RETRIEVAL_LOG) logs.shift();
  }

  getRetrievalLogs(novelId: string): RetrievalLogEntry[] {
    return [...(this.retrievalLogs.get(novelId) ?? [])];
  }

  clearRetrievalLogs(novelId: string): void {
    this.retrievalLogs.delete(novelId);
  }

  private async resolveEmbeddingClient(novelId: string): Promise<EmbeddingClient> {
    if (this.embeddingClientResolver) {
      try {
        const override = await this.embeddingClientResolver(novelId);
        if (override) return override;
      } catch {
        // 解析失败时回退到默认客户端
      }
    }
    return this.defaultEmbeddingClient;
  }

  private async getStore(novelId: string): Promise<VectorStore> {
    const embeddingClient = await this.resolveEmbeddingClient(novelId);
    const cached = this.stores.get(novelId);

    if (cached) {
      if (cached.embeddingModel === embeddingClient.model
        && cached.embeddingDimensions === embeddingClient.dimensions) {
        return cached.store;
      }
      // Embedding 模型变更，关闭旧存储并清除向量数据
      cached.store.close();
      this.stores.delete(novelId);
      const dbUri = getLanceDir(this.novelsDir, novelId);
      await fsp.rm(dbUri, { recursive: true, force: true });
      await fsp.mkdir(dbUri, { recursive: true });
      memoryLog.warn(`小说 ${novelId} 的 Embedding 模型已变更：${cached.embeddingModel} → ${embeddingClient.model}，向量存储已清除，需要重新索引`);
    }

    const dbUri = getLanceDir(this.novelsDir, novelId);
    await fsp.mkdir(dbUri, { recursive: true });
    const store = new VectorStore(dbUri, embeddingClient, {
      hybridSearchEnabled: this.options.hybridSearchEnabled,
    });
    this.stores.set(novelId, {
      store,
      embeddingModel: embeddingClient.model,
      embeddingDimensions: embeddingClient.dimensions,
    });
    return store;
  }

  private async getStoreIfPresent(novelId: string): Promise<VectorStore | null> {
    const cached = this.stores.get(novelId);
    if (cached) return cached.store;

    const dbUri = getLanceDir(this.novelsDir, novelId);
    try { await fsp.access(dbUri); } catch { return null; }

    const embeddingClient = await this.resolveEmbeddingClient(novelId);
    const store = new VectorStore(dbUri, embeddingClient, {
      hybridSearchEnabled: this.options.hybridSearchEnabled,
    });
    this.stores.set(novelId, {
      store,
      embeddingModel: embeddingClient.model,
      embeddingDimensions: embeddingClient.dimensions,
    });
    return store;
  }

  /** 失效指定小说的缓存 Embedding 客户端和向量存储（embedding 配置变更时调用） */
  invalidateNovelEmbedding(novelId: string): void {
    const cached = this.stores.get(novelId);
    if (cached) {
      cached.store.close();
      this.stores.delete(novelId);
    }
  }

  /**
   * 索引世界观条目
   * 将名称、描述、详情拼接为完整文本后索引
   */
  async indexWorldEntry(novelId: string, entry: WorldEntry): Promise<void> {
    const store = await this.getStore(novelId);
    const parts = [
      `【${entry.name}】`,
      `分类：${entry.category}`,
      entry.description,
    ];

    if (entry.constraints?.length) {
      parts.push(`约束：${entry.constraints.join('；')}`);
    }
    if (entry.consequences?.length) {
      parts.push(`后果：${entry.consequences.join('；')}`);
    }

    // 拼接详情字段
    if (entry.details && Object.keys(entry.details).length > 0) {
      for (const [key, value] of Object.entries(entry.details)) {
        parts.push(`${key}：${value}`);
      }
    }

    // 拼接标签
    if (entry.tags.length > 0) {
      parts.push(`标签：${entry.tags.join('、')}`);
    }

    await store.indexText({
      category: 'world',
      entityId: entry.id,
      text: parts.join('\n'),
    });
  }

  /**
   * 索引角色信息
   * 将角色的所有属性拼接为完整文本后索引
   */
  async indexCharacter(novelId: string, character: CharacterProfile): Promise<void> {
    const store = await this.getStore(novelId);
    const parts = [
      `【${character.name}】`,
      `身份：${character.role}`,
    ];

    if (character.aliases.length > 0) {
      parts.push(`别名：${character.aliases.join('、')}`);
    }
    if (character.age) {
      parts.push(`年龄：${character.age}`);
    }
    if (character.gender) {
      parts.push(`性别：${character.gender}`);
    }
    if (character.appearance) {
      parts.push(`外貌：${character.appearance}`);
    }
    if (character.personality) {
      parts.push(`性格：${character.personality}`);
    }
    if (character.personalityTraits.length > 0) {
      parts.push(`性格标签：${character.personalityTraits.join('、')}`);
    }
    if (character.speechStyle) {
      parts.push(`说话风格：${character.speechStyle}`);
    }
    if (character.speechExamples.length > 0) {
      parts.push(`对话示例：\n${character.speechExamples.join('\n')}`);
    }
    if (character.backstory) {
      parts.push(`背景故事：${character.backstory}`);
    }
    if (character.motivation) {
      parts.push(`动机：${character.motivation}`);
    }
    if (character.drives) {
      parts.push(`核心目标：${character.drives.want}`);
      parts.push(`深层需求：${character.drives.need}`);
      if (character.drives.fear) {
        parts.push(`恐惧：${character.drives.fear}`);
      }
      if (character.drives.secret) {
        parts.push(`秘密：${character.drives.secret}`);
      }
      if (character.drives.taboo.length > 0) {
        parts.push(`禁忌：${character.drives.taboo.join('、')}`);
      }
    }
    if (character.personalityModel) {
      if (character.personalityModel.innerContradictions.length > 0) {
        parts.push(`内在矛盾：${character.personalityModel.innerContradictions.join('、')}`);
      }
      if (character.personalityModel.moralBoundary.length > 0) {
        parts.push(`道德边界：${character.personalityModel.moralBoundary.join('、')}`);
      }
    }
    if (character.speechDNA) {
      parts.push(`语言节奏：${character.speechDNA.tempo}`);
      if (character.speechDNA.tone.length > 0) {
        parts.push(`语气特征：${character.speechDNA.tone.join('、')}`);
      }
    }
    if (character.abilities.length > 0) {
      parts.push(`能力：${character.abilities.join('、')}`);
    }
    if (character.arc) {
      parts.push(`角色弧线：${character.arc}`);
    }
    if (character.currentState) {
      parts.push(`当前状态：${character.currentState}`);
    }
    if (character.tags.length > 0) {
      parts.push(`标签：${character.tags.join('、')}`);
    }

    await store.indexText({
      category: 'character',
      entityId: character.id,
      text: parts.join('\n'),
    });
  }

  /**
   * 索引章节内容
   */
  async indexChapter(novelId: string, chapterNumber: number, content: string): Promise<void> {
    const store = await this.getStore(novelId);
    await store.indexText({
      category: 'chapter',
      entityId: chapterNumber.toString(),
      text: content,
      chapterNumber,
    });
  }

  private buildFactChapterText(chapterNumber: number, factGraph: FactGraph): string {
    const parts: string[] = [
      `【第${chapterNumber}章事实图谱】`,
    ];

    const factEvents = (factGraph.factEvents ?? []).filter(item => item.chapterNumber === chapterNumber);
    if (factEvents.length > 0) {
      parts.push(
        `统一事件流：${factEvents
          .map(item => `${item.eventType}:${item.entityName}${item.detail ? `(${item.detail})` : ''}${item.evidence ? `【${item.evidence}】` : ''}`)
          .join('；')}`,
      );
    }

    const appearances = factGraph.characterAppearances.filter(item => item.chapterNumber === chapterNumber);
    if (appearances.length > 0) {
      parts.push(
        `角色提及：${appearances
          .map(item => `${item.characterName}:${item.mentionType}${item.action ? `:${item.action}` : ''}${item.location ? `@${item.location}` : ''}${item.evidence ? `（${item.evidence}）` : ''}`)
          .join('；')}`,
      );
    }

    const timelineEvents = factGraph.timelineEvents.filter(item => item.chapterNumber === chapterNumber);
    if (timelineEvents.length > 0) {
      parts.push(
        `时间线事件：${timelineEvents
          .map(item => `${item.summary}${item.timeMarker ? ` [${item.timeMarker}]` : ''}${item.isFlashback ? ' [闪回]' : ''}${item.evidence ? `（${item.evidence}）` : ''}`)
          .join('；')}`,
      );
    }

    const locationVisits = factGraph.locationVisits.filter(item => item.chapterNumber === chapterNumber);
    if (locationVisits.length > 0) {
      parts.push(`地点访问：${locationVisits.map(item => `${item.characterName}→${item.location}`).join('；')}`);
    }

    const itemTimeline = factGraph.itemTimeline.filter(item => item.chapterNumber === chapterNumber);
    if (itemTimeline.length > 0) {
      parts.push(`物品状态：${itemTimeline.map(item => `${item.itemName}:${item.status}${item.holderName ? `(${item.holderName})` : ''}`).join('；')}`);
    }

    const relationshipChanges = factGraph.relationshipChanges.filter(item => item.chapterNumber === chapterNumber);
    if (relationshipChanges.length > 0) {
      parts.push(
        `关系变化：${relationshipChanges
          .map(item => `${item.sourceCharacterName}→${item.targetCharacterName}:${item.newRelation}${item.trigger ? `（触发:${item.trigger}）` : ''}`)
          .join('；')}`,
      );
    }

    const stateChanges = factGraph.characterStateChanges.filter(item => item.chapterNumber === chapterNumber);
    if (stateChanges.length > 0) {
      parts.push(
        `角色状态变化：${stateChanges
          .map(item => `${item.characterName}:${item.previousState || 'unknown'}→${item.newState}[${item.certainty}/${item.sourceType}]${item.detail ? `（${item.detail}）` : ''}${item.evidence ? `【${item.evidence}】` : ''}`)
          .join('；')}`,
      );
    }

    return parts.length > 1 ? parts.join('\n') : '';
  }

  async indexFactChapter(novelId: string, chapterNumber: number, factGraph: FactGraph): Promise<void> {
    const store = await this.getStore(novelId);
    const text = this.buildFactChapterText(chapterNumber, factGraph);
    if (!text) {
      await store.removeEntity('fact', chapterNumber.toString());
      return;
    }
    await store.indexText({
      category: 'fact',
      entityId: chapterNumber.toString(),
      text,
      chapterNumber,
    });
  }

  async indexFactGraph(novelId: string, factGraph: FactGraph): Promise<void> {
    const chapterNumbers = collectFactChapterNumbers(factGraph);
    for (const chapterNumber of chapterNumbers) {
      await this.indexFactChapter(novelId, chapterNumber, factGraph);
    }
  }

  async indexPlotThreadSnapshot(novelId: string, snapshot: PlotThreadSnapshot): Promise<void> {
    const store = await this.getStore(novelId);
    const parts: string[] = [
      `【情节线快照】${snapshot.threadName}`,
      `状态：${snapshot.status}`,
      `章节：第${snapshot.chapterNumber}章`,
    ];
    if (snapshot.detail) {
      parts.push(`细节：${snapshot.detail}`);
    }
    if (snapshot.dormantChapters > 0) {
      parts.push(`已休眠章节数：${snapshot.dormantChapters}`);
    }
    await store.indexText({
      category: 'thread',
      entityId: buildThreadEntityId(snapshot),
      text: parts.join('\n'),
      chapterNumber: snapshot.chapterNumber,
    });
  }

  async indexPlotThreadSnapshots(novelId: string, snapshots: PlotThreadSnapshot[]): Promise<void> {
    for (const snapshot of snapshots) {
      await this.indexPlotThreadSnapshot(novelId, snapshot);
    }
  }

  async indexCharacterStateSnapshot(
    novelId: string,
    snapshot: CharacterStateSnapshot,
    characterName?: string,
  ): Promise<void> {
    const store = await this.getStore(novelId);
    const parts: string[] = [
      `【角色状态快照】${characterName ?? snapshot.characterId}`,
      `章节：第${snapshot.chapterNumber}章`,
      `情绪：${snapshot.emotionState.primary}（强度:${snapshot.emotionState.intensity}）`,
      `目标进度：${snapshot.goalProgress}`,
      `压力：${snapshot.stress}`,
    ];
    if (snapshot.emotionState.trigger) {
      parts.push(`情绪触发：${snapshot.emotionState.trigger}`);
    }
    if (snapshot.beliefShift) {
      parts.push(`信念变化：${snapshot.beliefShift}`);
    }
    if (snapshot.trustChanges.length > 0) {
      parts.push(`信任变化：${snapshot.trustChanges.map(item => `${item.targetId}:${item.delta}${item.reason ? `(${item.reason})` : ''}`).join('；')}`);
    }
    if (snapshot.evidence.length > 0) {
      parts.push(`证据：${snapshot.evidence.map(item => `段落${item.paragraphIdx}${item.reason ? `(${item.reason})` : ''}`).join('；')}`);
    }
    if (snapshot.isCritical) {
      parts.push('⚠关键事件');
    }

    await store.indexText({
      category: 'character_state',
      entityId: `${snapshot.characterId}:ch${snapshot.chapterNumber}`,
      text: parts.join('\n'),
      chapterNumber: snapshot.chapterNumber,
      isCritical: snapshot.isCritical,
    });
  }

  async indexCharacterStateSnapshots(
    novelId: string,
    snapshots: CharacterStateSnapshot[],
    characterNameMap?: ReadonlyMap<string, string>,
  ): Promise<void> {
    for (const snapshot of snapshots) {
      await this.indexCharacterStateSnapshot(
        novelId,
        snapshot,
        characterNameMap?.get(snapshot.characterId),
      );
    }
  }

  private async searchAndFormatContext(
    novelId: string,
    query: string,
    options: {
      category: string;
      limit: number;
      currentChapter?: number;
      decayFactor?: number;
      mmr?: { enabled: boolean; lambda: number };
    },
  ): Promise<string> {
    const store = await this.getStore(novelId);
    const start = Date.now();
    const results = await store.search(query, options);
    this.logRetrieval(novelId, {
      query,
      category: options.category,
      resultCount: results.length,
      topScores: results.slice(0, 3).map(r => r.score ?? 0),
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
    return this.formatResults(results);
  }

  /**
   * 搜索世界观相关上下文
   * 返回拼接后的文本，可直接作为 prompt 上下文
   */
  async searchWorldContext(novelId: string, query: string, limit: number = 5): Promise<string> {
    return this.searchAndFormatContext(novelId, query, {
      category: 'world',
      limit,
    });
  }

  /**
   * 搜索角色相关上下文
   */
  async searchCharacterContext(novelId: string, query: string, limit: number = 5): Promise<string> {
    return this.searchAndFormatContext(novelId, query, {
      category: 'character',
      limit,
    });
  }

  /**
   * 搜索章节相关上下文
   * 可排除指定章节（避免当前章节自引用）
   */
  async searchChapterContext(
    novelId: string,
    query: string,
    excludeChapter?: number,
    limit: number = 5
  ): Promise<string> {
    const store = await this.getStore(novelId);
    const start = Date.now();
    const results = await store.search(query, {
      category: 'chapter',
      limit: excludeChapter !== undefined ? limit + 1 : limit,
      currentChapter: excludeChapter,
    });

    const filtered = excludeChapter !== undefined
      ? results.filter(r => r.entityId !== excludeChapter.toString())
      : results;

    const final = filtered.slice(0, limit);
    this.logRetrieval(novelId, {
      query, category: 'chapter', resultCount: final.length,
      topScores: final.slice(0, 3).map(r => r.score ?? 0),
      durationMs: Date.now() - start, timestamp: new Date().toISOString(),
    });
    return this.formatResults(final);
  }

  /**
   * 搜索所有分类的上下文
   */
  async searchAll(novelId: string, query: string, limit: number = 10): Promise<string> {
    const store = await this.getStore(novelId);
    const results = await store.search(query, { limit });
    return this.formatResults(results);
  }

  /**
   * 关闭数据库连接
   */
  close(novelId?: string): void {
    if (novelId) {
      const cached = this.stores.get(novelId);
      if (!cached) return;
      cached.store.close();
      this.stores.delete(novelId);
      return;
    }

    for (const cached of this.stores.values()) {
      cached.store.close();
    }
    this.stores.clear();
  }

  getVectorStatus(novelId: string): 'enabled' | 'disabled' | 'not_initialized' {
    const cached = this.stores.get(novelId);
    if (!cached) return 'not_initialized';
    return cached.store.isVectorEnabled() ? 'enabled' : 'disabled';
  }

  getVectorStatusDetail(novelId: string): { status: 'enabled' | 'disabled' | 'not_initialized'; reason?: string } {
    const cached = this.stores.get(novelId);
    if (!cached) return { status: 'not_initialized' };
    const status = cached.store.getVectorStatus();
    return status.enabled
      ? { status: 'enabled' }
      : { status: 'disabled', reason: status.reason };
  }

  /**
   * 将搜索结果格式化为可读文本
   */
  private formatResults(results: SearchResult[]): string {
    if (results.length === 0) {
      return '';
    }

    const categoryLabels: Record<string, string> = {
      world: '世界观',
      character: '角色',
      chapter: '章节',
      digest: '章节摘要',
      arc: '弧线摘要',
      fact: '事实图谱',
      thread: '情节线快照',
      character_state: '角色状态快照',
    };

    return results
      .map(r => {
        const label = categoryLabels[r.category] ?? r.category;
        const header = (r.category === 'chapter' || r.category === 'digest' || r.category === 'fact')
          ? `[${label} 第${r.entityId}章]`
          : `[${label}]`;
        return `${header}\n${r.text}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * 获取记忆统计信息
   */
  async getMemoryStats(novelId: string): Promise<{
    totalChunks: number;
    categories: Record<string, number>;
    vectorEnabled: boolean;
    initialized: boolean;
  }> {
    const store = await this.getStoreIfPresent(novelId);
    if (!store) {
      return { totalChunks: 0, categories: {}, vectorEnabled: false, initialized: false };
    }
    const stats = await store.getStats();
    return { ...stats, initialized: true };
  }

  async verifyStorageHealth(novelId: string): Promise<{ ok: boolean; reason?: string; initialized: boolean }> {
    const store = await this.getStoreIfPresent(novelId);
    if (!store) {
      return { ok: true, initialized: false };
    }
    const result = await store.verifyReadable();
    return {
      ok: result.ok,
      reason: result.reason,
      initialized: true,
    };
  }

  /**
   * 获取“源数据 vs 向量索引”覆盖度，用于诊断记忆是否完整生效。
   */
  async getMemoryCoverage(novelId: string): Promise<MemoryCoverage> {
    const contentDir = resolveNovelContentDir(this.novelsDir, novelId);
    const worldIds = readJsonIds(path.join(contentDir, 'world.json'));
    const characterIds = readJsonIds(path.join(contentDir, 'characters.json'));
    const chapterNumbers = readChapterNumbers(contentDir);
    const factChapterNumbers = readFactChapterNumbers(contentDir);
    const threadEntityIds = readPlotThreadEntityIds(contentDir);
    const characterStateIds = readCharacterStateEntityIds(contentDir);

    const sourceWorldSet = new Set(worldIds);
    const sourceCharacterSet = new Set(characterIds);
    const sourceChapterSet = new Set(chapterNumbers);
    const sourceFactChapterSet = new Set(factChapterNumbers);
    const sourceThreadEntitySet = new Set(threadEntityIds);
    const sourceCharacterStateSet = new Set(characterStateIds);

    const store = await this.getStoreIfPresent(novelId);
    if (!store) {
      const source = {
        worldCount: sourceWorldSet.size,
        characterCount: sourceCharacterSet.size,
        chapterCount: sourceChapterSet.size,
        factChapterCount: sourceFactChapterSet.size,
        threadSnapshotCount: sourceThreadEntitySet.size,
        characterStateCount: sourceCharacterStateSet.size,
      };
      return {
        novelId,
        source,
        indexed: {
          worldCount: 0,
          characterCount: 0,
          chapterCount: 0,
          digestCount: 0,
          arcCount: 0,
          factCount: 0,
          threadCount: 0,
          characterStateCount: 0,
          chunkStats: { totalChunks: 0, categories: {} },
        },
        missing: {
          chapterNumbers: [...sourceChapterSet].sort((a, b) => a - b),
          worldIds: [...sourceWorldSet],
          characterIds: [...sourceCharacterSet],
          factChapterNumbers: [...sourceFactChapterSet].sort((a, b) => a - b),
          threadEntityIds: [...sourceThreadEntitySet],
          characterStateIds: [...sourceCharacterStateSet],
        },
        stale: {
          worldIds: [],
          characterIds: [],
          factChapterNumbers: [],
          threadEntityIds: [],
          characterStateIds: [],
        },
        readiness: buildMemorySourceReadiness(source),
        complete: false,
      };
    }

    const [
      stats,
      indexedWorldIds,
      indexedCharacterIds,
      indexedChapterNumbers,
      indexedDigestIds,
      indexedArcIds,
      indexedFactIds,
      indexedThreadIds,
      indexedCharacterStateIds,
    ] = await Promise.all([
      store.getStats(),
      store.getDistinctEntityIds('world'),
      store.getDistinctEntityIds('character'),
      store.getDistinctEntityIds('chapter'),
      store.getDistinctEntityIds('digest'),
      store.getDistinctEntityIds('arc'),
      store.getDistinctEntityIds('fact'),
      store.getDistinctEntityIds('thread'),
      store.getDistinctEntityIds('character_state'),
    ]);

    const indexedWorldSet = new Set(indexedWorldIds);
    const indexedCharacterSet = new Set(indexedCharacterIds);
    const indexedChapterSet = new Set(
      indexedChapterNumbers
        .map(item => Number.parseInt(item, 10))
        .filter(num => Number.isFinite(num) && num > 0),
    );
    const indexedFactChapterSet = new Set(
      indexedFactIds
        .map(item => Number.parseInt(item, 10))
        .filter(num => Number.isFinite(num) && num > 0),
    );
    const indexedThreadSet = new Set(indexedThreadIds);
    const indexedCharacterStateSet = new Set(indexedCharacterStateIds);

    const missingWorldIds = [...sourceWorldSet].filter(id => !indexedWorldSet.has(id));
    const missingCharacterIds = [...sourceCharacterSet].filter(id => !indexedCharacterSet.has(id));
    const missingChapterNumbers = [...sourceChapterSet]
      .filter(ch => !indexedChapterSet.has(ch))
      .sort((a, b) => a - b);
    const missingFactChapterNumbers = [...sourceFactChapterSet]
      .filter(ch => !indexedFactChapterSet.has(ch))
      .sort((a, b) => a - b);
    const missingThreadEntityIds = [...sourceThreadEntitySet]
      .filter(id => !indexedThreadSet.has(id));
    const missingCharacterStateIds = [...sourceCharacterStateSet]
      .filter(id => !indexedCharacterStateSet.has(id));

    const staleWorldIds = [...indexedWorldSet].filter(id => !sourceWorldSet.has(id));
    const staleCharacterIds = [...indexedCharacterSet].filter(id => !sourceCharacterSet.has(id));
    const staleFactChapterNumbers = [...indexedFactChapterSet]
      .filter(ch => !sourceFactChapterSet.has(ch))
      .sort((a, b) => a - b);
    const staleThreadEntityIds = [...indexedThreadSet]
      .filter(id => !sourceThreadEntitySet.has(id));
    const staleCharacterStateIds = [...indexedCharacterStateSet]
      .filter(id => !sourceCharacterStateSet.has(id));

    const source = {
      worldCount: sourceWorldSet.size,
      characterCount: sourceCharacterSet.size,
      chapterCount: sourceChapterSet.size,
      factChapterCount: sourceFactChapterSet.size,
      threadSnapshotCount: sourceThreadEntitySet.size,
      characterStateCount: sourceCharacterStateSet.size,
    };
    const readiness = buildMemorySourceReadiness(source);
    const complete = readiness.sourceDomainsReady
      && missingWorldIds.length === 0
      && missingCharacterIds.length === 0
      && missingChapterNumbers.length === 0
      && missingFactChapterNumbers.length === 0
      && missingThreadEntityIds.length === 0
      && missingCharacterStateIds.length === 0;

    return {
      novelId,
      source,
      indexed: {
        worldCount: indexedWorldSet.size,
        characterCount: indexedCharacterSet.size,
        chapterCount: indexedChapterSet.size,
        digestCount: indexedDigestIds.length,
        arcCount: indexedArcIds.length,
        factCount: indexedFactChapterSet.size,
        threadCount: indexedThreadSet.size,
        characterStateCount: indexedCharacterStateSet.size,
        chunkStats: {
          totalChunks: stats.totalChunks,
          categories: stats.categories,
        },
      },
      missing: {
        chapterNumbers: missingChapterNumbers,
        worldIds: missingWorldIds,
        characterIds: missingCharacterIds,
        factChapterNumbers: missingFactChapterNumbers,
        threadEntityIds: missingThreadEntityIds,
        characterStateIds: missingCharacterStateIds,
      },
      stale: {
        worldIds: staleWorldIds,
        characterIds: staleCharacterIds,
        factChapterNumbers: staleFactChapterNumbers,
        threadEntityIds: staleThreadEntityIds,
        characterStateIds: staleCharacterStateIds,
      },
      readiness,
      complete,
    };
  }

  /**
   * 清除指定分类的记忆数据
   */
  async clearCategory(novelId: string, category: string): Promise<void> {
    const store = await this.getStoreIfPresent(novelId);
    if (!store) return;
    await store.clearCategory(category);
  }

  async removeEntity(novelId: string, category: string, entityId: string): Promise<void> {
    const store = await this.getStoreIfPresent(novelId);
    if (!store) return;
    await store.removeEntity(category, entityId);
  }

  /**
   * 优化存储：合并碎片、清理旧版本
   */
  async optimize(novelId: string): Promise<{ fragmentsRemoved: number; bytesRemoved: number }> {
    const zero = { fragmentsRemoved: 0, bytesRemoved: 0 };
    const store = await this.getStoreIfPresent(novelId);
    if (!store) return zero;
    return store.optimize();
  }

  /**
   * 创建向量索引（IVF_PQ），行数不足或已有索引时跳过
   */
  async createVectorIndex(novelId: string): Promise<boolean> {
    const store = await this.getStoreIfPresent(novelId);
    if (!store) return false;
    return store.createVectorIndex();
  }

  /**
   * 获取存储统计信息
   */
  async getStorageStats(novelId: string): Promise<{
    numRows: number;
    numFragments: number;
    totalBytes: number;
    hasVectorIndex: boolean;
  }> {
    const store = await this.getStoreIfPresent(novelId);
    if (!store) return { numRows: 0, numFragments: 0, totalBytes: 0, hasVectorIndex: false };
    return store.getStorageStats();
  }

  /**
   * 索引章节结构化摘要
   */
  async indexChapterDigest(
    novelId: string,
    chapterNumber: number,
    digest: ChapterDigest,
  ): Promise<void> {
    const store = await this.getStore(novelId);

    const parts: string[] = [
      `【第${chapterNumber}章摘要】`,
      digest.plotSummary,
    ];

    if (digest.keyEvents.length > 0) {
      parts.push(`关键事件：${digest.keyEvents.join('；')}`);
    }
    if (digest.characterStateChanges.length > 0) {
      parts.push(`角色变化：${digest.characterStateChanges.map(c => `${c.name}：${c.change}`).join('；')}`);
    }
    if (digest.worldStateChanges.length > 0) {
      parts.push(`世界变化：${digest.worldStateChanges.map(w => `${w.entity}：${w.change}`).join('；')}`);
    }
    if (digest.unresolvedThreads.length > 0) {
      parts.push(`悬念：${digest.unresolvedThreads.join('；')}`);
    }
    if (digest.causalLinks.length > 0) {
      parts.push(`因果链：${digest.causalLinks.map(l => `${l.event} → ${l.effect}`).join('；')}`);
    }

    await store.indexText({
      category: 'digest',
      entityId: chapterNumber.toString(),
      text: parts.join('\n'),
      chapterNumber,
    });
  }

  /**
   * 搜索章节摘要上下文（启用时间衰减）
   */
  async searchDigestContext(
    novelId: string,
    query: string,
    currentChapter?: number,
    mmr?: { enabled: boolean; lambda: number },
    limit: number = 5,
  ): Promise<string> {
    return this.searchAndFormatContext(novelId, query, {
      category: 'digest',
      limit,
      currentChapter,
      decayFactor: 0.05,
      mmr,
    });
  }

  /**
   * 多查询检索：多个查询去重合并，按 score 排序取 top-K
   */
  async searchMultiQuery(
    novelId: string,
    queries: string[],
    options: { category?: string; limit?: number; currentChapter?: number } = {},
  ): Promise<string> {
    const store = await this.getStore(novelId);
    const limit = options.limit ?? 5;
    const decayFactor = options.category
      ? (CATEGORY_DECAY_FACTORS[options.category] ?? 0.05)
      : 0.05;
    const seen = new Set<string>();
    const allResults: SearchResult[] = [];
    const start = Date.now();

    for (const query of queries) {
      if (!query.trim()) continue;
      const results = await store.search(query, {
        category: options.category,
        limit,
        currentChapter: options.currentChapter,
        decayFactor,
      });
      for (const r of results) {
        const key = `${r.category}:${r.entityId}:${r.text.slice(0, 50)}`;
        if (!seen.has(key)) {
          seen.add(key);
          allResults.push(r);
        }
      }
    }

    // MMR 重排序：多查询合并容易产出重复结果，用 MMR 保证多样性
    const reranked = mmrRerank(allResults, {
      getId: r => `${r.category}:${r.entityId}:${r.text.slice(0, 80)}`,
      getContent: r => r.text,
      getScore: r => r.score,
    }, { enabled: true, lambda: 0.7 });
    const finalResults = reranked.slice(0, limit);

    this.logRetrieval(novelId, {
      query: queries.join(' | '),
      category: options.category ?? 'multi',
      resultCount: finalResults.length,
      topScores: finalResults.slice(0, 3).map(r => r.score ?? 0),
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });

    return this.formatResults(finalResults);
  }

  /**
   * 索引弧线摘要
   */
  async indexArcSummary(
    novelId: string,
    arc: ArcSummary,
  ): Promise<void> {
    const store = await this.getStore(novelId);

    const parts: string[] = [
      `【弧线${arc.arcNumber}：第${arc.chapterRange.start}-${arc.chapterRange.end}章】`,
      arc.plotProgression,
    ];

    if (arc.characterArcs.length > 0) {
      parts.push(`角色弧线：${arc.characterArcs.map(c => `${c.name}：${c.progression}`).join('；')}`);
    }
    if (arc.worldChanges) {
      parts.push(`世界变化：${arc.worldChanges}`);
    }
    if (arc.unresolvedThreads.length > 0) {
      parts.push(`未解悬念：${arc.unresolvedThreads.join('；')}`);
    }
    if (arc.keyTurningPoints.length > 0) {
      parts.push(`关键转折：${arc.keyTurningPoints.join('；')}`);
    }

    await store.indexText({
      category: 'arc',
      entityId: `arc-${arc.arcNumber}`,
      text: parts.join('\n'),
      chapterNumber: arc.chapterRange.end,
    });
  }

  /**
   * 搜索弧线摘要上下文（启用时间衰减）
   */
  async searchArcContext(
    novelId: string,
    query: string,
    currentChapter?: number,
    mmr?: { enabled: boolean; lambda: number },
    limit: number = 3,
  ): Promise<string> {
    return this.searchAndFormatContext(novelId, query, {
      category: 'arc',
      limit,
      currentChapter,
      decayFactor: 0.02,
      mmr,
    });
  }

  async searchFactContext(
    novelId: string,
    query: string,
    currentChapter?: number,
    mmr?: { enabled: boolean; lambda: number },
    limit: number = 4,
  ): Promise<string> {
    return this.searchAndFormatContext(novelId, query, {
      category: 'fact',
      limit,
      currentChapter,
      decayFactor: 0.04,
      mmr,
    });
  }

  async searchThreadContext(
    novelId: string,
    query: string,
    currentChapter?: number,
    mmr?: { enabled: boolean; lambda: number },
    limit: number = 4,
  ): Promise<string> {
    return this.searchAndFormatContext(novelId, query, {
      category: 'thread',
      limit,
      currentChapter,
      decayFactor: 0.04,
      mmr,
    });
  }

  async searchCharacterStateContext(
    novelId: string,
    query: string,
    currentChapter?: number,
    mmr?: { enabled: boolean; lambda: number },
    limit: number = 4,
  ): Promise<string> {
    return this.searchAndFormatContext(novelId, query, {
      category: 'character_state',
      limit,
      currentChapter,
      decayFactor: 0.05,
      mmr,
    });
  }

  /**
   * 角色维度聚合检索：按 entityId 直接查询角色档案和状态快照，
   * 无需 embedding 调用，适用于获取特定角色的完整状态速览。
   */
  async getCharacterRecap(
    novelId: string,
    characterId: string,
    currentChapter?: number,
  ): Promise<string> {
    const store = await this.getStoreIfPresent(novelId);
    if (!store) return '';

    const [profileChunks, stateChunks] = await Promise.all([
      store.getEntityTexts('character', characterId),
      store.getEntityTexts('character_state', characterId, 50, true),
    ]);

    if (profileChunks.length === 0 && stateChunks.length === 0) return '';

    const parts: string[] = [];

    // 角色档案（不衰减）
    if (profileChunks.length > 0) {
      parts.push(`【角色档案】${profileChunks.map(c => c.text).join(' ')}`);
    }

    // 状态快照（按距离截断）
    if (stateChunks.length > 0 && currentChapter) {
      for (const chunk of stateChunks) {
        if (chunk.chapterNumber <= 0) continue;
        const decay = calculateDecayFactor(currentChapter, chunk.chapterNumber);
        if (decay >= 0.6) {
          parts.push(`【第${chunk.chapterNumber}章状态】${chunk.text}`);
        } else if (decay >= 0.3) {
          // 截断至前 200 字符
          const truncated = chunk.text.length > 200
            ? chunk.text.slice(0, 200) + '…'
            : chunk.text;
          parts.push(`【第${chunk.chapterNumber}章状态】${truncated}`);
        }
        // decay < 0.3：跳过远期非关键状态
      }
    } else if (stateChunks.length > 0) {
      // 无 currentChapter 时取最近 3 条（过滤无效章节号）
      for (const chunk of stateChunks.filter(c => c.chapterNumber > 0).slice(-3)) {
        parts.push(`【第${chunk.chapterNumber}章状态】${chunk.text}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * 获取已覆盖的弧线编号列表
   */
  async getArcCoverage(novelId: string): Promise<number[]> {
    const store = await this.getStore(novelId);
    try {
      const results = await store.search('弧线', { category: 'arc', limit: 100 });
      const arcNumbers = new Set<number>();
      for (const r of results) {
        const match = r.entityId.match(/^arc-(\d+)$/);
        if (match) arcNumbers.add(Number(match[1]));
      }
      return [...arcNumbers].sort((a, b) => a - b);
    } catch {
      return [];
    }
  }

  /**
   * 调试搜索
   */
  async debugSearch(
    novelId: string,
    query: string,
    category?: string,
    limit = 10,
  ): Promise<SearchResult[]> {
    const store = await this.getStore(novelId);
    return store.search(query, { category, limit });
  }

  // ────────────────────────── Orchestrator 桥接方法 ──────────────────────────

  /**
   * 原始向量搜索（供编排器适配器使用）。
   * 返回结构化 SearchResult[]，不做格式化。
   */
  async rawSearch(
    novelId: string,
    query: string,
    options: {
      category?: string;
      limit?: number;
      currentChapter?: number;
      decayFactor?: number;
    },
  ): Promise<SearchResult[]> {
    const store = await this.getStore(novelId);
    return store.search(query, options);
  }

  /**
   * 按 category + entityId 直接查询文本（供编排器角色速览使用）。
   */
  async rawGetEntityTexts(
    novelId: string,
    category: string,
    entityId: string,
    limit: number = 50,
    prefixMatch: boolean = false,
  ): Promise<Array<{ text: string; chapterNumber: number }>> {
    const store = await this.getStore(novelId);
    return store.getEntityTexts(category, entityId, limit, prefixMatch);
  }
}
