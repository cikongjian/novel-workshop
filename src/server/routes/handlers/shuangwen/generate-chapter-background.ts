import type { z } from 'zod';
import type { NovelMetadata } from '../../../../novel/types.js';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelAgent } from '../../../../agents/types.js';
import type { AiUsageContext } from '../../../../ai/usage-context.js';
import { runWithAiUsageContextAsync } from '../../../../ai/usage-context.js';
import { ShuangwenPipeline } from '../../../../pipeline/shuangwen-pipeline.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  createUiHelpers,
} from './shared-helpers.js';
import {
  now,
} from './utils.js';
import type { GenerateChapterBody, ShuangwenDeps } from './types.js';
import {
  persistShuangwenGeneratedChapter,
} from './generate-chapter-persistence.js';

type GenerateChapterInput = z.infer<typeof GenerateChapterBody>;

type StartShuangwenGenerateChapterTaskParams = {
  deps: ShuangwenDeps;
  agents: Map<string, NovelAgent>;
  novel: NovelMetadata;
  body: GenerateChapterInput;
  modelClient: ModelClient;
  modelAccessSource: string;
  billingBypassed: boolean;
  usageContext?: AiUsageContext;
};

export type ShuangwenGenerateChapterAcceptedResponse = {
  status: 'accepted';
  mode: 'generate-chapter';
  novelId: string;
  chapterNumber: number;
  message: string;
};

const activeShuangwenGenerateChapterKeys = new Set<string>();

export function buildShuangwenGenerateChapterAcceptedResponse(params: {
  novelId: string;
  chapterNumber: number;
}): ShuangwenGenerateChapterAcceptedResponse {
  return {
    status: 'accepted',
    mode: 'generate-chapter',
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    message: `第 ${params.chapterNumber} 章已进入后台生成队列`,
  };
}

export function isShuangwenGenerateChapterTaskActive(novelId: string, chapterNumber: number): boolean {
  return activeShuangwenGenerateChapterKeys.has(buildTaskKey(novelId, chapterNumber));
}

export function startShuangwenGenerateChapterTask(params: StartShuangwenGenerateChapterTaskParams): boolean {
  const key = buildTaskKey(params.body.novelId, params.body.chapterNumber);
  if (activeShuangwenGenerateChapterKeys.has(key)) {
    return false;
  }

  activeShuangwenGenerateChapterKeys.add(key);
  setImmediate(() => {
    const context: Partial<AiUsageContext> = {
      ...(params.usageContext ?? {}),
      scope: params.usageContext?.scope ?? 'http',
      operationKey: params.usageContext?.operationKey ?? 'shuangwen.generate-chapter',
      operationLabel: params.usageContext?.operationLabel ?? 'Shuangwen generate chapter',
      operationRegistered: params.usageContext?.operationRegistered ?? true,
      novelId: params.body.novelId,
      chapterNumber: params.body.chapterNumber,
    };
    void runWithAiUsageContextAsync(context, async () => {
      await runShuangwenGenerateChapterTask(params);
    }).catch((err) => {
      console.error('[shuangwen-generate-chapter] background task crashed', err);
    }).finally(() => {
      activeShuangwenGenerateChapterKeys.delete(key);
    });
  });

  return true;
}

function buildTaskKey(novelId: string, chapterNumber: number): string {
  return `${novelId}:${chapterNumber}`;
}

async function runShuangwenGenerateChapterTask(params: StartShuangwenGenerateChapterTaskParams): Promise<void> {
  const { deps, agents, novel, body, modelClient, modelAccessSource, billingBypassed } = params;
  const { emit } = createUiHelpers(deps.broadcast);

  try {
    broadcastAccepted({ deps, novelId: body.novelId, chapterNumber: body.chapterNumber });

    const pipeline = new ShuangwenPipeline({
      modelClient,
      agents,
      novelManager: deps.novelManager,
      memory: deps.memory,
      onEvent: emit,
    });

    const result = await pipeline.generateChapter({
      novelId: body.novelId,
      chapterNumber: body.chapterNumber,
      userDirection: body.userDirection,
      maxWordCount: body.maxWordCount,
      hookGateMode: body.hookGateMode,
      cycleGateMode: body.cycleGateMode,
      forbiddenGateMode: body.forbiddenGateMode,
      scoreThreshold: body.scoreThreshold,
      maxRevisionRounds: body.maxRevisionRounds,
      temperatureOverride: body.temperatureOverride,
    });

    const { costSummary } = await persistShuangwenGeneratedChapter({
      deps,
      novel,
      body,
      modelClient,
      result,
    });

    emit({
      type: 'pipeline:complete',
      agentRole: 'writing-assistant',
      novelId: body.novelId,
      chapterNumber: body.chapterNumber,
      data: JSON.stringify({
        chapterNumber: body.chapterNumber,
        cost: costSummary,
        billingBypassed,
        modelAccessSource,
      }),
      timestamp: now(),
    });
  } catch (err) {
    broadcastFailure({
      deps,
      novelId: body.novelId,
      chapterNumber: body.chapterNumber,
      err,
    });
  }
}

function broadcastAccepted(params: {
  deps: ShuangwenDeps;
  novelId: string;
  chapterNumber: number;
}): void {
  const { deps, novelId, chapterNumber } = params;
  const timestamp = now();
  deps.broadcast?.({
    type: 'agent:start',
    agentRole: 'writing-assistant',
    novelId,
    chapterNumber,
    data: '',
    timestamp,
  });
  deps.broadcast?.({
    type: 'agent:chunk',
    agentRole: 'writing-assistant',
    novelId,
    chapterNumber,
    data: `第 ${chapterNumber} 章已提交，正在准备爽文生成流程。`,
    timestamp,
  });
}

function broadcastFailure(params: {
  deps: ShuangwenDeps;
  novelId: string;
  chapterNumber: number;
  err: unknown;
}): void {
  const { deps, novelId, chapterNumber, err } = params;
  const message = safeErrorMessage(err, '爽文章节生成失败');
  console.error(`[shuangwen-generate-chapter] failed novel=${novelId} chapter=${chapterNumber}`, err);
  const timestamp = now();
  deps.broadcast?.({
    type: 'agent:error',
    agentRole: 'writing-assistant',
    novelId,
    chapterNumber,
    data: message,
    timestamp,
  });
  deps.broadcast?.({
    type: 'pipeline:complete',
    agentRole: 'writing-assistant',
    novelId,
    chapterNumber,
    data: JSON.stringify({ error: message, code: 'SHUANGWEN_CHAPTER_GENERATION_FAILED' }),
    timestamp,
  });
}
