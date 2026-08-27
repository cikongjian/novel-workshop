import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';

/**
 * 故事架构师 Agent
 * 将抽象方向转化为可执行章节大纲
 */
export class OutlineAgent extends BaseAgent {
  readonly role = 'outline' as const;
  readonly name = '故事架构师';
  readonly description = '设计章节结构、场景节拍和伏笔规划';

  protected getModelOptions(): ModelCallOptions {
    return { temperature: 0.6, maxTokens: 8192 };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push(`- 简介：${context.novelSynopsis}`);
    parts.push('');

    if (context.chapterNumber != null) {
      parts.push('## 当前章节');
      parts.push(`第${context.chapterNumber}章`);
      parts.push('');
    }

    if (context.userDirection) {
      parts.push('## 章节方向');
      parts.push(context.userDirection);
      parts.push('');
    }

    if (context.chapterPromiseCard) {
      parts.push(context.chapterPromiseCard);
      parts.push('');
    }

    if (context.styleGuide) {
      parts.push('## 文风约束');
      parts.push(context.styleGuide);
      parts.push('');
    }

    if (context.previousChapterSummary) {
      parts.push('## 前文摘要');
      parts.push(context.previousChapterSummary);
      parts.push('');
    }

    if (context.foreshadowingHints) {
      parts.push('## 本章需回收的伏笔（请在场景设计中安排回收节点）');
      parts.push(context.foreshadowingHints);
      parts.push('');
    } else if (context.unresolvedForeshadowing) {
      parts.push('## 未解决伏笔');
      parts.push(context.unresolvedForeshadowing);
      parts.push('');
    }

    if (context.characterContext) {
      parts.push('## 主要角色');
      parts.push(context.characterContext);
      parts.push('');
    }

    if (context.worldContext) {
      parts.push('## 世界正史与行动边界（场景设计必须遵循）');
      parts.push(context.worldContext);
      parts.push('');
      parts.push('- 场景必须使用已有地点、力量、势力和资源规则；涉及约束时，要在场景节拍中安排可见代价或后果。');
      parts.push('- 不得为了制造冲突而临时废除、放宽或反转已有世界规则。');
      parts.push('');
    }

    if (context.consistencyGuardrails) {
      parts.push('## 一致性门禁（大纲阶段提前约束）');
      parts.push(context.consistencyGuardrails);
      parts.push('');
    }

    if (context.chapterAdviceContext) {
      parts.push('## 章节规划建议（参考）');
      parts.push(context.chapterAdviceContext);
      parts.push('');
    }

    if (context.maxWordCount != null) {
      parts.push('## ⚠️ 字数预算约束（必须遵守）');
      parts.push(`- 本章目标字数：${context.maxWordCount} 字`);
      parts.push('- 你必须根据字数预算合理规划场景数量和内容密度');
      parts.push('- 场景过多或情节点过密会导致写手被迫超字数，造成后续压缩损失');

      // 根据字数给出更精确的场景建议
      let sceneAdvice = '';
      if (context.maxWordCount <= 3000) {
        sceneAdvice = '2-3 个场景（网文黄金长度，2 个爽点刚好）';
      } else if (context.maxWordCount <= 4000) {
        sceneAdvice = '3-4 个场景（网文推荐长度，保持爽点密度）';
      } else if (context.maxWordCount <= 5000) {
        sceneAdvice = '3-5 个场景（注意：超过 4000 字容易显得拖沓，必须确保节奏紧凑）';
      } else {
        sceneAdvice = `3-5 个场景（⚠️ ${context.maxWordCount} 字偏长，建议考虑拆分成两章以提升爽点密度）`;
      }
      parts.push(`- 建议场景数量：${sceneAdvice}`);
      parts.push('- 每个场景的内容要点控制在 3-4 条以内');

      if (context.maxWordCount >= 3000 && context.maxWordCount <= 4000) {
        parts.push('- ✅ 当前字数在网文最佳区间（3000-4000），请充分利用这个长度设计紧凑节奏');
      }
      parts.push('');
    }

    parts.push('请给出详细章节大纲，至少包含：场景列表、每个场景的目标与冲突、关键信息增量、结尾钩子。');
    if (context.maxWordCount != null) {
      parts.push(`**重要提醒**：本章字数预算为 ${context.maxWordCount} 字，请确保场景数量和内容密度与此预算匹配，避免规划过度导致写手超字数。`);
    }
    return parts.join('\n');
  }
}
