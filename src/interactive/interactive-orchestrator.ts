/**
 * 互动小说编排器（核心状态机）。
 *
 * 职责：驱动互动小说的自动推进循环：
 *   idle → generating → publishing → vote_open → vote_closing → advancing → generating（循环）
 *                                                          └→ stalled（票数不足）
 *
 * 设计模式：声明式 + 幂等推进。
 * 每分钟被 InteractiveNovelScheduler 调用 scanAndAdvance()，
 * 根据持久化的 phase 字段判断当前该做什么。
 * 章节生成是异步长任务，通过"下次 tick 检查章节是否存在"来判定是否完成
 * （与 BookstoreAutoUpdateService.ensureChapterReady 模式一致）。
 *
 * 防并发：进程内 Set<novelId> 锁，同一小说同一时刻只执行一个阶段。
 */

import type { ChapterPipeline } from '../pipeline/chapter-pipeline.js';
import type { NovelMemory } from '../memory/novel-memory.js';
import type { ModelClient } from '../models/types.js';
import type { NovelAgent } from '../agents/types.js';
import type { StoryStateManager } from '../novel/story-state-manager.js';
import { BookStoreManager } from '../bookstore/bookstore-manager.js';
import type { AuditQueueManager } from '../bookstore/audit-queue.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { VoteService } from '../services/vote-service.js';
import { saveGenerationResults } from '../services/generation-result-service.js';
import { schedulePostSaveBackgroundTasks } from '../services/generation-background-tasks.js';
import { buildChapterCost } from '../cost/build-chapter-cost.js';
import { createLogger } from '../utils/logger.js';
import { InteractiveConfigManager } from './interactive-config-manager.js';
import { VoteOptionGenerator } from './vote-option-generator.js';
import { VoteBridge } from './vote-bridge.js';
import type { InteractiveConfig, InteractiveRoundHistory } from './types.js';

const logger = createLogger('InteractiveOrchestrator');

/** 编排器依赖 */
export interface OrchestratorDeps {
  novelManager: NovelManager;
  bookStoreManager?: BookStoreManager;
  auditQueueManager?: AuditQueueManager;
  voteService?: VoteService;
  chapterPipeline?: ChapterPipeline;
  novelMemory?: NovelMemory;
  modelClient?: ModelClient;
  agents?: Map<string, NovelAgent>;
  storyStateManager?: StoryStateManager;
}

export class InteractiveNovelOrchestrator {
  private readonly configManager: InteractiveConfigManager;
  private readonly voteOptionGenerator: VoteOptionGenerator;
  /** 进程内锁：正在处理中的小说 ID */
  private readonly processing = new Set<string>();

  constructor(private deps: OrchestratorDeps) {
    this.configManager = new InteractiveConfigManager(deps.novelManager);
    this.voteOptionGenerator = new VoteOptionGenerator(deps.novelManager);
  }

  /** 支持 AI 热重载（参考 BookstoreAutoUpdateService.updateRuntimeDeps） */
  updateRuntimeDeps(partial: Partial<OrchestratorDeps>): void {
    Object.assign(this.deps, partial);
  }

  /**
   * 每分钟被 scheduler 调用：扫描所有 enabled 且非 paused 的互动小说，
   * 根据 phase 推进状态机。
   */
  async scanAndAdvance(): Promise<void> {
    // 扫描所有小说，找出 enabled 的互动小说
    const novelIds = await this.findAllInteractiveNovels();
    for (const novelId of novelIds) {
      // 防并发：同一小说串行处理
      if (this.processing.has(novelId)) continue;
      this.processing.add(novelId);
      try {
        await this.advanceNovel(novelId);
      } catch (err) {
        logger.error(`互动小说 ${novelId} 推进失败`, { error: err instanceof Error ? err.message : String(err) });
      } finally {
        this.processing.delete(novelId);
      }
    }
  }

