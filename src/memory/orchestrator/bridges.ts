/**
 * 编排器桥接层
 *
 * 将现有的 NovelMemory、StoryStateManager、WorldContextV2 包装为
 * 编排器所需的 RawVectorSearch / StoryStateData / WorldCardData 接口。
 *
 * 这是 Phase 2 的核心：让独立开发的编排器能接入真实数据源。
 */

import type { NovelMemory } from '../novel-memory.js';
import type { StoryStateManager } from '../../novel/story-state-manager.js';
import type { WorldEntry } from '../../novel/types.js';
import { selectWorldCardsV2 } from '../../pipeline/world-context-v2.js';
import { isCriticalInfo } from '../../pipeline/memory-decay.js';
import type { RawVectorSearch, StoryStateData, WorldCardData } from './adapters.js';
import type { SearchResult } from '../vector-store.js';

// ────────────────────────────── RawVectorSearch 桥接 ──────────────────────────────

/**
 * 将 NovelMemory 包装为 RawVectorSearch 接口。
 * 使用 NovelMemory 上新增的 rawSearch / rawGetEntityTexts 公开方法。
 */
export class NovelMemorySearchBridge implements RawVectorSearch {
  constructor(private readonly memory: NovelMemory) {}

  async search(
    novelId: string,
    query: string,
    options: {
      category?: string;
      limit?: number;
      currentChapter?: number;
      decayFactor?: number;
    },
  ): Promise<SearchResult[]> {
    return this.memory.rawSearch(novelId, query, options);
  }

  async getEntityTexts(
    novelId: string,
    category: string,
    entityId: string,
    limit: number = 50,
    prefixMatch: boolean = false,
  ): Promise<Array<{ text: string; chapterNumber: number }>> {
    return this.memory.rawGetEntityTexts(novelId, category, entityId, limit, prefixMatch);
  }
}

// ────────────────────────────── StoryStateData 桥接 ──────────────────────────────

/**
 * 将 StoryStateManager 包装为 StoryStateData 接口。
 * 将 StoryState 的 snapshots / arcs / megaArcs 以结构化数据返回。
 */
export class StoryStateBridge implements StoryStateData {
  constructor(private readonly manager: StoryStateManager) {}

  async getSnapshots(novelId: string): Promise<Array<{
    chapterNumber: number;
    summary: string;
    hardConstraints?: string[];
    isCritical?: boolean;
  }>> {
    const state = await this.manager.getState(novelId);
    return state.snapshots.map(snap => ({
      chapterNumber: snap.chapterNumber,
      summary: snap.chapterSummary || this.buildSnapshotSummary(snap),
      hardConstraints: snap.nextChapterConstraints.length > 0
        ? snap.nextChapterConstraints
        : undefined,
      isCritical: this.isSnapshotCritical(snap),
    }));
  }

  async getCompressedArcs(novelId: string): Promise<Array<{
    chapterRange: string;
    summary: string;
  }>> {
    const state = await this.manager.getState(novelId);
    return state.compressedArcs.map(arc => ({
      chapterRange: `${arc.chapterRange.start}-${arc.chapterRange.end}`,
      summary: arc.summary,
    }));
  }

  async getMegaArcs(novelId: string): Promise<Array<{
    chapterRange: string;
    summary: string;
  }>> {
    const state = await this.manager.getState(novelId);
    return (state.megaArcs ?? []).map(arc => ({
      chapterRange: `${arc.chapterRange.start}-${arc.chapterRange.end}`,
      summary: arc.summary,
    }));
  }

  /**
   * 从快照字段拼接摘要（当 chapterSummary 为空时的回退）。
   */
  private buildSnapshotSummary(snap: {
    chapterNumber: number;
    characters: Array<{ name: string; emotionalState: string; currentGoal: string; alive: boolean }>;
    world: { timelineMarker: string };
    plot: { activeThreads: Array<{ threadName: string; status: string }> };
  }): string {
    const parts: string[] = [];

    // 角色状态摘要
    const charSummaries = snap.characters
      .slice(0, 5)
      .map(c => {
        const status = c.alive ? c.emotionalState : '已死亡';
        return `${c.name}(${status})`;
      });
    if (charSummaries.length > 0) {
      parts.push(`角色：${charSummaries.join('、')}`);
    }

    // 时间线
    if (snap.world.timelineMarker) {
      parts.push(`时间：${snap.world.timelineMarker}`);
    }

    // 活跃情节线
    const threads = snap.plot.activeThreads.slice(0, 3).map(t => t.threadName);
    if (threads.length > 0) {
      parts.push(`情节线：${threads.join('、')}`);
    }

    return parts.join('；') || `第${snap.chapterNumber}章快照`;
  }

  /**
   * 检测快照是否包含关键事件（死亡、突破等）。
   */
  private isSnapshotCritical(snap: {
    characters: Array<{ alive: boolean; powerChange: string }>;
    chapterSummary: string;
  }): boolean {
    // 有角色死亡
    if (snap.characters.some(c => !c.alive)) return true;
    // 有能力变化（突破）
    if (snap.characters.some(c => c.powerChange && c.powerChange !== '')) return true;
    // 摘要中包含关键词
    return isCriticalInfo(snap.chapterSummary);
  }
}

// ────────────────────────────── WorldCardData 桥接 ──────────────────────────────

/**
 * 将 selectWorldCardsV2 包装为 WorldCardData 接口。
 * 需要从外部注入世界条目获取函数（避免直接依赖 NovelManager）。
 */
export class WorldCardBridge implements WorldCardData {
  constructor(
    private readonly getWorldEntries: (novelId: string) => Promise<WorldEntry[]>,
  ) {}

  async selectCards(params: {
    novelId: string;
    query: string;
    chapterNumber: number;
    topK?: number;
    memoryWorldContext?: string;
  }): Promise<Array<{
    id: string;
    name: string;
    category: string;
    score: number;
    summary: string;
    constraints: string[];
  }>> {
    const entries = await this.getWorldEntries(params.novelId);
    if (entries.length === 0) return [];

    const cards = selectWorldCardsV2({
      entries,
      query: params.query,
      chapterNumber: params.chapterNumber,
      topK: params.topK ?? 10,
      memoryWorldContext: params.memoryWorldContext,
    });

    return cards.map(card => ({
      id: card.id,
      name: card.name,
      category: card.category,
      score: card.score,
      summary: card.summary,
      constraints: card.constraints,
    }));
  }
}
