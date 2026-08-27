import { ref, computed, onMounted, onUnmounted, watch, type Ref } from 'vue';

export interface UseReadingEnhanceProps {
  containerRef: Ref<HTMLElement | null>;
  onPrevPage: () => void;
  onNextPage: () => void;
}

const LS_PREFIX = 'reading_enhance_';

function loadNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function saveNumber(key: string, value: number): void {
  try {
    localStorage.setItem(LS_PREFIX + key, String(value));
  } catch {
    // 忽略存储失败
  }
}

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw === null) return fallback;
    return raw === 'true';
  } catch {
    return fallback;
  }
}

function saveBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(LS_PREFIX + key, String(value));
  } catch {
    // 忽略存储失败
  }
}

export function useReadingEnhance(props: UseReadingEnhanceProps) {
  // ==================== 自动滚动 ====================
  const autoScrollActive = ref(false);
  const autoScrollSpeed = ref(loadNumber('auto_scroll_speed', 5));
  let scrollIntervalId: ReturnType<typeof setInterval> | null = null;
  let scrollPausedByTouch = false;

  function clampSpeed(value: number): number {
    return Math.max(1, Math.min(10, Math.round(value)));
  }

  function doScrollStep(): void {
    const container = props.containerRef.value;
    if (!container) return;
    // speed 1→最慢 像素/100ms, 10→最快
    const pxPerStep = autoScrollSpeed.value * 3;
    container.scrollTop += pxPerStep;
  }

  function startAutoScroll(): void {
    stopAutoScroll();
    autoScrollActive.value = true;
    scrollIntervalId = setInterval(() => {
      if (!scrollPausedByTouch) {
        doScrollStep();
      }
    }, 100);
  }

  function stopAutoScroll(): void {
    autoScrollActive.value = false;
    if (scrollIntervalId !== null) {
      clearInterval(scrollIntervalId);
      scrollIntervalId = null;
    }
  }

  function toggleAutoScroll(): void {
    if (autoScrollActive.value) {
      stopAutoScroll();
    } else {
      startAutoScroll();
    }
  }

  function onTouchStart(): void {
    if (!autoScrollActive.value) return;
    scrollPausedByTouch = true;
  }

  function onTouchEnd(): void {
    scrollPausedByTouch = false;
  }

  // ==================== 音量键翻页 ====================
  const volumeKeysEnabled = ref(loadBool('volume_keys_enabled', false));

  function toggleVolumeKeys(): void {
    volumeKeysEnabled.value = !volumeKeysEnabled.value;
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!volumeKeysEnabled.value) return;
    // 避免在输入框中触发
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'AudioVolumeDown') {
      e.preventDefault();
      props.onNextPage();
    } else if (e.key === 'AudioVolumeUp') {
      e.preventDefault();
      props.onPrevPage();
    }
  }

  // ==================== 专注计时器 ====================
  const focusActive = ref(false);
  const elapsedSeconds = ref(0);
  let focusIntervalId: ReturnType<typeof setInterval> | null = null;

  const formattedTime = computed(() => {
    const total = Math.max(0, Math.floor(elapsedSeconds.value));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  });

  function startFocus(): void {
    if (focusActive.value) return;
    stopFocus();
    focusActive.value = true;
    focusIntervalId = setInterval(() => {
      elapsedSeconds.value += 1;
    }, 1000);
  }

  function stopFocus(): void {
    focusActive.value = false;
    if (focusIntervalId !== null) {
      clearInterval(focusIntervalId);
      focusIntervalId = null;
    }
  }

  function resetFocus(): void {
    stopFocus();
    elapsedSeconds.value = 0;
  }

  // ==================== 阅读统计 ====================
  const wordsRead = ref(loadNumber('words_read', 0));
  const readingDurationSeconds = ref(loadNumber('reading_duration_seconds', 0));

  const readingSpeed = computed(() => {
    if (readingDurationSeconds.value <= 0) return 0;
    return Math.round((wordsRead.value / readingDurationSeconds.value) * 60);
  });

  function recordReadingSession(durationSeconds: number, words: number): void {
    if (durationSeconds <= 0 || words <= 0) return;
    readingDurationSeconds.value += durationSeconds;
    wordsRead.value += words;
  }

  function resetStats(): void {
    wordsRead.value = 0;
    readingDurationSeconds.value = 0;
  }

  // ==================== 持久化 ====================
  watch(autoScrollSpeed, (value) => {
    saveNumber('auto_scroll_speed', value);
  });

  watch(volumeKeysEnabled, (value) => {
    saveBool('volume_keys_enabled', value);
  });

  watch(wordsRead, (value) => {
    saveNumber('words_read', value);
  });

  watch(readingDurationSeconds, (value) => {
    saveNumber('reading_duration_seconds', value);
  });

  // ==================== 生命周期 ====================
  onMounted(() => {
    const container = props.containerRef.value;
    if (container) {
      container.addEventListener('touchstart', onTouchStart, { passive: true });
      container.addEventListener('touchend', onTouchEnd, { passive: true });
      container.addEventListener('pointerdown', onTouchStart, { passive: true });
      container.addEventListener('pointerup', onTouchEnd, { passive: true });
    }
    window.addEventListener('keydown', onKeyDown);
  });

  onUnmounted(() => {
    stopAutoScroll();
    stopFocus();
    window.removeEventListener('keydown', onKeyDown);
    const container = props.containerRef.value;
    if (container) {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('pointerdown', onTouchStart);
      container.removeEventListener('pointerup', onTouchEnd);
    }
  });

  return {
    // 自动滚动
    autoScrollActive,
    autoScrollSpeed,
    startAutoScroll,
    stopAutoScroll,
    toggleAutoScroll,
    // 音量键翻页
    volumeKeysEnabled,
    toggleVolumeKeys,
    // 专注计时器
    focusActive,
    elapsedSeconds,
    startFocus,
    stopFocus,
    resetFocus,
    formattedTime,
    // 阅读统计
    wordsRead,
    readingDurationSeconds,
    readingSpeed,
    recordReadingSession,
    resetStats,
  };
}
