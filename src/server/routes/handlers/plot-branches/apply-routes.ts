import type { Router } from 'express';
import { applyPlotBranchToOutline } from '../../../../novel/plot-branch-outline.js';
import { commitBranch, findBranchNode } from '../../../../novel/plot-branch-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  BranchNodeBody,
  ensureNovelAccess,
  ForkBranchBody,
  tryAttachForkToUniverse,
  type PlotBranchRouterDeps,
} from './route-support.js';

export function registerPlotBranchApplyRoutes(router: Router, deps: PlotBranchRouterDeps): void {
  const { novelManager, universeManager } = deps;

  router.post('/apply', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      if (!(await ensureNovelAccess(req, res, novelManager, novelId))) {
        return;
      }
      const parsed = BranchNodeBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }

      let tree = await novelManager.getPlotBranchTree(novelId);
      const node = findBranchNode(tree, parsed.data.nodeId);
      if (!node) {
        res.status(404).json({ error: '分支节点不存在' });
        return;
      }

      const outline = await novelManager.getOutline(novelId);
      const updatedOutline = applyPlotBranchToOutline(outline, node);
      tree = commitBranch(tree, node.id, node.chapterNumber);

      await Promise.all([
        novelManager.saveOutline(novelId, updatedOutline),
        novelManager.savePlotBranchTree(novelId, tree),
      ]);

      res.json({
        tree,
        outline: updatedOutline,
        nodeId: node.id,
        appliedChapterNumber: node.chapterNumber,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '应用分支失败');
      res.status(500).json({ error: message });
    }
  });

  router.post('/fork', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      if (!(await ensureNovelAccess(req, res, novelManager, novelId))) {
        return;
      }
      const parsed = ForkBranchBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }

      let tree = await novelManager.getPlotBranchTree(novelId);
      const node = findBranchNode(tree, parsed.data.nodeId);
      if (!node) {
        res.status(404).json({ error: '分支节点不存在' });
        return;
      }

      const forkedNovel = await novelManager.forkNovel(
        novelId,
        node.chapterNumber,
        parsed.data.newTitle,
        req.auth?.id ?? 'dev',
      );
      const sourceNovel = await novelManager.getNovel(novelId);
      await tryAttachForkToUniverse(
        universeManager,
        novelId,
        sourceNovel.title,
        forkedNovel,
        node.chapterNumber,
      ).catch(() => {});

      tree = commitBranch(tree, node.id, node.chapterNumber);
      await novelManager.savePlotBranchTree(novelId, tree);

      res.status(201).json({
        tree,
        forkedNovel,
        nodeId: node.id,
        appliedChapterNumber: node.chapterNumber,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '创建分支副本失败');
      if (message.includes('不存在') || message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });
}
