<script setup lang="ts">
/**
 * 桌面端·角色详情弹窗（雷达图 + 成长数据）
 * 复用 computeCharacterRadar（纯规则）+ fetchCharacterGrowth（quotes/scenes/events）。
 */
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { computeCharacterRadar, getRadarLabel, type RadarDimension } from '../composables/useCharacterRadar';
import { fetchCharacterGrowth, type CharacterGrowthData } from '../api/character-growth';
import { CHARACTER_ROLE_LABELS, type CharacterProfile } from '../types';
import type { EChartsOption } from 'echarts';
import Modal from '../components/shared/Modal.vue';
import NwChart from '../components/shared/NwChart.vue';
import Icon from '../components/shared/Icon.vue';

const props = defineProps<{ modelValue: boolean; novelId: string; character: CharacterProfile | null }>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();

const growth = ref<CharacterGrowthData | null>(null);
const loading = ref(false);

const radarDims = computed<RadarDimension[]>(() => props.character ? computeCharacterRadar(props.character) : []);
const radarLabels = computed(() => getRadarLabel(radarDims.value));

const radarOption = computed<EChartsOption>(() => ({
  radar: {
    indicator: radarDims.value.map(d => ({ name: d.label, max: 100 })),
    radius: '60%',
    axisName: { color: '#64748b', fontSize: 11 },
    splitLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
    axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } },
  },
  series: [{
    type: 'radar',
    data: [{
      value: radarDims.value.map(d => d.value),
      areaStyle: { color: 'rgba(99,102,241,0.2)' },
      lineStyle: { color: '#6366f1', width: 2 },
      itemStyle: { color: '#6366f1' },
    }],
  }],
}));

async function loadGrowth(): Promise<void> {
  if (!props.character) return;
  loading.value = true;
  growth.value = null;
  try {
    growth.value = await fetchCharacterGrowth(props.novelId, props.character.id);
  } catch {
    // 成长数据可能为空（新角色），不报错
  } finally { loading.value = false; }
}

watch(() => props.modelValue, (v) => {
  if (v && props.character) void loadGrowth();
});

const quotes = computed(() => growth.value?.quotes ?? []);
const scenes = computed(() => growth.value?.scenes ?? []);
const events = computed(() => growth.value?.events ?? []);

const EVENT_TYPE_LABELS: Record<string, string> = {
  action: '行动', encounter: '相遇', relationship: '关系', revelation: '揭示', achievement: '成就', loss: '失去',
};

function eventLabel(e: { type?: string; summary?: string; chapterNumber?: number }): string {
  const typeLabel = e.type ? EVENT_TYPE_LABELS[e.type] ?? e.type : '';
  const chapter = e.chapterNumber ? `第${e.chapterNumber}章 · ` : '';
  return `${chapter}${typeLabel}${e.summary ? '：' + e.summary : ''}`;
}
</script>

<template>
  <Modal :model-value="modelValue" :title="character?.name ?? '角色详情'" width="640px" @update:model-value="(v) => emit('update:modelValue', v)">
    <template v-if="character">
      <!-- 角色基本信息 -->
      <div class="char-detail-head">
        <div class="char-detail-avatar">{{ character.name.slice(0, 1) }}</div>
        <div class="char-detail-info">
          <div class="char-detail-name">{{ character.name }}</div>
          <div class="char-detail-tags">
            <span class="nw-tag">{{ CHARACTER_ROLE_LABELS[character.role] || character.role }}</span>
            <span v-for="l in radarLabels" :key="l" class="nw-tag priority-low">{{ l }}</span>
          </div>
          <p v-if="character.personality" class="char-detail-personality">{{ character.personality }}</p>
        </div>
      </div>

      <!-- 雷达图 -->
      <div v-if="radarDims.length" class="char-detail-section">
        <div class="char-detail-section-title"><Icon name="sparkles" :size="14" /> 人格雷达</div>
        <NwChart :option="radarOption" height="260px" />
      </div>

      <!-- 金句 -->
      <div v-if="quotes.length" class="char-detail-section">
        <div class="char-detail-section-title"><Icon name="bookOpen" :size="14" /> 名台词（{{ quotes.length }}）</div>
        <div class="char-quotes">
          <div v-for="(q, i) in quotes.slice(0, 6)" :key="i" class="char-quote">
            <span class="char-quote-mark">"</span>
            <span class="char-quote-text">{{ q.text }}</span>
            <span class="char-quote-chapter">第 {{ q.chapter }} 章</span>
          </div>
        </div>
      </div>

      <!-- 高光场面 -->
      <div v-if="scenes.length" class="char-detail-section">
        <div class="char-detail-section-title"><Icon name="layers" :size="14" /> 高光场面（{{ scenes.length }}）</div>
        <div class="char-scenes">
          <div v-for="(s, i) in scenes.slice(0, 4)" :key="i" class="char-scene">
            <span class="char-scene-chapter">第 {{ s.chapter }} 章</span>
            <p class="char-scene-text">{{ s.text }}</p>
          </div>
        </div>
      </div>

      <!-- 大事记 -->
      <div v-if="events.length" class="char-detail-section">
        <div class="char-detail-section-title"><Icon name="refresh" :size="14" /> 大事记（{{ events.length }}）</div>
        <div class="char-events">
          <div v-for="(e, i) in events.slice(0, 8)" :key="i" class="char-event">
            <span class="char-event-dot" />
            <span class="char-event-text">{{ eventLabel(e) }}</span>
          </div>
        </div>
      </div>

      <!-- 空态 -->
      <div v-if="!loading && !quotes.length && !scenes.length && !events.length" class="char-detail-empty">
        <Icon name="bookOpen" :size="32" />
        <span>该角色暂无成长数据（通过生成章节自动积累）</span>
      </div>
    </template>

    <template #footer>
      <button class="desktop-btn" @click="emit('update:modelValue', false)">关闭</button>
    </template>
  </Modal>
</template>
