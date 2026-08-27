<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { RefreshRight } from '@element-plus/icons-vue';
import { sliderCaptchaApi, type SliderChallengeResponse } from '../../api/slider-captcha';

const emit = defineEmits<{
  verified: [payload: { challengeId: string; position: number; duration: number }];
  'challenge-reset': [];
  loaded: [];
}>();

const HANDLE_SIZE = 40;
const TRACK_PADDING = 4;
/** 前端判定"滑到底"的比例阈值，与后端保持一致 */
const COMPLETE_RATIO = 0.9;
/** 挑战加载失败时的自动重试次数与间隔 */
const LOAD_MAX_RETRIES = 2;
const LOAD_RETRY_DELAY_MS = 1200;

const challenge = ref<SliderChallengeResponse | null>(null);
const loading = ref(false);
/** 连续多次加载失败后置真，提示用户手动重试 */
const loadFailed = ref(false);
const status = ref<'idle' | 'dragging' | 'success' | 'failed'>('idle');
const currentX = ref(0);
const dragStartTime = ref(0);
const dragStartX = ref(0);
const startOffsetX = ref(0);
const renderedTrackWidth = ref(0);

const trackRef = ref<HTMLElement | null>(null);

const trackWidth = computed(() => challenge.value?.trackWidth ?? 280);
const trackFrameWidth = computed(() => trackWidth.value + TRACK_PADDING * 2);
const visualTrackWidth = computed(() => renderedTrackWidth.value || trackFrameWidth.value);
const maxDrag = computed(() => Math.max(0, visualTrackWidth.value - HANDLE_SIZE - TRACK_PADDING * 2));
const serverMaxDrag = computed(() => Math.max(0, trackWidth.value - HANDLE_SIZE));

const trackFrameStyle = computed(() => ({
  '--slider-track-width': `${trackFrameWidth.value}px`,
}));

const handleStyle = computed(() => ({
  transform: `translateX(${currentX.value}px)`,
  transition: status.value === 'dragging' ? 'none' : 'transform 0.3s ease',
}));

const statusText = computed(() => {
  switch (status.value) {
    case 'idle': return '滑动完成验证';
    case 'dragging': return '继续拖动…';
    case 'success': return '验证通过';
    case 'failed': return '未滑到底，请重试';
    default: return '';
  }
});

function updateTrackMetrics() {
  const width = trackRef.value?.clientWidth ?? 0;
  if (width > 0) {
    renderedTrackWidth.value = width;
  }
}

function resolveServerPosition(position: number): number {
  if (maxDrag.value <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, position / maxDrag.value));
  return serverMaxDrag.value * ratio;
}

async function loadChallenge(retriesLeft = LOAD_MAX_RETRIES) {
  if (loading.value) return;
  emit('challenge-reset');
  loading.value = true;
  loadFailed.value = false;
  status.value = 'idle';
  currentX.value = 0;
  try {
    challenge.value = await sliderCaptchaApi.generate();
    emit('loaded');
    await nextTick();
    updateTrackMetrics();
  } catch {
    challenge.value = null;
    // 首次/中途加载失败时自动重试，避免出现“空壳滑块、无法登录”
    if (retriesLeft > 0) {
      loading.value = false;
      window.setTimeout(() => {
        void loadChallenge(retriesLeft - 1);
      }, LOAD_RETRY_DELAY_MS);
      return;
    }
    // 重试用尽：显示可点击重试的兜底提示
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

function getClientX(e: MouseEvent | TouchEvent): number {
  if ('touches' in e) {
    return e.touches[0]?.clientX ?? 0;
  }
  return e.clientX;
}

function onDragStart(e: MouseEvent | TouchEvent) {
  if (status.value === 'success' || loading.value || !challenge.value) return;
  e.preventDefault();
  updateTrackMetrics();

  status.value = 'dragging';
  dragStartTime.value = Date.now();
  dragStartX.value = getClientX(e);
  startOffsetX.value = currentX.value;

  document.addEventListener('mousemove', onDragMove, { passive: false });
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend', onDragEnd);
}

function onDragMove(e: MouseEvent | TouchEvent) {
  if (status.value !== 'dragging') return;
  e.preventDefault();

  const deltaX = getClientX(e) - dragStartX.value;
  const newX = Math.max(0, Math.min(maxDrag.value, startOffsetX.value + deltaX));
  currentX.value = newX;
}

function onDragEnd() {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('touchend', onDragEnd);

  if (status.value !== 'dragging' || !challenge.value) return;

  const duration = Date.now() - dragStartTime.value;
  const position = resolveServerPosition(currentX.value);

  // 滑到底：位置 >= 可用宽度的 90%
  if (currentX.value >= maxDrag.value * COMPLETE_RATIO && duration >= 300) {
    status.value = 'success';
    emit('verified', {
      challengeId: challenge.value.challengeId,
      position,
      duration,
    });
  } else {
    status.value = 'failed';
    setTimeout(() => {
      currentX.value = 0;
      status.value = 'idle';
    }, 800);
  }
}

function reset() {
  status.value = 'idle';
  currentX.value = 0;
  void loadChallenge();
}

onMounted(() => {
  void loadChallenge();
  window.addEventListener('resize', updateTrackMetrics);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('touchend', onDragEnd);
  window.removeEventListener('resize', updateTrackMetrics);
});

defineExpose({ reset, loadChallenge });
</script>

<template>
  <div class="slider-captcha" :class="[`slider-captcha--${status}`]">
    <div class="slider-captcha__label">
      <span class="slider-captcha__text">{{ statusText }}</span>
    </div>

    <div class="slider-captcha__control">
      <div
        v-if="loading"
        class="slider-captcha__loading"
      >
        加载中...
      </div>

      <div
        v-else-if="challenge"
        ref="trackRef"
        class="slider-captcha__track"
        :style="trackFrameStyle"
      >
        <div
          class="slider-captcha__fill"
          :style="{ width: `${currentX + HANDLE_SIZE / 2}px` }"
        />

        <div class="slider-captcha__hint">
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
            <path d="M1 6h14M11 1l4 5-4 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>

        <div
          class="slider-captcha__handle"
          :style="handleStyle"
          @mousedown="onDragStart"
          @touchstart="onDragStart"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M7 4l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      </div>

      <button
        v-else-if="loadFailed"
        type="button"
        class="slider-captcha__retry"
        @click="reset"
      >
        验证码加载失败，点击重试
      </button>

      <button
        type="button"
        class="slider-captcha__refresh"
        :disabled="loading"
        title="刷新验证"
        aria-label="刷新验证"
        @click="reset"
      >
        <el-icon :size="18"><RefreshRight /></el-icon>
      </button>
    </div>
  </div>
</template>

<style scoped>
.slider-captcha {
  --sc-bg: rgba(255, 255, 255, 0.06);
  --sc-track-bg: rgba(255, 255, 255, 0.08);
  --sc-handle-bg: #38bdf8;
  --sc-handle-hover: #0ea5e9;
  --sc-fill-bg: rgba(56, 189, 248, 0.15);
  --sc-success-color: #22c55e;
  --sc-fail-color: #ef4444;
  --sc-text: rgba(255, 255, 255, 0.6);

  user-select: none;
}

.slider-captcha__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
  font-size: 13px;
  color: var(--sc-text);
}

.slider-captcha__control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: calc(var(--slider-track-width, 288px) + 52px);
}

