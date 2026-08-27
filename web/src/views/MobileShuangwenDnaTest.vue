<script setup lang="ts">
import { ref, nextTick, watch, onMounted, onUnmounted, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, RefreshRight } from '@element-plus/icons-vue';
import { brand } from '../config/brand';
import { useShuangwenDna } from '../composables/useShuangwenDna';
import { loadECharts } from '../utils/echarts-loader';
import { useShareCard } from '../composables/useShareCard';
import { useDnaNovelCreation } from '../composables/useDnaNovelCreation';
import { NOVEL_GENRE_OPTIONS } from '../config/novel-genres';
import { NOVEL_CONSTITUTION_TAG_OPTIONS } from '../config/novel-constitution-tags';
import { extractApiErrorMessage } from '../utils/api-error';
import { getMobileChartTheme } from '../utils/mobile-chart-theme';
import '../styles/mobile-fun-features.css';

const GENRE_TAGS = NOVEL_GENRE_OPTIONS.map(g => g.label);

const router = useRouter();
const dna = useShuangwenDna();
const share = useShareCard();
const dnaNovel = useDnaNovelCreation();
const sharing = ref(false);

// 插画预加载：优先读静态文件，读不到走渐变降级
const illustrationMap = reactive<Record<string, string>>({});
const illustrationLoading = ref(false);

async function prefetchIllustrations() {
  const qs = dna.questions.value;
  if (!qs.length) return;
  illustrationLoading.value = true;
  const promises = qs.map(async (q) => {
    if (illustrationMap[String(q.id)]) return;
    try {
      // 优先尝试预生成的静态插画
      const { http } = await import('../api/http');
      const res = await http.get(`/fun/dna/illustration/${q.id}`, { responseType: 'blob' });
      if (res.status === 200 && res.data) {
        const url = URL.createObjectURL(res.data);
        illustrationMap[String(q.id)] = url;
      }
    } catch { /* 静默降级 */ }
  });
  await Promise.allSettled(promises);
  illustrationLoading.value = false;
}

// 监听问题加载，触发预加载
watch(() => dna.questions.value, (qs) => {
  if (qs.length) prefetchIllustrations();
}, { immediate: true });

function illustrationFor(currentIdx: number): string | undefined {
  const q = dna.questions.value[currentIdx];
  if (!q) return undefined;
  return illustrationMap[String(q.id)];
}

/** 降级插画：按题目类型切换 CSS 渐变（完全不依赖后端） */
function fallbackGradientClass(currentIdx: number): string {
  const q = dna.questions.value[currentIdx];
  const types = new Set(['opening', 'comeback', 'trait', 'relationship', 'scene']);
  const type = q && types.has(q.type) ? q.type : 'opening';
  return `mf-quiz-illustration--${type}`;
}

// 女娲造人输入
const showCreateForm = ref(false);
const charName = ref('');
const charGender = ref<'男' | '女'>('男');
const charTheme = ref('');
const selectedTags = ref<string[]>([]);

function resetNovelAiState() {
  dnaNovel.resetAiState();
}

function buildNovelCreationInput() {
  const result = dna.result.value;
  if (!result) throw new Error('请先完成爽点 DNA 测试');
  const genreOpt = NOVEL_GENRE_OPTIONS.find(g => g.label === charTheme.value);
  return {
    result,
    questions: dna.questions.value,
    displayOptions: dna.displayOptions.value,
    answers: dna.answers.value,
    name: charName.value.trim(),
    gender: charGender.value,
    theme: charTheme.value.trim(),
    genre: genreOpt?.value ?? 'fantasy',
    constitutionTags: selectedTags.value,
  };
}

watch([charName, charGender, charTheme, selectedTags], resetNovelAiState, { deep: true });

let chartInstance: ReturnType<typeof import('echarts').init> | null = null;
const chartRef = ref<HTMLDivElement>();
const radarRef = ref<HTMLDivElement>();
onUnmounted(() => { chartInstance?.dispose(); });

watch(() => dna.result.value, async (r) => {
  if (r) { await nextTick(); renderResultRadar(); }
});

