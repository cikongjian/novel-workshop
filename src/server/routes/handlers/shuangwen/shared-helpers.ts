import type { Request, Response } from 'express';
import type { ModelClient } from '../../../../models/types.js';
import type { NovelAgent, AgentEvent } from '../../../../agents/types.js';
import type { NovelMetadata } from '../../../../novel/types.js';
import { ShuangwenPipeline } from '../../../../pipeline/shuangwen-pipeline.js';
import type { ShuangwenBlueprint, ShuangwenSampleChapter } from '../../../../pipeline/shuangwen-pipeline.js';
import type { ChapterGenerationResult } from '../../../../pipeline/types.js';
import { resolveChapterOneOpeningProfile } from '../../../../pipeline/chapter-opening-profile.js';
import { getAudienceRules, parseEditorOutput } from '../../../../pipeline/shuangwen-utils.js';
import { saveGenerationResults } from '../../../../services/generation-result-service.js';
import { resolveAudienceAndGenre } from './utils.js';
import type { ShuangwenDeps } from './types.js';
import type { z } from 'zod';
import { ShuangwenGenreSchema } from './types.js';
import { resolveUserModelAccess, type ResolvedUserModelAccess } from '../../helpers/user-api-model-resolver.js';

export function requireReady(res: Response, deps: ShuangwenDeps): { agents: Map<string, NovelAgent> } | null {
  if (!deps.agents) {
    res.status(503).json({ error: 'AI 功能尚未就绪：缺少 agents' });
    return null;
  }
  return { agents: deps.agents };
}

export async function resolveShuangwenModelClient(params: {
  req: Request;
  res: Response;
  deps: ShuangwenDeps;
  novel?: NovelMetadata | null;
}): Promise<{ modelClient: ModelClient; modelAccess: ResolvedUserModelAccess } | null> {
  const { req, res, deps, novel } = params;
  const modelAccess = await resolveUserModelAccess({
    authDb: deps.authDb,
    userId: req.auth?.id,
    headers: req.headers,
    novel,
  });
  if (modelAccess.error && novel?.modelConfig?.source === 'user-profile') {
    res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
    return null;
  }
  const activeModelClient = modelAccess.client ?? deps.modelClient;
  if (!activeModelClient) {
    res.status(503).json({ error: 'AI 功能尚未就绪：缺少 modelClient' });
    return null;
  }
  return {
    modelClient: activeModelClient,
    modelAccess,
  };
}

export async function loadAccessibleNovel(params: {
  req: Request;
  res: Response;
  deps: ShuangwenDeps;
  novelId: string;
}): Promise<NovelMetadata | null> {
  const { req, res, deps, novelId } = params;

  let novel: NovelMetadata | null = null;
  try {
    novel = await deps.novelManager.getNovel(novelId);
  } catch {
    novel = null;
  }

  if (!novel) {
    res.status(404).json({ error: `novel not found: ${novelId}` });
    return null;
  }

  const currentUserId = req.auth?.id ?? 'dev';
  const ownerId = novel.ownerId ?? 'dev';
  if (req.auth?.role !== 'admin' && ownerId !== currentUserId) {
    res.status(403).json({ error: '无权访问此小说' });
    return null;
  }

  return novel;
}

/**
 * 用 LLM 生成章节摘要，失败时回退为正文截断。
 */
export async function generateChapterSummary(
  modelClient: ModelClient | undefined,
  content: string,
  statusUpdate?: string
): Promise<string> {
  if (!modelClient) return content.slice(0, 260);
  try {
    const resp = await modelClient.chat([
      { role: 'system', content: '你是专业小说编辑。将以下章节压缩为200-300字前情提要，保留关键情节转折、角色行动和悬念。只输出摘要文本，不要加任何前缀。' },
      { role: 'user', content: content.slice(0, 8000) },
    ] as any);
    let summary = resp.content.trim().slice(0, 500);
    if (statusUpdate) {
      summary = `${summary}\n\n---\n${statusUpdate}`;
    }
    return summary || content.slice(0, 260);
  } catch {
    const fallback = content.slice(0, 260);
    return statusUpdate ? `${fallback}\n\n---\n${statusUpdate}` : fallback;
  }
}

