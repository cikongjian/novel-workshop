<script setup lang="ts">
/**
 * 桌面端·作家统计
 * 游戏化成就系统风格：勋章、光晕、装饰元素、精致进度条
 */
import { ref, onMounted, computed } from 'vue';
import { http } from '../../api/http';
import { fetchMyWriterScore, type WriterScoreResult } from '../../api/writer-scores';
import StateView from '../../components/shared/StateView.vue';
import StatCard from '../../components/shared/StatCard.vue';
import Icon from '../../components/shared/Icon.vue';

interface WriterStatsData {
  todayWords: number;
  todayGoal: number;
  todayPercent: number;
  streak: number;
  totalWords: number;
  thisWeekWords: number;
  thisMonthWords: number;
  weeklyHeatmap: number[];
  milestones: { label: string; description: string; achieved: boolean }[];
}

const stats = ref<WriterStatsData | null>(null);
const loading = ref(true);
const error = ref<Error | null>(null);
const goalEditing = ref(false);
const goalInput = ref(2000);
const savingGoal = ref(false);

const writerScore = ref<WriterScoreResult | null>(null);
const scoreLoading = ref(false);

const maxHeatmapValue = ref(0);
const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

const LEVEL_THRESHOLDS: { level: number; name: string; min: number }[] = [
  { level: 0, name: '初涉文墨', min: 0 },
  { level: 1, name: '妙笔生花', min: 100 },
  { level: 2, name: '下笔有神', min: 500 },
  { level: 3, name: '文思泉涌', min: 1500 },
  { level: 4, name: '著作等身', min: 4500 },
  { level: 5, name: '独步文坛', min: 12000 },
  { level: 6, name: '一代文豪', min: 30000 },
  { level: 7, name: '文曲星君', min: 75000 },
  { level: 8, name: '开宗立派', min: 150000 },
];

const levelProgress = computed(() => {
  if (!writerScore.value) return 0;
  const wr = writerScore.value;
  const current = LEVEL_THRESHOLDS.find(t => t.level === wr.level);
  const next = LEVEL_THRESHOLDS.find(t => t.level === wr.level + 1);
  if (!current || !next) return 100;
  return Math.min(100, Math.round(((wr.score - current.min) / (next.min - current.min)) * 100));
});

const nextLevelName = computed(() => {
  if (!writerScore.value) return '';
  const next = LEVEL_THRESHOLDS.find(t => t.level === writerScore.value!.level + 1);
  return next?.name ?? '';
});

const nextLevelScore = computed(() => {
  if (!writerScore.value) return 0;
  const next = LEVEL_THRESHOLDS.find(t => t.level === writerScore.value!.level + 1);
  return next?.min ?? 0;
});

const scoreToNextLevel = computed(() => {
  if (!writerScore.value) return 0;
  return Math.max(0, nextLevelScore.value - writerScore.value.score);
});

const achievedMilestones = computed(() => stats.value?.milestones.filter(m => m.achieved).length ?? 0);
const totalMilestones = computed(() => stats.value?.milestones.length ?? 0);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await http.get('/writer-stats');
    stats.value = data as WriterStatsData;
    goalInput.value = data.todayGoal;
    maxHeatmapValue.value = Math.max(...data.weeklyHeatmap, 1);
  } catch (err) {
    error.value = err as Error;
  } finally {
    loading.value = false;
  }

  scoreLoading.value = true;
  try {
    writerScore.value = await fetchMyWriterScore();
  } catch { /* ignore */ }
  finally { scoreLoading.value = false; }
}

async function saveGoal() {
  savingGoal.value = true;
  try {
    await http.put('/writer-stats/goal', { goal: goalInput.value });
    if (stats.value) {
      stats.value.todayGoal = goalInput.value;
      stats.value.todayPercent = goalInput.value > 0
        ? Math.min(100, Math.round((stats.value.todayWords / goalInput.value) * 100))
        : 0;
    }
    goalEditing.value = false;
  } catch { /* ignore */ }
  finally { savingGoal.value = false; }
}

