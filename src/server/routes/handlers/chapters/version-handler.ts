import type { Router } from 'express';
import type { NovelManager } from '../../../../novel/novel-manager.js';
import { computeLineDiff, diffSummary } from '../../../../novel/text-diff.js';
import { safeErrorMessage } from '../../../middleware/safe-error-reply.js';

export interface ChapterVersionDeps {
  novelManager: NovelManager;
}

export function registerVersionRoutes(router: Router, deps: ChapterVersionDeps): void {
  const { novelManager } = deps;

  // 获取版本列表（不含 content，节省带宽）
  router.get('/:num/versions', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const chapterNumber = parseInt(req.params.num, 10);
      if (isNaN(chapterNumber) || chapterNumber < 1) {
        res.status(400).json({ error: '章节编号必须为正整数' });
        return;
      }
      const history = await novelManager.getChapterVersions(novelId, chapterNumber);
      const versions = history.versions.map(({ content: _c, ...rest }) => rest);
      res.json({ novelId, chapterNumber, versions });
    } catch (err) {
      const message = safeErrorMessage(err, '获取版本列表失败');
      res.status(500).json({ error: message });
    }
  });

  // 获取指定版本完整内容
  router.get('/:num/versions/:ver', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const chapterNumber = parseInt(req.params.num, 10);
      const ver = parseInt(req.params.ver, 10);
      if (isNaN(chapterNumber) || chapterNumber < 1 || isNaN(ver) || ver < 1) {
        res.status(400).json({ error: '参数必须为正整数' });
        return;
      }
      const history = await novelManager.getChapterVersions(novelId, chapterNumber);
      const version = history.versions.find(v => v.version === ver);
      if (!version) {
        res.status(404).json({ error: `版本 ${ver} 不存在` });
        return;
      }
      res.json(version);
    } catch (err) {
      const message = safeErrorMessage(err, '获取版本失败');
      res.status(500).json({ error: message });
    }
  });

  // 版本 diff
  router.get('/:num/versions/diff', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const chapterNumber = parseInt(req.params.num, 10);
      const v1 = parseInt(req.query.v1 as string, 10);
      const v2 = parseInt(req.query.v2 as string, 10);
      if (isNaN(chapterNumber) || isNaN(v1) || isNaN(v2)) {
        res.status(400).json({ error: '参数 v1、v2 必须为整数' });
        return;
      }
      const history = await novelManager.getChapterVersions(novelId, chapterNumber);
      const ver1 = history.versions.find(v => v.version === v1);
      const ver2 = history.versions.find(v => v.version === v2);
      if (!ver1 || !ver2) {
        res.status(404).json({ error: '指定版本不存在' });
        return;
      }
      const diff = computeLineDiff(ver1.content, ver2.content);
      res.json({ v1, v2, diff, summary: diffSummary(diff) });
    } catch (err) {
      const message = safeErrorMessage(err, '版本对比失败');
      res.status(500).json({ error: message });
    }
  });

  // 回滚到指定版本
  router.post('/:num/versions/rollback', async (req, res) => {
    try {
      const novelId = (req.params as Record<string, string>).novelId;
      const chapterNumber = parseInt(req.params.num, 10);
      const { version } = req.body as { version?: number };
      if (isNaN(chapterNumber) || chapterNumber < 1 || !version) {
        res.status(400).json({ error: '参数错误' });
        return;
      }
      const chapter = await novelManager.rollbackChapterToVersion(novelId, chapterNumber, version);
      await novelManager.syncNovelMetadataDebounced(novelId);
      res.json(chapter);
    } catch (err) {
      const message = safeErrorMessage(err, '回滚失败');
      if (message.includes('不存在')) {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  });
}
