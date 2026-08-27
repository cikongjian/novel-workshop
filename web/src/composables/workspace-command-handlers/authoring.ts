import type { UseWorkspaceCommandHandlersOptions, WorkspaceCommandHandler } from './types';

export function createWorkspaceAuthoringHandlers(
  options: UseWorkspaceCommandHandlersOptions,
): Record<string, WorkspaceCommandHandler> {
  return {
    generate: options.openGenerateDialog,
    'open-revise': options.openReviseDialog,
    revise: options.openReviseDialog,
    'resize-compress': () => options.openResizeDialog('compress'),
    'resize-expand': () => options.openResizeDialog('expand'),
    'open-command-palette': options.openCommandPalette,
    save: options.saveChapter,
    finalize: options.handleFinalize,
    'batch-generate': options.openBatchDialog,
    'version-history': options.openVersionHistory,
    'plot-explorer': options.openPlotExplorer,
    'find-replace': options.openFindReplace,
    'open-shortcut-help': options.openShortcutHelp,
  };
}
