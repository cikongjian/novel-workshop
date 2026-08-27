import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue';

export interface PullRefreshOptions {
  /** The scrollable container ref. Falls back to the page element itself. */
  containerRef?: Ref<HTMLElement | null>;
  /** Callback to invoke on refresh. Should return a promise. */
  onRefresh: () => Promise<void>;
  /** Pull distance (px) required to trigger refresh. Default: 68 */
  threshold?: number;
  /** Max visual pull distance (px). Default: 120 */
  maxPull?: number;
  /** Whether the pull-to-refresh is disabled. */
  disabled?: Ref<boolean>;
}

export interface PullRefreshReturn {
  /** Current pull distance (0 when idle). Bind to CSS var for indicator offset. */
  pullDistance: Ref<number>;
  /** Whether a refresh is in progress. */
  refreshing: Ref<boolean>;
  /** Whether the pull has reached the trigger threshold. */
  triggered: Ref<boolean>;
  /** Bind this ref to the page root element if containerRef is not provided. */
  pullContainerRef: Ref<HTMLElement | null>;
}

const DEFAULT_THRESHOLD = 68;
const DEFAULT_MAX_PULL = 120;

/**
 * Composable that adds pull-to-refresh gesture to a mobile page.
 *
 * Usage:
 * 1. Call usePullRefresh({ onRefresh: () => loadData() })
 * 2. Bind pullContainerRef to your page root element
 * 3. Add the indicator element with the pull-refresh CSS classes
 */
export function usePullRefresh(options: PullRefreshOptions): PullRefreshReturn {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxPull = options.maxPull ?? DEFAULT_MAX_PULL;

  const pullDistance = ref(0);
  const refreshing = ref(false);
  const triggered = ref(false);
  const pullContainerRef = ref<HTMLElement | null>(null);

  let startY = 0;
  let tracking = false;
  let scrollableAncestor: HTMLElement | null = null;

  function getContainer(): HTMLElement | null {
    return options.containerRef?.value ?? pullContainerRef.value;
  }

  /** Walk up the DOM to find the nearest scrollable ancestor (overflow-y: auto/scroll). */
  function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
    let parent = el.parentElement;
    while (parent) {
      const { overflowY } = getComputedStyle(parent);
      if (overflowY === 'auto' || overflowY === 'scroll') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  function isAtTop(): boolean {
    if (scrollableAncestor) {
      return scrollableAncestor.scrollTop <= 0;
    }
    return window.scrollY <= 0;
  }

  function onTouchStart(e: TouchEvent) {
    if (options.disabled?.value || refreshing.value) return;
    if (!isAtTop()) return;

    startY = e.touches[0].clientY;
    tracking = true;
  }

  function onTouchMove(e: TouchEvent) {
    if (!tracking || refreshing.value) return;

    const currentY = e.touches[0].clientY;
    const delta = currentY - startY;

    // Only activate when pulling down and at top of scroll
    if (delta <= 0 || !isAtTop()) {
      pullDistance.value = 0;
      triggered.value = false;
      return;
    }

    // Apply resistance curve: the further you pull, the harder it gets
    const resistanceFactor = 0.42;
    const adjustedDelta = Math.min(delta * resistanceFactor, maxPull);

    pullDistance.value = adjustedDelta;
    triggered.value = adjustedDelta >= threshold;

    // Prevent page scroll while pulling
    if (adjustedDelta > 0) {
      e.preventDefault();
    }
  }

  async function onTouchEnd() {
    if (!tracking) return;
    tracking = false;

    if (triggered.value && !refreshing.value) {
      refreshing.value = true;
      pullDistance.value = threshold; // Snap to threshold height during refresh

      try {
        await options.onRefresh();
      } finally {
        refreshing.value = false;
        pullDistance.value = 0;
        triggered.value = false;
      }
    } else {
      pullDistance.value = 0;
      triggered.value = false;
    }
  }

  onMounted(() => {
    const container = getContainer();
    if (!container) return;

    scrollableAncestor = findScrollableAncestor(container);

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
  });

  onBeforeUnmount(() => {
    const container = getContainer();
    if (!container) return;

    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
  });

  return {
    pullDistance,
    refreshing,
    triggered,
    pullContainerRef,
  };
}