function formatWords(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return n.toLocaleString();
}

function formatScore(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString();
}

function getHeatmapColor(i: number): string {
  const colors = [
    'var(--ws-heat-low)',
    'var(--ws-heat-mid)',
    'var(--ws-heat-high)',
  ];
  const val = stats.value?.weeklyHeatmap[i] ?? 0;
  const ratio = maxHeatmapValue.value > 0 ? val / maxHeatmapValue.value : 0;
  if (ratio < 0.33) return colors[0];
  if (ratio < 0.66) return colors[1];
  return colors[2];
}

onMounted(load);
</script>

<template>
  <div class="writer-stats-page">
    <StateView :loading="loading" :error="error" @retry="load">
      <template v-if="stats">
        <!-- 顶部 Hero 区：今日写作 + 连续打卡 -->
        <section class="ws-hero">
          <div class="ws-hero__bg">
            <div class="ws-hero__glow ws-hero__glow--1"></div>
            <div class="ws-hero__glow ws-hero__glow--2"></div>
            <div class="ws-hero__dots"></div>
          </div>

          <div class="ws-hero__content">
            <div class="ws-hero__left">
              <div class="ws-hero__badge">
                <Icon name="flame" :size="14" />
                第 {{ stats.streak }} 天
              </div>
              <h1 class="ws-hero__title">
                <span class="ws-hero__title-accent">今日写作</span>
              </h1>
              <p class="ws-hero__subtitle">每一个字都是通往星辰大海的台阶</p>

              <div class="ws-hero__kpis">
                <div class="ws-kpi">
                  <span class="ws-kpi__value">{{ formatWords(stats.todayWords) }}</span>
                  <span class="ws-kpi__label">今日字数</span>
                </div>
                <div class="ws-kpi">
                  <span class="ws-kpi__value">{{ formatWords(stats.thisWeekWords) }}</span>
                  <span class="ws-kpi__label">本周累计</span>
                </div>
                <div class="ws-kpi">
                  <span class="ws-kpi__value">{{ formatWords(stats.totalWords) }}</span>
                  <span class="ws-kpi__label">总字数</span>
                </div>
              </div>
            </div>

            <div class="ws-hero__right">
              <div class="ws-ring">
                <svg viewBox="0 0 200 200" class="ws-ring__svg">
                  <defs>
                    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="var(--ws-ring-start)" />
                      <stop offset="100%" stop-color="var(--ws-ring-end)" />
                    </linearGradient>
                  </defs>
                  <circle cx="100" cy="100" r="84" class="ws-ring__track" />
                  <circle
                    cx="100" cy="100" r="84"
                    class="ws-ring__fill"
                    :style="{ strokeDashoffset: 528 - (528 * stats.todayPercent / 100) }"
                  />
                </svg>
                <div class="ws-ring__inner">
                  <span class="ws-ring__pct">{{ stats.todayPercent }}%</span>
                  <span class="ws-ring__label">目标进度</span>
                  <span class="ws-ring__sub">{{ stats.todayWords.toLocaleString() }} / {{ stats.todayGoal.toLocaleString() }} 字</span>
                </div>
              </div>

              <div class="ws-goal">
                <template v-if="!goalEditing">
                  <span class="ws-goal__label">每日目标</span>
                  <span class="ws-goal__value">{{ stats.todayGoal.toLocaleString() }} 字</span>
                  <button class="ws-goal__btn" @click="goalEditing = true">
                    <Icon name="pen" :size="12" /> 调整
                  </button>
                </template>
                <template v-else>
                  <span class="ws-goal__label">每日目标</span>
                  <input v-model.number="goalInput" type="number" min="100" max="50000" step="100" class="ws-goal__input" />
                  <button class="ws-goal__btn ws-goal__btn--primary" :disabled="savingGoal" @click="saveGoal">
                    {{ savingGoal ? '…' : '保存' }}
                  </button>
                  <button class="ws-goal__btn" @click="goalEditing = false">取消</button>
                </template>
              </div>
            </div>
          </div>
        </section>

        <!-- 作家等级勋章区 -->
        <section v-if="writerScore" class="ws-level">
          <div class="ws-level__bg">
            <div class="ws-level__aurora"></div>
          </div>

          <div class="ws-level__content">
            <div class="ws-level__left">
              <!-- 大勋章 -->
              <div class="ws-medal">
                <div class="ws-medal__ring ws-medal__ring--outer"></div>
                <div class="ws-medal__ring ws-medal__ring--mid"></div>
                <div class="ws-medal__ring ws-medal__ring--inner"></div>

                <div class="ws-medal__stars">
                  <span class="ws-medal__star ws-medal__star--1">✦</span>
                  <span class="ws-medal__star ws-medal__star--2">✧</span>
                  <span class="ws-medal__star ws-medal__star--3">✦</span>
                  <span class="ws-medal__star ws-medal__star--4">✧</span>
                  <span class="ws-medal__star ws-medal__star--5">✦</span>
                </div>

                <div class="ws-medal__core">
                  <div class="ws-medal__level">Lv.{{ writerScore.level }}</div>
                  <div class="ws-medal__icon">
                    <Icon name="crown" :size="28" />
                  </div>
                  <div class="ws-medal__name">{{ writerScore.levelName }}</div>
                </div>
              </div>

              <div class="ws-level__title-block">
                <h2 class="ws-level__title">{{ writerScore.levelName }}</h2>
                <p class="ws-level__subtitle">
                  <span class="ws-level__score">{{ formatScore(writerScore.score) }}</span>
                  <span class="ws-level__unit">作家分</span>
                </p>
              </div>

              <div v-if="writerScore.comboDays >= 7" class="ws-combo">
                <div class="ws-combo__icon">
                  <Icon name="zap" :size="18" />
                </div>
                <div class="ws-combo__text">
                  <strong>连击 {{ writerScore.comboDays }} 天</strong>
                  <span>得分系数 ×{{ writerScore.comboMultiplier }}</span>
                </div>
              </div>
            </div>

            <div class="ws-level__right">
              <div class="ws-level__progress-header">
                <span class="ws-level__progress-label">升级进度</span>
                <span class="ws-level__progress-pct">{{ levelProgress }}%</span>
              </div>

              <div class="ws-level__bar">
                <div class="ws-level__bar-track">
                  <div
                    class="ws-level__bar-fill"
                    :style="{ width: levelProgress + '%' }"
                  >
                    <div class="ws-level__bar-shine"></div>
                  </div>
                </div>
                <div class="ws-level__bar-markers">
                  <span v-for="i in 5" :key="i" class="ws-level__bar-marker"></span>
                </div>
              </div>

              <div v-if="writerScore.level < 8" class="ws-level__next">
                <div class="ws-level__next-info">
                  <Icon name="chevronRight" :size="14" />
                  <span>距「{{ nextLevelName }}」</span>
                  <strong>还差 {{ formatScore(scoreToNextLevel) }} 分</strong>
                </div>
              </div>
              <div v-else class="ws-level__max">
                <Icon name="award" :size="16" />
                <span>已达最高等级 · 开宗立派</span>
              </div>

              <!-- 等级阶梯 -->
              <div class="ws-level__ladder">
                <div
                  v-for="lv in LEVEL_THRESHOLDS.slice(0, 7)"
                  :key="lv.level"
                  class="ws-level__step"
                  :class="{ 'is-current': lv.level === writerScore.level, 'is-passed': lv.level < writerScore.level }"
                >
                  <div class="ws-level__step-dot"></div>
                  <div class="ws-level__step-info">
                    <span class="ws-level__step-name">{{ lv.name }}</span>
                    <span class="ws-level__step-score">{{ formatScore(lv.min) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 两列布局：热力图 + 里程碑 -->
        <div class="ws-grid">
          <!-- 本周热力图 -->
          <section class="ws-card ws-heatmap">
            <div class="ws-card__head">
              <div class="ws-card__icon">
                <Icon name="barChart" :size="16" />
              </div>
              <div>
                <h3 class="ws-card__title">本周写作热力</h3>
                <p class="ws-card__subtitle">最近 7 天写作强度</p>
              </div>
            </div>

            <div class="ws-heatmap__body">
              <div
                v-for="(val, i) in stats.weeklyHeatmap"
                :key="i"
                class="ws-heatmap__col"
              >
                <div class="ws-heatmap__bars">
                  <div class="ws-heatmap__bar-track"></div>
                  <div
                    class="ws-heatmap__bar-fill"
                    :style="{
                      height: maxHeatmapValue > 0 ? Math.max(4, (val / maxHeatmapValue) * 100) + '%' : '4px',
                      background: getHeatmapColor(i),
                    }"
                  ></div>
                </div>
                <span class="ws-heatmap__val">{{ formatWords(val) }}</span>
                <span class="ws-heatmap__day">周{{ weekDays[i] }}</span>
              </div>
            </div>
          </section>

          <!-- 里程碑成就 -->
          <section class="ws-card ws-milestones">
            <div class="ws-card__head">
              <div class="ws-card__icon ws-card__icon--gold">
                <Icon name="award" :size="16" />
              </div>
              <div>
                <h3 class="ws-card__title">成就里程碑</h3>
                <p class="ws-card__subtitle">已解锁 {{ achievedMilestones }} / {{ totalMilestones }}</p>
              </div>
            </div>

            <div class="ws-milestones__body">
              <div
                v-for="m in stats.milestones"
                :key="m.label"
                class="ws-milestone"
                :class="{ 'is-achieved': m.achieved }"
              >
                <div class="ws-milestone__badge">
                  <Icon v-if="m.achieved" name="check" :size="14" />
                  <Icon v-else name="lock" :size="12" />
                </div>
                <div class="ws-milestone__info">
                  <strong>{{ m.label }}</strong>
                  <span>{{ m.description }}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- 底部汇总 -->
        <section class="ws-card ws-summary">
          <div class="ws-card__head">
            <div class="ws-card__icon ws-card__icon--purple">
              <Icon name="pieChart" :size="16" />
            </div>
            <div>
              <h3 class="ws-card__title">创作汇总</h3>
              <p class="ws-card__subtitle">全周期写作数据一览</p>
            </div>
          </div>

          <div class="ws-summary__body">
            <div class="ws-summary__item">
              <div class="ws-summary__value">{{ formatWords(stats.thisWeekWords) }}</div>
              <div class="ws-summary__label">本周字数</div>
              <div class="ws-summary__bar">
                <div class="ws-summary__bar-fill" :style="{ width: Math.min(100, stats.thisWeekWords / (stats.todayGoal * 7) * 100) + '%' }"></div>
              </div>
            </div>
            <div class="ws-summary__item">
              <div class="ws-summary__value">{{ formatWords(stats.thisMonthWords) }}</div>
              <div class="ws-summary__label">本月字数</div>
              <div class="ws-summary__bar">
                <div class="ws-summary__bar-fill" :style="{ width: Math.min(100, stats.thisMonthWords / (stats.todayGoal * 30) * 100) + '%' }"></div>
              </div>
            </div>
            <div class="ws-summary__item">
              <div class="ws-summary__value">{{ formatWords(stats.totalWords) }}</div>
              <div class="ws-summary__label">累计字数</div>
              <div class="ws-summary__bar">
                <div class="ws-summary__bar-fill" style="width: 100%"></div>
              </div>
            </div>
            <div class="ws-summary__item">
              <div class="ws-summary__value">{{ stats.streak }} 天</div>
              <div class="ws-summary__label">连续创作</div>
              <div class="ws-summary__bar">
                <div class="ws-summary__bar-fill" :style="{ width: Math.min(100, stats.streak / 30 * 100) + '%' }"></div>
              </div>
            </div>
          </div>
        </section>
      </template>

      <template #empty>
        <div class="nw-state nw-state--empty">
          <p class="nw-state__title">暂无写作数据</p>
          <p class="nw-state__desc">开始创作后，这里会显示您的写作分析。</p>
        </div>
      </template>
    </StateView>
  </div>
</template>

<style scoped>
.writer-stats-page {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
  --ws-ring-start: #60a5fa;
  --ws-ring-end: #a78bfa;
  --ws-heat-low: #bfdbfe;
  --ws-heat-mid: #60a5fa;
  --ws-heat-high: #6366f1;
  --ws-gold-start: #fbbf24;
  --ws-gold-end: #f59e0b;
  --ws-purple-start: #a78bfa;
  --ws-purple-end: #8b5cf6;
}

:global(html.dark) .writer-stats-page {
  --ws-heat-low: #1e3a5f;
  --ws-heat-mid: #3b82f6;
  --ws-heat-high: #6366f1;
}

:global(html.dark.warm-night) .writer-stats-page {
  --ws-ring-start: #f59e0b;
  --ws-ring-end: #d97706;
  --ws-heat-low: #451a03;
  --ws-heat-mid: #f59e0b;
  --ws-heat-high: #d97706;
  --ws-purple-start: #fbbf24;
  --ws-purple-end: #f59e0b;
}

/* ============ Hero ============ */
.ws-hero {
  position: relative;
  border-radius: var(--nw-radius-xl);
  overflow: hidden;
  padding: var(--nw-space-6) var(--nw-space-8);
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
}

.ws-hero__bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ws-hero__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;
}

