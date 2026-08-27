/**
 * 互动小说配置管理器。
 *
 * 职责：读写 NovelMetadata.interactiveConfig 字段。
 * 它是纯数据访问层，不做任何业务逻辑（不调 AI、不触发生成、不写书城）。
 * 业务编排由 InteractiveNovelOrchestrator 负责（阶段 2）。
 *
 * 所有写操作基于 NovelManager.updateNovel 的 Partial 语义，
 * 只更新 interactiveConfig 字段，不影响小说其他元数据。
 */

import type { NovelManager } from '../novel/novel-manager.js';
import type {
  InteractiveConfig,
  InteractivePhase,
  InteractiveRoundHistory,
} from './types.js';
import {
  DEFAULT_INTERACTIVE_CONFIG,
  MAX_HISTORY_ENTRIES,
  isValidChaptersPerRound,
  isValidMinVotes,
  isValidVoteDuration,
} from './types.js';

/** 开启互动模式时的可配置参数 */
export interface EnableInteractiveParams {
  /** 每轮章节数（默认 1） */
  chaptersPerRound?: number;
  /** 投票时长（小时，默认 24） */
  voteDurationHours?: number;
  /** 最低推进票数（默认 3） */
  minVotesToAdvance?: number;
}

/** 更新互动配置的部分参数（不含 enabled/phase 等内部状态字段） */
export interface UpdateInteractiveParams {
  chaptersPerRound?: number;
  voteDurationHours?: number;
  minVotesToAdvance?: number;
}

export class InteractiveConfigManager {
  constructor(private readonly novelManager: NovelManager) {}

  /** 读取互动配置（未开启则返回 null） */
  async getConfig(novelId: string): Promise<InteractiveConfig | null> {
    const novel = await this.novelManager.getNovel(novelId);
    // NovelMetadata.interactiveConfig 在 schema 中是 z.unknown()（避免循环依赖），
    // 这里做一次类型断言；结构正确性由本 manager 的写入方法保证
    return (novel.interactiveConfig as InteractiveConfig | undefined) ?? null;
  }

  /** 判断小说是否已开启互动模式 */
  async isEnabled(novelId: string): Promise<boolean> {
    const config = await this.getConfig(novelId);
    return config?.enabled === true;
  }

  /** 开启互动模式（初始化默认配置，phase=idle） */
  async enable(novelId: string, params: EnableInteractiveParams = {}): Promise<InteractiveConfig> {
    const chaptersPerRound = params.chaptersPerRound ?? DEFAULT_INTERACTIVE_CONFIG.chaptersPerRound;
    const voteDurationHours = params.voteDurationHours ?? DEFAULT_INTERACTIVE_CONFIG.voteDurationHours;
    const minVotesToAdvance = params.minVotesToAdvance ?? DEFAULT_INTERACTIVE_CONFIG.minVotesToAdvance;

    if (!isValidChaptersPerRound(chaptersPerRound)) {
      throw new Error(`chaptersPerRound 取值非法，合法值为 1/2/3`);
    }
    if (!isValidVoteDuration(voteDurationHours)) {
      throw new Error(`voteDurationHours 取值非法，合法值为 12/24/48/72`);
    }
    if (!isValidMinVotes(minVotesToAdvance)) {
      throw new Error(`minVotesToAdvance 取值非法，范围为 0-100`);
    }

    const config: InteractiveConfig = {
      enabled: true,
      paused: false,
      phase: 'idle',
      currentRound: 0,
      currentRoundStartChapter: 0,
      chaptersPerRound,
      voteDurationHours,
      minVotesToAdvance,
      history: [],
    };

    await this.novelManager.updateNovel(novelId, { interactiveConfig: config });
    return config;
  }

  /** 关闭互动模式（移除 interactiveConfig 字段） */
  async disable(novelId: string): Promise<void> {
    await this.novelManager.updateNovel(novelId, { interactiveConfig: undefined });
  }

