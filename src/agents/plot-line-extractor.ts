import { BaseAgent } from './base-agent.js';
import type { AgentContext } from './types.js';
import type { ModelCallOptions } from '../models/types.js';

/**
 * 主线提取 Agent
 *
 * 分析一批章节，提取主线骨架（关键事件、角色弧线、伏笔、世界观规则、质量问题）。
 * 输出 JSON，供 BatchRevisionPipeline 使用。
 */
export class PlotLineExtractorAgent extends BaseAgent {
  readonly role = 'plot-line-extractor' as const;
  readonly name = '主线提取师';
  readonly description = '从多章节中提取故事主线骨架，为批量修订提供约束';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.3, maxTokens: 8000 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`## 小说信息`);
    parts.push(`- 书名：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push(`- 简介：${context.novelSynopsis}`);
    parts.push('');

    if (context.characterContext) {
      parts.push(`## 角色档案`);
      parts.push(context.characterContext);
      parts.push('');
    }

    if (context.worldContext) {
      parts.push(`## 世界观设定`);
      parts.push(context.worldContext);
      parts.push('');
    }

    if (context.outlineContext) {
      parts.push(`## 大纲`);
      parts.push(context.outlineContext);
      parts.push('');
    }

    // inputText 里放的是多章内容拼接
    if (context.inputText) {
      parts.push(`## 待分析章节内容`);
      parts.push(context.inputText);
      parts.push('');
    }

    if (context.userDirection) {
      parts.push(`## 用户补充说明`);
      parts.push(context.userDirection);
      parts.push('');
    }

    parts.push('请分析以上章节，按系统提示词要求的 JSON 格式输出主线骨架。');

    return parts.join('\n');
  }
}
