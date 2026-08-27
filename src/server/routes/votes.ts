/**
 * 剧情投票路由 — 作者创建投票点，读者投票，查看结果。
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { VoteService } from '../../services/vote-service.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { AuthDb } from '../../auth/types.js';
import type { ModelClient } from '../../models/types.js';
import type { ChatMessage } from '../../models/types.js';
import type { NovelAgent } from '../../agents/types.js';
import { parseJsonPayload } from '../../utils/json-payload.js';
import { VoteOptionGenerator } from '../../interactive/vote-option-generator.js';

export function createVoteRouter(
  voteService: VoteService,
  novelManager: NovelManager,
  authDb?: AuthDb,
  modelClient?: ModelClient,
  agents?: Map<string, NovelAgent>,
): Router {
  const router = Router();
  const voteOptionGenerator = new VoteOptionGenerator(novelManager);

  /** 获取 userId */
  function getUserId(req: Request): string | null {
    return req.auth?.id ?? null;
  }

  /** 检查小说所有权 */
  async function checkOwnership(req: Request, res: Response, novelId: string): Promise<boolean> {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: '请先登录' });
      return false;
    }
    const novel = await novelManager.getNovel(novelId);
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

  // ── 作者：创建投票点 ──
  router.post('/', async (req, res) => {
    try {
      const { novelId, chapterId, question, options, deadlineHours } = req.body as {
        novelId: string;
        chapterId: string;
        question: string;
        options: string[];
        deadlineHours: number;
      };
      if (!(await checkOwnership(req, res, novelId))) return;
      if (!chapterId || !question?.trim() || !Array.isArray(options) || options.length < 2 || options.length > 4) {
        res.status(400).json({ error: '参数无效：需要 chapterId、question、2-4 个选项' });
        return;
      }
      if (!deadlineHours || deadlineHours < 1) {
        res.status(400).json({ error: '截止时间无效' });
        return;
      }
      const userId = getUserId(req)!;
      const vp = voteService.createVotePoint({
        novelId,
        chapterId,
        question: question.trim(),
        options: options.map((o) => o.trim()).filter(Boolean),
        deadlineHours,
        createdBy: userId,
      });
      res.json(vp);
    } catch (err) {
      console.error('[votes] create error:', err);
      res.status(500).json({ error: '创建投票点失败' });
    }
  });

  // ── 作者：更新投票点 ──
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const vp = voteService.getVotePoint(id);
      if (!vp) {
        res.status(404).json({ error: '投票点不存在' });
        return;
      }
      if (!(await checkOwnership(req, res, vp.novelId))) return;
      const updates = req.body as { question?: string; options?: string[]; deadlineHours?: number };
      const updated = voteService.updateVotePoint(id, updates);
      res.json(updated);
    } catch (err) {
      console.error('[votes] update error:', err);
      res.status(500).json({ error: '更新投票点失败' });
    }
  });

  // ── 作者：删除投票点 ──
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const vp = voteService.getVotePoint(id);
      if (!vp) {
        res.status(404).json({ error: '投票点不存在' });
        return;
      }
      if (!(await checkOwnership(req, res, vp.novelId))) return;
      voteService.deleteVotePoint(id);
      res.json({ success: true });
    } catch (err) {
      console.error('[votes] delete error:', err);
      res.status(500).json({ error: '删除投票点失败' });
    }
  });

  // ── 作者：手动关闭投票 ──
  router.post('/:id/close', async (req, res) => {
    try {
      const { id } = req.params;
      const vp = voteService.getVotePoint(id);
      if (!vp) {
        res.status(404).json({ error: '投票点不存在' });
        return;
      }
      if (!(await checkOwnership(req, res, vp.novelId))) return;
      const closed = voteService.closeVotePoint(id);
      res.json(closed);
    } catch (err) {
      console.error('[votes] close error:', err);
      res.status(500).json({ error: '关闭投票失败' });
    }
  });

  // ── 作者：采纳/不采纳投票结果 ──
  router.post('/:id/adopt', async (req, res) => {
    try {
      const { id } = req.params;
      const { adopted } = req.body as { adopted: boolean };
      const vp = voteService.getVotePoint(id);
      if (!vp) {
        res.status(404).json({ error: '投票点不存在' });
        return;
      }
      if (!(await checkOwnership(req, res, vp.novelId))) return;
      const updated = voteService.adoptVotePoint(id, adopted);
      res.json(updated);
    } catch (err) {
      console.error('[votes] adopt error:', err);
      res.status(500).json({ error: '操作失败' });
    }
  });

  // ── 查询：按章节获取投票点（读者 + 作者都用） ──
  router.get('/by-chapter/:novelId/:chapterId', async (req, res) => {
    try {
      const { novelId, chapterId } = req.params;
      const vp = voteService.getVotePointByChapter(novelId, chapterId);
      if (!vp) {
        res.json(null);
        return;
      }
      const stats = voteService.getVoteStats(vp.id);
      const userId = getUserId(req);
      const readerVote = userId ? voteService.getReaderVote(vp.id, userId) : null;
      res.json({
        ...vp,
        stats,
        myVote: readerVote,
      });
    } catch (err) {
      console.error('[votes] by-chapter error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // ── 查询：按小说列出所有投票点（作者用） ──
  router.get('/by-novel/:novelId', async (req, res) => {
    try {
      const { novelId } = req.params;
      if (!(await checkOwnership(req, res, novelId))) return;
      const list = voteService.listVotePointsByNovel(novelId);
      const result = list.map((vp) => ({
        ...vp,
        stats: voteService.getVoteStats(vp.id),
      }));
      res.json(result);
    } catch (err) {
      console.error('[votes] by-novel error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // ── 读者：投票 ──
  router.post('/:id/vote', async (req, res) => {
    try {
      const { id } = req.params;
      const { optionId } = req.body as { optionId: string };
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const result = voteService.castVote(id, optionId, userId);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[votes] cast error:', err);
      res.status(500).json({ error: '投票失败' });
    }
  });

  // ── 作者：AI 生成投票选项 ──
  router.post('/ai-options', async (req, res) => {
    try {
      const { novelId, chapterId } = req.body as { novelId: string; chapterId: string };
      if (!(await checkOwnership(req, res, novelId))) return;
      if (!modelClient) {
        res.status(503).json({ error: 'AI 服务暂不可用' });
        return;
      }

      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      const chapterNumber = parseInt(chapterId, 10);
      if (!Number.isFinite(chapterNumber) || chapterNumber < 1) {
        res.status(400).json({ error: '章节号无效' });
        return;
      }

      // 优先使用 PlotExplorerAgent（富上下文：大纲/角色/世界观/伏笔）
      const plotExplorer = agents?.get('plot-explorer');
      if (plotExplorer) {
        try {
          const generated = await voteOptionGenerator.generate(
            novelId,
            chapterNumber,
            plotExplorer,
            modelClient,
          );
          res.json({
            question: generated.question,
            options: generated.options,
            enrichedOptions: generated.enrichedOptions,
          });
          return;
        } catch (genErr) {
          console.warn('[votes] PlotExplorerAgent 生成失败，回退到兜底逻辑:', genErr);
        }
      }

      // 兜底：原有内联 prompt（上下文较弱，但保证可用性）
      const chapter = await novelManager.getChapter(novelId, chapterNumber);
      const chapterContent = chapter?.content || '';
      const chapterTitle = chapter?.title || `第 ${chapterNumber} 章`;
      const novelSynopsis = novel.synopsis || novel.description || '';
      const novelTitle = novel.title;

      const recentContent = chapterContent.length > 3000
        ? chapterContent.slice(-3000)
        : chapterContent;

      const systemPrompt = `你是一位资深小说编辑，擅长设计引人入胜的剧情分叉点。
根据当前小说的剧情走向，为下一章设计 ${3} 个截然不同的剧情发展方向选项。

要求：
1. 每个选项 10-30 字，简洁有力
2. 选项之间要有明显差异（比如：情感线/冲突线/悬疑线）
3. 选项要基于当前章节的剧情自然延伸，不能凭空捏造
4. 每个选项都要让读者期待后续发展

返回 JSON 格式：
{"question": "下一章的剧情走向？", "options": ["选项A", "选项B", "选项C"]}`;

      const userContent = `小说标题：${novelTitle}
小说简介：${novelSynopsis}

当前章节：第 ${chapterNumber} 章「${chapterTitle}」
当前章节正文（末尾部分）：
"""
${recentContent || '（暂无正文内容，请根据小说简介推演）'}
"""

请基于以上内容，设计下一章的剧情分叉选项。`;

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ];

      const response = await modelClient.chat(messages, {
        temperature: 0.85,
        maxTokens: 800,
      });

      const parsed = parseJsonPayload(response.content) as
        | { question?: string; options?: string[] }
        | null;

      if (!parsed?.options || !Array.isArray(parsed.options) || parsed.options.length < 2) {
        res.status(500).json({ error: 'AI 生成选项解析失败，请重试' });
        return;
      }

      const options = parsed.options
        .map((o) => String(o).trim())
        .filter((o) => o.length > 0)
        .slice(0, 4);

      if (options.length < 2) {
        res.status(500).json({ error: 'AI 生成的选项不足，请重试' });
        return;
      }

      res.json({
        question: parsed.question?.trim() || '下一章的剧情走向？',
        options,
      });
    } catch (err) {
      console.error('[votes] ai-options error:', err);
      res.status(500).json({ error: 'AI 生成选项失败' });
    }
  });

  return router;
}
