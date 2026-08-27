import type { AgentComment, Chapter } from '../../novel/types.js';
import type { AgentOutput } from '../../agents/types.js';
import { saveGenerationResultsFull } from '../../services/generation-result-service.js';
import { buildScenePlanFromOutlineData } from '../../utils/outline-extractors.js';
import { buildRevisionCharacterContext, buildRevisionWorldContext } from '../../utils/revision-utils.js';
import type { TobPipelineRunner, TobPipelineRunContext } from './types.js';
import type { TobJobRunResult } from '../types.js';

function collectUsage(agentOutputs: AgentOutput[] | undefined): { inputTokens: number; outputTokens: number } | undefined {
  if (!agentOutputs || agentOutputs.length === 0) return undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  let hasUsage = false;

  for (const output of agentOutputs) {
    const inTokens = typeof output.metadata?.inputTokens === 'number' ? output.metadata.inputTokens : 0;
    const outTokens = typeof output.metadata?.outputTokens === 'number' ? output.metadata.outputTokens : 0;
    if (inTokens > 0 || outTokens > 0) {
      hasUsage = true;
    }
    inputTokens += inTokens;
    outputTokens += outTokens;
  }

  if (!hasUsage) return undefined;
  return { inputTokens, outputTokens };
}

function buildPipelineMarkdown(params: {
  title: string;
  projectName: string;
  chapterNumber: number;
  content: string;
}): string {
  return [
    `# ${params.title}`,
    '',
    `- Project: ${params.projectName}`,
    `- Chapter: ${params.chapterNumber}`,
    '',
    params.content.trim(),
  ].join('\n');
}

function createMockResult(context: TobPipelineRunContext, reason: string): TobJobRunResult {
  const { job, project } = context;
  const label = job.type === 'generate' ? 'Draft' : 'Intervention Draft';
  const markdown = [
    `# ${project.name} - ${label}`,
    '',
    `- Job ID: ${job.id}`,
    '- Mode: MOCK',
    `- Reason: ${reason}`,
    '',
    '## Brief',
    project.brief || 'N/A',
    '',
    '## Generated Content',
    'This is a local mock output to validate ToB workflow end-to-end.',
  ].join('\n');

  context.logger.warn('ToB longform runner fallback to mock', { jobId: job.id, projectId: project.id, reason });
  return {
    markdown,
    model: 'mock-local',
    usage: { inputTokens: 0, outputTokens: 0 },
    pipeline: {
      pipelineKey: 'longform-novel',
      novelId: project.pipelineNovelId ?? 'mock',
      chapterNumber: 0,
      mode: 'mock',
    },
  };
}

async function ensureProjectNovel(context: TobPipelineRunContext): Promise<string> {
  const { runtime, repository, project } = context;
  if (project.pipelineNovelId) {
    try {
      await runtime.novelManager.getNovel(project.pipelineNovelId);
      return project.pipelineNovelId;
    } catch {
      context.logger.warn('ToB project bound novel missing, will recreate', {
        projectId: project.id,
        pipelineNovelId: project.pipelineNovelId,
      });
    }
  }

  const novel = await runtime.novelManager.createNovel({
    title: project.name,
    genre: 'custom',
    synopsis: project.brief,
    description: `ToB project ${project.id}`,
  });
  await repository.setProjectPipelineNovel(project.id, novel.id);
  return novel.id;
}

async function resolveNextChapterNumber(context: TobPipelineRunContext, novelId: string): Promise<number> {
  const chapters = await context.runtime.novelManager.listChapters(novelId);
  if (chapters.length === 0) return 1;
  return Math.max(...chapters.map((item) => item.chapterNumber)) + 1;
}

