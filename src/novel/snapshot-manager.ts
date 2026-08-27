/**
 * 章节快照管理器
 *
 * 提供章节级别的快照能力：
 * - 章节生成前自动快照当前状态文件
 * - 自动清理历史快照
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createLogger } from '../utils/logger.js';
import { resolveNovelStorageDir } from './data-root.js';
import type { ChapterSnapshot } from './snapshot-types.js';

const log = createLogger('snapshot-manager');

// ==================== 常量 ====================

/** 快照目录名前缀 */
const SNAPSHOT_DIR_PREFIX = 'snapshot-ch';

/** 需要快照的状态文件（相对于小说目录） */
const STATE_FILES = [
  'characters.json',
  'world.json',
  'outline.json',
  'story-state.json',
];

/** 最大保留快照数 */
const DEFAULT_MAX_RETAINED = 20;

// ==================== 工具函数 ====================

function getNovelDir(novelsDir: string, novelId: string): string {
  return resolveNovelStorageDir(novelsDir, novelId);
}

function getSnapshotDir(novelsDir: string, novelId: string, chapterNumber: number): string {
  return path.join(getNovelDir(novelsDir, novelId), 'chapters', `${SNAPSHOT_DIR_PREFIX}${chapterNumber}`);
}

async function getFileSize(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

// ==================== 快照创建 ====================

/**
 * 创建章节快照：复制当前状态文件到快照目录。
 */
export async function createSnapshot(
  novelId: string,
  chapterNumber: number,
  novelsDir: string,
): Promise<ChapterSnapshot> {
  const novelDir = getNovelDir(novelsDir, novelId);
  const snapshotDir = getSnapshotDir(novelsDir, novelId, chapterNumber);

  await fs.mkdir(snapshotDir, { recursive: true });

  const copiedFiles: string[] = [];
  let totalSize = 0;

  for (const fileName of STATE_FILES) {
    const srcPath = path.join(novelDir, fileName);
    const destPath = path.join(snapshotDir, fileName);

    try {
      await fs.copyFile(srcPath, destPath);
      const size = await getFileSize(destPath);
      totalSize += size;
      copiedFiles.push(fileName);
    } catch {
      // 文件不存在则跳过（story-state.json 可能尚未创建）
    }
  }

  // 快照 truth-files 目录（如果存在）
  const truthFilesDir = path.join(novelDir, 'truth-files');
  if (await dirExists(truthFilesDir)) {
    const truthSnapshotDir = path.join(snapshotDir, 'truth-files');
    await fs.mkdir(truthSnapshotDir, { recursive: true });

    try {
      const truthFiles = await fs.readdir(truthFilesDir);
      for (const file of truthFiles) {
        if (file.endsWith('.json')) {
          const srcPath = path.join(truthFilesDir, file);
          const destPath = path.join(truthSnapshotDir, file);
          await fs.copyFile(srcPath, destPath);
          const size = await getFileSize(destPath);
          totalSize += size;
          copiedFiles.push(`truth-files/${file}`);
        }
      }
    } catch (err) {
      log.debug('快照 truth-files 失败', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const snapshot: ChapterSnapshot = {
    chapterNumber,
    createdAt: new Date().toISOString(),
    files: copiedFiles,
    sizeBytes: totalSize,
  };

  // 保存快照元数据
  await fs.writeFile(
    path.join(snapshotDir, 'snapshot-meta.json'),
    JSON.stringify(snapshot, null, 2),
    'utf-8',
  );

  log.info('快照创建成功', { novelId, chapterNumber, files: copiedFiles.length, sizeBytes: totalSize });

  return snapshot;
}

// ==================== 快照列表 ====================

/**
 * 列出小说的所有快照。
 */
async function listSnapshots(
  novelId: string,
  novelsDir: string,
): Promise<ChapterSnapshot[]> {
  const chaptersDir = path.join(getNovelDir(novelsDir, novelId), 'chapters');

  try {
    const entries = await fs.readdir(chaptersDir, { withFileTypes: true });
    const snapshots: ChapterSnapshot[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(SNAPSHOT_DIR_PREFIX)) {
        try {
          const metaPath = path.join(chaptersDir, entry.name, 'snapshot-meta.json');
          const raw = await fs.readFile(metaPath, 'utf-8');
          snapshots.push(JSON.parse(raw));
        } catch {
          // 元数据损坏则跳过
        }
      }
    }

    return snapshots.sort((a, b) => a.chapterNumber - b.chapterNumber);
  } catch {
    return [];
  }
}

// ==================== 快照清理 ====================

/**
 * 清理旧快照，仅保留最新的 N 个。
 */
export async function cleanupOldSnapshots(
  novelId: string,
  novelsDir: string,
  maxRetained: number = DEFAULT_MAX_RETAINED,
): Promise<number> {
  const snapshots = await listSnapshots(novelId, novelsDir);

  if (snapshots.length <= maxRetained) return 0;

  const toDelete = snapshots.slice(0, snapshots.length - maxRetained);
  let deleted = 0;

  for (const snap of toDelete) {
    try {
      const snapshotDir = getSnapshotDir(novelsDir, novelId, snap.chapterNumber);
      await fs.rm(snapshotDir, { recursive: true, force: true });
      deleted++;
    } catch (err) {
      log.warn('清理快照失败', {
        chapterNumber: snap.chapterNumber,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (deleted > 0) {
    log.info('清理旧快照', { novelId, deleted, remaining: snapshots.length - deleted });
  }

  return deleted;
}