.ws-hero__glow--1 {
  width: 300px;
  height: 300px;
  background: linear-gradient(135deg, var(--ws-ring-start), var(--ws-ring-end));
  top: -100px;
  right: 10%;
  animation: float 8s ease-in-out infinite;
}

.ws-hero__glow--2 {
  width: 250px;
  height: 250px;
  background: linear-gradient(135deg, var(--ws-gold-start), var(--ws-gold-end));
  bottom: -80px;
  left: 15%;
  opacity: 0.1;
  filter: blur(60px);
  animation: float 10s ease-in-out infinite reverse;
}

@keyframes float {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-20px) scale(1.05); }
}

.ws-hero__dots {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, var(--nw-text-muted) 1px, transparent 1px);
  background-size: 24px 24px;
  opacity: 0.08;
}

.ws-hero__content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-8);
}

.ws-hero__left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
  min-width: 0;
}

.ws-hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  background: linear-gradient(135deg, #fef3c7, #fde68a);
  color: #92400e;
  font-size: 13px;
  font-weight: 600;
  width: fit-content;
}

:global(html.dark) .ws-hero__badge {
  background: linear-gradient(135deg, #78350f, #92400e);
  color: #fef3c7;
}

.ws-hero__title {
  font-size: 24px;
  font-weight: 800;
  margin: 0;
  line-height: 1.2;
}

.ws-hero__title-accent {
  background: linear-gradient(135deg, var(--ws-ring-start), var(--ws-ring-end));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.ws-hero__subtitle {
  font-size: 14px;
  color: var(--nw-text-muted);
  margin: 0;
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-hero__kpis {
  display: flex;
  gap: var(--nw-space-6);
  margin-top: var(--nw-space-2);
}

.ws-kpi {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ws-kpi__value {
  font-size: 24px;
  font-weight: 800;
  color: var(--nw-text-primary);
  line-height: 1;
}

.ws-kpi__label {
  font-size: 12px;
  color: var(--nw-text-muted);
}

/* Ring */
.ws-hero__right {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--nw-space-4);
  flex-shrink: 0;
}

.ws-ring {
  position: relative;
  width: 180px;
  height: 180px;
}

.ws-ring__svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ws-ring__track {
  fill: none;
  stroke: var(--nw-border);
  stroke-width: 12;
}

.ws-ring__fill {
  fill: none;
  stroke: url(#ringGrad);
  stroke-width: 12;
  stroke-linecap: round;
  stroke-dasharray: 528;
  transition: stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1);
  filter: drop-shadow(0 0 8px rgba(96, 165, 250, 0.4));
}

.ws-ring__inner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 2px;
}

.ws-ring__pct {
  font-size: 36px;
  font-weight: 800;
  background: linear-gradient(135deg, var(--ws-ring-start), var(--ws-ring-end));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}

.ws-ring__label {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.ws-ring__sub {
  font-size: 11px;
  color: var(--nw-text-secondary);
  margin-top: 4px;
}

/* Goal */
.ws-goal {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  padding: var(--nw-space-3) var(--nw-space-4);
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-lg);
  border: 1px solid var(--nw-border);
  font-size: 13px;
}

.ws-goal__label {
  color: var(--nw-text-muted);
}

.ws-goal__value {
  font-weight: 700;
  color: var(--nw-text-primary);
}

.ws-goal__btn {
  padding: 4px 10px;
  border: 1px solid var(--nw-border);
  border-radius: 999px;
  background: var(--nw-bg-primary);
  color: var(--nw-text-secondary);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.ws-goal__btn:hover {
  border-color: var(--ws-ring-start);
  color: var(--ws-ring-start);
}

.ws-goal__btn--primary {
  background: linear-gradient(135deg, var(--ws-ring-start), var(--ws-ring-end));
  border: none;
  color: #fff;
}

.ws-goal__btn--primary:hover {
  opacity: 0.9;
  color: #fff;
}

.ws-goal__input {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid var(--nw-border);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-primary);
  color: var(--nw-text-primary);
  font-size: 13px;
  outline: none;
}

.ws-goal__input:focus {
  border-color: var(--ws-ring-start);
}

/* ============ Level Medal ============ */
.ws-level {
  position: relative;
  border-radius: var(--nw-radius-xl);
  overflow: hidden;
  padding: var(--nw-space-7) var(--nw-space-8);
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
}

.ws-level__bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.ws-level__aurora {
  position: absolute;
  top: -50%;
  right: -10%;
  width: 500px;
  height: 500px;
  background:
    radial-gradient(circle at 30% 30%, rgba(251, 191, 36, 0.12) 0%, transparent 50%),
    radial-gradient(circle at 70% 70%, rgba(167, 139, 250, 0.1) 0%, transparent 50%);
  filter: blur(40px);
  animation: aurora 12s ease-in-out infinite alternate;
}

@keyframes aurora {
  0% { transform: translate(0, 0) rotate(0deg); }
  100% { transform: translate(-30px, 20px) rotate(15deg); }
}

.ws-level__content {
  position: relative;
  z-index: 1;
  display: flex;
  gap: var(--nw-space-10);
  align-items: stretch;
}

.ws-level__left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--nw-space-5);
  flex-shrink: 0;
  width: 240px;
}

