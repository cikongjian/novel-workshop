<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { ElSelect, ElOption } from 'element-plus';
import { fetchNovels } from '../api/novels';
import { fetchCharacters } from '../api/characters';
import { getCharacterPortraitUrl } from '../api/portraits';
import type { CharacterProfile, NovelMetadata } from '../types';
import { computeChemistry, type ChemistryResult } from '../composables/useRelationshipScore';
import { loadECharts } from '../utils/echarts-loader';
import { getMobileChartTheme } from '../utils/mobile-chart-theme';
import { useShareCard } from '../composables/useShareCard';
import '../styles/mobile-fun-features.css';

const router = useRouter();
const route = useRoute();
const share = useShareCard();

const novels = ref<NovelMetadata[]>([]);
const novelId = ref<string>('');
const characters = ref<CharacterProfile[]>([]);
const pickA = ref<CharacterProfile | null>(null);
const pickB = ref<CharacterProfile | null>(null);
const result = ref<ChemistryResult | null>(null);
const loading = ref({ novels: false, chars: false });
const sharing = ref(false);

let chartInstance: ReturnType<typeof import('echarts').init> | null = null;
const chartRef = ref<HTMLDivElement>();
onUnmounted(() => { chartInstance?.dispose(); });

async function loadNovels() {
  loading.value.novels = true;
  try { novels.value = await fetchNovels(); } catch { /* ignore */ }
  finally { loading.value.novels = false; }
}

async function onNovelChange(id: string) {
  novelId.value = id;
  pickA.value = null; pickB.value = null; result.value = null;
  if (!id) return;
  loading.value.chars = true;
  try { characters.value = await fetchCharacters(id); } catch { /* ignore */ }
  finally { loading.value.chars = false; }
}

function toggleChar(char: CharacterProfile) {
  if (pickA.value?.id === char.id) { pickA.value = null; result.value = null; return; }
  if (pickB.value?.id === char.id) { pickB.value = null; result.value = null; return; }

  if (!pickA.value) { pickA.value = char; }
  else if (!pickB.value) { pickB.value = char; }
  else { pickA.value = char; pickB.value = null; }
}

watch([pickA, pickB], async ([a, b]) => {
  if (a && b && a.id !== b.id) {
    result.value = computeChemistry(a, b);
    await nextTick();
    renderDualRadar();
  } else { result.value = null; }
});

async function renderDualRadar() {
  if (!chartRef.value || !result.value) return;
  const echarts = await loadECharts();
  if (!chartInstance) chartInstance = echarts.init(chartRef.value);
  const { dimsA, dimsB } = result.value;
  const nameA = pickA.value?.name ?? 'A';
  const nameB = pickB.value?.name ?? 'B';
  const chartTheme = getMobileChartTheme(chartRef.value);
  chartInstance.setOption({
    legend: { bottom: 0, textStyle: { color: chartTheme.textMuted, fontSize: 12 } },
    radar: {
      indicator: dimsA.map(d => ({ name: d.label, max: 100 })),
      shape: 'polygon', radius: '62%', center: ['50%', '48%'],
      axisName: { color: chartTheme.textMuted, fontSize: 11, fontWeight: 600 },
    },
    series: [
      {
        type: 'radar', name: nameA,
        data: [{ value: dimsA.map(d => d.value), name: nameA,
          areaStyle: { color: chartTheme.accentArea },
          lineStyle: { color: chartTheme.accent, width: 2 },
          symbol: 'circle', symbolSize: 4,
        }],
      },
      {
        type: 'radar', name: nameB,
        data: [{ value: dimsB.map(d => d.value), name: nameB,
          areaStyle: { color: chartTheme.dangerArea },
          lineStyle: { color: chartTheme.danger, width: 2 },
          symbol: 'diamond', symbolSize: 4,
        }],
      },
    ],
  }, true);
}

window.addEventListener('resize', () => chartInstance?.resize());

