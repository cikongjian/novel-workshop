/**
 * 角色朋友圈路由 — 仅做编排，生成逻辑在 moments-generator，存储在 moments-service。
 */
import { Router, Request, Response } from 'express';
import type { NovelManager } from '../../novel/novel-manager.js';
import type { MomentsService } from '../../character-moments/moments-service.js';
import type { MomentsGenerator } from '../../character-moments/moments-generator.js';
import type { NovelAgent } from '../../agents/types.js';
import type { ModelClient } from '../../models/types.js';
import type { AuthDb } from '../../auth/types.js';
import type { CharacterCardService } from '../../services/character-card-service.js';
import { getProfile } from '../../auth/user-service.js';
import type { BillingService } from '../../billing/billing-service.js';
import { beginAIBilling, settleAIBilling } from './handlers/billing-guard.js';
import { resolveUserModelAccess } from './helpers/user-api-model-resolver.js';

function getUserId(req: Request): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((req as any).auth as { id?: string } | undefined)?.id;
}

export function createCharacterMomentsRouter(
  momentsService: MomentsService,
  momentsGenerator: MomentsGenerator,
  novelManager: NovelManager,
  agents?: Map<string, NovelAgent>,
  modelClient?: ModelClient,
  authDb?: AuthDb,
  characterCardService?: CharacterCardService,
  billingService?: BillingService,
): Router {
  const router = Router();

  /** GET / — 获取某书朋友圈流（分页） */
  router.get('/', (req: Request, res: Response) => {
    try {
      const { novelId } = req.query;
      if (!novelId || typeof novelId !== 'string') {
        res.status(400).json({ error: '缺少 novelId' });
        return;
      }
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const before = req.query.before ? Number(req.query.before) : undefined;
      const userId = getUserId(req);
      // 获取用户收藏的角色 ID 列表，用于解锁私密动态
      const collectedIds = userId && characterCardService
        ? characterCardService.getCollectedCharacterIds(userId, novelId)
        : undefined;
      const moments = momentsService.listByNovel(novelId, limit, before, collectedIds);
      const hotMoment = momentsService.getHotMoment(novelId);
      res.json({ moments, hasMore: moments.length === limit, hotMoment: hotMoment || null });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '查询失败' });
    }
  });

  /** POST /generate — 作者手动触发生成动态 + 可选互评 */
  router.post('/generate', async (req: Request, res: Response) => {
    let freezeId: string | undefined;
    let frozenPoints = 0;
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { novelId, characterId, type, relatedChapterNum, withComments } = req.body ?? {};
      if (!novelId || !characterId || !type) {
        res.status(400).json({ error: '缺少必要参数' });
        return;
      }
      const novel = await novelManager.getNovel(novelId);
      if (!novel) {
        res.status(404).json({ error: '作品未找到' });
        return;
      }
      if (novel.ownerId !== userId && req.auth?.role !== 'admin') {
        res.status(403).json({ error: '无权操作' });
        return;
      }

      if (billingService && userId !== 'dev') {
        const modelAccess = await resolveUserModelAccess({
          authDb,
          userId,
          headers: req.headers,
        });
        if (!modelAccess.billingBypass) {
          try {
            const guard = await beginAIBilling({
              billingService,
              userId,
              operation: 'characterMoment',
              bizId: `moment:${novelId}:${characterId}`,
            });
            freezeId = guard.freezeId;
            frozenPoints = guard.estimatedPoints;
          } catch (billingErr) {
            const msg = billingErr instanceof Error ? billingErr.message : String(billingErr);
            res.status(402).json({ error: msg, code: 'INSUFFICIENT_BALANCE' });
            return;
          }
        }
      }

      const momentResult = await momentsGenerator.generateMoment({
        novelId,
        characterId,
        type,
        relatedChapterNum,
        agents,
        modelClient,
      });
      if ('error' in momentResult) {
        if (freezeId && billingService && userId) {
          settleAIBilling(billingService, userId, freezeId, 0).catch(() => {});
        }
        res.status(400).json({ error: momentResult.error });
        return;
      }
      let commentsGenerated = 0;
      if (withComments) {
        const commentsResult = await momentsGenerator.generateCommentsForMoment({
          momentId: momentResult.momentId,
          agents,
          modelClient,
        });
        commentsGenerated = commentsResult.generated;
      }
      const moment = momentsService.getById(momentResult.momentId);
      if (freezeId && billingService) {
        await settleAIBilling(billingService, userId!, freezeId, frozenPoints);
      }
      res.json({ moment, commentsGenerated });
    } catch (err: any) {
      if (freezeId && billingService && req.auth?.id) {
        settleAIBilling(billingService, req.auth.id, freezeId, 0).catch(() => {});
      }
      res.status(500).json({ error: err?.message || '生成失败' });
    }
  });

  /** GET /diagnostics?novelId=xxx — 检查朋友圈生成是否就绪 */
  router.get('/diagnostics', async (req: Request, res: Response) => {
    try {
      const { novelId } = req.query;
      const result: Record<string, unknown> = {
        momentsGenerator: !!momentsGenerator,
        agentsReady: agents?.has('character-moments') ?? false,
        modelClient: !!modelClient,
        modelConfigured: !!modelClient,
      };

      if (novelId && typeof novelId === 'string') {
        const characters = await novelManager.getCharacters?.(novelId) ?? [];
        const active = (characters as any[]).filter(
          (c: any) => c.status !== 'dead' && c.status !== 'exited' && c.momentsEnabled !== false,
        );
        result.totalCharacters = characters.length;
        result.momentsCapableCharacters = active.length;
        result.momentsCapableNames = active.map((c: any) => c.name);
        const existingMoments = momentsService.listByNovel(novelId, 100);
        result.existingMomentsCount = existingMoments.length;
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '诊断失败' });
    }
  });

  /** GET /:momentId — 单条动态详情 */
  router.get('/:momentId', (req: Request, res: Response) => {
    try {
      const moment = momentsService.getById(String(req.params.momentId));
      if (!moment) {
        res.status(404).json({ error: '动态不存在' });
        return;
      }
      res.json({ moment });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '查询失败' });
    }
  });

  /** POST /:momentId/like — 点赞 toggle */
  router.post('/:momentId/like', (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const result = momentsService.toggleLike(String(req.params.momentId), userId);
      if (!result) {
        res.status(404).json({ error: '动态不存在' });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '操作失败' });
    }
  });

  /** POST /:momentId/flower — 送花 toggle */
  router.post('/:momentId/flower', (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const result = momentsService.toggleFlower(String(req.params.momentId), userId);
      if (!result) {
        res.status(404).json({ error: '动态不存在' });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '操作失败' });
    }
  });

  /** POST /:momentId/comments — 读者评论 */
  router.post('/:momentId/comments', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const { content } = req.body ?? {};
      const trimmed = String(content || '').trim();
      if (trimmed.length === 0 || trimmed.length > 200) {
        res.status(400).json({ error: '评论内容需在 1-200 字之间' });
        return;
      }
      // 禁言检查
      const momentId = String(req.params.momentId);
      const moment = momentsService.getById(momentId);
      if (!moment) {
        res.status(404).json({ error: '动态不存在' });
        return;
      }
      if (momentsService.isMuted(moment.novelId, userId)) {
        res.status(403).json({ error: '你已被作者禁言' });
        return;
      }

      // 频率限制：同一读者两次评论间隔至少 3 秒
      const lastTime = momentsService.getLastCommentTime(userId);
      if (lastTime && Date.now() - lastTime < 3000) {
        res.status(429).json({ error: '发言太快，请稍后再试' });
        return;
      }

      // 重复内容检测：不允许连续发送相同内容
      if (momentsService.isLastCommentDuplicate(userId, trimmed)) {
        res.status(400).json({ error: '请勿重复发送相同内容' });
        return;
      }

      // 同角色限制：每个读者对同一个角色的帖子最多评论 2 次
      if (momentsService.countReaderCommentsOnCharacter(moment.novelId, userId, moment.characterId) >= 2) {
        res.status(400).json({ error: '该角色的帖子中你已达评论上限（2条），去其他角色那聊聊吧' });
        return;
      }

      // 敏感词检查
      const badWord = momentsService.hasBadWords(trimmed);
      if (badWord) {
        res.status(400).json({ error: '评论包含不当内容，请修改后重试' });
        return;
      }

      let readerName = '读者';
      try {
        if (authDb) {
          const profile = await getProfile(authDb, userId);
          readerName = profile?.penName || profile?.username || '读者';
        }
      } catch { /* 忽略 */ }

      // 角色名冒充检查
      const characters = await novelManager.getCharacters?.(moment.novelId) ?? [];
      const charNames = (characters as any[]).map((c: any) => c.name);
      if (momentsService.isReaderNameImpersonating(readerName, charNames)) {
        res.status(400).json({ error: '昵称与角色名冲突，请修改昵称后评论' });
        return;
      }

      const comment = momentsService.addComment(momentId, {
        authorType: 'reader',
        authorId: userId,
        authorName: readerName,
        content: trimmed,
      });
      if (!comment) {
        res.status(404).json({ error: '动态不存在或评论已满' });
        return;
      }
      res.json({ comment });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '评论失败' });
    }
  });

  /** POST /mute — 作者禁言读者 */
  router.post('/mute', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: '请先登录' }); return; }
      const { novelId, targetUserId } = req.body ?? {};
      if (!novelId || !targetUserId) { res.status(400).json({ error: '缺少参数' }); return; }
      const novel = await novelManager.getNovel(novelId);
      if (!novel) { res.status(404).json({ error: '作品未找到' }); return; }
      if (novel.ownerId !== userId && req.auth?.role !== 'admin') {
        res.status(403).json({ error: '仅作者可操作' }); return;
      }
      momentsService.muteReader(novelId, targetUserId);
      res.json({ muted: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '操作失败' });
    }
  });

  /** DELETE /mute/:targetUserId?novelId=xxx — 解除禁言 */
  router.delete('/mute/:targetUserId', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: '请先登录' }); return; }
      const { novelId } = req.query;
      if (!novelId || typeof novelId !== 'string') { res.status(400).json({ error: '缺少 novelId' }); return; }
      const novel = await novelManager.getNovel(novelId);
      if (!novel) { res.status(404).json({ error: '作品未找到' }); return; }
      if (novel.ownerId !== userId && req.auth?.role !== 'admin') {
        res.status(403).json({ error: '仅作者可操作' }); return;
      }
      momentsService.unmuteReader(novelId, String(req.params.targetUserId));
      res.json({ unmuted: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '操作失败' });
    }
  });

  /** GET /muted?novelId=xxx — 获取禁言列表 */
  router.get('/muted', (req: Request, res: Response) => {
    try {
      const { novelId } = req.query;
      if (!novelId || typeof novelId !== 'string') { res.status(400).json({ error: '缺少 novelId' }); return; }
      res.json({ mutedUserIds: momentsService.getMutedReaders(novelId) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '查询失败' });
    }
  });

  /** POST /:momentId/comments/:commentId/report — 举报评论 */
  router.post('/:momentId/comments/:commentId/report', (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: '请先登录' }); return; }
      const { reason } = req.body ?? {};
      const ok = momentsService.reportComment({
        novelId: String((req.params as any).novelId || ''),
        momentId: String(req.params.momentId),
        commentId: String(req.params.commentId),
        reporterId: userId,
        reason: String(reason || '').slice(0, 200),
      });
      if (!ok) { res.status(400).json({ error: '已经举报过该评论' }); return; }
      res.json({ reported: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '举报失败' });
    }
  });

  /** DELETE /:momentId/comments/:commentId — 作者删除评论 */
  router.delete('/:momentId/comments/:commentId', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) { res.status(401).json({ error: '请先登录' }); return; }
      const momentId = String(req.params.momentId);
      const moment = momentsService.getById(momentId);
      if (!moment) { res.status(404).json({ error: '动态不存在' }); return; }
      const novel = await novelManager.getNovel(moment.novelId);
      if (!novel) { res.status(404).json({ error: '作品未找到' }); return; }
      if (novel.ownerId !== userId && req.auth?.role !== 'admin') {
        res.status(403).json({ error: '仅作者可删除评论' }); return;
      }
      const ok = momentsService.deleteComment(momentId, String(req.params.commentId));
      if (!ok) { res.status(404).json({ error: '评论不存在' }); return; }
      res.json({ deleted: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '删除失败' });
    }
  });

  /** POST /:momentId/mention/:characterId — @某角色回应 */
  router.post('/:momentId/mention/:characterId', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: '请先登录' });
        return;
      }
      const result = await momentsGenerator.generateMentionReply({
        momentId: String(req.params.momentId),
        commenterId: String(req.params.characterId),
        agents,
        modelClient,
      });
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ comment: result.comment });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || '召唤失败' });
    }
  });

  return router;
}
