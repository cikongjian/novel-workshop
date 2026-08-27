/**
 * 结构化真相文件 — 导出聚合模块
 *
 * 提供 truth files 的统一入口：类型、构建器和管理函数。
 */

// 类型导出
export type {
  CompactCharacterState,
  CompactWorldState,
  CompactFactionState,
  CurrentStateView,
  PendingHookEntry,
  PendingHooksView,
  CharacterInfoEdge,
  CharacterMatrixView,
  TruthFileBundle,
} from './types.js';

// 构建器导出
export {
  buildCurrentStateView,
  renderCurrentStateContext,
} from './current-state-builder.js';

export {
  buildPendingHooksView,
  renderPendingHooksContext,
} from './pending-hooks-builder.js';

export {
  buildCharacterMatrixView,
  renderCharacterMatrixContext,
} from './character-matrix-builder.js';

// 管理函数导出
export {
  updateTruthFiles,
  loadTruthFiles,
  verifyTruthFilesHealth,
  buildTruthFileHealthReport,
} from './truth-file-manager.js';
export type { UpdateTruthFilesParams, TruthFileHealthReport } from './truth-file-manager.js';
