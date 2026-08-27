<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Close, StarFilled, TrendCharts } from '@element-plus/icons-vue';
import { fetchVoteByChapter, adoptVotePoint, type VotePointWithStats } from '../../api/plot-votes';

const props = defineProps<{
  visible: boolean;
  novelId: string;
  /** 上一章章节号（投票点挂载的章节） */
  previousChapterNumber: number | null;
}>();

const emit = defineEmits<{
  /** 作者采纳时，把胜出选项文本回填到创作方向 */
  adopt: [text: string];
}>();

const voteData = ref<VotePointWithStats | null>(null);
const loading = ref(false);
const dismissed = ref(false);
const adopting = ref(false);

function getWinnerOption(): VotePointWithStats['options'][number] | null {
  if (!voteData.value?.winnerOptionId) return null;
  return voteData.value.options.find((o) => o.id === voteData.value!.winnerOptionId) ?? null;
}

function getLeadingOption(): VotePointWithStats['options'][number] | null {
  const data = voteData.value;
  if (!data || data.stats.totalVotes === 0) return null;
  const top = [...data.stats.optionStats].sort((a, b) => b.count - a.count)[0];
  if (!top) return null;
  return data.options.find((o) => o.id === top.optionId) ?? null;
}

function getOptionPercentage(optionId: string): number {
  const stat = voteData.value?.stats.optionStats.find((s) => s.optionId === optionId);
  return stat ? Math.round(stat.percentage) : 0;
}

function getOptionCount(optionId: string): number {
  const stat = voteData.value?.stats.optionStats.find((s) => s.optionId === optionId);
  return stat?.count ?? 0;
}

function isLeading(optionId: string): boolean {
  const winner = getWinnerOption();
  if (winner) return winner.id === optionId;
  const leading = getLeadingOption();
  return leading?.id === optionId;
}

const winnerText = ref<string | null>(null);
const isClosed = ref(false);

async function loadVote() {
  if (!props.novelId || props.previousChapterNumber == null) {
    voteData.value = null;
    winnerText.value = null;
    return;
  }
  loading.value = true;
  try {
    const data = await fetchVoteByChapter(props.novelId, String(props.previousChapterNumber));
    voteData.value = data;
    dismissed.value = false;
    if (data) {
      isClosed.value = data.status === 'closed';
      const winner = getWinnerOption();
      if (winner) {
        winnerText.value = winner.text;
      } else if (!isClosed.value) {
        const leading = getLeadingOption();
        winnerText.value = leading?.text ?? null;
      } else {
        winnerText.value = null;
      }
    } else {
      winnerText.value = null;
    }
  } catch {
    voteData.value = null;
    winnerText.value = null;
  } finally {
    loading.value = false;
  }
}

async function handleAdopt() {
  if (!voteData.value || !winnerText.value) return;
  adopting.value = true;
  try {
    if (voteData.value.status === 'closed') {
      await adoptVotePoint(voteData.value.id, true);
    }
    emit('adopt', winnerText.value);
    dismissed.value = true;
    ElMessage.success('已采纳读者选择，已填入创作方向');
  } catch {
    ElMessage.error('采纳失败，可以手动复制');
    emit('adopt', winnerText.value);
    dismissed.value = true;
  } finally {
    adopting.value = false;
  }
}

function handleDismiss() {
  dismissed.value = true;
  if (voteData.value && voteData.value.status === 'closed' && !voteData.value.adopted) {
    adoptVotePoint(voteData.value.id, false).catch(() => undefined);
  }
}

