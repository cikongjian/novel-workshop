import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 漫画分镜师（ComicStoryboardDesigner）★ 管线核心
 *
 * 用电影摄影 + 漫画分格专业知识，将剧情点设计为分镜场景。
 * 每个场景含完整画面信息（人物/事件/对话/镜头/构图/视觉描述/prompt草稿），
 * 供作者勾选、prompt 工程师精炼、AI 出图。
 * 输出 ComicScene[] 的 JSON。
 */
export class ComicStoryboardDesignerAgent extends BaseAgent {
  readonly role = 'comic-storyboard-designer' as const;
  readonly name = '漫画分镜师';
  readonly description = '专业分镜设计：镜头/机位/构图/字图搭配';

  protected getModelOptions(): ModelCallOptions {
    // 创意模式：分镜设计需要创造力，中等温度
    return { temperature: 0.7, maxTokens: 8192 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`## 小说信息`);
    parts.push(`- 标题：${context.novelTitle}（${context.genre}）`);
    if (context.chapterNumber != null) {
      parts.push(`- 第 ${context.chapterNumber} 章`);
    }
    parts.push('');

    if (context.characterContext) {
      parts.push(`## 角色档案（用于分镜时把握角色外观、身份与关系）`);
      parts.push(context.characterContext);
      parts.push('');
    }

    if (context.inputText) {
      parts.push(`## 候选剧情点（JSON）`);
      parts.push(context.inputText);
      parts.push('');
    }

    parts.push('请为以上剧情点设计漫画分镜，严格按 JSON 数组格式输出。');
    return parts.join('\n');
  }
}
