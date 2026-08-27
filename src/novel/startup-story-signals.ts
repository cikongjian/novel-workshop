import { getTopicSignalIds } from '../pipeline/topic-profiles.js';

export type StartupStorySignal = string;

type InferStartupStorySignalsParams = {
  genre?: string;
  novelTitle?: string;
  novelSynopsis?: string;
  novelTags?: string[];
  constitutionTags?: string[];
};

export function inferStartupStorySignals(
  params: InferStartupStorySignalsParams,
): Set<StartupStorySignal> {
  return new Set(getTopicSignalIds(params));
}
