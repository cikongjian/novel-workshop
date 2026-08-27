import { computed, nextTick, ref, watch, type Ref } from 'vue';

export function useCommentInspectorLayout(options: {
  isDesktop: Ref<boolean>;
  workspaceRef: Ref<HTMLElement | null>;
  panelWidthStorageKey: string;
  dockHeightStorageKey?: string;
  panelMinWidth?: number;
  panelDefaultWidth?: number;
  panelMaxWidthRatio?: number;
  dockMinHeight?: number;
  dockMaxHeightRatio?: number;
}) {
  const panelMinWidth = options.panelMinWidth ?? 280;
  const panelDefaultWidth = options.panelDefaultWidth ?? 320;
  const panelMaxWidthRatio = options.panelMaxWidthRatio ?? 0.42;
  const dockMinHeight = options.dockMinHeight ?? 300;
  const dockMaxHeightRatio = options.dockMaxHeightRatio ?? 0.72;

  const commentPanelRef = ref<HTMLElement | null>(null);
  const commentPanelWidth = ref(panelDefaultWidth);
  const commentPanelWidthDragging = ref(false);
  const commentAgentDockHeight = ref(460);
  const commentDockDragging = ref(false);

  let commentPanelWidthDragContext: { startX: number; startWidth: number } | null = null;
  let commentDockDragContext: { startY: number; startHeight: number } | null = null;

  function getCommentDockMaxHeight(): number {
    const panelHeight = commentPanelRef.value?.clientHeight ?? 0;
    if (panelHeight <= 0) return 420;
    return Math.max(dockMinHeight, Math.round(panelHeight * dockMaxHeightRatio));
  }

  function clampCommentDockHeight(height: number): number {
    const maxHeight = getCommentDockMaxHeight();
    return Math.min(maxHeight, Math.max(dockMinHeight, Math.round(height)));
  }

  function normalizeCommentDockHeight() {
    if (!options.isDesktop.value) return;
    commentAgentDockHeight.value = clampCommentDockHeight(commentAgentDockHeight.value);
  }

  const commentAgentDockStyle = computed(() => {
    if (!options.isDesktop.value) return undefined;
    return {
      flexBasis: `${commentAgentDockHeight.value}px`,
      height: `${commentAgentDockHeight.value}px`,
    };
  });

  function onCommentDockResizeMove(event: MouseEvent) {
    if (!commentDockDragContext) return;
    const delta = event.clientY - commentDockDragContext.startY;
    commentAgentDockHeight.value = clampCommentDockHeight(commentDockDragContext.startHeight + delta);
  }

  function stopCommentDockResize() {
    if (!commentDockDragContext && !commentDockDragging.value) return;
    commentDockDragContext = null;
    commentDockDragging.value = false;
    window.removeEventListener('mousemove', onCommentDockResizeMove);
    window.removeEventListener('mouseup', stopCommentDockResize);
    window.removeEventListener('blur', stopCommentDockResize);
  }

  function startCommentDockResize(event: MouseEvent) {
    if (!options.isDesktop.value) return;
    event.preventDefault();
    commentDockDragContext = {
      startY: event.clientY,
      startHeight: commentAgentDockHeight.value,
    };
    commentDockDragging.value = true;
    window.addEventListener('mousemove', onCommentDockResizeMove);
    window.addEventListener('mouseup', stopCommentDockResize);
    window.addEventListener('blur', stopCommentDockResize);
  }

  function getCommentPanelMaxWidth(): number {
    const workspaceWidth = options.workspaceRef.value?.clientWidth ?? 0;
    if (workspaceWidth <= 0) return 480;
    return Math.max(panelMinWidth, Math.round(workspaceWidth * panelMaxWidthRatio));
  }

  function clampCommentPanelWidth(width: number): number {
    const maxWidth = getCommentPanelMaxWidth();
    return Math.min(maxWidth, Math.max(panelMinWidth, Math.round(width)));
  }

  function normalizeCommentPanelWidth() {
    if (!options.isDesktop.value) return;
    commentPanelWidth.value = clampCommentPanelWidth(commentPanelWidth.value);
  }

  function resetCommentPanelWidth() {
    commentPanelWidth.value = clampCommentPanelWidth(panelDefaultWidth);
  }

  const commentPanelStyle = computed(() => {
    if (!options.isDesktop.value) return undefined;
    const width = clampCommentPanelWidth(commentPanelWidth.value);
    return {
      width: `${width}px`,
      minWidth: `${width}px`,
      flexBasis: `${width}px`,
    };
  });

  function onCommentPanelResizeMove(event: MouseEvent) {
    if (!commentPanelWidthDragContext) return;
    const delta = commentPanelWidthDragContext.startX - event.clientX;
    commentPanelWidth.value = clampCommentPanelWidth(commentPanelWidthDragContext.startWidth + delta);
  }

  function stopCommentPanelResize() {
    if (!commentPanelWidthDragContext && !commentPanelWidthDragging.value) return;
    commentPanelWidthDragContext = null;
    commentPanelWidthDragging.value = false;
    window.removeEventListener('mousemove', onCommentPanelResizeMove);
    window.removeEventListener('mouseup', stopCommentPanelResize);
    window.removeEventListener('blur', stopCommentPanelResize);
  }

  function startCommentPanelResize(event: MouseEvent) {
    if (!options.isDesktop.value) return;
    event.preventDefault();
    commentPanelWidthDragContext = {
      startX: event.clientX,
      startWidth: commentPanelWidth.value,
    };
    commentPanelWidthDragging.value = true;
    window.addEventListener('mousemove', onCommentPanelResizeMove);
    window.addEventListener('mouseup', stopCommentPanelResize);
    window.addEventListener('blur', stopCommentPanelResize);
  }

  function loadCommentPanelPreferences() {
    if (typeof window === 'undefined') return;
    try {
      const savedWidth = Number(localStorage.getItem(options.panelWidthStorageKey));
      if (Number.isFinite(savedWidth) && savedWidth > 0) {
        commentPanelWidth.value = clampCommentPanelWidth(savedWidth);
      } else {
        commentPanelWidth.value = clampCommentPanelWidth(panelDefaultWidth);
      }

      if (options.dockHeightStorageKey) {
        const savedDockHeight = Number(localStorage.getItem(options.dockHeightStorageKey));
        if (Number.isFinite(savedDockHeight) && savedDockHeight > 0) {
          commentAgentDockHeight.value = clampCommentDockHeight(savedDockHeight);
        }
      }
    } catch {
      commentPanelWidth.value = clampCommentPanelWidth(panelDefaultWidth);
    }
  }

  watch(commentPanelWidth, (value) => {
    if (!options.isDesktop.value || typeof window === 'undefined') return;
    try {
      localStorage.setItem(options.panelWidthStorageKey, String(Math.round(value)));
    } catch {
      // ignore
    }
  });

  watch(commentAgentDockHeight, (value) => {
    if (!options.isDesktop.value || typeof window === 'undefined' || !options.dockHeightStorageKey) return;
    try {
      localStorage.setItem(options.dockHeightStorageKey, String(Math.round(value)));
    } catch {
      // ignore
    }
  });

  watch(options.isDesktop, (desktop) => {
    if (desktop) {
      nextTick(() => {
        normalizeCommentPanelWidth();
        normalizeCommentDockHeight();
      });
    } else {
      stopCommentDockResize();
    }
  });

  return {
    commentPanelRef,
    commentPanelWidth,
    commentPanelWidthDragging,
    commentAgentDockHeight,
    commentDockDragging,
    commentPanelStyle,
    commentAgentDockStyle,
    normalizeCommentPanelWidth,
    normalizeCommentDockHeight,
    startCommentPanelResize,
    stopCommentPanelResize,
    startCommentDockResize,
    stopCommentDockResize,
    loadCommentPanelPreferences,
    resetCommentPanelWidth,
  };
}
