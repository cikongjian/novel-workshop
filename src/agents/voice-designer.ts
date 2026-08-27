/**
 * AI 音效师 Agent
 *
 * 根据角色档案（性别、年龄、性格、身份、说话风格等）
 * 为每个角色生成独特的声音描述指令（voice instruct），
 * 用于指导 Qwen3-TTS VoiceDesign 生成角色专属声音。
 *
 * 不参与 ChapterPipeline，通过独立 API 触发（声音设计只需做一次）。
 */

import { BaseAgent } from './base-agent.js';
import type { AgentRole, AgentContext } from './types.js';
import type { ModelCallOptions } from '../models/types.js';

/** 角色信息（传入 context.inputText 作为 JSON） */
export class VoiceDesignerAgent extends BaseAgent {
  readonly role: AgentRole = 'voice-designer';
  readonly name = 'AI 音效师';
  readonly description = '根据角色档案为每个角色设计独特的声音特征描述';

  protected buildUserMessage(context: AgentContext): string {
    // inputText 中包含 JSON 格式的角色档案数据
    if (context.inputText) {
      return context.inputText;
    }

    // Fallback：从 context 构建
    const parts: string[] = [];

    parts.push(`## 小说信息`);
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    if (context.novelSynopsis) {
      parts.push(`- 简介：${context.novelSynopsis}`);
    }

    if (context.characterContext) {
      parts.push('');
      parts.push(`## 角色档案`);
      parts.push(context.characterContext);
    }

    parts.push('');
    parts.push('请为以上每个角色设计声音描述指令，并额外输出一条旁白声音描述。');

    return parts.join('\n');
  }

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.6, maxTokens: 4096 };
  }
}
