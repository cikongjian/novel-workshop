import { ref, watch, computed } from 'vue';
import type { Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '../api';
import type { GenerateChapterResponse, ReviseChapterResponse } from '../api';
import { useAgentsStore } from '../stores/agents';
import { useNovelStore } from '../stores/novel';
import {
  buildReviseFailureMessage,
  extractApiErrorMessage,
  isRecoverableLongRunningRequestError,
} from '../utils/api-error';
import {
  STARTUP_PLATFORM_PROFILE_OPTIONS,
  type StartupPlatformProfileOption,
} from '../config/startup-platform-profile';
import {
  STYLE_PRESET_OPTIONS,
  WORD_LIMIT_OPTIONS,
  resolveMaxWordCount,
  isStylePresetOption,
  isWordLimitOption,
  type StylePresetOption,
  type WordLimitOption,
} from '../config/chapter-generation-options';

function isStartupPlatformProfileOption(value: string): value is StartupPlatformProfileOption {
  return STARTUP_PLATFORM_PROFILE_OPTIONS.some(item => item.value === value);
}

export function useChapterGeneration(deps: {
  novelId: Ref<string>;
  currentChapter: Ref<{ chapterNumber: number; content?: string; status?: string } | null>;
  currentChapterNum: Ref<number | null>;
  editContent: Ref<string>;
  nextChapterNum: Ref<number>;
  refreshQualityTrend?: () => Promise<void>;
  selectChapter: (num: number) => Promise<void>;
  openReviseDialog?: () => void;
  onReviseSuccess?: (payload: { chapterNumber: number }) => Promise<void> | void;
}) {
  const {
    novelId,
    currentChapter,
    currentChapterNum,
    editContent,
    nextChapterNum,
    refreshQualityTrend,
    selectChapter,
    onReviseSuccess,
  } = deps;
  const agentsStore = useAgentsStore();
  const novelStore = useNovelStore();

  // Dialog visibility states
  const generateDialogVisible = ref(false);
  const reviseDialogVisible = ref(false);
  const resizeDialogVisible = ref(false);

  // Generation options
  const userDirection = ref('');
  const savedPreset = localStorage.getItem(`nw-style-preset-${novelId.value}`);
  const stylePreset = ref<StylePresetOption>(
    savedPreset && isStylePresetOption(savedPreset) ? savedPreset : 'auto',
  );
  const styleNotes = ref('');
  const startupPlatformProfile = ref<StartupPlatformProfileOption>('auto');
  const wordLimitOption = ref<WordLimitOption>(
    (localStorage.getItem('nw-word-limit-option') as WordLimitOption) || '3000'
  );
  const customWordLimit = ref(Number(localStorage.getItem('nw-custom-word-limit')) || 3000);

  // Revise options
  const reviseFeedback = ref('');
  const enableAiMarkerGuard = ref(false);
  const aiMarkerGuardThreshold = ref(5);
  const reviseMode = ref<'rewrite' | 'spot-fix'>('rewrite');

  // Resize options
  const resizeMode = ref<'compress' | 'expand'>('compress');
  const resizeTargetWordCount = ref(3000);
  const resizePreserveNotes = ref('');

  // Loading states
  const polishingDialogue = ref(false);
  const finalizing = ref(false);

  // Latest gate reports (for inspector panel)
  const latestWorldReportChapter = ref<number | null>(null);
  const latestWorldContract = ref<NonNullable<GenerateChapterResponse['worldContract']> | null>(null);
  const latestWorldFulfillment = ref<NonNullable<GenerateChapterResponse['worldFulfillment']> | null>(null);
  const latestWorldGateRewrite = ref<NonNullable<GenerateChapterResponse['worldGateRewrite']> | null>(null);
  const latestOutlineFulfillment = ref<NonNullable<GenerateChapterResponse['outlineFulfillment']> | null>(null);
  const latestOutlineGateRewrite = ref<NonNullable<GenerateChapterResponse['outlineGateRewrite']> | null>(null);
  const latestQualityReport = ref<NonNullable<GenerateChapterResponse['qualityReport']> | null>(null);
  const latestQualityGateRewrite = ref<NonNullable<GenerateChapterResponse['qualityGateRewrite']> | null>(null);
  const latestStartupOpeningStrategy = ref<NonNullable<GenerateChapterResponse['startupOpeningStrategy']> | null>(null);
  const latestStartupOpeningReport = ref<NonNullable<GenerateChapterResponse['startupOpeningReport']> | null>(null);
  const latestStartupOpeningGateRewrite = ref<NonNullable<GenerateChapterResponse['startupOpeningGateRewrite']> | null>(null);
  const latestChapterLengthGuard = ref<NonNullable<GenerateChapterResponse['chapterLengthGuard']> | null>(null);
  const latestContinuityReport = ref<NonNullable<GenerateChapterResponse['continuityReport']> | null>(null);
  const latestSuperLongDiagnostics = ref<NonNullable<GenerateChapterResponse['superLongDiagnostics']> | null>(null);

  // Persist user preferences to localStorage
  watch(stylePreset, (v) => localStorage.setItem(`nw-style-preset-${novelId.value}`, v));
  watch(wordLimitOption, (v) => localStorage.setItem('nw-word-limit-option', v));
  watch(customWordLimit, (v) => localStorage.setItem('nw-custom-word-limit', String(v)));

  // Current chapter reports (computed based on matching chapter number)
  const currentWorldFulfillment = computed(() => {
    if (!currentChapterNum.value || latestWorldReportChapter.value !== currentChapterNum.value) return null;
    return latestWorldFulfillment.value;
  });

  const currentOutlineFulfillment = computed(() => {
    if (!currentChapterNum.value || latestWorldReportChapter.value !== currentChapterNum.value) return null;
    return latestOutlineFulfillment.value;
  });

  const currentQualityReport = computed(() => {
    if (!currentChapterNum.value || latestWorldReportChapter.value !== currentChapterNum.value) return null;
    return latestQualityReport.value;
  });

  const currentStartupOpeningReport = computed(() => {
    if (!currentChapterNum.value || latestWorldReportChapter.value !== currentChapterNum.value) return null;
    return latestStartupOpeningReport.value;
  });

  const currentStartupOpeningStrategy = computed(() => {
    if (!currentChapterNum.value || latestWorldReportChapter.value !== currentChapterNum.value) return null;
    return latestStartupOpeningStrategy.value;
  });

  const currentChapterLengthGuard = computed(() => {
    if (!currentChapterNum.value || latestWorldReportChapter.value !== currentChapterNum.value) return null;
    return latestChapterLengthGuard.value;
  });

  const currentContinuityReport = computed(() => {
    if (!currentChapterNum.value || latestWorldReportChapter.value !== currentChapterNum.value) return null;
    return latestContinuityReport.value;
  });

  const currentSuperLongDiagnostics = computed(() => {
    if (!currentChapterNum.value || latestWorldReportChapter.value !== currentChapterNum.value) return null;
    return latestSuperLongDiagnostics.value;
  });

  // Open generate dialog（stylePreset 保持上次选择，不重置）
  function openGenerateDialog() {
    userDirection.value = '';
    styleNotes.value = '';
    startupPlatformProfile.value = novelStore.currentNovel?.startupPlatformProfile ?? 'auto';
    generateDialogVisible.value = true;
  }

  // Open revise dialog
  function openReviseDialog(presetFeedback = '') {
    if (!currentChapter.value) {
      ElMessage.warning('请先选择一个已有内容的章节');
      return;
    }
    reviseFeedback.value = presetFeedback;
    reviseDialogVisible.value = true;
  }

  // Open resize dialog
  function openResizeDialog(mode: 'compress' | 'expand' = 'compress') {
    if (!currentChapter.value || !editContent.value.trim()) {
      ElMessage.warning('请先选择一个已有内容的章节');
      return;
    }
    resizeMode.value = mode;
    const currentLen = editContent.value.length;
    resizeTargetWordCount.value = mode === 'compress'
      ? Math.round(currentLen * 0.6 / 500) * 500
      : Math.round(currentLen * 1.5 / 500) * 500;
    resizePreserveNotes.value = '';
    resizeDialogVisible.value = true;
  }

  // Handle chapter generation
  async function handleGenerate() {
    const newNum = nextChapterNum.value;
    generateDialogVisible.value = false;
    agentsStore.markNovelGenerationPending({
      novelId: novelId.value,
      chapterNumber: newNum,
      message: `第 ${newNum} 章已提交，正在准备生成流程…`,
    });
    ElMessage.info('章节生成已开始，工作台会实时显示当前进度...');

    try {
      const result = await api.generateChapter({
        novelId: novelId.value,
        chapterNumber: newNum,
        userDirection: userDirection.value.trim() || undefined,
        maxWordCount: resolveMaxWordCount(wordLimitOption.value, customWordLimit.value),
        startupPlatformProfile: startupPlatformProfile.value,
        stylePreset: stylePreset.value,
        styleNotes: styleNotes.value.trim() || undefined,
      });
      if (api.isGenerateChapterAccepted(result)) {
        ElMessage.success(`第 ${newNum} 章已进入后台生成，完成后会自动刷新。`);
        return;
      }

      latestWorldReportChapter.value = newNum;
      latestWorldContract.value = result.worldContract ?? null;
      latestWorldFulfillment.value = result.worldFulfillment ?? null;
      latestWorldGateRewrite.value = result.worldGateRewrite ?? null;
      latestOutlineFulfillment.value = result.outlineFulfillment ?? null;
      latestOutlineGateRewrite.value = result.outlineGateRewrite ?? null;
      latestQualityReport.value = result.qualityReport ?? null;
      latestQualityGateRewrite.value = result.qualityGateRewrite ?? null;
      latestStartupOpeningStrategy.value = result.startupOpeningStrategy ?? null;
      latestStartupOpeningReport.value = result.startupOpeningReport ?? null;
      latestStartupOpeningGateRewrite.value = result.startupOpeningGateRewrite ?? null;
      latestChapterLengthGuard.value = result.chapterLengthGuard ?? null;
      latestContinuityReport.value = result.continuityReport ?? null;
      latestSuperLongDiagnostics.value = result.superLongDiagnostics ?? null;

      if (result.worldFulfillment) {
        const summary = result.worldFulfillment.summary;
        if (!result.worldFulfillment.passed && result.worldFulfillment.gateMode === 'strict') {
          ElMessage.error(`世界观门禁未通过：${summary}`);
        } else if (result.worldFulfillment.findings.length > 0) {
          ElMessage.warning(`世界观门禁告警：${summary}`);
        }
      }

      if (result.outlineFulfillment) {
        const summary = result.outlineFulfillment.summary;
        if (!result.outlineFulfillment.passed && result.outlineFulfillment.gateMode === 'strict') {
          ElMessage.error(`大纲门禁未通过：${summary}`);
        } else if (result.outlineFulfillment.findings.length > 0) {
          ElMessage.warning(`大纲门禁告警：${summary}`);
        }
      }

      if (result.qualityReport) {
        const summary = result.qualityReport.summary;
        if (!result.qualityReport.passed && result.qualityReport.gateMode === 'strict') {
          ElMessage.error(`质量门禁未通过：${summary}`);
        } else if (result.qualityReport.findings.length > 0) {
          ElMessage.warning(`质量门禁告警：${summary}`);
        }
      }

      if (result.startupOpeningReport && result.startupOpeningReport.findings.length > 0) {
        ElMessage.warning(`开篇三章提示：${result.startupOpeningReport.summary}`);
      }

      if (result.chapterLengthGuard?.triggered) {
        const guardSummary = `字数纠偏：${result.chapterLengthGuard.actualWordCount} → ${result.chapterLengthGuard.finalWordCount} 字`;
        if (result.chapterLengthGuard.usedFallbackTrim) {
          ElMessage.warning(`${guardSummary}（已启用兜底截断）`);
        } else {
          ElMessage.success(guardSummary);
        }
      }

      if (result.continuityReport && result.continuityReport.findings.length > 0) {
        const summary = result.continuityReport.summary;
        if (!result.continuityReport.passed) {
          ElMessage.error(`连贯性检查未通过：${summary}`);
        } else {
          ElMessage.warning(`连贯性检查：${summary}`);
        }
      }

      if (result.powerRuleReport && result.powerRuleReport.findings.length > 0) {
        const summary = result.powerRuleReport.summary;
        if (!result.powerRuleReport.passed && result.powerRuleReport.gateMode === 'strict') {
          ElMessage.error(`力量规则门禁未通过：${summary}`);
        } else {
          ElMessage.warning(`力量规则门禁告警：${summary}`);
        }
      }

      ElMessage.success('章节生成完成');
      await novelStore.refreshChapters({ force: true });
      await selectChapter(newNum);
      await refreshQualityTrend?.();
    } catch (err: unknown) {
      if (isRecoverableLongRunningRequestError(err)) {
        const sameChapterStillTracked = agentsStore.isGeneratingNovel(novelId.value)
          && agentsStore.getGeneratingChapterNumberForNovel(novelId.value) === newNum;
        const sameChapterAlreadyCompleted = agentsStore.getLastCompletedChapterForNovel(novelId.value) === newNum;

        if (sameChapterStillTracked || sameChapterAlreadyCompleted) {
          ElMessage.warning(`第 ${newNum} 章的页面请求已超时，但后台仍在继续处理，请等待实时进度或完成通知。`);
          return;
        }

        agentsStore.resetActiveGenerationState({ novelId: novelId.value, chapterNumber: newNum });
        ElMessage.warning(`第 ${newNum} 章请求被网关中断，任务可能仍在后台继续，请稍后刷新章节列表确认结果。`);
        return;
      }

      agentsStore.resetActiveGenerationState({ novelId: novelId.value, chapterNumber: newNum });
      ElMessage.error(extractApiErrorMessage(err, '章节生成失败'));
    }
  }

  // Handle chapter revision
  async function handleRevise() {
    if (!currentChapterNum.value) return;
    if (!reviseFeedback.value.trim()) {
      ElMessage.warning('请输入修订反馈');
      return;
    }
    reviseDialogVisible.value = false;
    ElMessage.info('正在修订章节...');

    try {
      const result: ReviseChapterResponse = await api.reviseChapter({
        novelId: novelId.value,
        chapterNumber: currentChapterNum.value,
        feedback: reviseFeedback.value.trim(),
        enableAiMarkerGuard: enableAiMarkerGuard.value,
        aiMarkerGuardThreshold: aiMarkerGuardThreshold.value,
        mode: reviseMode.value,
      });
      const delta = result.qualityDelta;
      const aiGuard = result.aiMarkerGuard;

      // 显示 AI 标记守卫结果
      if (aiGuard) {
        if (aiGuard.rejected) {
          ElMessage.warning(`修订被拒绝：${aiGuard.reason}`);
        } else if (aiGuard.delta < 0) {
          ElMessage.info(`AI 标记分数下降 ${Math.abs(aiGuard.delta).toFixed(1)} 分（未超过阈值 ${aiMarkerGuardThreshold.value}），修订已应用`);
        } else if (aiGuard.delta > 0) {
          ElMessage.success(`AI 标记分数提升 ${aiGuard.delta.toFixed(1)} 分`);
        }
      }

      if (delta) {
        const signedDelta = `${delta.deltaOverall >= 0 ? '+' : ''}${delta.deltaOverall}`;
        const boostHint = delta.autoBoostApplied
          ? '，已自动补强'
          : delta.autoBoostAttempted
            ? '，已尝试补强'
            : '';
        ElMessage.success(`章节修订完成：总分 ${delta.before.overallScore}→${delta.after.overallScore}（${signedDelta}）${boostHint}`);
      } else {
        ElMessage.success('章节修订完成');
      }
      await novelStore.refreshChapters({ force: true });
      await selectChapter(currentChapterNum.value);
      await refreshQualityTrend?.();
      await onReviseSuccess?.({ chapterNumber: currentChapterNum.value });
    } catch (err: unknown) {
      ElMessage.error(buildReviseFailureMessage(err));
    }
  }

  // Handle chapter resize (compress/expand)
  async function handleResize() {
    if (!currentChapterNum.value) return;
    resizeDialogVisible.value = false;
    const modeLabel = resizeMode.value === 'compress' ? '缩写' : '扩写';
    ElMessage.info(`正在${modeLabel}章节...`);
    try {
      const result = await api.resizeChapter({
        novelId: novelId.value,
        chapterNumber: currentChapterNum.value,
        targetWordCount: resizeTargetWordCount.value,
        mode: resizeMode.value,
        preserveNotes: resizePreserveNotes.value.trim() || undefined,
      });
      ElMessage.success(`${modeLabel}完成：${result.originalWordCount} → ${result.newWordCount} 字`);
      await novelStore.refreshChapters({ force: true });
      await selectChapter(currentChapterNum.value);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `${modeLabel}失败`;
      ElMessage.error(message);
    }
  }

  // Handle dialogue polish
  async function handlePolishDialogue() {
    if (!currentChapter.value) return;
    polishingDialogue.value = true;
    try {
      const data = await api.polishDialogue(novelId.value, {
        chapterNumber: currentChapter.value.chapterNumber,
        text: editContent.value,
      });
      if (data.content) {
        editContent.value = data.content;
        ElMessage.success('对话打磨完成');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '对话打磨失败';
      ElMessage.error(msg);
    } finally {
      polishingDialogue.value = false;
    }
  }

  // Handle chapter finalization
  async function handleFinalize(hasUnsavedChanges: Ref<boolean>, saveChapter: (options?: { silent?: boolean }) => Promise<boolean>) {
    if (!currentChapter.value || !currentChapterNum.value) return;

    const isRefinalize = currentChapter.value.status === 'finalized';
    let forceFullPipeline = false;

    if (isRefinalize) {
      // 二次定稿：提示智能判断，提供强制完整定稿选项
      try {
        const action = await ElMessageBox.confirm(
          '系统将智能分析修改内容：若改动不涉及角色/世界观/剧情元素，将快速定稿；若涉及则自动启动完整管线。',
          '二次定稿',
          {
            type: 'info',
            confirmButtonText: '智能定稿',
            cancelButtonText: '取消',
            distinguishCancelAndClose: true,
          },
        );
      } catch {
        return;
      }
    } else {
      // 首次定稿
      try {
        await ElMessageBox.confirm(
          '定稿后将启动 AI 专家管线，智能分析并合并角色档案、世界观设定和剧情线索。确定要定稿吗？',
          '确认定稿',
          { type: 'info', confirmButtonText: '确认定稿', cancelButtonText: '取消' },
        );
      } catch {
        return;
      }
    }

    if (hasUnsavedChanges.value) {
      const saved = await saveChapter({ silent: true });
      if (!saved) {
        ElMessage.error('当前内容保存失败，请先保存后再定稿');
        return;
      }
    }

    finalizing.value = true;

    try {
      await api.finalizeChapter(novelId.value, currentChapterNum.value, { force: forceFullPipeline });
      if (isRefinalize) {
        ElMessage.info('正在智能分析修改内容...');
      } else {
        ElMessage.info('定稿管线已启动，请关注 Agent 活动面板...');
      }
    } catch {
      ElMessage.error('定稿失败');
    } finally {
      finalizing.value = false;
    }
  }

  // Handle forced full finalization (e.g. from context menu)
  async function handleForceFinalize(hasUnsavedChanges: Ref<boolean>, saveChapter: (options?: { silent?: boolean }) => Promise<boolean>) {
    if (!currentChapter.value || !currentChapterNum.value) return;

    try {
      await ElMessageBox.confirm(
        '强制完整定稿将重新运行全部 3 个专家 Agent，忽略智能跳过判断。确定要执行吗？',
        '强制完整定稿',
        { type: 'warning', confirmButtonText: '确认', cancelButtonText: '取消' },
      );
    } catch {
      return;
    }

    if (hasUnsavedChanges.value) {
      const saved = await saveChapter({ silent: true });
      if (!saved) {
        ElMessage.error('当前内容保存失败，请先保存后再定稿');
        return;
      }
    }

    finalizing.value = true;

    try {
      await api.finalizeChapter(novelId.value, currentChapterNum.value, { force: true });
      ElMessage.info('完整定稿管线已启动，请关注 Agent 活动面板...');
    } catch {
      ElMessage.error('定稿失败');
    } finally {
      finalizing.value = false;
    }
  }

  // Option update handlers
  function handleGenerateStylePresetUpdate(value: string) {
    stylePreset.value = isStylePresetOption(value) ? value : 'auto';
  }

  function handleGenerateWordLimitOptionUpdate(value: string) {
    wordLimitOption.value = isWordLimitOption(value) ? value : '3000';
  }

  function handleStartupPlatformProfileUpdate(value: string) {
    startupPlatformProfile.value = isStartupPlatformProfileOption(value) ? value : 'auto';
  }

  return {
    // Constants
    STYLE_PRESET_OPTIONS,
    WORD_LIMIT_OPTIONS,
    STARTUP_PLATFORM_PROFILE_OPTIONS,

    // Dialog visibility
    generateDialogVisible,
    reviseDialogVisible,
    resizeDialogVisible,

    // Generation options
    userDirection,
    stylePreset,
    styleNotes,
    startupPlatformProfile,
    wordLimitOption,
    customWordLimit,

    // Revise options
    reviseFeedback,
    enableAiMarkerGuard,
    aiMarkerGuardThreshold,
    reviseMode,

    // Resize options
    resizeMode,
    resizeTargetWordCount,
    resizePreserveNotes,

    // Loading states
    polishingDialogue,
    finalizing,

    // Latest reports
    latestWorldReportChapter,
    latestWorldContract,
    latestWorldFulfillment,
    latestWorldGateRewrite,
    latestOutlineFulfillment,
    latestOutlineGateRewrite,
    latestQualityReport,
    latestQualityGateRewrite,
    latestStartupOpeningStrategy,
    latestStartupOpeningReport,
    latestStartupOpeningGateRewrite,
    latestChapterLengthGuard,
    latestContinuityReport,
    latestSuperLongDiagnostics,

    // Current reports (computed)
    currentWorldFulfillment,
    currentOutlineFulfillment,
    currentQualityReport,
    currentStartupOpeningStrategy,
    currentStartupOpeningReport,
    currentChapterLengthGuard,
    currentContinuityReport,
    currentSuperLongDiagnostics,

    // Methods
    openGenerateDialog,
    openReviseDialog,
    openResizeDialog,
    handleGenerate,
    handleRevise,
    handleResize,
    handlePolishDialogue,
    handleFinalize,
    handleForceFinalize,
    handleGenerateStylePresetUpdate,
    handleGenerateWordLimitOptionUpdate,
    handleStartupPlatformProfileUpdate,
    resolveMaxWordCount,
  };
}
