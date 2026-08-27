import type { AgentEvent } from '../../../agents/types.js';
import { buildChapterCost } from '../../../cost/build-chapter-cost.js';
import { getConfig } from '../../../config/index.js';
import type { NovelMetadata } from '../../../novel/types.js';
import { resolveChapterOneOpeningProfile } from '../../../pipeline/chapter-opening-profile.js';
import type { ChapterPipeline } from '../../../pipeline/chapter-pipeline.js';
import type { ShuangwenBlueprint } from '../../../pipeline/shuangwen-types.js';
import { saveGenerationResults } from '../../../services/generation-result-service.js';
import { schedulePostSaveBackgroundTasks } from '../../../services/generation-background-tasks.js';
import { triggerPlotMomentForChapter } from '../../../character-moments/moments-chapter-hook.js';
import { getAiUsageContext, runWithAiUsageContextAsync } from '../../../ai/usage-context.js';
import type { GenerateDeps } from './types.js';

type ChapterGenerationResult = Awaited<ReturnType<ChapterPipeline['generateChapter']>>;

function normalizeSeedText(value: string | undefined, maxLength = 180): string {
  return value?.trim().replace(/\s+/g, ' ').slice(0, maxLength) ?? '';
}

export function buildSeedOutlineSummary(params: {
  chapterNumber: number;
  novelTitle: string;
  novelSynopsis?: string;
  userDirection?: string;
}): string {
  const synopsis = normalizeSeedText(params.novelSynopsis);
  const userDirection = normalizeSeedText(params.userDirection);
  const summaryParts: string[] = [];

  if (params.chapterNumber === 1) {
    summaryParts.push(`《${params.novelTitle}》开篇需要先立主角、目标、冲突与钩子。`);
    if (synopsis) {
      summaryParts.push(`题材承诺：${synopsis}`);
    }
    if (userDirection) {
      summaryParts.push(`本章重点：${userDirection}`);
    }
    if (summaryParts.length === 1) {
      summaryParts.push('先把主场景、核心矛盾和第一口回报落到正文里。');
    }
    return summaryParts.join(' ');
  }

  if (userDirection) {
    summaryParts.push(userDirection);
  } else if (synopsis) {
    summaryParts.push(`承接《${params.novelTitle}》既有主线继续推进。`);
    summaryParts.push(`当前主线参考：${synopsis}`);
  } else {
    summaryParts.push(`承接前文推进《${params.novelTitle}》第 ${params.chapterNumber} 章主线。`);
  }

  return summaryParts.join(' ');
}

export async function ensureChapterOutlineSeed(params: {
  novelManager: Pick<GenerateDeps['novelManager'], 'getOutline' | 'saveOutline'>;
  novel: Pick<NovelMetadata, 'id' | 'title' | 'synopsis'>;
  chapterNumber: number;
  userDirection?: string;
}): Promise<boolean> {
  const outline = await params.novelManager.getOutline(params.novel.id);
  if (outline.chapters.some(item => item.chapterNumber === params.chapterNumber)) {
    return false;
  }

  outline.chapters.push({
    chapterNumber: params.chapterNumber,
    title: `第 ${params.chapterNumber} 章`,
    summary: buildSeedOutlineSummary({
      chapterNumber: params.chapterNumber,
      novelTitle: params.novel.title,
      novelSynopsis: params.novel.synopsis,
      userDirection: params.userDirection,
    }),
    beats: [],
    tensionTarget: params.chapterNumber === 1 ? 6 : 5,
    plotThreadsAdvanced: [],
    keyEvents: [],
    notes: '[自动补建] 章节生成前补建最小大纲壳，避免新书直写时缺少章节上下文。',
  });
  outline.chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
  await params.novelManager.saveOutline(params.novel.id, outline);
  return true;
}

export function resolveChapterGenerateInputs(params: {
  chapterNumber: number;
  blueprint?: ShuangwenBlueprint;
  rawUserDirection: string;
  rawStyleNotes?: string;
  rawMaxWordCount?: number;
}): {
  saveFirstMode: boolean;
  userDirection: string;
  maxWordCount?: number;
  styleNotes?: string;
} {
  const saveFirstMode = true;
  const openingProfile = resolveChapterOneOpeningProfile({
    chapterNumber: params.chapterNumber,
    blueprint: params.blueprint,
    userDirection: params.rawUserDirection,
    styleNotes: params.rawStyleNotes,
    maxWordCount: params.rawMaxWordCount,
  });
  return {
    saveFirstMode,
    userDirection: openingProfile.userDirection,
    maxWordCount: openingProfile.maxWordCount,
    styleNotes: openingProfile.styleNotes,
  };
}