async function renderResultRadar() {
  if (!radarRef.value || !dna.result.value) return;
  const echarts = await loadECharts();
  if (!chartInstance) chartInstance = echarts.init(radarRef.value);
  const dims = dna.result.value.dims;
  const chartTheme = getMobileChartTheme(radarRef.value);
  chartInstance.setOption({
    radar: {
      indicator: dims.map(d => ({ name: d.label, max: 100 })),
      shape: 'polygon', radius: '62%', center: ['50%', '52%'],
      axisName: { color: chartTheme.textMuted, fontSize: 11, fontWeight: 600 },
      splitArea: { areaStyle: { color: [chartTheme.accentWashSubtle, chartTheme.accentWashSubtle, chartTheme.accentWashSoft, chartTheme.accentWashSoft] } },
    },
    series: [{
      type: 'radar', data: [{ value: dims.map(d => d.value), name: '爽点DNA',
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: chartTheme.accentAreaStrong }, { offset: 1, color: chartTheme.accentStrongArea }]) },
        lineStyle: { color: chartTheme.accentStrong, width: 2 }, symbol: 'circle', symbolSize: 5,
      }],
    }],
  }, true);
}

async function doShare() {
  if (!dna.result.value) return;
  sharing.value = true;
  try {
    const url = await share.generateCard({
      text: dna.result.value.shareCardData.text,
      novelTitle: '爽点DNA测试', authorName: brand.displayName,
      chapterTitle: dna.result.value.insight.slice(0, 80),
    });
    if (url) await share.shareImage(url);
  } finally { sharing.value = false; }
}

async function doCreateNovel() {
  if (!charName.value.trim() || !charTheme.value.trim()) return;
  try {
    const novelId = await dnaNovel.createNovel(buildNovelCreationInput());
    void router.push(`/m/novel/${novelId}`);
  } catch (err) {
    ElMessage.error(extractApiErrorMessage(err, '开书失败，请稍后重试'));
  }
}

window.addEventListener('resize', () => chartInstance?.resize());
onMounted(async () => { await nextTick(); window.scrollTo(0, 0); });
</script>

