<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ArrowLeft, Refresh } from '@element-plus/icons-vue';
import { ElSelect, ElOption, ElDialog } from 'element-plus';
import Icon from '../components/shared/Icon.vue';
import { fetchNovels } from '../api/novels';
import { fetchCharacters } from '../api/characters';
import { fetchStoryTaskGraph, type StoryTaskGraph } from '../api/outline';
import { getCharacterPortraitUrl } from '../api/portraits';
import type { CharacterProfile, CharacterRelationship, NovelMetadata } from '../types';
import { computeChemistry } from '../composables/useRelationshipScore';
import { useThemeMode } from '../composables/useThemeMode';
import CharacterRelationGraph from '../components/mobile-entry/CharacterRelationGraph.vue';
import MobileStoryTaskNetwork from '../components/mobile-entry/MobileStoryTaskNetwork.vue';
import '../styles/mobile-fun-features.css';

const router = useRouter();
const route = useRoute();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();

const novels = ref<NovelMetadata[]>([]);
const novelId = ref<string>('');
const characters = ref<CharacterProfile[]>([]);
const taskGraph = ref<StoryTaskGraph | null>(null);
const activeMode = ref<'characters' | 'tasks'>('characters');
const selectedCharacter = ref<CharacterProfile | null>(null);
const loadingNovels = ref(false);
const loadingChars = ref(false);
const loadingTasks = ref(false);
const showDetailModal = ref(false);
const showRelationModal = ref(false);
const detailCharacter = ref<CharacterProfile | null>(null);
const relationDetail = ref<{ source: CharacterProfile; target: CharacterProfile; relationship: CharacterRelationship } | null>(null);

const RELATION_TYPE_LABELS: Record<string, string> = {
  lover: '恋人', crush: '暗恋', ex: '前任', spouse: '配偶',
  enemy: '敌人', rival: '对手', nemesis: '宿敌', betrayer: '背叛者',
  friend: '朋友', childhood: '青梅竹马', sworn: '结拜', comrade: '战友',
  ally: '盟友', partner: '搭档',
  mentor: '导师', classmate: '同学', subordinate: '下属',
  servant: '仆人', protector: '守护者',
  family: '家人', sibling: '兄弟姐妹', parent: '父母',
  other: '其他',
};

const RELATION_TYPE_COLORS: Record<string, string> = {
  lover: '#ec4899', crush: '#f472b6', ex: '#f9a8d4', spouse: '#db2777',
  enemy: '#ef4444', rival: '#f97316', nemesis: '#dc2626', betrayer: '#b91c1c',
  friend: '#22c55e', childhood: '#86efac', sworn: '#4ade80', comrade: '#4ade80',
  ally: '#22c55e', partner: '#22c55e',
  mentor: '#6366f1', classmate: '#a5b4fc', subordinate: '#818cf8',
  servant: '#818cf8', protector: '#3b82f6',
  family: '#fbbf24', sibling: '#fcd34d', parent: '#f59e0b',
  other: '#94a3b8',
};

const chemistryResult = computed(() => {
  if (!relationDetail.value) return null;
  return computeChemistry(relationDetail.value.source, relationDetail.value.target);
});

async function loadNovels() {
  loadingNovels.value = true;
  try {
    novels.value = await fetchNovels();
  } catch { /* ignore */ }
  finally { loadingNovels.value = false; }
}

async function onNovelChange(id: string) {
  novelId.value = id;
  selectedCharacter.value = null;
  taskGraph.value = null;
  if (!id) return;
  loadingChars.value = true;
  loadingTasks.value = true;
  const [characterResult, taskResult] = await Promise.allSettled([
    fetchCharacters(id),
    fetchStoryTaskGraph(id),
  ]);
  characters.value = characterResult.status === 'fulfilled' ? characterResult.value : [];
  taskGraph.value = taskResult.status === 'fulfilled' ? taskResult.value : null;
  loadingChars.value = false;
  loadingTasks.value = false;
}

function handleCharacterSelect(char: CharacterProfile) {
  selectedCharacter.value = char;
  detailCharacter.value = char;
  showDetailModal.value = true;
}

