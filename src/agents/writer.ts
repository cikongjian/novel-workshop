import type { ModelCallOptions } from '../models/types.js';
import type { AgentContext } from './types.js';
import { BaseAgent } from './base-agent.js';
import { estimateChapterOutputMaxTokens } from './chapter-output-budget.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  allocateContextBudget,
  buildTrimmingSummary,
  CONTEXT_PRIORITIES,
  DEFAULT_MAX_CHARS,
  type ContextSection,
} from '../pipeline/context-budget.js';

/**
 * 写手 Agent
 * 根据大纲、世界观、角色约束创作章节正文
 */
export class WriterAgent extends BaseAgent {
  readonly role = 'writer' as const;
  readonly name = '写手';
  readonly description = '创作高质量中文小说章节正文';

  /**
   * 根据题材选择专属 Writer Prompt
   */
  protected async loadPromptTemplate(): Promise<string> {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const constitutionTags = this.currentContext?.constitutionTags || [];
    const genre = this.currentContext?.genre;
    const shouldUseSweetPrompt = constitutionTags.includes('sweet')
      || (genre === 'romance' && !constitutionTags.includes('female-career'));

    // 优先级：constitutionTags > genre
    // 甜宠文
    if (shouldUseSweetPrompt) {
      const promptPath = path.join(dir, 'prompts', 'writer-sweet.txt');
      try {
        return await fs.readFile(promptPath, 'utf-8');
      } catch {
        // 降级到通用 Prompt
      }
    }

    // 升级文
    if (constitutionTags.includes('upgrade') || constitutionTags.includes('fantasy-upgrade')) {
      const promptPath = path.join(dir, 'prompts', 'writer-upgrade.txt');
      try {
        return await fs.readFile(promptPath, 'utf-8');
      } catch {
        // 降级到通用 Prompt
      }
    }

    // 职场/大女主
    if (constitutionTags.includes('female-career')) {
      const promptPath = path.join(dir, 'prompts', 'writer-career.txt');
      try {
        return await fs.readFile(promptPath, 'utf-8');
      } catch {
        // 降级到通用 Prompt
      }
    }

    // 美食/经营
    if (constitutionTags.includes('food-business')) {
      const promptPath = path.join(dir, 'prompts', 'writer-food.txt');
      try {
        return await fs.readFile(promptPath, 'utf-8');
      } catch {
        // 降级到通用 Prompt
      }
    }

    // 默认通用 Prompt
    const promptPath = path.join(dir, 'prompts', 'writer.txt');
    return fs.readFile(promptPath, 'utf-8');
  }

  private currentContext?: AgentContext;

  protected getModelOptions(context?: AgentContext): ModelCallOptions {
    this.currentContext = context;
    const stage = context?.resizeMode === 'compress' ? 'resizer-compress' : 'writer';
    const maxTokens = estimateChapterOutputMaxTokens({
      targetChars: context?.maxWordCount,
      stage,
    });
    return { temperature: 0.8, maxTokens };
  }

