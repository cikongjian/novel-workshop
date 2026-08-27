import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

export class FactionCultureArchitectAgent extends BaseAgent {
  readonly role = 'faction-culture-architect' as const;
  readonly name = '势力文化架构师';
  readonly description = '梳理势力派系的价值观、仪式、禁忌与行为规范';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.22, maxTokens: 8192 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push(`- 简介：${context.novelSynopsis}`);
    parts.push('');

    if (context.chapterNumber != null) {
      parts.push('## 当前进度');
      parts.push(`- 当前章节：第 ${context.chapterNumber} 章`);
      parts.push('');
    }

    if (context.inputText) {
      parts.push(context.inputText);
      parts.push('');
    }

    parts.push('请输出可直接落库的势力条目 JSON，不要输出额外解释。');
    return parts.join('\n');
  }
}
