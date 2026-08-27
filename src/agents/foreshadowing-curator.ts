import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 伏笔梳理师 Agent
 * 对伏笔池进行去重、回收状态修正和优先级梳理，输出结构化结果。
 */
export class ForeshadowingCuratorAgent extends BaseAgent {
  readonly role = 'foreshadowing-curator' as const;
  readonly name = '伏笔梳理师';
  readonly description = '清洗伏笔池，减少重复并校准回收状态';

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
      parts.push(`## 当前进度`);
      parts.push(`- 当前章节：第 ${context.chapterNumber} 章`);
      parts.push('');
    }

    if (context.inputText) {
      parts.push(context.inputText);
      parts.push('');
    }

    parts.push('请输出可直接落库的伏笔清单 JSON，不要输出额外解释。');
    return parts.join('\n');
  }
}

