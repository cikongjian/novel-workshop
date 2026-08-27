import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 伏笔编排大师 Agent
 * 根据前文剧情和本章大纲，智能选择最适合在本章自然回收的伏笔
 */
export class ForeshadowingSchedulerAgent extends BaseAgent {
  readonly role = 'foreshadowing-scheduler' as const;
  readonly name = '伏笔编排大师';
  readonly description = '根据剧情上下文智能编排伏笔回收计划';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.3, maxTokens: 4096 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push('');

    if (context.chapterNumber != null) {
      parts.push(`## 即将创作：第 ${context.chapterNumber} 章`);
      parts.push('');
    }

    if (context.inputText) {
      parts.push(context.inputText);
      parts.push('');
    }

    parts.push('请根据以上信息，从伏笔池中挑选最适合在本章自然回收的伏笔。');

    return parts.join('\n');
  }
}
