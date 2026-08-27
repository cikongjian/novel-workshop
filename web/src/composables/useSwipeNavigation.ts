/**
 * 左右滑动翻章 composable
 * - 在阅读内容区域检测水平滑动手势
 * - 右滑 → 上一章，左滑 → 下一章
 * - 通过 CSS transform 提供拖拽跟手反馈
 * - 与垂直滚动、文本选中无冲突
 */
import { ref, watch, onUnmounted, type Ref } from 'vue';

export interface SwipeNavigationOptions {
  /** 阅读内容容器 ref */
  containerRef: Ref<HTMLElement | null>;
  /** 上一章回调 */
  onPrev: () => void;
  /** 下一章回调 */
  onNext: () => void;
  /** 是否启用（可由外部控制，如划线批注激活时暂停） */
  enabled?: Ref<boolean>;
  /** 最小水平滑动距离（px），默认 80 */
  threshold?: number;
  /** 最大垂直偏差（px），超出则视为滚动，默认 50 */
  maxVerticalDeviation?: number;
}

export function useSwipeNavigation(options: SwipeNavigationOptions) {
  const threshold = options.threshold ?? 80;
  const maxVerticalDeviation = options.maxVerticalDeviation ?? 50;

  /** 拖拽时的水平偏移量（px），正=右滑，负=左滑，用于 CSS 跟手反馈 */
  const swipeOffsetX = ref(0);
  /** 是否正在执行翻页过渡 */
  const swiping = ref(false);
  /** 翻页方向提示：'prev' | 'next' | null */
  const swipeDirection = ref<'prev' | 'next' | null>(null);

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let hasMoved = false;
  let boundContainer: HTMLElement | null = null;

  function resetState() {
    swipeOffsetX.value = 0;
    swiping.value = false;
    swipeDirection.value = null;
    tracking = false;
    hasMoved = false;
  }

  function bindListeners(container: HTMLElement) {
    container.addEventListener('pointerdown', onPointerDown, { passive: true });
    container.addEventListener('pointermove', onPointerMove, { passive: true });
    container.addEventListener('pointerup', onPointerUp, { passive: true });
    container.addEventListener('pointercancel', resetState, { passive: true });
    container.addEventListener('pointerleave', resetState, { passive: true });
  }

  function unbindListeners(container: HTMLElement) {
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('pointercancel', resetState);
    container.removeEventListener('pointerleave', resetState);
    resetState();
  }

  // 监听容器 ref 变化（条件渲染场景，容器可能延迟挂载）
  watch(
    () => options.containerRef.value,
    (el) => {
      if (boundContainer) {
        unbindListeners(boundContainer);
        boundContainer = null;
      }
      if (el) {
        bindListeners(el);
        boundContainer = el;
      }
    },
    { immediate: true },
  );

  onUnmounted(() => {
    if (boundContainer) {
      unbindListeners(boundContainer);
      boundContainer = null;
    }
  });

  function onPointerDown(e: PointerEvent) {
    if (options.enabled && !options.enabled.value) return;
    // 仅响应触摸事件，桌面端鼠标不做滑动翻页（用滚轮/按钮即可，避免干扰文本选中）
    if (e.pointerType !== 'touch') return;
    // 忽略多指触摸
    if (!(e as PointerEvent & { isPrimary?: boolean }).isPrimary) return;

    // 检查是否有文本选中（避免与划线批注冲突）
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;

    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
    hasMoved = false;
  }

  function onPointerMove(e: PointerEvent) {
    if (!tracking) return;

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    // 首次明显移动时判断方向
    if (!hasMoved) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      hasMoved = true;

      // 如果垂直移动大于水平移动 → 这是滚动，放弃跟踪
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        tracking = false;
        return;
      }
    }

    // 垂直偏差过大 → 转为滚动，放弃
    if (Math.abs(deltaY) > maxVerticalDeviation) {
      tracking = false;
      swipeOffsetX.value = 0;
      swipeDirection.value = null;
      return;
    }

    // 应用阻尼曲线（拖拽越多阻力越大）
    const resistance = Math.max(0, 1 - Math.abs(deltaX) / (threshold * 2.5));
    const clampedX = deltaX * resistance;

    swipeOffsetX.value = clampedX;

    if (deltaX > threshold * 0.5) {
      swipeDirection.value = 'prev';
    } else if (deltaX < -threshold * 0.5) {
      swipeDirection.value = 'next';
    } else {
      swipeDirection.value = null;
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!tracking) return;
    tracking = false;

    const deltaX = e.clientX - startX;

    if (Math.abs(deltaX) < threshold) {
      // 不足阈值 → 回弹
      swipeOffsetX.value = 0;
      swipeDirection.value = null;
      return;
    }

    // 达到阈值 → 执行翻页
    swiping.value = true;
    if (deltaX > 0) {
      // 右滑 → 上一章
      swipeOffsetX.value = 0;
      swipeDirection.value = null;
      options.onPrev();
    } else {
      // 左滑 → 下一章
      swipeOffsetX.value = 0;
      swipeDirection.value = null;
      options.onNext();
    }

    // transition 结束后清理状态
    setTimeout(() => {
      swiping.value = false;
      swipeOffsetX.value = 0;
    }, 350);
  }

  return {
    swipeOffsetX,
    swiping,
    swipeDirection,
  };
}
