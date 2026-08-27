import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 剧情探索师 Agent
 * 基于当前剧情进展生成 2-3 条可选剧情走向，并预测后续影响。
 */
export class PlotExplorerAgent extends BaseAgent {
  readonly role = 'plot-explorer' as const;
  readonly name = '剧情探索师';
  readonly description = '生成多条可选剧情走向并预测后续影响';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.9, maxTokens: 8192 };
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

    if (context.outlineContext) {
      parts.push('## 大纲');
      parts.push(context.outlineContext);
      parts.push('');
    }

    if (context.previousChapterSummary) {
      parts.push('## 前文摘要');
      parts.push(context.previousChapterSummary);
      parts.push('');
    }

    if (context.characterContext) {
      parts.push('## 角色档案');
      parts.push(context.characterContext);
      parts.push('');
    }

    if (context.worldContext) {
      parts.push('## 世界观设定');
      parts.push(context.worldContext);
      parts.push('');
    }

    if (context.unresolvedForeshadowing) {
      parts.push('## 未回收伏笔');
      parts.push(context.unresolvedForeshadowing);
      parts.push('');
    }

    parts.push('请生成 2-3 条可选剧情走向，输出 JSON 结果，不要输出额外解释。');
    return parts.join('\n');
  }
}
