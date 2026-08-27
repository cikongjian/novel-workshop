import { BaseAgent } from './base-agent.js';
import type { AgentContext } from './types.js';
import type { ModelCallOptions } from '../models/types.js';

/**
 * 标题策划师 Agent
 * 采用「全文→摘要理解→标题」三层思考链，先读懂章节再起标题
 */
export class TitleGeneratorAgent extends BaseAgent {
  readonly role = 'title-generator' as const;
  readonly name = '标题策划师';
  readonly description = '根据章节全文生成吸引读者的标题';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.7, maxTokens: 1024 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const {
      genre = '',
      chapterNumber = 1,
      inputText = '',
      novelTitle = '',
      novelSynopsis = '',
      userDirection = '',
    } = context;

    // 解析输入：fullContent（全文）、recentTitles、previousTitle
    let fullContent = '';
    let previousTitle = '';
    let recentTitles: string[] = [];

    try {
      const parsed = JSON.parse(inputText);
      fullContent = parsed.fullContent || '';
      previousTitle = parsed.previousTitle || '';
      recentTitles = Array.isArray(parsed.recentTitles)
        ? parsed.recentTitles.map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
        : [];
    } catch {
      // 如果不是 JSON，直接作为 fullContent
      fullContent = inputText;
    }

    const parts: string[] = [];

    parts.push(`## 任务信息`);
    parts.push(`- 小说标题：${novelTitle || '未提供'}`);
    parts.push(`- 小说类型：${genre || '未指定'}`);
    parts.push(`- 章节号：第 ${chapterNumber} 章`);

    if (novelSynopsis) {
      parts.push(`\n## 作品简介\n${novelSynopsis}`);
    }

    if (previousTitle) {
      parts.push(`\n## 前一章标题\n${previousTitle}`);
    }

    if (recentTitles.length) {
      parts.push(`\n## 最近几章标题（不要复用句式或节奏）\n${recentTitles.join(' / ')}`);
    }

    if (fullContent) {
      parts.push(`\n## 章节全文\n${fullContent}`);
    }

    if (userDirection) {
      parts.push(`\n## 额外修正要求\n${userDirection}`);
    }

    parts.push(`\n请严格按照三层思考流程（消化章节→发散角度→精选打磨），生成一个追更标题。`);

    return parts.join('\n');
  }
}
