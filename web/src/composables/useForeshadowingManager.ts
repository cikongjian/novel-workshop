import { ref, watch } from 'vue';
import type { Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '../api';
import type { ForeshadowingStatusItem } from '../api';
import { useNovelStore } from '../stores/novel';
import { extractApiErrorMessage } from '../utils/api-error';

export function useForeshadowingManager(deps: {
  novelId: Ref<string>;
  currentChapterNum: Ref<number | null>;
}) {
  const { novelId, currentChapterNum } = deps;
  const novelStore = useNovelStore();

  const foreshadowingOverdue = ref<ForeshadowingStatusItem[]>([]);
  const foreshadowingDrawerVisible = ref(false);
  const foreshadowingResolvingMap = ref<Record<string, boolean>>({});
  const curatingForeshadowing = ref(false);
  const applyingCuratedForeshadowing = ref(false);
  const foreshadowingCuratePreviewVisible = ref(false);
  const foreshadowingCuratePreview = ref<api.CurateForeshadowingResponse | null>(null);

  watch(foreshadowingOverdue, (items) => {
    if (items.length === 0) {
      foreshadowingDrawerVisible.value = false;
    }
  });

  async function refreshForeshadowingStatus() {
    if (!novelId.value) return;
    try {
      const analysis = await api.fetchForeshadowingStatus(novelId.value);
      foreshadowingOverdue.value = analysis.overdue;
    } catch {
      // 不影响主流程
    }
  }

  async function handleResolveForeshadowingOverdue(foreshadowingId: string) {
    if (!novelId.value) return;
    if (foreshadowingResolvingMap.value[foreshadowingId]) return;

    try {
      await ElMessageBox.confirm(
        '如果正文已兑现该伏笔，可将其标记为"已回收"，它将不再出现在逾期列表中。是否继续？',
        '标记伏笔回收',
        { type: 'info', confirmButtonText: '标记回收', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }

    foreshadowingResolvingMap.value = { ...foreshadowingResolvingMap.value, [foreshadowingId]: true };
    try {
      await api.updateForeshadowing(novelId.value, foreshadowingId, {
        isResolved: true,
        resolvedInChapter: currentChapterNum.value ?? undefined,
      });
      await Promise.all([
        novelStore.refreshOutline(),
        refreshForeshadowingStatus(),
      ]);
      ElMessage.success('已标记为回收');
    } catch (err: unknown) {
      ElMessage.error(extractApiErrorMessage(err, '标记回收失败'));
    } finally {
      const { [foreshadowingId]: _, ...rest } = foreshadowingResolvingMap.value;
      foreshadowingResolvingMap.value = rest;
    }
  }

  async function handleBatchResolveForeshadowing() {
    if (!novelId.value) return;
    const count = foreshadowingOverdue.value.length;
    if (count === 0) return;

    try {
      await ElMessageBox.confirm(
        `将一次性回收全部 ${count} 条逾期伏笔，它们将不再出现在逾期列表中。是否继续？`,
        '一键回收逾期伏笔',
        { type: 'warning', confirmButtonText: '全部回收', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }

    try {
      const ids = foreshadowingOverdue.value.map(s => s.item.id);
      const result = await api.batchResolveForeshadowing(novelId.value, ids);
      await Promise.all([
        novelStore.refreshOutline(),
        refreshForeshadowingStatus(),
      ]);
      ElMessage.success(`已回收 ${result.resolvedCount} 条逾期伏笔`);
    } catch (err: unknown) {
      ElMessage.error(extractApiErrorMessage(err, '批量回收失败'));
    }
  }

  async function handleCurateForeshadowing() {
    if (curatingForeshadowing.value) return;
    try {
      await ElMessageBox.confirm(
        '将调用伏笔梳理师生成"预览结果"，确认后才会落库。是否继续？',
        '智能梳理伏笔',
        {
          type: 'info',
          confirmButtonText: '生成预览',
          cancelButtonText: '取消',
        },
      );
    } catch {
      return;
    }

    curatingForeshadowing.value = true;
    try {
      const result = await api.curateForeshadowing({
        novelId: novelId.value,
        apply: false,
        maxItems: 60,
      });
      foreshadowingCuratePreview.value = result;
      foreshadowingCuratePreviewVisible.value = true;
      ElMessage.success('梳理预览已生成，请确认后应用');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '智能梳理失败';
      ElMessage.error(message);
    } finally {
      curatingForeshadowing.value = false;
    }
  }

  async function handleApplyCuratedForeshadowing() {
    if (applyingCuratedForeshadowing.value) return;
    if (!foreshadowingCuratePreview.value) return;

    applyingCuratedForeshadowing.value = true;
    try {
      const result = await api.applyCuratedForeshadowing({
        novelId: novelId.value,
        foreshadowing: foreshadowingCuratePreview.value.foreshadowing,
        maxItems: 60,
        summary: foreshadowingCuratePreview.value.summary,
      });
      foreshadowingCuratePreview.value = result;
      foreshadowingCuratePreviewVisible.value = false;
      await Promise.all([
        novelStore.refreshOutline(),
        refreshForeshadowingStatus(),
      ]);
      ElMessage.success(
        `梳理已应用：伏笔 ${result.beforeCount}→${result.afterCount}，逾期 ${result.overdueBefore}→${result.overdueAfter}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '应用梳理结果失败';
      ElMessage.error(message);
    } finally {
      applyingCuratedForeshadowing.value = false;
    }
  }

  return {
    foreshadowingOverdue,
    foreshadowingDrawerVisible,
    foreshadowingResolvingMap,
    curatingForeshadowing,
    applyingCuratedForeshadowing,
    foreshadowingCuratePreviewVisible,
    foreshadowingCuratePreview,
    refreshForeshadowingStatus,
    handleResolveForeshadowingOverdue,
    handleBatchResolveForeshadowing,
    handleCurateForeshadowing,
    handleApplyCuratedForeshadowing,
  };
}
