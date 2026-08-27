export type { KeyChapterInfo } from './author-note-batch-types.js';
export {
  cancelAuthorNoteBatch,
  hasRunningAuthorNoteBatch,
} from './author-note-batch-job-state.js';
export {
  detectKeyChapters,
  resolveAuthorNoteBatchTargetChapters,
} from './author-note-batch-detection.js';
export { startAuthorNoteBatchGeneration } from './author-note-batch-generation.js';
