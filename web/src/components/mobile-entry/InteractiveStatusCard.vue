<template>
  <div v-if="config?.enabled" class="interactive-status">
    <!-- 顶部：阶段指示器 -->
    <div class="interactive-status__header" :class="`interactive-status__header--${config.phase}`">
      <span class="interactive-status__phase-dot" />
      <div class="interactive-status__phase-info">
        <span class="interactive-status__phase-label">{{ phaseLabel }}</span>
        <span v-if="config.currentRound > 0" class="interactive-status__round">第 {{ config.currentRound }} 轮</span>
      </div>
      <button
        v-if="config.phase === 'idle'"
        class="interactive-status__start-btn"
        :disabled="starting"
        @click="start"
      >{{ starting ? '启动中...' : '启动连载' }}</button>
    </div>

    <!-- 进度条 -->
    <div v-if="config.phase !== 'idle'" class="interactive-status__progress">
      <div class="interactive-status__progress-track">
        <div class="interactive-status__progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
      <span class="interactive-status__progress-text">{{ progressLabel }}</span>
    </div>

    <!-- 投票倒计时（vote_open 阶段） -->
    <div v-if="config.phase === 'vote_open' && config.currentVoteDeadline" class="interactive-status__countdown">
      <span class="interactive-status__countdown-icon">
        <el-icon><Clock /></el-icon>
      </span>
      <span class="interactive-status__countdown-text">{{ countdownText }}</span>
    </div>

    <!-- 停滞提示 -->
    <div v-if="config.phase === 'stalled'" class="interactive-status__stalled-tip">
      票数不足已暂停推进，可在设置中恢复或调整阈值
    </div>

    <!-- 最近一轮走向 -->
    <div v-if="config.lastWinningDirection" class="interactive-status__direction">
      <span class="interactive-status__direction-label">上轮走向</span>
      <span class="interactive-status__direction-text">{{ config.lastWinningDirection }}</span>
    </div>

    <!-- 历史摘要 -->
    <div v-if="config.history.length > 0" class="interactive-status__history">
      <div class="interactive-status__history-header" @click="historyExpanded = !historyExpanded">
        <span class="interactive-status__history-title">历史轮次（{{ config.history.length }}）</span>
        <span class="interactive-status__history-toggle">{{ historyExpanded ? '收起' : '展开' }}</span>
      </div>
      <div v-if="historyExpanded" class="interactive-status__history-list">
        <div
          v-for="entry in recentHistory"
          :key="entry.round"
          class="interactive-status__history-item"
          :class="`interactive-status__history-item--${entry.outcome}`"
        >
          <span class="interactive-status__history-round">第 {{ entry.round }} 轮</span>
          <span class="interactive-status__history-votes">{{ entry.totalVotes }} 票</span>
          <span class="interactive-status__history-outcome">{{ outcomeLabel(entry.outcome) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Clock } from '@element-plus/icons-vue';
import { useInteractiveNovel } from '../../composables/useInteractiveNovel';
import type { InteractiveRoundHistory } from '../../api/interactive';

/**
 * 互动小说作者侧状态卡片。
 * 展示当前轮次、阶段、投票倒计时、历史摘要。
 * 嵌入 MobileNovelDetail.vue，作者可一眼掌握连载进度。
 */
const props = defineProps<{
  novelId: string;
}>();

const novelIdRef = computed(() => props.novelId);
const { config, loadConfig, start: doStart } = useInteractiveNovel(novelIdRef);

const starting = ref(false);
const historyExpanded = ref(false);
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const phaseLabel = computed(() => {
  const phase = config.value?.phase;
  if (!phase) return '';
  const labels: Record<string, string> = {
    idle: '等待启动',
    generating: '正在生成本轮章节',
    publishing: '正在发布章节',
    vote_open: '投票进行中',
    vote_closing: '投票截止，正在计票',
    advancing: '已采纳走向，准备下一轮',
    stalled: '票数不足，暂停推进',
  };
  return labels[phase] ?? phase;
});

const progressPercent = computed(() => {
  const phase = config.value?.phase;
  if (!phase) return 0;
  const map: Record<string, number> = {
    idle: 0,
    generating: 25,
    publishing: 45,
    vote_open: 70,
    vote_closing: 85,
    advancing: 95,
    stalled: 100,
  };
  return map[phase] ?? 0;
});

const progressLabel = computed(() => {
  const phase = config.value?.phase;
  if (!phase || phase === 'idle') return '';
  const labels: Record<string, string> = {
    generating: '生成中',
    publishing: '发布中',
    vote_open: '投票中',
    vote_closing: '计票中',
    advancing: '推进中',
    stalled: '已停滞',
  };
  return labels[phase] ?? '';
});

const countdownText = computed(() => {
  if (!config.value?.currentVoteDeadline) return '';
  const diff = config.value.currentVoteDeadline - now.value;
  if (diff <= 0) return '已截止';
  const hours = Math.floor(diff / 3600_000);
  const minutes = Math.floor((diff % 3600_000) / 60_000);
  if (hours > 0) return `剩余 ${hours} 小时 ${minutes} 分`;
  return `剩余 ${minutes} 分钟`;
});

const recentHistory = computed<InteractiveRoundHistory[]>(() => {
  if (!config.value?.history) return [];
  return [...config.value.history].reverse().slice(0, 10);
});

function outcomeLabel(outcome: InteractiveRoundHistory['outcome']): string {
  const labels: Record<string, string> = {
    completed: '已推进',
    stalled: '停滞',
    manual: '手动',
  };
  return labels[outcome] ?? outcome;
}

async function start() {
  starting.value = true;
  await doStart();
  starting.value = false;
}

async function refresh() {
  await loadConfig();
}

onMounted(() => {
  refresh();
  // 每秒更新倒计时
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  // 每 30 秒轮询配置（获取最新阶段）
  pollTimer = setInterval(refresh, 30_000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.interactive-status {
  background: linear-gradient(135deg, color-mix(in srgb, var(--mobile-focus-accent) 10%, var(--nw-bg-secondary)), color-mix(in srgb, var(--mobile-focus-accent-strong) 8%, var(--nw-bg-secondary)));
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 15%, var(--nw-border));
  border-radius: 16px;
  padding: 16px;
  margin: 12px 0;
}

.interactive-status__header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.interactive-status__phase-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--mobile-focus-accent);
  flex-shrink: 0;
  animation: interactive-status-pulse 1.5s ease-in-out infinite;
}

@keyframes interactive-status-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

.interactive-status__header--stalled .interactive-status__phase-dot { background: var(--mobile-focus-status-gold); }
.interactive-status__header--vote_open .interactive-status__phase-dot { background: var(--mobile-focus-status-success); }
.interactive-status__header--idle .interactive-status__phase-dot {
  background: var(--nw-text-muted);
  animation: none;
}

.interactive-status__phase-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.interactive-status__phase-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.interactive-status__round {
  font-size: 12px;
  color: var(--mobile-focus-accent);
  font-weight: 500;
}

.interactive-status__start-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.interactive-status__start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.interactive-status__progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.interactive-status__progress-track {
  flex: 1;
  height: 6px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent);
  border-radius: 3px;
  overflow: hidden;
}

