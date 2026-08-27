<script setup lang="ts">
/**
 * 桌面端·热点报告
 * 全网创作风向 + AI 写作建议
 */
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useTrendsMaster } from '../../composables/useTrendsMaster';
import { useAuthStore } from '../../stores/auth';
import StateView from '../../components/shared/StateView.vue';
import Icon from '../../components/shared/Icon.vue';
import type { TrendsRecommendation, TrendsPlatformAnalysis } from '../../api/trends';

const router = useRouter();
const authStore = useAuthStore();
const { isAdmin } = storeToRefs(authStore);

const {
  loading,
  refreshing,
  hasData,
  overallTrends,
  platforms,
  recommendations,
  lastUpdated,
  history,
  refresh,
} = useTrendsMaster();

const showAllRecs = ref(false);
const showAllPlatforms = ref(false);
const MAX_VISIBLE_RECS = 4;
const MAX_VISIBLE_PLATFORMS = 3;

const visibleRecs = computed(() =>
  showAllRecs.value ? recommendations.value : recommendations.value.slice(0, MAX_VISIBLE_RECS),
);

const visiblePlatforms = computed(() =>
  showAllPlatforms.value ? platforms.value : platforms.value.slice(0, MAX_VISIBLE_PLATFORMS),
);

const updatedLabel = computed(() => {
  if (!lastUpdated.value) return '暂无数据';
  const d = new Date(lastUpdated.value);
  if (Number.isNaN(d.getTime())) return '未知';
  const now = Date.now();
  const diffHours = Math.floor((now - d.getTime()) / 3_600_000);
  if (diffHours < 1) return '刚刚更新';
  if (diffHours < 24) return diffHours + ' 小时前';
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' 更新';
});

const isStale = computed(() => {
  if (!lastUpdated.value) return true;
  const d = new Date(lastUpdated.value);
  return Date.now() - d.getTime() > 86_400_000;
});

function getTrendLabel(trend: string): string {
  const map: Record<string, string> = { rising: '上升', stable: '稳定', declining: '下降' };
  return map[trend] ?? trend;
}

function getConfidenceLabel(level: TrendsRecommendation['confidenceLevel']): string {
  const map: Record<string, string> = { high: '高潜力', medium: '中等', low: '待观察' };
  return map[level] ?? level;
}

function getConfidenceClass(level: TrendsRecommendation['confidenceLevel']): string {
  const map: Record<string, string> = { high: 'high', medium: 'medium', low: 'low' };
  return map[level] ?? 'medium';
}

function formatHistoryDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
}

function goPanguWithGenre(genre: string) {
  ElMessage.info('用「' + genre + '」题材开书');
  router.push('/desktop/fun-hub');
}

function tryRefresh() {
  if (!isAdmin.value) {
    ElMessage.info('仅管理员可刷新趋势数据');
    return;
  }
  refresh();
}
</script>

