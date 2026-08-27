<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { castVote, fetchVotesByNovel, type EnrichedVoteOption, type VotePointWithStats } from '../../api/plot-votes';
import { extractApiErrorMessage } from '../../api/errors';
import { useAuthStore } from '../../stores/auth';
import Icon from '../../components/shared/Icon.vue';
import Modal from '../../components/shared/Modal.vue';
import StateView from '../../components/shared/StateView.vue';

const props = defineProps<{ visible: boolean; novelId: string; title?: string; chapterId?: string }>();
const emit = defineEmits<{ 'update:visible': [value: boolean] }>();

const auth = useAuthStore();
const loading = ref(false);
const voting = ref(false);
const votes = ref<VotePointWithStats[]>([]);
const selected = ref<Record<string, string>>({});

const openVotes = computed(() => votes.value.filter((vote) => vote.status === 'open'));
const closedVotes = computed(() => votes.value.filter((vote) => vote.status !== 'open'));
const sortedVotes = computed(() => [...openVotes.value, ...closedVotes.value].sort((a, b) => {
  if (props.chapterId && a.chapterId === props.chapterId) return -1;
  if (props.chapterId && b.chapterId === props.chapterId) return 1;
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
  return b.createdAt - a.createdAt;
}));

function close(): void {
  emit('update:visible', false);
}

function optionOf(vote: VotePointWithStats, optionId: string): EnrichedVoteOption | undefined {
  return (vote.enrichedOptions ?? vote.options).find((option) => option.id === optionId) as EnrichedVoteOption | undefined;
}

function optionPercent(vote: VotePointWithStats, optionId: string): number {
  return vote.stats.optionStats.find((item) => item.optionId === optionId)?.percentage ?? 0;
}

function optionCount(vote: VotePointWithStats, optionId: string): number {
  return vote.stats.optionStats.find((item) => item.optionId === optionId)?.count ?? 0;
}

function deadlineText(deadline: number): string {
  const diff = deadline - Date.now();
  if (diff <= 0) return '已截止';
  const hours = Math.ceil(diff / 3600000);
  return hours >= 24 ? `${Math.ceil(hours / 24)} 天后截止` : `${hours} 小时后截止`;
}

async function loadVotes(): Promise<void> {
  if (!props.novelId) return;
  loading.value = true;
  try {
    votes.value = await fetchVotesByNovel(props.novelId);
    selected.value = Object.fromEntries(votes.value.map((vote) => [vote.id, vote.myVote || '']));
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '剧情投票加载失败'));
  } finally {
    loading.value = false;
  }
}

async function submit(vote: VotePointWithStats): Promise<void> {
  if (!auth.isAuthenticated) {
    ElMessage.warning('请先登录');
    return;
  }
  const optionId = selected.value[vote.id];
  if (!optionId) return;
  voting.value = true;
  try {
    await castVote(vote.id, optionId);
    ElMessage.success('投票成功');
    await loadVotes();
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '投票失败'));
  } finally {
    voting.value = false;
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) void loadVotes();
  },
);
</script>

<template>
  <Modal :model-value="visible" width="980px" title="剧情投票" @update:model-value="emit('update:visible', $event)">
    <div class="desktop-pv-panel">
      <header class="desktop-pv-hero">
        <div>
          <p>Plot Voting</p>
          <h2>{{ title || '作品剧情投票' }}</h2>
          <span>选择你期待的剧情走向，投票结果可能影响后续章节。</span>
        </div>
        <button class="desktop-btn" type="button" :disabled="loading" @click="loadVotes"><Icon name="refresh" :size="14" /> 刷新</button>
      </header>

      <StateView :loading="loading" :empty="!loading && !sortedVotes.length">
        <template #empty>
          <p class="nw-state__title">暂无剧情投票</p>
          <p class="nw-state__desc">作者开启章节投票后，会在这里收集读者选择。</p>
        </template>
        <div class="desktop-pv-list">
          <article v-for="vote in sortedVotes" :key="vote.id" class="desktop-pv-card" :class="{ closed: vote.status !== 'open', focused: vote.chapterId === chapterId }">
            <div class="desktop-pv-card-head">
              <div>
                <span class="desktop-pv-status">{{ vote.status === 'open' ? deadlineText(vote.deadline) : '已结束' }}</span>
                <h3>{{ vote.question }}</h3>
              </div>
              <span v-if="vote.chapterId === chapterId" class="nw-tag priority-medium">当前章节</span>
            </div>

            <div class="desktop-pv-options">
              <button
                v-for="option in (vote.enrichedOptions?.length ? vote.enrichedOptions : vote.options)"
                :key="option.id"
                class="desktop-pv-option"
                :class="{ selected: selected[vote.id] === option.id, winner: vote.winnerOptionId === option.id }"
                type="button"
                :disabled="vote.status !== 'open' || !!vote.myVote"
                @click="selected[vote.id] = option.id"
              >
                <div class="desktop-pv-option-top">
                  <strong>{{ (option as EnrichedVoteOption).title || option.text }}</strong>
                  <span>{{ optionCount(vote, option.id) }} 票 · {{ optionPercent(vote, option.id) }}%</span>
                </div>
                <p v-if="(option as EnrichedVoteOption).synopsis">{{ (option as EnrichedVoteOption).synopsis }}</p>
                <p v-else>{{ option.text }}</p>
                <small v-if="(option as EnrichedVoteOption).impactPrediction">{{ (option as EnrichedVoteOption).impactPrediction }}</small>
                <i :style="{ width: `${optionPercent(vote, option.id)}%` }" />
              </button>
            </div>

            <footer class="desktop-pv-foot">
              <span>{{ vote.stats.totalVotes }} 人参与<span v-if="vote.myVote"> · 你已选择：{{ optionOf(vote, vote.myVote)?.title || optionOf(vote, vote.myVote)?.text }}</span></span>
              <button class="desktop-btn desktop-btn--primary" type="button" :disabled="vote.status !== 'open' || !!vote.myVote || !selected[vote.id] || voting" @click="submit(vote)">
                {{ vote.myVote ? '已投票' : voting ? '提交中…' : '提交投票' }}
              </button>
            </footer>
          </article>
        </div>
      </StateView>
    </div>
    <template #footer>
      <button class="desktop-btn" type="button" @click="close">关闭</button>
    </template>
  </Modal>
</template>