function handleRelationClick(rel: { source: CharacterProfile; target: CharacterProfile; relationship: CharacterRelationship }) {
  relationDetail.value = rel;
  showRelationModal.value = true;
}

function getCharacterRelationships(char: CharacterProfile) {
  const result: Array<{ target: CharacterProfile; relationship: CharacterRelationship }> = [];
  for (const rel of char.relationships) {
    const target = characters.value.find(c => c.id === rel.targetId);
    if (target) {
      result.push({ target, relationship: rel });
    }
  }
  return result;
}

function closeModal() {
  showDetailModal.value = false;
  showRelationModal.value = false;
}

function refreshGraph() {
  if (novelId.value) {
    void onNovelChange(novelId.value);
  }
}

loadNovels();

onMounted(async () => {
  await nextTick();
  window.scrollTo(0, 0);
  const queryNovelId = route.query.novelId as string | undefined;
  if (queryNovelId) {
    const checkInterval = setInterval(async () => {
      if (novels.value.length > 0) {
        clearInterval(checkInterval);
        const found = novels.value.find(n => n.id === queryNovelId);
        if (found) {
          await onNovelChange(queryNovelId);
        }
      }
    }, 100);
    setTimeout(() => clearInterval(checkInterval), 5000);
  }
});
onUnmounted(() => {});
</script>

