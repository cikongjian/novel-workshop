import type { UseWorkspaceCommandHandlersOptions, WorkspaceCommandHandler } from './types';

export function createWorkspaceNavigationHandlers(
  options: UseWorkspaceCommandHandlersOptions,
): Record<string, WorkspaceCommandHandler> {
  return {
    'chapter-prev': options.goToPreviousChapter,
    'chapter-next': options.goToNextChapter,
    'toggle-sidebar': options.toggleChapterSidebar,
    'chapter-filter-all': () => options.setChapterSidebarFilter('all'),
    'chapter-filter-active': () => options.setChapterSidebarFilter('active'),
    'chapter-filter-finalized': () => options.setChapterSidebarFilter('finalized'),
    'chapter-filter-clear': options.clearChapterSidebarFilters,
    'toggle-chapter-density': options.toggleChapterSidebarDense,
    'chapter-clear-preselect': options.clearChapterSidebarKeyboardFocus,
    'layout-focus': () => options.setWorkspaceLayoutPreset('focus'),
    'layout-balanced': () => options.setWorkspaceLayoutPreset('balanced'),
    'layout-review': () => options.setWorkspaceLayoutPreset('review'),
    'toggle-suggestions': options.toggleSuggestions,
    'reset-inspector-width': options.resetCommentPanelWidth,
    'toggle-comment-panel': options.toggleCommentPanel,
    'toggle-fullscreen': options.toggleFullscreen,
    'goto-outline': () => options.handleWorkspaceDomainSelect('outline'),
    'goto-world': () => options.handleWorkspaceDomainSelect('world'),
    'goto-characters': () => options.handleWorkspaceDomainSelect('characters'),
    'goto-settings': () => options.handleWorkspaceDomainSelect('settings'),
    'goto-dashboard': () => options.openWorkspaceTool('home'),
    'open-marketing-panel': () => options.openWorkspaceTool('marketing'),
  };
}
