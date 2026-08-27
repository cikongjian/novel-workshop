import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 角色朋友圈 Agent
 * 以角色本人的语气生成朋友圈动态和评论，让角色在社交流里"活"起来。
 */
export class CharacterMomentsAgent extends BaseAgent {
  readonly role = 'character-moments' as const;
  readonly name = '角色朋友圈';
  readonly description = '以角色语气生成朋友圈动态与互评，强化 IP 社交感';

  protected getModelOptions(_context?: AgentContext) {
    return { temperature: 0.9, maxTokens: 300 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`## 作品信息`);
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    if (context.novelSynopsis) {
      parts.push(`- 简介：${context.novelSynopsis}`);
    }
    parts.push('');

    if (context.characterContext) {
      parts.push(`## 角色档案`);
      parts.push(context.characterContext);
      parts.push('');
    }

    if (context.worldContext) {
      parts.push(`## 世界观背景`);
      parts.push(context.worldContext);
      parts.push('');
    }

    if (context.userDirection) {
      parts.push(`## 本次任务`);
      parts.push(context.userDirection);
      parts.push('');
    }

    return parts.join('\n');
  }
}