  /** 更新可配置参数（chaptersPerRound/voteDurationHours/minVotesToAdvance） */
  async updateParams(novelId: string, params: UpdateInteractiveParams): Promise<InteractiveConfig> {
    const config = await this.requireEnabled(novelId);
    const next: InteractiveConfig = { ...config };

    if (params.chaptersPerRound !== undefined) {
      if (!isValidChaptersPerRound(params.chaptersPerRound)) {
        throw new Error('chaptersPerRound 取值非法，合法值为 1/2/3');
      }
      next.chaptersPerRound = params.chaptersPerRound;
    }
    if (params.voteDurationHours !== undefined) {
      if (!isValidVoteDuration(params.voteDurationHours)) {
        throw new Error('voteDurationHours 取值非法，合法值为 12/24/48/72');
      }
      next.voteDurationHours = params.voteDurationHours;
    }
    if (params.minVotesToAdvance !== undefined) {
      if (!isValidMinVotes(params.minVotesToAdvance)) {
        throw new Error('minVotesToAdvance 取值非法，范围为 0-100');
      }
      next.minVotesToAdvance = params.minVotesToAdvance;
    }

    await this.novelManager.updateNovel(novelId, { interactiveConfig: next });
    return next;
  }

  /** 暂停自动推进（enabled 保持 true，作者可恢复） */
  async pause(novelId: string): Promise<InteractiveConfig> {
    const config = await this.requireEnabled(novelId);
    if (config.paused) return config;
    const next: InteractiveConfig = { ...config, paused: true };
    await this.novelManager.updateNovel(novelId, { interactiveConfig: next });
    return next;
  }

  /** 恢复自动推进 */
  async resume(novelId: string): Promise<InteractiveConfig> {
    const config = await this.requireEnabled(novelId);
    if (!config.paused) return config;
    const next: InteractiveConfig = { ...config, paused: false };
    await this.novelManager.updateNovel(novelId, { interactiveConfig: next });
    return next;
  }

  /**
   * 更新推进阶段（供 orchestrator/scheduler 使用）。
   * 可同时更新关联字段（投票截止时间、投票 ID、胜出走向等）。
   */
  async updatePhase(
    novelId: string,
    phase: InteractivePhase,
    extra: Partial<Pick<InteractiveConfig,
      'currentRound' | 'currentRoundStartChapter' |
      'currentVoteDeadline' | 'currentVotePointId' |
      'lastWinningDirection'>> = {},
  ): Promise<InteractiveConfig> {
    const config = await this.requireEnabled(novelId);
    const next: InteractiveConfig = { ...config, phase, ...extra };
    await this.novelManager.updateNovel(novelId, { interactiveConfig: next });
    return next;
  }

  /** 追加一轮历史记录（自动截断到 MAX_HISTORY_ENTRIES） */
  async appendHistory(novelId: string, entry: InteractiveRoundHistory): Promise<InteractiveConfig> {
    const config = await this.requireEnabled(novelId);
    const history = [...config.history, entry];
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.splice(0, history.length - MAX_HISTORY_ENTRIES);
    }
    const next: InteractiveConfig = { ...config, history };
    await this.novelManager.updateNovel(novelId, { interactiveConfig: next });
    return next;
  }

  /** 清除当前轮次的投票相关字段（用于轮次切换时重置） */
  async clearCurrentVote(novelId: string): Promise<InteractiveConfig> {
    const config = await this.requireEnabled(novelId);
    const next: InteractiveConfig = {
      ...config,
      currentVoteDeadline: undefined,
      currentVotePointId: undefined,
    };
    await this.novelManager.updateNovel(novelId, { interactiveConfig: next });
    return next;
  }

  /** 要求小说已开启互动模式，否则抛错（内部辅助方法） */
  private async requireEnabled(novelId: string): Promise<InteractiveConfig> {
    const config = await this.getConfig(novelId);
    if (!config || !config.enabled) {
      throw new Error('该小说未开启互动模式，请先调用 enable');
    }
    return config;
  }
}
