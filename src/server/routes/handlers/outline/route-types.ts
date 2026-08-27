import type { AgentEvent, NovelAgent } from '../../../../agents/types.js';
import type { AuthDb } from '../../../../auth/types.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelManager } from '../../../../novel/novel-manager.js';

export type OutlineDeps = {
  novelManager: NovelManager;
  agents?: Map<string, NovelAgent>;
  modelClient?: ModelClient;
  broadcast?: (event: AgentEvent) => void;
  authDb?: AuthDb;
};
