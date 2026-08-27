import type { AgentContext, AgentOutput, AgentRole, NovelAgent } from '../../../agents/types.js';
import type { ModelClient } from '../../../models/types.js';
import type { AgentComment, Chapter } from '../../../novel/types.js';
import { buildChapterCost } from '../../../cost/build-chapter-cost.js';
import { parseEditorOutput } from '../../../pipeline/editor-output-parser.js';
import { buildScenePlanFromOutlineData } from '../../../utils/outline-extractors.js';
import {
  buildResizeFeedback,
  buildRevisionCharacterContext,
  buildRevisionWorldContext,
} from '../../../utils/revision-utils.js';
import type { GenerateDeps } from './types.js';

type ResizeMode = 'compress' | 'expand';

type ResizeWorkflowResult = {
  finalContent: string;
  agentOutputs: AgentOutput[];
};

export function validateResizeTarget(params: {
  mode: ResizeMode;
  currentWordCount: number;
  targetWordCount: number;
}): string | undefined {
  if (params.mode === 'compress' && params.targetWordCount >= params.currentWordCount) {
    return `目标字数（${params.targetWordCount}）应小于当前字数（${params.currentWordCount}）`;
  }
  if (params.mode === 'expand' && params.targetWordCount <= params.currentWordCount) {
    return `目标字数（${params.targetWordCount}）应大于当前字数（${params.currentWordCount}）`;
  }
  return undefined;
}

export function buildResizeOperationContext(params: {
  novel: {
    id: string;
    genre: string;
    title: string;
    synopsis: string;
  };
  chapter: {
    content: string;
  };
  chapterNumber: number;
  targetWordCount: number;
  mode: ResizeMode;
  preserveNotes?: string;
  outlineData: Awaited<ReturnType<GenerateDeps['novelManager']['getOutline']>>;
  characters: Awaited<ReturnType<GenerateDeps['novelManager']['getCharacters']>>;
  worldEntries: Awaited<ReturnType<GenerateDeps['novelManager']['getWorldEntries']>>;
}): {
  currentWordCount: number;
  modeLabel: string;
  resizeFeedback: string;
  originalContext: AgentContext;
} {
  const currentWordCount = params.chapter.content.length;
  const chapterOutline = params.outlineData.chapters.find((item) => item.chapterNumber === params.chapterNumber);
  const scenePlan = buildScenePlanFromOutlineData(chapterOutline);
  const modeLabel = params.mode === 'compress' ? '缩写' : '扩写';

  return {
    currentWordCount,
    modeLabel,
    resizeFeedback: buildResizeFeedback({
      mode: params.mode,
      currentWordCount,
      targetWordCount: params.targetWordCount,
      preserveNotes: params.preserveNotes,
    }),
    originalContext: {
      novelId: params.novel.id,
      genre: params.novel.genre,
      novelTitle: params.novel.title,
      novelSynopsis: params.novel.synopsis,
      chapterNumber: params.chapterNumber,
      maxWordCount: params.targetWordCount,
      resizeMode: params.mode,
      originalWordCount: currentWordCount,
      outlineContext: chapterOutline?.summary || undefined,
      scenePlan,
      characterContext: buildRevisionCharacterContext(params.characters),
      worldContext: buildRevisionWorldContext(params.worldEntries),
    },
  };
}

async function executeResizeAgent(params: {
  agent: NovelAgent;
  client: ModelClient;
  agentRole: Extract<AgentRole, 'resizer' | 'editor'>;
  novelId: string;
  chapterNumber: number;
  context: AgentContext;
  broadcast: GenerateDeps['broadcast'];
}): Promise<AgentOutput> {
  params.broadcast({
    type: 'agent:start',
    agentRole: params.agentRole,
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    data: '',
    timestamp: new Date().toISOString(),
  });
  const output = await params.agent.execute(params.context, params.client, (chunk: string) => {
    params.broadcast({
      type: 'agent:chunk',
      agentRole: params.agentRole,
      novelId: params.novelId,
      chapterNumber: params.chapterNumber,
      data: chunk,
      timestamp: new Date().toISOString(),
    });
  });
  params.broadcast({
    type: 'agent:complete',
    agentRole: params.agentRole,
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    data: output.content,
    timestamp: new Date().toISOString(),
  });
  return output;
}

export async function runAgentResizeWorkflow(params: {
  broadcast: GenerateDeps['broadcast'];
  novelId: string;
  chapterNumber: number;
  originalContext: AgentContext;
  chapterContent: string;
  resizeFeedback: string;
  modeLabel: string;
  preserveNotes?: string;
  client: ModelClient;
  resizerAgent: NovelAgent;
  editorAgent?: NovelAgent;
}): Promise<ResizeWorkflowResult> {
  const allOutputs: AgentOutput[] = [];
  const resizerOutput = await executeResizeAgent({
    agent: params.resizerAgent,
    client: params.client,
    agentRole: 'resizer',
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    context: {
      ...params.originalContext,
      inputText: params.chapterContent,
      userDirection: [
        `## ${params.modeLabel}要求`,
        params.resizeFeedback,
        '',
        params.preserveNotes ? `## 用户特别要求\n${params.preserveNotes}\n` : '',
      ].filter(Boolean).join('\n'),
    },
    broadcast: params.broadcast,
  });
  allOutputs.push(resizerOutput);

  if (!params.editorAgent) {
    return {
      finalContent: resizerOutput.content,
      agentOutputs: allOutputs,
    };
  }

  const editorOutput = await executeResizeAgent({
    agent: params.editorAgent,
    client: params.client,
    agentRole: 'editor',
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    context: {
      ...params.originalContext,
      inputText: resizerOutput.content,
    },
    broadcast: params.broadcast,
  });
  allOutputs.push(editorOutput);

  return {
    finalContent: parseEditorOutput(editorOutput.content).polishedText,
    agentOutputs: allOutputs,
  };
}

