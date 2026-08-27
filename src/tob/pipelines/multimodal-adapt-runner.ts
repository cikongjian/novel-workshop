import type { TobPipelineRunner, TobPipelineRunContext } from './types.js';
import { createAdaptationOutputDir, prepareAdaptationContext } from './adapt-shared.js';

function buildAdaptationMarkdown(params: {
  projectName: string;
  mode: 'short-drama' | 'comic';
  sourceNovelId: string;
  targetNovelId: string;
  chapterStart: number;
  chapterEnd: number;
  payloadPath: string;
  packageId: string;
  countLabel: string;
  countValue: number;
}): string {
  return [
    `# ${params.projectName} - ${params.mode} adaptation`,
    '',
    `- Source Novel ID: ${params.sourceNovelId}`,
    `- ToB Novel ID: ${params.targetNovelId}`,
    `- Chapter Range: ${params.chapterStart}-${params.chapterEnd}`,
    `- Package ID: ${params.packageId}`,
    `- Payload Path: ${params.payloadPath}`,
    `- ${params.countLabel}: ${params.countValue}`,
    '',
    '## Delivery',
    'Structured adaptation payload is ready for downstream image/video pipelines.',
  ].join('\n');
}

function resolveSourceNovelId(context: TobPipelineRunContext): string {
  const payload = context.job.payload;
  const sourceNovelId = 'sourceNovelId' in payload
    ? payload.sourceNovelId || context.project.sourceNovelId
    : context.project.sourceNovelId;
  if (!sourceNovelId) {
    throw new Error('SOURCE_NOVEL_ID_REQUIRED');
  }
  return sourceNovelId;
}

export const multimodalAdaptRunner: TobPipelineRunner = {
  summary: {
    key: 'multimodal-adapt',
    name: 'Multimodal Adaptation',
    description: 'Convert chapters into short-drama or comic production assets.',
    supportsIntervention: false,
  },

  async runGenerate(context: TobPipelineRunContext) {
    const payload = context.job.payload;
    const sourceNovelId = resolveSourceNovelId(context);
    const adaptationMode = ('adaptationMode' in payload && payload.adaptationMode) || 'short-drama';
    if (adaptationMode !== 'short-drama' && adaptationMode !== 'comic') {
      throw new Error('UNSUPPORTED_ADAPTATION_MODE');
    }

    const prepared = await prepareAdaptationContext({
      context,
      sourceNovelId,
      sourceChapterStart: 'sourceChapterStart' in payload ? payload.sourceChapterStart : undefined,
      sourceChapterEnd: 'sourceChapterEnd' in payload ? payload.sourceChapterEnd : undefined,
    });

    const outputDirRelative = createAdaptationOutputDir({
      mode: adaptationMode,
      range: prepared.range,
      runLabel: 'run',
    });

    if (adaptationMode === 'short-drama') {
      const result = await context.runtime.shortDramaAdapter.generate({
        novelId: prepared.targetNovelId,
        chapterNumberStart: prepared.range.start,
        chapterNumberEnd: prepared.range.end,
        outputDirRelative,
        sceneCardsByChapter: prepared.sceneCardsByChapter,
        characterProfiles: prepared.characters.map((character) => ({
          id: character.id,
          name: character.name,
          aliases: character.aliases,
          appearance: character.appearance,
          personality: character.personality,
          speechStyle: character.speechStyle,
        })),
      });

      const packageRecord = await context.runtime.adaptationManager.createPackage({
        novelId: prepared.targetNovelId,
        chapterNumberStart: prepared.range.start,
        chapterNumberEnd: prepared.range.end,
        mode: 'short-drama',
        payloadPath: result.payloadPath,
      });

      return {
        markdown: buildAdaptationMarkdown({
          projectName: context.project.name,
          mode: adaptationMode,
          sourceNovelId: prepared.sourceNovelId,
          targetNovelId: prepared.targetNovelId,
          chapterStart: prepared.range.start,
          chapterEnd: prepared.range.end,
          payloadPath: result.payloadPath,
          packageId: packageRecord.id,
          countLabel: 'Scene Count',
          countValue: result.sceneCount,
        }),
        model: 'adapter/short-drama',
        pipeline: {
          pipelineKey: 'multimodal-adapt',
          novelId: prepared.targetNovelId,
          chapterNumber: prepared.range.end,
          mode: 'adapt-short-drama',
        },
      };
    }

    const comicResult = await context.runtime.comicAdapter.generate({
      novelId: prepared.targetNovelId,
      chapterNumberStart: prepared.range.start,
      chapterNumberEnd: prepared.range.end,
      outputDirRelative,
      sceneCardsByChapter: prepared.sceneCardsByChapter,
    });

    const packageRecord = await context.runtime.adaptationManager.createPackage({
      novelId: prepared.targetNovelId,
      chapterNumberStart: prepared.range.start,
      chapterNumberEnd: prepared.range.end,
      mode: 'comic',
      payloadPath: comicResult.payloadPath,
    });

    return {
      markdown: buildAdaptationMarkdown({
        projectName: context.project.name,
        mode: adaptationMode,
        sourceNovelId: prepared.sourceNovelId,
        targetNovelId: prepared.targetNovelId,
        chapterStart: prepared.range.start,
        chapterEnd: prepared.range.end,
        payloadPath: comicResult.payloadPath,
        packageId: packageRecord.id,
        countLabel: 'Page Count',
        countValue: comicResult.pageCount,
      }),
      model: 'adapter/comic',
      pipeline: {
        pipelineKey: 'multimodal-adapt',
        novelId: prepared.targetNovelId,
        chapterNumber: prepared.range.end,
        mode: 'adapt-comic',
      },
    };
  },
};
