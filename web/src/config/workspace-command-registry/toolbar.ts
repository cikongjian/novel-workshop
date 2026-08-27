import type { ToolbarMoreAction, ToolbarMoreBuildContext, WorkspaceCommandState } from './shared';

const TOOLBAR_COMMAND_ORDER: Array<{ id: string; divided?: boolean }> = [
  { id: 'layout-focus' },
  { id: 'layout-balanced' },
  { id: 'layout-review', divided: true },
  { id: 'toggle-suggestions' },
  { id: 'reset-inspector-width', divided: true },
  { id: 'toggle-comment-panel' },
  { id: 'chapter-filter-all', divided: true },
  { id: 'chapter-filter-active' },
  { id: 'chapter-filter-finalized' },
  { id: 'chapter-filter-clear' },
  { id: 'toggle-chapter-density' },
  { id: 'chapter-clear-preselect' },
  { id: 'chapter-prev', divided: true },
  { id: 'chapter-next' },
  { id: 'batch-generate' },
  { id: 'version-history' },
  { id: 'plot-explorer' },
  { id: 'dialogue-polish' },
  { id: 'tts-play', divided: true },
  { id: 'tts-regenerate' },
  { id: 'tts-batch' },
  { id: 'command-backfill' },
  { id: 'command-curate-foreshadowing' },
  { id: 'command-clean-quote' },
  { id: 'find-replace', divided: true },
  { id: 'open-shortcut-help' },
  { id: 'toggle-fullscreen' },
];

function getLabelFromState(commandStateMap: Map<string, WorkspaceCommandState>, id: string): string {
  const state = commandStateMap.get(id);
  if (state) return state.title;
  return id;
}

function resolveToolbarLabel(commandStateMap: Map<string, WorkspaceCommandState>, id: string, context: ToolbarMoreBuildContext): string {
  if (id === 'chapter-prev') {
    return `上一章${context.previousChapterNumber ? `（第 ${context.previousChapterNumber} 章）` : ''}`;
  }
  if (id === 'chapter-next') {
    return `下一章${context.nextChapterNumber ? `（第 ${context.nextChapterNumber} 章）` : ''}`;
  }
  if (id === 'find-replace') {
    return '查找替换（Ctrl+F）';
  }
  if (id === 'open-shortcut-help') {
    return '快捷键总览（? / F1）';
  }
  if (id === 'toggle-fullscreen') {
    return context.isFullscreen ? '退出全屏（F11）' : '进入全屏（F11）';
  }
  return getLabelFromState(commandStateMap, id);
}

function resolveToolbarDisabled(commandStateMap: Map<string, WorkspaceCommandState>, id: string, context: ToolbarMoreBuildContext): boolean | undefined {
  const state = commandStateMap.get(id);
  if (state) return state.disabled;

  if (id === 'dialogue-polish') {
    return !context.hasCurrentChapterContent || context.isGenerating;
  }
  if (id === 'tts-batch') {
    return context.chapterCount === 0 || context.ttsBatchRunning;
  }
  return undefined;
}

export function buildToolbarMoreActions(context: ToolbarMoreBuildContext): ToolbarMoreAction[] {
  const commandStateMap = new Map(context.commandStates.map(item => [item.id, item]));
  return TOOLBAR_COMMAND_ORDER.map((item) => ({
    id: item.id,
    label: resolveToolbarLabel(commandStateMap, item.id, context),
    disabled: resolveToolbarDisabled(commandStateMap, item.id, context),
    divided: item.divided,
  }));
}
