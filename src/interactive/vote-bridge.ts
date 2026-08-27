/**
 * 投票采纳桥接器。
 *
 * 职责：把投票胜出选项转化为 PlotBranchTree 上的 selected 节点，
 * 并提取"胜出走向描述"供下一轮章节生成使用。
 *
 * 关键链路：
 *  voteService.closeVotePoint() → 计算 winner
 *  → 找到胜出选项对应的 enriched 数据（description/impactPrediction/riskLevel）
 *  → addBranchNodes() 写入分支树
 *  → selectBranch() 标记为 selected
 *  → 返回 winningDirection 文本
 *
 * 下一轮章节生成时，ChapterPipeline.buildPlotBranchDirective() 会自动读取
 * selected 节点注入 userDirection（见 chapter-pipeline.ts:1143-1147），
 * 因此本模块写入后无需额外改动即可影响生成方向。
 *
 * 不做投票计票（用 VoteService），不做持久化（用 NovelManager.savePlotBranchTree）。
 */

import type { NovelManager } from '../novel/novel-manager.js';
import type { VoteService, VotePoint } from '../services/vote-service.js';
import { addBranchNodes, selectBranch } from '../novel/plot-branch-manager.js';
import type { PlotBranchTree } from '../novel/plot-branch-types.js';

/** 采纳结果 */
export interface AdoptionResult {
  /** 胜出走向描述（注入下一轮 userDirection） */
  winningDirection: string;
  /** 更新后的分支树 */
  tree: PlotBranchTree;
  /** 关闭后的 VotePoint */
  votePoint: VotePoint;
}

export class VoteBridge {
  constructor(
    private readonly novelManager: NovelManager,
    private readonly voteService: VoteService,
  ) {}

  /**
   * 采纳投票胜出走向：关闭投票 → 写入分支树 → 提取走向描述。
   *
   * @param novelId 小说 ID
   * @param votePointId 投票点 ID
   * @returns 采纳结果（含胜出走向文本）
   * @throws 若投票不存在、未关闭、无胜出选项、或富选项数据缺失
   */
  async adoptWinningVote(novelId: string, votePointId: string): Promise<AdoptionResult> {
    // 1. 关闭投票并计算胜出方
    const closed = this.voteService.closeVotePoint(votePointId);
    if (!closed) throw new Error(`投票点 ${votePointId} 不存在`);
    if (!closed.winnerOptionId) throw new Error('投票尚无胜出选项（可能无人投票）');

    // 2. 从富选项数据中找到胜出项的详细信息
    const winnerEnriched = closed.enrichedOptions?.find((e) => e.optionId === closed.winnerOptionId);
    const winnerOption = closed.options.find((o) => o.id === closed.winnerOptionId);
    if (!winnerOption) throw new Error('胜出选项数据异常');

    // 富选项缺失时，用简单选项文本兜底
    const title = winnerEnriched?.title ?? winnerOption.text;
    const description = winnerEnriched?.description ?? winnerOption.text;
    const impactPrediction = winnerEnriched?.impactPrediction;
    const characterImpacts = winnerEnriched?.characterImpacts;
    const riskLevel = winnerEnriched?.riskLevel ?? 'medium';

    // 3. 写入 PlotBranchTree（addBranchNodes + selectBranch）
    // VotePoint.chapterId 是字符串型章节号，addBranchNodes 需要 number
    const chapterNumber = parseInt(closed.chapterId, 10);
    if (!Number.isFinite(chapterNumber) || chapterNumber < 1) {
      throw new Error(`投票关联的章节号无效：${closed.chapterId}`);
    }
    let tree = await this.novelManager.getPlotBranchTree(novelId);
    tree = addBranchNodes(tree, null, chapterNumber, [
      {
        title,
        description,
        impactPrediction,
        characterImpacts,
        riskLevel,
      },
    ]);
    // addBranchNodes 把新节点追加到末尾，取最后一个作为 selected
    const lastNodeId = tree.nodes[tree.nodes.length - 1]?.id;
    if (lastNodeId) {
      tree = selectBranch(tree, lastNodeId);
    }
    await this.novelManager.savePlotBranchTree(novelId, tree);

    // 4. 标记投票为已采纳
    this.voteService.adoptVotePoint(votePointId, true);

    // 5. 组装胜出走向描述（供下一轮生成注入 userDirection）
    const winningDirection = this.composeWinningDirection({
      title,
      description,
      impactPrediction,
      riskLevel,
    });

    return {
      winningDirection,
      tree,
      votePoint: closed,
    };
  }

  /** 把胜出选项的富数据组装成章节生成可读的走向指令文本 */
  private composeWinningDirection(input: {
    title: string;
    description: string;
    impactPrediction?: string;
    riskLevel: 'low' | 'medium' | 'high';
  }): string {
    const riskLabel = { low: '稳健', medium: '平衡', high: '冒险' }[input.riskLevel];
    const parts = [
      `## 读者投票选定的剧情走向（${riskLabel}路线）`,
      `标题：${input.title}`,
      `描述：${input.description}`,
    ];
    if (input.impactPrediction) {
      parts.push(`预期影响：${input.impactPrediction}`);
    }
    parts.push('请在下一章创作中严格遵循上述走向，不得偏离读者选定的方向。');
    return parts.join('\n');
  }
}
