<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { ElSelect, ElOption } from 'element-plus';
import { fetchNovels } from '../api/novels';
import { fetchCharacters } from '../api/characters';
import { getCharacterPortraitUrl } from '../api/portraits';
import type { CharacterProfile, NovelMetadata } from '../types';
import { computeCharacterRadar, getRadarLabel, type RadarDimension } from '../composables/useCharacterRadar';
import { loadECharts } from '../utils/echarts-loader';
import { getMobileChartTheme } from '../utils/mobile-chart-theme';
import { useShareCard } from '../composables/useShareCard';
import '../styles/mobile-fun-features.css';

const router = useRouter();
const share = useShareCard();

const novels = ref<NovelMetadata[]>([]);
const novelId = ref<string>('');
const characters = ref<CharacterProfile[]>([]);
const selectedChar = ref<CharacterProfile | null>(null);
const dims = ref<RadarDimension[]>([]);
const labels = ref<string[]>([]);
const loadingChars = ref(false);
const loadingNovels = ref(false);
const sharing = ref(false);

// echarts 实例
let chartInstance: ReturnType<typeof import('echarts').init> | null = null;
const chartRef = ref<HTMLDivElement>();

onUnmounted(() => { chartInstance?.dispose(); });

async function loadNovels() {
  loadingNovels.value = true;
  try {
    novels.value = await fetchNovels();
  } catch { /* ignore */ }
  finally { loadingNovels.value = false; }
}

async function onNovelChange(id: string) {
  novelId.value = id;
  selectedChar.value = null;
  dims.value = [];
  labels.value = [];
  if (!id) return;
  loadingChars.value = true;
  try {
    characters.value = await fetchCharacters(id);
  } catch { /* ignore */ }
  finally { loadingChars.value = false; }
}

function selectCharacter(char: CharacterProfile) {
  selectedChar.value = char;
  dims.value = computeCharacterRadar(char);
  labels.value = getRadarLabel(dims.value);
  nextTick(() => renderRadar());
}

async function renderRadar() {
  if (!chartRef.value || dims.value.length === 0) return;
  const echarts = await loadECharts();
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }
  const indicator = dims.value.map(d => ({ name: d.label, max: 100 }));
  const chartTheme = getMobileChartTheme(chartRef.value);
  chartInstance.setOption({
    radar: {
      indicator,
      shape: 'polygon',
      radius: '68%',
      center: ['50%', '52%'],
      axisName: { color: chartTheme.textMuted, fontSize: 12, fontWeight: 600 },
      splitArea: {
        areaStyle: { color: [chartTheme.accentWashSubtle, chartTheme.accentWashSubtle, chartTheme.accentWashSoft, chartTheme.accentWashSoft] },
      },
    },
    series: [{
      type: 'radar',
      data: [{ value: dims.value.map(d => d.value), name: selectedChar.value?.name ?? '',
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: chartTheme.accentAreaStrong }, { offset: 1, color: chartTheme.accentStrongArea },
        ]) },
        lineStyle: { color: chartTheme.accent, width: 2 },
        symbol: 'circle', symbolSize: 5,
      }],
    }],
  }, true);
}

window.addEventListener('resize', () => chartInstance?.resize());

async function doShare() {
  if (!selectedChar.value) return;
  sharing.value = true;
  try {
    const text = labels.value.length > 0 ? labels.value.join(' · ') : '均衡型人格';
    const url = await share.generateCard({
      text: `【${selectedChar.value.name}】\n${text}`,
      novelTitle: novels.value.find(n => n.id === novelId.value)?.title ?? '',
      authorName: '角色人格卡',
      chapterTitle: selectedChar.value.cardBlurb ?? selectedChar.value.position ?? '',
    });
    if (url) await share.shareImage(url);
  } finally { sharing.value = false; }
}

loadNovels();

onMounted(async () => { await nextTick(); window.scrollTo(0, 0); });
</script>

<template>
  <div class="mobile-fun-page">
    <div class="mf-topbar">
      <button class="mf-topbar__back" type="button" @click="router.back()">
        <el-icon :size="18"><ArrowLeft /></el-icon>
      </button>
      <span class="mf-topbar__title">角色人格卡</span>
    </div>

    <!-- 选择小说 -->
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

    <!-- 角色列表 -->
    <div v-if="loadingChars" class="mf-novel-empty">加载角色中...</div>
    <div v-else-if="novelId && characters.length === 0 && !loadingChars" class="mf-novel-empty">
      <strong>暂无角色</strong> 这部小说还没有创建角色
    </div>
    <div v-else-if="characters.length > 0" class="mf-pick-grid">
      <button
        v-for="c in characters"
        :key="c.id"
        class="mf-pick-chip"
        :class="{ 'mf-pick-chip--selected': selectedChar?.id === c.id }"
        type="button"
        @click="selectCharacter(c)"
      >
        <div class="mf-pick-chip__avatar">
          <img v-if="c.portraitImagePath" :src="getCharacterPortraitUrl(novelId, c.id, 80)" :alt="c.name" />
          <span v-else>{{ c.name.charAt(0) }}</span>
        </div>
        <span class="mf-pick-chip__name">{{ c.name }}</span>
      </button>
    </div>

    <!-- 雷达图 + 标签 -->
    <div v-if="selectedChar" class="mf-card mf-card--glow" style="margin-top:16px">
      <div style="text-align:center;margin-bottom:4px">
        <div style="font-size:18px;font-weight:800;color:var(--mf-text-primary)">{{ selectedChar.name }}</div>
        <div v-if="selectedChar.position" style="font-size:12px;color:var(--mf-text-muted);margin-top:2px">{{ selectedChar.position }}</div>
      </div>

      <div class="mf-tag-row">
        <span v-for="l in labels" :key="l" class="mf-tag">{{ l }}</span>
      </div>

      <div ref="chartRef" class="mf-radar-wrap" />

      <button class="mf-btn mf-btn--primary mf-btn--block" style="margin-top:12px" :disabled="sharing" @click="doShare">
        {{ sharing ? '生成中...' : '生成分享卡片' }}
      </button>
    </div>

    <div v-if="!novelId" class="mf-novel-empty" style="margin-top:40px">
      <strong>角色人设雷达</strong> 选择一部小说，看看每个角色的六维人格画像
    </div>
  </div>
</template>
