<template>
  <div v-if="voteData" class="plot-vote-card mobile-focus-light-vars">
    <div class="plot-vote-card__header">
      <el-icon class="plot-vote-card__icon" :size="18"><TrendCharts /></el-icon>
      <span class="plot-vote-card__title">{{ voteData.question }}</span>
    </div>

    <!-- 选项列表 -->
    <div class="plot-vote-card__options">
      <button
        v-for="(opt, i) in displayOptions"
        :key="opt.id"
        class="plot-vote-card__option"
        :class="{
          'plot-vote-card__option--selected': selectedOption === opt.id,
          'plot-vote-card__option--voted': hasVoted,
          'plot-vote-card__option--winner': isClosed && voteData.winnerOptionId === opt.id,
          'plot-vote-card__option--enriched': opt.enriched,
        }"
        :disabled="hasVoted || isClosed || voting"
        @click="selectOption(opt.id)"
      >
        <div class="plot-vote-card__option-label">
          <span class="plot-vote-card__option-letter">{{ String.fromCharCode(65 + i) }}</span>
          <div class="plot-vote-card__option-content">
            <span v-if="opt.title" class="plot-vote-card__option-title">{{ opt.title }}</span>
            <span class="plot-vote-card__option-text">{{ opt.text }}</span>
            <span v-if="voteData.myVote === opt.id" class="plot-vote-card__option-check">
              <el-icon :size="12"><Check /></el-icon>
              你
            </span>
            <span v-if="isClosed && voteData.winnerOptionId === opt.id" class="plot-vote-card__option-winner">胜出</span>
          </div>
          <span v-if="opt.riskLevel" class="plot-vote-card__risk" :class="`plot-vote-card__risk--${opt.riskLevel}`">{{ riskLabel(opt.riskLevel) }}</span>
        </div>
        <p v-if="opt.synopsis" class="plot-vote-card__option-synopsis">{{ opt.synopsis }}</p>
        <p v-if="opt.impactPrediction" class="plot-vote-card__option-impact">影响：{{ opt.impactPrediction }}</p>
        <div v-if="hasVoted || isClosed" class="plot-vote-card__option-bar">
          <div
            class="plot-vote-card__option-bar-fill"
            :class="{ 'plot-vote-card__option-bar-fill--winner': isClosed && voteData.winnerOptionId === opt.id }"
            :style="{ width: getPercentage(opt.id) + '%' }"
          />
        </div>
        <div v-if="hasVoted || isClosed" class="plot-vote-card__option-stats">
          <span class="plot-vote-card__option-percent">{{ getPercentage(opt.id) }}%</span>
          <span class="plot-vote-card__option-count">{{ getCount(opt.id) }} 票</span>
        </div>
      </button>
    </div>

    <!-- 底部状态 -->
    <div class="plot-vote-card__footer">
      <template v-if="isClosed">
        <span class="plot-vote-card__closed">投票已结束 · 共 {{ voteData.stats.totalVotes }} 票</span>
      </template>
      <template v-else-if="hasVoted">
        <span class="plot-vote-card__voted">已投票 · 截止后通知你结果</span>
      </template>
      <template v-else-if="!isLoggedIn">
        <span class="plot-vote-card__login-hint">登录后可投票</span>
      </template>
      <template v-else>
        <button
          class="plot-vote-card__vote-btn"
          :disabled="!selectedOption || voting"
          @click="submitVote"
        >
          {{ voting ? '提交中...' : '投票' }}
        </button>
      </template>
      <span v-if="!isClosed" class="plot-vote-card__countdown">{{ countdownText }}</span>
      <span v-if="!isClosed" class="plot-vote-card__total">{{ voteData.stats.totalVotes }} 人已投</span>
    </div>

    <div v-if="error" class="plot-vote-card__error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { Check, TrendCharts } from '@element-plus/icons-vue';
