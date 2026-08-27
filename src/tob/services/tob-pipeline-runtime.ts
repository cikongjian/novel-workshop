import path from 'node:path';
import type { ModelClient } from '../../models/types.js';
import type { PipelineMemory } from '../../pipeline/types.js';
import type { NovelAgent, AgentRole } from '../../agents/types.js';
import type { Logger } from '../../utils/logger.js';
import type { TobConfig } from '../config.js';
import { AdaptationManager } from '../../adaptation/adaptation-manager.js';
import { SceneCardExtractor } from '../../adaptation/scene-card-extractor.js';
import { ShortDramaAdapter } from '../../adaptation/short-drama-adapter.js';
import { ComicAdapter } from '../../adaptation/comic-adapter.js';
import { createEmbeddingClient } from '../../models/provider.js';
import { NovelManager } from '../../novel/novel-manager.js';
import { NovelMemory } from '../../memory/novel-memory.js';
import { ChapterPipeline } from '../../pipeline/chapter-pipeline.js';
import { RevisionPipeline } from '../../pipeline/revision-pipeline.js';
import { StoryStateManager } from '../../novel/story-state-manager.js';
import { WorldBuilderAgent } from '../../agents/world-builder.js';
import { CharacterAgent } from '../../agents/character.js';
import { OutlineAgent } from '../../agents/outline.js';
import { WriterAgent } from '../../agents/writer.js';
import { EditorAgent } from '../../agents/editor.js';
import { ReaderAgent } from '../../agents/reader.js';
import { ForeshadowingSchedulerAgent } from '../../agents/foreshadowing-scheduler.js';
import { TitleGeneratorAgent } from '../../agents/title-generator.js';
import { ChapterDigestAgent } from '../../agents/chapter-digest.js';
import { ArcSummaryAgent } from '../../agents/arc-summary.js';
import { StoryStateTrackerAgent } from '../../agents/story-state-tracker.js';
import { VoiceDesignerAgent } from '../../agents/voice-designer.js';

class NoopMemory implements PipelineMemory {
  async searchChapterContext(_novelId: string, _query: string, _chapterNumber: number): Promise<string> { return ''; }
  async searchWorldContext(_novelId: string, _query: string): Promise<string> { return ''; }
  async searchCharacterContext(_novelId: string, _query: string): Promise<string> { return ''; }
  async searchDigestContext(_novelId: string, _query: string, _currentChapter?: number): Promise<string> { return ''; }
  async searchMultiQuery(_novelId: string, _queries: string[]): Promise<string> { return ''; }
  async searchArcContext(_novelId: string, _query: string): Promise<string> { return ''; }
  async searchFactContext(_novelId: string, _query: string): Promise<string> { return ''; }
  async searchThreadContext(_novelId: string, _query: string): Promise<string> { return ''; }
  async searchCharacterStateContext(_novelId: string, _query: string): Promise<string> { return ''; }
}

export interface TobPipelineRuntime {
  novelsDir: string;
  sourceNovelsDir: string;
  novelManager: NovelManager;
  sourceNovelManager: NovelManager;
  novelMemory?: NovelMemory;
  chapterPipeline?: ChapterPipeline;
  revisionPipeline?: RevisionPipeline;
  storyStateManager?: StoryStateManager;
  adaptationManager: AdaptationManager;
  sceneCardExtractor: SceneCardExtractor;
  shortDramaAdapter: ShortDramaAdapter;
  comicAdapter: ComicAdapter;
  agents: Map<AgentRole, NovelAgent>;
  modelClient?: ModelClient;
  voiceDesignerAgent?: VoiceDesignerAgent;
}

function buildAgents(): Map<AgentRole, NovelAgent> {
  return new Map<AgentRole, NovelAgent>([
    ['world-builder', new WorldBuilderAgent()],
    ['character', new CharacterAgent()],
    ['outline', new OutlineAgent()],
    ['writer', new WriterAgent()],
    ['editor', new EditorAgent()],
    ['reader', new ReaderAgent()],
    ['foreshadowing-scheduler', new ForeshadowingSchedulerAgent()],
    ['title-generator', new TitleGeneratorAgent()],
    ['chapter-digest', new ChapterDigestAgent()],
    ['arc-summary', new ArcSummaryAgent()],
    ['story-state-tracker', new StoryStateTrackerAgent()],
  ]);
}