.slider-captcha--success .slider-captcha__text {
  color: var(--sc-success-color);
}

.slider-captcha--failed .slider-captcha__text {
  color: var(--sc-fail-color);
}

.slider-captcha__refresh {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.18);
  color: var(--sc-handle-bg);
  cursor: pointer;
  padding: 0;
  border-radius: 14px;
  transition: background 0.2s, border-color 0.2s, transform 0.2s;
}

.slider-captcha__refresh:hover:not(:disabled) {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.32);
  transform: translateY(-1px);
}

.slider-captcha__refresh:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.slider-captcha__loading {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sc-text);
  font-size: 13px;
  background: var(--sc-track-bg);
  border-radius: 14px;
}

.slider-captcha__retry {
  height: 44px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sc-handle-bg);
  font-size: 13px;
  background: var(--sc-track-bg);
  border: 1px dashed rgba(56, 189, 248, 0.4);
  border-radius: 14px;
  cursor: pointer;
}

.slider-captcha__track {
  position: relative;
  height: 44px;
  width: min(100%, var(--slider-track-width, 288px));
  background: var(--sc-track-bg);
  border-radius: 14px;
  overflow: hidden;
  touch-action: none;
}

.slider-captcha__fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background: var(--sc-fill-bg);
  border-radius: 22px 0 0 22px;
  transition: width 0.05s linear;
  pointer-events: none;
}

.slider-captcha--success .slider-captcha__fill {
  background: rgba(34, 197, 94, 0.2);
}

.slider-captcha--failed .slider-captcha__fill {
  background: rgba(239, 68, 68, 0.2);
}

.slider-captcha__hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: rgba(255, 255, 255, 0.25);
  pointer-events: none;
  transition: opacity 0.2s;
}

.slider-captcha--dragging .slider-captcha__hint,
.slider-captcha--success .slider-captcha__hint {
  opacity: 0;
}

.slider-captcha__handle {
  position: absolute;
  left: 4px;
  top: 2px;
  width: 40px;
  height: 40px;
  background: var(--sc-handle-bg);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  z-index: 2;
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.slider-captcha__handle:hover {
  background: var(--sc-handle-hover);
}

.slider-captcha__handle:active {
  cursor: grabbing;
}

.slider-captcha--success .slider-captcha__handle {
  background: var(--sc-success-color);
  cursor: default;
}

.slider-captcha--failed .slider-captcha__handle {
  background: var(--sc-fail-color);
  animation: slider-shake 0.4s ease;
}

@keyframes slider-shake {
  0%, 100% { transform: translateX(var(--x, 0)); }
  20% { transform: translateX(calc(var(--x, 0) - 6px)); }
  40% { transform: translateX(calc(var(--x, 0) + 6px)); }
  60% { transform: translateX(calc(var(--x, 0) - 4px)); }
  80% { transform: translateX(calc(var(--x, 0) + 4px)); }
}

/* 浅色模式覆盖 */
html:not(.dark) .slider-captcha {
  --sc-bg: rgba(0, 0, 0, 0.03);
  --sc-track-bg: rgba(0, 0, 0, 0.06);
  --sc-fill-bg: rgba(56, 189, 248, 0.1);
  --sc-text: rgba(0, 0, 0, 0.5);
}

html:not(.dark) .slider-captcha__refresh {
  background: rgba(14, 165, 233, 0.08);
  border-color: rgba(14, 165, 233, 0.2);
}
</style>
