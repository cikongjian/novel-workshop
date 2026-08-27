import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 文化设定梳理师 Agent
 * 负责清洗 world.category=culture 条目，去重并补全可执行描述。
 */
export class CultureCuratorAgent extends BaseAgent {
  readonly role = 'culture-curator' as const;
  readonly name = '文化设定梳理师';
  readonly description = '清洗文化类世界观条目，减少重复并补全约束描述';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.2, maxTokens: 8192 };
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

    parts.push('请输出可直接落库的文化条目 JSON，不要输出额外解释。');
    return parts.join('\n');
  }
}

