import * as lancedb from '@lancedb/lancedb';
import { Index } from '@lancedb/lancedb';
import { hashText } from '../utils/text.js';
import type { EmbeddingClient } from '../models/types.js';
import { createLogger } from '../utils/logger.js';
import { measurePerf } from '../utils/perf.js';
import { mmrRerank, type MMRConfig } from './mmr-rerank.js';
import { expandQueryForFts } from './query-expansion.js';
import { isCriticalInfo } from '../pipeline/memory-decay.js';

export type SearchResult = {
  category: string;
  entityId: string;
  text: string;
  score: number;
  chapterNumber?: number;
};

const TABLE_NAME = 'chunks';
const memoryLog = createLogger('memory:vector-store');

/**
 * 已知的合法 category 值白名单。
 * 用于查询过滤前校验，防止通过 category 参数注入恶意过滤条件。
 */
const VALID_CATEGORIES = new Set([
  'world', 'character', 'chapter', 'digest', 'arc',
  'fact', 'thread', 'character_state', '__init__',
]);

/**
 * 转义 LanceDB 过滤表达式中的字符串值，防止注入。
 * 将单引号替换为两个单引号（SQL 转义惯例）。
 */
function escapeFilterValue(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * 校验 category 参数是否合法。不合法时抛出错误。
 */
function assertValidCategory(category: string): void {
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(`Invalid category: ${category}`);
  }
}

/**
 * 校验 entityId 参数格式。仅允许常见安全字符。
 */
function assertValidEntityId(entityId: string): void {
  if (!/^[\w\-.:/]+$/.test(entityId)) {
    throw new Error(`Invalid entityId: ${entityId}`);
  }
}

/**
 * 基于 LanceDB 的向量存储。
 * 嵌入式向量数据库，无需额外服务进程，Windows 兼容性好。
 * 支持向量搜索和文本回退搜索。
 */
