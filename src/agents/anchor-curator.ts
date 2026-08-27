import { BaseAgent } from './base-agent.js';
import type { AgentRole, AgentContext } from './types.js';

/**
 * 宇宙锚点策展师
 * 分析完结小说，提取跨书共享的角色池、世界基底和伏笔
 */
export class AnchorCuratorAgent extends BaseAgent {
  readonly role = 'anchor-curator' as AgentRole;
  readonly name = '宇宙锚点策展师';
  readonly description = '分析完结小说，策展跨书共享的角色、世界观和伏笔';

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`# 小说信息`);
    parts.push(`标题：${context.novelTitle}`);
    parts.push(`类型：${context.genre}`);
    if (context.novelSynopsis) {
      parts.push(`简介：${context.novelSynopsis}`);
    }
    parts.push('');

    if (context.worldContext) {
      parts.push('# 世界观设定');
      parts.push(context.worldContext);
      parts.push('');
    }

    if (context.characterContext) {
      parts.push('# 角色档案');
      parts.push(context.characterContext);
      parts.push('');
    }

    if (context.outlineContext) {
      parts.push('# 大纲与情节线');
      parts.push(context.outlineContext);
      parts.push('');
    }

    if (context.previousChapterSummary) {
      parts.push('# 章节摘要');
      parts.push(context.previousChapterSummary);
      parts.push('');
    }

    parts.push('请根据以上信息，按照系统提示词的要求输出 JSON。');
    return parts.join('\n');
  }

  protected getModelOptions() {
    return { temperature: 0.3, maxTokens: 8192 };
  }
}
