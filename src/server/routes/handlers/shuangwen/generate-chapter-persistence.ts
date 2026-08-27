import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { Chapter, CharacterProfile, NovelMetadata } from '../../../../novel/types.js';
import type { ModelClient } from '../../../../models/types.js';
import type { ShuangwenChapterResult } from '../../../../pipeline/types.js';
import { extractBootstrapCharacterNames } from '../../../../novel/character-bootstrap.js';
import { buildChapterCost } from '../../../../cost/build-chapter-cost.js';
import {
  generateChapterSummary,
} from './shared-helpers.js';
import { schedulePostSaveBackgroundTasks } from '../../../../services/generation-background-tasks.js';
import {
  normalizeName,
  now,
  seedCharactersFromShuangwenBlueprint,
} from './utils.js';
import type { GenerateChapterBody, ShuangwenDeps } from './types.js';
import {
  generateTitleWithRetry,
  getRecentChapterTitles,
} from '../shared/chapter-title-generation.js';
import { createLogger } from '../../../../utils/logger.js';
import {
  buildAgentTrace,
  buildTitleTrace,
  mergeChapterDiagnostics,
} from '../../../../services/chapter-generation-diagnostics.js';
import { shouldAdoptGeneratedChapterTitle } from '../../../../agents/title-audit.js';
import { sanitizeGeneratedTitle } from '../../../../agents/title-generation-strategy.js';

type GenerateChapterInput = z.infer<typeof GenerateChapterBody>;

const logger = createLogger('ShuangwenTitle');

export async function persistShuangwenGeneratedChapter(params: {
  deps: ShuangwenDeps;
  novel: NovelMetadata;
  body: GenerateChapterInput;
  modelClient: ModelClient;
  result: ShuangwenChapterResult;
}) {
  const { deps, novel, body, modelClient, result } = params;
  const chapterContent = result.chapterContent;
  if (!chapterContent.trim()) {
    throw new Error('shuangwen pipeline returned empty chapter content');
  }

  const outlineData = await deps.novelManager.getOutline(body.novelId);
  const chapterOutline = outlineData.chapters.find(ch => ch.chapterNumber === body.chapterNumber);
  const titleResult = await resolveGeneratedTitle({
    deps,
    novel,
    body,
    modelClient,
    chapterContent,
    fallbackTitle: sanitizeGeneratedTitle(chapterOutline?.title || '') || ('第 ' + body.chapterNumber + ' 章'),
  });
  const generatedTitle = titleResult.title;

  const chapter: Chapter = {
    novelId: body.novelId,
    chapterNumber: body.chapterNumber,
    title: generatedTitle,
    content: chapterContent,
    wordCount: chapterContent.length,
    status: 'edited',
    outline: chapterOutline,
    agentComments: result.agentOutputs.map(output => ({
      agentRole: output.agentRole,
      comment: output.content,
      timestamp: output.timestamp,
    })),
    revisionCount: result.autoRevision?.rounds ?? 0,
    summary: await generateChapterSummary(modelClient, chapterContent, result.statusUpdate),
    diagnostics: mergeChapterDiagnostics(undefined, {
      agentTrace: buildAgentTrace(result.agentOutputs),
      ...(titleResult.titleTrace ? { titleTrace: titleResult.titleTrace } : {}),
    }, now()),
    createdAt: now(),
    updatedAt: now(),
  };
  await deps.novelManager.saveChapter(body.novelId, chapter);
  await deps.novelManager.syncNovelMetadataByChapters(body.novelId);

  await backfillOutlineEntry({
    deps,
    novelId: body.novelId,
    chapterNumber: body.chapterNumber,
    title: generatedTitle,
    summary: chapter.summary || chapterContent.slice(0, 300),
  });

  await seedCharactersIfMissing({
    deps,
    novel,
    body,
    chapterContent,
    chapterOutlineSummary: chapterOutline?.summary,
  });

  schedulePostSaveBackgroundTasks(
    deps.novelManager,
    deps.novelMemory,
    body.novelId,
    body.chapterNumber,
    {
      chapterContent: result.chapterContent,
      outline: result.outline,
      worldNotes: '',
      characterNotes: '',
      draft: result.draft,
      editedContent: result.editedContent,
      readerFeedback: result.readerFeedback,
      agentOutputs: result.agentOutputs,
      scenePlan: result.scenePlan,
      qualityReport: result.qualityReport,
      autoRevision: result.autoRevision,
    },
    deps.agents,
    modelClient,
    deps.storyStateManager,
  );

  const costSummary = buildChapterCost(body.novelId, body.chapterNumber, result.agentOutputs, {
    operationType: 'generate',
    operationLabel: '爽文章节生成',
  });
  await deps.novelManager.appendChapterCost(body.novelId, costSummary);

  return { costSummary };
}