export class VectorStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private embeddingClient: EmbeddingClient;
  private dbUri: string;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private ftsAvailable = false;
  private hybridSearchEnabled: boolean;
  /** 写入计数器：每累计 AUTO_OPTIMIZE_INTERVAL 次写入自动触发 optimize */
  private writesSinceOptimize = 0;
  private static readonly EMBEDDING_BATCH_SIZE = 16;
  private static readonly DEFAULT_CHUNK_SIZE = 500;
  private static readonly DEFAULT_CHUNK_OVERLAP = 50;
  private static readonly SENTENCE_BREAK_CHARS = ['。', '！', '？', '.', '!', '?', '\n'];
  private static readonly EMBEDDING_MAX_ATTEMPTS = 3;
  private static readonly EMBEDDING_RETRY_BASE_MS = 500;
  /** 自动 compact 触发阈值 */
  private static readonly AUTO_OPTIMIZE_INTERVAL = 50;
  /** 建向量索引最低行数 */
  private static readonly MIN_ROWS_FOR_VECTOR_INDEX = 256;

  constructor(dbUri: string, embeddingClient: EmbeddingClient, options?: { hybridSearchEnabled?: boolean }) {
    this.dbUri = dbUri;
    this.embeddingClient = embeddingClient;
    this.hybridSearchEnabled = options?.hybridSearchEnabled ?? true;
  }

  /**
   * 确保数据库和表已初始化（懒初始化）。
   */
  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    this.db = await lancedb.connect(this.dbUri);
    const tableNames = await this.db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
      this.table = await this.db.openTable(TABLE_NAME);
      // 迁移：旧表可能缺少 chapter_number 列
      await this.migrateSchemaIfNeeded();
      // 确保 FTS 索引存在（混合搜索用）
      if (this.hybridSearchEnabled) {
        await this.ensureFtsIndex();
      }
    }
    this.initialized = true;
  }

  /**
   * 检查并补充缺失的 chapter_number 列（兼容旧版 schema）。
   */
  private async migrateSchemaIfNeeded(): Promise<void> {
    if (!this.table) return;
    try {
      const schema = await this.table.schema();
      const fieldNames = new Set(schema.fields.map((f: { name: string }) => f.name));
      const migrations: Array<{ name: string; valueSql: string }> = [];
      if (!fieldNames.has('chapter_number')) {
        migrations.push({ name: 'chapter_number', valueSql: '0' });
      }
      if (!fieldNames.has('is_critical')) {
        migrations.push({ name: 'is_critical', valueSql: 'false' });
      }
      if (migrations.length > 0) {
        await this.table.addColumns(migrations);
      }
    } catch (err) {
      // schema 检查或迁移失败不阻塞启动
      memoryLog.warn('Schema migration failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * 确保 text 列上存在 FTS 索引（BM25 全文检索用）。
   * 使用 ngram 分词器适配中文，失败时静默降级。
   */
  private async ensureFtsIndex(): Promise<void> {
    if (!this.table) return;
    try {
      const indices = await this.table.listIndices();
      const hasFts = indices.some(
        (idx: { columns: string[] }) => idx.columns.includes('text'),
      );
      if (!hasFts) {
        await this.table.createIndex('text', {
          config: Index.fts({
            baseTokenizer: 'ngram',
            ngramMinLength: 2,
            ngramMaxLength: 4,
            withPosition: false,
          }),
        });
      }
      this.ftsAvailable = true;
    } catch (err) {
      // FTS 索引创建失败，降级为纯向量搜索
      memoryLog.warn('FTS index creation failed, falling back to vector-only', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.ftsAvailable = false;
    }
  }

  /**
   * 获取或创建表。首次写入时用第一条数据的维度创建表。
   */
  private async getOrCreateTable(
    sampleVector: number[],
  ): Promise<lancedb.Table> {
    if (this.table) return this.table;
    await this.ensureInit();
    if (this.table) return this.table;

    // 用一条占位数据创建表以确定 schema，随后立即删除。
    const placeholder = {
      category: '__init__',
      entity_id: '__init__',
      text: '__init__',
      hash: '__init__',
      chapter_number: 0,
      is_critical: false,
      updated_at: new Date().toISOString(),
      vector: sampleVector,
    };
    this.table = await this.db!.createTable(TABLE_NAME, [placeholder], {
      mode: 'overwrite',
    });
    await this.table.delete("category = '__init__'");
    // 新表也需要 FTS 索引
    if (this.hybridSearchEnabled) {
      await this.ensureFtsIndex();
    }
    return this.table;
  }

  /**
   * 索引文本：分块 -> 生成 embedding -> 入库。
   */
  /**
   * 查询指定实体已存储的内容 hash（用于跳过未变更的重复索引）。
   * 返回第一条 chunk 的 hash 值，不存在则返回 null。
   */
  private async getContentHash(category: string, entityId: string): Promise<string | null> {
    if (!this.table) return null;
    try {
      assertValidCategory(category);
      assertValidEntityId(entityId);
      const rows = await this.table.query()
        .where(`category = '${escapeFilterValue(category)}' AND entity_id = '${escapeFilterValue(entityId)}'`)
        .select(['hash'])
        .limit(1)
        .toArray();
      return rows.length > 0 ? (rows[0].hash as string) : null;
    } catch (err) {
      memoryLog.warn('getContentHash query failed', { category, entityId, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  async indexText(params: {
    category: string;
    entityId: string;
    text: string;
    chapterNumber?: number;
    /** 标记此内容包含关键事件（死亡/突破/背叛等），搜索时不被时间衰减 */
    isCritical?: boolean;
  }): Promise<void> {
    const { category, entityId, text } = params;
    if (!text.trim()) return;

    return measurePerf('memory.indexText', async () => {
      await this.ensureInit();

      const contentHash = hashText(text);
      const existingHash = await this.getContentHash(category, entityId);
      if (existingHash === contentHash) {
        memoryLog.debug('Content unchanged, skip re-indexing', { category, entityId });
        return;
      }

      const critical = params.isCritical ?? isCriticalInfo(text);
      const timestamp = new Date().toISOString();
      let pendingChunks: { text: string; hash: string }[] = [];
      const preparedRows: Array<{
        category: string;
        entity_id: string;
        text: string;
        hash: string;
        chapter_number: number;
        is_critical: boolean;
        updated_at: string;
        vector: number[];
      }> = [];

      const flushPendingChunks = async (): Promise<void> => {
        if (pendingChunks.length === 0) return;

        const texts = pendingChunks.map(item => item.text);
        let batchEmbeddings: number[][] = [];
        for (let attempt = 1; attempt <= VectorStore.EMBEDDING_MAX_ATTEMPTS; attempt += 1) {
          try {
            batchEmbeddings = await this.embeddingClient.embedBatch(texts);
            if (batchEmbeddings.length === texts.length) break;
            throw new Error(`embedding count mismatch: expected ${texts.length}, received ${batchEmbeddings.length}`);
          } catch (err) {
            batchEmbeddings = [];
            memoryLog.warn('Embedding batch attempt failed', {
              category,
              entityId,
              chunkCount: pendingChunks.length,
              attempt,
              maxAttempts: VectorStore.EMBEDDING_MAX_ATTEMPTS,
              reason: err instanceof Error ? err.message : String(err),
            });
            if (attempt < VectorStore.EMBEDDING_MAX_ATTEMPTS) {
              await new Promise(resolve => setTimeout(
                resolve,
                VectorStore.EMBEDDING_RETRY_BASE_MS * attempt,
              ));
            }
          }
        }

        if (batchEmbeddings.length === 0) {
          throw new Error(`embedding failed after ${VectorStore.EMBEDDING_MAX_ATTEMPTS} attempts for ${category}:${entityId}`);
        }

        const rows = pendingChunks.map((chunk, i) => ({
          category,
          entity_id: entityId,
          text: chunk.text,
          hash: chunk.hash,
          chapter_number: params.chapterNumber ?? 0,
          is_critical: critical,
          updated_at: timestamp,
          vector: batchEmbeddings[i],
        }));

        preparedRows.push(...rows);
        pendingChunks = [];
      };

      for (const chunk of this.streamChunks(text)) {
        pendingChunks.push({
          text: chunk,
          hash: contentHash,
        });
        if (pendingChunks.length >= VectorStore.EMBEDDING_BATCH_SIZE) {
          await flushPendingChunks();
        }
      }

      await flushPendingChunks();

      if (preparedRows.length === 0) return;

      const tbl = await this.getOrCreateTable(preparedRows[0].vector);
      await this.removeEntity(category, entityId);
      await tbl.add(preparedRows);
      this.writesSinceOptimize++;
      if (this.writesSinceOptimize >= VectorStore.AUTO_OPTIMIZE_INTERVAL) {
        this.writesSinceOptimize = 0;
        this.optimize().catch(() => {});
      }
    }, {
      slowMs: 250,
      meta: {
        category,
        chunkSourceLength: text.length,
      },
    });
  }

  /**
   * 以流式方式切分文本。
   */
  private *streamChunks(
    text: string,
    maxChunkSize: number = VectorStore.DEFAULT_CHUNK_SIZE,
    overlap: number = VectorStore.DEFAULT_CHUNK_OVERLAP,
  ): Generator<string> {
    if (!text.trim()) return;

    const safeChunkSize = Math.max(1, maxChunkSize);
    const safeOverlap = Math.max(0, Math.min(overlap, safeChunkSize - 1));
    let start = 0;

    while (start < text.length) {
      let end = Math.min(start + safeChunkSize, text.length);

      if (end < text.length) {
        const sentenceEnd = this.findSentenceBreak(text, start + safeChunkSize * 0.7, end);
        if (sentenceEnd > start) {
          end = sentenceEnd + 1;
        }
      }

      const chunk = text.slice(start, end).trim();
      if (chunk) {
        yield chunk;
      }

      if (end >= text.length) break;

      const nextStart = end - safeOverlap;
      start = nextStart > start ? nextStart : start + 1;
    }
  }

  private findSentenceBreak(text: string, from: number, to: number): number {
    let lastBreak = -1;
    for (let i = Math.floor(from); i < Math.min(to, text.length); i++) {
      if (VectorStore.SENTENCE_BREAK_CHARS.includes(text[i])) {
        lastBreak = i;
      }
    }
    return lastBreak;
  }

  /**
   * 混合搜索：向量搜索 + BM25 全文搜索，用 RRF 合并排序。
   */
  private async hybridSearch(
    query: string,
    queryEmbedding: number[],
    options: { category?: string; limit: number; minScore: number; currentChapter?: number; decayFactor: number },
  ): Promise<SearchResult[]> {
    const { category, limit, currentChapter, decayFactor } = options;
    if (category) assertValidCategory(category);
    const filter = category ? `category = '${escapeFilterValue(category)}'` : undefined;
    // 取更多候选以提高 RRF 合并质量
    const fetchLimit = limit * 3;

    // 并行执行向量搜索和 FTS 搜索
    const [vectorRows, ftsRows] = await Promise.all([
      (async () => {
        let builder = this.table!.query().nearestTo(new Float32Array(queryEmbedding));
        if (filter) builder = builder.where(filter);
        return builder.limit(fetchLimit).toArray();
      })(),
      (async () => {
        try {
          // 使用查询扩展提取关键词，提升口语化查询的 FTS 召回率
          const { keywords } = expandQueryForFts(query);
          const ftsQuery = keywords.length > 0 ? keywords.join(' ') : query;
          let builder = this.table!.search(ftsQuery, 'fts');
          if (filter) builder = builder.where(filter);
          return await builder.limit(fetchLimit).toArray();
        } catch (err) {
          memoryLog.debug('FTS search failed, returning empty', { error: err instanceof Error ? err.message : String(err) });
          return [];
        }
      })(),
    ]);

    // RRF 合并（k=60 是标准常数）
    const k = 60;
    const resultMap = new Map<string, {
      row: Record<string, unknown>;
      rrfScore: number;
    }>();

    for (const [rank, row] of vectorRows.entries()) {
      const key = `${row.category as string}:${row.entity_id as string}:${(row.text as string).slice(0, 80)}`;
      const existing = resultMap.get(key);
      const rrfContrib = 1 / (k + rank + 1);
      if (existing) {
        existing.rrfScore += rrfContrib;
      } else {
        resultMap.set(key, { row, rrfScore: rrfContrib });
      }
    }

    for (const [rank, row] of ftsRows.entries()) {
      const key = `${row.category as string}:${row.entity_id as string}:${(row.text as string).slice(0, 80)}`;
      const existing = resultMap.get(key);
      const rrfContrib = 1 / (k + rank + 1);
      if (existing) {
        existing.rrfScore += rrfContrib;
      } else {
        resultMap.set(key, { row, rrfScore: rrfContrib });
      }
    }

    // 按 RRF 分数排序，应用时间衰减
    return [...resultMap.values()]
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit)
      .map(({ row, rrfScore }) => {
        const chapterNum = Number(row.chapter_number ?? 0);
        const text = row.text as string;
        const rowCritical = Boolean(row.is_critical);
        let finalScore = rrfScore;
        if (currentChapter && chapterNum > 0) {
          const dist = Math.max(0, currentChapter - chapterNum);
          finalScore = rrfScore * (1 / (1 + decayFactor * dist));
          // 关键事件（死亡、背叛、突破等）不受时间衰减影响
          if (decayFactor > 0 && finalScore < rrfScore && (rowCritical || isCriticalInfo(text))) {
            finalScore = rrfScore;
          }
        }
        return {
          category: row.category as string,
          entityId: row.entity_id as string,
          text,
          score: finalScore,
          chapterNumber: chapterNum || undefined,
        };
      })
      .filter(r => r.score >= options.minScore)
      .sort((a, b) => b.score - a.score);
  }

  /**
   * 搜索相关文本。
   * 混合搜索启用时使用向量 + BM25 + RRF，否则使用纯向量搜索。
   * 表不存在时返回空。
   */
  async search(
    query: string,
    options?: {
      category?: string;
      limit?: number;
      minScore?: number;
      currentChapter?: number;
      decayFactor?: number;
      mmr?: Partial<MMRConfig>;
    },
  ): Promise<SearchResult[]> {
    const limit = options?.limit ?? 10;
    const minScore = options?.minScore ?? 0.0;
    const category = options?.category;
    const currentChapter = options?.currentChapter;
    const decayFactor = options?.decayFactor ?? 0.05;

    return measurePerf('memory.search', async () => {
      await this.ensureInit();
      if (!this.table) return [];

      try {
        const queryEmbedding = await this.embeddingClient.embedQuery(query);

        if (this.hybridSearchEnabled && this.ftsAvailable) {
          const hybridResults = await this.hybridSearch(query, queryEmbedding, {
            category, limit, minScore, currentChapter, decayFactor,
          });
          return this.applyMMRIfEnabled(hybridResults, options?.mmr);
        }

        let builder = this.table.query().nearestTo(new Float32Array(queryEmbedding));

        if (category) {
          assertValidCategory(category);
          builder = builder.where(`category = '${escapeFilterValue(category)}'`);
        }

        const results = await builder.limit(limit).toArray();

        const mapped = results
          .map(row => {
            const baseScore = 1 / (1 + (row._distance as number));
            const chapterNum = Number(row.chapter_number ?? 0);
            const text = row.text as string;
            const rowCritical = Boolean(row.is_critical);

            let finalScore = baseScore;
            if (currentChapter && chapterNum > 0) {
              const dist = Math.max(0, currentChapter - chapterNum);
              finalScore = baseScore * (1 / (1 + decayFactor * dist));
              if (decayFactor > 0 && finalScore < baseScore && (rowCritical || isCriticalInfo(text))) {
                finalScore = baseScore;
              }
            }

            return {
              category: row.category as string,
              entityId: row.entity_id as string,
              text,
              score: finalScore,
              chapterNumber: chapterNum || undefined,
            };
          })
          .filter(r => r.score >= minScore)
          .sort((a, b) => b.score - a.score);
        return this.applyMMRIfEnabled(mapped, options?.mmr);
      } catch (err) {
        memoryLog.warn('Search failed', { error: err instanceof Error ? err.message : String(err) });
        return [];
      }
    }, {
      slowMs: 120,
      meta: {
        category: category ?? 'all',
        limit,
        queryLength: query.length,
      },
    });
  }

  /**
   * 对搜索结果应用 MMR 重排序（如启用）。
   */
  private applyMMRIfEnabled(results: SearchResult[], mmrConfig?: Partial<MMRConfig>): SearchResult[] {
    if (!mmrConfig?.enabled || results.length <= 1) return results;
    return mmrRerank(results, {
      getId: r => `${r.category}:${r.entityId}:${r.text.slice(0, 80)}`,
      getContent: r => r.text,
      getScore: r => r.score,
    }, mmrConfig);
  }

  /**
   * 按 category + entityId 直接查询文本（无需 embedding），用于角色维度聚合。
   * prefixMatch 为 true 时使用前缀匹配（如 characterId 匹配 characterId:ch1, characterId:ch2 ...）
   */
  async getEntityTexts(
    category: string,
    entityId: string,
    limit: number = 50,
    prefixMatch: boolean = false,
  ): Promise<Array<{ text: string; chapterNumber: number }>> {
    await this.ensureInit();
    if (!this.table) return [];
    try {
      assertValidCategory(category);
      assertValidEntityId(entityId);
      const escapedCategory = escapeFilterValue(category);
      const escapedId = escapeFilterValue(entityId);
      const idFilter = prefixMatch
        ? `entity_id LIKE '${escapedId}%'`
        : `entity_id = '${escapedId}'`;
      const rows = await this.table.query()
        .where(`category = '${escapedCategory}' AND ${idFilter}`)
        .select(['text', 'chapter_number'])
        .limit(limit)
        .toArray();
      return rows
        .map(r => ({ text: r.text as string, chapterNumber: Number(r.chapter_number ?? 0) }))
        .sort((a, b) => a.chapterNumber - b.chapterNumber);
    } catch (err) {
      memoryLog.debug('getEntityTexts query failed', { category, entityId, error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  /**
   * 删除指定实体的全部分块。
   */
  async removeEntity(category: string, entityId: string): Promise<void> {
    await this.ensureInit();
    if (!this.table) return;
    try {
      assertValidCategory(category);
      assertValidEntityId(entityId);
      await this.table.delete(`category = '${escapeFilterValue(category)}' AND entity_id = '${escapeFilterValue(entityId)}'`);
    } catch (err) {
      memoryLog.warn('removeEntity failed', { category, entityId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * 关闭数据库连接。
   */
  close(): void {
    this.table = null;
    this.db = null;
    this.initialized = false;
    this.initPromise = null;
    this.ftsAvailable = false;
  }

  isVectorEnabled(): boolean {
    return true;
  }

  getVectorStatus(): { enabled: boolean; reason?: string } {
    return { enabled: true };
  }

  /**
   * 获取存储统计信息
   */
  async getStats(): Promise<{ totalChunks: number; categories: Record<string, number>; vectorEnabled: boolean }> {
    await this.ensureInit();
    if (!this.table) {
      return { totalChunks: 0, categories: {}, vectorEnabled: true };
    }

    try {
      const totalChunks = await this.table.countRows();
      // 用 countRows + filter 按分类聚合，避免加载全部行
      const KNOWN_CATEGORIES = [
        'world',
        'character',
        'chapter',
        'digest',
        'arc',
        'fact',
        'thread',
        'character_state',
      ];
      const counts = await Promise.all(
        KNOWN_CATEGORIES.map(async (cat) => {
          const count = await this.table!.countRows(`category = '${escapeFilterValue(cat)}'`);
          return [cat, count] as const;
        }),
      );
      const categories: Record<string, number> = {};
      let knownTotal = 0;
      for (const [cat, count] of counts) {
        if (count > 0) {
          categories[cat] = count;
          knownTotal += count;
        }
      }
      // 若存在未知分类，归入 'other'
      if (knownTotal < totalChunks) {
        categories['other'] = totalChunks - knownTotal;
      }
      return { totalChunks, categories, vectorEnabled: true };
    } catch (err) {
      memoryLog.warn('getStats failed', { error: err instanceof Error ? err.message : String(err) });
      return { totalChunks: 0, categories: {}, vectorEnabled: true };
    }
  }

  async verifyReadable(): Promise<{ ok: boolean; reason?: string }> {
    await this.ensureInit();
    if (!this.table) {
      return { ok: true };
    }

    try {
      await this.table
        .query()
        .select(['category'])
        .limit(1)
        .toArray();
      return { ok: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, reason };
    }
  }

  /**
   * 获取某分类下去重后的实体 ID 列表。
   */
  async getDistinctEntityIds(category: string): Promise<string[]> {
    await this.ensureInit();
    if (!this.table) return [];
    try {
      assertValidCategory(category);
      const rows = await this.table
        .query()
        .where(`category = '${escapeFilterValue(category)}'`)
        .select(['entity_id'])
        .limit(200000)
        .toArray();
      const set = new Set<string>();
      for (const row of rows) {
        const id = String(row.entity_id ?? '').trim();
        if (id) set.add(id);
      }
      return [...set];
    } catch (err) {
      memoryLog.debug('getDistinctEntityIds failed', { category, error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  /**
   * 获取某分类下去重后的章节号（来自 chapter_number 列）。
   */
  async getDistinctChapterNumbers(category: string): Promise<number[]> {
    await this.ensureInit();
    if (!this.table) return [];
    try {
      assertValidCategory(category);
      const rows = await this.table
        .query()
        .where(`category = '${escapeFilterValue(category)}'`)
        .select(['chapter_number'])
        .limit(200000)
        .toArray();
      const set = new Set<number>();
      for (const row of rows) {
        const chapterNumber = Number(row.chapter_number ?? 0);
        if (Number.isFinite(chapterNumber) && chapterNumber > 0) {
          set.add(chapterNumber);
        }
      }
      return [...set].sort((a, b) => a - b);
    } catch (err) {
      memoryLog.debug('getDistinctChapterNumbers failed', { category, error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  /**
   * 清除指定分类的所有数据
   */
  async clearCategory(category: string): Promise<void> {
    await this.ensureInit();
    if (!this.table) return;
    try {
      assertValidCategory(category);
      await this.table.delete(`category = '${escapeFilterValue(category)}'`);
    } catch (err) {
      memoryLog.warn('clearCategory failed', { category, error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * 数据压缩优化：合并碎片文件、清理所有旧版本。
   * 返回压缩统计信息，失败时返回零值。
   */
  async optimize(): Promise<{ fragmentsRemoved: number; bytesRemoved: number }> {
    const zero = { fragmentsRemoved: 0, bytesRemoved: 0 };
    await this.ensureInit();
    if (!this.table) return zero;
    try {
      const stats = await this.table.optimize({ cleanupOlderThan: new Date() });
      const result = {
        fragmentsRemoved: stats.compaction.fragmentsRemoved,
        bytesRemoved: stats.prune.bytesRemoved,
      };
      if (result.fragmentsRemoved > 0 || result.bytesRemoved > 0) {
        memoryLog.info('Compaction complete', result);
      }
      return result;
    } catch (err) {
      memoryLog.debug('optimize failed', { error: err instanceof Error ? err.message : String(err) });
      return zero;
    }
  }

  /**
   * 为 vector 列创建 IVF_PQ 索引（适合中小规模数据，省内存）。
   * 已有索引或行数不足时跳过。
   * @returns 是否成功创建或已存在索引
   */
  async createVectorIndex(): Promise<boolean> {
    return measurePerf('memory.createVectorIndex', async () => {
      await this.ensureInit();
      if (!this.table) return false;

      try {
        const indices = await this.table.listIndices();
        if (indices.some(idx => idx.columns.includes('vector'))) {
          return true;
        }

        const tableStats = await this.table.stats();
        if (tableStats.numRows < VectorStore.MIN_ROWS_FOR_VECTOR_INDEX) {
          memoryLog.debug('Skipping vector index: too few rows', { numRows: tableStats.numRows });
          return false;
        }

        const numPartitions = Math.max(2, Math.floor(Math.sqrt(tableStats.numRows)));
        memoryLog.info('Creating IVF_PQ vector index', {
          numRows: tableStats.numRows,
          numPartitions,
        });

        await this.table.createIndex('vector', {
          config: Index.ivfPq({
            distanceType: 'cosine',
            numPartitions,
          }),
        });

        memoryLog.info('Vector index created successfully');
        return true;
      } catch (err) {
        memoryLog.warn('Vector index creation failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      }
    }, {
      slowMs: 500,
      meta: {
        minRows: VectorStore.MIN_ROWS_FOR_VECTOR_INDEX,
      },
    });
  }

  /**
   * 获取存储统计信息（碎片数、行数、总字节、是否有向量索引）。
   */
  async getStorageStats(): Promise<{
    numRows: number;
    numFragments: number;
    totalBytes: number;
    hasVectorIndex: boolean;
  }> {
    await this.ensureInit();
    if (!this.table) return { numRows: 0, numFragments: 0, totalBytes: 0, hasVectorIndex: false };

    try {
      const tableStats = await this.table.stats();
      const indices = await this.table.listIndices();
      const hasVectorIndex = indices.some(
        idx => idx.columns.includes('vector') && idx.indexType !== 'FTS',
      );
      return {
        numRows: tableStats.numRows,
        numFragments: tableStats.fragmentStats.numFragments,
        totalBytes: tableStats.totalBytes,
        hasVectorIndex,
      };
    } catch {
      return { numRows: 0, numFragments: 0, totalBytes: 0, hasVectorIndex: false };
    }
  }
}
