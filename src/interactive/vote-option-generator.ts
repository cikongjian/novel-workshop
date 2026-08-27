/**
 * 互动投票选项生成器。
 *
 * 职责：调用 PlotExplorerAgent 生成 2-3 条剧情走向，
 * 并降维成 VoteService 可消费的投票选项格式（question + options[] + enrichedOptions）。
 *
 * 这是"AI 生成投票选项"能力的唯一实现，供两个场景复用：
 *  1. 互动小说自动推进时，章节发布即生成投票（由 orchestrator 调用，阶段 2）
 *  2. 作者手动创建投票时点"AI 生成选项"（由 votes.ts 路由调用）
 *
 * 不做投票存储（存储由 VoteService 负责）。
 */

import type { NovelManager } from '../novel/novel-manager.js';
import type { NovelAgent } from '../agents/types.js';
import type { ModelClient } from '../models/types.js';
import { safeParseAgentJson } from '../server/routes/handlers/advanced-route-support.js';
import type { EnrichedVoteOption } from './types.js';

/** PlotExplorerAgent 返回的原始分支结构（与 prompts/plot-explorer.txt 契约对齐） */
interface RawBranch {
  id?: string;
  title?: string;
  description?: string;
  impactPrediction?: string;
  characterImpacts?: Array<{ name: string; impact: string }>;
  riskLevel?: 'low' | 'medium' | 'high';
  foreshadowingResolved?: string[];
}

/** 生成结果：供 VoteService.createVotePoint 直接消费 */
export interface GeneratedVoteOptions {
  /** 投票问题 */
  question: string;
  /** 简洁选项文本（≤30 字，用于投票按钮） */
  options: string[];
  /** 富选项数据（与 options 等长，按顺序对应） */
  enrichedOptions: Array<{
    title: string;
    description: string;
    riskLevel: 'low' | 'medium' | 'high';
    impactPrediction?: string;
    characterImpacts?: Array<{ name: string; impact: string }>;
  }>;
}

/** 选项最大数量（PlotExplorerAgent 提示词约定 2-3 条） */
const MAX_OPTIONS = 3;
/** 单条选项文本最大长度（防止 UI 溢出） */
const OPTION_TEXT_MAX_LEN = 30;
/** 投票问题默认模板 */
const DEFAULT_QUESTION = '下一章的剧情走向，由你决定';

export class VoteOptionGenerator {
  constructor(
    private readonly novelManager: NovelManager,
  ) {}

  /**
   * 为指定章节生成互动投票选项。
   *
   * @param novelId 小说 ID
   * @param chapterNumber 投票关联的章节号（通常是本轮最后一章）
   * @param agent 已注册的 plot-explorer Agent 实例
   * @param modelClient 模型客户端
   * @param onChunk 可选的流式回调（用于实时推送生成过程到前端）
   */
  async generate(
    novelId: string,
    chapterNumber: number,
    agent: NovelAgent,
    modelClient: ModelClient,
    onChunk?: (chunk: string) => void,
  ): Promise<GeneratedVoteOptions> {
    const context = await this.buildContext(novelId, chapterNumber);

    const output = await agent.execute(context, modelClient, onChunk);
    const branches = this.parseBranches(output.content);

    if (branches.length < 2) {
      throw new Error('PlotExplorerAgent 返回的分支数不足 2 条，无法生成投票选项');
    }

    // 取前 MAX_OPTIONS 条，降维成投票选项
    const picked = branches.slice(0, MAX_OPTIONS);
    const options = picked.map((b) => this.truncate(b.title || b.description || '未命名走向'));
    const enrichedOptions = picked.map((b) => ({
      title: this.truncate(b.title || '未命名走向', 20),
      description: b.description || b.title || '',
      riskLevel: this.normalizeRiskLevel(b.riskLevel),
      impactPrediction: b.impactPrediction,
      characterImpacts: b.characterImpacts,
    }));

    return {
      question: DEFAULT_QUESTION,
      options,
      enrichedOptions,
    };
  }

  /** 构建 PlotExplorerAgent 所需的 AgentContext（上下文加载逻辑） */
  private async buildContext(novelId: string, chapterNumber: number) {
    const novel = await this.novelManager.getNovel(novelId);
    const [outline, characters, worldEntries, prevChapter] = await Promise.all([
      this.novelManager.getOutline(novelId),
      this.novelManager.getCharacters(novelId),
      this.novelManager.getWorldEntries(novelId),
      chapterNumber > 1 ? this.novelManager.getChapter(novelId, chapterNumber - 1) : Promise.resolve(null),
    ]);

    const unresolvedFs = outline.foreshadowing
      ?.filter((f) => !f.isResolved)
      .map((f) => `- ${f.hint}（第${f.plantedInChapter}章埋设）`)
      .join('\n') || '';

    return {
      novelId,
      genre: novel.genre || '',
      novelTitle: novel.title,
      novelSynopsis: novel.synopsis || novel.description || '',
      chapterNumber,
      outlineContext: outline.chapters
        ?.map((c) => `第${c.chapterNumber}章 ${c.title}: ${c.summary}`)
        .join('\n') || '',
      previousChapterSummary: prevChapter?.summary || prevChapter?.content?.slice(0, 500) || '',
      characterContext: characters
        .map((c) => `${c.name}(${c.role}): ${c.personality || ''}, 动机: ${c.motivation || ''}`)
        .join('\n'),
      worldContext: worldEntries
        .slice(0, 20)
        .map((e) => `[${e.category}] ${e.name}: ${e.description || ''}`)
        .join('\n'),
      unresolvedForeshadowing: unresolvedFs,
    };
  }

  /** 解析 Agent 输出为分支数组（兼容裸数组与 {branches:[]} 两种格式） */
  private parseBranches(rawContent: string): RawBranch[] {
    const parsed = safeParseAgentJson(rawContent);
    let branches: unknown = parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const wrapped = (parsed as Record<string, unknown>).branches;
      if (Array.isArray(wrapped)) branches = wrapped;
    }
    if (!Array.isArray(branches)) return [];
    return branches.filter((b): b is RawBranch => b != null && typeof b === 'object');
  }

  /** 截断文本到指定长度（避免投票按钮文字溢出） */
  private truncate(text: string, max = OPTION_TEXT_MAX_LEN): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
  }

  /** 规范化风险等级（容错 Agent 偶发的非标准输出） */
  private normalizeRiskLevel(level: string | undefined): 'low' | 'medium' | 'high' {
    if (level === 'low' || level === 'medium' || level === 'high') return level;
    return 'medium';
  }
}

/** 将 GeneratedVoteOptions 转成 EnrichedVoteOption[]（带 optionId 的最终格式） */
export function alignEnrichedOptions(
  generated: GeneratedVoteOptions,
  optionIds: readonly string[],
): EnrichedVoteOption[] {
  return generated.enrichedOptions.map((e, i) => ({
    optionId: optionIds[i],
    ...e,
  }));
}
