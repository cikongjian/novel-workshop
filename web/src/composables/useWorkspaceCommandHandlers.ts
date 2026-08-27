import { createWorkspaceAudioQualityHandlers } from './workspace-command-handlers/audio-quality';
import { createWorkspaceAuthoringHandlers } from './workspace-command-handlers/authoring';
import { createWorkspaceNavigationHandlers } from './workspace-command-handlers/navigation';
import type { UseWorkspaceCommandHandlersOptions, WorkspaceCommandHandler } from './workspace-command-handlers/types';

export type { UseWorkspaceCommandHandlersOptions, WorkspaceCommandHandler };

export function useWorkspaceCommandHandlers(options: UseWorkspaceCommandHandlersOptions) {
  const workspaceCommandHandlers: Record<string, WorkspaceCommandHandler> = {
    ...createWorkspaceAuthoringHandlers(options),
    ...createWorkspaceNavigationHandlers(options),
    ...createWorkspaceAudioQualityHandlers(options),
  };

  async function executeWorkspaceCommand(id: string) {
    const handler = workspaceCommandHandlers[id];
    if (!handler) return;
    await handler();
  }

  return {
    executeWorkspaceCommand,
  };
}
