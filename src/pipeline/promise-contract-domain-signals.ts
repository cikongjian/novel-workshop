import { topicProfilesToConstitutionSignals } from './topic-profiles.js';

/**
 * Backward-compatible export for promise-contract.ts.
 * Topic-specific constraints now live in topic-profiles.ts so every evaluator
 * consumes the same payoff, scene, drift, startup, and delay definitions.
 */
export const EXTRA_PROMISE_CONSTITUTION_SIGNALS = topicProfilesToConstitutionSignals();