<template>
  <div class="mobile-fun-page">
    <!-- 结果页 -->
    <template v-if="dna.result.value">
      <div class="mf-topbar">
        <button class="mf-topbar__back" type="button" @click="dna.reset()">
          <el-icon :size="18"><RefreshRight /></el-icon>
        </button>
        <span class="mf-topbar__title">{{ showCreateForm ? '女娲造人' : '你的爽点DNA' }}</span>
      </div>

      <template v-if="!showCreateForm">
        <div class="mf-card mf-card--glow" style="margin-top:12px">
          <!-- 主型 -->
          <div class="mf-score-ring">
            <div class="mf-score-label">{{ dna.result.value.primary.label }} <span style="font-size:13px;color:var(--mf-text-muted)">· {{ dna.result.value.primary.value }}分</span></div>
            <div class="mf-score-desc">{{ dna.result.value.topDesc }}</div>
          </div>

          <!-- 副型 + 反型 -->
          <div style="display:flex;gap:10px;margin:0 0 12px;font-size:12px;color:var(--mf-text-secondary);justify-content:center">
            <span v-if="dna.result.value.secondary">副型：{{ dna.result.value.secondary.label }}（{{ dna.result.value.secondary.value }}分）</span>
            <span>避雷：{{ dna.result.value.anti.label }}</span>
          </div>

          <!-- 隐藏属性 -->
          <div v-if="dna.result.value.hiddenTraits.length" class="mf-tag-row">
            <span v-for="t in dna.result.value.hiddenTraits" :key="t" class="mf-tag">✦ {{ t }}</span>
          </div>

          <!-- 雷达 -->
          <div ref="radarRef" class="mf-radar-wrap" style="height:310px" />

          <!-- 解读 -->
          <div style="margin-top:12px;font-size:13px;color:var(--mf-text-secondary);line-height:1.7;padding:0 4px">
            {{ dna.result.value.insight }}
          </div>

          <button class="mf-btn mf-btn--primary mf-btn--block" style="margin-top:16px" @click="showCreateForm = true">
            女娲造人——以这份命运开书
          </button>
          <button class="mf-btn mf-btn--outline mf-btn--block" style="margin-top:8px" :disabled="sharing" @click="doShare">
            {{ sharing ? '生成中...' : '生成分享卡片' }}
          </button>
          <button class="mf-btn mf-btn--outline mf-btn--block" style="margin-top:8px" @click="dna.reset()">再测一次</button>
        </div>
      </template>

      <!-- 女娲造人输入 -->
      <template v-else>
        <div class="mf-card mf-card--glow" style="margin-top:12px">
          <div style="font-size:15px;font-weight:700;color:var(--mf-text-primary);margin-bottom:12px">以你的DNA为形，捏出主角</div>

          <div style="display:grid;gap:12px">
            <div>
              <div style="font-size:12px;color:var(--mf-text-secondary);margin-bottom:4px">主角名字</div>
              <input v-model="charName" class="mf-input" placeholder="为你量身定制的角色名" />
            </div>

            <div>
              <div style="font-size:12px;color:var(--mf-text-secondary);margin-bottom:4px">性别</div>
              <div style="display:flex;gap:8px">
                <button class="mf-btn mf-btn--outline" :class="{ 'mf-btn--primary': charGender === '男' }" @click="charGender = '男'">男</button>
                <button class="mf-btn mf-btn--outline" :class="{ 'mf-btn--primary': charGender === '女' }" @click="charGender = '女'">女</button>
              </div>
            </div>

            <div>
              <div style="font-size:12px;color:var(--mf-text-secondary);margin-bottom:4px">想写什么题材</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                <button
                  v-for="t in GENRE_TAGS" :key="t"
                  class="mf-btn mf-btn--outline mf-filter-chip"
                  :class="{ 'mf-btn--primary': charTheme === t }"
                  style="padding:6px 14px;font-size:12px"
                  @click="charTheme = t"
                >{{ t }}</button>
              </div>
              <input
                v-if="!GENRE_TAGS.includes(charTheme as typeof GENRE_TAGS[number])"
                v-model="charTheme"
                class="mf-input"
                style="margin-top:6px"
                placeholder="或自由输入题材..."
              />
            </div>

            <!-- 爽点标签 -->
            <div>
              <div style="font-size:12px;color:var(--mf-text-secondary);margin-bottom:4px">爽点属性（可选）</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                <button
                  v-for="tag in NOVEL_CONSTITUTION_TAG_OPTIONS" :key="tag.id"
                  class="mf-btn mf-btn--outline mf-filter-chip"
                  :class="{ 'mf-btn--primary': selectedTags.includes(tag.id) }"
                  style="padding:4px 10px;font-size:11px"
                  @click="selectedTags.includes(tag.id) ? selectedTags = selectedTags.filter(t => t !== tag.id) : selectedTags = [...selectedTags, tag.id]"
                >{{ tag.label }}</button>
              </div>
            </div>

            <button
              class="mf-btn mf-btn--primary mf-btn--block"
              style="margin-top:8px"
              :disabled="!charName.trim() || !charTheme.trim() || dnaNovel.creatingNovel.value"
              @click="doCreateNovel"
            >
              {{ dnaNovel.creatingNovel.value ? '脑洞大师正在开书...' : '以此命运，开启新作' }}
            </button>
            <button class="mf-btn mf-btn--outline mf-btn--block" @click="showCreateForm = false">
              返回测试结果
            </button>
          </div>
        </div>
      </template>
    </template>

    <!-- 答题页 -->
    <template v-else>
      <div class="mf-topbar">
        <button class="mf-topbar__back" type="button" @click="router.back()">
          <el-icon :size="18"><ArrowLeft /></el-icon>
        </button>
        <span class="mf-topbar__title">爽点DNA测试</span>
      </div>

      <div style="margin:12px 0;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--mf-text-muted)">第 {{ dna.currentStep.value + 1 }} / {{ dna.totalQuestions }} 题</span>
        <span style="font-size:12px;color:var(--mf-accent-strong);font-weight:700">{{ dna.progress.value }}%</span>
      </div>
      <div class="mf-progress-bar">
        <div class="mf-progress-bar__fill" :style="{ width: dna.progress.value + '%' }" />
      </div>

      <div class="mf-card" style="margin-top:10px">
        <!-- 插画：优先用 AI 生图，降级为类型渐变 -->
        <div
          class="mf-quiz-illustration"
          :class="fallbackGradientClass(dna.currentStep.value)"
          :style="illustrationFor(dna.currentStep.value)
            ? { backgroundImage: `url(${illustrationFor(dna.currentStep.value)})` }
            : undefined"
        >
          <div v-if="illustrationLoading" class="mf-quiz-illustration__shimmer" />
        </div>
        <div style="font-size:17px;font-weight:700;color:var(--mf-text-primary);margin-bottom:16px;line-height:1.5">
          {{ dna.questions.value[dna.currentStep.value]?.question }}
        </div>
        <div style="display:grid;gap:10px">
          <button
            v-for="(opt, oi) in dna.displayOptions.value[dna.currentStep.value] ?? []"
            :key="oi"
            class="mf-btn mf-btn--outline"
            style="width:100%;justify-content:flex-start;padding:14px 16px;text-align:left;font-weight:600;font-size:14px;line-height:1.5"
            @click="dna.selectAnswer(oi)"
          >
            {{ ['A', 'B', 'C', 'D'][oi] }}. {{ opt.text }}
          </button>
        </div>
      </div>

      <button v-if="dna.currentStep.value > 0" class="mf-btn mf-btn--outline mf-btn--block" style="margin-top:10px" @click="dna.goBack()">
        返回上一题
      </button>
    </template>
  </div>
</template>
