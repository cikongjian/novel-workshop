import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 营销文案师 Agent
 * 根据小说内容生成营销物料：标题、简介、角色卡、社交媒体文案等。
 */
export class MarketingWriterAgent extends BaseAgent {
  readonly role = 'marketing-writer' as const;
  readonly name = '营销文案师';
  readonly description = '根据小说内容生成营销物料，包括标题、简介、角色卡和社交文案';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.8, maxTokens: 4096 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push(`- 简介：${context.novelSynopsis}`);
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

    if (context.userDirection) {
      parts.push('## 生成要求');
      parts.push(context.userDirection);
      parts.push('');
    }

    parts.push('请根据以上信息生成营销物料 JSON，不要输出额外解释。');
    return parts.join('\n');
  }
}
