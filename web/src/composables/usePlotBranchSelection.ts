import type { ComputedRef, Ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  addPlotBranchNodes,
  applyPlotBranchToOutline,
  getPlotBranchTree,
} from '../api/plot-branches';
import { normalizePlotBranchDraft, resolvePlotBranchParentId } from '../utils/plot-branches';

type UsePlotBranchSelectionOptions = {
  novelId: ComputedRef<string>;
  currentChapterNum: Ref<number | undefined>;
  refreshOutline: () => Promise<unknown>;
};

export function usePlotBranchSelection(options: UsePlotBranchSelectionOptions) {
  async function handlePlotExplorerSelect(branch: Record<string, unknown>) {
    const chapterNumber = options.currentChapterNum.value;
    if (!chapterNumber || !options.novelId.value) {
      ElMessage.warning('请先选择章节');
      return;
    }

    const normalized = normalizePlotBranchDraft(branch);
    if (!normalized) {
      ElMessage.error('剧情探索结果缺少有效标题或描述');
      return;
    }

    try {
      const tree = await getPlotBranchTree(options.novelId.value);
      const parentId = resolvePlotBranchParentId(tree, chapterNumber);
      const addResult = await addPlotBranchNodes(options.novelId.value, {
        parentId,
        chapterNumber,
        branches: [normalized],
      });

      const createdNodeId = addResult.addedNodeIds[0];
      if (!createdNodeId) {
        throw new Error('未能创建分支节点');
      }

      await applyPlotBranchToOutline(options.novelId.value, createdNodeId);
      await options.refreshOutline();
      ElMessage.success(`已将「${normalized.title}」写入分支树并应用到第 ${chapterNumber} 章大纲`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '应用分支方向失败';
      ElMessage.error(message);
    }
  }

  return {
    handlePlotExplorerSelect,
  };
}
