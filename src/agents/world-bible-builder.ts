import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/** 开书级世界圣经生成器。输出仅作为待确认提案，不直接进入章节写作。 */
export class WorldBibleBuilderAgent extends BaseAgent {
  readonly role = 'world-builder' as const;
  readonly name = '世界圣经架构师';
  readonly description = '构建支撑长篇连载的完整世界知识提案';

  protected async loadPromptTemplate(): Promise<string> {
    return fs.readFile(
      fileURLToPath(new URL('./prompts/world-bible-builder.txt', import.meta.url)),
      'utf-8',
    );
  }

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.35, maxTokens: 8192 };
  }

  protected buildUserMessage(context: AgentContext): string {
    return [
      '## 小说信息',
      `- 标题：${context.novelTitle}`,
      `- 类型：${context.genre}`,
      `- 简介：${context.novelSynopsis}`,
      '',
      context.inputText ?? '',
      '',
      '请输出完整的世界圣经提案 JSON。所有未被输入直接支持的内容必须标记为 proposal。',
    ].join('\n');
  }
}