export function createTobPipelineRuntime(params: {
  config: TobConfig;
  modelClient?: ModelClient;
  logger: Logger;
}): TobPipelineRuntime {
  const { config, modelClient, logger } = params;
  const novelsDir = path.resolve(config.dataDir, 'novels');
  const sourceNovelsDir = path.resolve(config.sourceDataDir, 'novels');
  const novelManager = new NovelManager(config.dataDir);
  const sourceNovelManager = new NovelManager(config.sourceDataDir);
  const adaptationManager = new AdaptationManager(config.dataDir, logger.child('adaptation'));
  const sceneCardExtractor = new SceneCardExtractor();
  const shortDramaAdapter = new ShortDramaAdapter(novelsDir, logger.child('short-drama'));
  const comicAdapter = new ComicAdapter(novelsDir, logger.child('comic'));
  const agents = buildAgents();

  if (!modelClient) {
    logger.warn('ToB pipeline runtime disabled because model client is unavailable');
    return {
      novelsDir,
      sourceNovelsDir,
      novelManager,
      sourceNovelManager,
      adaptationManager,
      sceneCardExtractor,
      shortDramaAdapter,
      comicAdapter,
      agents,
      modelClient: undefined,
      voiceDesignerAgent: undefined,
    };
  }

  let pipelineMemory: PipelineMemory = new NoopMemory();
  let novelMemory: NovelMemory | undefined;
  try {
    const embeddingClient = createEmbeddingClient(config.appConfig);
    novelMemory = new NovelMemory(novelsDir, embeddingClient, {
      hybridSearchEnabled: config.appConfig.memory.hybridSearchEnabled,
    });
    pipelineMemory = novelMemory;
    logger.info('ToB memory enabled');
  } catch (error) {
    logger.warn('ToB memory disabled, fallback to NoopMemory', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const chapterPipeline = new ChapterPipeline(
    agents,
    pipelineMemory,
    novelManager,
    modelClient,
    config.appConfig.chapterEnhancement,
    {
      contractEnabled: config.appConfig.worldFeatures.contractEnabled,
      gateMode: config.appConfig.worldFeatures.gateMode,
      strictFallbackToWarn: config.appConfig.worldFeatures.strictFallbackToWarn,
      retrievalV2Enabled: config.appConfig.worldFeatures.retrievalV2Enabled,
      retrievalTopK: config.appConfig.worldFeatures.retrievalTopK,
    },
    {
      gateMode: config.appConfig.outlineFeatures.gateMode,
      strictFallbackToWarn: config.appConfig.outlineFeatures.strictFallbackToWarn,
      maxRequired: config.appConfig.outlineFeatures.maxRequired,
    },
    {
      gateMode: config.appConfig.qualityFeatures.gateMode,
      strictFallbackToWarn: config.appConfig.qualityFeatures.strictFallbackToWarn,
      passScore: config.appConfig.qualityFeatures.passScore,
      minStructureScore: config.appConfig.qualityFeatures.minStructureScore,
      minStyleScore: config.appConfig.qualityFeatures.minStyleScore,
      minEmotionScore: config.appConfig.qualityFeatures.minEmotionScore,
    },
    undefined,
    {
      gateMode: config.appConfig.continuityFeatures.gateMode,
      strictFallbackToWarn: config.appConfig.continuityFeatures.strictFallbackToWarn,
    },
    {
      gateMode: config.appConfig.powerRuleFeatures.gateMode,
      strictFallbackToWarn: config.appConfig.powerRuleFeatures.strictFallbackToWarn,
    },
  );

  const storyStateManager = new StoryStateManager(config.dataDir);
  chapterPipeline.setStoryStateManager(storyStateManager);

  const revisionPipeline = new RevisionPipeline(agents, novelManager, modelClient);
  const voiceDesignerAgent = new VoiceDesignerAgent();

  logger.info('ToB pipeline runtime ready', {
    agents: agents.size,
    novelsDir,
    sourceNovelsDir,
  });

  return {
    novelsDir,
    sourceNovelsDir,
    novelManager,
    sourceNovelManager,
    novelMemory,
    chapterPipeline,
    revisionPipeline,
    storyStateManager,
    adaptationManager,
    sceneCardExtractor,
    shortDramaAdapter,
    comicAdapter,
    agents,
    modelClient,
    voiceDesignerAgent,
  };
}