  protected buildUserMessage(context: AgentContext): string {
    const parts: string[] = [];

    parts.push('## 小说信息');
    parts.push(`- 标题：${context.novelTitle}`);
    parts.push(`- 类型：${context.genre}`);
    parts.push(`- 简介：${context.novelSynopsis}`);
    if (context.titleGuidance) {
      parts.push(`- ⚠️ 标题点题：请注意本章内容与标题「${context.novelTitle}」的主题呼应，在关键情节中自然点题`);
    }
    parts.push('');

    if (context.sceneNumber != null) {
      parts.push('## 场景写作模式');
      parts.push(`当前任务：第 ${context.chapterNumber} 章 · 场景 ${context.sceneNumber}`);
      if (context.sceneSummary) parts.push(`场景概要：${context.sceneSummary}`);
      if (context.sceneLocation) parts.push(`场景地点：${context.sceneLocation}`);
      if (context.sceneCharacters) parts.push(`出场角色：${context.sceneCharacters}`);
      if (context.sceneTensionTarget != null) parts.push(`张力目标：${context.sceneTensionTarget}/10`);
      if (context.sceneWordTarget) parts.push(`目标字数：${context.sceneWordTarget} 字`);
      parts.push('- 你当前只执行这一场，不得把整章从头重写，也不得抢写后续场景。');
      if (context.sceneNumber > 1) {
        parts.push('- 当前场景的第一段必须直接承接上一场已发生的结果，或切到后续新的时间点/地点，禁止重启开篇。');
      }
      if (context.fullScenePlan) {
        parts.push('');
        parts.push('## 本章完整场景规划');
        parts.push(context.fullScenePlan);
      }
      if (context.previousSceneContent) {
        const tailLines = context.previousSceneContent.trim().split('\n');
        const TAIL_LINE_COUNT = 8;
        const tail = tailLines.slice(-TAIL_LINE_COUNT).join('\n');
        parts.push('');
        parts.push('## 前一场景结尾（仅供衔接参考，禁止重复）');
        parts.push(tail);
        parts.push('');
        parts.push('⚠️ 以上内容已经写完，你的任务从这里无缝续写。');
        parts.push('严禁重复前一场景已有的任何内容，包括：');
        parts.push('- 相同或近似的动作描写（如角色已做过的动作不要再写一遍）');
        parts.push('- 相同或改写的对话/意念（如角色已说过的话不要换种说法重复）');
        parts.push('- 相同的环境/氛围描写（如已描述过的场景状态不要重新渲染）');
        parts.push('违反此规则的内容会被直接删除。');
      }
      parts.push('');
      parts.push('请只写当前场景的正文，不要写其他场景的内容。');
      parts.push('直接从新事件、新动作或新转折开始，不要用过渡段重述前情。');
      parts.push('');
    }

    if (context.chapterNumber != null) {
      parts.push('## 当前章节');
      parts.push(`第 ${context.chapterNumber} 章`);
      if (context.totalPlannedChapters) {
        const progress = context.chapterNumber / context.totalPlannedChapters;
        parts.push(`- 全书进度：第 ${context.chapterNumber}/${context.totalPlannedChapters} 章（${Math.round(progress * 100)}%）`);
        if (progress >= 0.95) {
          parts.push('- ⚠️ 这是最终章节，请完成主线收束，解决核心冲突，呼应前文重要伏笔');
        } else if (progress >= 0.8) {
          parts.push('- ⚠️ 故事进入收束阶段，请注意收拢支线、推进主线冲突走向解决');
        }
      }
      parts.push('');
    }

    if (context.userDirection) {
      parts.push('## 章节方向');
      parts.push(context.userDirection);
      parts.push('');
    }

    if (context.promiseContractSummary) {
      parts.push('## 题材承诺合同（不得偏离）');
      parts.push(context.promiseContractSummary);
      if (context.promiseOpeningHints) parts.push(context.promiseOpeningHints);
      if (context.promisePayoffHints) parts.push(context.promisePayoffHints);
      if (context.promiseAntiDriftHints) parts.push(context.promiseAntiDriftHints);
      parts.push('');
    }

    if (context.chapterPromiseCard) {
      parts.push(context.chapterPromiseCard);
      parts.push('');
    }

    if (context.readerDeliveryContract) {
      parts.push(context.readerDeliveryContract);
      parts.push('');
    }

    if (context.baselineContext) {
      parts.push(context.baselineContext);
      parts.push('');
    }

    if (context.chapterNumber === 1) {
      parts.push('## 第 1 章执行约束');
      parts.push('- 主回报尽量在前 65%-75% 篇幅内先落一次，不要把真正的兑现拖到章末之后。');
      parts.push('- 如果后半章继续升级，必须换一个推进维度，例如身份、关系、利益、规则、代价或下一步行动，不能重复同一类冲突或同一类证据。');
      parts.push('- 章末钩子必须是具体动作、具体到来、具体任务、具体发现或具体选择，不能只留“有人盯上了”“更大阴谋来了”这类空泛气氛。');
      parts.push('');
    }

    parts.push('## 去重与变化约束');
    parts.push('- 同一章内不要重复同一段打脸、谈判、试探、技能展示或围观反应。');
    parts.push('- 如果同一种能力、资源、手段或招式在本章出现第二次，必须至少变化一个维度：目标、规模、代价、环境、副作用或战术目的。');
    parts.push('- 场景模式下，禁止重写上一场已经完成的关键台词、关键证据、关键威胁或关键人物登场；如需提及，只能一句带过，然后立刻进入本场新结果。');
    parts.push('');

    if (context.styleGuide) {
      parts.push('## 文风约束（严格执行）');
      parts.push(context.styleGuide);
      parts.push('');
    }

    if (context.startupOpeningStrategyBrief) {
      parts.push(context.startupOpeningStrategyBrief);
      parts.push('');
    }

    if (context.maxWordCount != null) {
      if (context.resizeMode === 'compress' && context.originalWordCount) {
        // 缩写模式：用硬性目标措辞，而非上限措辞
        const lo = Math.floor(context.maxWordCount * 0.9);
        const hi = Math.ceil(context.maxWordCount * 1.1);
        parts.push('## ⚠️ 缩写字数约束（最高优先级，必须遵守）');
        parts.push(`- 原文约 ${context.originalWordCount} 字，你必须缩写到 **${context.maxWordCount} 字**`);
        parts.push(`- 允许范围：${lo}-${hi} 字，超出此范围视为任务失败`);
        parts.push(`- 你正在做缩写，不是润色——必须大幅删减内容，不要复述原文`);
        parts.push('');
      } else {
        parts.push('## ⚠️ 字数硬性限制（最高优先级，严格执行）');
        parts.push(`- **硬性上限：${context.maxWordCount} 字**`);
        parts.push(`- 目标区间：${Math.max(800, Math.floor(context.maxWordCount * 0.85))}-${context.maxWordCount} 字`);
        parts.push(`- 超过 ${context.maxWordCount} 字将被视为任务失败`);
        parts.push('- 不要明显低于目标区间下沿，字数过短同样说明剧情展开不足');
        parts.push('- 在不超上限的前提下，尽量写到目标区间中上段，不要过早草草收束');
        parts.push('- 如果接近字数上限，立即收束情节，不要继续展开新内容');
        parts.push('');
      }
    }

    if (context.outlineContext) {
      parts.push('## 章节大纲（必须遵循）');
      parts.push(context.outlineContext);
      parts.push('');
    }

    if (context.scenePlan) {
      parts.push('## 场景执行卡（先按此写作）');
      parts.push('- 必须按场景顺序推进，不要把执行卡写成提纲复述。');
      parts.push('- 每个场景都要落地“可见行动 -> 阻碍 -> 选择 -> 即时后果”，后果要推动下一场。');
      parts.push('- “验收词”必须自然出现在动作、对话或发现里，不得列表化、不得只在内心说明或设定说明中点名。');
      parts.push('- 如果场景涉及世界观要素，必须让它改变行动方案、代价、风险或关系，不要只解释名词。');
      parts.push(context.scenePlan);
      parts.push('');
    }

    // --- Collect optional context sections for budget allocation ---
    const optionalSections: ContextSection[] = [];
    const addSection = (key: string, label: string, content: string | undefined, extraPrefix?: string) => {
      if (!content) return;
      let full: string;
      if (!label) {
        full = content;
      } else if (extraPrefix) {
        full = `${label}\n${extraPrefix}\n${content}`;
      } else {
        full = `${label}\n${content}`;
      }
      optionalSections.push({
        key,
        label,
        content: full + '\n',
        priority: CONTEXT_PRIORITIES[key] ?? 20,
      });
    };

    addSection('outlineContract', '## 大纲兑现清单（必须落实）', context.outlineContract);
    addSection('worldContext', '## 世界观约束（必须遵循）', context.worldContext);
    addSection('worldContract', '## 世界观契约（硬约束，必须兑现）', context.worldContract);
    addSection(
      'worldBuilderGuidance',
      '## 本章世界落地参考（非正史）',
      context.worldBuilderGuidance,
    );
    addSection('characterContext', '## 角色行为约束（必须遵循）', context.characterContext);
    addSection('namingConstraints', '', context.namingConstraints);
    addSection('previousChapterSummary', '## 前文回顾（确保衔接）', context.previousChapterSummary);
    addSection('smartGateHints', '## 智能门禁提示（上一章检测发现，请避免同类问题）', context.smartGateHints);
    addSection('characterEventContext', '## 角色经历时间线（确保行为连贯）', context.characterEventContext);
    addSection('characterStallHints', '## 角色弧线停滞警告（需推动发展）', context.characterStallHints);
    addSection('consistencyGuardrails', '## 角色一致性门禁', context.consistencyGuardrails);
    addSection('antiTemplateRules', '## 去模板化约束', context.antiTemplateRules);
    // shuangwenRules is not budget-managed (always included if present)
    if (context.shuangwenRules) {
      parts.push('## 爽文规则（严格执行）');
      parts.push(context.shuangwenRules);
      parts.push('');
    }
    addSection(
      'foreshadowingHints',
      '## 本章需回收的伏笔（自然融入情节）',
      context.foreshadowingHints,
      '以下伏笔已逾期，请在本章正文中通过具体情节自然地兑现它们。\n要求：用角色行动、对话、事件揭示等方式让读者看到伏笔被回应，但不要生硬堆砌，要融入本章主线剧情中。',
    );
    addSection('pacingHints', '## 节奏变化提示', context.pacingHints);
    addSection('tensionCurveHints', '## 张力曲线规划（参考建议）', context.tensionCurveHints);
    addSection('cultureStoryHooks', '## 文化剧情钩子（优先转化为冲突/抉择/后果）', context.cultureStoryHooks);
    addSection('factionFronts', '## 势力幕后动态（间接呈现世界运转）', context.factionFronts);
    addSection('plotThreadGraphHints', '## 情节线推进指引（依赖关系）', context.plotThreadGraphHints);
    addSection(
      'causalChainHints',
      '## ⚠️ 因果链待兑现（按紧迫度排序，优先在本章推进）',
      context.causalChainHints,
      '以下事件的后果尚未在故事中体现，请在本章自然推进或兑现：',
    );
    addSection('beliefEvolutionHints', '## 角色信念演化（内在弧线）', context.beliefEvolutionHints);
    addSection('storyStateContext', '', context.storyStateContext);
    addSection('relationshipEvolutionHints', '## 角色关系演化提示（防止关系静态化）', context.relationshipEvolutionHints);
    addSection(
      'voiceDriftHints',
      '## 角色语言漂移警告（请修正对话风格）',
      context.voiceDriftHints,
      '以下角色的近期对话偏离了其设定的说话风格，本章请注意纠正：',
    );
    addSection('seriesContext', '', context.seriesContext);
    addSection('universeContext', '', context.universeContext);
    addSection('anchorContext', '', context.anchorContext);
    addSection(
      'recurringDescriptionHints',
      '## 感知描写多样化约束（避免审美疲劳）',
      context.recurringDescriptionHints,
    );
    addSection(
      'chapterOpeningHints',
      '## 章节开头多样化约束（黄金开头）',
      context.chapterOpeningHints,
    );
    addSection(
      'payoffDensityHints',
      '## 情绪高潮密度提示（爽点节拍）',
      context.payoffDensityHints,
    );

    // --- Apply budget allocation ---
    const coreBudget = parts.reduce((sum, p) => sum + p.length, 0);
    const availableBudget = Math.max(0, DEFAULT_MAX_CHARS - coreBudget);
    const { kept, trimmed } = allocateContextBudget(optionalSections, availableBudget);

    for (const section of kept) {
      parts.push(section.content);
    }

    if (trimmed.length > 0) {
      parts.push(buildTrimmingSummary(trimmed));
      parts.push('');
    }

    if (context.resizeMode === 'compress' && context.maxWordCount != null) {
      parts.push(`你的任务是缩写，不是重写。必须将正文压缩到 ${context.maxWordCount} 字左右。大幅删减描写和次要内容，只保留核心剧情。直接输出缩写后的正文，不要额外解释。`);
    } else if (context.maxWordCount != null) {
      parts.push(`## 最终提醒：字数硬性限制`);
      parts.push(`**你必须在 ${context.maxWordCount} 字以内完成本章正文。**`);
      parts.push(`**正文也不要明显短于目标区间下沿；如果还没写出完整推进，不得因为保守而提前停笔。**`);
      parts.push(`如果你发现内容即将超出限制，立即收束情节，不要继续展开。`);
      parts.push(`超过 ${context.maxWordCount} 字的输出将被视为失败。`);
      parts.push('');
      parts.push(`请根据以上所有信息创作本章正文。严格控制在 ${context.maxWordCount} 字以内，直接输出正文，不要额外解释。`);
    } else {
      parts.push('请根据以上所有信息创作本章正文。字数要求 3000-5000 字，直接输出正文，不要额外解释。');
    }

    return parts.join('\n');
  }
}
