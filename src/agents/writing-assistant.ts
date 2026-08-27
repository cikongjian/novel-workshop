import { BaseAgent } from './base-agent.js';
import type { AgentRole, AgentContext } from './types.js';
import type { ModelCallOptions } from '../models/types.js';

export class WritingAssistantAgent extends BaseAgent {
  readonly role: AgentRole = 'writing-assistant';
  readonly name = '写作助手';
  readonly description = '实时检查语法风格、上下文补全、情节冲突检测';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.3, maxTokens: 4096 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const direction = context.userDirection ?? 'check';
    const parts: string[] = [];

    parts.push(`## 检查模式: ${direction}`);

    if (context.inputText) {
      parts.push(`## 当前文本\n${context.inputText}`);
    }

    if (context.previousChapterSummary) {
      parts.push(`## 前文摘要\n${context.previousChapterSummary}`);
    }

    if (context.characterContext) {
      parts.push(`## 角色信息\n${context.characterContext}`);
    }

    if (context.worldContext) {
      parts.push(`## 世界观设定\n${context.worldContext}`);
    }

    return parts.join('\n\n');
  }
}