/* Medal */
.ws-medal {
  position: relative;
  width: 180px;
  height: 180px;
  display: grid;
  place-items: center;
}

.ws-medal__ring {
  position: absolute;
  border-radius: 50%;
}

.ws-medal__ring--outer {
  width: 100%;
  height: 100%;
  border: 2px solid transparent;
  background:
    linear-gradient(var(--nw-bg-primary), var(--nw-bg-primary)) padding-box,
    linear-gradient(135deg, var(--ws-gold-start), var(--ws-purple-end), var(--ws-gold-start)) border-box;
  animation: spin 20s linear infinite;
}

.ws-medal__ring--mid {
  width: 82%;
  height: 82%;
  border: 1px dashed var(--ws-gold-start);
  opacity: 0.5;
  animation: spin 30s linear infinite reverse;
}

.ws-medal__ring--inner {
  width: 68%;
  height: 68%;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fbbf24 100%);
  box-shadow:
    0 0 30px rgba(251, 191, 36, 0.3),
    inset 0 2px 10px rgba(255, 255, 255, 0.5),
    inset 0 -4px 10px rgba(0, 0, 0, 0.1);
}

:global(html.dark) .ws-medal__ring--inner {
  background: linear-gradient(135deg, #78350f 0%, #92400e 50%, #b45309 100%);
  box-shadow:
    0 0 40px rgba(251, 191, 36, 0.2),
    inset 0 2px 10px rgba(255, 255, 255, 0.1),
    inset 0 -4px 10px rgba(0, 0, 0, 0.3);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.ws-medal__stars {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ws-medal__star {
  position: absolute;
  color: var(--ws-gold-start);
  animation: twinkle 2s ease-in-out infinite;
}

.ws-medal__star--1 { top: 5%; left: 50%; font-size: 12px; animation-delay: 0s; }
.ws-medal__star--2 { top: 25%; right: 8%; font-size: 8px; animation-delay: 0.4s; }
.ws-medal__star--3 { bottom: 8%; right: 20%; font-size: 10px; animation-delay: 0.8s; }
.ws-medal__star--4 { bottom: 25%; left: 8%; font-size: 8px; animation-delay: 1.2s; }
.ws-medal__star--5 { top: 20%; left: 12%; font-size: 10px; animation-delay: 1.6s; }

@keyframes twinkle {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

.ws-medal__core {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: #78350f;
}

:global(html.dark) .ws-medal__core {
  color: #fef3c7;
}

.ws-medal__level {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 1px;
}

.ws-medal__icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
}

.ws-medal__name {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

/* Title block */
.ws-level__title-block {
  text-align: center;
}

.ws-level__title {
  font-size: 20px;
  font-weight: 800;
  margin: 0 0 8px 0;
  background: linear-gradient(135deg, var(--ws-gold-start), var(--ws-gold-end));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.ws-level__subtitle {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  margin: 0;
}

.ws-level__score {
  font-size: 28px;
  font-weight: 800;
  color: var(--nw-text-primary);
  line-height: 1;
}

.ws-level__unit {
  font-size: 12px;
  color: var(--nw-text-muted);
}

/* Combo */
.ws-combo {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  padding: var(--nw-space-3) var(--nw-space-4);
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.05));
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: var(--nw-radius-lg);
  width: 100%;
}

.ws-combo__icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--ws-gold-start), var(--ws-gold-end));
  display: grid;
  place-items: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3);
}

