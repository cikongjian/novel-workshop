import type { Ref } from 'vue';

function isTextInputLikeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.closest('.el-input, .el-textarea, .el-select, .el-dialog, .el-drawer')) return true;
  return false;
}

export function useWorkspaceHotkeys(options: {
  commandPaletteVisible: Ref<boolean>;
  operationCenterVisible: Ref<boolean>;
  shortcutHelpVisible: Ref<boolean>;
  findReplaceVisible: Ref<boolean>;
  isFullscreen: Ref<boolean>;
  chapterSidebarKeyboardEnabled: Ref<boolean>;
  chapterSidebarKeyboardFocusChapter: Ref<number | null>;
  hasUnsavedChanges: Ref<boolean>;
  aiContinuing: Ref<boolean>;
  openOperationCenter: () => void;
  closeOperationCenter: () => void;
  openShortcutHelp: () => void;
  closeShortcutHelp: () => void;
  openGenerateDialog: () => void;
  openReviseDialog: () => void;
  openFindReplace: () => void;
  saveChapter: () => void | Promise<void>;
  moveChapterSidebarKeyboardFocus: (delta: number) => void;
  setChapterSidebarKeyboardFocusToBoundary: (boundary: 'first' | 'last') => void;
  moveChapterSidebarKeyboardFocusByOffset: (offset: number) => void;
  clearChapterSidebarKeyboardFocus: () => void;
  openChapterByKeyboardFocus: () => void;
  deleteChapterByKeyboardFocus: () => void;
  goToNextChapter: () => void;
  goToPreviousChapter: () => void;
  canToggleChapterSidebar: () => boolean;
  toggleChapterSidebar: () => void;
  toggleFullscreen: () => void;
  handleAIContinue: () => void | Promise<void>;
  handleRewriteSelection: () => void | Promise<void>;
  canTriggerRewriteSelection?: () => boolean;
  notifyRewriteSelectionUnavailable?: () => void;
}) {
  function handleKeyDown(e: KeyboardEvent) {
    // Ctrl+K 命令面板
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      options.commandPaletteVisible.value = true;
      return;
    }
    // Ctrl+. 操作中心
    if ((e.ctrlKey || e.metaKey) && e.key === '.') {
      e.preventDefault();
      options.openOperationCenter();
      return;
    }
    if (options.commandPaletteVisible.value && e.key !== 'Escape') {
      return;
    }
    if (options.operationCenterVisible.value && e.key !== 'Escape') {
      return;
    }
    if (options.shortcutHelpVisible.value && e.key !== 'Escape') {
      return;
    }
    // ? / F1 快捷键总览（仅非输入焦点）
    if (
      ((e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) || e.key === 'F1')
      && !isTextInputLikeTarget(e.target)
    ) {
      e.preventDefault();
      options.openShortcutHelp();
      return;
    }
    // Ctrl+N 新章节
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      options.openGenerateDialog();
      return;
    }
    // Alt+R 修订
    if (e.altKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      options.openReviseDialog();
      return;
    }
    // Ctrl+S 保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (options.hasUnsavedChanges.value) {
        void options.saveChapter();
      }
      return;
    }
    // Ctrl+F 查找替换
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      options.openFindReplace();
      return;
    }
    // Ctrl+Shift+R 选中重写
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      if (options.canTriggerRewriteSelection && !options.canTriggerRewriteSelection()) {
        options.notifyRewriteSelectionUnavailable?.();
        return;
      }
      void options.handleRewriteSelection();
      return;
    }

    const isPlainKey = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    const canUseSidebarKeyboard = isPlainKey
      && !isTextInputLikeTarget(e.target)
      && options.chapterSidebarKeyboardEnabled.value;

    // 章节侧栏键盘预选与执行（仅在章节侧栏可用时生效）
    if (canUseSidebarKeyboard) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        options.moveChapterSidebarKeyboardFocus(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        options.moveChapterSidebarKeyboardFocus(-1);
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        options.setChapterSidebarKeyboardFocusToBoundary('first');
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        options.setChapterSidebarKeyboardFocusToBoundary('last');
        return;
      }
      if (e.key === 'PageDown') {
        e.preventDefault();
        options.moveChapterSidebarKeyboardFocusByOffset(5);
        return;
      }
      if (e.key === 'PageUp') {
        e.preventDefault();
        options.moveChapterSidebarKeyboardFocusByOffset(-5);
        return;
      }
      if (
        e.key === 'Escape'
        && !options.findReplaceVisible.value
        && !options.isFullscreen.value
        && options.chapterSidebarKeyboardFocusChapter.value !== null
      ) {
        e.preventDefault();
        options.clearChapterSidebarKeyboardFocus();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        options.openChapterByKeyboardFocus();
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        options.deleteChapterByKeyboardFocus();
        return;
      }
    }

    // J / K 章节切换（仅在非输入焦点下生效）
    if (isPlainKey && !isTextInputLikeTarget(e.target)) {
      const key = e.key.toLowerCase();
      if (key === 'j') {
        e.preventDefault();
        options.goToNextChapter();
        return;
      }
      if (key === 'k') {
        e.preventDefault();
        options.goToPreviousChapter();
        return;
      }
    }
    // Alt+[ / Alt+] 章节切换
    if (e.altKey && e.key === '[') {
      e.preventDefault();
      options.goToPreviousChapter();
      return;
    }
    if (e.altKey && e.key === ']') {
      e.preventDefault();
      options.goToNextChapter();
      return;
    }
    // Ctrl+B 切换章节侧栏
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      if (options.canToggleChapterSidebar()) {
        e.preventDefault();
        options.toggleChapterSidebar();
        return;
      }
    }
    // F11 全屏
    if (e.key === 'F11') {
      e.preventDefault();
      options.toggleFullscreen();
      return;
    }
    // Ctrl+Enter AI 续写
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!options.aiContinuing.value) {
        void options.handleAIContinue();
      }
      return;
    }
    // Escape 退出全屏 / 关闭查找。
    if (e.key === 'Escape') {
      if (options.commandPaletteVisible.value) {
        options.commandPaletteVisible.value = false;
      } else if (options.operationCenterVisible.value) {
        options.closeOperationCenter();
      } else if (options.shortcutHelpVisible.value) {
        options.closeShortcutHelp();
      } else if (options.isFullscreen.value) {
        options.isFullscreen.value = false;
      } else if (options.findReplaceVisible.value) {
        options.findReplaceVisible.value = false;
      }
    }
  }

  return {
    handleKeyDown,
  };
}
