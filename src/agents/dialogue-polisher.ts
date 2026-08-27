import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 对话打磨师 Agent
 * 检测并优化角色对话一致性，解决"千人一面"问题。
 */
export class DialoguePolisherAgent extends BaseAgent {
  readonly role = 'dialogue-polisher' as const;
  readonly name = '对话打磨师';
  readonly description = '检测并优化角色对话一致性，解决千人一面问题';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.5, maxTokens: 8192 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push('');

    if (context.characterContext) {
      parts.push('## 角色档案');
      parts.push(context.characterContext);
      parts.push('');
    }

    if (context.dialogueTargetCharacters) {
      parts.push('## 重点关注角色');
      parts.push(context.dialogueTargetCharacters);
      parts.push('');
    }

    if (context.inputText) {
      parts.push('## 待打磨章节内容');
      parts.push(context.inputText);
      parts.push('');
    }

    parts.push('请分析对话质量并输出 JSON 结果，不要输出额外解释。');
    return parts.join('\n');
  }
}
