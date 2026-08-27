/**
 * 分叉（抱走）路由 — 读者从某章节抱走作品创建分支，作者管理配置与记录。
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ForkService } from '../../services/fork-service.js';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { BookStoreManager } from '../../bookstore/bookstore-manager.js';
import type { NotificationService } from '../../services/notification-service.js';
import type { AuthDb } from '../../auth/types.js';
import type { ForkPermission } from '../../novel/fork-types.js';
import type { ForkPublishStatus } from '../../novel/fork-types.js';
import { resolveRequestUserDisplayName } from './handlers/forks/user-display-name.js';
import { getProfile } from '../../auth/user-service.js';

function getUserId(req: Request): string | null {
  return req.auth?.id ?? null;
}

/** 批量解析用户笔名（优先笔名，其次用户名），取不到时回退 fallback */
async function resolveUserDisplayNames(
  userIds: string[],
  authDb: AuthDb | undefined,
  fallbackMap: Map<string, string>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!authDb) {
    for (const id of userIds) {
      result.set(id, fallbackMap.get(id) ?? '读者');
    }
    return result;
  }
  await Promise.all(
    userIds.map(async (id) => {
      try {
        const profile = await getProfile(authDb, id);
        const name = profile?.penName?.trim() || profile?.username?.trim();
        result.set(id, name || fallbackMap.get(id) || '读者');
      } catch {
        result.set(id, fallbackMap.get(id) ?? '读者');
      }
    }),
  );
  return result;
}

