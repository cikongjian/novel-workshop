import type { ShuangwenBlueprint } from '../../../pipeline/shuangwen-types.js';
import type { NovelMetadata } from '../../../novel/types.js';
import {
  CHAPTER_ROUTE_IDLE_TIMEOUT_MS,
  CHAPTER_ROUTE_MAX_TOTAL_TIMEOUT_MS,
  classifyGenerationFailure,
} from './chapter-route-support.js';
import {
  ensureChapterOutlineSeed,
  finalizeChapterGenerationSuccess,
  resolveChapterGenerateInputs,
  rollbackChapterGenerationFreeze,
  runChapterGenerationWithFallback,
} from './chapter-generate-support.js';
import { generateAndPersistConstitution } from './shared/constitution-service.js';
import { markChapterGenerationFailed } from '../../../services/generation-result-service.js';
import { runWithIdleTimeout } from '../../../pipeline/heartbeat-timeout.js';
import type { GenerateDeps } from './types.js';

type StartChapterGenerationTaskParams = {
  deps: GenerateDeps;
  novel: NovelMetadata;
  novelId: string;
  chapterNumber: number;
  rawUserDirection: string;
  rawMaxWordCount?: number;
  stylePreset?: string;
  rawStyleNotes?: string;
  startupPlatformProfile?: string;
  modelOverride?: GenerateDeps['modelClient'];
  backgroundModelClient: GenerateDeps['modelClient'];
  modelAccessSource: string;
  billingBypassed: boolean;
  trialMode: boolean;
  freezeId?: string;
  billingUserId?: string;
};

export type ChapterGenerationAcceptedResponse = {
  status: 'accepted';
  novelId: string;
  chapterNumber: number;
  message: string;
};

export function buildChapterGenerationAcceptedResponse(params: {
  novelId: string;
  chapterNumber: number;
}): ChapterGenerationAcceptedResponse {
  return {
    status: 'accepted',
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    message: `第 ${params.chapterNumber} 章已进入后台生成队列`,
  };
}

const activeChapterGenerationKeys = new Set<string>();

export function isChapterGenerationTaskActive(novelId: string, chapterNumber: number): boolean {
  return activeChapterGenerationKeys.has(buildChapterGenerationKey(novelId, chapterNumber));
}

export function getActiveChapterGenerationTaskChapters(novelId: string): number[] {
  const prefix = `${novelId}:`;
  return [...activeChapterGenerationKeys]
    .filter(key => key.startsWith(prefix))
    .map(key => Number(key.slice(prefix.length)))
    .filter(chapterNumber => Number.isInteger(chapterNumber) && chapterNumber > 0)
    .sort((a, b) => a - b);
}

export function startChapterGenerationTask(params: StartChapterGenerationTaskParams): boolean {
  const key = buildChapterGenerationKey(params.novelId, params.chapterNumber);
  if (activeChapterGenerationKeys.has(key)) {
    return false;
  }
  activeChapterGenerationKeys.add(key);
  void runChapterGenerationTask(params).catch((err) => {
    console.error('[chapter-generate] background task crashed', err);
  }).finally(() => {
    activeChapterGenerationKeys.delete(key);
  });
  return true;
}

function buildChapterGenerationKey(novelId: string, chapterNumber: number): string {
  return `${novelId}:${chapterNumber}`;
}