export async function runChapterGenerationWithFallback(params: {
  deps: GenerateDeps;
  novelId: string;
  chapterNumber: number;
  userDirection: string;
  maxWordCount?: number;
  stylePreset?: string;
  styleNotes?: string;
  startupPlatformProfile?: string;
  modelOverride?: GenerateDeps['modelClient'];
  signal: AbortSignal;
  onHeartbeat?: (stage?: string) => void;
}): Promise<{
  result: ChapterGenerationResult;
  saveFirstMode: boolean;
  strictGateFallbackUsed: boolean;
  strictGateFallbackReason?: string;
}> {
  const {
    deps,
    novelId,
    chapterNumber,
    userDirection,
    maxWordCount,
    stylePreset,
    styleNotes,
    startupPlatformProfile,
    modelOverride,
    signal,
    onHeartbeat,
  } = params;
  const { chapterPipeline, novelManager, broadcast } = deps;
  const { saveFirstMode } = resolveChapterGenerateInputs({
    chapterNumber,
    rawUserDirection: userDirection,
    rawStyleNotes: styleNotes,
    rawMaxWordCount: maxWordCount,
  });

  const createDraftReadyHandler = async (draftResult: ChapterGenerationResult): Promise<void> => {
    console.info(`[chapter-generate] draft-ready novel=${novelId} chapter=${chapterNumber} contentChars=${draftResult.chapterContent.length}`);
    await saveGenerationResults(novelManager, novelId, chapterNumber, draftResult, { chapterStatus: 'edited' });
    console.info(`[chapter-generate] draft-saved novel=${novelId} chapter=${chapterNumber}`);
  };
  const createEventHandler = (event: AgentEvent): void => {
    broadcast(event);
  };
  const isolatedChapterPipeline = chapterPipeline.fork();

  let strictGateFallbackUsed = false;
  let strictGateFallbackReason: string | undefined;
  let result: ChapterGenerationResult;
  const skipStrictGateForInitialPass = false;

  try {
    result = await isolatedChapterPipeline.generateChapter({
      novelId,
      chapterNumber,
      userDirection,
      maxWordCount,
      stylePreset,
      styleNotes,
      startupPlatformProfile,
      modelOverride,
      skipStrictGate: skipStrictGateForInitialPass,
      signal,
      onHeartbeat: (stage: string) => onHeartbeat?.(stage),
      onDraftReady: createDraftReadyHandler,
      onEvent: createEventHandler,
    });
    if (skipStrictGateForInitialPass) {
      strictGateFallbackUsed = true;
      strictGateFallbackReason = 'manual-skip-strict-gate';
    }
    console.info(`[chapter-generate] generated novel=${novelId} chapter=${chapterNumber} gateProfile=${saveFirstMode ? 'save-first+strict-gates' : 'strict'} contentChars=${result.chapterContent.length}`);
  } catch (generationError) {
    if (saveFirstMode) {
      throw generationError;
    }
    strictGateFallbackUsed = true;
    strictGateFallbackReason = generationError instanceof Error ? generationError.message : String(generationError);
    console.warn(`[chapter-generate] strict gate failed, retry with skipStrictGate novel=${novelId} chapter=${chapterNumber}: ${strictGateFallbackReason}`);
    result = await isolatedChapterPipeline.generateChapter({
      novelId,
      chapterNumber,
      userDirection,
      maxWordCount,
      stylePreset,
      styleNotes,
      startupPlatformProfile,
      modelOverride,
      skipStrictGate: true,
      signal,
      onHeartbeat: (stage: string) => onHeartbeat?.(stage),
      onDraftReady: createDraftReadyHandler,
      onEvent: createEventHandler,
    });
    console.info(`[chapter-generate] generated after fallback novel=${novelId} chapter=${chapterNumber} contentChars=${result.chapterContent.length}`);
  }

  return {
    result,
    saveFirstMode,
    strictGateFallbackUsed,
    strictGateFallbackReason,
  };
}

