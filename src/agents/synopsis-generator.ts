import { BaseAgent } from './base-agent.js';
import type {
  AgentRole,
  AgentContext,
  SynopsisCharacter,
  SynopsisOutlineThread,
  SynopsisWorldEntry,
} from './types.js';

/**
 * 作品介绍生成 Agent
 * 根据已更新章节内容，生成符合起点/番茄风格的爆款作品介绍
 */
export class SynopsisGeneratorAgent extends BaseAgent {
  readonly role: AgentRole = 'synopsis-generator';
  readonly name = '作品介绍生成器';
  readonly description = '根据实际章节内容生成符合平台风格的爆款作品介绍';

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('# 任务');
    parts.push('根据以下小说信息和已更新章节内容，生成符合起点和番茄风格的作品介绍。');
    parts.push('');

    parts.push('# 小说基本信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    const currentSynopsis = context.synopsis ?? context.novelSynopsis;
    if (currentSynopsis) {
      parts.push(`- 当前简介：${currentSynopsis}`);
    }
    parts.push('');

    if (context.characters && context.characters.length > 0) {
      parts.push('# 角色信息');
      const mainChars = context.characters
        .filter((c: SynopsisCharacter) => c.role === 'protagonist' || c.role === 'antagonist')
        .slice(0, 5);
      for (const char of mainChars) {
        parts.push(`## ${char.name}（${char.role === 'protagonist' ? '主角' : '反派'}）`);
        if (char.backstory) parts.push(`背景：${char.backstory}`);
        if (char.motivation) parts.push(`动机：${char.motivation}`);
        if (char.abilities && char.abilities.length > 0) {
          parts.push(`能力：${char.abilities.join('、')}`);
        }
        parts.push('');
      }
    }

    if (context.worldEntries && context.worldEntries.length > 0) {
      parts.push('# 世界观设定');
      const keyEntries = context.worldEntries
        .filter((e: SynopsisWorldEntry) => e.category === 'power' || e.category === 'rule' || e.category === 'faction')
        .slice(0, 5);
      for (const entry of keyEntries) {
        parts.push(`- ${entry.name}：${entry.description.slice(0, 100)}`);
      }
      parts.push('');
    }

    if (context.chapterSummaries && context.chapterSummaries.length > 0) {
      parts.push('# 已更新章节摘要');
      parts.push(`共 ${context.chapterSummaries.length} 章`);
      parts.push('');
      const recentChapters = context.chapterSummaries.slice(-10);
      for (const ch of recentChapters) {
        parts.push(`## 第${ch.chapterNumber}章：${ch.title || '无标题'}`);
        if (ch.summary) {
          parts.push(ch.summary);
        }
        parts.push('');
      }
    }

    if (context.outline?.plotThreads && context.outline.plotThreads.length > 0) {
      parts.push('# 主要情节线');
      const activeThreads = context.outline.plotThreads
        .filter((t: SynopsisOutlineThread) => t.status === 'developing' || t.status === 'planted')
        .slice(0, 3);
      for (const thread of activeThreads) {
        parts.push(`- ${thread.name}：${thread.description}`);
      }
      parts.push('');
    }

    parts.push('# 输出要求');
    parts.push('请严格按照以下 JSON 格式输出，不要添加任何其他文字：');
    parts.push('```json');
    parts.push('{');
    parts.push('  "qidian": {');
    parts.push('    "synopsis": "起点风格介绍文案（200-300字）",');
    parts.push('    "tags": ["标签1", "标签2", "标签3"],');
    parts.push('    "reasoning": "选择这些内容和标签的理由"');
    parts.push('  },');
    parts.push('  "fanqie": {');
    parts.push('    "synopsis": "番茄风格介绍文案（150-200字）",');
    parts.push('    "tags": ["标签1", "标签2", "标签3"],');
    parts.push('    "reasoning": "选择这些内容和标签的理由"');
    parts.push('  }');
    parts.push('}');
    parts.push('```');

    return parts.join('\n');
  }

  protected getModelOptions() {
    return {
      temperature: 0.8,
      maxTokens: 2048,
    };
  }
}