export async function runFallbackResizeWorkflow(params: {
  deps: Pick<GenerateDeps, 'broadcast' | 'revisionPipeline'>;
  novelId: string;
  chapterNumber: number;
  originalContext: AgentContext;
  chapterContent: string;
  resizeFeedback: string;
  modeLabel: string;
  targetWordCount: number;
  modelOverride?: GenerateDeps['modelClient'];
}): Promise<ResizeWorkflowResult> {
  const result = await params.deps.revisionPipeline.reviseChapter({
    novelId: params.novelId,
    chapterNumber: params.chapterNumber,
    feedback: params.resizeFeedback,
    originalContext: params.originalContext,
    previousContent: params.chapterContent,
    modelOverride: params.modelOverride,
    onEvent: (event) => {
      params.deps.broadcast(event);
    },
    directionSuffix: `你的唯一任务是${params.modeLabel}。严格按照上述字数约束输出，目标 ${params.targetWordCount} 字（±10%）。不要输出原文长度的内容。直接输出${params.modeLabel}后的正文。`,
  });

  return {
    finalContent: result.revisedContent ?? params.chapterContent,
    agentOutputs: [...result.agentOutputs],
  };
}

export function buildResizeResponse(params: {
  finalContent: string;
  currentWordCount: number;
  mode: ResizeMode;
  modelAccessSource: string;
  billingBypassed: boolean;
}): Record<string, unknown> {
  return {
    content: params.finalContent,
    originalWordCount: params.currentWordCount,
    newWordCount: params.finalContent.length,
    mode: params.mode === 'compress' ? '缩写' : '扩写',
    modelAccessSource: params.modelAccessSource,
    billingBypassed: params.billingBypassed,
  };
}

export async function finalizeResizeSuccess(params: {
  deps: GenerateDeps;
  novelId: string;
  chapterNumber: number;
  chapter: Chapter;
  finalContent: string;
  agentOutputs: AgentOutput[];
  mode: ResizeMode;
  currentWordCount: number;
  modelAccessSource: string;
  billingBypassed: boolean;
  freezeId?: string;
  billingUserId?: string;
}): Promise<Record<string, unknown>> {
  const {
    deps,
    novelId,
    chapterNumber,
    chapter,
    finalContent,
    agentOutputs,
    mode,
    currentWordCount,
    modelAccessSource,
    billingBypassed,
    freezeId,
    billingUserId,
  } = params;
  const { novelManager, billingService, broadcast } = deps;

  await novelManager.archiveChapterVersion(novelId, chapterNumber, 'resize');

  const timestamp = new Date().toISOString();
  const revisionComments: AgentComment[] = agentOutputs.map((output) => ({
    agentRole: output.agentRole,
    comment: output.content,
    timestamp: output.timestamp,
  }));
  const updatedChapter: Chapter = {
    ...chapter,
    content: finalContent,
    wordCount: finalContent.length,
    revisionCount: chapter.revisionCount + 1,
    status: 'edited',
    agentComments: revisionComments,
    updatedAt: timestamp,
  };
  await novelManager.saveChapter(novelId, updatedChapter);
  await novelManager.syncNovelMetadataByChapters(novelId);

  const resizeCostSummary = buildChapterCost(novelId, chapterNumber, agentOutputs, {
    operationType: 'resize',
    operationLabel: mode === 'compress' ? '章节缩写' : '章节扩写',
  });
  if (resizeCostSummary.totalInputTokens > 0 || resizeCostSummary.totalOutputTokens > 0) {
    try {
      await novelManager.appendChapterCost(novelId, resizeCostSummary);
    } catch (costErr) {
      console.warn(`[chapter-resize] 成本写入失败，不影响主流程 novel=${novelId} chapter=${chapterNumber}:`, costErr instanceof Error ? costErr.message : costErr);
    }
  }

  broadcast({
    type: 'pipeline:complete',
    agentRole: 'writer',
    novelId,
    chapterNumber,
    data: JSON.stringify({ chapterNumber, cost: resizeCostSummary, mode }),
    timestamp: new Date().toISOString(),
  });

  if (freezeId && billingService && billingUserId && billingUserId !== 'dev') {
    try {
      const resizeRuleCode = await billingService.getOperationRuleCode('resizeChapter');
      const actualEstimate = await billingService.estimate({
        ruleCode: resizeRuleCode,
        charCount: Math.max(finalContent.length, 1),
      });
      await billingService.settleFreeze(billingUserId, freezeId, actualEstimate.estimatedPoints);
    } catch (settleErr) {
      console.warn('[缩写/扩写] 计费结算失败:', settleErr instanceof Error ? settleErr.message : settleErr);
    }
  }

  return buildResizeResponse({
    finalContent,
    currentWordCount,
    mode,
    modelAccessSource,
    billingBypassed,
  });
}

export async function rollbackResizeFreeze(params: {
  deps: GenerateDeps;
  freezeId?: string;
  billingUserId?: string;
}): Promise<void> {
  if (!params.freezeId || !params.deps.billingService || !params.billingUserId || params.billingUserId === 'dev') {
    return;
  }
  try {
    await params.deps.billingService.settleFreeze(params.billingUserId, params.freezeId, 0);
  } catch (refundErr) {
    console.warn('[缩写/扩写] 冻结退回失败:', refundErr instanceof Error ? refundErr.message : refundErr);
  }
}