async function doShare() {
  if (!result.value || !pickA.value || !pickB.value) return;
  sharing.value = true;
  try {
    const novelTitle = novels.value.find(n => n.id === novelId.value)?.title ?? '';
    const shareUrl = `${window.location.origin}/m/fun/chemistry?novelId=${novelId.value}&from=cp-share`;
    const url = await share.generateCard({
      text: `${pickA.value.name} × ${pickB.value.name}\n【${result.value.label}】— ${result.value.score}分`,
      novelTitle,
      authorName: 'CP化学反应',
      chapterTitle: result.value.description,
      shareUrl,
      showQrPlaceholder: true,
    });
    if (url) await share.shareImage(url);
  } finally { sharing.value = false; }
}

loadNovels();

onMounted(async () => {
  await nextTick();
  window.scrollTo(0, 0);
  const queryNovelId = route.query.novelId as string | undefined;
  const queryCharId = route.query.charId as string | undefined;
  if (queryNovelId) {
    const checkInterval = setInterval(async () => {
      if (novels.value.length > 0) {
        clearInterval(checkInterval);
        const found = novels.value.find(n => n.id === queryNovelId);
        if (found) {
          await onNovelChange(queryNovelId);
          if (queryCharId) {
            const char = characters.value.find(c => c.id === queryCharId);
            if (char) toggleChar(char);
          }
        }
      }
    }, 100);
    setTimeout(() => clearInterval(checkInterval), 5000);
  }
});
</script>

<template>
  <div class="mobile-fun-page">
    <div class="mf-topbar">
      <button class="mf-topbar__back" type="button" @click="router.back()">
        <el-icon :size="18"><ArrowLeft /></el-icon>
      </button>
      <span class="mf-topbar__title">CP 化学反应测试</span>
    </div>

    <!-- 选择小说 -->
    <div class="mf-novel-select" style="margin:12px 0">
      <el-select v-model="novelId" placeholder="选择一部小说" :loading="loading.novels" clearable popper-class="mf-select-popper" style="width:100%" @change="onNovelChange">
        <el-option v-for="n in novels" :key="n.id" :label="n.title" :value="n.id" />
      </el-select>
    </div>

    <!-- 角色选择 -->
    <div v-if="loading.chars" class="mf-novel-empty">加载角色中...</div>
    <div v-else-if="characters.length > 0">
      <div style="font-size:13px;color:var(--mf-text-secondary);margin-bottom:6px">
        选择两个角色：
        <span v-if="pickA" style="color:var(--mf-accent);font-weight:700">已选 {{ pickA.name }}</span>
        <span v-if="pickB" style="color:var(--mobile-focus-status-danger);font-weight:700"> + {{ pickB.name }}</span>
        <span v-if="!pickA && !pickB" style="color:var(--mf-text-muted)">请先选择第一位</span>
      </div>
      <div class="mf-pick-grid">
        <button
          v-for="c in characters" :key="c.id"
          class="mf-pick-chip"
          :class="{
            'mf-pick-chip--selected': pickA?.id === c.id || pickB?.id === c.id,
          }"
          type="button"
          :style="{
            borderColor: pickA?.id === c.id ? 'var(--mf-accent)' : pickB?.id === c.id ? 'var(--mobile-focus-status-danger)' : undefined,
          }"
          @click="toggleChar(c)"
        >
          <div class="mf-pick-chip__avatar">
            <img v-if="c.portraitImagePath" :src="getCharacterPortraitUrl(novelId, c.id, 80)" :alt="c.name" />
            <span v-else>{{ c.name.charAt(0) }}</span>
          </div>
          <span class="mf-pick-chip__name">{{ c.name }}</span>
        </button>
      </div>
    </div>

    <!-- 结果 -->
    <div v-if="result" class="mf-card mf-card--glow" style="margin-top:16px">
      <div class="mf-score-ring">
        <div class="mf-score-number">{{ result.score }}</div>
        <div class="mf-score-label">{{ result.label }}</div>
        <div class="mf-score-desc">{{ result.description }}</div>
      </div>

      <div ref="chartRef" class="mf-radar-wrap" style="height:300px" />

      <button class="mf-btn mf-btn--primary mf-btn--block" style="margin-top:12px" :disabled="sharing" @click="doShare">
        {{ sharing ? '生成中...' : '生成 CP 分享卡' }}
      </button>
    </div>

    <div v-if="!novelId" class="mf-novel-empty" style="margin-top:40px">
      <strong>CP 化学反应测试</strong> 选一部小说里的两个角色，看看他们之间能擦出怎样的火花
    </div>
  </div>
</template>