export const longformNovelRunner: TobPipelineRunner = {
  summary: {
    key: 'longform-novel',
    name: 'Longform Novel',
    description: 'Use workspace chapter and revision pipelines for longform writing.',
    supportsIntervention: true,
  },

  async runGenerate(context: TobPipelineRunContext): Promise<TobJobRunResult> {
    const { runtime, project, job } = context;
    if (!runtime.chapterPipeline || !runtime.modelClient) {
      return createMockResult(context, 'chapter pipeline unavailable');
    }

    try {
      const novelId = await ensureProjectNovel(context);
      const chapterNumber = await resolveNextChapterNumber(context, novelId);
      const prompt = 'prompt' in job.payload ? (job.payload.prompt ?? '') : '';
      const constraints = 'constraints' in job.payload ? (job.payload.constraints ?? '') : '';
      const userDirection = [
        `ToB project: ${project.name}`,
        project.brief ? `Project brief: ${project.brief}` : '',
        `Requirement: ${prompt}`,
        constraints ? `Constraints: ${constraints}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const result = await runtime.chapterPipeline.fork().generateChapter({
        novelId,
        chapterNumber,
        userDirection,
      });

      await saveGenerationResultsFull(
        runtime.novelManager,
        runtime.novelMemory,
        novelId,
        chapterNumber,
        result,
        runtime.agents,
        runtime.modelClient,
        runtime.storyStateManager,
      );

      const chapter = await runtime.novelManager.getChapter(novelId, chapterNumber);
      const chapterTitle = chapter?.title || `Chapter ${chapterNumber}`;
      const chapterContent = chapter?.content || result.chapterContent;
      const usage = collectUsage(result.agentOutputs);

      return {
        markdown: buildPipelineMarkdown({
          title: chapterTitle,
          projectName: project.name,
          chapterNumber,
          content: chapterContent,
        }),
        model: `${runtime.modelClient.provider}/${runtime.modelClient.constructor.name}`,
        usage,
        pipeline: {
          pipelineKey: 'longform-novel',
          novelId,
          chapterNumber,
          mode: 'chapter-pipeline',
        },
      };
    } catch (error) {
      if (!context.allowMockGeneration) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      context.logger.warn('ToB chapter pipeline failed, fallback to mock', {
        jobId: job.id,
        error: message,
      });
      return createMockResult(context, message);
    }
  },

  async runIntervention(context: TobPipelineRunContext): Promise<TobJobRunResult> {
    const { runtime, job, project } = context;
    if (!runtime.revisionPipeline) {
      return createMockResult(context, 'revision pipeline unavailable');
    }

    const sourceJobId = 'baseJobId' in job.payload ? job.payload.baseJobId : '';
    const sourceJob = context.repository.getJob(sourceJobId);
    if (!sourceJob) {
      throw new Error('BASE_JOB_NOT_FOUND');
    }
    if (!sourceJob.pipeline) {
      return createMockResult(context, 'source job has no pipeline reference');
    }

    const { novelId, chapterNumber } = sourceJob.pipeline;
    const instruction = 'instruction' in job.payload ? job.payload.instruction : '';

    try {
      const [novel, chapter, outlineData, characters, worldEntries] = await Promise.all([
        runtime.novelManager.getNovel(novelId),
        runtime.novelManager.getChapter(novelId, chapterNumber),
        runtime.novelManager.getOutline(novelId),
        runtime.novelManager.getCharacters(novelId),
        runtime.novelManager.getWorldEntries(novelId),
      ]);

      if (!chapter) {
        throw new Error('BASE_CHAPTER_NOT_FOUND');
      }

      const chapterOutline = outlineData.chapters.find((item) => item.chapterNumber === chapterNumber);
      const scenePlan = buildScenePlanFromOutlineData(chapterOutline);
      const unresolvedForeshadowing = outlineData.foreshadowing
        .filter((item) => !item.isResolved)
        .slice(0, 4)
        .map((item) => `- ${item.hint}`)
        .join('\n');

      const originalContext = {
        novelId,
        genre: novel.genre,
        novelTitle: novel.title,
        novelSynopsis: novel.synopsis,
        chapterNumber,
        outlineContext: chapterOutline?.summary || undefined,
        scenePlan,
        unresolvedForeshadowing: unresolvedForeshadowing || undefined,
        characterContext: buildRevisionCharacterContext(characters),
        worldContext: buildRevisionWorldContext(worldEntries),
      };

      const revisionResult = await runtime.revisionPipeline.reviseChapter({
        novelId,
        chapterNumber,
        feedback: instruction,
        originalContext,
        previousContent: chapter.content,
      });

      const revisedContent = revisionResult.revisedContent || chapter.content;
      const timestamp = new Date().toISOString();
      const revisionComments: AgentComment[] = revisionResult.agentOutputs.map((output) => ({
        agentRole: output.agentRole,
        comment: output.content,
        timestamp: output.timestamp,
      }));

      await runtime.novelManager.archiveChapterVersion(novelId, chapterNumber, 'revise');
      const updatedChapter: Chapter = {
        ...chapter,
        content: revisedContent,
        wordCount: revisedContent.length,
        revisionCount: chapter.revisionCount + 1,
        status: 'edited',
        agentComments: revisionComments,
        updatedAt: timestamp,
      };
      await runtime.novelManager.saveChapter(novelId, updatedChapter);
      await runtime.novelManager.syncNovelMetadataByChapters(novelId);

      if (runtime.novelMemory) {
        await runtime.novelMemory.indexChapter(novelId, chapterNumber, revisedContent).catch(() => undefined);
      }

      return {
        markdown: buildPipelineMarkdown({
          title: updatedChapter.title || `Chapter ${chapterNumber}`,
          projectName: project.name,
          chapterNumber,
          content: revisedContent,
        }),
        model: `${runtime.modelClient?.provider ?? 'pipeline'}/revision`,
        usage: collectUsage(revisionResult.agentOutputs),
        pipeline: {
          pipelineKey: 'longform-novel',
          novelId,
          chapterNumber,
          mode: 'revision-pipeline',
        },
      };
    } catch (error) {
      if (!context.allowMockGeneration) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      context.logger.warn('ToB intervention pipeline failed, fallback to mock', {
        jobId: job.id,
        error: message,
      });
      return createMockResult(context, message);
    }
  },
};
