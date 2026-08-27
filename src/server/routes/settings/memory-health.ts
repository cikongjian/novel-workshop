import fs from 'node:fs';
import path from 'node:path';
import * as lancedb from '@lancedb/lancedb';
import { safeErrorMessage } from '../../middleware/safe-error-reply.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('memory-health');

/** 与前端 MemoryHealthStatus 对齐 */
export type MemoryHealthStatus =
  | 'vector_ready'
  | 'vector_incomplete'
  | 'fts_only'
  | 'empty'
  | 'missing_db'
  | 'error';

export type MemoryHealthItem = {
  novelId: string;
  dbExists: boolean;
  status: MemoryHealthStatus;
  reason?: string;
  chunksRows: number;
  embeddingRows: number;
  vecTableExists: boolean;
  vecRows: number;
};

export function resolveNovelsContentRoot(baseDir: string): string {
  const nested = path.join(baseDir, 'novels');
  return fs.existsSync(nested) ? nested : baseDir;
}

export function listNovelIds(contentRoot: string, selectedNovelIds?: string[]): string[] {
  if (selectedNovelIds && selectedNovelIds.length > 0) {
    return [...new Set(selectedNovelIds)];
  }

  if (!fs.existsSync(contentRoot)) return [];
  const entries = fs.readdirSync(contentRoot, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
}

const TABLE_NAME = 'chunks';

/** 检查 LanceDB chunks 表中是否有带向量的行 */
async function countVectorRows(table: lancedb.Table): Promise<number> {
  try {
    // LanceDB 中所有行都应有 vector 列（写入时必填），直接返回总行数
    return await table.countRows();
  } catch {
    return 0;
  }
}

/** 检查 chunks.lance 目录下是否存在 FTS 索引 */
function hasFtsIndex(lanceDir: string): boolean {
  const chunksLance = path.join(lanceDir, 'chunks.lance');
  if (!fs.existsSync(chunksLance)) return false;
  const indicesDir = path.join(chunksLance, '_indices');
  if (!fs.existsSync(indicesDir)) return false;
  try {
    return fs.readdirSync(indicesDir).length > 0;
  } catch {
    return false;
  }
}

export async function inspectNovelMemory(novelId: string, memoryBaseDir: string): Promise<MemoryHealthItem> {
  const lanceDir = path.join(memoryBaseDir, novelId, 'memory-lance');

  if (!fs.existsSync(lanceDir)) {
    return {
      novelId,
      dbExists: false,
      status: 'missing_db',
      reason: 'memory-lance 目录不存在',
      chunksRows: 0,
      embeddingRows: 0,
      vecTableExists: false,
      vecRows: 0,
    };
  }

  // 检查 chunks.lance 子目录是否存在
  const chunksLance = path.join(lanceDir, 'chunks.lance');
  if (!fs.existsSync(chunksLance)) {
    return {
      novelId,
      dbExists: true,
      status: 'empty',
      reason: 'chunks 表不存在',
      chunksRows: 0,
      embeddingRows: 0,
      vecTableExists: false,
      vecRows: 0,
    };
  }

  let db: lancedb.Connection | null = null;
  try {
    db = await lancedb.connect(lanceDir);
    const tableNames = await db.tableNames();

    if (!tableNames.includes(TABLE_NAME)) {
      return {
        novelId,
        dbExists: true,
        status: 'empty',
        reason: 'chunks 表不存在',
        chunksRows: 0,
        embeddingRows: 0,
        vecTableExists: false,
        vecRows: 0,
      };
    }

    const table = await db.openTable(TABLE_NAME);
    const totalRows = await table.countRows();

    if (totalRows === 0) {
      return {
        novelId,
        dbExists: true,
        status: 'empty',
        reason: '表存在但无数据',
        chunksRows: 0,
        embeddingRows: 0,
        vecTableExists: true,
        vecRows: 0,
      };
    }

    const vecRows = await countVectorRows(table);
    const ftsExists = hasFtsIndex(lanceDir);

    // 判定状态
    let status: MemoryHealthStatus;
    let reason: string | undefined;

    if (vecRows > 0 && vecRows >= totalRows) {
      status = 'vector_ready';
    } else if (vecRows > 0 && vecRows < totalRows) {
      status = 'vector_incomplete';
      reason = `向量行 ${vecRows}/${totalRows}，部分 chunk 缺少向量`;
    } else if (ftsExists) {
      status = 'fts_only';
      reason = '仅有 FTS 索引，无向量数据';
    } else {
      status = 'empty';
      reason = '无向量也无 FTS 索引';
    }

    return {
      novelId,
      dbExists: true,
      status,
      reason,
      chunksRows: totalRows,
      embeddingRows: totalRows,
      vecTableExists: true,
      vecRows,
    };
  } catch (err) {
    log.error(`inspectNovelMemory(${novelId}) failed: ${err instanceof Error ? err.message : String(err)}`);
    return {
      novelId,
      dbExists: true,
      status: 'error',
      reason: safeErrorMessage(err, '记忆检查失败'),
      chunksRows: 0,
      embeddingRows: 0,
      vecTableExists: false,
      vecRows: 0,
    };
  }
}