watch(
  () => [props.visible, props.novelId, props.previousChapterNumber] as const,
  ([visible]) => {
    if (visible) {
      void loadVote();
    } else {
      voteData.value = null;
      winnerText.value = null;
      dismissed.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="voteData && !dismissed" class="vote-hint mobile-focus-light-vars">
    <div class="vote-hint__header">
      <el-icon class="vote-hint__icon" :size="18"><TrendCharts /></el-icon>
      <div class="vote-hint__title">
        <div class="vote-hint__title-row">
          <strong>读者投票{{ isClosed ? '结果' : '实时进展' }}</strong>
          <span v-if="isClosed" class="vote-hint__badge vote-hint__badge--closed">已结束</span>
          <span v-else class="vote-hint__badge vote-hint__badge--open">进行中</span>
        </div>
        <span class="vote-hint__question">{{ voteData.question }}</span>
      </div>
      <button class="vote-hint__close" type="button" aria-label="忽略" @click="handleDismiss">
        <el-icon :size="16"><Close /></el-icon>
      </button>
    </div>

    <!-- 所有选项列表 -->
    <div class="vote-hint__options">
      <div
        v-for="opt in voteData.options"
        :key="opt.id"
        class="vote-hint__option"
        :class="{ 'vote-hint__option--leading': isLeading(opt.id) }"
      >
        <div class="vote-hint__option-info">
          <el-icon v-if="isLeading(opt.id)" class="vote-hint__option-crown" :size="13"><StarFilled /></el-icon>
          <span class="vote-hint__option-text">{{ opt.text }}</span>
        </div>
        <div class="vote-hint__option-bar">
          <div
            class="vote-hint__option-bar-fill"
            :class="{ 'vote-hint__option-bar-fill--leading': isLeading(opt.id) }"
            :style="{ width: getOptionPercentage(opt.id) + '%' }"
          />
        </div>
        <div class="vote-hint__option-stats">
          <span class="vote-hint__option-pct">{{ getOptionPercentage(opt.id) }}%</span>
          <span class="vote-hint__option-count">{{ getOptionCount(opt.id) }} 票</span>
        </div>
      </div>
    </div>

    <div class="vote-hint__summary">
      共 {{ voteData.stats.totalVotes }} 票 ·
      <template v-if="winnerText">当前领先：{{ winnerText }}</template>
      <template v-else>暂无投票</template>
    </div>

    <div class="vote-hint__actions">
      <button
        class="vote-hint__btn vote-hint__btn--adopt"
        type="button"
        :disabled="adopting || !winnerText"
        @click="handleAdopt"
      >
        {{ adopting ? '采纳中...' : '采纳并填入方向' }}
      </button>
      <button class="vote-hint__btn vote-hint__btn--dismiss" type="button" @click="handleDismiss">不采纳</button>
    </div>
  </div>
</template>

<style scoped>
.vote-hint {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--mobile-focus-accent) 7%, var(--nw-bg-secondary)),
    color-mix(in srgb, var(--mobile-focus-accent-strong) 5%, var(--nw-bg-secondary))
  );
  border: 1px solid color-mix(in srgb, var(--mobile-focus-accent) 18%, var(--nw-border));
  color-scheme: light;
}

.vote-hint__header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.vote-hint__icon {
  line-height: 1;
  margin-top: 2px;
  color: var(--mobile-focus-accent);
}

.vote-hint__title {
  flex: 1;
  display: grid;
  gap: 4px;
  min-width: 0;
}

.vote-hint__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vote-hint__title strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--nw-text-primary);
}

.vote-hint__question {
  font-size: 12px;
  color: var(--nw-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vote-hint__badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  flex-shrink: 0;
}

.vote-hint__badge--closed {
  background: color-mix(in srgb, var(--mobile-focus-status-success) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-success) 88%, var(--nw-text-primary));
}

.vote-hint__badge--open {
  background: color-mix(in srgb, var(--mobile-focus-status-gold) 12%, var(--nw-bg-secondary));
  color: color-mix(in srgb, var(--mobile-focus-status-gold) 88%, var(--nw-text-primary));
}

.vote-hint__close {
  width: 24px;
  height: 24px;
  border: 0;
  background: transparent;
  line-height: 1;
  color: var(--nw-text-muted);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.vote-hint__options {
  display: grid;
  gap: 8px;
}

.vote-hint__option {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--nw-bg-secondary) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--nw-border) 58%, transparent);
}

.vote-hint__option--leading {
  border-color: color-mix(in srgb, var(--mobile-focus-accent) 42%, var(--nw-border));
  background: color-mix(in srgb, var(--mobile-focus-accent) 6%, var(--nw-bg-secondary));
}

.vote-hint__option-info {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.vote-hint__option-crown {
  line-height: 1.4;
  flex-shrink: 0;
  color: var(--mobile-focus-status-gold);
}

.vote-hint__option-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--nw-text-primary);
  line-height: 1.4;
}

.vote-hint__option-bar {
  height: 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--nw-border) 48%, transparent);
  overflow: hidden;
}

.vote-hint__option-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: color-mix(in srgb, var(--nw-text-muted) 44%, transparent);
  transition: width 0.3s ease;
}

.vote-hint__option-bar-fill--leading {
  background: var(--mobile-focus-accent);
}

.vote-hint__option-stats {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.vote-hint__option-pct {
  font-size: 13px;
  font-weight: 700;
  color: color-mix(in srgb, var(--mobile-focus-accent) 88%, var(--nw-text-primary));
}

.vote-hint__option-count {
  font-size: 11px;
  color: var(--nw-text-muted);
}

.vote-hint__summary {
  font-size: 11px;
  color: var(--nw-text-secondary);
  padding: 0 2px;
}

.vote-hint__actions {
  display: flex;
  gap: 8px;
}

.vote-hint__btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.vote-hint__btn--adopt {
  background: var(--mobile-focus-accent);
  color: var(--mobile-focus-on-accent);
  border-color: var(--mobile-focus-accent);
}

.vote-hint__btn--adopt:hover:not(:disabled) {
  background: var(--mobile-focus-accent-strong);
}

.vote-hint__btn--adopt:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.vote-hint__btn--dismiss {
  background: color-mix(in srgb, var(--nw-bg-secondary) 88%, transparent);
  color: var(--nw-text-secondary);
  border-color: color-mix(in srgb, var(--nw-border) 78%, transparent);
}

.vote-hint__btn--dismiss:hover {
  background: color-mix(in srgb, var(--nw-border) 28%, var(--nw-bg-secondary));
}
</style>
