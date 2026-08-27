import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

export class HistoryCuratorAgent extends BaseAgent {
  readonly role = 'history-curator' as const;
  readonly name = '历史线梳理师';
  readonly description = '按时间线梳理历史事件，统一纪年并补齐冲突/后果约束';

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

    parts.push('请输出可直接落库的历史条目 JSON，不要输出额外解释。');
    return parts.join('\n');
  }
}

