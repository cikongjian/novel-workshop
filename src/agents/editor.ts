import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';
import { estimateChapterOutputMaxTokens } from './chapter-output-budget.js';
import {
  allocateContextBudget,
  buildTrimmingSummary,
  CONTEXT_PRIORITIES,
  EDITOR_MAX_CHARS,
  type ContextSection,
} from '../pipeline/context-budget.js';

/**
 * 编辑 Agent
 * 对初稿润色、修正并输出修改说明
 */
export class EditorAgent extends BaseAgent {
  readonly role = 'editor' as const;
  readonly name = '编辑';
  readonly description = '润色修正初稿，提升文字质量和阅读体验';

  protected getModelOptions(context?: AgentContext): ModelCallOptions {
    const stage = context?.resizeMode === 'compress'
      ? 'resizer-compress'
      : context?.resizeMode === 'expand'
        ? 'resizer-expand'
        : 'editor';
    const maxTokens = estimateChapterOutputMaxTokens({
      targetChars: context?.maxWordCount,
      stage,
    });
    return { temperature: 0.4, maxTokens };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];
    const rewriteSourceMarker = '【当前章节原文（重写依据）】';
    const rawDirection = context.userDirection?.trim() ?? '';
    const directionForEditor = (() => {
      if (!rawDirection) return '';
      const markerIdx = rawDirection.indexOf(rewriteSourceMarker);
      const head = markerIdx >= 0 ? rawDirection.slice(0, markerIdx).trim() : rawDirection;
      return head.slice(0, 1800).trim();
    })();

    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    if (context.titleGuidance) {
      parts.push(`- ⚠️ 标题点题：润色时请注意内容与标题「${context.novelTitle}」的主题呼应`);
    }
    if (context.chapterNumber != null && context.totalPlannedChapters) {
      const progress = context.chapterNumber / context.totalPlannedChapters;
      parts.push(`- 全书进度：第 ${context.chapterNumber}/${context.totalPlannedChapters} 章（${Math.round(progress * 100)}%）`);
      if (progress >= 0.95) {
        parts.push('- ⚠️ 最终章节：审稿时请确认主线是否收束、伏笔是否回收、结局是否完整');
      } else if (progress >= 0.8) {
        parts.push('- ⚠️ 收束阶段：审稿时请关注支线是否在收拢、主线冲突是否在推向解决');
      }
    }
    parts.push('');

    if (context.sceneNumber != null) {
      parts.push('## 场景编辑模式');
      parts.push(`当前任务：第 ${context.chapterNumber} 章 · 场景 ${context.sceneNumber}`);
      if (context.sceneSummary) parts.push(`场景概要：${context.sceneSummary}`);
      if (context.sceneLocation) parts.push(`场景地点：${context.sceneLocation}`);
      if (context.sceneCharacters) parts.push(`出场角色：${context.sceneCharacters}`);
      if (context.sceneTensionTarget != null) parts.push(`张力目标：${context.sceneTensionTarget}/10`);
      if (context.sceneWordTarget) parts.push(`目标字数：${context.sceneWordTarget} 字`);
      parts.push('- 你只能润色当前场景，不得把前一场景重写进来，也不得补写后续场景。');
      if (context.sceneNumber > 1) {
        parts.push('- 如果开头像在重复整章开篇，请直接删掉重复铺垫，让正文从当前场景的新动作开始。');
      }
      if (context.fullScenePlan) {
        parts.push('');
        parts.push('## 本章完整场景规划');
        parts.push(context.fullScenePlan);
      }
      if (context.previousSceneContent) {
        parts.push('');
        parts.push('## 前一场景正文（只用于衔接，不可重写）');
        parts.push(context.previousSceneContent.slice(-2000));
      }
      parts.push('');
    }

    if (context.styleGuide) {
      parts.push('## 文风约束');
      parts.push(context.styleGuide);
      parts.push('');
    }

    if (directionForEditor) {
      parts.push('## 用户重点要求（最高优先级）');
      parts.push(directionForEditor);
      parts.push('- 必须逐条落实用户要求；若与初稿冲突，优先满足用户要求。');
      parts.push('- 若用户要求属于“重写/改写”，允许重组段落与句序，但不得篡改核心剧情事实。');
      parts.push('');
    }

