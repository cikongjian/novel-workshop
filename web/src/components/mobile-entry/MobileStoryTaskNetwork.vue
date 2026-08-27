<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRight } from '@element-plus/icons-vue';
import type { StoryTaskGraph, StoryTaskNode, StoryTaskStatus } from '../../api/outline';
import StoryTaskGraphChart from './StoryTaskGraphChart.vue';

const props = defineProps<{
  graph: StoryTaskGraph;
}>();

const selectedTask = ref<StoryTaskNode | null>(null);
const detailVisible = ref(false);

const STATUS_LABELS: Record<StoryTaskStatus, string> = {
  planned: '等待登场',
  active: '正在推进',
  critical: '关键阶段',
  blocked: '前置受阻',
  completed: '已经兑现',
  abandoned: '已经收束',
};

const STATUS_ORDER: Record<StoryTaskStatus, number> = {
  critical: 0,
  active: 1,
  blocked: 2,
  planned: 3,
  completed: 4,
  abandoned: 5,
};

const taskById = computed(() => new Map(props.graph.tasks.map(task => [task.id, task])));
const characterById = computed(() => new Map(props.graph.characters.map(character => [character.id, character])));
const focusTasks = computed(() => [...props.graph.tasks]
  .sort((left, right) => (
    STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
      || (right.chapterNumber ?? 0) - (left.chapterNumber ?? 0)
  ))
  .slice(0, 12));

const selectedParticipants = computed(() => (
  selectedTask.value?.characterIds
    .map(id => characterById.value.get(id))
    .filter((character): character is NonNullable<typeof character> => Boolean(character)) ?? []
));

const selectedBlockers = computed(() => (
  selectedTask.value?.blockerTaskIds
    .map(id => taskById.value.get(id))
    .filter((task): task is NonNullable<typeof task> => Boolean(task)) ?? []
));

function openTask(task: StoryTaskNode) {
  selectedTask.value = task;
  detailVisible.value = true;
}
</script>

<template>
  <div class="story-task-network">
    <div class="story-task-network__summary">
      <div class="story-task-network__metric">
        <strong>{{ graph.summary.totalTasks }}</strong>
        <span>任务节点</span>
      </div>
      <div class="story-task-network__metric">
        <strong>{{ graph.summary.activeTasks }}</strong>
        <span>正在推进</span>
      </div>
      <div class="story-task-network__metric">
        <strong>{{ graph.summary.blockedTasks }}</strong>
        <span>前置受阻</span>
      </div>
      <div class="story-task-network__metric">
        <strong>{{ graph.summary.participantCount }}</strong>
        <span>关联角色</span>
      </div>
    </div>

    <div class="story-task-network__graph">
      <StoryTaskGraphChart
        :graph="graph"
        :selected-task-id="selectedTask?.id"
        @select-task="openTask"
      />
    </div>

    <div class="story-task-network__legend" aria-label="任务关系图例">
      <span><i class="story-task-network__legend-line" />前置与承接</span>
      <span><i class="story-task-network__legend-line story-task-network__legend-line--accent" />推进故事线</span>
      <span><i class="story-task-network__legend-line story-task-network__legend-line--dashed" />角色参与</span>
    </div>

    <section class="story-task-network__focus">
      <h3>当前故事任务</h3>
      <div class="story-task-network__list">
        <button
          v-for="task in focusTasks"
          :key="task.id"
          type="button"
          class="story-task-network__row"
          @click="openTask(task)"
        >
          <span class="story-task-network__row-main">
            <strong>{{ task.title }}</strong>
            <small>{{ task.objective }}</small>
          </span>
          <span class="story-task-network__status" :class="`is-${task.status}`">
            {{ STATUS_LABELS[task.status] }}
          </span>
          <el-icon :size="15"><ArrowRight /></el-icon>
        </button>
      </div>
    </section>

    <el-dialog v-model="detailVisible" :title="selectedTask?.title ?? '任务详情'" width="90%">
      <div v-if="selectedTask" class="story-task-detail">
        <div class="story-task-detail__headline">
          <span class="story-task-network__status" :class="`is-${selectedTask.status}`">
            {{ STATUS_LABELS[selectedTask.status] }}
          </span>
          <span>{{ selectedTask.kind === 'arc' ? '故事主线' : `第 ${selectedTask.chapterNumber} 章` }}</span>
        </div>
        <p class="story-task-detail__objective">{{ selectedTask.objective }}</p>
        <div class="story-task-detail__progress" aria-label="任务推进度">
          <span :style="{ width: `${selectedTask.progress}%` }" />
        </div>

        <section v-if="selectedParticipants.length" class="story-task-detail__section">
          <h4>关键参与者</h4>
          <div class="story-task-detail__chips">
            <span v-for="character in selectedParticipants" :key="character.id">{{ character.name }}</span>
          </div>
        </section>

        <section v-if="selectedBlockers.length" class="story-task-detail__section">
          <h4>等待兑现的前置</h4>
          <div class="story-task-detail__chips">
            <span v-for="task in selectedBlockers" :key="task.id">{{ task.title }}</span>
          </div>
        </section>

        <section v-if="selectedTask.evidenceChapters.length" class="story-task-detail__section">
          <h4>推进章节</h4>
          <p>第 {{ selectedTask.evidenceChapters.join('、') }} 章</p>
        </section>
      </div>
    </el-dialog>
  </div>
</template>