import { useAuthStore } from '../../stores/auth';
import { usePlotVote } from '../../composables/usePlotVote';
import type { VotePointWithStats, EnrichedVoteOption } from '../../api/plot-votes';

interface DisplayOption {
  id: string;
  text: string;
  title?: string;
  synopsis?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  impactPrediction?: string;
  enriched: boolean;
}

const props = defineProps<{
  novelId: string;
  chapterId: string;
}>();

const authStore = useAuthStore();
const vote = usePlotVote();

const selectedOption = ref<string | null>(null);
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const voteData = computed(() => vote.currentVote.value);
const isLoggedIn = computed(() => authStore.isAuthenticated);
const hasVoted = computed(() => !!voteData.value?.myVote);
const isClosed = computed(() => voteData.value?.status === 'closed');
const voting = computed(() => vote.voting.value);
const error = computed(() => vote.error.value);

/** 合并 options 与 enrichedOptions，生成展示用选项列表 */
const displayOptions = computed<DisplayOption[]>(() => {
  if (!voteData.value) return [];
  const enrichedMap = new Map<string, EnrichedVoteOption>();
  for (const opt of voteData.value.enrichedOptions ?? []) {
    enrichedMap.set(opt.id, opt);
  }
  return voteData.value.options.map((opt) => {
    const enriched = enrichedMap.get(opt.id);
    return {
      id: opt.id,
      text: opt.text,
      title: enriched?.title,
      synopsis: enriched?.synopsis,
      riskLevel: enriched?.riskLevel,
      impactPrediction: enriched?.impactPrediction,
      enriched: !!enriched,
    };
  });
});

function riskLabel(level: 'low' | 'medium' | 'high'): string {
  const labels: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险' };
  return labels[level] ?? level;
}

const countdownText = computed(() => {
  if (!voteData.value || isClosed.value) return '';
  const diff = voteData.value.deadline - now.value;
  if (diff <= 0) return '已截止';
  const hours = Math.floor(diff / 3600_000);
  const minutes = Math.floor((diff % 3600_000) / 60_000);
  if (hours > 0) return `剩余 ${hours} 小时`;
  return `剩余 ${minutes} 分钟`;
});

function getPercentage(optionId: string): number {
  const stat = voteData.value?.stats.optionStats.find((s) => s.optionId === optionId);
  return stat?.percentage ?? 0;
}

function getCount(optionId: string): number {
  const stat = voteData.value?.stats.optionStats.find((s) => s.optionId === optionId);
  return stat?.count ?? 0;
}

function selectOption(optionId: string) {
  if (hasVoted.value || isClosed.value) return;
  selectedOption.value = optionId;
}

async function submitVote() {
  if (!selectedOption.value || !voteData.value) return;
  const success = await vote.vote(voteData.value.id, selectedOption.value);
  if (success) {
    // 重新加载获取最新数据
    await vote.loadByChapter(props.novelId, props.chapterId);
  }
}

async function loadData() {
  await vote.loadByChapter(props.novelId, props.chapterId);
  if (voteData.value?.myVote) {
    selectedOption.value = voteData.value.myVote;
  }
}

