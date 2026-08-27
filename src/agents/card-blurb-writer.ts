import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 卡牌标签写手 Agent
 * 为角色生成一句读者友好、有画面感的卡牌封面标签（20 字内）
 * 在定稿管线中 character-merger 之后运行
 */
export class CardBlurbWriterAgent extends BaseAgent {
  readonly role = 'card-blurb-writer' as const;
  readonly name = '卡牌标签写手';
  readonly description = '为角色卡牌生成读者友好的状态标签';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.7, maxTokens: 512 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`## 小说信息`);
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push('');

    if (context.chapterNumber != null) {
      parts.push(`## 当前章节：第 ${context.chapterNumber} 章`);
      parts.push('');
    }

    if (context.inputText) {
      parts.push(context.inputText);
    }

    parts.push('');
    parts.push('请为每位角色生成一句卡牌标签。');

    return parts.join('\n');
  }
}
