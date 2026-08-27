import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import * as api from '../api';
import type {
  TrendsSnapshot,
  TrendsHistoryEntry,
  TrendsConfig,
  TrendsStatistics,
} from '../api/trends';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}

export function useTrendsMaster() {
  const loading = ref(false);
  const refreshing = ref(false);
  const snapshot = ref<TrendsSnapshot | null>(null);
  const history = ref<TrendsHistoryEntry[]>([]);
  const config = ref<TrendsConfig | null>(null);
  const configVisible = ref(false);
  const selectedHistoryDate = ref<string | null>(null);
  const historySnapshot = ref<TrendsSnapshot | null>(null);
  const statistics = ref<TrendsStatistics | null>(null);
  const statisticsLoading = ref(false);

  // ==================== 计算属性 ====================

  const analysis = computed(() => snapshot.value?.analysis ?? null);
  const platforms = computed(() => analysis.value?.platforms ?? []);
  const recommendations = computed(() => analysis.value?.recommendations ?? []);
  const overallTrends = computed(() => analysis.value?.overallTrends ?? null);
  const lastUpdated = computed(() => analysis.value?.analyzedAt ?? null);
  const parseFailed = computed(() => analysis.value?.parseFailed ?? false);
  const hasData = computed(() => analysis.value !== null);

  // ==================== 数据加载 ====================

  async function loadLatest() {
    loading.value = true;
    try {
      snapshot.value = await api.fetchTrendsLatest();
    } catch (err: any) {
      // 404 表示 trends 服务未启用，静默处理；其他错误才提示
      if (err?.response?.status !== 404) {
        ElMessage.error(getErrorMessage(err, '加载趋势数据失败'));
      }
    } finally {
      loading.value = false;
    }
  }

  async function refresh() {
    refreshing.value = true;
    try {
      snapshot.value = await api.refreshTrends();
      ElMessage.success('趋势分析完成');
      await loadHistory();
    } catch (err: any) {
      const msg = err?.response?.status === 403
        ? '仅管理员可刷新趋势数据'
        : getErrorMessage(err, '趋势分析失败');
      ElMessage.error(msg);
    } finally {
      refreshing.value = false;
    }
  }

  async function loadHistory() {
    try {
      history.value = await api.fetchTrendsHistory();
    } catch {
      // 静默处理，历史数据非关键
    }
  }

  async function loadHistorySnapshot(date: string) {
    selectedHistoryDate.value = date;
    try {
      historySnapshot.value = await api.fetchTrendsHistorySnapshot(date);
    } catch (err) {
      ElMessage.error(getErrorMessage(err, '加载历史快照失败'));
    }
  }

  function clearHistorySelection() {
    selectedHistoryDate.value = null;
    historySnapshot.value = null;
  }

  // ==================== 统计 ====================

  async function loadStatistics() {
    if (statisticsLoading.value) return;
    statisticsLoading.value = true;
    try {
      statistics.value = await api.fetchTrendsStatistics();
    } catch (err) {
      ElMessage.error(getErrorMessage(err, '加载统计数据失败'));
    } finally {
      statisticsLoading.value = false;
    }
  }

  // ==================== 配置管理 ====================

  async function loadConfig() {
    try {
      config.value = await api.fetchTrendsConfig();
    } catch (err) {
      ElMessage.error(getErrorMessage(err, '加载配置失败'));
    }
  }

  async function updateConfig(newConfig: TrendsConfig) {
    try {
      config.value = await api.saveTrendsConfig(newConfig);
      configVisible.value = false;
      ElMessage.success('配置已保存');
    } catch (err) {
      ElMessage.error(getErrorMessage(err, '保存配置失败'));
    }
  }

  // ==================== 生命周期 ====================

  onMounted(() => {
    void loadLatest();
    void loadHistory();
  });

  return {
    // 状态
    loading,
    refreshing,
    snapshot,
    analysis,
    platforms,
    recommendations,
    overallTrends,
    lastUpdated,
    parseFailed,
    hasData,
    // 历史
    history,
    selectedHistoryDate,
    historySnapshot,
    // 统计
    statistics,
    statisticsLoading,
    // 配置
    config,
    configVisible,
    // 方法
    loadLatest,
    refresh,
    loadHistory,
    loadHistorySnapshot,
    clearHistorySelection,
    loadStatistics,
    loadConfig,
    updateConfig,
  };
}
