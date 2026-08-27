import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 读者 Agent
 * 从阅读体验角度评估章节质量，输出结构化评分和反馈。
 * 支持结构化审计维度模式（通过 context.useStructuredAudit 启用）。
 */
export class ReaderAgent extends BaseAgent {
  readonly role = 'reader' as const;
  readonly name = '读者';
  readonly description = '从读者视角评估章节质量，提供评分和改进建议';

  /** 缓存当前上下文的结构化审计标志 */
  private currentStructuredAudit = false;

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.3, maxTokens: 2048 };
  }

  /**
   * 覆盖 loadPromptTemplate，根据审计模式选择提示词文件。
   */
  protected async loadPromptTemplate(): Promise<string> {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const promptFile = this.currentStructuredAudit
      ? 'reader-structured.txt'
      : 'reader.txt';
    return fs.readFile(path.join(dir, 'prompts', promptFile), 'utf-8');
  }

  protected buildUserMessage(context: AgentContext): string {
    // 记录审计模式标志，供 loadPromptTemplate 使用
    this.currentStructuredAudit = context.useStructuredAudit ?? false;

    const parts: string[] = [];

    parts.push(`## 小说信息`);
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push(`- 简介：${context.novelSynopsis}`);
    parts.push('');

    if (context.chapterNumber != null) {
      parts.push(`## 章节信息`);
      parts.push(`第 ${context.chapterNumber} 章`);
      parts.push('');
    }

    if (context.inputText) {
      parts.push(`## 待评估的章节正文`);
      parts.push(context.inputText);
      parts.push('');
    }

    parts.push('请以读者视角评估以上章节，严格按照 JSON 格式输出评价结果。');

    return parts.join('\n');
  }
}
