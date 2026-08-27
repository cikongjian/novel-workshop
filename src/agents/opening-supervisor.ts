import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

const PLATFORM_LABELS: Record<NonNullable<AgentContext['startupPlatformProfile']>, string> = {
  auto: '自动',
  fanqie: '番茄小说',
  qidian: '起点中文网',
};

export class OpeningSupervisorAgent extends BaseAgent {
  readonly role = 'opening-supervisor' as const;
  readonly name = '开篇三章总监';
  readonly description = '专盯第 1-3 章的开头钩子、留存节奏和平台适配';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.35, maxTokens: 1200 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];
    const platform = PLATFORM_LABELS[context.startupPlatformProfile ?? 'auto'];

    parts.push('## 任务');
    parts.push('你只负责优化第 1-3 章的冷启动表现，不负责全文重写。');
    parts.push(`- 当前章节：第 ${context.chapterNumber ?? 1} 章`);
    parts.push(`- 目标平台范式：${platform}`);
    parts.push(`- 书名：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push('');

    if (context.novelSynopsis) {
      parts.push('## 作品简介');
      parts.push(context.novelSynopsis);
      parts.push('');
    }

    if (context.promiseContractSummary) {
      parts.push('## 题材承诺合同');
      parts.push(context.promiseContractSummary);
      if (context.promiseOpeningHints) parts.push(context.promiseOpeningHints);
      if (context.promisePayoffHints) parts.push(context.promisePayoffHints);
      if (context.promiseAntiDriftHints) parts.push(context.promiseAntiDriftHints);
      parts.push('');
    }

    if (context.chapterPromiseCard) {
      parts.push(context.chapterPromiseCard);
      parts.push('');
    }

    if (context.userDirection) {
      parts.push('## 用户当前方向');
      parts.push(context.userDirection);
      parts.push('');
    }

    if (context.startupOpeningStrategyBrief) {
      parts.push(context.startupOpeningStrategyBrief);
      parts.push('');
    }

    if (context.outlineContext) {
      parts.push('## 本章大纲');
      parts.push(context.outlineContext);
      parts.push('');
    }

    if (context.scenePlan) {
      parts.push('## 场景执行卡');
      parts.push(context.scenePlan);
      parts.push('');
    }

    if (context.previousChapterSummary) {
      parts.push('## 前文回顾');
      parts.push(context.previousChapterSummary.slice(0, 1200));
      parts.push('');
    }

    parts.push('## 输出要求');
    parts.push('- 输出 4-6 条极短执行指令，只写可落地动作。');
    parts.push('- 优先关注：首屏冲突、主角目标、首次回报、章末钩子、平台适配。');
    parts.push('- 每条以 `- ` 开头。');
    parts.push('- 不要复述剧情，不要写长分析，不要输出 JSON。');

    return parts.join('\n');
  }
}
