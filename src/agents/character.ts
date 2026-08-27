import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 角色塑造师 Agent
 * 确保每个出场角色的言行与其性格档案一致，提供具体的行为指引
 */
export class CharacterAgent extends BaseAgent {
  readonly role = 'character' as const;
  readonly name = '角色塑造师';
  readonly description = '确保角色言行一致性，提供对话风格和情绪状态建议';

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`## 小说信息`);
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push(`- 简介：${context.novelSynopsis}`);
    parts.push('');

    if (context.chapterNumber != null) {
      parts.push(`## 当前章节`);
      parts.push(`第 ${context.chapterNumber} 章`);
      parts.push('');
    }

    if (context.userDirection) {
      parts.push(`## 章节方向`);
      parts.push(context.userDirection);
      parts.push('');
    }

    if (context.outlineContext) {
      parts.push(`## 章节大纲`);
      parts.push(context.outlineContext);
      parts.push('');
    }

    if (context.characterContext) {
      parts.push(`## 角色档案`);
      parts.push(context.characterContext);
      parts.push('');
    }

    if (context.worldContract) {
      parts.push('## 世界观契约（用于约束角色决策边界）');
      parts.push(context.worldContract);
      parts.push('');
    }

    if (context.previousChapterSummary) {
      parts.push(`## 前文摘要`);
      parts.push(context.previousChapterSummary);
      parts.push('');
    }

    if (context.characterEventContext) {
      parts.push('## 角色经历时间线');
      parts.push(context.characterEventContext);
      parts.push('');
    }

    parts.push('请根据以上信息，为本章出场的每个角色提供具体的行为指引。');

    return parts.join('\n');
  }
}