<template>
  <div class="inspiration-page">
    <!-- Hero -->
    <section class="ip-hero">
      <div class="ip-hero__bg">
        <div class="ip-hero__glow ip-hero__glow--1"></div>
        <div class="ip-hero__glow ip-hero__glow--2"></div>
        <div class="ip-hero__grid"></div>
      </div>
      <div class="ip-hero__content">
        <div class="ip-hero__left">
          <div class="ip-hero__badge">
            <Icon name="sparkles" :size="14" />
            热点报告
          </div>
          <h1 class="ip-hero__title">
            <span class="ip-hero__title-accent">全网创作风向</span>
          </h1>
          <p class="ip-hero__subtitle">
            基于各大平台热门数据，AI 分析题材趋势与写作建议
          </p>
          <div class="ip-hero__updated">
            <span class="ip-hero__dot" :class="{ 'ip-hero__dot--stale': isStale }" />
            {{ updatedLabel }}
          </div>
        </div>
        <div class="ip-hero__actions">
          <button
            class="ip-refresh-btn"
            :disabled="refreshing"
            @click="tryRefresh"
          >
            <Icon name="refresh" :size="14" :class="{ 'is-spin': refreshing }" />
            {{ refreshing ? '生成中…' : '刷新报告' }}
          </button>
        </div>
      </div>
    </section>

    <StateView :loading="loading && !hasData" :error="null" :empty="!loading && !hasData" @retry="refresh">
      <template #empty>
        <div class="ip-empty">
          <Icon name="sparkles" :size="32" />
          <p class="ip-empty__title">暂无热点报告</p>
          <p class="ip-empty__desc">点击「刷新报告」从各大平台抓取最新热门分析</p>
        </div>
      </template>

      <template v-if="hasData">
        <!-- KPI -->
        <div class="ip-kpi-grid">
          <div class="ip-kpi ip-kpi--genre">
            <div class="ip-kpi__icon"><Icon name="flame" :size="20" /></div>
            <div class="ip-kpi__info">
              <span class="ip-kpi__value">{{ overallTrends?.hotGenres?.length ?? 0 }}</span>
              <span class="ip-kpi__label">热门类型</span>
            </div>
            <div class="ip-kpi__deco"></div>
          </div>
          <div class="ip-kpi ip-kpi--theme">
            <div class="ip-kpi__icon"><Icon name="zap" :size="20" /></div>
            <div class="ip-kpi__info">
              <span class="ip-kpi__value">{{ overallTrends?.emergingThemes?.length ?? 0 }}</span>
              <span class="ip-kpi__label">新兴主题</span>
            </div>
            <div class="ip-kpi__deco"></div>
          </div>
          <div class="ip-kpi ip-kpi--rec">
            <div class="ip-kpi__icon"><Icon name="lightbulb" :size="20" /></div>
            <div class="ip-kpi__info">
              <span class="ip-kpi__value">{{ recommendations.length }}</span>
              <span class="ip-kpi__label">写作建议</span>
            </div>
            <div class="ip-kpi__deco"></div>
          </div>
          <div class="ip-kpi ip-kpi--platform">
            <div class="ip-kpi__icon"><Icon name="globe" :size="20" /></div>
            <div class="ip-kpi__info">
              <span class="ip-kpi__value">{{ platforms.length }}</span>
              <span class="ip-kpi__label">覆盖平台</span>
            </div>
            <div class="ip-kpi__deco"></div>
          </div>
        </div>

        <!-- 热门类型 & 主题 -->
        <div class="ip-card-row">
          <div class="ip-card ip-genres">
            <div class="ip-card__head">
              <div class="ip-card__icon ip-card__icon--rose">
                <Icon name="flame" :size="16" />
              </div>
              <div>
                <h3 class="ip-card__title">热门类型</h3>
                <p class="ip-card__subtitle">当前最火的题材方向</p>
              </div>
            </div>
            <div class="ip-genre-list">
              <button
                v-for="(g, i) in (overallTrends?.hotGenres ?? []).slice(0, 8)"
                :key="g"
                class="ip-genre-tag"
                :class="{ 'ip-genre-tag--top': i < 3 }"
                @click="goPanguWithGenre(g)"
              >
                <span class="ip-genre-tag__rank">{{ i + 1 }}</span>
                <span class="ip-genre-tag__name">{{ g }}</span>
                <Icon name="arrowRight" :size="12" class="ip-genre-tag__arrow" />
              </button>
            </div>
          </div>

          <div class="ip-card ip-themes">
            <div class="ip-card__head">
              <div class="ip-card__icon ip-card__icon--violet">
                <Icon name="zap" :size="16" />
              </div>
              <div>
                <h3 class="ip-card__title">新兴主题</h3>
                <p class="ip-card__subtitle">快速上升的新方向</p>
              </div>
            </div>
            <div class="ip-theme-list">
              <span
                v-for="t in (overallTrends?.emergingThemes ?? []).slice(0, 10)"
                :key="t"
                class="ip-theme-tag"
              >
                {{ t }}
              </span>
            </div>
            <div v-if="overallTrends?.decliningThemes?.length" class="ip-declining">
              <p class="ip-declining__label">退热中</p>
              <div class="ip-declining__tags">
                <span
                  v-for="t in overallTrends.decliningThemes.slice(0, 5)"
                  :key="t"
                  class="ip-declining__tag"
                >
                  {{ t }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 市场洞察 -->
        <div v-if="overallTrends?.marketInsight" class="ip-card ip-insight">
          <div class="ip-card__head">
            <div class="ip-card__icon ip-card__icon--teal">
              <Icon name="compass" :size="16" />
            </div>
            <div>
              <h3 class="ip-card__title">市场洞察</h3>
              <p class="ip-card__subtitle">AI 总结的全网创作风向</p>
            </div>
          </div>
          <div class="ip-insight__body">
            <p class="ip-insight__text">{{ overallTrends.marketInsight }}</p>
            <div v-if="overallTrends.crossPlatformTrends?.length" class="ip-insight__tags">
              <span
                v-for="t in overallTrends.crossPlatformTrends"
                :key="t"
                class="ip-insight__tag"
              >
                <Icon name="trendingUp" :size="12" />
                {{ t }}
              </span>
            </div>
          </div>
        </div>

        <!-- 写作建议 -->
        <div v-if="recommendations.length" class="ip-card ip-recs">
          <div class="ip-card__head">
            <div class="ip-card__icon ip-card__icon--amber">
              <Icon name="lightbulb" :size="16" />
            </div>
            <div>
              <h3 class="ip-card__title">AI 写作建议</h3>
              <p class="ip-card__subtitle">基于全网热点生成的 AI 写作建议</p>
            </div>
            <span class="ip-recs-count">{{ recommendations.length }} 条</span>
          </div>
          <div class="ip-recs-list">
            <article
              v-for="rec in visibleRecs"
              :key="rec.title"
              class="ip-rec-card"
            >
              <div class="ip-rec-card__head">
                <h4 class="ip-rec-card__title">{{ rec.title }}</h4>
                <span
                  class="ip-rec-card__confidence"
                  :class="`ip-rec-card__confidence--${getConfidenceClass(rec.confidenceLevel)}`"
                >
                  {{ getConfidenceLabel(rec.confidenceLevel) }}
                </span>
              </div>
              <div class="ip-rec-card__meta">
                <span class="ip-rec-tag ip-rec-tag--genre">{{ rec.genre }}</span>
                <span class="ip-rec-tag ip-rec-tag--platform">{{ rec.targetPlatform }}</span>
                <span
                  v-for="t in rec.themes.slice(0, 2)"
                  :key="t"
                  class="ip-rec-tag ip-rec-tag--theme"
                >
                  {{ t }}
                </span>
              </div>
              <p class="ip-rec-card__reasoning">{{ rec.reasoning }}</p>
              <blockquote v-if="rec.storyHook" class="ip-rec-card__hook">
                <Icon name="quote" :size="14" class="ip-rec-card__hook-icon" />
                <p>{{ rec.storyHook }}</p>
              </blockquote>
              <div class="ip-rec-card__actions">
                <button class="ip-rec-btn" @click="goPanguWithGenre(rec.genre)">
                  <Icon name="pen" :size="12" />
                  用这个题材开书
                </button>
              </div>
            </article>
          </div>
          <div v-if="recommendations.length > MAX_VISIBLE_RECS" class="ip-card__more">
            <button class="ip-more-btn" @click="showAllRecs = !showAllRecs">
              {{ showAllRecs ? '收起' : `查看全部 ${recommendations.length} 条建议` }}
              <Icon name="chevronDown" :size="14" :class="{ 'is-up': showAllRecs }" />
            </button>
          </div>
        </div>

        <!-- 平台解析 -->
        <div v-if="platforms.length" class="ip-card ip-platforms">
          <div class="ip-card__head">
            <div class="ip-card__icon ip-card__icon--blue">
              <Icon name="globe" :size="16" />
            </div>
            <div>
              <h3 class="ip-card__title">平台解析</h3>
              <p class="ip-card__subtitle">各平台热门类型与趋势</p>
            </div>
          </div>
          <div class="ip-platforms-grid">
            <article
              v-for="pf in visiblePlatforms"
              :key="pf.platform"
              class="ip-platform-card"
            >
              <div class="ip-platform-card__head">
                <h4 class="ip-platform-card__name">{{ pf.platformName }}</h4>
                <span class="ip-platform-card__count">
                  {{ pf.topGenres.length }} 个热门类型
                </span>
              </div>
              <div class="ip-platform-card__genres">
                <div
                  v-for="(g, idx) in pf.topGenres.slice(0, 5)"
                  :key="g.genre"
                  class="ip-platform-genre"
                >
                  <span
                    class="ip-platform-genre__rank"
                    :class="{ 'ip-platform-genre__rank--top': idx < 3 }"
                  >
                    {{ g.rank }}
                  </span>
                  <span class="ip-platform-genre__name">{{ g.genre }}</span>
                  <span
                    class="ip-platform-genre__trend"
                    :class="`ip-platform-genre__trend--${g.trend}`"
                  >
                    {{ getTrendLabel(g.trend) }}
                  </span>
                </div>
              </div>
              <p v-if="pf.keyInsight" class="ip-platform-card__insight">
                {{ pf.keyInsight }}
              </p>
            </article>
          </div>
          <div v-if="platforms.length > MAX_VISIBLE_PLATFORMS" class="ip-card__more">
            <button class="ip-more-btn" @click="showAllPlatforms = !showAllPlatforms">
              {{ showAllPlatforms ? '收起' : `查看全部 ${platforms.length} 个平台` }}
              <Icon name="chevronDown" :size="14" :class="{ 'is-up': showAllPlatforms }" />
            </button>
          </div>
        </div>

        <!-- 历史报告 -->
        <div v-if="history.length" class="ip-card ip-history">
          <div class="ip-card__head">
            <div class="ip-card__icon ip-card__icon--gray">
              <Icon name="layers" :size="16" />
            </div>
            <div>
              <h3 class="ip-card__title">历史报告</h3>
              <p class="ip-card__subtitle">过往趋势分析记录</p>
            </div>
          </div>
          <div class="ip-history-list">
            <div
              v-for="entry in history.slice(0, 7)"
              :key="entry.date"
              class="ip-history-item"
            >
              <div class="ip-history-item__date">
                {{ formatHistoryDate(entry.date) }}
              </div>
              <div class="ip-history-item__genres">
                <span
                  v-for="g in (entry.hotGenres ?? []).slice(0, 4)"
                  :key="g"
                  class="ip-history-item__tag"
                >
                  {{ g }}
                </span>
              </div>
              <span class="ip-history-item__count">
                {{ entry.recommendationCount }} 条建议
              </span>
            </div>
          </div>
        </div>
      </template>
    </StateView>
  </div>
</template>

<style scoped>
.inspiration-page {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-5);
}

