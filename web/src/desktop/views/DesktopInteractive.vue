<script setup lang="ts">
/**
 * 桌面端·互动小说（剧情投票）
 */
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { fetchVotesByNovel, closeVotePoint, adoptVotePoint, type VotePointWithStats } from '../../api/plot-votes';
import { extractApiErrorMessage } from '../../api/errors';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';

const props = defineProps<{ novelId: string }>();

const loading = ref(false);

const votes = ref<VotePointWithStats[]>([]);

async function load(): Promise<void> {
  loading.value = true;
  try {
    votes.value = await fetchVotesByNovel(props.novelId).catch(() => []);
  } finally {
    loading.value = false;
  }
}
load();

const openVotes = computed(() => votes.value.filter(v => v.status === 'open'));
const closedVotes = computed(() => votes.value.filter(v => v.status === 'closed'));

async function closeVote(id: string): Promise<void> {
  try {
    await closeVotePoint(id);
    ElMessage.success('投票已关闭');
    await load();
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '操作失败')); }
}

async function toggleAdopt(v: VotePointWithStats): Promise<void> {
  try {
    await adoptVotePoint(v.id, !v.adopted);
    ElMessage.success(v.adopted ? '已取消采纳' : '已采纳');
    await load();
  } catch (err) { ElMessage.error(extractApiErrorMessage(err, '操作失败')); }
}

</script>

<template>
  <div class="desktop-interactive">
    <div class="nw-panel__head" style="padding:0 0 var(--nw-space-4)">
      <div>
        <h3 class="nw-panel__title"><Icon name="sparkles" :size="16" /> 剧情投票</h3>
        <p class="desktop-muted">读者投票和采纳结果集中在这里；分支创作已迁移到独立模块。</p>
      </div>
      <button class="desktop-btn" :disabled="loading" type="button" @click="load"><Icon name="refresh" :size="14" /> 刷新</button>
    </div>

    <StateView :loading="loading">
      <div v-if="openVotes.length" class="outline-fs-group">
        <div class="outline-fs-group-label">进行中（{{ openVotes.length }}）</div>
        <div v-for="v in openVotes" :key="v.id" class="vote-card vote-card--open">
          <div class="vote-question">{{ v.question }}</div>
          <div class="vote-options">
            <div v-for="opt in v.options" :key="opt.id" class="vote-option-row">
              <span class="vote-option-text">{{ opt.text }}</span>
              <span class="vote-option-count">{{ v.stats?.[opt.id] ?? 0 }} 票</span>
            </div>
          </div>
          <div class="vote-actions">
            <button class="desktop-btn" style="padding:2px 10px;font-size:12px" @click="closeVote(v.id)"><Icon name="close" :size="12" /> 关闭</button>
          </div>
        </div>
      </div>
      <div v-if="closedVotes.length" class="outline-fs-group">
        <div class="outline-fs-group-label">已关闭（{{ closedVotes.length }}）</div>
        <div v-for="v in closedVotes" :key="v.id" class="vote-card" :class="{ 'vote-card--adopted': v.adopted }">
          <div class="vote-question">{{ v.question }}</div>
          <div class="vote-result">
            <span v-if="v.winnerOptionId" class="nw-tag priority-low">胜出：{{ v.options.find(o => o.id === v.winnerOptionId)?.text ?? '?' }}</span>
            <span v-if="v.adopted" class="nw-tag">已采纳</span>
          </div>
          <div class="vote-actions">
            <button class="desktop-btn" style="padding:2px 10px;font-size:12px" @click="toggleAdopt(v)">
              {{ v.adopted ? '取消采纳' : '采纳' }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="!votes.length" class="outline-empty-tab">暂无投票</div>
    </StateView>
  </div>
</template>