async function resolveGeneratedTitle(params: {
  deps: ShuangwenDeps;
  novel: NovelMetadata;
  body: GenerateChapterInput;
  modelClient: ModelClient;
  chapterContent: string;
  fallbackTitle: string;
}): Promise<{
  title: string;
  titleTrace?: NonNullable<Chapter['diagnostics']>['titleTrace'];
}> {
  const { deps, novel, body, modelClient, chapterContent } = params;
  let generatedTitle = params.fallbackTitle;
  const titleAgent = deps.agents?.get('title-generator');
  if (!titleAgent) return { title: generatedTitle };

  try {
    const previousChapter = body.chapterNumber > 1
      ? await deps.novelManager.getChapter(body.novelId, body.chapterNumber - 1)
      : null;
    const recentTitles = await getRecentChapterTitles(deps.novelManager, body.novelId, body.chapterNumber);
    generatedTitle = await generateTitleWithRetry({
      titleAgent,
      novelId: body.novelId,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      genre: novel.genre,
      chapterNumber: body.chapterNumber,
      previousTitle: previousChapter?.title || '',
      recentTitles,
      fullContent: chapterContent,
      modelClient,
    }) || generatedTitle;
    logger.debug('爽文标题生成', { chapterNumber: body.chapterNumber, title: generatedTitle });
    const decision = shouldAdoptGeneratedChapterTitle({
      currentTitle: params.fallbackTitle,
      generatedTitle,
      auditInput: {
        genre: novel.genre,
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis,
        novelTags: novel.tags,
        constitutionTags: novel.constitutionTags,
        chapterNumber: body.chapterNumber,
        startupPlatformProfile: novel.startupPlatformProfile,
        outline: '',
        summary: '',
        fullContent: chapterContent,
        recentTitles,
      },
    });
    const updatedAt = now();
    return {
      title: generatedTitle,
      titleTrace: buildTitleTrace({
        candidateTitle: generatedTitle,
        adopted: decision.accept || generatedTitle !== params.fallbackTitle,
        currentScore: decision.currentScore,
        generatedScore: decision.generatedScore,
        reasons: decision.reasons,
        fullContent: chapterContent,
        recentTitles,
        provider: modelClient.provider,
        model: modelClient.model,
        updatedAt,
      }),
    };
  } catch (err) {
    logger.warn('标题生成失败，使用默认值', { error: err instanceof Error ? err.message : err });
  }

  return { title: generatedTitle };
}

async function backfillOutlineEntry(params: {
  deps: ShuangwenDeps;
  novelId: string;
  chapterNumber: number;
  title: string;
  summary: string;
}): Promise<void> {
  try {
    const freshOutline = await params.deps.novelManager.getOutline(params.novelId);
    const existingEntry = freshOutline.chapters.find(ch => ch.chapterNumber === params.chapterNumber);
    if (existingEntry) {
      existingEntry.summary = params.summary;
      existingEntry.title = params.title || existingEntry.title;
    } else {
      freshOutline.chapters.push({
        chapterNumber: params.chapterNumber,
        title: params.title,
        summary: params.summary,
        beats: [],
        tensionTarget: 5,
        plotThreadsAdvanced: [],
        keyEvents: [],
        notes: '[自动回写] 爽文章节生成时补建',
      });
      freshOutline.chapters.sort((a: any, b: any) => a.chapterNumber - b.chapterNumber);
    }
    await params.deps.novelManager.saveOutline(params.novelId, freshOutline);
  } catch (outlineErr) {
    console.warn('[爽文管线] 大纲回写失败:', outlineErr instanceof Error ? outlineErr.message : outlineErr);
  }
}

async function seedCharactersIfMissing(params: {
  deps: ShuangwenDeps;
  novel: NovelMetadata;
  body: GenerateChapterInput;
  chapterContent: string;
  chapterOutlineSummary?: string;
}): Promise<void> {
  try {
    const { deps, novel, body, chapterContent, chapterOutlineSummary } = params;
    const existingCharacters = await deps.novelManager.getCharacters(body.novelId);
    if (existingCharacters.length > 0) return;

    const blueprint = novel.shuangwenBlueprint as Record<string, unknown> | undefined;
    await seedCharactersFromShuangwenBlueprint({
      novelManager: deps.novelManager,
      novelId: body.novelId,
      blueprint,
      chapterNumber: body.chapterNumber,
    });

    const protagonistName = normalizeName((blueprint as any)?.protagonist?.name);
    const antagonistName = normalizeName((blueprint as any)?.antagonist?.name);
    const bootstrapNames = extractBootstrapCharacterNames({
      chapterContent,
      chapterOutlineSummary,
      limit: 6,
    });

    if (bootstrapNames.length === 0) return;

    const ts = now();
    for (const [index, name] of bootstrapNames.entries()) {
      const role = name && protagonistName && name === protagonistName
        ? 'protagonist'
        : name && antagonistName && name === antagonistName
          ? 'antagonist'
          : index === 0
            ? 'protagonist'
            : 'supporting';

      const profile: CharacterProfile = {
        id: randomUUID(),
        name,
        aliases: [],
        role,
        position: '',
        appearance: '',
        personality: '',
        personalityTraits: [],
        speechStyle: '',
        speechExamples: [],
        backstory: '',
        motivation: '',
        abilities: [],
        relationships: [],
        arc: '',
        currentState: `[第${body.chapterNumber}章] 初次出场`,
        firstAppearance: body.chapterNumber,
        voiceDesignStatus: 'none',
        tags: ['auto-bootstrap', 'from-shuangwen'],
        createdAt: ts,
        updatedAt: ts,
      };
      await deps.novelManager.saveCharacter(body.novelId, profile);
    }
  } catch {
    // 兜底逻辑失败不影响主流程
  }
}