.ws-combo__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ws-combo__text strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--nw-text-primary);
}

.ws-combo__text span {
  font-size: 12px;
  color: var(--nw-text-muted);
}

/* Level right side */
.ws-level__right {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--nw-space-5);
  padding-left: var(--nw-space-6);
  border-left: 1px solid var(--nw-border);
}

.ws-level__progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ws-level__progress-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-secondary);
}

.ws-level__progress-pct {
  font-size: 14px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--ws-gold-start), var(--ws-gold-end));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Progress bar */
.ws-level__bar {
  position: relative;
}

.ws-level__bar-track {
  height: 14px;
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-border);
  overflow: hidden;
  position: relative;
}

.ws-level__bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ws-gold-start), var(--ws-gold-end));
  position: relative;
  transition: width 1s cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.4);
}

.ws-level__bar-shine {
  position: absolute;
  top: 0;
  left: -30%;
  width: 30%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent);
  animation: shine 2.5s ease-in-out infinite;
}

@keyframes shine {
  0% { left: -30%; }
  60%, 100% { left: 130%; }
}

.ws-level__bar-markers {
  display: flex;
  justify-content: space-between;
  padding: 0 1px;
  margin-top: 6px;
}

.ws-level__bar-marker {
  width: 2px;
  height: 6px;
  border-radius: 1px;
  background: var(--nw-border);
}

