import type { UseWorkspaceCommandHandlersOptions, WorkspaceCommandHandler } from './types';

export function createWorkspaceAudioQualityHandlers(
  options: UseWorkspaceCommandHandlersOptions,
): Record<string, WorkspaceCommandHandler> {
  return {
    'tts-play': options.handleTTS,
    'tts-regenerate': options.onTTSRegenerate,
    'tts-batch': options.openTTSBatchDialog,
    'command-backfill': options.handleBackfillSpeakers,
    'command-clean-quote': options.openCleanQuoteUsageDialog,
    'command-curate-foreshadowing': options.handleCurateForeshadowing,
    'dialogue-polish': options.handlePolishDialogue,
  };
}
