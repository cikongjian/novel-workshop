import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 角色命名大师 Agent
 * 生成多样化、避免模板化的中文角色名
 */
export class NameGeneratorAgent extends BaseAgent {
  readonly role = 'name-generator' as const;
  readonly name = '角色命名大师';
  readonly description = '生成多样化的中文角色名，避免AI模板化名字';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.9, maxTokens: 2048 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('## 任务');
    parts.push('为小说角色生成合适的中文名字，要求多样化、有特色、避免模板化。');
    parts.push('');

    if (context.novelTitle) {
      parts.push('## 小说信息');
      parts.push(`- 标题：${context.novelTitle}`);
      if (context.genre) parts.push(`- 类型：${context.genre}`);
      if (context.novelSynopsis) parts.push(`- 简介：${context.novelSynopsis}`);
      parts.push('');
    }

    if (context.worldContext) {
      parts.push('## 世界观背景');
      parts.push(context.worldContext);
      parts.push('');
    }

    if (context.userDirection) {
      parts.push('## 角色要求');
      parts.push(context.userDirection);
      parts.push('');
    }

    parts.push('请生成符合要求的角色名字，每个名字单独一行，格式：姓名（性别，身份/特点）');
    return parts.join('\n');
  }
}