/* ============ Hero ============ */
.ip-hero {
  position: relative;
  border-radius: var(--nw-radius-xl);
  overflow: hidden;
  padding: var(--nw-space-6) var(--nw-space-8);
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
}

.ip-hero__bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ip-hero__glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;
}

.ip-hero__glow--1 {
  width: 360px;
  height: 360px;
  background: linear-gradient(135deg, var(--nw-warning), var(--nw-danger));
  top: -140px;
  right: 20%;
  animation: ipFloat 8s ease-in-out infinite;
}

.ip-hero__glow--2 {
  width: 300px;
  height: 300px;
  background: linear-gradient(135deg, var(--nw-accent-end), var(--star-brand-teal, #06b6d4));
  bottom: -120px;
  left: 15%;
  opacity: 0.1;
  filter: blur(60px);
  animation: ipFloat 11s ease-in-out infinite reverse;
}

@keyframes ipFloat {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-15px) scale(1.05); }
}

.ip-hero__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(245, 158, 11, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(245, 158, 11, 0.05) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
}

.ip-hero__content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-6);
}

.ip-hero__left {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
  min-width: 0;
  flex: 1;
}

.ip-hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--nw-warning) 12%, transparent), color-mix(in srgb, var(--nw-danger) 8%, transparent));
  color: var(--nw-warning);
  font-size: 12px;
  font-weight: 600;
  width: fit-content;
}

