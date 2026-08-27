import { BaseAgent } from './base-agent.js';
import type { AgentContext } from './types.js';
import type { ModelCallOptions } from '../models/types.js';

export class ArcSummaryAgent extends BaseAgent {
  readonly role = 'arc-summary' as const;
  readonly name = '弧线摘要师';
  readonly description = '从多章摘要中提炼弧线级叙事脉络，涵盖剧情推进、角色弧线、世界变化和悬念追踪';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.3, maxTokens: 2048 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    if (context.novelSynopsis) {
      parts.push(`- 简介：${context.novelSynopsis.slice(0, 500)}`);
    }
    parts.push('');

    if (context.userDirection) {
      parts.push('## 弧线信息');
      parts.push(context.userDirection);
      parts.push('');
    }

    if (context.characterContext) {
      parts.push('## 已知主要角色');
      parts.push(context.characterContext.slice(0, 2000));
      parts.push('');
    }

    parts.push('## 章节摘要数据');
    parts.push(context.inputText ?? '');

    return parts.join('\n');
  }
}
