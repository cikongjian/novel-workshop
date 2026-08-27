import type { Router } from 'express';
import {
  addBranchNodes,
  abandonBranch,
  backtrackTo,
  buildTreeGraph,
  findBranchNode,
  markExplored,
  selectBranch,
} from '../../../../novel/plot-branch-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import {
  AddBranchNodesBody,
  BranchNodeBody,
  ensureNovelAccess,
  ExploreBranchBody,
  type PlotBranchRouterDeps,
} from './route-support.js';

export function registerPlotBranchTreeRoutes(router: Router, deps: PlotBranchRouterDeps): void {
  const { novelManager } = deps;

  router.get('/', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      if (!(await ensureNovelAccess(req, res, novelManager, novelId))) {
        return;
      }
      const tree = await novelManager.getPlotBranchTree(novelId);
      res.json(tree);
    } catch (err) {
      const message = safeErrorMessage(err, '获取情节分支失败');
      res.status(500).json({ error: message });
    }
  });

  router.get('/graph', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      if (!(await ensureNovelAccess(req, res, novelManager, novelId))) {
        return;
      }
      const tree = await novelManager.getPlotBranchTree(novelId);
      res.json(buildTreeGraph(tree));
    } catch (err) {
      const message = safeErrorMessage(err, '获取分支图失败');
      res.status(500).json({ error: message });
    }
  });

  router.post('/add', async (req, res) => {
    try {
      const parsed = AddBranchNodesBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }

      const { novelId } = req.params as Record<string, string>;
      if (!(await ensureNovelAccess(req, res, novelManager, novelId))) {
        return;
      }
      const { parentId = null, chapterNumber, branches } = parsed.data;
      let tree = await novelManager.getPlotBranchTree(novelId);

      if (parentId && !findBranchNode(tree, parentId)) {
        res.status(404).json({ error: '父分支不存在' });
        return;
      }

      const previousIds = new Set(tree.nodes.map((node) => node.id));
      tree = addBranchNodes(tree, parentId, chapterNumber, branches);
      await novelManager.savePlotBranchTree(novelId, tree);

      const addedNodeIds = tree.nodes
        .filter((node) => !previousIds.has(node.id))
        .map((node) => node.id);

      res.status(201).json({ tree, addedNodeIds });
    } catch (err) {
      const message = safeErrorMessage(err, '新增分支失败');
      res.status(500).json({ error: message });
    }
  });

  router.post('/select', async (req, res) => {
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
      tree = selectBranch(tree, parsed.data.nodeId);
      await novelManager.savePlotBranchTree(novelId, tree);
      res.json(tree);
    } catch (err) {
      const message = safeErrorMessage(err, '选择分支失败');
      res.status(500).json({ error: message });
    }
  });

  router.post('/abandon', async (req, res) => {
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
      tree = abandonBranch(tree, parsed.data.nodeId);
      await novelManager.savePlotBranchTree(novelId, tree);
      res.json(tree);
    } catch (err) {
      const message = safeErrorMessage(err, '放弃分支失败');
      res.status(500).json({ error: message });
    }
  });

  router.post('/backtrack', async (req, res) => {
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
      tree = backtrackTo(tree, parsed.data.nodeId);
      await novelManager.savePlotBranchTree(novelId, tree);
      res.json(tree);
    } catch (err) {
      const message = safeErrorMessage(err, '回溯分支失败');
      res.status(500).json({ error: message });
    }
  });

  router.post('/explore', async (req, res) => {
    try {
      const { novelId } = req.params as Record<string, string>;
      if (!(await ensureNovelAccess(req, res, novelManager, novelId))) {
        return;
      }
      const parsed = ExploreBranchBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? '参数错误' });
        return;
      }
      let tree = await novelManager.getPlotBranchTree(novelId);
      tree = markExplored(tree, parsed.data.nodeId, parsed.data.previewContent ?? '');
      await novelManager.savePlotBranchTree(novelId, tree);
      res.json(tree);
    } catch (err) {
      const message = safeErrorMessage(err, '探索分支失败');
      res.status(500).json({ error: message });
    }
  });
}
