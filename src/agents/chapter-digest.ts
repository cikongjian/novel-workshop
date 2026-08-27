import { BaseAgent } from './base-agent.js';
import type { AgentContext } from './types.js';
import type { ModelCallOptions } from '../models/types.js';

export class ChapterDigestAgent extends BaseAgent {
  readonly role = 'chapter-digest' as const;
  readonly name = '章节摘要师';
  readonly description = '生成章节结构化摘要，提取关键事件、角色状态变化和因果链';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.3, maxTokens: 2048 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    if (context.chapterNumber) {
      parts.push(`- 当前章节：第 ${context.chapterNumber} 章`);
    }
    parts.push('');

    if (context.outlineContext) {
      parts.push('## 本章大纲');
      parts.push(context.outlineContext);
      parts.push('');
    }

    if (context.characterContext) {
      parts.push('## 已知角色');
      parts.push(context.characterContext.slice(0, 2000));
      parts.push('');
    }

    if (context.previousChapterSummary) {
      parts.push('## 前文摘要');
      parts.push(context.previousChapterSummary.slice(0, 1000));
      parts.push('');
    }

    parts.push('## 章节正文');
    parts.push(context.inputText ?? '');

    return parts.join('\n');
  }
}
