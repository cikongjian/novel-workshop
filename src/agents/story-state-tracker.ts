import { BaseAgent } from './base-agent.js';
import type { AgentRole, AgentContext } from './types.js';
import type { ModelCallOptions } from '../models/types.js';

/**
 * 故事状态追踪师
 * 每章生成后执行，从章节正文中提取结构化状态快照
 * 输出严格 JSON，供 StoryStateManager 持久化
 */
export class StoryStateTrackerAgent extends BaseAgent {
  readonly role: AgentRole = 'story-state-tracker';
  readonly name = '故事状态追踪师';
  readonly description = '从章节正文中提取角色、世界、情节的结构化状态快照，维护长篇连贯性';

  protected buildUserMessage(context: AgentContext): string {
    return [
      context.inputText ?? '',
      [
        'STORY_STATE_COMPACT_RULES:',
        '- Keep the JSON compact and complete; never trade closing braces for more detail.',
        '- Do not copy long prose from the chapter. Summarize every string in <= 120 Chinese characters.',
        '- Prefer changed/current facts over inherited unchanged details.',
        '- Hard caps: characters<=8, factions<=6, activeThreads<=8, pendingForeshadowing<=12, causalChains<=8, nextChapterConstraints<=12.',
        '- If a prior detail is already resolved, omit it from pendingForeshadowing.',
      ].join('\n'),
    ].filter(Boolean).join('\n\n');
  }

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.2, maxTokens: 16384 };
  }
}
