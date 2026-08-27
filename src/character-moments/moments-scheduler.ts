/**
 * 角色朋友圈定时调度器
 * 每隔 N 小时自动为各小说的活跃角色生成朋友圈动态。
 * 参考 trends-scheduler.ts 的 setTimeout 链式调度模式。
 */
import type { MomentsGenerator } from '../character-moments/moments-generator.js';
import type { NovelManager } from '../novel/novel-manager.js';
import type { NovelAgent } from '../agents/types.js';
import type { ModelClient } from '../models/types.js';
import type { MomentType } from '../character-moments/types.js';
import { getConfig } from '../config/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('moments-scheduler');

/** 默认调度间隔：6 小时 */
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class MomentsScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly intervalMs: number;

  constructor(
    private readonly momentsGenerator: MomentsGenerator,
    private readonly novelManager: NovelManager,
    private readonly agents?: Map<string, NovelAgent>,
    private readonly modelClient?: ModelClient,
    intervalMs: number = DEFAULT_INTERVAL_MS,
  ) {
    this.intervalMs = intervalMs;
  }

  /** 启动调度 */
  start(): void {
    this.scheduleNext();
    log.info(`角色朋友圈调度已启动，每 ${(this.intervalMs / 3_600_000).toFixed(1)} 小时刷新一次`);
  }

  /** 停止调度 */
  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 调度下一次执行 */
  private scheduleNext(): void {
    this.timer = setTimeout(() => {
      void this.runAndReschedule();
    }, this.intervalMs);
  }

  /** 执行一次并重新调度 */
  private async runAndReschedule(): Promise<void> {
    try {
      await this.runOnce();
    } catch (err) {
      log.error('朋友圈定时生成失败', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    this.scheduleNext();
  }

  /** 检查小说是否章节闲置过久，如是不再自动发帖。从系统配置读取空窗时长。 */
  private async isNovelChapterIdle(novelId: string): Promise<boolean> {
    const cfg = getConfig();
    const hours = cfg.momentsIdleCooldownHours;
    if (hours <= 0) return false; // 0 = 不限制，始终允许发帖

    try {
      const chapters = await this.novelManager.listChapters?.(novelId) ?? [];
      if (chapters.length === 0) return false; // 还没写过章节，允许发帖
      let latest = 0;
      for (const ch of chapters) {
        const t = ch.updatedAt ? new Date(ch.updatedAt).getTime() : 0;
        if (t > latest) latest = t;
      }
      if (latest === 0) return false;
      return Date.now() - latest > hours * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }

  /** 执行一次：遍历小说，为每本挑角色生成动态 */
  async runOnce(): Promise<void> {
    if (!this.agents || !this.modelClient) {
      log.warn('AI 能力未就绪，跳过朋友圈调度');
      return;
    }

    const novels = await this.novelManager.listNovels();
    let totalGenerated = 0;

    for (const novel of novels) {
      try {
        // 章节已闲置超过 24 小时，跳过发帖以节省 token
        if (await this.isNovelChapterIdle(novel.id)) {
          continue;
        }

        const characters = await this.novelManager.getCharacters?.(novel.id) ?? [];
        const candidates = (characters as any[]).filter((c) =>
          c.status !== 'dead' &&
          c.status !== 'exited' &&
          c.momentsEnabled !== false &&
          c.name && c.name.length >= 2,
        );
        if (candidates.length === 0) continue;

        // 随机选 1 个角色
        const character = candidates[Math.floor(Math.random() * candidates.length)];
        // 随机选类型（mood/daily 为主，dream/reveal 极小概率，night 看时段）
        const types: MomentType[] = ['mood', 'daily'];
        // 10% 概率发梦境帖
        if (Math.random() < 0.1) types.push('dream');
        // 8% 概率发爆料帖
        if (Math.random() < 0.08) types.push('reveal');
        // 21:00-24:00 间加入深夜话题类型
        const hour = new Date().getHours();
        if (hour >= 21 && hour <= 23) types.push('night');
        // 公开挑衅：反派 + 主角同时存在时 15% 概率
        const hasProtagonist = candidates.some((c: any) => c.role === 'protagonist');
        const antagonist = candidates.find((c: any) => c.role === 'antagonist');
        if (hasProtagonist && antagonist && Math.random() < 0.15) {
          // 强制选反派发挑战帖
          types.push('challenge');
          // 把反派设为选中角色
          Object.assign(character, antagonist);
        }
        const type = types[Math.floor(Math.random() * types.length)];

        const result = await this.momentsGenerator.generateMoment({
          novelId: novel.id,
          characterId: character.id,
          type,
          agents: this.agents,
          modelClient: this.modelClient,
        });

        if ('momentId' in result) {
          totalGenerated++;
          // 50% 概率生成互评
          if (Math.random() < 0.5) {
            await this.momentsGenerator.generateCommentsForMoment({
              momentId: result.momentId,
              agents: this.agents,
              modelClient: this.modelClient,
            });
          }
          log.info(`已为《${novel.title}》角色「${character.name}」生成朋友圈动态`);
        }
      } catch (err) {
        log.warn(`小说 ${novel.id} 朋友圈生成失败`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (totalGenerated > 0) {
      log.info(`朋友圈调度完成，共生成 ${totalGenerated} 条动态`);
    }
  }
}
