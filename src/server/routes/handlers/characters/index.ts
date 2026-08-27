/**
 * Character route handlers
 * Individual handler modules for character-related API endpoints
 */

export {
  registerCharacterCRUDHandlers,
  CharacterBody,
  buildCharacterV2Fields,
} from './crud-handler.js';

export {
  registerPendingCharacterHandlers,
} from './pending-handler.js';

export {
  registerBackfillHandlers,
} from './backfill-handler.js';

export {
  registerMergeHandlers,
} from './merge-handler.js';
