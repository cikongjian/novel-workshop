import { BaseAgent } from './base-agent.js';
import type { AgentContext } from './types.js';
import type { ModelCallOptions } from '../models/types.js';

/**
 * 蓝本提取 Agent
 *
 * 从已有小说中提炼核心创作蓝本（世界观、角色、大纲、剧情线），
 * 供 RebirthPipeline 用于从零重新创作。
 */
export class NovelBlueprintExtractorAgent extends BaseAgent {
  readonly role = 'novel-blueprint-extractor' as const;
  readonly name = '蓝本提取师';
  readonly description = '从已有小说中提炼核心创作蓝本';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.3, maxTokens: 8192 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`## 小说信息`);
    parts.push(`- 书名：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push(`- 简介：${context.novelSynopsis}`);
    parts.push('');

    if (context.characterContext) {
      parts.push(`## 现有角色档案`);
      parts.push(context.characterContext);
      parts.push('');
    }

    if (context.worldContext) {
      parts.push(`## 现有世界观设定`);
      parts.push(context.worldContext);
      parts.push('');
    }

    if (context.outlineContext) {
      parts.push(`## 现有大纲`);
      parts.push(context.outlineContext);
      parts.push('');
    }

    if (context.inputText) {
      parts.push(`## 全部章节内容`);
      parts.push(context.inputText);
      parts.push('');
    }

    if (context.userDirection) {
      parts.push(`## 用户对重写的要求`);
      parts.push(context.userDirection);
      parts.push('');
    }

    parts.push('请分析以上内容，按系统提示词要求的 JSON 格式输出创作蓝本。');

    return parts.join('\n');
  }
}
