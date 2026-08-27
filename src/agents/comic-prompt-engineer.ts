import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 漫画出图提示词工程师（ComicPromptEngineer）
 *
 * 将作者选中的分镜场景转化为精确的 gpt-image-2 英文出图 prompt。
 * 角色面部锚点不在此处处理（由管线层注入立绘锚点 + edit 参考图锁脸），
 * 本 Agent 只产出画面 prompt（镜头/构图/画面元素/光影 + NO text 约束）。
 * 输出 { sceneId, finalPrompt }[] 的 JSON。
 */
export class ComicPromptEngineerAgent extends BaseAgent {
  readonly role = 'comic-prompt-engineer' as const;
  readonly name = '漫画出图提示词工程师';
  readonly description = '将分镜场景转化为 gpt-image-2 出图 prompt';

  protected getModelOptions(): ModelCallOptions {
    // 精确模式：prompt 工程需要稳定可控，低温度
    return { temperature: 0.3, maxTokens: 2048 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    if (context.inputText) {
      parts.push(`## 作者选中的漫画分镜场景（JSON）`);
      parts.push(context.inputText);
      parts.push('');
    }

    parts.push('请为每个场景产出最终英文出图 prompt，严格按 JSON 数组格式输出。');
    return parts.join('\n');
  }
}
