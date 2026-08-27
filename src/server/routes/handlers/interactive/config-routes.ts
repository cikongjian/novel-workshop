/**
 * 互动小说路由 handler —— 配置管理。
 *
 * 职责：处理互动模式的开启/关闭/暂停/恢复/参数更新/查询。
 * 本文件只做 HTTP 编排（请求校验 + 调 service + 响应封装），
 * 业务逻辑在 InteractiveConfigManager / VoteBridge 中。
 */

import type { Router, Request, Response } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import type { AuthDb } from '../../../../auth/types.js';
import type { BookStoreManager } from '../../../../bookstore/bookstore-manager.js';
import { InteractiveConfigManager } from '../../../../interactive/interactive-config-manager.js';
import { VoteBridge } from '../../../../interactive/vote-bridge.js';
import type { InteractiveNovelOrchestrator } from '../../../../interactive/interactive-orchestrator.js';
import type { VoteService } from '../../../../services/vote-service.js';
import {
  CHAPTERS_PER_ROUND_OPTIONS,
  VOTE_DURATION_OPTIONS,
  isValidMinVotes,
} from '../../../../interactive/types.js';

/** 书城系统保留标签：互动小说 */
const INTERACTIVE_TAG = '互动连载';

export interface InteractiveRouteDeps {
  novelManager: NovelManager;
  authDb?: AuthDb;
  bookStoreManager?: BookStoreManager;
  voteService?: VoteService;
  orchestrator?: InteractiveNovelOrchestrator;
}

