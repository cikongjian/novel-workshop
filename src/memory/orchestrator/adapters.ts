/**
 * 来源适配器
 *
 * 将各记忆来源的数据转换为统一 MemoryItem 格式。
 * 每个适配器通过依赖注入接收底层数据源，不直接依赖具体实现类。
 */

import type { SearchResult } from '../vector-store.js';
import { isCriticalInfo } from '../../pipeline/memory-decay.js';
import { computeFreshness } from './scoring.js';
import type {
  MemoryItem,
  MemorySource,
  MemorySourceAdapter,
  OrchestratorParams,
} from './types.js';

// ────────────────────────────── 依赖接口 ──────────────────────────────

/**
 * 原始向量搜索接口。
 * 返回结构化 SearchResult[]，而非已格式化的字符串。
 */
export interface RawVectorSearch {
  search(
    novelId: string,
    query: string,
    options: {
      category?: string;
      limit?: number;
      currentChapter?: number;
      decayFactor?: number;
    },
  ): Promise<SearchResult[]>;

  getEntityTexts(
    novelId: string,
    category: string,
    entityId: string,
    limit?: number,
    prefixMatch?: boolean,
  ): Promise<Array<{ text: string; chapterNumber: number }>>;
}

/**
 * 故事状态数据接口。
 * 直接返回结构化数据，不经过 buildStateContext 格式化。
 */
export interface StoryStateData {
  getSnapshots(novelId: string): Promise<Array<{
    chapterNumber: number;
    summary: string;
    hardConstraints?: string[];
    isCritical?: boolean;
  }>>;

  getCompressedArcs(novelId: string): Promise<Array<{
    chapterRange: string;
    summary: string;
  }>>;

  getMegaArcs(novelId: string): Promise<Array<{
    chapterRange: string;
    summary: string;
  }>>;
}

/**
 * 世界卡片数据接口。
 */
