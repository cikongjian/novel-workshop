import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 漫画剧情挖掘师（ComicBeatExtractor）
 *
 * 分析章节正文，提炼最适合漫画化的剧情点（高潮/转折/名场面），
 * 评估每个剧情点的情绪强度与视觉潜力，供分镜师设计分镜。
 * 输出 ComicBeat[] 的 JSON。
 */
export class ComicBeatExtractorAgent extends BaseAgent {
  readonly role = 'comic-beat-extractor' as const;
  readonly name = '漫画剧情挖掘师';
  readonly description = '从章节中提炼具备视觉表现力的漫画剧情点';

  protected getModelOptions(): ModelCallOptions {
    // 聚焦模式：剧情点筛选需要稳定判断，低温度
    return { temperature: 0.5, maxTokens: 4096 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`## 小说信息`);
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    if (context.chapterNumber != null) {
      parts.push(`- 第 ${context.chapterNumber} 章`);
    }
    parts.push('');

    if (context.characters?.length) {
      parts.push(`## 本章角色`);
      parts.push(context.characters.map((c) => c.name).join('、'));
      parts.push('');
    }

    if (context.inputText) {
      parts.push(`## 章节正文`);
      parts.push(context.inputText);
      parts.push('');
    }

    parts.push('请分析以上章节，提炼 6-8 个最适合漫画化的剧情点，严格按 JSON 数组格式输出。');
    return parts.join('\n');
  }
}
