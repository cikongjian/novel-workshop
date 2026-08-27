import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 角色档案专家 Agent
 * 定稿时智能合并角色信息：更新已有角色、创建新角色、保持状态连续性
 */
export class CharacterMergerAgent extends BaseAgent {
  readonly role = 'character-merger' as const;
  readonly name = '角色档案专家';
  readonly description = '智能合并和整理角色档案，保持角色发展的连续性';

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

    // inputText 包含角色 Agent 输出 + 正文 + 已有角色档案
    if (context.inputText) {
      parts.push(context.inputText);
    }

    // 智能取名系统：注入命名避让名单，防止创建新角色时用 AI 模板名或重名
    if (context.namingConstraints) {
      parts.push('');
      parts.push(context.namingConstraints);
    }

    parts.push('');
    parts.push('请根据以上信息，分析本章角色表现，智能合并角色档案。创建新角色时，务必先检查命名避让清单，确保名字不在黑名单或避让名单中。');

    return parts.join('\n');
  }
}
