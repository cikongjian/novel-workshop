import { BaseAgent } from './base-agent.js';
import type { AgentContext } from './types.js';
import type { ModelCallOptions } from '../models/types.js';

/**
 * 批量修订 Agent
 *
 * 在主线骨架约束下重写单个章节。
 * 由 BatchRevisionPipeline 顺序调用，每次传入：
 *   - 主线骨架 JSON（worldContext 字段）
 *   - 原章节内容（inputText 字段）
 *   - 前一章修订后内容（previousChapterSummary 字段）
 *   - 修订指令（userDirection 字段）
 */
export class BatchReviserAgent extends BaseAgent {
  readonly role = 'batch-reviser' as const;
  readonly name = '批量修订师';
  readonly description = '在保持主线不变的前提下深度修订章节';

  protected getModelOptions(): ModelCallOptions {
    return {
      temperature: 0.7,
      maxTokens: 8192,
    };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`## 小说信息`);
    parts.push(`- 书名：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push(`- 简介：${context.novelSynopsis}`);
    parts.push(`- 当前章节：第${context.chapterNumber}章`);
    parts.push('');

    if (context.characterContext) {
      parts.push(`## 角色档案`);
      parts.push(context.characterContext);
      parts.push('');
    }

    // worldContext 里放主线骨架 JSON
    if (context.worldContext) {
      parts.push(`## 主线骨架（必须遵守）`);
      parts.push(context.worldContext);
      parts.push('');
    }

    // 前一章修订后的内容（保持衔接）
    if (context.previousChapterSummary) {
      parts.push(`## 前一章内容（修订后版本，请自然衔接）`);
      parts.push(context.previousChapterSummary);
      parts.push('');
    }

    // 大纲中本章的规划
    if (context.outlineContext) {
      parts.push(`## 本章大纲`);
      parts.push(context.outlineContext);
      parts.push('');
    }

    // 原章节内容
    if (context.inputText) {
      parts.push(`## 原章节内容（需要修订）`);
      parts.push(context.inputText);
      parts.push('');
    }

    // 修订指令
    if (context.userDirection) {
      parts.push(`## 修订指令`);
      parts.push(context.userDirection);
      parts.push('');
    }

    if (context.styleGuide) {
      parts.push(`## 风格指南`);
      parts.push(context.styleGuide);
      parts.push('');
    }

    parts.push('请根据以上信息，重写本章。直接输出正文，不要输出任何解释。');

    return parts.join('\n');
  }
}
