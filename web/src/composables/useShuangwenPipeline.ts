import { ref, watch } from 'vue';
import type { Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '../api';
import { DEFAULT_CHAPTER_WORD_TARGET } from '../config/chapter-generation-options';
import { useNovelStore } from '../stores/novel';
import { useAgentsStore } from '../stores/agents';
import {
  extractApiErrorMessage,
  isRecoverableLongRunningRequestError,
} from '../utils/api-error';

type ShuangwenGateMode = 'off' | 'warn' | 'strict';
const LEGACY_SHUANGWEN_WORD_TARGET = 2200;

function loadShuangwenWordTarget(): number {
  const stored = Number(localStorage.getItem('nw-shuangwen-max-word-count'));
  if (!Number.isFinite(stored) || stored <= 0 || stored === LEGACY_SHUANGWEN_WORD_TARGET) {
    return DEFAULT_CHAPTER_WORD_TARGET;
  }
  return stored;
}

export function useShuangwenPipeline(deps: {
  novelId: Ref<string>;
  nextChapterNum: Ref<number>;
  currentChapter: Ref<{ content?: string } | null>;
  currentChapterNum: Ref<number | null>;
  editContent: Ref<string>;
  refreshQualityTrend: () => Promise<void>;
  selectChapter: (num: number) => Promise<void>;
}) {
  const {
    novelId,
    nextChapterNum,
    currentChapter,
    currentChapterNum,
    editContent,
    refreshQualityTrend,
    selectChapter,
  } = deps;
  const novelStore = useNovelStore();
  const agentsStore = useAgentsStore();

  // Dialog visibility states
  const shuangwenGenDialogVisible = ref(false);
  const shuangwenApplyDialogVisible = ref(false);
  const shuangwenGenResultVisible = ref(false);
  const shuangwenApplyResultVisible = ref(false);

  // Loading states
  const shuangwenApplying = ref(false);
  const expandingShuangwenDirection = ref(false);

  // Shuangwen generation options
  const shuangwenGenDirection = ref('');
  const shuangwenHookGateMode = ref<ShuangwenGateMode>('warn');
  const shuangwenCycleGateMode = ref<ShuangwenGateMode>('warn');
  const shuangwenForbiddenGateMode = ref<ShuangwenGateMode>('warn');
  const shuangwenMaxWordCount = ref(loadShuangwenWordTarget());

  // Result storage
  const shuangwenGenResult = ref<api.ShuangwenChapterResponse | null>(null);
  const shuangwenApplyResult = ref<api.ShuangwenApplyResponse | null>(null);

  // Persist max word count to localStorage
  watch(shuangwenMaxWordCount, (v) => localStorage.setItem('nw-shuangwen-max-word-count', String(v)));

  // Check if shuangwen blueprint exists
  const hasShuangwenBlueprint = ref(false);

  // Watch for changes to novel store
  watch(
    () => novelStore.currentNovel?.shuangwenBlueprint,
    (blueprint) => {
      hasShuangwenBlueprint.value = !!blueprint;
    },
    { immediate: true }
  );

  // Open shuangwen generation dialog
  function openShuangwenGenDialog() {
    shuangwenGenDirection.value = '';
    shuangwenHookGateMode.value = 'warn';
    shuangwenCycleGateMode.value = 'warn';
    shuangwenForbiddenGateMode.value = 'warn';
    shuangwenMaxWordCount.value = loadShuangwenWordTarget();
    shuangwenGenDialogVisible.value = true;
  }

  // Expand shuangwen direction using AI
  async function handleExpandShuangwenDirection() {
    const text = shuangwenGenDirection.value.trim();
    if (!text) {
      ElMessage.info('请先输入一些想法或关键词');
      return;
    }
    expandingShuangwenDirection.value = true;
    try {
      const result = await api.expandIdea({
        novelId: novelId.value,
        text,
        field: 'direction',
        chapterNumber: nextChapterNum.value,
      });
      if (result.expanded) {
        shuangwenGenDirection.value = result.expanded;
      }
    } catch {
      ElMessage.error('扩写失败，请重试');
    } finally {
      expandingShuangwenDirection.value = false;
    }
  }

  // Generate shuangwen chapter
  async function handleShuangwenGenerate() {
    const newNum = nextChapterNum.value;
    shuangwenGenDialogVisible.value = false;
    agentsStore.markNovelGenerationPending({
      novelId: novelId.value,
      chapterNumber: newNum,
      message: `第 ${newNum} 章已提交，正在准备爽文生成流程…`,
    });
    ElMessage.info('爽文管线已提交，完成后会自动刷新。');

    try {
      const result = await api.generateShuangwenChapter({
        novelId: novelId.value,
        chapterNumber: newNum,
        userDirection: shuangwenGenDirection.value.trim() || undefined,
        maxWordCount: shuangwenMaxWordCount.value,
        hookGateMode: shuangwenHookGateMode.value,
        cycleGateMode: shuangwenCycleGateMode.value,
        forbiddenGateMode: shuangwenForbiddenGateMode.value,
      });
      if (api.isShuangwenChapterAccepted(result)) {
        ElMessage.success(result.message || `第 ${newNum} 章已进入后台生成队列`);
        return;
      }

      if (result.shuangwenGateReport) {
        const { hookGate, cycleGate, forbiddenGate } = result.shuangwenGateReport;
        if (!hookGate.passed) ElMessage.warning(`钩子门禁：${hookGate.summary}`);
        if (!cycleGate.passed) ElMessage.warning(`循环门禁：${cycleGate.summary}`);
        if (!forbiddenGate.passed) ElMessage.warning(`禁区门禁：${forbiddenGate.summary}`);
      }

      ElMessage.success('爽文章节生成完成');
      await novelStore.refreshChapters({ force: true });
      await selectChapter(newNum);
      await refreshQualityTrend();

      // Display gate report
      shuangwenGenResult.value = result;
      shuangwenGenResultVisible.value = true;
    } catch (err) {
      if (isRecoverableLongRunningRequestError(err)) {
        ElMessage.warning(`第 ${newNum} 章请求已超时，后台可能仍在继续生成。完成后会自动刷新。`);
        return;
      }
      agentsStore.resetActiveGenerationState({
        novelId: novelId.value,
        chapterNumber: newNum,
      });
      ElMessage.error(extractApiErrorMessage(err, '爽文章节生成失败'));
    }
  }

  // Apply shuangwen pipeline to novel
  async function handleApplyShuangwen() {
    const novel = novelStore.currentNovel;
    if (!novel) return;

    shuangwenApplying.value = true;
    shuangwenApplyDialogVisible.value = false;
    ElMessage.info('正在接入爽文管线，请稍候...');

    try {
      const result = await api.applyShuangwen({
        novelId: novel.id,
        genre: novel.genre === 'custom' ? 'modern' : novel.genre,
        seedIdea: novel.synopsis || novel.description || novel.title || '未命名小说',
        titleHint: novel.title,
        synopsisHint: novel.synopsis,
        overwriteMeta: false,
        createChapterShells: true,
      });
      // Refresh novel metadata only; chapter shells are refreshed explicitly below.
      await novelStore.loadNovel(novelId.value, { domains: [] });
      await novelStore.refreshChapters({ force: true });
      // Show result
      shuangwenApplyResult.value = result;
      shuangwenApplyResultVisible.value = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '爽文管线接入失败';
      ElMessage.error(msg);
    } finally {
      shuangwenApplying.value = false;
    }
  }

  // Check if shuangwen pipeline is running here
  const isShuangwenPipelineHere = ref(false);

  const shuangwenPipelineStatusText = ref('');

  // Watch for agent activity to detect shuangwen pipeline
  watch(
    () => agentsStore.getNovelActiveAgentList(novelId.value),
    (activeAgents) => {
      isShuangwenPipelineHere.value = activeAgents.includes('writing-assistant')
        || activeAgents.includes('outline-generator')
        || activeAgents.includes('marketing-writer');

      if (isShuangwenPipelineHere.value) {
        const active = activeAgents.filter(r => r !== 'writing-assistant');
        const role = (active[0] ?? 'writing-assistant') as string;
        // Import AGENT_NAMES from types if needed, or use a simple mapping
        const agentNames: Record<string, string> = {
          'outline-generator': '大纲生成器',
          'marketing-writer': '营销文案',
          'writing-assistant': '写作助手',
        };
        shuangwenPipelineStatusText.value = `${agentNames[role] || role} 生成中…`;
      } else {
        shuangwenPipelineStatusText.value = '';
      }
    },
    { immediate: true },
  );

  return {
    // Dialog visibility
    shuangwenGenDialogVisible,
    shuangwenApplyDialogVisible,
    shuangwenGenResultVisible,
    shuangwenApplyResultVisible,

    // Loading states
    shuangwenApplying,
    expandingShuangwenDirection,

    // Options
    shuangwenGenDirection,
    shuangwenHookGateMode,
    shuangwenCycleGateMode,
    shuangwenForbiddenGateMode,
    shuangwenMaxWordCount,

    // Results
    shuangwenGenResult,
    shuangwenApplyResult,

    // Computed
    hasShuangwenBlueprint,
    isShuangwenPipelineHere,
    shuangwenPipelineStatusText,

    // Methods
    openShuangwenGenDialog,
    handleExpandShuangwenDirection,
    handleShuangwenGenerate,
    handleApplyShuangwen,
  };
}
