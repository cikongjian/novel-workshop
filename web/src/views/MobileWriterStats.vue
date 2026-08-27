<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { http } from '../api/http';
import { fetchMyWriterScore, type WriterScoreResult } from '../api/writer-scores';
import MobileTopbar from '../components/mobile-focus/MobileTopbar.vue';
import MobileSectionCard from '../components/mobile-focus/MobileSectionCard.vue';
import MobileStatGroup from '../components/mobile-focus/MobileStatGroup.vue';
import { ArrowLeft, Medal, Share, Star, StarFilled } from '@element-plus/icons-vue';
import { useThemeMode } from '../composables/useThemeMode';
import { useShareCard } from '../composables/useShareCard';
import { brand } from '../config/brand';

const router = useRouter();
const { isDark: isDarkTheme, isWarmNight } = useThemeMode();
const share = useShareCard();

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
const goalEditing = ref(false);
const goalInput = ref(2000);
const savingGoal = ref(false);
const sharingDaily = ref(false);

const heroStats = ref<Array<{ label: string; value: string | number }>>([]);

const maxHeatmapValue = ref(0);

// 作家分
const writerScore = ref<WriterScoreResult | null>(null);

async function load() {
  loading.value = true;
  try {
    const { data } = await http.get('/writer-stats');
    stats.value = data as WriterStatsData;
    goalInput.value = data.todayGoal;
    heroStats.value = [
      { label: '今日已写', value: `${data.todayWords.toLocaleString()} 字` },
      { label: '连续打卡', value: `${data.streak} 天` },
      { label: '累计字数', value: `${data.totalWords.toLocaleString()} 字` },
    ];
    maxHeatmapValue.value = Math.max(...data.weeklyHeatmap, 1);
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '加载写作数据失败');
  } finally {
    loading.value = false;
  }

  try {
    writerScore.value = await fetchMyWriterScore();
  } catch { /* 作家分加载失败不阻塞 */ }
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
    ElMessage.success('目标已更新');
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '保存目标失败');
  } finally {
    savingGoal.value = false;
  }
}

async function shareDailyCard() {
  if (!stats.value) return;
  sharingDaily.value = true;
  try {
    const text = `今日写作 ${stats.value.todayWords.toLocaleString()} 字\n连续打卡 ${stats.value.streak} 天\n累计创作 ${stats.value.totalWords.toLocaleString()} 字`;
    const shareUrl = `${window.location.origin}/m/writer-stats?from=writer-share`;
    const url = await share.generateCard({
      text,
      novelTitle: '我的作家日报',
      authorName: brand.displayName,
      chapterTitle: stats.value.streak >= 7 ? `${stats.value.streak} 天连胜 🔥` : `${stats.value.streak} 天打卡`,
      shareUrl,
      showQrPlaceholder: true,
    });
    if (url) await share.shareImage(url);
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.error || '生成分享卡片失败');
  } finally {
    sharingDaily.value = false;
  }
}

function formatWords(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
  return n.toLocaleString();
}

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

function getLevelProgress(wr: WriterScoreResult): number {
  const current = LEVEL_THRESHOLDS.find(t => t.level === wr.level);
  const next = LEVEL_THRESHOLDS.find(t => t.level === wr.level + 1);
  if (!current || !next) return 100;
  return Math.min(100, Math.round(((wr.score - current.min) / (next.min - current.min)) * 100));
}

function getNextLevelName(level: number): string {
  const next = LEVEL_THRESHOLDS.find(t => t.level === level + 1);
  return next?.name ?? '';
}

const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

onMounted(load);
</script>

