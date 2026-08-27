/**
 * 真相文件统一管理器
 *
 * 负责 truth files 的构建、存储和加载。
 * 存储路径：data/novels/{novelId}/truth-files/{current-state|pending-hooks|character-matrix}.json
 */

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { createLogger } from '../../utils/logger.js';
import { resolveNovelStorageDir } from '../../novel/data-root.js';
import type { StoryStateSnapshot } from '../../novel/story-state-types.js';
import type { CharacterProfile, OutlineData } from '../../novel/types.js';
import type { TruthFileBundle, CurrentStateView, PendingHooksView, CharacterMatrixView } from './types.js';
import { buildCurrentStateView, renderCurrentStateContext } from './current-state-builder.js';
import { buildPendingHooksView, renderPendingHooksContext } from './pending-hooks-builder.js';
import { buildCharacterMatrixView, renderCharacterMatrixContext } from './character-matrix-builder.js';

const log = createLogger('truth-file-manager');

// ==================== 文件路径 ====================

function getTruthFilesDir(novelsDir: string, novelId: string): string {
  return join(resolveNovelStorageDir(novelsDir, novelId), 'truth-files');
}

function getCurrentStatePath(novelsDir: string, novelId: string): string {
  return join(getTruthFilesDir(novelsDir, novelId), 'current-state.json');
}

function getPendingHooksPath(novelsDir: string, novelId: string): string {
  return join(getTruthFilesDir(novelsDir, novelId), 'pending-hooks.json');
}

function getCharacterMatrixPath(novelsDir: string, novelId: string): string {
  return join(getTruthFilesDir(novelsDir, novelId), 'character-matrix.json');
}