export async function finalizeChapterGenerationSuccess(params: {
  deps: GenerateDeps;
  novelId: string;
  chapterNumber: number;
  result: ChapterGenerationResult;
  constitutionBootstrapped: boolean;
  outlineBootstrapped: boolean;
  strictGateFallbackUsed: boolean;
  strictGateFallbackReason?: string;
  saveFirstMode: boolean;
  modelAccessSource: string;
  billingBypassed: boolean;
  trialMode?: boolean;
  backgroundModelClient?: GenerateDeps['modelClient'];
  freezeId?: string;
  billingUserId?: string;
}): Promise<Record<string, unknown>> {
  const {
    deps,
    novelId,
    chapterNumber,
    result,
    constitutionBootstrapped,
    outlineBootstrapped,
    strictGateFallbackUsed,
    strictGateFallbackReason,
    saveFirstMode,
    modelAccessSource,
    billingBypassed,
    trialMode = false,
    backgroundModelClient,
    freezeId,
    billingUserId,
  } = params;
  const {
    novelManager,
    novelMemory,
    agents,
    modelClient,
    storyStateManager,
    billingService,
    referralService,
    broadcast,
    notificationService,
    momentsGenerator,
    writerStatsService,
  } = deps;

  console.info(`[chapter-generate] saving novel=${novelId} chapter=${chapterNumber}`);
  await saveGenerationResults(novelManager, novelId, chapterNumber, result);
  console.info(`[chapter-generate] saved novel=${novelId} chapter=${chapterNumber}`);

  if (writerStatsService && result.chapterContent) {
    const userId = billingUserId || (await novelManager.getNovel(novelId))?.ownerId;
    if (userId) {
      const wordCount = result.chapterContent.length;
      if (wordCount > 0) {
        writerStatsService.recordWords(userId, wordCount, 1);
      }
    }
  }
  // 通知小说所有者：新章节已生成（fire-and-forget，失败不阻塞主流程）
  try {
    const novelForNotify = await novelManager.getNovel(novelId);
    const chapterForNotify = await novelManager.getChapter(novelId, chapterNumber);
    const notifyOwnerId = billingUserId || novelForNotify?.ownerId;
    if (notifyOwnerId && novelForNotify) {
      notificationService?.notifyChapterReady(notifyOwnerId, {
        novelId,
        novelTitle: novelForNotify.title,
        chapterNumber,
        chapterTitle: chapterForNotify?.title,
      });
    }
  } catch (notifyErr) {
    console.warn(`[chapter-generate] notify 失败（已忽略）novel=${novelId} chapter=${chapterNumber}:`, notifyErr instanceof Error ? notifyErr.message : notifyErr);
  }
  const postSaveTask = schedulePostSaveBackgroundTasks(
    novelManager,
    novelMemory,
    novelId,
    chapterNumber,
    result,
    agents,
    backgroundModelClient ?? modelClient,
    storyStateManager,
  );

  // 自动定稿：根据全局配置决定是否在后台静默执行
  const { finalizePipeline } = deps;
  const autoFinalizeConfig = getConfig().autoFinalize;
  if (autoFinalizeConfig?.enabled && finalizePipeline && result.chapterContent) {
    const aiUsageContext = getAiUsageContext();
    void runWithAiUsageContextAsync(
      aiUsageContext ?? {
        scope: 'system',
        operationKey: 'chapter.autoFinalize',
        operationLabel: 'Auto finalize chapter',
        operationRegistered: true,
        novelId,
        chapterNumber,
      },
      async () => {
        try {
          await postSaveTask;
          console.info(`[chapter-generate] auto-finalize started novel=${novelId} chapter=${chapterNumber}`);
          await finalizePipeline.finalize({
            novelId,
            chapterNumber,
            modelOverride: backgroundModelClient,
          });
          console.info(`[chapter-generate] auto-finalize completed novel=${novelId} chapter=${chapterNumber}`);
          await novelManager.syncNovelMetadataDebounced(novelId);
        } catch (err) {
          console.warn(`[chapter-generate] auto-finalize failed novel=${novelId} chapter=${chapterNumber}:`, err instanceof Error ? err.message : err);
        }
      },
    );
  }

  // 章节生成完成后自动触发角色朋友圈剧情动态（异步，不阻塞；与定稿路径共用同一钩子）。
  // 复用实际生成本章所用的 backgroundModelClient，确保用户自有模型场景也能正常生成。
  if (momentsGenerator && agents && backgroundModelClient) {
    void triggerPlotMomentForChapter({
      novelManager,
      momentsGenerator,
      agents,
      modelClient: backgroundModelClient,
      novelId,
      chapterNumber,
    }).catch((err) => {
      console.warn(`[chapter-generate] 朋友圈动态生成失败 novel=${novelId} chapter=${chapterNumber}:`, err instanceof Error ? err.message : err);
    });
  }

  const costSummary = buildChapterCost(novelId, chapterNumber, result.agentOutputs, {
    operationType: 'generate',
    operationLabel: '章节生成',
  });
  let trialConsumedChars: number | undefined;
  try {
    await novelManager.appendChapterCost(novelId, costSummary);
  } catch (costErr) {
    console.warn(`[chapter-generate] 成本写入失败，不影响主流程 novel=${novelId} chapter=${chapterNumber}:`, costErr instanceof Error ? costErr.message : costErr);
  }

  if (trialMode && billingService && billingUserId && billingUserId !== 'dev') {
    try {
      const actualChars = result.chapterContent?.length ?? 0;
      if (actualChars > 0) {
        const chapterKey = `${novelId}:${chapterNumber}`;
        const trialResult = await billingService.consumeTrialQuota(billingUserId, actualChars, chapterKey);
        trialConsumedChars = trialResult.consumed ? actualChars : 0;
      }
    } catch (trialErr) {
      console.warn(`[chapter-generate] 试用额度消耗失败 novel=${novelId}:`, trialErr instanceof Error ? trialErr.message : trialErr);
    }
  } else if (freezeId && billingService && billingUserId && billingUserId !== 'dev') {
    try {
      const actualChars = result.chapterContent?.length ?? 0;
      const generationRuleCode = await billingService.getOperationRuleCode('generateChapter');
      const actualEstimate = await billingService.estimate({
        ruleCode: generationRuleCode,
        charCount: Math.max(actualChars, 1),
      });
      await billingService.settleFreeze(billingUserId, freezeId, actualEstimate.estimatedPoints);
    } catch (settleErr) {
      console.warn(`[chapter-generate] 计费结算失败 novel=${novelId} chapter=${chapterNumber}:`, settleErr instanceof Error ? settleErr.message : settleErr);
    }
  }

  if (referralService && billingUserId && billingUserId !== 'dev') {
    void referralService.onUserActivityCompleted(billingUserId);
  }

  broadcast({
    type: 'pipeline:complete',
    agentRole: 'writer',
    novelId,
    chapterNumber,
    data: JSON.stringify({ chapterNumber, cost: costSummary }),
    timestamp: new Date().toISOString(),
  });

  return buildChapterGenerationResponse({
    result,
    constitutionBootstrapped,
    outlineBootstrapped,
    strictGateFallbackUsed,
    strictGateFallbackReason,
    saveFirstMode,
    modelAccessSource,
    billingBypassed,
    trialConsumedChars,
  });
}

