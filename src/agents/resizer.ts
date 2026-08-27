import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';
import { estimateChapterOutputMaxTokens } from './chapter-output-budget.js';

/**
 * 缩写/扩写大师 Agent
 * 专职精确控制字数的章节缩写与扩写
 */
export class ResizerAgent extends BaseAgent {
  readonly role = 'resizer' as const;
  readonly name = '缩写扩写大师';
  readonly description = '精确控制字数的章节缩写与扩写';

  protected getModelOptions(context?: AgentContext): ModelCallOptions {
    const stage = context?.resizeMode === 'expand' ? 'resizer-expand' : 'resizer-compress';
    const maxTokens = estimateChapterOutputMaxTokens({
      targetChars: context?.maxWordCount,
      stage,
    });
    return { temperature: 0.3, maxTokens };
  }

  protected buildUserMessage(context: AgentContext): string {
    const mode = context.resizeMode ?? 'compress';
    const modeLabel = mode === 'compress' ? '缩写' : '扩写';
    const sourceText = context.inputText?.trim();
    if (!sourceText) {
      throw new Error('resizer requires inputText');
    }
    const parts: string[] = [];

    parts.push(`## 任务：${modeLabel}`);
    if (context.originalWordCount && context.maxWordCount) {
      const lo = Math.floor(context.maxWordCount * 0.9);
      const hi = Math.ceil(context.maxWordCount * 1.1);
      parts.push(`- 原文：${context.originalWordCount} 字`);
      parts.push(`- 目标：**${context.maxWordCount} 字**（允许范围 ${lo}-${hi} 字）`);
      parts.push(`- 压缩比：${Math.round(context.maxWordCount / context.originalWordCount * 100)}%`);
      if (mode === 'compress') {
        parts.push(`- 你必须砍掉约 ${context.originalWordCount - context.maxWordCount} 字，这是硬性要求`);
      }
    }
    parts.push('');

    // 小说基本信息（精简）
    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}（${context.genre}）`);
    parts.push('');

    if (context.userDirection) {
      parts.push('## 修改意见');
      parts.push(context.userDirection);
      parts.push('');
    }

    if (context.storyStateContext) {
      parts.push('## 故事状态约束（缩写时必须保留相关内容）');
      parts.push(context.storyStateContext);
      parts.push('');
    }

    parts.push(`## 当前章节原文（${modeLabel}依据，必须严格基于此文本处理）`);
    parts.push('- 你只能对下面这段正文做缩写或扩写，不得另起炉灶生成新故事。');
    parts.push('- 严禁替换主角、核心设定、世界观、冲突对象或叙事起点。');
    parts.push('- 若原文与标题存在张力，优先保留原文事实，不要按标题重写。');
    parts.push(sourceText);
    parts.push('');

    if (context.maxWordCount) {
      parts.push(`直接输出${modeLabel}后的正文，必须控制在 ${context.maxWordCount} 字左右。不要任何解释。`);
    }

    return parts.join('\n');
  }
}