/* Next level */
.ws-level__next-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--nw-text-muted);
}

.ws-level__next-info strong {
  color: var(--ws-gold-end);
  font-weight: 600;
}

.ws-level__max {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ws-gold-end);
}

/* Ladder */
.ws-level__ladder {
  display: flex;
  gap: var(--nw-space-2);
  flex-wrap: wrap;
}

.ws-level__step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-border);
  transition: all 0.2s;
}

.ws-level__step.is-passed {
  border-color: rgba(251, 191, 36, 0.3);
  background: rgba(251, 191, 36, 0.06);
}

.ws-level__step.is-current {
  border-color: var(--ws-gold-start);
  background: rgba(251, 191, 36, 0.1);
  box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.15);
}

.ws-level__step-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nw-border);
  flex-shrink: 0;
}

.ws-level__step.is-passed .ws-level__step-dot,
.ws-level__step.is-current .ws-level__step-dot {
  background: var(--ws-gold-start);
}

.ws-level__step-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ws-level__step-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--nw-text-secondary);
  white-space: nowrap;
}

.ws-level__step.is-current .ws-level__step-name {
  color: var(--ws-gold-end);
  font-weight: 700;
}

.ws-level__step-score {
  font-size: 10px;
  color: var(--nw-text-muted);
}

/* ============ Grid ============ */
.ws-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--nw-space-5);
}

