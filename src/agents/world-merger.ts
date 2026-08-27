import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 世界观设定专家 Agent
 * 定稿时智能整理世界观设定：分类、去重、合并、过滤
 */
export class WorldMergerAgent extends BaseAgent {
  readonly role = 'world-merger' as const;
  readonly name = '世界观专家';
  readonly description = '智能整理和分类世界观设定，涵盖地理、历史、势力、力量体系、文化、规则';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.3, maxTokens: 8192 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`## 小说信息`);
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push('');

    if (context.chapterNumber != null) {
      parts.push(`## 当前章节：第 ${context.chapterNumber} 章`);
      parts.push('');
    }

    // inputText 包含世界观 Agent 输出 + 正文 + 已有世界观条目
    if (context.inputText) {
      parts.push(context.inputText);
    }

    parts.push('');
    parts.push('请根据以上信息，提取并整理本章的世界观设定，智能合并到已有条目中。');

    return parts.join('\n');
  }
}
