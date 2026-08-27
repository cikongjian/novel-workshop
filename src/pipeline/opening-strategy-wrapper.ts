import type { StartupOpeningStrategyDigest } from '../agent-skills/opening-strategy.js';

/**
 * 包裹 System Prompt，将 Opening Strategy 提升到最高优先级
 */
export function wrapSystemPromptWithOpeningStrategy(
  baseSystemPrompt: string,
  strategy: StartupOpeningStrategyDigest | undefined,
): string {
  if (!strategy || !strategy.enabled || !strategy.brief) {
    return baseSystemPrompt;
  }

  return `
# 🚨 开篇硬约束（最高优先级，违反将被拒绝）

${strategy.brief}

如果你发现自己在写"调查"、"真相"、"幕后"、"秘密"、"线索"，立即停止，回到题材主线。

---

${baseSystemPrompt}

---

# 再次提醒：开篇硬约束

在开始写作前，再次确认你已理解以下要求：

${strategy.brief}

这些要求的优先级高于下文的所有指导。
  `.trim();
}