// ==================== 安全 JSON 读写 ====================

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonSafe(filePath: string, data: unknown): Promise<void> {
  const dir = dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ==================== 导出：管理函数 ====================

export type UpdateTruthFilesParams = {
  novelId: string;
  novelsDir: string;
  chapterNumber: number;
  /** 最新的 StoryStateSnapshot（必选） */
  snapshot: StoryStateSnapshot;
  /** 角色配置文件（用于构建信息边界矩阵） */
  characters: CharacterProfile[];
  /** 大纲数据（用于补充伏笔列表） */
  outline: OutlineData;
};

export type TruthFileHealthReport = {
  mode: 'observe';
  chapterNumber: number;
  hasCurrentState: boolean;
  hasPendingHooks: boolean;
  hasCharacterMatrix: boolean;
  currentStateChapter: number | null;
  pendingHooksChapter: number | null;
  aligned: boolean;
  warnings: string[];
  checkedAt: string;
};

export function buildTruthFileHealthReport(
  bundle: TruthFileBundle,
  chapterNumber: number,
  checkedAt = new Date().toISOString(),
): TruthFileHealthReport {
  const currentStateChapter = bundle.currentState?.chapterNumber ?? null;
  const pendingHooksChapter = bundle.pendingHooks?.currentChapter ?? null;
  const warnings: string[] = [];

  if (!bundle.currentState) {
    warnings.push('current-state missing');
  } else if (currentStateChapter !== chapterNumber) {
    warnings.push(`current-state chapter mismatch: expected ${chapterNumber}, got ${currentStateChapter}`);
  }

  if (!bundle.pendingHooks) {
    warnings.push('pending-hooks missing');
  } else if (pendingHooksChapter !== chapterNumber) {
    warnings.push(`pending-hooks chapter mismatch: expected ${chapterNumber}, got ${pendingHooksChapter}`);
  }

  if (!bundle.characterMatrix) {
    warnings.push('character-matrix missing');
  }

  return {
    mode: 'observe',
    chapterNumber,
    hasCurrentState: Boolean(bundle.currentState),
    hasPendingHooks: Boolean(bundle.pendingHooks),
    hasCharacterMatrix: Boolean(bundle.characterMatrix),
    currentStateChapter,
    pendingHooksChapter,
    aligned: warnings.length === 0,
    warnings,
    checkedAt,
  };
}

/**
 * 章节生成后更新所有 truth files
 *
 * 这是 fire-and-forget 调用，失败不阻塞主流程。
 */
export async function updateTruthFiles(params: UpdateTruthFilesParams): Promise<TruthFileBundle> {
  const { novelId, novelsDir, chapterNumber, snapshot, characters, outline } = params;

  const bundle: TruthFileBundle = {
    currentState: null,
    pendingHooks: null,
    characterMatrix: null,
  };

  // 并行构建 3 个视图
  try {
    if (snapshot.chapterNumber !== chapterNumber) {
      log.warn('truth files stale snapshot skipped', {
        novelId,
        chapterNumber,
        snapshotChapterNumber: snapshot.chapterNumber,
      });
      return bundle;
    }

    bundle.currentState = buildCurrentStateView(snapshot);
  } catch (err) {
    log.warn('构建当前状态视图失败', { novelId, reason: err instanceof Error ? err.message : String(err) });
  }

  try {
    bundle.pendingHooks = buildPendingHooksView(
      snapshot.plot,
      outline.foreshadowing ?? [],
      chapterNumber,
    );
  } catch (err) {
    log.warn('构建伏笔视图失败', { novelId, reason: err instanceof Error ? err.message : String(err) });
  }

  try {
    bundle.characterMatrix = buildCharacterMatrixView(
      snapshot.characters,
      characters,
    );
  } catch (err) {
    log.warn('构建角色矩阵失败', { novelId, reason: err instanceof Error ? err.message : String(err) });
  }

  // 并行写入文件
  const writePromises: Promise<void>[] = [];

  if (bundle.currentState) {
    writePromises.push(
      writeJsonSafe(getCurrentStatePath(novelsDir, novelId), bundle.currentState)
        .catch(err => log.warn('保存当前状态文件失败', { novelId, reason: err instanceof Error ? err.message : String(err) })),
    );
  }
  if (bundle.pendingHooks) {
    writePromises.push(
      writeJsonSafe(getPendingHooksPath(novelsDir, novelId), bundle.pendingHooks)
        .catch(err => log.warn('保存伏笔文件失败', { novelId, reason: err instanceof Error ? err.message : String(err) })),
    );
  }
  if (bundle.characterMatrix) {
    writePromises.push(
      writeJsonSafe(getCharacterMatrixPath(novelsDir, novelId), bundle.characterMatrix)
        .catch(err => log.warn('保存角色矩阵文件失败', { novelId, reason: err instanceof Error ? err.message : String(err) })),
    );
  }

  await Promise.allSettled(writePromises);
  log.debug('truth files 更新完成', { novelId, chapterNumber });

  return bundle;
}

/**
 * 加载已持久化的 truth files
 */
export async function loadTruthFiles(
  novelId: string,
  novelsDir: string,
): Promise<TruthFileBundle> {
  const [currentState, pendingHooks, characterMatrix] = await Promise.all([
    readJsonSafe<CurrentStateView>(getCurrentStatePath(novelsDir, novelId)),
    readJsonSafe<PendingHooksView>(getPendingHooksPath(novelsDir, novelId)),
    readJsonSafe<CharacterMatrixView>(getCharacterMatrixPath(novelsDir, novelId)),
  ]);

  return { currentState, pendingHooks, characterMatrix };
}

export async function verifyTruthFilesHealth(
  novelId: string,
  novelsDir: string,
  chapterNumber: number,
): Promise<TruthFileHealthReport> {
  const bundle = await loadTruthFiles(novelId, novelsDir);
  return buildTruthFileHealthReport(bundle, chapterNumber);
}

/**
 * 将 TruthFileBundle 渲染为 prompt 注入文本
 *
 * @param bundle - truth file 数据包
 * @param currentChapter - 当前章节号（用于过滤过时数据）
 */
function renderTruthFilesContext(
  bundle: TruthFileBundle,
  currentChapter: number,
): string {
  const sections: string[] = [];

  if (bundle.currentState) {
    // 仅使用最近的状态（避免注入过时数据）
    if (Math.abs(bundle.currentState.chapterNumber - currentChapter) <= 2) {
      sections.push(renderCurrentStateContext(bundle.currentState));
    }
  }

  if (bundle.pendingHooks && bundle.pendingHooks.hooks.length > 0) {
    sections.push(renderPendingHooksContext(bundle.pendingHooks));
  }

  if (bundle.characterMatrix) {
    const hasContent =
      bundle.characterMatrix.revealedSecrets.length > 0
      || bundle.characterMatrix.hiddenSecrets.length > 0
      || bundle.characterMatrix.infoEdges.length > 0;
    if (hasContent) {
      sections.push(renderCharacterMatrixContext(bundle.characterMatrix));
    }
  }

  return sections.join('\n\n');
}
