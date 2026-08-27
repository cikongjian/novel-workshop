import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 大纲生成师 Agent
 * 根据小说简介、类型和目标章节数生成完整的结构化大纲。
 */
export class OutlineGeneratorAgent extends BaseAgent {
  readonly role = 'outline-generator' as const;
  readonly name = '大纲生成师';
  readonly description = '根据简介与类型生成完整小说大纲，包含章节规划、剧情线和伏笔布局';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.7, maxTokens: 8192 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push(`- 简介：${context.novelSynopsis}`);
    parts.push('');

    if (context.worldContext) {
      parts.push('## 世界观设定');
      parts.push(context.worldContext);
      parts.push('');
    }

    if (context.characterContext) {
      parts.push('## 角色设定');
      parts.push(context.characterContext);
      parts.push('');
    }

    if (context.userDirection) {
      parts.push('## 用户指示');
      parts.push(context.userDirection);
      parts.push('');
    }

    parts.push('请根据以上信息生成完整的小说大纲 JSON，不要输出额外解释。');
    return parts.join('\n');
  }
}