    if (context.promiseContractSummary) {
      parts.push('## 题材承诺合同（优先于泛化悬念）');
      parts.push(context.promiseContractSummary);
      if (context.promiseOpeningHints) parts.push(context.promiseOpeningHints);
      if (context.promisePayoffHints) parts.push(context.promisePayoffHints);
      if (context.promiseAntiDriftHints) parts.push(context.promiseAntiDriftHints);
      parts.push('- 若初稿把主驱动力写成调查、秘密、真相或系统来源，而题材承诺不是悬疑，请主动改回题材主场景和可视化回报。');
      parts.push('');
    }

    if (context.chapterPromiseCard) {
      parts.push(context.chapterPromiseCard);
      parts.push('');
    }

    if (context.readerDeliveryContract) {
      parts.push(context.readerDeliveryContract);
      parts.push('- 若初稿未满足任一项，必须直接重组相关段落，而不是只在编辑说明中指出。');
      parts.push('');
    }

    if (context.chapterNumber === 1) {
      parts.push('## 第 1 章校正重点');
      parts.push('- 如果主回报落得太晚，请把第一次明确兑现前移到前 65%-75% 篇幅内。');
      parts.push('- 如果后半章只是重复同类冲突、同类试探或同类吹捧，请改成新的推进维度，例如身份、关系、利益、规则、代价或下一步行动。');
      parts.push('- 如果章末只有模糊危险感，请把结尾改成具体的人、事、任务、到来、发现或选择。');
      parts.push('');
    }

    parts.push('## 去重与变化校正');
    parts.push('- 删掉重复的开场句、重复的场景桥接、重复的围观反应和重复的技能描述。');
    parts.push('- 若同一种能力、资源、手段或招式在本章用了两次，第二次必须体现目标、规模、代价、环境、副作用或战术目的上的变化。');
    parts.push('- 场景模式下，如果当前场景重写了上一场已经完成的关键台词、关键证据、关键威胁或关键人物登场，必须删掉这些回放，只保留新推进。');
    parts.push('');

    if (context.maxWordCount != null) {
      if (context.resizeMode === 'compress') {
        parts.push('## ⚠️ 缩写字数约束（最高优先级）');
        parts.push(`- 这是缩写任务，润色后正文必须控制在 ${context.maxWordCount} 字左右`);
        parts.push('- 只做文字润色，不要扩充内容、不要补充描写、不要增加段落');
        parts.push('');
      } else if (context.resizeMode === 'expand') {
        parts.push('## 扩写字数约束（严格执行）');
        parts.push(`- 这是扩写任务，润色后正文应尽量补到 ${context.maxWordCount} 字附近，但不得超过上限`);
        parts.push('- 允许补足必要动作、因果、转折和情绪反馈，但不得改写核心剧情事实');
        parts.push('- 不要把扩写做成注水；新增内容必须服务于已有冲突推进');
        parts.push('');
      } else {
        parts.push('## 字数约束（严格执行）');
        parts.push(`- 润色后正文不得超过 ${context.maxWordCount} 字`);
        parts.push('- 不允许超出上限，也不要明显短于目标区间下沿');
        parts.push('- 若初稿本就偏短，不要为了“稳妥”继续压短；优先补足必要过程与转折');
        if (context.inputText) {
          const draftWordCount = context.inputText.length;
          const overagePercent = Math.round((draftWordCount / context.maxWordCount - 1) * 100);
          if (overagePercent > 20) {
            parts.push(`- ⚠️ 初稿已超目标 ${overagePercent}%（${draftWordCount} 字 vs ${context.maxWordCount} 字目标），需大幅压缩`);
            parts.push('- 优先删减：重复描写、冗余对话、次要细节、氛围铺垫');
            parts.push('- 若仍无法压缩到目标，在编辑笔记中说明"大纲内容过载"并列出可简化的场景/情节点');
          }
        }
        parts.push('');
      }
    }

    const optionalSections: ContextSection[] = [];
    const addSection = (key: string, label: string, content: string | undefined, priorityBoost = 0) => {
      if (!content) return;
      optionalSections.push({
        key,
        label,
        content: label ? `${label}\n${content}\n` : `${content}\n`,
        priority: (CONTEXT_PRIORITIES[key] ?? 20) + priorityBoost,
      });
    };

