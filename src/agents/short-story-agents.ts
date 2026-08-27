import { BaseAgent } from './base-agent.js';
import type { AgentContext, AgentOutput, AgentRole } from './types.js';
import type { ModelClient, StreamCallback } from '../models/types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ShortStoryAgents');

/**
 * 短篇大纲生成 Agent
 * 专门为短篇爽文设计章节大纲，精确控制字数分配
 */
export class ShortStoryOutlineAgent extends BaseAgent {
  readonly role: AgentRole = 'outline';
  readonly name = '短篇大纲生成器';
  readonly description = '为短篇爽文设计章节大纲，精确控制字数分配';

  protected buildUserMessage(context: AgentContext): string {
    // 用户消息已在 pipeline 中构建
    return context.inputText || '';
  }

  async execute(
    context: AgentContext,
    model: ModelClient,
    onChunk?: StreamCallback,
    signal?: AbortSignal
  ): Promise<AgentOutput> {
    logger.info(`生成短篇第 ${context.chapterNumber} 章大纲`);
    return await super.execute(context, model, onChunk, signal);
  }
}

/**
 * 短篇写手 Agent
 * 专门撰写快节奏、对话密集、爽点频繁的短篇爽文
 */
export class ShortStoryWriterAgent extends BaseAgent {
  readonly role: AgentRole = 'writer';
  readonly name = '短篇写手';
  readonly description = '撰写快节奏、对话密集、爽点频繁的短篇爽文';

  protected buildUserMessage(context: AgentContext): string {
    return context.inputText || '';
  }

  async execute(
    context: AgentContext,
    model: ModelClient,
    onChunk?: StreamCallback,
    signal?: AbortSignal
  ): Promise<AgentOutput> {
    logger.info(`生成短篇第 ${context.chapterNumber} 章初稿`);
    return await super.execute(context, model, onChunk, signal);
  }
}

/**
 * 短篇编辑 Agent
 * 专门润色短篇爽文，保留爽点、控制字数、强化钩子
 */
export class ShortStoryEditorAgent extends BaseAgent {
  readonly role: AgentRole = 'editor';
  readonly name = '短篇编辑';
  readonly description = '润色短篇爽文，保留爽点、控制字数、强化钩子';

  protected buildUserMessage(context: AgentContext): string {
    return context.inputText || '';
  }

  async execute(
    context: AgentContext,
    model: ModelClient,
    onChunk?: StreamCallback,
    signal?: AbortSignal
  ): Promise<AgentOutput> {
    logger.info(`润色短篇第 ${context.chapterNumber} 章`);
    return await super.execute(context, model, onChunk, signal);
  }
}
