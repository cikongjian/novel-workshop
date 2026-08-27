import type { Router } from 'express';
import { buildPlotBranchPreviewMessages } from '../../../../novel/plot-branch-preview.js';
import { findBranchNode, markExplored } from '../../../../novel/plot-branch-manager.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';
import { resolveUserModelAccess } from '../../helpers/user-api-model-resolver.js';
import { BranchNodeBody, ensureNovelAccess, type PlotBranchRouterDeps } from './route-support.js';

export function registerPlotBranchPreviewRoutes(router: Router, deps: PlotBranchRouterDeps): void {
  const { authDb, broadcast, modelClient, novelManager, agents } = deps;

  router.post('/generate-preview', async (req, res) => {
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

      const [novel, outline, characters, worldEntries, currentChapter, previousChapter] = await Promise.all([
        novelManager.getNovel(novelId),
        novelManager.getOutline(novelId),
        novelManager.getCharacters(novelId),
        novelManager.getWorldEntries(novelId),
        novelManager.getChapter(novelId, node.chapterNumber),
        node.chapterNumber > 1 ? novelManager.getChapter(novelId, node.chapterNumber - 1) : Promise.resolve(null),
      ]);
      const modelAccess = await resolveUserModelAccess({
        authDb,
        userId: req.auth?.id,
        headers: req.headers,
        novel,
      });
      if (modelAccess.error && novel.modelConfig?.source === 'user-profile') {
        res.status(400).json({ error: modelAccess.error, code: 'USER_API_UNAVAILABLE' });
        return;
      }
      const activeModelClient = modelAccess.client ?? modelClient;
      if (!activeModelClient) {
        res.status(503).json({ error: 'AI 模型未就绪，无法生成分支预览' });
        return;
      }

      const messages = buildPlotBranchPreviewMessages({
        novel,
        node,
        outline,
        currentChapterSummary: currentChapter?.summary || currentChapter?.content?.slice(0, 1200) || '',
        previousChapterSummary: previousChapter?.summary || previousChapter?.content?.slice(0, 800) || '',
        characters,
        worldEntries,
      });

      broadcast?.({
        type: 'agent:chunk',
        agentRole: 'plot-explorer',
        novelId,
        data: `正在为分支「${node.title}」生成剧情预览...`,
        timestamp: new Date().toISOString(),
      });

      const response = await activeModelClient.chat(messages, { temperature: 0.85, maxTokens: 1600 });
      const previewContent = response.content.trim();
      tree = markExplored(tree, node.id, previewContent);
      await novelManager.savePlotBranchTree(novelId, tree);

      res.json({
        tree,
        nodeId: node.id,
        previewContent,
        usedAgent: agents?.has('plot-explorer') ?? false,
      });
    } catch (err) {
      const message = safeErrorMessage(err, '生成分支预览失败');
      res.status(500).json({ error: message });
    }
  });
}
