import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 书名推荐师 Agent
 * 根据小说已有内容（章节、角色、世界观、大纲）推荐适合网文平台的书名和作品简介。
 */
export class BookTitleRecommenderAgent extends BaseAgent {
  readonly role = 'book-title-recommender' as const;
  readonly name = '书名推荐师';
  readonly description = '根据小说内容为起点中文网和番茄小说等平台推荐书名和简介';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.85, maxTokens: 4096 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('## 小说信息');
    parts.push(`- 当前标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    if (context.novelSynopsis) {
      parts.push(`- 当前简介：${context.novelSynopsis}`);
    }
    parts.push('');

    if (context.characterContext) {
      parts.push('## 角色档案');
      parts.push(context.characterContext);
      parts.push('');
    }

    if (context.worldContext) {
      parts.push('## 世界观设定');
      parts.push(context.worldContext);
      parts.push('');
    }

    if (context.outlineContext) {
      parts.push('## 大纲概要');
      parts.push(context.outlineContext);
      parts.push('');
    }

    if (context.inputText) {
      parts.push('## 已更新章节概要');
      parts.push(context.inputText);
      parts.push('');
    }

    if (context.userDirection) {
      parts.push('## 用户额外要求');
      parts.push(context.userDirection);
      parts.push('');
    }

    parts.push('请根据以上信息生成书名和简介推荐 JSON，不要输出额外解释。');
    return parts.join('\n');
  }
}