onMounted(() => {
  loadData();
  timer = setInterval(() => {
    now.value = Date.now();
  }, 60_000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.plot-vote-card {
  background: color-mix(in srgb, var(--mobile-focus-accent) 6%, var(--nw-bg-secondary));
  border-left: 3px solid var(--mobile-focus-accent);
  border-radius: 0 14px 14px 0;
  padding: 16px;
  margin: 24px 0;
  color-scheme: light;
}
.plot-vote-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}
.plot-vote-card__icon {
  color: var(--mobile-focus-accent);
}
.plot-vote-card__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--nw-text-primary);
}
.plot-vote-card__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.plot-vote-card__option {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--nw-border) 78%, transparent);
  border-radius: 12px;
  background: var(--nw-bg-secondary);
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: all 0.2s;
}
.plot-vote-card__option:disabled {
  cursor: default;
}
.plot-vote-card__option--selected {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 72%, var(--nw-border));
  background: color-mix(in srgb, var(--mobile-focus-accent) 7%, var(--nw-bg-secondary));
}
.plot-vote-card__option--voted {
  cursor: default;
}
.plot-vote-card__option--winner {
  border-color: color-mix(in srgb, var(--mobile-focus-status-gold) 72%, var(--nw-border));
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 7%, var(--nw-bg-secondary));
}
.plot-vote-card__option-label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.plot-vote-card__option-content {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}
.plot-vote-card__option-title {
  width: 100%;
  font-size: 14px;
  font-weight: 600;
  color: var(--nw-text-primary);
  line-height: 1.4;
}
.plot-vote-card__option-letter {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--nw-border) 34%, var(--nw-bg-secondary));
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.plot-vote-card__option--selected .plot-vote-card__option-letter {
  background: var(--mobile-focus-accent);
  color: var(--mobile-focus-on-accent);
}
.plot-vote-card__option-text {
  flex: 1;
  font-size: 14px;
  color: var(--nw-text-primary);
  font-weight: 500;
}
.plot-vote-card__option-check {
  font-size: 12px;
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.plot-vote-card__option-winner {
  font-size: 11px;
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 88%, var(--nw-text-primary));
  font-weight: 700;
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 12%, var(--nw-bg-secondary));
  padding: 2px 8px;
  border-radius: 6px;
}
.plot-vote-card__risk {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
  margin-top: 2px;
}
.plot-vote-card__risk--low {
  background: color-mix(in srgb, var(--mobile-focus-status-success) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-success) 88%, var(--nw-text-primary));
}
.plot-vote-card__risk--medium {
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 88%, var(--nw-text-primary));
}
.plot-vote-card__risk--high {
  background: color-mix(in srgb, var(--mobile-focus-status-danger) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-danger) 88%, var(--nw-text-primary));
}
.plot-vote-card__option-synopsis {
  margin: 4px 0 0 32px;
  font-size: 12px;
  color: var(--nw-text-secondary);
  line-height: 1.5;
}
.plot-vote-card__option-impact {
  margin: 2px 0 0 32px;
  font-size: 11px;
  color: var(--nw-text-muted);
  line-height: 1.4;
}
.plot-vote-card__option-bar {
  height: 6px;
  background: color-mix(in srgb, var(--nw-border) 34%, var(--nw-bg-secondary));
  border-radius: 3px;
  overflow: hidden;
}
.plot-vote-card__option-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  border-radius: 3px;
  transition: width 0.4s ease;
}
.plot-vote-card__option-bar-fill--winner {
  background: linear-gradient(
    90deg,
    var(--mobile-focus-status-gold),
    color-mix(in srgb, var(--mobile-focus-status-gold) 70%, var(--mobile-focus-accent-strong))
  );
}
.plot-vote-card__option-stats {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.plot-vote-card__option-percent {
  font-weight: 700;
  color: var(--nw-text-secondary);
  font-variant-numeric: tabular-nums;
}
.plot-vote-card__option-count {
  color: var(--nw-text-muted);
}
.plot-vote-card__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.plot-vote-card__vote-btn {
  flex: 1;
  height: 42px;
  border: none;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--mobile-focus-accent), var(--mobile-focus-accent-strong));
  color: var(--mobile-focus-on-accent);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.plot-vote-card__vote-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.plot-vote-card__voted,
.plot-vote-card__closed,
.plot-vote-card__login-hint {
  font-size: 13px;
  color: var(--nw-text-secondary);
}
.plot-vote-card__countdown {
  font-size: 12px;
  color: var(--nw-text-muted);
  margin-left: auto;
}
.plot-vote-card__total {
  font-size: 12px;
  color: var(--nw-text-muted);
}
.plot-vote-card__error {
  margin-top: 8px;
  font-size: 12px;
  color: color-mix(in srgb, var(--mobile-focus-status-danger) 88%, var(--nw-text-primary));
}
</style>
