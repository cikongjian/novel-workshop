import type { ModelClient, StreamCallback } from '../models/types.js';
import type { NovelAgent, AgentRole, AgentContext, AgentOutput } from '../agents/types.js';
import type {
  RevisionResult,
  EventEmitter,
  PipelineNovelManager,
} from './types.js';
import { ChapterPipeline } from './chapter-pipeline.js';
import { compareAiMarkerCount } from './rewrite-regression-guard.js';
import type { GenreTraceOverrides } from './ai-trace-detector.js';

/**
 * 修订管线
 *
 * 用户提供反馈后，仅重跑 Writer -> Editor -> Reader 三个 Agent。
 * 复用之前生成的大纲、世界观、角色等上下文。
 */
export class RevisionPipeline {
  constructor(
    private agents: Map<AgentRole, NovelAgent>,
    _novelManager: PipelineNovelManager,
    private model: ModelClient,
  ) {}

  async reviseChapter(params: {
    novelId: string;
    chapterNumber: number;
    feedback: string;
    originalContext: AgentContext;
    previousContent: string;
    onEvent?: EventEmitter;
    /** 覆盖默认的修订结尾指令（默认："请根据用户的修改意见，在保持原文优点的基础上进行修订。"） */
    directionSuffix?: string;
    modelOverride?: ModelClient;
    /** 启用 AI 标记守卫（默认 false） */
    enableAiMarkerGuard?: boolean;
    /** AI 标记守卫阈值（分数下降超过此值则拒绝修订，默认 5） */
    aiMarkerGuardThreshold?: number;
    /** 题材特定的 AI 痕迹规则覆盖 */
    genreOverrides?: GenreTraceOverrides;
    /** 修订模式：rewrite=全文润色，spot-fix=只改问题句（默认 rewrite） */
    mode?: 'rewrite' | 'spot-fix';
  }): Promise<RevisionResult> {
    const { novelId, chapterNumber, feedback, originalContext, previousContent, onEvent, directionSuffix, modelOverride } = params;
    const activeModel = modelOverride ?? this.model;
    const allOutputs: AgentOutput[] = [];

    // 运行单个 Agent 的辅助函数
    const runAgent = async (
      role: AgentRole,
      ctx: AgentContext,
    ): Promise<AgentOutput> => {
      const agent = this.agents.get(role);
      if (!agent) {
        throw new Error(`Agent "${role}" 未注册`);
      }

      onEvent?.({
        type: 'agent:start',
        agentRole: role,
        novelId,
        chapterNumber,
        data: '',
        timestamp: new Date().toISOString(),
      });

      const streamCallback: StreamCallback | undefined = onEvent
        ? (chunk: string) => {
            onEvent({
              type: 'agent:chunk',
              agentRole: role,
              novelId,
              chapterNumber,
              data: chunk,
              timestamp: new Date().toISOString(),
            });
          }
        : undefined;

      let output: AgentOutput;
      try {
        output = await agent.execute(ctx, activeModel, streamCallback);
      } catch (error) {
        onEvent?.({
          type: 'agent:error',
          agentRole: role,
          novelId,
          chapterNumber,
          data: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        throw error;
      }

      onEvent?.({
        type: 'agent:complete',
        agentRole: role,
        novelId,
        chapterNumber,
        data: output.content,
        timestamp: new Date().toISOString(),
        usage: typeof output.metadata?.inputTokens === 'number'
          ? {
              inputTokens: output.metadata.inputTokens as number,
              outputTokens: output.metadata.outputTokens as number,
              provider: String(output.metadata.provider ?? ''),
              model: String(output.metadata.model ?? ''),
            }
          : undefined,
      });

      allOutputs.push(output);
      return output;
    };

    // === Writer：基于反馈重写 ===
    // 将原文和用户反馈一起传给 Writer
    const writerContext: AgentContext = {
      ...originalContext,
      userDirection: this.buildRevisionDirection(
        originalContext.userDirection ?? '',
        feedback,
        previousContent,
        directionSuffix,
      ),
    };
    const writerOutput = await runAgent('writer', writerContext);

    // === Editor：润色修订后的内容 ===
    const editorContext: AgentContext = {
      ...originalContext,
      inputText: writerOutput.content,
      spotFixMode: params.mode === 'spot-fix',
    };
    const editorOutput = await runAgent('editor', editorContext);

    // 解析编辑输出：分离润色正文和修改说明
    const { polishedText } = ChapterPipeline.parseEditorOutput(editorOutput.content);

    // === AI 标记守卫：检测修订是否引入更多 AI 痕迹 ===
    let aiMarkerGuardResult: RevisionResult['aiMarkerGuard'] | undefined;
    if (params.enableAiMarkerGuard) {
      const threshold = params.aiMarkerGuardThreshold ?? 5;
      const comparison = compareAiMarkerCount({
        beforeText: previousContent,
        afterText: polishedText,
        genreOverrides: params.genreOverrides,
      });

      const rejected = comparison.increased && Math.abs(comparison.delta) > threshold;

      aiMarkerGuardResult = {
        beforeScore: comparison.beforeScore,
        afterScore: comparison.afterScore,
        delta: comparison.delta,
        rejected,
        reason: rejected
          ? `修订被拒绝：AI 标记分数下降 ${Math.abs(comparison.delta).toFixed(1)} 分（超过阈值 ${threshold}），从 ${comparison.beforeScore.toFixed(1)} 降至 ${comparison.afterScore.toFixed(1)}`
          : comparison.summary,
      };

      // 如果守卫拒绝修订，直接返回原文
      if (rejected) {
        onEvent?.({
          type: 'agent:error',
          agentRole: 'editor',
          novelId,
          chapterNumber,
          data: aiMarkerGuardResult.reason ?? '',
          timestamp: new Date().toISOString(),
        });

        return {
          revisedContent: previousContent,
          editedContent: editorOutput.content,
          readerFeedback: '修订被 AI 标记守卫拒绝，保留原文',
          agentOutputs: allOutputs,
          aiMarkerGuard: aiMarkerGuardResult,
        };
      }
    }

    // === Reader：评价修订后的内容 ===
    const readerContext: AgentContext = {
      novelId: originalContext.novelId,
      genre: originalContext.genre,
      novelTitle: originalContext.novelTitle,
      novelSynopsis: originalContext.novelSynopsis,
      chapterNumber,
      inputText: polishedText,
    };
    const readerOutput = await runAgent('reader', readerContext);

    return {
      revisedContent: polishedText,
      editedContent: editorOutput.content,
      readerFeedback: readerOutput.content,
      agentOutputs: allOutputs,
      aiMarkerGuard: aiMarkerGuardResult,
    };
  }

  /**
   * 构建修订方向：将原始方向、用户反馈和原文组合
   */
  private buildRevisionDirection(
    originalDirection: string,
    feedback: string,
    previousContent: string,
    directionSuffix?: string,
  ): string {
    const parts: string[] = [];

    if (originalDirection) {
      parts.push(`## 原始方向`);
      parts.push(originalDirection);
      parts.push('');
    }

    parts.push(`## 上一版本内容`);
    parts.push(previousContent);
    parts.push('');

    parts.push(`## 用户修改意见`);
    parts.push(feedback);
    parts.push('');

    parts.push(directionSuffix ?? '请根据用户的修改意见，在保持原文优点的基础上进行修订。');

    return parts.join('\n');
  }
}