  /** 手动启动第一轮（由 config-routes 的 start endpoint 调用） */
  async startFirstRound(novelId: string): Promise<void> {
    const config = await this.configManager.getConfig(novelId);
    if (!config?.enabled) throw new Error('该小说未开启互动模式');
    if (config.phase !== 'idle') throw new Error(`当前阶段为 ${config.phase}，无法启动`);

    // 确定起始章节号：当前最大章节号 + 1
    const novel = await this.deps.novelManager.getNovel(novelId);
    const startChapter = (novel.chapterCount ?? 0) + 1;
    await this.configManager.updatePhase(novelId, 'generating', {
      currentRound: 1,
      currentRoundStartChapter: startChapter,
    });
    logger.info(`互动小说 ${novelId} 启动第一轮，起始章节 ${startChapter}`);
  }

  /** 扫描所有小说，返回已开启互动模式的 novelId 列表 */
  private async findAllInteractiveNovels(): Promise<string[]> {
    const allNovels = await this.deps.novelManager.listNovels();
    return allNovels
      .filter((n) => {
        const cfg = n.interactiveConfig as InteractiveConfig | undefined;
        return cfg?.enabled && !cfg.paused;
      })
      .map((n) => n.id);
  }

  /** 推进单个小说的状态机 */
  private async advanceNovel(novelId: string): Promise<void> {
    const config = await this.configManager.getConfig(novelId);
    if (!config || !config.enabled || config.paused) return;

    switch (config.phase) {
      case 'idle':
        // idle 阶段不自动推进，等待作者手动 start
        break;
      case 'generating':
        await this.handleGenerating(novelId, config);
        break;
      case 'publishing':
        await this.handlePublishing(novelId, config);
        break;
      case 'vote_open':
        await this.handleVoteOpen(novelId, config);
        break;
      case 'vote_closing':
        await this.handleVoteClosing(novelId, config);
        break;
      case 'advancing':
        await this.handleAdvancing(novelId, config);
        break;
      case 'stalled':
        // stalled 不自动推进，等待作者恢复
        break;
    }
  }

  // ── generating：检查本轮章节是否已全部生成 ──
  private async handleGenerating(novelId: string, config: InteractiveConfig): Promise<void> {
    const { currentRoundStartChapter, chaptersPerRound } = config;
    // 检查本轮所有章节是否都已存在且内容非空
    for (let i = 0; i < chaptersPerRound; i++) {
      const chapterNum = currentRoundStartChapter + i;
      const chapter = await this.deps.novelManager.getChapter(novelId, chapterNum);
      if (!chapter?.content?.trim()) {
        // 该章节尚未生成，触发生成（异步，下次 tick 再检查）
        await this.triggerChapterGeneration(novelId, chapterNum, config);
        return;
      }
    }
    // 全部章节已存在，转 publishing
    await this.configManager.updatePhase(novelId, 'publishing');
    logger.info(`互动小说 ${novelId} 第 ${config.currentRound} 轮章节生成完成，转发布`);
  }