async function runChapterGenerationTask(params: StartChapterGenerationTaskParams): Promise<void> {
  const {
    deps,
    novel: initialNovel,
    novelId,
    chapterNumber,
    rawUserDirection,
    rawMaxWordCount,
    stylePreset,
    rawStyleNotes,
    startupPlatformProfile,
    modelOverride,
    backgroundModelClient,
    modelAccessSource,
    billingBypassed,
    trialMode,
    freezeId,
    billingUserId,
  } = params;
  try {
    const rootAbortController = new AbortController();
    await runWithIdleTimeout(
      async (signal, heartbeat) => {
        console.info(`[chapter-generate] background task started novel=${novelId} chapter=${chapterNumber} modelAccessSource=${modelAccessSource}`);
        broadcastChapterGenerationAccepted({ deps, novelId, chapterNumber });
        heartbeat('accepted');

        let novel = initialNovel;
        let constitutionBootstrapped = false;
        let outlineBootstrapped = false;
        if (!novel.constitution) {
          console.info(`[chapter-generate] bootstrapping constitution for novel=${novelId}`);
          const constitution = await generateAndPersistConstitution({
            novel,
            novelManager: deps.novelManager,
            modelClient: backgroundModelClient,
            source: 'auto-bootstrap',
            signal,
          });
          constitutionBootstrapped = true;
          console.info(`[chapter-generate] constitution bootstrapped novel=${novelId}`);
          novel = {
            ...novel,
            constitution,
          };
          heartbeat('constitution');
        }
        outlineBootstrapped = await ensureChapterOutlineSeed({
          novelManager: deps.novelManager,
          novel,
          chapterNumber,
          userDirection: rawUserDirection,
        });
        heartbeat('outline-seed');

        const openingProfile = resolveChapterGenerateInputs({
          chapterNumber,
          blueprint: novel.shuangwenBlueprint as ShuangwenBlueprint | undefined,
          rawUserDirection,
          rawStyleNotes,
          rawMaxWordCount,
        });
        const saveFirstMode = openingProfile.saveFirstMode;
        console.info(`[chapter-generate] starting pipeline novel=${novelId} chapter=${chapterNumber} saveFirstMode=${saveFirstMode}`);
        const {
          result,
          strictGateFallbackUsed,
          strictGateFallbackReason,
        } = await runChapterGenerationWithFallback({
          deps,
          novelId,
          chapterNumber,
          userDirection: openingProfile.userDirection,
          maxWordCount: openingProfile.maxWordCount,
          stylePreset,
          styleNotes: openingProfile.styleNotes,
          startupPlatformProfile,
          modelOverride,
          signal,
          onHeartbeat: heartbeat,
        });
        heartbeat('pipeline-complete');
        console.info(`[chapter-generate] pipeline done novel=${novelId} chapter=${chapterNumber} contentChars=${result.chapterContent.length}`);
        await finalizeChapterGenerationSuccess({
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
          trialMode,
          backgroundModelClient,
          freezeId,
          billingUserId,
        });
        heartbeat('saved');
      },
      rootAbortController.signal,
      {
        idleTimeoutMs: CHAPTER_ROUTE_IDLE_TIMEOUT_MS,
        maxTotalTimeoutMs: CHAPTER_ROUTE_MAX_TOTAL_TIMEOUT_MS,
        timeoutLabel: `第 ${chapterNumber} 章后台生成`,
      },
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    console.error(`[chapter-generate] task failed novel=${novelId} chapter=${chapterNumber}: ${errMsg}`, errStack ? `\n${errStack}` : '');
    const failure = classifyGenerationFailure(err);
    try {
      await markChapterGenerationFailed({
        novelManager: deps.novelManager,
        novelId,
        chapterNumber,
        errorCode: failure.code,
        errorMessage: failure.message,
        retryable: failure.retryable,
      });
    } catch (markErr) {
      console.warn(`[chapter-generate] failed to mark generation lifecycle novel=${novelId} chapter=${chapterNumber}:`, markErr instanceof Error ? markErr.message : markErr);
    }
    await rollbackChapterGenerationFreeze({
      deps,
      freezeId,
      billingUserId,
      novelId,
    });
    broadcastChapterGenerationFailure({
      deps,
      novelId,
      chapterNumber,
      err,
    });
  }
}

function broadcastChapterGenerationAccepted(params: {
  deps: GenerateDeps;
  novelId: string;
  chapterNumber: number;
}): void {
  const { deps, novelId, chapterNumber } = params;
  deps.broadcast({
    type: 'agent:start',
    agentRole: 'writing-assistant',
    novelId,
    chapterNumber,
    data: '',
    timestamp: new Date().toISOString(),
  });
  deps.broadcast({
    type: 'agent:chunk',
    agentRole: 'writing-assistant',
    novelId,
    chapterNumber,
    data: `第 ${chapterNumber} 章已提交，正在准备生成流程。`,
    timestamp: new Date().toISOString(),
  });
}

function broadcastChapterGenerationFailure(params: {
  deps: GenerateDeps;
  novelId: string;
  chapterNumber: number;
  err: unknown;
}): void {
  const { deps, novelId, chapterNumber, err } = params;
  const failure = classifyGenerationFailure(err);
  console.error(`[chapter-generate] failed novel=${novelId} chapter=${chapterNumber}`, err);
  const timestamp = new Date().toISOString();
  // 逐个广播，确保即使 agent:error 失败，pipeline:complete 也能发出（防止 WS 缓冲卡死）
  try {
    deps.broadcast({
      type: 'agent:error',
      agentRole: 'writing-assistant',
      novelId,
      chapterNumber,
      data: failure.message,
      timestamp,
    });
  } catch (broadcastErr) {
    console.warn(`[chapter-generate] broadcast agent:error 失败 novel=${novelId} chapter=${chapterNumber}:`, broadcastErr);
  }
  try {
    deps.broadcast({
      type: 'pipeline:complete',
      agentRole: 'writing-assistant',
      novelId,
      chapterNumber,
      data: JSON.stringify({ error: failure.message, code: failure.code }),
      timestamp,
    });
  } catch (broadcastErr) {
    console.warn(`[chapter-generate] broadcast pipeline:complete 失败 novel=${novelId} chapter=${chapterNumber}:`, broadcastErr);
  }
}