:global(html.dark) .ip-hero__badge {
  color: var(--nw-gold-light);
}

.ip-hero__title {
  font-size: 24px;
  font-weight: 800;
  margin: 0;
  line-height: 1.2;
}

.ip-hero__title-accent {
  background: linear-gradient(135deg, var(--nw-warning), var(--nw-danger));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.ip-hero__subtitle {
  font-size: 13px;
  color: var(--nw-text-muted);
  margin: 0;
  line-height: 1.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ip-hero__updated {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--nw-text-secondary);
}

.ip-hero__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nw-success);
  box-shadow: 0 0 8px color-mix(in srgb, var(--nw-success) 50%, transparent);
}

.ip-hero__dot--stale {
  background: var(--nw-warning);
  box-shadow: 0 0 8px color-mix(in srgb, var(--nw-warning) 50%, transparent);
}

.ip-refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--nw-radius-lg);
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-secondary);
  color: var(--nw-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.ip-refresh-btn:hover:not(:disabled) {
  border-color: var(--nw-warning);
  color: var(--nw-warning);
  background: color-mix(in srgb, var(--nw-warning) 6%, transparent);
}

.ip-refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.is-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ============ Empty ============ */
.ip-empty {
  text-align: center;
  padding: var(--nw-space-12) var(--nw-space-6);
  color: var(--nw-text-muted);
}

.ip-empty__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--nw-text-primary);
  margin: var(--nw-space-3) 0 var(--nw-space-2);
}