<template>
  <div class="mobile-focus-page" :class="{ 'mobile-focus-page--dark': isDarkTheme, 'mobile-focus-page--warm-night': isWarmNight }">
    <div class="mobile-focus-shell">
      <MobileTopbar title="写作分析" subtitle="Writing Stats" :brand-size="28">
        <template #leading>
          <button class="mobile-focus-button--secondary" type="button" @click="() => router.back()">
            <el-icon :size="14"><ArrowLeft /></el-icon>
            返回
          </button>
        </template>
        <template #actions>
          <button
            v-if="stats"
            class="mobile-focus-button--ghost"
            type="button"
            :disabled="sharingDaily"
            @click="shareDailyCard"
          >
            <el-icon :size="14"><Share /></el-icon>
            {{ sharingDaily ? '生成中...' : '分享日报' }}
          </button>
        </template>
      </MobileTopbar>

      <div v-if="loading" class="mobile-focus-section" style="text-align:center;padding:40px;color:var(--nw-text-muted)">加载中...</div>

      <template v-else-if="stats">
        <!-- 今日进度卡 -->
        <MobileSectionCard kicker="Today">
          <div class="stats-progress">
            <div class="stats-progress__ring" :style="{ '--pct': stats.todayPercent }">
              <div class="stats-progress__ring-inner">
                <strong>{{ stats.todayWords.toLocaleString() }}</strong>
                <span>/ {{ stats.todayGoal.toLocaleString() }} 字</span>
              </div>
              <svg viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" class="stats-progress__track" />
                <circle cx="60" cy="60" r="52" class="stats-progress__fill"
                  :style="{ strokeDashoffset: 327 - (327 * stats.todayPercent / 100) }" />
              </svg>
            </div>
            <div class="stats-progress__meta">
              <div class="stats-progress__streak">
                🔥 连续 {{ stats.streak }} 天
              </div>
              <button class="stats-progress__goal-btn" @click="goalEditing = !goalEditing">
                {{ goalEditing ? '取消' : stats.todayGoal > 0 ? '修改目标' : '设定目标' }}
              </button>
            </div>
          </div>
          <Transition name="fade">
            <div v-if="goalEditing" class="stats-goal-editor">
              <input v-model.number="goalInput" type="number" min="100" max="50000" step="100" class="stats-goal-editor__input" />
              <button class="stats-goal-editor__save" :disabled="savingGoal" @click="saveGoal">
                {{ savingGoal ? '...' : '保存' }}
              </button>
            </div>
          </Transition>
        </MobileSectionCard>

        <!-- 统计概览 -->
        <MobileStatGroup :items="heroStats" />

        <!-- 作家等级 -->
        <MobileSectionCard v-if="writerScore" kicker="Writer Level">
          <div class="stats-level">
            <div class="stats-level__badge">
              <el-icon :size="22"><Medal /></el-icon>
              <span class="stats-level__name">Lv.{{ writerScore.level }} {{ writerScore.levelName }}</span>
            </div>
            <div class="stats-level__score">
              <span class="stats-level__score-num">{{ writerScore.score.toLocaleString() }}</span>
              <span class="stats-level__score-label">作家分</span>
            </div>
            <div class="stats-level__progress">
              <div class="stats-level__progress-bar">
                <div class="stats-level__progress-fill" :style="{ width: writerScore.level < 8 ? getLevelProgress(writerScore) + '%' : '100%' }" />
              </div>
              <span class="stats-level__progress-text" v-if="writerScore.level < 8">距下一级 · {{ getNextLevelName(writerScore.level) }}</span>
            </div>
            <div class="stats-level__combo" v-if="writerScore.comboDays >= 7">
              <el-icon :size="14" color="var(--mobile-focus-accent)"><StarFilled /></el-icon>
              <span>连击 {{ writerScore.comboDays }} 天 · 系数 ×{{ writerScore.comboMultiplier }}</span>
            </div>
          </div>
        </MobileSectionCard>

        <!-- 本周热力图 -->
        <MobileSectionCard kicker="Weekly">
          <div class="stats-heatmap">
            <div class="stats-heatmap__row">
              <div
                v-for="(val, i) in stats.weeklyHeatmap"
                :key="i"
                class="stats-heatmap__cell"
                :style="{
                  '--intensity': maxHeatmapValue > 0 ? val / maxHeatmapValue : 0,
                  '--label': val,
                }"
              >
                <div class="stats-heatmap__bar">
                  <span class="stats-heatmap__val">{{ formatWords(val) }}</span>
                </div>
                <span class="stats-heatmap__day">{{ weekDays[i] }}</span>
              </div>
            </div>
          </div>
        </MobileSectionCard>

        <!-- 里程碑 -->
        <MobileSectionCard kicker="Milestones">
          <div class="stats-milestones">
            <div
              v-for="m in stats.milestones"
              :key="m.label"
              :class="['stats-milestone', { 'stats-milestone--achieved': m.achieved }]"
            >
              <div class="stats-milestone__icon">{{ m.achieved ? '🏆' : '🔒' }}</div>
              <div class="stats-milestone__info">
                <strong>{{ m.label }}</strong>
                <span>{{ m.description }}</span>
              </div>
            </div>
          </div>
        </MobileSectionCard>

        <!-- 月度/周度汇总 -->
        <MobileSectionCard kicker="Summary">
          <div class="stats-summary">
            <div class="stats-summary__item">
              <span class="stats-summary__label">本周字数</span>
              <strong class="stats-summary__value">{{ stats.thisWeekWords.toLocaleString() }}</strong>
            </div>
            <div class="stats-summary__item">
              <span class="stats-summary__label">本月字数</span>
              <strong class="stats-summary__value">{{ stats.thisMonthWords.toLocaleString() }}</strong>
            </div>
            <div class="stats-summary__item">
              <span class="stats-summary__label">累计字数</span>
              <strong class="stats-summary__value">{{ stats.totalWords.toLocaleString() }}</strong>
            </div>
          </div>
        </MobileSectionCard>
      </template>

      <div v-else class="mobile-focus-empty" style="padding:40px">
        <strong>暂无写作数据</strong>
        <p>开始创作后，这里会显示您的写作分析。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-progress {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 8px 0;
}

