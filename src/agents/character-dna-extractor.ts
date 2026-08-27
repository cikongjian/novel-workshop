import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 角色 DNA 提取师（CharacterDNAExtractor）
 *
 * 分析角色档案（外观/性格/定位/世界观），输出结构化角色视觉 DNA（JSON），
 * 包含面部/发型/服饰/锚点 + 预生成英文 prompt 片段。
 * DNA 持久化后由立绘生成和漫画出图共享，从源头保证角色一致性。
 */
export class CharacterDNAExtractorAgent extends BaseAgent {
  readonly role = 'character-dna-extractor' as const;
  readonly name = '角色DNA提取师';
  readonly description = '从角色档案提取结构化视觉DNA（面部/发型/服饰/锚点+英文prompt）';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.3, maxTokens: 4096 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push(`## 小说信息`);
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    if (context.worldContext) {
      parts.push(`- 世界观：${context.worldContext}`);
    }
    parts.push('');

    if (context.characterContext) {
      parts.push(`## 角色档案（DNA 分析输入）`);
      parts.push(context.characterContext);
      parts.push('');
    }

    parts.push('请分析以上角色档案，输出结构化角色视觉 DNA，严格按 JSON 格式输出。');
    return parts.join('\n');
  }
}