<template>
  <div class="mobile-fun-page mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mf-topbar">
      <button class="mf-topbar__back" type="button" @click="router.back()">
        <el-icon :size="18"><ArrowLeft /></el-icon>
      </button>
      <span class="mf-topbar__title">故事关系图谱</span>
      <button class="mf-topbar__action" type="button" @click="refreshGraph" :disabled="loadingChars">
        <el-icon :size="18"><Refresh /></el-icon>
      </button>
    </div>

    <div class="mf-novel-select" style="margin:12px 0">
      <el-select
        v-model="novelId"
        placeholder="选择一部小说"
        :loading="loadingNovels"
        clearable
        popper-class="mf-select-popper"
        style="width:100%"
        @change="onNovelChange"
      >
        <el-option
          v-for="n in novels"
          :key="n.id"
          :label="n.title"
          :value="n.id"
        />
      </el-select>
    </div>

    <div class="story-graph-mode" role="tablist" aria-label="故事关系视图">
      <button
        type="button"
        role="tab"
        :aria-selected="activeMode === 'characters'"
        :class="{ 'is-active': activeMode === 'characters' }"
        @click="activeMode = 'characters'"
      >人物关系</button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeMode === 'tasks'"
        :class="{ 'is-active': activeMode === 'tasks' }"
        @click="activeMode = 'tasks'"
      >故事任务</button>
    </div>

    <div v-if="activeMode === 'characters' && loadingChars" class="mf-novel-empty">角色关系正在成形...</div>
    <div v-else-if="activeMode === 'characters' && novelId && characters.length === 0 && !loadingChars" class="mf-novel-empty">
      <strong>暂无角色</strong> 这部小说还没有创建角色
    </div>
    <div v-else-if="activeMode === 'characters' && novelId && characters.length > 0" class="mf-card mf-card--glow" style="margin-top:8px">
      <div class="mf-section-header">
        <span class="mf-section-title">关系图谱</span>
        <span class="mf-section-count">{{ characters.length }} 个角色 · {{ characters.reduce((acc, c) => acc + c.relationships.length, 0) }} 条关系</span>
      </div>
      <div class="mf-graph-container">
        <CharacterRelationGraph
          :characters="characters"
          :selected-character-id="selectedCharacter?.id"
          :dark="isDarkTheme || isWarmNight"
          @select="handleCharacterSelect"
          @relation-click="handleRelationClick"
        />
      </div>
      <div class="mf-graph-hint">
        <span class="mf-hint-icon"><Icon name="eye" :size="16" /></span>
        点击节点查看角色详情，点击连线查看关系详情
      </div>
    </div>

    <div v-if="activeMode === 'tasks' && loadingTasks" class="mf-novel-empty">故事任务正在汇拢...</div>
    <div v-else-if="activeMode === 'tasks' && novelId && taskGraph?.tasks.length" class="mf-card mf-card--glow story-task-tool">
      <MobileStoryTaskNetwork :graph="taskGraph" />
    </div>
    <div v-else-if="activeMode === 'tasks' && novelId && !loadingTasks" class="mf-novel-empty">
      <strong>任务网络尚未成形</strong> 剧情推进后会自动生成故事任务
    </div>

    <div v-if="activeMode === 'characters' && novelId && characters.length > 0" class="mf-card" style="margin-top:12px">
      <div class="mf-section-header">
        <span class="mf-section-title">角色列表</span>
      </div>
      <div class="mf-pick-grid">
        <button
          v-for="c in characters"
          :key="c.id"
          class="mf-pick-chip"
          :class="{ 'mf-pick-chip--selected': selectedCharacter?.id === c.id }"
          type="button"
          @click="handleCharacterSelect(c)"
        >
          <div class="mf-pick-chip__avatar">
            <img v-if="c.portraitImagePath" :src="getCharacterPortraitUrl(novelId, c.id, 80)" :alt="c.name" />
            <span v-else>{{ c.name.charAt(0) }}</span>
          </div>
          <span class="mf-pick-chip__name">{{ c.name }}</span>
        </button>
      </div>
    </div>

    <div v-if="!novelId" class="mf-novel-empty" style="margin-top:40px">
      <strong>故事关系图谱</strong> 选择一部小说，看见人物羁绊与任务脉络
    </div>

    <div v-if="activeMode === 'characters'" class="mf-card" style="margin-top:12px">
      <div class="mf-section-header">
        <span class="mf-section-title">关系图例</span>
      </div>
      <div class="mf-legend-grid">
        <div v-for="(label, type) in RELATION_TYPE_LABELS" :key="type" class="mf-legend-item">
          <span class="mf-legend-dot" :style="{ backgroundColor: RELATION_TYPE_COLORS[type] }"></span>
          <span class="mf-legend-label">{{ label }}</span>
        </div>
      </div>
    </div>

    <ElDialog
      v-model="showDetailModal"
      :title="detailCharacter?.name ?? '角色详情'"
      width="90%"
      :close-on-click-modal="true"
      @close="closeModal"
    >
      <div v-if="detailCharacter" class="mf-detail-content">
        <div class="mf-detail-avatar">
          <img v-if="detailCharacter.portraitImagePath" :src="getCharacterPortraitUrl(novelId, detailCharacter.id, 120)" :alt="detailCharacter.name" />
          <span v-else>{{ detailCharacter.name.charAt(0) }}</span>
        </div>
        <div class="mf-detail-info">
          <div class="mf-detail-name">{{ detailCharacter.name }}</div>
          <div v-if="detailCharacter.position" class="mf-detail-position">{{ detailCharacter.position }}</div>
          <div class="mf-detail-tags">
            <span class="mf-tag">{{ detailCharacter.role }}</span>
            <span v-for="t in detailCharacter.tags.slice(0, 3)" :key="t" class="mf-tag">{{ t }}</span>
          </div>
        </div>

        <div class="mf-detail-section">
          <div class="mf-detail-section-title">性格特点</div>
          <p class="mf-detail-text">{{ detailCharacter.personality }}</p>
        </div>

        <div class="mf-detail-section">
          <div class="mf-detail-section-title">人物关系</div>
          <div class="mf-relation-list">
            <div v-for="rel in getCharacterRelationships(detailCharacter)" :key="rel.target.id" class="mf-relation-item">
              <div class="mf-relation-avatar">
                <img v-if="rel.target.portraitImagePath" :src="getCharacterPortraitUrl(novelId, rel.target.id, 60)" :alt="rel.target.name" />
                <span v-else>{{ rel.target.name.charAt(0) }}</span>
              </div>
              <div class="mf-relation-info">
                <div class="mf-relation-name">{{ rel.target.name }}</div>
                <div class="mf-relation-type" :style="{ color: RELATION_TYPE_COLORS[rel.relationship.type] }">
                  {{ RELATION_TYPE_LABELS[rel.relationship.type] || rel.relationship.type }}
                </div>
              </div>
              <div class="mf-relation-tension">
                <span :style="{ color: rel.relationship.tensionLevel && rel.relationship.tensionLevel > 70 ? '#ef4444' : '#22c55e' }">
                  {{ rel.relationship.tensionLevel ?? 50 }}%
                </span>
              </div>
            </div>
            <div v-if="getCharacterRelationships(detailCharacter).length === 0" class="mf-empty-text">暂无关系记录</div>
          </div>
        </div>

        <div v-if="detailCharacter.backstory" class="mf-detail-section">
          <div class="mf-detail-section-title">背景故事</div>
          <p class="mf-detail-text">{{ detailCharacter.backstory }}</p>
        </div>
      </div>
    </ElDialog>

    <ElDialog
      v-model="showRelationModal"
      title="关系详情"
      width="90%"
      :close-on-click-modal="true"
      @close="closeModal"
    >
      <div v-if="relationDetail" class="mf-relation-detail">
        <div class="mf-relation-pair">
          <div class="mf-relation-avatar-large">
            <img v-if="relationDetail.source.portraitImagePath" :src="getCharacterPortraitUrl(novelId, relationDetail.source.id, 80)" :alt="relationDetail.source.name" />
            <span v-else>{{ relationDetail.source.name.charAt(0) }}</span>
          </div>
          <div class="mf-relation-arrow">
            <span class="mf-arrow-icon"><Icon name="link" :size="20" /></span>
          </div>
          <div class="mf-relation-avatar-large">
            <img v-if="relationDetail.target.portraitImagePath" :src="getCharacterPortraitUrl(novelId, relationDetail.target.id, 80)" :alt="relationDetail.target.name" />
            <span v-else>{{ relationDetail.target.name.charAt(0) }}</span>
          </div>
        </div>

        <div class="mf-relation-type-badge" :style="{ backgroundColor: RELATION_TYPE_COLORS[relationDetail.relationship.type] }">
          {{ RELATION_TYPE_LABELS[relationDetail.relationship.type] || relationDetail.relationship.type }}
        </div>

        <div v-if="relationDetail.relationship.description" class="mf-detail-section">
          <div class="mf-detail-section-title">关系描述</div>
          <p class="mf-detail-text">{{ relationDetail.relationship.description }}</p>
        </div>

        <div class="mf-relation-stats">
          <div class="mf-stat-item">
            <span class="mf-stat-label">关系张力</span>
            <span class="mf-stat-value" :style="{ color: relationDetail.relationship.tensionLevel && relationDetail.relationship.tensionLevel > 70 ? '#ef4444' : '#22c55e' }">
              {{ relationDetail.relationship.tensionLevel ?? 50 }}%
            </span>
          </div>
          <div v-if="relationDetail.relationship.powerDynamic" class="mf-stat-item">
            <span class="mf-stat-label">权力关系</span>
            <span class="mf-stat-value">{{ relationDetail.relationship.powerDynamic === 'dominant' ? '主导' : relationDetail.relationship.powerDynamic === 'submissive' ? '服从' : '平等' }}</span>
          </div>
        </div>

        <div v-if="chemistryResult" class="mf-detail-section">
          <div class="mf-detail-section-title">化学反应</div>
          <div class="mf-chemistry-card">
            <div class="mf-chemistry-score">{{ chemistryResult.score }}</div>
            <div class="mf-chemistry-label">{{ chemistryResult.label }}</div>
            <p class="mf-chemistry-desc">{{ chemistryResult.description }}</p>
          </div>
        </div>

        <div v-if="relationDetail.relationship.emotionalDebt" class="mf-detail-section">
          <div class="mf-detail-section-title">情感债务</div>
          <p class="mf-detail-text">{{ relationDetail.relationship.emotionalDebt }}</p>
        </div>

        <div v-if="relationDetail.relationship.sharedHistory" class="mf-detail-section">
          <div class="mf-detail-section-title">共同秘密</div>
          <p class="mf-detail-text">{{ relationDetail.relationship.sharedHistory }}</p>
        </div>
      </div>
    </ElDialog>
  </div>
</template>