/* Card */
.ws-card {
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
  border-radius: var(--nw-radius-lg);
  padding: var(--nw-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.ws-card__head {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
}

.ws-card__icon {
  width: 36px;
  height: 36px;
  border-radius: var(--nw-radius-md);
  background: linear-gradient(135deg, var(--ws-ring-start), var(--ws-ring-end));
  display: grid;
  place-items: center;
  color: #fff;
  flex-shrink: 0;
}

.ws-card__icon--gold {
  background: linear-gradient(135deg, var(--ws-gold-start), var(--ws-gold-end));
}

.ws-card__icon--purple {
  background: linear-gradient(135deg, var(--ws-purple-start), var(--ws-purple-end));
}

.ws-card__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0;
}

.ws-card__subtitle {
  font-size: 12px;
  color: var(--nw-text-muted);
  margin: 2px 0 0 0;
}

/* Heatmap */
.ws-heatmap__body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--nw-space-2);
}

.ws-heatmap__col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.ws-heatmap__bars {
  width: 100%;
  height: 100px;
  position: relative;
  display: flex;
  align-items: flex-end;
}

.ws-heatmap__bar-track {
  position: absolute;
  inset: 0;
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-md) var(--nw-radius-md) 4px 4px;
}

.ws-heatmap__bar-fill {
  position: relative;
  z-index: 1;
  width: 100%;
  border-radius: var(--nw-radius-md) var(--nw-radius-md) 4px 4px;
  transition: height 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  min-height: 4px;
}