export function registerInteractiveConfigRoutes(router: Router, deps: InteractiveRouteDeps): void {
  const configManager = new InteractiveConfigManager(deps.novelManager);
  const voteBridge = deps.voteService ? new VoteBridge(deps.novelManager, deps.voteService) : null;

  /** 获取 userId */
  function getUserId(req: Request): string | null {
    return req.auth?.id ?? null;
  }

  /** 鉴权：作者本人或管理员 */
  async function checkOwnership(req: Request, res: Response, novelId: string): Promise<boolean> {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: '请先登录' });
      return false;
    }
    const novel = await deps.novelManager.getNovel(novelId);
    if (!novel) {
      res.status(404).json({ error: '小说不存在' });
      return false;
    }
    if (novel.ownerId !== userId && req.auth?.role !== 'admin') {
      res.status(403).json({ error: '无权操作' });
      return false;
    }
    return true;
  }

  /** 同步书城标签（开启/关闭互动模式时调用） */
  async function syncBookstoreTag(novelId: string, add: boolean): Promise<void> {
    if (!deps.bookStoreManager) return;
    try {
      const book = await deps.bookStoreManager.getBookByNovelId(novelId);
      if (!book) return; // 尚未发布到书城，无需同步
      const has = book.tags.includes(INTERACTIVE_TAG);
      if (add && !has) {
        await deps.bookStoreManager.updateBook(book.id, book.userId, {
          tags: [...book.tags, INTERACTIVE_TAG],
        });
      } else if (!add && has) {
        await deps.bookStoreManager.updateBook(book.id, book.userId, {
          tags: book.tags.filter((t) => t !== INTERACTIVE_TAG),
        });
      }
    } catch {
      // 书城标签同步失败不应阻断互动模式开关本身
    }
  }

  // ── 查询互动配置 ──
  router.get('/:novelId/interactive', async (req, res) => {
    try {
      const { novelId } = req.params;
      if (!(await checkOwnership(req, res, novelId))) return;
      const config = await configManager.getConfig(novelId);
      res.json({ config });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  // ── 开启互动模式 ──
  router.post('/:novelId/interactive/enable', async (req, res) => {
    try {
      const { novelId } = req.params;
      if (!(await checkOwnership(req, res, novelId))) return;

      const { chaptersPerRound, voteDurationHours, minVotesToAdvance } = req.body ?? {};
      const config = await configManager.enable(novelId, {
        chaptersPerRound: typeof chaptersPerRound === 'number' ? chaptersPerRound : undefined,
        voteDurationHours: typeof voteDurationHours === 'number' ? voteDurationHours : undefined,
        minVotesToAdvance: typeof minVotesToAdvance === 'number' ? minVotesToAdvance : undefined,
      });

      await syncBookstoreTag(novelId, true);
      res.json({ config });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : '开启失败' });
    }
  });

  // ── 关闭互动模式 ──
  router.post('/:novelId/interactive/disable', async (req, res) => {
    try {
      const { novelId } = req.params;
      if (!(await checkOwnership(req, res, novelId))) return;

      await configManager.disable(novelId);
      await syncBookstoreTag(novelId, false);
      res.json({ success: true });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : '关闭失败' });
    }
  });

  // ── 更新参数 ──
  router.put('/:novelId/interactive/config', async (req, res) => {
    try {
      const { novelId } = req.params;
      if (!(await checkOwnership(req, res, novelId))) return;

      const { chaptersPerRound, voteDurationHours, minVotesToAdvance } = req.body ?? {};
      const updates: Record<string, number> = {};
      if (chaptersPerRound !== undefined) {
        if (!(CHAPTERS_PER_ROUND_OPTIONS as readonly number[]).includes(chaptersPerRound)) {
          res.status(400).json({ error: 'chaptersPerRound 取值非法' });
          return;
        }
        updates.chaptersPerRound = chaptersPerRound;
      }
      if (voteDurationHours !== undefined) {
        if (!(VOTE_DURATION_OPTIONS as readonly number[]).includes(voteDurationHours)) {
          res.status(400).json({ error: 'voteDurationHours 取值非法' });
          return;
        }
        updates.voteDurationHours = voteDurationHours;
      }
      if (minVotesToAdvance !== undefined) {
        if (!isValidMinVotes(minVotesToAdvance)) {
          res.status(400).json({ error: 'minVotesToAdvance 取值非法' });
          return;
        }
        updates.minVotesToAdvance = minVotesToAdvance;
      }

      const config = await configManager.updateParams(novelId, updates);
      res.json({ config });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : '更新失败' });
    }
  });

  // ── 暂停自动推进 ──
  router.post('/:novelId/interactive/pause', async (req, res) => {
    try {
      const { novelId } = req.params;
      if (!(await checkOwnership(req, res, novelId))) return;
      const config = await configManager.pause(novelId);
      res.json({ config });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : '暂停失败' });
    }
  });

  // ── 恢复自动推进 ──
  router.post('/:novelId/interactive/resume', async (req, res) => {
    try {
      const { novelId } = req.params;
      if (!(await checkOwnership(req, res, novelId))) return;
      const config = await configManager.resume(novelId);
      res.json({ config });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : '恢复失败' });
    }
  });

  // ── 启动第一轮自动推进（idle → generating） ──
  router.post('/:novelId/interactive/start', async (req, res) => {
    try {
      const { novelId } = req.params;
      if (!(await checkOwnership(req, res, novelId))) return;
      if (!deps.orchestrator) {
        res.status(503).json({ error: '自动推进服务未就绪' });
        return;
      }
      await deps.orchestrator.startFirstRound(novelId);
      const config = await configManager.getConfig(novelId);
      res.json({ config });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : '启动失败' });
    }
  });

  // ── 手动采纳投票结果（供作者主动确认，或停滞时指定走向） ──
  router.post('/:novelId/interactive/adopt-vote', async (req, res) => {
    try {
      const { novelId } = req.params;
      if (!(await checkOwnership(req, res, novelId))) return;
      const { votePointId } = req.body ?? {};
      if (!votePointId || typeof votePointId !== 'string') {
        res.status(400).json({ error: '缺少 votePointId' });
        return;
      }
      if (!voteBridge) {
        res.status(503).json({ error: '投票服务不可用' });
        return;
      }
      const result = await voteBridge.adoptWinningVote(novelId, votePointId);
      await configManager.updatePhase(novelId, 'advancing', {
        lastWinningDirection: result.winningDirection,
      });
      res.json({ winningDirection: result.winningDirection });
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : '采纳失败' });
    }
  });
}
