/**
 * 分叉（抱走）composable — 封装预检、执行、查询、配置
 */
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  checkFork,
  createFork,
  fetchForksByNovel,
  fetchMyForks,
  fetchForkConfig,
  updateForkConfig,
  setForkVisibility,
  type ForkRecord,
  type ForkConfig,
  type ForkCheckResult,
} from '../api/forks';

export function useFork() {
  const records = ref<ForkRecord[]>([]);
  const myRecords = ref<ForkRecord[]>([]);
  const config = ref<ForkConfig | null>(null);
  const checkResult = ref<ForkCheckResult | null>(null);
  const loading = ref(false);
  const forking = ref(false);
  const error = ref('');

  async function check(novelId: string, chapter: number) {
    loading.value = true;
    error.value = '';
    try {
      checkResult.value = await checkFork(novelId, chapter);
    } catch (e: any) {
      error.value = e?.response?.data?.error ?? '预检失败';
      checkResult.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function fork(params: {
    novelId: string;
    fromChapter: number;
    newTitle?: string;
    isPublic?: boolean;
  }): Promise<ForkRecord | null> {
    forking.value = true;
    error.value = '';
    try {
      const result = await createFork(params);
      ElMessage.success('抱走成功！快去你的新作品继续创作吧');
      return result.record;
    } catch (e: any) {
      error.value = e?.response?.data?.error ?? '抱走失败';
      ElMessage.error(error.value);
      return null;
    } finally {
      forking.value = false;
    }
  }

  async function loadRecords(novelId: string) {
    loading.value = true;
    try {
      const { records: list } = await fetchForksByNovel(novelId);
      records.value = list;
    } catch {
      records.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function loadMyRecords() {
    loading.value = true;
    try {
      const { records: list } = await fetchMyForks();
      myRecords.value = list;
    } catch {
      myRecords.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function loadConfig(novelId: string) {
    try {
      config.value = await fetchForkConfig(novelId);
    } catch {
      config.value = null;
    }
  }

  async function saveConfig(novelId: string, patch: Partial<ForkConfig>) {
    try {
      config.value = await updateForkConfig(novelId, patch);
      ElMessage.success('设置已保存');
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.error ?? '保存失败');
    }
  }

  async function toggleVisibility(recordId: string, isPublic: boolean) {
    try {
      await setForkVisibility(recordId, isPublic);
      ElMessage.success(isPublic ? '已设为公开' : '已设为私密');
    } catch (e: any) {
      ElMessage.error(e?.response?.data?.error ?? '更新失败');
    }
  }

  return {
    records,
    myRecords,
    config,
    checkResult,
    loading,
    forking,
    error,
    check,
    fork,
    loadRecords,
    loadMyRecords,
    loadConfig,
    saveConfig,
    toggleVisibility,
  };
}