.ws-heatmap__val {
  font-size: 11px;
  font-weight: 600;
  color: var(--nw-text-secondary);
}

.ws-heatmap__day {
  font-size: 11px;
  color: var(--nw-text-muted);
}

/* Milestones */
.ws-milestones__body {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
  max-height: 280px;
  overflow-y: auto;
  padding-right: 4px;
}

.ws-milestone {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
  padding: var(--nw-space-3);
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-secondary);
  border: 1px solid transparent;
  transition: all 0.2s;
}

.ws-milestone.is-achieved {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(245, 158, 11, 0.04));
  border-color: rgba(251, 191, 36, 0.25);
}

.ws-milestone__badge {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
  display: grid;
  place-items: center;
  color: var(--nw-text-muted);
  flex-shrink: 0;
}

.ws-milestone.is-achieved .ws-milestone__badge {
  background: linear-gradient(135deg, var(--ws-gold-start), var(--ws-gold-end));
  border: none;
  color: #fff;
  box-shadow: 0 2px 8px rgba(251, 191, 36, 0.3);
}

.ws-milestone__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.ws-milestone__info strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--nw-text-primary);
}

.ws-milestone__info span {
  font-size: 11px;
  color: var(--nw-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Summary */
.ws-summary__body {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--nw-space-4);
}

.ws-summary__item {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-2);
  padding: var(--nw-space-4);
  background: var(--nw-bg-secondary);
  border-radius: var(--nw-radius-lg);
  border: 1px solid var(--nw-border);
}

.ws-summary__value {
  font-size: 22px;
  font-weight: 800;
  color: var(--nw-text-primary);
  line-height: 1;
}

.ws-summary__label {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.ws-summary__bar {
  height: 4px;
  border-radius: 999px;
  background: var(--nw-border);
  overflow: hidden;
  margin-top: auto;
}

.ws-summary__bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--ws-purple-start), var(--ws-purple-end));
  transition: width 0.6s ease;
}
</style>