    addSection(
      'scenePlan',
      '## 场景执行卡（校验叙事节奏）',
      context.scenePlan
        ? [
          '- 逐场检查初稿是否写出“可见行动 -> 阻碍 -> 选择 -> 即时后果”。',
          '- 若某场只有设定、地图、局势说明或心情铺垫，必须改成角色行动后的新局面。',
          '- 验收词要保留在自然叙事中，但不能为了凑词生硬堆名词。',
          context.scenePlan,
        ].join('\n')
        : undefined,
      70,
    );
    addSection('outlineContext', '## 章节大纲（用于校验情节一致性）', context.outlineContext, 65);
    addSection('outlineContract', '## 大纲兑现清单（用于核验剧情兑现）', context.outlineContract, 20);
    addSection('worldContext', '## 世界观设定（用于校验设定一致性）', context.worldContext);
    addSection('worldContract', '## 世界观契约（用于校验是否兑现）', context.worldContract, 20);
    addSection('worldGateFixHints', '## 世界观门禁修复提示（必须落实）', context.worldGateFixHints, 90);
    addSection('outlineGateFixHints', '## 大纲门禁修复提示（必须落实）', context.outlineGateFixHints, 90);
    addSection('qualityGateFixHints', '## 质量门禁修复提示（必须落实）', context.qualityGateFixHints, 90);
    addSection('commercialGateFixHints', '## 商业化门禁修复提示（必须落实）', context.commercialGateFixHints, 90);
    addSection('chapterPromiseGateFixHints', '## 章节承诺门禁修复提示（必须落实）', context.chapterPromiseGateFixHints, 90);
    addSection('startupOpeningGateFixHints', '## 开篇三章门禁修复提示（必须落实）', context.startupOpeningGateFixHints, 90);
    addSection('aiTraceFixHints', '## AI 痕迹门禁修复提示（必须落实）', context.aiTraceFixHints, 90);
    addSection('startupOpeningStrategyBrief', '', context.startupOpeningStrategyBrief, 90);
    addSection('characterContext', '## 角色设定（用于校验角色一致性）', context.characterContext);
    addSection('consistencyGuardrails', '## 角色一致性门禁', context.consistencyGuardrails);
    addSection('antiTemplateRules', '## 去模板化约束', context.antiTemplateRules);
    addSection('shuangwenRules', '## 爽文规则（校验时参考）', context.shuangwenRules, 90);
    addSection('shuangwenGateFixHints', '## 爽文门禁修复提示（必须落实）', context.shuangwenGateFixHints, 90);
    addSection('storyStateContext', '', context.storyStateContext);
    addSection('seriesContext', '', context.seriesContext);
    addSection('universeContext', '', context.universeContext);
    addSection('anchorContext', '', context.anchorContext);

    const draftReserve = context.inputText?.length ?? 0;
    const coreBudget = parts.reduce((sum, part) => sum + part.length, 0);
    const availableBudget = Math.max(0, EDITOR_MAX_CHARS - coreBudget - draftReserve);
    const { kept, trimmed } = allocateContextBudget(optionalSections, availableBudget);

    for (const section of kept) {
      parts.push(section.content);
      parts.push('');
    }

    if (trimmed.length > 0) {
      parts.push(buildTrimmingSummary(trimmed));
      parts.push('');
    }

    if (context.inputText) {
      if (context.spotFixMode) {
        parts.push('## ⚠️ 定点修复模式（Spot-Fix）');
        parts.push('- 用户已明确指出具体问题句/段落，只修改用户指出的问题部分');
        parts.push('- 保持其余正文完全不变，不要主动扩大修改范围');
        parts.push('- 在编辑笔记中明确标注修改位置');
        parts.push('');
        parts.push('## 需要润色的初稿');
        parts.push(context.inputText);
        parts.push('');
      } else {
        parts.push('## 需要润色的初稿');
        parts.push(context.inputText);
        parts.push('');
      }
    }

    parts.push('请输出“润色后的正文 + ---EDITOR_NOTES--- + 修改说明”。');
    return parts.join('\n');
  }
}