.interactive-status__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  border-radius: 3px;
  transition: width var(--nw-duration-normal) var(--nw-ease-smooth);
  position: relative;
  overflow: hidden;
}

.interactive-status__progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
  animation: interactive-progress-shimmer 1.8s ease-in-out infinite;
}

@keyframes interactive-progress-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}

.interactive-status__header--stalled ~ .interactive-status__progress .interactive-status__progress-fill {
  background: linear-gradient(90deg, var(--mobile-focus-status-gold), color-mix(in srgb, var(--mobile-focus-status-gold) 74%, var(--mobile-focus-status-danger)));
}

.interactive-status__progress-text {
  font-size: 12px;
  color: var(--mobile-focus-accent);
  font-weight: 600;
  min-width: 48px;
  text-align: right;
}

.interactive-status__countdown {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--mobile-focus-status-success) 8%, transparent);
  border-radius: 10px;
}

.interactive-status__countdown-icon {
  display: grid;
  place-items: center;
  font-size: 14px;
  color: var(--mobile-focus-status-success);
}

.interactive-status__countdown-text {
  font-size: 13px;
  color: color-mix(in srgb, var(--mobile-focus-status-success) 86%, var(--nw-text-primary));
  font-weight: 500;
}

.interactive-status__stalled-tip {
  margin-top: 12px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 8%, transparent);
  border-radius: 10px;
  font-size: 13px;
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 86%, var(--nw-text-primary));
  line-height: 1.5;
}

.interactive-status__direction {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--nw-bg-secondary) 72%, transparent);
  border-radius: 10px;
}

.interactive-status__direction-label {
  font-size: 12px;
  color: var(--nw-text-muted);
  flex-shrink: 0;
  font-weight: 500;
}

.interactive-status__direction-text {
  font-size: 13px;
  color: var(--nw-text-secondary);
  line-height: 1.5;
}

.interactive-status__history {
  margin-top: 12px;
}

.interactive-status__history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  cursor: pointer;
}

.interactive-status__history-title {
  font-size: 13px;
  color: var(--nw-text-secondary);
  font-weight: 500;
}

.interactive-status__history-toggle {
  font-size: 12px;
  color: var(--mobile-focus-accent);
}

.interactive-status__history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.interactive-status__history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--nw-bg-secondary) 64%, transparent);
  border-radius: 8px;
  font-size: 12px;
}

.interactive-status__history-item--stalled {
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 6%, transparent);
}

.interactive-status__history-round {
  color: var(--nw-text-secondary);
  font-weight: 500;
}

.interactive-status__history-votes {
  color: var(--nw-text-muted);
  flex: 1;
}

.interactive-status__history-outcome {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--mobile-focus-accent) 10%, transparent);
  color: var(--mobile-focus-accent);
}

.interactive-status__history-item--stalled .interactive-status__history-outcome {
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 12%, transparent);
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 86%, var(--nw-text-primary));
}
</style>
