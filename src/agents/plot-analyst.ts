import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 剧情分析师 Agent
 * 定稿时跟踪情节线索、识别和回收伏笔、发现冲突点
 */
export class PlotAnalystAgent extends BaseAgent {
  readonly role = 'plot-analyst' as const;
  readonly name = '剧情分析师';
  readonly description = '跟踪情节线索和伏笔，分析冲突点和叙事脉络';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.3, maxTokens: 8192 };
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

    // inputText 包含大纲 Agent 输出 + 正文 + 已有大纲数据
    if (context.inputText) {
      parts.push(context.inputText);
    }

    parts.push('');
    parts.push('请根据以上信息，分析本章的情节发展，跟踪伏笔和情节线索。');

    return parts.join('\n');
  }
}