export interface WorldCardData {
  selectCards(params: {
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
  }>>;
}

// ────────────────────────────── 工具函数 ──────────────────────────────

/** 生成 MemoryItem ID */
function makeItemId(source: MemorySource, entityId: string): string {
  return `${source}:${entityId}`;
}

/** 截断过长文本 */
function truncateText(text: string, maxChars: number = 2000): string {
  if (text.length <= maxChars) return text;
  // 在句号处截断
  const cutoff = text.lastIndexOf('。', maxChars - 10);
  if (cutoff > maxChars * 0.5) {
    return text.slice(0, cutoff + 1);
  }
  return text.slice(0, maxChars - 3) + '…';
}

/**
 * 工程术语黑名单：这些词只应存在于软件系统/数据库中，
 * 绝不应出现在小说记忆上下文中。若记忆切片意外包含，
 * 直接剔除以防 Writer Agent 将其误当世界观素材。
 */
const ENGINEERING_TERM_PATTERNS = [
  /向量坐标/g, /数据库锚点/g, /嵌入锚点/g, /embedding anchor/g,
  /数据碎片/g, /数据残片/g, /shard/g, /fragment/g,
  /覆写/g, /数据覆写/g, /覆盖锚点/g, /overwrite/g,
  /时间戳/g, /timestamp/g, /握手记录/g, /握手/g,
  /IP地址/g, /未知IP/g, /来源追踪/g,
  /链路/g, /网络扫描/g, /数据扫描/g, /索引构建/g,
  /节点同步/g, /主从复制/g, /集群负载/g,
  /缓存失效/g, /队列积压/g, /回调函数/g,
  /触发器激活/g, /事件流/g, /管道过滤/g,
  /分片迁移/g, /副本同步/g, /路由网关/g,
  /代理隧道/g, /防火墙规则/g, /哈希签名/g,
  /证书认证/g, /授权审计/g, /监控告警/g,
  /指标阈值/g, /配额限流/g, /熔断降级/g,
  /幂等事务/g, /隔离持久化/g, /序列化/g,
  /编码压缩/g, /备份恢复/g, /部署发布/g,
  /回滚灰度/g, /蓝绿部署/g, /金丝雀发布/g,
  /A\/B测试/g, /埋点漏斗/g, /留存转化/g,
  /ARPU/g, /LTV/g, /DAU/g, /MAU/g,
  /PV/g, /UV/g, /跳出率/g, /点击率/g,
  /转化率/g, /ROI/g, /CPA/g, /CPC/g,
  /CPM/g, /CPS/g, /CPT/g, /CPD/g,
  /OCPM/g, /OCPC/g, /eCPM/g, /RPM/g,
];

/** 清洗记忆文本中的工程术语 */
function cleanEngineeringTerms(text: string): string {
  let cleaned = text;
  for (const pattern of ENGINEERING_TERM_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // 清理连续空白
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  return cleaned;
}

/**
 * 将 SearchResult 转换为 MemoryItem。
 * RRF score 范围约 [0, 0.033]，归一化到 [0, 1]。
 */
function searchResultToItem(
  result: SearchResult,
  source: MemorySource,
  currentChapter: number,
): MemoryItem {
  const text = cleanEngineeringTerms(truncateText(result.text));
  // RRF 归一化：最大 RRF score ≈ 2/(k+1) ≈ 0.033 for k=60
  // 使用 min(score * 30, 1) 近似归一化
  const normalizedRelevance = Math.min(result.score * 30, 1.0);
  const chapterNum = result.chapterNumber ?? 0;

  return {
    id: makeItemId(source, `${result.entityId}:${chapterNum}`),
    source,
    entityId: result.entityId,
    chapterNumber: chapterNum,
    text,
    charCount: text.length,
    relevance: normalizedRelevance,
    freshness: computeFreshness(chapterNum, currentChapter),
    isCritical: isCriticalInfo(result.text),
    unresolvedWeight: 0,
    provenance: `${result.category}/${result.entityId} score=${result.score.toFixed(4)}`,
  };
}

// ────────────────────────────── 向量检索适配器 ──────────────────────────────

/** 按 category 分类的向量搜索衰减因子 */
const CATEGORY_DECAY_FACTORS: Record<string, number> = {
  arc: 0.02,
  fact: 0.04,
  thread: 0.04,
  digest: 0.05,
  chapter: 0.05,
  character_state: 0.05,
  world: 0,
  character: 0,
};

/**
 * 向量检索适配器。
 * 对指定的 category 执行原始向量搜索，返回结构化 MemoryItem。
 */
export class VectorSearchAdapter implements MemorySourceAdapter {
  readonly name: string;
  readonly sources: readonly MemorySource[];
  private readonly category: string;
  private readonly source: MemorySource;
  private readonly limit: number;
  private readonly rawSearch: RawVectorSearch;

  constructor(params: {
    category: string;
    source: MemorySource;
    limit: number;
    rawSearch: RawVectorSearch;
  }) {
    this.category = params.category;
    this.source = params.source;
    this.limit = params.limit;
    this.rawSearch = params.rawSearch;
    this.name = `vector:${params.category}`;
    this.sources = [params.source];
  }

  async retrieve(params: OrchestratorParams): Promise<MemoryItem[]> {
    const decayFactor = CATEGORY_DECAY_FACTORS[this.category] ?? 0.05;
    const results = await this.rawSearch.search(
      params.novelId,
      params.userDirection,
      {
        category: this.category,
        limit: this.limit,
        currentChapter: params.chapterNumber,
        decayFactor,
      },
    );
    return results.map(r => searchResultToItem(r, this.source, params.chapterNumber));
  }
}

/**
 * 多查询向量检索适配器。
 * 将用户指引 + 大纲提取的角色名组合为多查询，提高召回率。
 */
export class MultiQueryVectorAdapter implements MemorySourceAdapter {
  readonly name: string;
  readonly sources: readonly MemorySource[];
  private readonly category: string;
  private readonly source: MemorySource;
  private readonly limit: number;
  private readonly rawSearch: RawVectorSearch;

  constructor(params: {
    category: string;
    source: MemorySource;
    limit: number;
    rawSearch: RawVectorSearch;
  }) {
    this.category = params.category;
    this.source = params.source;
    this.limit = params.limit;
    this.rawSearch = params.rawSearch;
    this.name = `multi-query:${params.category}`;
    this.sources = [params.source];
  }

  async retrieve(params: OrchestratorParams): Promise<MemoryItem[]> {
    const queries = [params.userDirection];
    if (params.outlineContent) {
      queries.push(params.outlineContent.slice(0, 500));
    }

    const decayFactor = CATEGORY_DECAY_FACTORS[this.category] ?? 0.05;
    const allResults: SearchResult[] = [];
    const seenKeys = new Set<string>();

    // 多查询并行，结果按 score 合并去重
    const queryResults = await Promise.all(
      queries.map(q =>
        this.rawSearch.search(params.novelId, q, {
          category: this.category,
          limit: this.limit,
          currentChapter: params.chapterNumber,
          decayFactor,
        }),
      ),
    );

    for (const results of queryResults) {
      for (const r of results) {
        const key = `${r.entityId}:${r.text.slice(0, 60)}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          allResults.push(r);
        }
      }
    }

    // 按 score 降序截取
    allResults.sort((a, b) => b.score - a.score);
    return allResults
      .slice(0, this.limit)
      .map(r => searchResultToItem(r, this.source, params.chapterNumber));
  }
}

// ────────────────────────────── 角色速览适配器 ──────────────────────────────

/**
 * 角色维度聚合适配器。
 * 为重点角色获取跨类别的完整状态速览。
 */
export class CharacterRecapAdapter implements MemorySourceAdapter {
  readonly name = 'character-recap';
  readonly sources: readonly MemorySource[] = ['character_recap'];
  private readonly rawSearch: RawVectorSearch;

  constructor(rawSearch: RawVectorSearch) {
    this.rawSearch = rawSearch;
  }

  async retrieve(params: OrchestratorParams): Promise<MemoryItem[]> {
    if (!params.focusCharacterIds || params.focusCharacterIds.length === 0) {
      return [];
    }

    const items: MemoryItem[] = [];

    for (const characterId of params.focusCharacterIds.slice(0, 3)) {
      // 查询 character 类别
      const profileTexts = await this.rawSearch.getEntityTexts(
        params.novelId, 'character', characterId, 5, false,
      );

      // 查询 character_state 类别（前缀匹配）
      const stateTexts = await this.rawSearch.getEntityTexts(
        params.novelId, 'character_state', characterId, 10, true,
      );

      const allTexts = [...profileTexts, ...stateTexts]
        .filter(t => t.chapterNumber > 0 || profileTexts.includes(t))
        .sort((a, b) => b.chapterNumber - a.chapterNumber);

      if (allTexts.length === 0) continue;

      // 合并为单条摘要
      const recapParts: string[] = [`【角色速览：${characterId}】`];
      for (const entry of allTexts.slice(0, 8)) {
        const label = entry.chapterNumber > 0 ? `第${entry.chapterNumber}章` : '基础档案';
        recapParts.push(`[${label}] ${entry.text.slice(0, 300)}`);
      }

      const text = truncateText(recapParts.join('\n'), 1500);
      const latestChapter = Math.max(...allTexts.map(t => t.chapterNumber), 0);

      items.push({
        id: makeItemId('character_recap', characterId),
        source: 'character_recap',
        entityId: characterId,
        chapterNumber: latestChapter,
        text,
        charCount: text.length,
        relevance: 0.8,
        freshness: computeFreshness(latestChapter, params.chapterNumber),
        isCritical: isCriticalInfo(text),
        unresolvedWeight: 0,
        provenance: `character_recap/${characterId} entries=${allTexts.length}`,
      });
    }

    return items;
  }
}

// ────────────────────────────── 故事状态适配器 ──────────────────────────────

/**
 * 故事状态适配器。
 * 将 StoryState 的 snapshots / arcs / mega-arcs / constraints 转为 MemoryItem。
 */
export class StoryStateAdapter implements MemorySourceAdapter {
  readonly name = 'story-state';
  readonly sources: readonly MemorySource[] = [
    'story_state:snapshot',
    'story_state:arc',
    'story_state:mega_arc',
    'story_state:constraint',
  ];
  private readonly storyState: StoryStateData;

  constructor(storyState: StoryStateData) {
    this.storyState = storyState;
  }

  async retrieve(params: OrchestratorParams): Promise<MemoryItem[]> {
    const [snapshots, arcs, megaArcs] = await Promise.all([
      this.storyState.getSnapshots(params.novelId),
      this.storyState.getCompressedArcs(params.novelId),
      this.storyState.getMegaArcs(params.novelId),
    ]);

    const items: MemoryItem[] = [];

    // Snapshots → 最近 5 个
    const recentSnapshots = snapshots
      .sort((a, b) => b.chapterNumber - a.chapterNumber)
      .slice(0, 5);

    for (const snap of recentSnapshots) {
      const text = truncateText(snap.summary);
      items.push({
        id: makeItemId('story_state:snapshot', `ch${snap.chapterNumber}`),
        source: 'story_state:snapshot',
        entityId: `ch${snap.chapterNumber}`,
        chapterNumber: snap.chapterNumber,
        text,
        charCount: text.length,
        relevance: 0.85,
        freshness: computeFreshness(snap.chapterNumber, params.chapterNumber),
        isCritical: snap.isCritical ?? false,
        unresolvedWeight: 0,
        provenance: `story_state/snapshot/ch${snap.chapterNumber}`,
      });

      // 硬约束独立为高优先级条目
      if (snap.hardConstraints && snap.hardConstraints.length > 0) {
        const constraintText = `⚠️ 第${snap.chapterNumber}章硬约束：\n${snap.hardConstraints.join('\n')}`;
        items.push({
          id: makeItemId('story_state:constraint', `ch${snap.chapterNumber}`),
          source: 'story_state:constraint',
          entityId: `constraint:ch${snap.chapterNumber}`,
          chapterNumber: snap.chapterNumber,
          text: constraintText,
          charCount: constraintText.length,
          relevance: 1.0,
          freshness: computeFreshness(snap.chapterNumber, params.chapterNumber),
          isCritical: true,
          unresolvedWeight: 0.8,
          provenance: `story_state/constraint/ch${snap.chapterNumber}`,
        });
      }
    }

    // Compressed arcs
    for (const arc of arcs) {
      const text = `【弧线 ${arc.chapterRange}】${arc.summary}`;
      const truncated = truncateText(text);
      // 从 chapterRange 提取最大章节号
      const chapterMatch = arc.chapterRange.match(/(\d+)/g);
      const maxChapter = chapterMatch
        ? Math.max(...chapterMatch.map(Number).filter(Number.isFinite))
        : 0;

      items.push({
        id: makeItemId('story_state:arc', arc.chapterRange),
        source: 'story_state:arc',
        entityId: `arc:${arc.chapterRange}`,
        chapterNumber: maxChapter,
        text: truncated,
        charCount: truncated.length,
        relevance: 0.72,
        freshness: computeFreshness(maxChapter, params.chapterNumber),
        isCritical: false,
        unresolvedWeight: 0,
        provenance: `story_state/arc/${arc.chapterRange}`,
      });
    }

    // Mega-arcs
    for (const mega of megaArcs) {
      const text = `【宏弧线 ${mega.chapterRange}】${mega.summary}`;
      const truncated = truncateText(text);
      const chapterMatch = mega.chapterRange.match(/(\d+)/g);
      const maxChapter = chapterMatch
        ? Math.max(...chapterMatch.map(Number).filter(Number.isFinite))
        : 0;

      items.push({
        id: makeItemId('story_state:mega_arc', mega.chapterRange),
        source: 'story_state:mega_arc',
        entityId: `mega_arc:${mega.chapterRange}`,
        chapterNumber: maxChapter,
        text: truncated,
        charCount: truncated.length,
        relevance: 0.60,
        freshness: computeFreshness(maxChapter, params.chapterNumber),
        isCritical: false,
        unresolvedWeight: 0,
        provenance: `story_state/mega_arc/${mega.chapterRange}`,
      });
    }

    return items;
  }
}

// ────────────────────────────── 世界卡片适配器 ──────────────────────────────

/**
 * 世界卡片适配器（对接 World V2 系统）。
 * 可选注入 RawVectorSearch 以预检索世界记忆上下文，提高卡片命中率。
 */
export class WorldCardAdapter implements MemorySourceAdapter {
  readonly name = 'world-card';
  readonly sources: readonly MemorySource[] = ['world_card'];
  private readonly worldCards: WorldCardData;
  private readonly rawSearch: RawVectorSearch | null;

  constructor(worldCards: WorldCardData, rawSearch?: RawVectorSearch) {
    this.worldCards = worldCards;
    this.rawSearch = rawSearch ?? null;
  }

  async retrieve(params: OrchestratorParams): Promise<MemoryItem[]> {
    // 预检索世界记忆上下文，用于提升 selectWorldCardsV2 的 memoryHit 加分
    let memoryWorldContext: string | undefined;
    if (this.rawSearch) {
      try {
        const worldHits = await this.rawSearch.search(params.novelId, params.userDirection, {
          category: 'world',
          limit: 5,
          currentChapter: params.chapterNumber,
        });
        if (worldHits.length > 0) {
          memoryWorldContext = worldHits.map(h => h.text).join('\n');
        }
      } catch {
        // 预检索失败不影响主流程
      }
    }

    const cards = await this.worldCards.selectCards({
      novelId: params.novelId,
      query: [params.userDirection, params.outlineContent].join('\n'),
      chapterNumber: params.chapterNumber,
      topK: 10,
      memoryWorldContext,
    });

    return cards.map(card => {
      const parts = [`【${card.name}】(${card.category}) ${card.summary}`];
      if (card.constraints.length > 0) {
        parts.push(`约束：${card.constraints.join('；')}`);
      }
      const text = truncateText(parts.join('\n'));
      // 世界卡片的 score 范围约 [2, 30]，归一化
      const normalizedRelevance = Math.min(card.score / 20, 1.0);

      return {
        id: makeItemId('world_card', card.id),
        source: 'world_card' as MemorySource,
        entityId: card.id,
        chapterNumber: 0,
        text,
        charCount: text.length,
        relevance: normalizedRelevance,
        freshness: 0.5,
        isCritical: false,
        unresolvedWeight: card.constraints.length > 0 ? 0.3 : 0,
        provenance: `world_card/${card.id} score=${card.score.toFixed(1)}`,
      };
    });
  }
}

// ────────────────────────────── 上一章上下文适配器 ──────────────────────────────

/**
 * 上一章文本适配器。
 * 将 previousChapterContext 包装为高优先级 MemoryItem。
 */
export class PreviousChapterAdapter implements MemorySourceAdapter {
  readonly name = 'previous-chapter';
  readonly sources: readonly MemorySource[] = ['file:previous_chapter'];

  async retrieve(params: OrchestratorParams): Promise<MemoryItem[]> {
    if (!params.previousChapterContext) return [];

    const text = truncateText(params.previousChapterContext, 2000);
    const prevChapter = Math.max(0, params.chapterNumber - 1);

    return [{
      id: makeItemId('file:previous_chapter', `ch${prevChapter}`),
      source: 'file:previous_chapter',
      entityId: `ch${prevChapter}`,
      chapterNumber: prevChapter,
      text,
      charCount: text.length,
      relevance: 0.92,
      freshness: 1.0,
      isCritical: false,
      unresolvedWeight: 0,
      provenance: `file/previous_chapter/ch${prevChapter}`,
    }];
  }
}