  /** 触发单章生成（异步 fire-and-forget，不等待完成） */
  private async triggerChapterGeneration(
    novelId: string,
    chapterNumber: number,
    config: InteractiveConfig,
  ): Promise<void> {
    // 检查是否已在生成中（通过 agents store 或章节是否正在写入）
    // 简化方案：检查章节是否刚刚被创建（避免重复触发）
    const existing = await this.deps.novelManager.getChapter(novelId, chapterNumber);
    if (existing?.content?.trim()) return; // 已生成

    if (!this.deps.chapterPipeline || !this.deps.modelClient) {
      logger.warn(`互动小说 ${novelId} 章节 ${chapterNumber} 生成跳过：AI 能力未就绪`);
      return;
    }

    const novel = await this.deps.novelManager.getNovel(novelId);
    const userDirection = config.lastWinningDirection ?? '';

    // 异步触发生成，不阻塞当前 tick
    void this.deps.chapterPipeline
      .fork()
      .generateChapter({
        novelId,
        chapterNumber,
        userDirection,
        startupPlatformProfile: novel.startupPlatformProfile,
        skipStrictGate: true,
      })
      .then(async (result) => {
        // 保存生成结果
        await saveGenerationResults(this.deps.novelManager, novelId, chapterNumber, result);
        // 触发后台任务（向量索引、摘要等）
        schedulePostSaveBackgroundTasks(
          this.deps.novelManager,
          this.deps.novelMemory,
          novelId,
          chapterNumber,
          result,
          this.deps.agents,
          this.deps.modelClient,
          this.deps.storyStateManager,
        );
        // 记录成本
        const cost = buildChapterCost(novelId, chapterNumber, result.agentOutputs, {
          operationType: 'generate',
          operationLabel: '互动小说自动推进',
        });
        await this.deps.novelManager.appendChapterCost(novelId, cost);
        logger.info(`互动小说 ${novelId} 章节 ${chapterNumber} 生成完成`);
      })
      .catch((err) => {
        logger.error(`互动小说 ${novelId} 章节 ${chapterNumber} 生成失败`, { error: err instanceof Error ? err.message : String(err) });
      });
  }

  // ── publishing：发布章节到书城 + 创建投票 ──
  private async handlePublishing(novelId: string, config: InteractiveConfig): Promise<void> {
    const { currentRoundStartChapter, chaptersPerRound, voteDurationHours } = config;

    // 1. 获取书城记录
    const book = await this.deps.bookStoreManager?.getBookByNovelId(novelId);
    if (!book) {
      logger.warn(`互动小说 ${novelId} 尚未发布到书城，无法发布章节`);
      await this.configManager.updatePhase(novelId, 'stalled');
      return;
    }

    const novel = await this.deps.novelManager.getNovel(novelId);

    // 2. 批量发布本轮章节
    const lastChapterNumber = currentRoundStartChapter + chaptersPerRound - 1;
    for (let chapterNum = currentRoundStartChapter; chapterNum <= lastChapterNumber; chapterNum++) {
      const chapter = await this.deps.novelManager.getChapter(novelId, chapterNum);
      if (!chapter?.content?.trim()) continue;

      const contentHash = BookStoreManager.hashContent(chapter.content);
      await this.deps.bookStoreManager!.submitChapterForAudit(book.id, chapterNum, contentHash, {
        wordCount: chapter.wordCount,
        title: chapter.title,
      });
      await this.deps.bookStoreManager!.markChapterPublished(book.id, chapterNum);
      await this.deps.auditQueueManager?.enqueue(book.id, novelId, chapterNum);
    }

    // 3. 生成本轮投票选项（在最后一章末尾）
    const plotExplorer = this.deps.agents?.get('plot-explorer');
    if (!plotExplorer || !this.deps.modelClient || !this.deps.voteService) {
      logger.warn(`互动小说 ${novelId} 投票选项生成跳过：依赖缺失`);
      // 仍转 vote_open，但无投票（下次 tick 可重试创建）
      await this.configManager.updatePhase(novelId, 'vote_open', {
        currentVoteDeadline: Date.now() + voteDurationHours * 3600_000,
      });
      return;
    }

    try {
      const generated = await this.voteOptionGenerator.generate(
        novelId,
        lastChapterNumber,
        plotExplorer,
        this.deps.modelClient,
      );

      // 4. 创建投票点
      const votePoint = this.deps.voteService.createVotePoint({
        novelId,
        chapterId: String(lastChapterNumber),
        question: generated.question,
        options: generated.options,
        deadlineHours: voteDurationHours,
        createdBy: novel.ownerId ?? 'system',
        enrichedOptions: generated.enrichedOptions,
      });

      await this.configManager.updatePhase(novelId, 'vote_open', {
        currentVoteDeadline: Date.now() + voteDurationHours * 3600_000,
        currentVotePointId: votePoint.id,
      });
      logger.info(`互动小说 ${novelId} 第 ${config.currentRound} 轮投票已开启：${votePoint.id}`);
    } catch (err) {
      logger.error(`互动小说 ${novelId} 投票创建失败`, { error: err instanceof Error ? err.message : String(err) });
      // 投票创建失败，仍进入 vote_open 但无投票 ID（下次 tick 重试）
      await this.configManager.updatePhase(novelId, 'vote_open', {
        currentVoteDeadline: Date.now() + voteDurationHours * 3600_000,
      });
    }
  }