export async function rollbackChapterGenerationFreeze(params: {
  deps: GenerateDeps;
  freezeId?: string;
  billingUserId?: string;
  novelId: string;
}): Promise<void> {
  const { deps, freezeId, billingUserId, novelId } = params;
  if (!freezeId || !deps.billingService || !billingUserId || billingUserId === 'dev') {
    return;
  }
  try {
    await deps.billingService.settleFreeze(billingUserId, freezeId, 0);
  } catch (refundErr) {
    console.warn(`[chapter-generate] 冻结退回失败 novel=${novelId}:`, refundErr instanceof Error ? refundErr.message : refundErr);
  }
}

export function buildChapterGenerationResponse(params: {
  result: ChapterGenerationResult;
  constitutionBootstrapped: boolean;
  outlineBootstrapped: boolean;
  strictGateFallbackUsed: boolean;
  strictGateFallbackReason?: string;
  saveFirstMode: boolean;
  modelAccessSource: string;
  billingBypassed: boolean;
  trialConsumedChars?: number;
}): Record<string, unknown> {
  return {
    ...params.result,
    constitutionBootstrapped: params.constitutionBootstrapped,
    outlineBootstrapped: params.outlineBootstrapped,
    strictGateFallbackUsed: params.strictGateFallbackUsed,
    strictGateFallbackReason: params.strictGateFallbackReason,
    gateProfile: params.saveFirstMode ? 'save-first' : (params.strictGateFallbackUsed ? 'strict+fallback' : 'strict'),
    modelAccessSource: params.modelAccessSource,
    billingBypassed: params.billingBypassed,
    ...(params.trialConsumedChars !== undefined ? { trialConsumedChars: params.trialConsumedChars } : {}),
  };
}