export async function generateArtifacts(params: {
  modelClient: ModelClient;
  agents: Map<string, NovelAgent>;
  novelIdForContext?: string;
  inputGenre: z.infer<typeof ShuangwenGenreSchema>;
  inputAudience?: string;
  seedIdea: string;
  titleHint?: string;
  synopsisHint?: string;
  outlineChapters: number;
  targetChapters: number;
  includeMarketing: boolean;
  sampleChapter: boolean;
  maxWordCount: number;
  temperatureOverride?: number;
  existingNovel?: NovelMetadata | null;
}) {
  const pipeline = new ShuangwenPipeline({ modelClient: params.modelClient, agents: params.agents });
  const { genreUsed, audienceUsed } = resolveAudienceAndGenre({
    inputGenre: params.inputGenre,
    inputAudience: params.inputAudience,
    existingNovel: params.existingNovel,
  });

  const blueprint = await pipeline.generateBlueprint({
    audience: audienceUsed as any,
    genre: genreUsed,
    seedIdea: params.seedIdea,
    titleHint: params.titleHint,
    synopsisHint: params.synopsisHint,
    temperatureOverride: params.temperatureOverride,
  });

  const runResult = await pipeline.runFromBlueprint({
    novelId: params.novelIdForContext,
    audience: audienceUsed as any,
    genre: genreUsed,
    blueprint,
    outlineChapters: params.outlineChapters,
    targetChapters: params.targetChapters,
    includeMarketing: params.includeMarketing,
    sampleChapter: params.sampleChapter,
    maxWordCount: params.maxWordCount,
    temperatureOverride: params.temperatureOverride,
  });

  return { genreUsed: genreUsed as z.infer<typeof ShuangwenGenreSchema>, audienceUsed, blueprint, runResult };
}

export function createUiHelpers(broadcast?: (event: AgentEvent) => void) {
  function emit(event: AgentEvent): void {
    broadcast?.(event);
  }

  function startPipelineUi(novelId: string): void {
    emit({
      type: 'agent:start',
      agentRole: 'writing-assistant',
      novelId,
      chapterNumber: 1,
      data: '',
      timestamp: new Date().toISOString(),
    });
  }

  function pipelineUiChunk(novelId: string, text: string): void {
    emit({
      type: 'agent:chunk',
      agentRole: 'writing-assistant',
      novelId,
      chapterNumber: 1,
      data: text,
      timestamp: new Date().toISOString(),
    });
  }

  function pipelineUiComplete(novelId: string, summary: string): void {
    emit({
      type: 'agent:complete',
      agentRole: 'writing-assistant',
      novelId,
      chapterNumber: 1,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  }

  return { emit, startPipelineUi, pipelineUiChunk, pipelineUiComplete };
}

function buildUnifiedOpeningDirection(params: {
  blueprint: ShuangwenBlueprint;
  audience: 'male' | 'female';
}): string {
  const { blueprint, audience } = params;
  return [
    '写第 1 章：开篇强钩子 + 低理解成本 + 强情绪。',
    `必须落实：${blueprint.hook.openingScene}`,
    `引爆事件：${blueprint.hook.incitingIncident}`,
    `三章内首次兑现（本章必须尽量提前吃到第一口结果）：${blueprint.hook.firstPayoff}`,
    `章末钩子要求：${blueprint.hook.chapterEndHookRule}`,
    getAudienceRules(audience),
  ].join('\n');
}

export async function generateOpeningChapterWithUnifiedPipeline(params: {
  deps: ShuangwenDeps;
  novelId: string;
  blueprint: ShuangwenBlueprint;
  audience: 'male' | 'female';
  maxWordCount: number;
  modelClient: ModelClient;
  onEvent?: (event: AgentEvent) => void;
}): Promise<{
  result: ChapterGenerationResult;
  sampleChapter: ShuangwenSampleChapter;
}> {
  const { deps, novelId, blueprint, audience, maxWordCount, modelClient, onEvent } = params;
  if (!deps.chapterPipeline) {
    throw new Error('shuangwen unified opening pipeline unavailable: chapterPipeline missing');
  }
  const openingProfile = resolveChapterOneOpeningProfile({
    chapterNumber: 1,
    blueprint,
    audience,
    maxWordCount,
  });
  const isolatedChapterPipeline = deps.chapterPipeline.fork();

  const result = await isolatedChapterPipeline.generateChapter({
    novelId,
    chapterNumber: 1,
    userDirection: openingProfile.userDirection || buildUnifiedOpeningDirection({ blueprint, audience }),
    maxWordCount: openingProfile.maxWordCount ?? maxWordCount,
    styleNotes: openingProfile.styleNotes ?? blueprint.styleGuide,
    modelOverride: modelClient,
    skipStrictGate: true,
    onDraftReady: async (draftResult) => {
      await saveGenerationResults(deps.novelManager, novelId, 1, draftResult, { chapterStatus: 'edited' });
    },
    onEvent,
  });

  await saveGenerationResults(deps.novelManager, novelId, 1, result);
  await deps.novelManager.syncNovelMetadataByChapters(novelId);

  const savedChapter = await deps.novelManager.getChapter(novelId, 1);
  const parsedEditor = parseEditorOutput(result.editedContent || '');
  return {
    result,
    sampleChapter: {
      chapterNumber: 1,
      title: savedChapter?.title || '第 1 章',
      draftText: result.draft || '',
      polishedText: result.chapterContent,
      editorNotes: parsedEditor.editorNotes,
    },
  };
}
