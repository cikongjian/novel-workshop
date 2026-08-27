import type { NovelAgent, AgentContext, AgentOutput, AgentRole } from '../agents/types.js';
import type { ModelClient } from '../models/types.js';
import type { Scene } from '../novel/types.js';
import type { NovelManager } from '../novel/novel-manager.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ScenePipeline');

export type SceneGenerationParams = {
  novelId: string;
  chapterNumber: number;
  scene: Scene;
  fullScenePlan: string;
  previousSceneContent?: string;
  userDirection?: string;
  maxWordCount?: number;
  stylePreset?: string;
  styleNotes?: string;
  onChunk?: (agentRole: AgentRole, chunk: string) => void;
  onAgentStart?: (agentRole: AgentRole) => void;
  onAgentComplete?: (agentRole: AgentRole, output: AgentOutput) => void;
};

export type SceneGenerationResult = {
  sceneNumber: number;
  content: string;
  draft: string;
  editedContent: string;
  readerFeedback: string;
  readerScore?: number;
  agentOutputs: AgentOutput[];
};

export class ScenePipeline {
  constructor(
    private agents: Map<string, NovelAgent>,
    private novelManager: NovelManager,
  ) {}

  async generateScene(
    params: SceneGenerationParams,
    model: ModelClient,
  ): Promise<SceneGenerationResult> {
    const { novelId, chapterNumber, scene, fullScenePlan } = params;
    const agentOutputs: AgentOutput[] = [];

    // Load novel metadata
    const novel = await this.novelManager.getNovel(novelId);
    const characters = await this.novelManager.getCharacters(novelId);
    const characterNames = characters.map((c) => c.name).join('、');

    // Build base context
    const baseContext: AgentContext = {
      novelId,
      genre: novel.genre,
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis,
      chapterNumber,
      characterContext: characterNames,
      userDirection: params.userDirection,
      maxWordCount: params.maxWordCount ?? (scene.wordTarget || undefined),
      sceneNumber: scene.sceneNumber,
      sceneSummary: scene.summary,
      sceneCharacters: scene.characters.join('、'),
      sceneLocation: scene.location,
      sceneTensionTarget: scene.tension,
      sceneWordTarget: scene.wordTarget || undefined,
      previousSceneContent: params.previousSceneContent,
      fullScenePlan,
    };

    // --- Writer ---
    const writer = this.agents.get('writer');
    if (!writer) throw new Error('Writer agent not registered');

    params.onAgentStart?.('writer');
    logger.info(`场景 ${scene.sceneNumber} 开始写作`);

    const writerOutput = await writer.execute(
      baseContext,
      model,
      params.onChunk ? (chunk) => params.onChunk!('writer', chunk) : undefined,
    );
    agentOutputs.push(writerOutput);
    params.onAgentComplete?.('writer', writerOutput);

    const draft = writerOutput.content;

    // --- Editor ---
    const editor = this.agents.get('editor');
    let editedContent = draft;
    if (editor) {
      params.onAgentStart?.('editor');
      logger.info(`场景 ${scene.sceneNumber} 开始编辑`);

      const editorOutput = await editor.execute(
        { ...baseContext, inputText: draft },
        model,
        params.onChunk ? (chunk) => params.onChunk!('editor', chunk) : undefined,
      );
      agentOutputs.push(editorOutput);
      params.onAgentComplete?.('editor', editorOutput);
      editedContent = editorOutput.content;
    }

    // --- Reader ---
    const reader = this.agents.get('reader');
    let readerFeedback = '';
    let readerScore: number | undefined;
    if (reader) {
      params.onAgentStart?.('reader');
      logger.info(`场景 ${scene.sceneNumber} 开始评审`);

      const readerOutput = await reader.execute(
        { ...baseContext, inputText: editedContent },
        model,
        params.onChunk ? (chunk) => params.onChunk!('reader', chunk) : undefined,
      );
      agentOutputs.push(readerOutput);
      params.onAgentComplete?.('reader', readerOutput);
      readerFeedback = readerOutput.content;

      // Parse score from reader output (look for a number 0-10)
      const scoreMatch = readerFeedback.match(/(\d+(?:\.\d+)?)\s*[/／]\s*10/);
      if (scoreMatch) {
        const parsed = parseFloat(scoreMatch[1]);
        if (parsed >= 0 && parsed <= 10) readerScore = parsed;
      }
    }

    logger.info(`场景 ${scene.sceneNumber} 生成完成`);

    return {
      sceneNumber: scene.sceneNumber,
      content: editedContent,
      draft,
      editedContent,
      readerFeedback,
      readerScore,
      agentOutputs,
    };
  }

  async generateAllScenes(
    params: {
      novelId: string;
      chapterNumber: number;
      scenes: Scene[];
      fullScenePlan: string;
      userDirection?: string;
      maxWordCount?: number;
      stylePreset?: string;
      styleNotes?: string;
      onChunk?: (agentRole: AgentRole, chunk: string) => void;
      onAgentStart?: (agentRole: AgentRole) => void;
      onAgentComplete?: (agentRole: AgentRole, output: AgentOutput) => void;
    },
    model: ModelClient,
  ): Promise<SceneGenerationResult[]> {
    const results: SceneGenerationResult[] = [];
    let previousSceneContent: string | undefined;

    // Sequential: each scene gets previous scene's content as context
    for (const scene of params.scenes) {
      const result = await this.generateScene(
        {
          novelId: params.novelId,
          chapterNumber: params.chapterNumber,
          scene,
          fullScenePlan: params.fullScenePlan,
          previousSceneContent,
          userDirection: params.userDirection,
          maxWordCount: params.maxWordCount,
          stylePreset: params.stylePreset,
          styleNotes: params.styleNotes,
          onChunk: params.onChunk,
          onAgentStart: params.onAgentStart,
          onAgentComplete: params.onAgentComplete,
        },
        model,
      );
      results.push(result);
      previousSceneContent = result.content;
    }

    return results;
  }
}