.stats-progress__ring {
  position: relative;
  width: 110px;
  height: 110px;
  flex-shrink: 0;
}

.stats-progress__ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.stats-progress__track {
  fill: none;
  stroke: rgba(148, 163, 184, 0.15);
  stroke-width: 8;
}

.stats-progress__fill {
  fill: none;
  stroke: var(--mobile-focus-accent, #0ea5e9);
  stroke-width: 8;
  stroke-linecap: round;
  stroke-dasharray: 327;
  transition: stroke-dashoffset 0.6s ease;
}

.stats-progress__ring-inner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.stats-progress__ring-inner strong {
  font-size: 20px;
  color: var(--nw-text-primary, #102033);
}

.stats-progress__ring-inner span {
  color: var(--nw-text-muted, #5d7188);
  font-size: 11px;
}

.stats-progress__meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats-progress__streak {
  font-size: 15px;
  font-weight: 600;
}

.stats-progress__goal-btn {
  background: rgba(14, 165, 233, 0.08);
  border: 1px solid rgba(14, 165, 233, 0.2);
  color: var(--mobile-focus-accent, #0ea5e9);
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.stats-goal-editor {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.stats-goal-editor__input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--nw-border, rgba(148,163,184,0.34));
  border-radius: 8px;
  font-size: 14px;
  background: color-mix(in srgb, var(--nw-bg-card) 92%, var(--nw-bg-secondary));
  color: var(--nw-text-primary);
}

.stats-goal-editor__save {
  background: var(--mobile-focus-accent, #0ea5e9);
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

/* 热力图 */
.stats-heatmap__row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.stats-heatmap__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stats-heatmap__bar {
  width: 100%;
  height: 80px;
  background: rgba(148, 163, 184, 0.08);
  border-radius: 6px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
}

.stats-heatmap__bar::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(var(--intensity) * 100%);
  background: linear-gradient(180deg, var(--mobile-focus-accent, #0ea5e9), color-mix(in srgb, var(--mobile-focus-accent, #0ea5e9) 40%, transparent));
  border-radius: 6px;
  transition: height 0.4s ease;
  min-height: 2px;
}

.stats-heatmap__val {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--nw-text-muted);
  white-space: nowrap;
}

.stats-heatmap__day {
  font-size: 11px;
  color: var(--nw-text-muted);
}

/* 里程碑 */
.stats-milestones {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats-milestone {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.04);
}

.stats-milestone--achieved {
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.08), rgba(234, 179, 8, 0.02));
}

.stats-milestone__icon {
  font-size: 22px;
}

.stats-milestone__info {
  display: flex;
  flex-direction: column;
}

.stats-milestone__info strong {
  font-size: 14px;
}

.stats-milestone__info span {
  font-size: 12px;
  color: var(--nw-text-muted);
}

/* 汇总 */
.stats-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stats-summary__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: rgba(148, 163, 184, 0.04);
  border-radius: 8px;
}

.stats-summary__label {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.stats-summary__value {
  font-size: 18px;
  color: var(--nw-text-primary);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 作家等级 */
.stats-level {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stats-level__badge {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stats-level__name {
  font-size: 17px;
  font-weight: 700;
  color: var(--mobile-focus-accent, #0ea5e9);
}

.stats-level__score {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.stats-level__score-num {
  font-size: 28px;
  font-weight: 800;
  color: var(--nw-text-primary);
  line-height: 1;
}

.stats-level__score-label {
  font-size: 13px;
  color: var(--nw-text-muted);
}

.stats-level__progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stats-level__progress-bar {
  height: 6px;
  border-radius: 3px;
  background: rgba(148, 163, 184, 0.12);
  overflow: hidden;
}

.stats-level__progress-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--mobile-focus-accent, #0ea5e9), var(--star-brand-teal, #14b8a6));
  transition: width 0.5s ease;
}

.stats-level__progress-text {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.stats-level__combo {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--mobile-focus-accent, #0ea5e9) 8%, transparent);
  border-radius: 8px;
  font-size: 13px;
  color: var(--nw-text-secondary);
}
</style>