export function createForkRouter(
  forkService: ForkService,
  novelManager: NovelManager,
  bookStoreManager?: BookStoreManager,
  notificationService?: NotificationService,
  authDb?: AuthDb,
): Router {
  const router = Router();

  // ── 预检：是否允许抱走 ──
  router.get('/check/:novelId/:chapter', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { novelId, chapter } = req.params;
      const chapterNum = Number(chapter);
      if (!Number.isFinite(chapterNum) || chapterNum < 1) {
        res.status(400).json({ error: '章节号无效' });
        return;
      }
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const isFollower = userId
        ? await bookStoreManager?.hasFavorited?.(novelId, userId).catch(() => false) ?? false
        : false;
      const config = forkService.getConfig(novelId);
      const check = forkService.canFork(novelId, userId ?? '', !!isFollower, chapterNum);
      const alreadyForked = userId
        ? forkService.hasForked(novelId, userId, chapterNum)
        : false;
      // 当前章节是否在作者开放的章节范围内
      const chapterAllowed =
        config.chapterMode === 'all' || config.allowedChapters.includes(chapterNum);
      res.json({
        allowed: check.allowed,
        reason: check.reason,
        alreadyForked,
        chapterAllowed,
        config: {
          allowFork: config.allowFork,
          permission: config.permission,
          chapterMode: config.chapterMode,
          allowedChapters: config.allowedChapters,
          authorNote: config.authorNote,
        },
      });
    } catch (err) {
      console.error('[forks] check error:', err);
      res.status(500).json({ error: '预检失败' });
    }
  });

  // ── 执行抱走 ──
  router.post('/', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId, fromChapter, newTitle, isPublic } = req.body as {
        novelId: string;
        fromChapter: number;
        newTitle?: string;
        isPublic?: boolean;
      };
      if (!novelId || !Number.isFinite(fromChapter) || fromChapter < 1) {
        res.status(400).json({ error: '参数无效' });
        return;
      }

      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }

      // 权限校验
      const isFollower = await bookStoreManager?.hasFavorited?.(novelId, userId).catch(() => false) ?? false;
      const check = forkService.canFork(novelId, userId, !!isFollower, fromChapter);
      if (!check.allowed) {
        res.status(403).json({ error: check.reason });
        return;
      }

      // 重复抱走校验
      if (forkService.hasForked(novelId, userId, fromChapter)) {
        res.status(409).json({ error: '你已经从这一章抱走过啦，去「我的 → 抱走记录」看看吧' });
        return;
      }

      // 执行分叉
      const forked = await novelManager.forkNovel(novelId, fromChapter, newTitle, userId);
      const actorName = await resolveRequestUserDisplayName(req, authDb);

      // 写入分叉记录
      const record = forkService.create({
        originalNovelId: novelId,
        originalTitle: novel.title,
        forkedNovelId: forked.id,
        fromChapter,
        forkedBy: userId,
        forkedByName: actorName,
        isPublic: isPublic ?? true,
      });

      // 通知原作者（fire-and-forget）
      if (notificationService && novel.ownerId && novel.ownerId !== userId) {
        try {
          notificationService.addInAppNotification(novel.ownerId, {
            userId: novel.ownerId,
            type: 'system',
            title: '有读者抱走了你的作品',
            body: `${actorName} 从《${novel.title}》第 ${fromChapter} 章抱走创建了新作品`,
            data: {
              novelId,
              novelTitle: novel.title,
              route: `/m/novel/${novelId}`,
            },
          });
          void notificationService.sendPushToUser(novel.ownerId, {
            title: '有读者抱走了你的作品',
            body: `${actorName} 从《${novel.title}》第 ${fromChapter} 章抱走创建了新作品`,
            tag: `fork-${novelId}`,
            data: { route: `/m/novel/${novelId}` },
          });
        } catch (e) {
          console.error('[forks] notify author failed:', e);
        }
      }

      res.status(201).json({ novel: forked, record });
    } catch (err) {
      console.error('[forks] create error:', err);
      const message = err instanceof Error ? err.message : '抱走失败';
      res.status(500).json({ error: message });
    }
  });

  // ── 查询某作品的抱走记录（公开列表） ──
  router.get('/by-novel/:novelId', async (req, res) => {
    try {
      const userId = getUserId(req);
      const { novelId } = req.params;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const isOwner = novel.ownerId === userId || (req.auth as any)?.role === 'admin';
      // 作者可看全部（含私有），读者只看公开
      const records = forkService.listByNovel(novelId, isOwner);
      // 实时解析笔名（优先笔名，其次用户名）
      const uniqueUserIds = [...new Set(records.map((r) => r.forkedBy))];
      const fallbackMap = new Map(records.map((r) => [r.forkedBy, r.forkedByName]));
      const nameMap = await resolveUserDisplayNames(uniqueUserIds, authDb, fallbackMap);
      const recordsWithNames = records.map((r) => ({
        ...r,
        forkedByName: nameMap.get(r.forkedBy) ?? r.forkedByName,
      }));
      res.json({ records: recordsWithNames, total: recordsWithNames.length });
    } catch (err) {
      console.error('[forks] list by-novel error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // ── 获取作品分叉统计 ──
  router.get('/stats/:novelId', async (req, res) => {
    try {
      const { novelId } = req.params;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      const stats = forkService.getStats(novelId);
      res.json(stats);
    } catch (err) {
      console.error('[forks] stats error:', err);
      res.status(500).json({ error: '获取统计失败' });
    }
  });

  // ── 删除单条分叉记录 ──
  router.delete('/records/:recordId', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { recordId } = req.params;
      const success = forkService.deleteRecord(recordId);
      if (!success) {
        res.status(404).json({ error: '记录不存在' });
        return;
      }
      res.json({ deleted: true });
    } catch (err) {
      console.error('[forks] delete record error:', err);
      res.status(500).json({ error: '删除失败' });
    }
  });

  // ── 清空某作品的全部分叉记录（仅作者） ──
  router.delete('/by-novel/:novelId', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId } = req.params;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      if (novel.ownerId !== userId && (req.auth as any)?.role !== 'admin') {
        res.status(403).json({ error: '仅作者可清空抱走记录' });
        return;
      }
      const removed = forkService.clearByNovel(novelId);
      res.json({ removed });
    } catch (err) {
      console.error('[forks] clear by-novel error:', err);
      res.status(500).json({ error: '清空失败' });
    }
  });

  // ── 查询当前用户的抱走记录 ──
  router.get('/my', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const records = forkService.listByUser(userId);
      res.json({ records, total: records.length });
    } catch (err) {
      console.error('[forks] my error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // ── 获取作品分叉配置 ──
  router.get('/config/:novelId', async (req, res) => {
    try {
      const { novelId } = req.params;
      const config = forkService.getConfig(novelId);
      res.json(config);
    } catch (err) {
      console.error('[forks] get config error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // ── 更新作品分叉配置（仅作者） ──
  router.put('/config/:novelId', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId } = req.params;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '小说不存在' });
        return;
      }
      if (novel.ownerId !== userId && (req.auth as any)?.role !== 'admin') {
        res.status(403).json({ error: '无权修改' });
        return;
      }
      const { allowFork, permission, chapterMode, allowedChapters, authorNote } = req.body as {
        allowFork?: boolean;
        permission?: ForkPermission;
        chapterMode?: 'all' | 'selected';
        allowedChapters?: number[];
        authorNote?: string;
      };
      const updated = forkService.updateConfig(novelId, {
        allowFork,
        permission,
        chapterMode,
        allowedChapters,
        authorNote,
      });
      res.json(updated);
    } catch (err) {
      console.error('[forks] update config error:', err);
      res.status(500).json({ error: '更新失败' });
    }
  });

  // ── 切换分叉公开/私有（仅分叉者本人） ──
  router.patch('/:recordId/visibility', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { recordId } = req.params;
      const { isPublic } = req.body as { isPublic: boolean };
      const records = forkService.listByUser(userId);
      const record = records.find((r) => r.id === recordId);
      if (!record) {
        res.status(404).json({ error: '记录不存在或无权操作' });
        return;
      }
      const updated = forkService.setVisibility(recordId, isPublic);
      res.json(updated);
    } catch (err) {
      console.error('[forks] visibility error:', err);
      res.status(500).json({ error: '更新失败' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  //  分叉发布审批
  // ─────────────────────────────────────────────────────────────

  // 预检：当前分叉作品是否可发布（标题/封面/审批三项校验）
  router.get('/publish-check/:novelId', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId } = req.params;
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '作品不存在' });
        return;
      }
      if (novel.ownerId !== userId) {
        res.status(403).json({ error: '无权操作他人作品' });
        return;
      }
      const forkedFrom = (novel as any).forkedFrom;
      if (!forkedFrom) {
        // 非分叉作品，无需审批
        res.json({ isFork: false, canPublish: true, checks: {} });
        return;
      }
      const original = await novelManager.getNovel(forkedFrom.originalNovelId);
      const originalTitle = original?.title ?? forkedFrom.originalTitle;
      const originalCover = original?.coverImage ?? '';
      const forkedTitle = novel.title;
      const forkedCover = novel.coverImage ?? '';
      const request = forkService.getPublishRequestByForked(novelId);
      const checks = {
        titleChanged: forkedTitle.trim() !== originalTitle.trim(),
        coverChanged: !originalCover || forkedCover !== originalCover,
        hasCover: !!forkedCover,
        approvalStatus: request?.status ?? 'none',
      };
      const canPublish =
        checks.titleChanged && checks.coverChanged && checks.hasCover && checks.approvalStatus === 'approved';
      res.json({
        isFork: true,
        canPublish,
        checks,
        originalTitle,
        originalCover,
        currentRequest: request,
      });
    } catch (err) {
      console.error('[forks] publish-check error:', err);
      res.status(500).json({ error: '预检失败' });
    }
  });

  // 提交发布审批申请
  router.post('/publish-request', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { forkedNovelId, message } = req.body as { forkedNovelId: string; message?: string };
      if (!forkedNovelId) {
        res.status(400).json({ error: '缺少作品 ID' });
        return;
      }
      const novel = await novelManager.getNovel(forkedNovelId);
      if (!novel) {
        res.status(404).json({ error: '作品不存在' });
        return;
      }
      if (novel.ownerId !== userId) {
        res.status(403).json({ error: '无权为他人作品申请发布' });
        return;
      }
      const forkedFrom = (novel as any).forkedFrom;
      if (!forkedFrom) {
        res.status(400).json({ error: '该作品不是分叉作品，无需审批' });
        return;
      }
      // 校验三项硬性条件
      const original = await novelManager.getNovel(forkedFrom.originalNovelId);
      if (!original) {
        res.status(400).json({ error: '源作品已不存在，无法审批' });
        return;
      }
      if (novel.title.trim() === original.title.trim()) {
        res.status(400).json({ error: '作品标题与原作相同，请先修改标题' });
        return;
      }
      if (!novel.coverImage) {
        res.status(400).json({ error: '请先为作品设置封面' });
        return;
      }
      if (original.coverImage && novel.coverImage === original.coverImage) {
        res.status(400).json({ error: '封面与原作相同，请先更换封面' });
        return;
      }
      const actorName = await resolveRequestUserDisplayName(req, authDb);
      const request = forkService.createPublishRequest({
        forkedNovelId,
        forkedTitle: novel.title,
        originalNovelId: original.id,
        originalTitle: original.title,
        originalCover: original.coverImage ?? '',
        forkedCover: novel.coverImage,
        requesterId: userId,
        requesterName: actorName,
        message,
      });
      // 通知原作者
      if (notificationService && original.ownerId && original.ownerId !== userId) {
        try {
          notificationService.addInAppNotification(original.ownerId, {
            userId: original.ownerId,
            type: 'system',
            title: '有分叉作品申请发布到书城',
            body: `${actorName} 的《${novel.title}》（分叉自《${original.title}》）申请发布到书城，请审批`,
            data: {
              novelId: original.id,
              route: `/m/novel/${original.id}?forkPublishRequest=${request.id}`,
            },
          });
          void notificationService.sendPushToUser(original.ownerId, {
            title: '有分叉作品申请发布',
            body: `${actorName} 的《${novel.title}》申请发布，请审批`,
            tag: `fork-publish-${request.id}`,
            data: { route: `/m/novel/${original.id}` },
          });
        } catch (e) {
          console.error('[forks] notify original author failed:', e);
        }
      }
      res.status(201).json(request);
    } catch (err) {
      console.error('[forks] publish-request create error:', err);
      const message = err instanceof Error ? err.message : '提交申请失败';
      res.status(400).json({ error: message });
    }
  });

  // 查询某作品的发布申请（分叉者本人或原作者）
  router.get('/publish-request/:novelId', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId } = req.params;
      const request = forkService.getPublishRequestByForked(novelId);
      if (!request) {
        res.json({ request: null });
        return;
      }
      // 权限：仅申请人或源作者可查
      const novel = await novelManager.getNovel(novelId);
      const isRequester = request.requesterId === userId;
      const isOriginalOwner = novel && (novel as any).forkedFrom?.originalNovelId
        ? (await novelManager.getNovel((novel as any).forkedFrom.originalNovelId))?.ownerId === userId
        : false;
      if (!isRequester && !isOriginalOwner) {
        res.status(403).json({ error: '无权查看此申请' });
        return;
      }
      res.json({ request });
    } catch (err) {
      console.error('[forks] publish-request get error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // 原作者收到的发布申请列表
  router.get('/publish-requests/received', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const status = req.query.status as ForkPublishStatus | undefined;
      const all = forkService.listAllPublishRequests(status);
      // 过滤出源作品属于当前用户的申请
      const result = [];
      for (const r of all) {
        const orig = await novelManager.getNovel(r.originalNovelId);
        if (orig?.ownerId === userId) {
          result.push(r);
        }
      }
      // 实时解析笔名（优先笔名，其次用户名）
      const uniqueUserIds = [...new Set(result.map((r) => r.requesterId))];
      const fallbackMap = new Map(result.map((r) => [r.requesterId, r.requesterName]));
      const nameMap = await resolveUserDisplayNames(uniqueUserIds, authDb, fallbackMap);
      const resultWithNames = result.map((r) => ({
        ...r,
        requesterName: nameMap.get(r.requesterId) ?? r.requesterName,
      }));
      res.json({ requests: resultWithNames });
    } catch (err) {
      console.error('[forks] publish-requests received error:', err);
      res.status(500).json({ error: '查询失败' });
    }
  });

  // 审批发布申请
  router.post('/publish-request/:id/review', async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { id } = req.params;
      const { decision, comment } = req.body as { decision: 'approved' | 'rejected'; comment?: string };
      if (decision !== 'approved' && decision !== 'rejected') {
        res.status(400).json({ error: 'decision 必须是 approved 或 rejected' });
        return;
      }
      const request = forkService.getPublishRequestById(id);
      if (!request) {
        res.status(404).json({ error: '申请不存在' });
        return;
      }
      const original = await novelManager.getNovel(request.originalNovelId);
      if (!original || original.ownerId !== userId) {
        res.status(403).json({ error: '仅源作品作者可审批' });
        return;
      }
      const updated = forkService.reviewPublishRequest(id, userId, decision, comment);
      // 通知申请人
      if (notificationService && request.requesterId) {
        try {
          const titleText =
            decision === 'approved'
              ? `你的分叉作品《${request.forkedTitle}》已通过审批`
              : `你的分叉作品《${request.forkedTitle}》未通过审批`;
          const bodyText =
            decision === 'approved'
              ? `原作者已同意你发布到书城，快去发布吧`
              : `原作者未同意发布${comment ? `：${comment}` : ''}`;
          notificationService.addInAppNotification(request.requesterId, {
            userId: request.requesterId,
            type: 'system',
            title: titleText,
            body: bodyText,
            data: {
              novelId: request.forkedNovelId,
              route: `/m/novel/${request.forkedNovelId}`,
            },
          });
          void notificationService.sendPushToUser(request.requesterId, {
            title: titleText,
            body: bodyText,
            tag: `fork-publish-review-${id}`,
            data: { route: `/m/novel/${request.forkedNovelId}` },
          });
        } catch (e) {
          console.error('[forks] notify requester failed:', e);
        }
      }
      res.json(updated);
    } catch (err) {
      console.error('[forks] publish-request review error:', err);
      res.status(500).json({ error: '审批失败' });
    }
  });

  return router;
}
