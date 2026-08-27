import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 世界构建师 Agent
 * 负责维护世界观一致性，为章节提供准确的世界设定细节
 */
export class WorldBuilderAgent extends BaseAgent {
  readonly role = 'world-builder' as const;
  readonly name = '世界构建师';
  readonly description = '维护世界观一致性，为章节提供准确的世界设定细节';

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

    if (context.worldContext) {
      parts.push(`## 已有世界观设定`);
      parts.push(context.worldContext);
      parts.push('');
    }

    if (context.worldContract) {
      parts.push('## 世界观契约（本章约束）');
      parts.push(context.worldContract);
      parts.push('');
    }

    if (context.previousChapterSummary) {
      parts.push(`## 前文摘要`);
      parts.push(context.previousChapterSummary);
      parts.push('');
    }

    parts.push('请根据以上信息，提供本章节所需的世界观细节。');

    return parts.join('\n');
  }
}