  // ── vote_open：检查投票是否到期 ──
  private async handleVoteOpen(novelId: string, config: InteractiveConfig): Promise<void> {
    if (!config.currentVoteDeadline) return;
    if (Date.now() >= config.currentVoteDeadline) {
      await this.configManager.updatePhase(novelId, 'vote_closing');
      logger.info(`互动小说 ${novelId} 第 ${config.currentRound} 轮投票截止，开始计票`);
    }
  }

  // ── vote_closing：计票 + 判定 ──
  private async handleVoteClosing(novelId: string, config: InteractiveConfig): Promise<void> {
    if (!config.currentVotePointId || !this.deps.voteService) {
      // 无投票 ID，直接转 advancing（空轮次）
      await this.configManager.updatePhase(novelId, 'advancing');
      return;
    }

    const stats = this.deps.voteService.getVoteStats(config.currentVotePointId);

    if (stats.totalVotes < config.minVotesToAdvance) {
      // 票数不足，停滞
      await this.recordRoundHistory(novelId, config, 'stalled', stats.totalVotes, '');
      await this.configManager.updatePhase(novelId, 'stalled');
      logger.info(`互动小说 ${novelId} 第 ${config.currentRound} 轮票数不足（${stats.totalVotes}/${config.minVotesToAdvance}），停滞`);
      return;
    }

    // 票数充足，采纳胜出走向
    const voteBridge = new VoteBridge(this.deps.novelManager, this.deps.voteService);
    try {
      const result = await voteBridge.adoptWinningVote(novelId, config.currentVotePointId);
      await this.recordRoundHistory(novelId, config, 'completed', stats.totalVotes, result.winningDirection);
      await this.configManager.updatePhase(novelId, 'advancing', {
        lastWinningDirection: result.winningDirection,
      });
      logger.info(`互动小说 ${novelId} 第 ${config.currentRound} 轮投票已采纳，走向已记录`);
    } catch (err) {
      logger.error(`互动小说 ${novelId} 投票采纳失败`, { error: err instanceof Error ? err.message : String(err) });
      await this.configManager.updatePhase(novelId, 'advancing');
    }
  }

  // ── advancing：准备下一轮 ──
  private async handleAdvancing(novelId: string, config: InteractiveConfig): Promise<void> {
    const novel = await this.deps.novelManager.getNovel(novelId);
    const nextStartChapter = (novel.chapterCount ?? config.currentRoundStartChapter + config.chaptersPerRound - 1) + 1;
    await this.configManager.updatePhase(novelId, 'generating', {
      currentRound: config.currentRound + 1,
      currentRoundStartChapter: nextStartChapter,
      currentVoteDeadline: undefined,
      currentVotePointId: undefined,
    });
    logger.info(`互动小说 ${novelId} 进入第 ${config.currentRound + 1} 轮，起始章节 ${nextStartChapter}`);
  }

  /** 记录一轮历史 */
  private async recordRoundHistory(
    novelId: string,
    config: InteractiveConfig,
    outcome: 'completed' | 'stalled',
    totalVotes: number,
    winningDirection: string,
  ): Promise<void> {
    const entry: InteractiveRoundHistory = {
      round: config.currentRound,
      startChapter: config.currentRoundStartChapter,
      chapterCount: config.chaptersPerRound,
      question: '剧情走向投票',
      winningDirection,
      totalVotes,
      outcome,
      finishedAt: Date.now(),
    };
    await this.configManager.appendHistory(novelId, entry);
  }
}