.ip-empty__desc {
  font-size: 13px;
  margin: 0;
}

/* ============ KPI ============ */
.ip-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--nw-space-4);
}

.ip-kpi {
  position: relative;
  padding: var(--nw-space-5);
  border-radius: var(--nw-radius-lg);
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
  display: flex;
  align-items: center;
  gap: var(--nw-space-4);
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.ip-kpi:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px -8px color-mix(in srgb, var(--nw-warning) 15%, transparent);
}

.ip-kpi__icon {
  width: 44px;
  height: 44px;
  border-radius: var(--nw-radius-lg);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #fff;
}

.ip-kpi--genre .ip-kpi__icon {
  background: linear-gradient(135deg, color-mix(in srgb, var(--nw-warning) 80%, #fff), var(--nw-danger));
  box-shadow: 0 4px 12px color-mix(in srgb, var(--nw-danger) 30%, transparent);
}

.ip-kpi--theme .ip-kpi__icon {
  background: linear-gradient(135deg, var(--nw-accent-end), var(--nw-accent-start));
  box-shadow: 0 4px 12px color-mix(in srgb, var(--nw-accent-start) 30%, transparent);
}

.ip-kpi--rec .ip-kpi__icon {
  background: linear-gradient(135deg, var(--nw-gold-light), var(--nw-warning));
  box-shadow: 0 4px 12px color-mix(in srgb, var(--nw-warning) 30%, transparent);
}

.ip-kpi--platform .ip-kpi__icon {
  background: linear-gradient(135deg, var(--star-brand-sky, #38bdf8), var(--nw-info));
  box-shadow: 0 4px 12px color-mix(in srgb, var(--nw-info) 30%, transparent);
}

.ip-kpi__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ip-kpi__value {
  font-size: 22px;
  font-weight: 800;
  color: var(--nw-text-primary);
  line-height: 1;
}

.ip-kpi__label {
  font-size: 12px;
  color: var(--nw-text-muted);
}

.ip-kpi__deco {
  position: absolute;
  top: -20px;
  right: -20px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  opacity: 0.08;
  background: currentColor;
}

/* ============ Card ============ */
.ip-card-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--nw-space-4);
}

.ip-card {
  background: var(--nw-bg-primary);
  border: 1px solid var(--nw-border);
  border-radius: var(--nw-radius-lg);
  padding: var(--nw-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-4);
}

.ip-card__head {
  display: flex;
  align-items: center;
  gap: var(--nw-space-3);
}

.ip-card__icon {
  width: 36px;
  height: 36px;
  border-radius: var(--nw-radius-md);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #fff;
}

.ip-card__icon--rose {
  background: linear-gradient(135deg, color-mix(in srgb, var(--nw-danger) 70%, #fff), var(--nw-danger));
}
.ip-card__icon--violet {
  background: linear-gradient(135deg, var(--nw-accent-end), var(--nw-accent-start));
}
.ip-card__icon--teal {
  background: linear-gradient(135deg, var(--star-brand-teal, #2dd4bf), color-mix(in srgb, var(--star-brand-teal, #0d9488) 80%, #000));
}
.ip-card__icon--amber {
  background: linear-gradient(135deg, var(--nw-gold-light), var(--nw-warning));
}
.ip-card__icon--blue {
  background: linear-gradient(135deg, var(--star-brand-sky, #60a5fa), var(--nw-info));
}
.ip-card__icon--gray {
  background: linear-gradient(135deg, var(--nw-text-muted), color-mix(in srgb, var(--nw-text-muted) 70%, #000));
}

.ip-card__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0;
  line-height: 1.3;
}

.ip-card__subtitle {
  font-size: 12px;
  color: var(--nw-text-muted);
  margin: 2px 0 0;
}

.ip-card__more {
  display: flex;
  justify-content: center;
  padding-top: var(--nw-space-2);
  border-top: 1px solid var(--nw-border);
}

.ip-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: var(--nw-radius-md);
  border: 1px solid var(--nw-border);
  background: transparent;
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.ip-more-btn:hover {
  border-color: var(--nw-text-secondary);
}

.ip-more-btn .is-up {
  transform: rotate(180deg);
}

/* ============ Genres ============ */
.ip-genre-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.ip-genre-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--nw-radius-md);
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-secondary);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  font-size: 13px;
  color: var(--nw-text-primary);
  font-weight: 500;
}

.ip-genre-tag:hover {
  border-color: var(--nw-warning);
  background: color-mix(in srgb, var(--nw-warning) 6%, transparent);
  transform: translateY(-1px);
}

.ip-genre-tag--top {
  background: linear-gradient(135deg, color-mix(in srgb, var(--nw-warning) 10%, transparent), color-mix(in srgb, var(--nw-danger) 6%, transparent));
  border-color: color-mix(in srgb, var(--nw-warning) 30%, transparent);
}

.ip-genre-tag--top:hover {
  border-color: var(--nw-warning);
}

.ip-genre-tag__rank {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  background: var(--nw-bg-tertiary);
  color: var(--nw-text-secondary);
  flex-shrink: 0;
}

.ip-genre-tag--top .ip-genre-tag__rank {
  background: linear-gradient(135deg, color-mix(in srgb, var(--nw-warning) 80%, #fff), var(--nw-danger));
  color: #fff;
}

.ip-genre-tag__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ip-genre-tag__arrow {
  color: var(--nw-text-muted);
  opacity: 0;
  transition: opacity 0.2s, transform 0.2s;
  flex-shrink: 0;
}

.ip-genre-tag:hover .ip-genre-tag__arrow {
  opacity: 1;
  transform: translateX(2px);
}

/* ============ Themes ============ */
.ip-theme-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ip-theme-tag {
  padding: 6px 12px;
  border-radius: 999px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--nw-accent-end) 10%, transparent), color-mix(in srgb, var(--nw-accent-start) 6%, transparent));
  border: 1px solid color-mix(in srgb, var(--nw-accent-start) 20%, transparent);
  color: var(--nw-accent-start);
  font-size: 12px;
  font-weight: 500;
}

:global(html.dark) .ip-theme-tag {
  color: var(--nw-accent-end);
}

.ip-declining {
  margin-top: var(--nw-space-3);
  padding-top: var(--nw-space-3);
  border-top: 1px dashed var(--nw-border);
}

.ip-declining__label {
  font-size: 11px;
  color: var(--nw-text-muted);
  margin: 0 0 6px;
  font-weight: 500;
}

.ip-declining__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ip-declining__tag {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-border);
  color: var(--nw-text-muted);
  font-size: 11px;
}

/* ============ Insight ============ */
.ip-insight__body {
  display: flex;
  flex-direction: column;
  gap: var(--nw-space-3);
}

.ip-insight__text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--nw-text-primary);
  margin: 0;
  padding: var(--nw-space-4);
  border-radius: var(--nw-radius-md);
  background: linear-gradient(135deg, color-mix(in srgb, var(--star-brand-teal, #2dd4bf) 6%, transparent), color-mix(in srgb, var(--star-brand-teal, #0d9488) 3%, transparent));
  border-left: 3px solid var(--star-brand-teal, #2dd4bf);
}

.ip-insight__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ip-insight__tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-border);
  color: var(--nw-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

/* ============ Recommendations ============ */
.ip-recs-count {
  margin-left: auto;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--nw-bg-secondary);
  color: var(--nw-text-muted);
  font-size: 11px;
  font-weight: 500;
}

.ip-recs-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--nw-space-3);
}

.ip-rec-card {
  padding: var(--nw-space-4);
  border-radius: var(--nw-radius-md);
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-secondary);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.2s;
}

.ip-rec-card:hover {
  border-color: color-mix(in srgb, var(--nw-gold-light) 40%, transparent);
  box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--nw-gold-light) 15%, transparent);
  transform: translateY(-1px);
}

.ip-rec-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--nw-space-2);
}

.ip-rec-card__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0;
  line-height: 1.4;
  flex: 1;
}

.ip-rec-card__confidence {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.ip-rec-card__confidence--high {
  background: color-mix(in srgb, var(--nw-success) 12%, transparent);
  color: var(--nw-success);
}

.ip-rec-card__confidence--medium {
  background: color-mix(in srgb, var(--nw-warning) 12%, transparent);
  color: var(--nw-warning);
}

.ip-rec-card__confidence--low {
  background: var(--nw-bg-tertiary);
  color: var(--nw-text-muted);
}

.ip-rec-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ip-rec-tag {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}

.ip-rec-tag--genre {
  background: color-mix(in srgb, var(--nw-warning) 12%, transparent);
  color: color-mix(in srgb, var(--nw-warning) 80%, var(--nw-text-primary));
}

:global(html.dark) .ip-rec-tag--genre {
  color: var(--nw-gold-light);
}

.ip-rec-tag--platform {
  background: color-mix(in srgb, var(--nw-info) 10%, transparent);
  color: var(--nw-info);
}

:global(html.dark) .ip-rec-tag--platform {
  color: var(--star-brand-sky, #60a5fa);
}

.ip-rec-tag--theme {
  background: color-mix(in srgb, var(--nw-accent-start) 10%, transparent);
  color: var(--nw-accent-start);
}

:global(html.dark) .ip-rec-tag--theme {
  color: var(--nw-accent-end);
}

.ip-rec-card__reasoning {
  font-size: 12px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ip-rec-card__hook {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--nw-radius-md);
  background: var(--nw-bg-primary);
  border-left: 3px solid var(--nw-gold-light);
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
  font-style: italic;
}

.ip-rec-card__hook p {
  margin: 0;
}

.ip-rec-card__hook-icon {
  flex-shrink: 0;
  color: var(--nw-gold-light);
  margin-top: 2px;
}

.ip-rec-card__actions {
  margin-top: auto;
  padding-top: 4px;
}

.ip-rec-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: var(--nw-radius-md);
  border: 1px solid color-mix(in srgb, var(--nw-gold-light) 40%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--nw-gold-light) 10%, transparent), color-mix(in srgb, var(--nw-warning) 5%, transparent));
  color: color-mix(in srgb, var(--nw-warning) 80%, var(--nw-text-primary));
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

:global(html.dark) .ip-rec-btn {
  color: var(--nw-gold-light);
}

.ip-rec-btn:hover {
  background: linear-gradient(135deg, color-mix(in srgb, var(--nw-gold-light) 18%, transparent), color-mix(in srgb, var(--nw-warning) 10%, transparent));
  transform: translateY(-1px);
}

/* ============ Platforms ============ */
.ip-platforms-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--nw-space-3);
}

.ip-platform-card {
  padding: var(--nw-space-4);
  border-radius: var(--nw-radius-md);
  border: 1px solid var(--nw-border);
  background: var(--nw-bg-secondary);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.2s;
}

.ip-platform-card:hover {
  border-color: color-mix(in srgb, var(--star-brand-sky, #60a5fa) 40%, transparent);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--nw-info) 15%, transparent);
}

.ip-platform-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--nw-space-2);
}

.ip-platform-card__name {
  font-size: 14px;
  font-weight: 700;
  color: var(--nw-text-primary);
  margin: 0;
}

.ip-platform-card__count {
  font-size: 11px;
  color: var(--nw-text-muted);
  flex-shrink: 0;
}

.ip-platform-card__genres {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ip-platform-genre {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.ip-platform-genre__rank {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 700;
  background: var(--nw-bg-tertiary);
  color: var(--nw-text-muted);
  flex-shrink: 0;
}

.ip-platform-genre__rank--top {
  background: linear-gradient(135deg, var(--star-brand-sky, #60a5fa), var(--nw-info));
  color: #fff;
}

.ip-platform-genre__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--nw-text-primary);
  font-weight: 500;
}

.ip-platform-genre__trend {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
  font-weight: 500;
}

.ip-platform-genre__trend--rising {
  background: color-mix(in srgb, var(--nw-success) 12%, transparent);
  color: var(--nw-success);
}

.ip-platform-genre__trend--stable {
  background: var(--nw-bg-tertiary);
  color: var(--nw-text-muted);
}

.ip-platform-genre__trend--declining {
  background: color-mix(in srgb, var(--nw-danger) 10%, transparent);
  color: var(--nw-danger);
}

.ip-platform-card__insight {
  font-size: 12px;
  line-height: 1.6;
  color: var(--nw-text-secondary);
  margin: 0;
  padding-top: 8px;
  border-top: 1px dashed var(--nw-border);
}

/* ============ History ============ */
.ip-history-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ip-history-item {
  display: flex;
  align-items: center;
  gap: var(--nw-space-4);
  padding: 10px 12px;
  border-radius: var(--nw-radius-md);
  transition: background 0.15s;
}

.ip-history-item:hover {
  background: var(--nw-bg-secondary);
}

.ip-history-item__date {
  width: 100px;
  font-size: 13px;
  font-weight: 500;
  color: var(--nw-text-primary);
  flex-shrink: 0;
}

.ip-history-item__genres {
  flex: 1;
  display: flex;
  gap: 6px;
  min-width: 0;
}

.ip-history-item__tag {
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--nw-bg-secondary);
  border: 1px solid var(--nw-border);
  color: var(--nw-text-secondary);
  font-size: 11px;
  font-weight: 500;
}

.ip-history-item__count {
  font-size: 12px;
  color: var(--nw-text-muted);
  flex-shrink: 0;
}

/* ============ Responsive ============ */
@media (max-width: 1024px) {
  .ip-kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .ip-card-row {
    grid-template-columns: 1fr;
  }
  .ip-recs-list {
    grid-template-columns: 1fr;
  }
  .ip-platforms-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .ip-hero {
    padding: var(--nw-space-5) var(--nw-space-5);
  }
  .ip-hero__title {
    font-size: 20px;
  }
  .ip-kpi-grid {
    grid-template-columns: 1fr 1fr;
  }
  .ip-genre-list {
    grid-template-columns: 1fr;
  }
}
</style>
